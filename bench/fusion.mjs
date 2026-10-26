import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import os from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const cases = [
  { name: "map/cheap/full", depth: 16, cost: 0, mixed: false, prefix: false },
  { name: "map/costly/full", depth: 16, cost: 32, mixed: false, prefix: false },
  { name: "mixed/cheap/full", depth: 16, cost: 0, mixed: true, prefix: false },
  { name: "mixed/costly/full", depth: 16, cost: 32, mixed: true, prefix: false },
  { name: "mixed/cheap/prefix", depth: 16, cost: 0, mixed: true, prefix: true },
  { name: "mixed/costly/prefix", depth: 16, cost: 32, mixed: true, prefix: true },
  { name: "small/depth-0", depth: 0, cost: 0, mixed: false, prefix: false, rows: 1, iterations: 2000 },
  { name: "small/depth-1", depth: 1, cost: 0, mixed: false, prefix: false, rows: 1, iterations: 2000 },
];
const options = { rows: 2000, iterations: 20, rounds: 5, warmups: 3 };
const runFile = promisify(execFile);
const median = samples => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];

async function measure(modulePath, name) {
  assert.equal(typeof global.gc, "function", "Run with --expose-gc");
  const spec = cases.find(item => item.name === name);
  assert.ok(spec, "Unknown benchmark case");
  const config = { ...options, ...spec };
  const { LAZY, MAP, WHERE, LIMIT, VALUES, createQueryable } = await import(modulePath);
  const input = Object.fromEntries(Array.from({ length: config.rows }, (_, index) => [`row${index}`, index]));
  const query = createQueryable(input);
  const project = config.cost === 0 ? value => value : value => {
    let hash = value >>> 0;
    for (let index = 0; index < config.cost; index++) {
      hash = Math.imul(hash ^ (hash >>> 13), 1597334677) >>> 0;
    }
    return hash;
  };
  const keep = (_value, key) => key !== "row0";
  let mapper = project;
  let predicate = keep;
  const execute = () => {
    let chain = query[LAZY]();
    for (let stage = 0; stage < config.depth; stage++) {
      chain = config.mixed && stage % 2 === 1 ? chain[WHERE](predicate) : chain[MAP](mapper);
    }
    return (config.prefix ? chain[LIMIT](5) : chain)[VALUES]();
  };

  // The native per-entry oracle checks both outputs and the exact lazy callback budget.
  const expected = [];
  const expectedCalls = { map: 0, where: 0 };
  for (const [key, original] of Object.entries(input)) {
    let value = original;
    let accepted = true;
    for (let stage = 0; stage < config.depth; stage++) {
      if (config.mixed && stage % 2 === 1) {
        expectedCalls.where++;
        if (!keep(value, key)) { accepted = false; break; }
      } else {
        expectedCalls.map++;
        value = project(value);
      }
    }
    if (accepted) { expected.push(value); }
    if (config.prefix && expected.length === 5) { break; }
  }
  const callbackCalls = { map: 0, where: 0 };
  mapper = value => { callbackCalls.map++; return project(value); };
  predicate = (value, key) => { callbackCalls.where++; return keep(value, key); };
  assert.deepEqual(execute(), expected);
  assert.deepEqual(callbackCalls, expectedCalls);
  mapper = project;
  predicate = keep;
  assert.deepEqual(execute(), expected);

  const retained = new Array(config.iterations);
  const batch = () => {
    for (let index = 0; index < config.iterations; index++) { retained[index] = execute(); }
  };
  const checksumOf = values => values.reduce((total, value) => (total + value) >>> 0, 0);
  const expectedChecksum = checksumOf(expected);
  let checksum = 0;
  const checkBatch = () => {
    const last = retained.at(-1);
    assert.equal(last.length, expected.length);
    const observed = checksumOf(last);
    assert.equal(observed, expectedChecksum);
    checksum += observed;
    retained.fill(undefined);
  };
  for (let round = 0; round < config.warmups; round++) {
    batch();
    retained.fill(undefined);
  }
  const timingSamplesMs = [];
  for (let round = 0; round < config.rounds; round++) {
    global.gc();
    const start = performance.now();
    batch();
    timingSamplesMs.push(performance.now() - start);
    checkBatch();
  }
  const retainedHeapSamplesBytes = [];
  for (let round = 0; round < config.rounds; round++) {
    global.gc();
    const before = process.memoryUsage().heapUsed;
    batch();
    global.gc();
    retainedHeapSamplesBytes.push(process.memoryUsage().heapUsed - before);
    checkBatch();
  }
  assert.equal(checksum, expectedChecksum * config.rounds * 2);
  return {
    case: name, validated: true, config, callbackCalls, outputLength: expected.length, checksum,
    timingSamplesMs, medianBatchMs: median(timingSamplesMs),
    retainedHeapSamplesBytes, medianRetainedHeapBytes: median(retainedHeapSamplesBytes),
  };
}

if (process.argv[2] === "--child") {
  process.stdout.write(`${JSON.stringify(await measure(process.argv[3], process.argv[4]))}\n`);
} else {
  assert.ok(process.argv[2], "Usage: node --expose-gc bench/fusion.mjs /absolute/baseline/index.js");
  const modules = {
    before: pathToFileURL(resolve(process.argv[2])).href,
    after: new URL("../dist/index.js", import.meta.url).href,
  };
  const results = [];
  // Fresh sequential children, then reversed implementation order in a second independent pair.
  for (const [pair, order] of [["before", "after"], ["after", "before"]].entries()) {
    for (const spec of cases) {
      for (const implementation of order) {
        const { stdout } = await runFile(process.execPath, [
          "--expose-gc", fileURLToPath(import.meta.url), "--child", modules[implementation], spec.name,
        ], { timeout: 20000, maxBuffer: 1024 * 1024 });
        results.push({ pair: pair + 1, implementation, ...JSON.parse(stdout) });
      }
    }
  }
  process.stdout.write(`${JSON.stringify({
    measuredAt: new Date().toISOString(),
    runtime: { node: process.version, v8: process.versions.v8 },
    machine: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model },
    modules, options,
    semantics: "Lazy conversion, stage creation and traversal included; source construction excluded. Mixed chains alternate MAP/WHERE and reject row0. Costly MAP applies 32 integer hash rounds. Prefix collects five outputs.",
    methodology: "Two independent before/after pairs in reversed implementation order. Fresh sequential child per case and implementation. Explicit GC outside timers. Separate retained-result heap pass; not transient allocation or peak memory.",
    results,
  }, null, 2)}\n`);
}
