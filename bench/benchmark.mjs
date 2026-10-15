import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const runFile = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const { values: args } = parseArgs({
  options: {
    rows: { type: "string", default: "5000" },
    instances: { type: "string", default: "5000" },
    "small-size": { type: "string", default: "4" },
    iterations: { type: "string", default: "10" },
    rounds: { type: "string", default: "5" },
    warmups: { type: "string", default: "2" },
    "early-limit": { type: "boolean", default: false },
    "child-case": { type: "string" },
    help: { type: "boolean", default: false },
  },
});

function integerOption(name, minimum, maximum) {
  const text = args[name];
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) ||
      number < minimum || number > maximum) {
    throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return number;
}

function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function makeRecord(size) {
  return Object.fromEntries(
    Array.from({ length: size }, (_, index) => [
      `row${index}`, { id: index, score: index % 10 },
    ]),
  );
}

async function measureCase(caseName, options) {
  const { createQueryable, WHERE, MAP, LIMIT, VALUES, LAZY } =
    await import("../dist/index.js");
  const R = await import("remeda");

  // Article implementation, with TypeScript annotations removed and shared symbols.
  function articleProxy(obj) {
    return new Proxy(obj, {
      get(target, prop, receiver) {
        if (prop === WHERE) {
          return (predicate) => {
            const filtered = Object.entries(target)
              .filter(([key, value]) => predicate(value, key))
              .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
              }, {});
            return articleProxy(filtered);
          };
        }
        if (prop === VALUES) {
          return () => Object.values(target);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  // Pre-optimization package implementation restricted to the exercised methods.
  const oldPrototype = {
    [WHERE](predicate) {
      const out = Object.create(oldPrototype);
      for (const [key, value] of Object.entries(this)) {
        if (predicate(value, key)) {
          out[key] = value;
        }
      }
      return out;
    },
    [VALUES]() {
      return Object.values(this);
    },
  };
  Object.setPrototypeOf(oldPrototype, null);
  Object.freeze(oldPrototype);
  function oldQueryable(obj) {
    const instance = Object.create(oldPrototype);
    for (const [key, value] of Object.entries(obj)) {
      instance[key] = value;
    }
    return instance;
  }

  const matches = (value) => value.score >= 5;
  const project = (value) => value.id * 2;
  let predicate = matches;
  let mapper = project;
  const constructors = {
    "article-proxy": articleProxy,
    "old-prototype-entries": oldQueryable,
    "new-eager": createQueryable,
  };
  const [track, implementation] = caseName.split("/");
  let runBatch;
  let units;
  let expectedLength;
  let validationCallbackCounts;
  let methodIdentity;
  if (track === "construction") {
    // All input records and their nested values exist before either measurement.
    const inputs = Array.from(
      { length: options.instances }, () => makeRecord(options.smallSize),
    );
    const construct = constructors[implementation];
    const probe = construct(inputs[0]);
    assert.deepEqual(probe[VALUES](), Object.values(inputs[0]));
    assert.deepEqual(probe[WHERE](predicate)[VALUES](),
      Object.values(inputs[0]).filter(predicate));
    const observed = Math.min(options.instances, 1000);
    const methods = new Set();
    for (let index = 0; index < observed; index++) {
      const instance = construct(inputs[index]);
      methods.add(instance[WHERE]);
      methods.add(instance[VALUES]);
    }
    methodIdentity = { instances: observed, observedMethodsPerInstance: 2, distinctFunctions: methods.size };
    assert.equal(methods.size, implementation === "article-proxy" ? observed * 2 : 2);
    units = options.instances;
    expectedLength = options.smallSize;
    runBatch = (retained) => {
      for (let index = 0; index < inputs.length; index++) {
        retained[index] = construct(inputs[index]);
      }
    };
  } else {
    const input = makeRecord(options.rows);
    const query = constructors[implementation]?.(input);
    const lazyQuery = implementation === "new-lazy" ? createQueryable(input) : undefined;
    let execute;
    if (track === "full-filter") {
      execute = implementation === "native-values-filter"
        ? () => Object.values(input).filter(predicate)
        : implementation === "remeda-values-filter"
          ? () => R.filter(Object.values(input), predicate)
          : () => query[WHERE](predicate)[VALUES]();
    } else {
      const nativeEarly = () => {
        const result = [];
        for (const key in input) {
          if (Object.hasOwn(input, key) && predicate(input[key])) {
            result.push(mapper(input[key]));
            if (result.length === 5) {
              break;
            }
          }
        }
        return result;
      };
      execute = implementation === "native-loop-early-stop"
        ? nativeEarly
        : implementation === "remeda-values-pipe"
          ? () => R.pipe(Object.values(input), R.filter(predicate),
            R.map(mapper), R.take(5))
          : implementation === "new-lazy"
            ? () => lazyQuery[LAZY]()[WHERE](predicate)[MAP](mapper)[LIMIT](5)[VALUES]()
            : () => query[WHERE](predicate)[MAP](mapper)[LIMIT](5)[VALUES]();
    }
    const expected = track === "full-filter"
      ? Object.values(input).filter(predicate)
      : Object.values(input).filter(predicate).map(mapper).slice(0, 5);
    validationCallbackCounts = { predicate: 0, mapper: 0 };
    predicate = (value) => { validationCallbackCounts.predicate++; return matches(value); };
    mapper = (value) => { validationCallbackCounts.mapper++; return project(value); };
    assert.deepEqual(execute(), expected);
    // Instrumentation belongs only to validation, not the timed implementation.
    predicate = matches;
    mapper = project;
    expectedLength = expected.length;
    units = options.iterations;
    runBatch = (retained) => {
      for (let index = 0; index < options.iterations; index++) {
        retained[index] = execute();
      }
    };
  }

  const retained = new Array(units);
  for (let round = 0; round < options.warmups; round++) {
    runBatch(retained);
    retained.fill(undefined);
  }
  const timingSamplesMs = [];
  const heapSamplesBytes = [];
  let checksum = 0;
  for (let round = 0; round < options.rounds; round++) {
    global.gc();
    const start = performance.now();
    runBatch(retained);
    timingSamplesMs.push(performance.now() - start);
    const last = retained.at(-1);
    checksum += track === "construction" ? Object.keys(last).length : last.length;
    retained.fill(undefined);
  }
  // Heap sampling is a second pass: explicit GC never belongs to the timed region.
  for (let round = 0; round < options.rounds; round++) {
    global.gc();
    const before = process.memoryUsage().heapUsed;
    runBatch(retained);
    global.gc();
    heapSamplesBytes.push(process.memoryUsage().heapUsed - before);
    const last = retained.at(-1);
    checksum += track === "construction" ? Object.keys(last).length : last.length;
    retained.fill(undefined);
  }
  assert.equal(checksum, expectedLength * options.rounds * 2);
  const medianBatchMs = median(timingSamplesMs);
  const medianRetainedHeapBytes = median(heapSamplesBytes);
  return {
    case: caseName,
    validated: true,
    unitsPerBatch: units,
    unit: track === "construction" ? "instance" : "query",
    timingSamplesMs,
    medianBatchMs,
    medianMicrosecondsPerUnit: medianBatchMs * 1000 / units,
    retainedHeapSamplesBytes: heapSamplesBytes,
    medianRetainedHeapBytes,
    medianRetainedHeapBytesPerUnit: medianRetainedHeapBytes / units,
    checksum,
    validationCallbackCounts,
    methodIdentity,
  };
}

async function main() {
  if (args.help) {
    process.stdout.write(
      "Usage: node --expose-gc packages/queryable/bench/benchmark.mjs " +
      "[--rows 5000] [--instances 5000] [--small-size 4] [--iterations 10] " +
      "[--rounds 5] [--warmups 2] [--early-limit]\n",
    );
    return;
  }
  const options = {
    rows: integerOption("rows", 1, 100000),
    instances: integerOption("instances", 1, 100000),
    smallSize: integerOption("small-size", 1, 32),
    iterations: integerOption("iterations", 1, 1000),
    rounds: integerOption("rounds", 3, 25),
    warmups: integerOption("warmups", 1, 10),
    earlyLimit: args["early-limit"],
  };
  const passes = options.rounds * 2 + options.warmups;
  if (options.rows * options.iterations * passes > 100000000 ||
      options.instances * options.smallSize * passes > 100000000 ||
      options.rows * options.iterations > 1000000) {
    throw new Error("Options exceed the bounded work/retention budget; reduce sizes or rounds");
  }
  if (typeof global.gc !== "function") {
    throw new Error("Run Node with --expose-gc");
  }
  const cases = [
    "construction/article-proxy",
    "construction/old-prototype-entries",
    "construction/new-eager",
    "full-filter/article-proxy",
    "full-filter/old-prototype-entries",
    "full-filter/new-eager",
    "full-filter/native-values-filter",
    "full-filter/remeda-values-filter",
    ...(options.earlyLimit ? [
      "early-limit/new-eager",
      "early-limit/new-lazy",
      "early-limit/native-loop-early-stop",
      "early-limit/remeda-values-pipe",
    ] : []),
  ];
  if (args["child-case"]) {
    assert.ok(cases.includes(args["child-case"]), "Unknown child case");
    process.stdout.write(`${JSON.stringify(await measureCase(args["child-case"], options))}\n`);
    return;
  }
  const remeda = JSON.parse(
    await readFile(new URL("../node_modules/remeda/package.json", import.meta.url), "utf8"),
  );
  const childArgs = process.argv.slice(2);
  const results = [];
  const start = performance.now();
  // Sequential children avoid cross-case heap state and simultaneous CPU contention.
  for (const caseName of cases) {
    const { stdout } = await runFile(process.execPath,
      ["--expose-gc", scriptPath, ...childArgs, "--child-case", caseName],
      { timeout: 20000, maxBuffer: 1024 * 1024 });
    results.push(JSON.parse(stdout));
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    runtime: { node: process.version, v8: process.versions.v8, remeda: remeda.version },
    machine: {
      platform: process.platform, release: os.release(), arch: process.arch,
      cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    options,
    elapsedMs: performance.now() - start,
    methodology: {
      isolation: "one fresh sequential Node --expose-gc child per case",
      timing: "warmups then repeated retained batches; median; GC outside timer",
      heap: "separate repeated batches; post-GC heapUsed delta with results retained",
      heapIsTotalAllocation: false,
      queryConstructionIncluded: false,
      constructionBaselines: "native JS and Remeda have no DSL wrapper; not applicable",
      proxyOwnership: "references pre-existing input; prototype constructors shallow-copy",
      methodClosures: "Proxy method accesses allocate closures; construction does not retain them",
    },
    results,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
