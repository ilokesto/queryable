import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const cases = [
  "eager-filter", "eager-full", "eager-prefix",
  "lazy-full", "lazy-prefix", "sequence-lazy-full",
];
const median = samples => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
const runFile = promisify(execFile);
const options = { sizes: [1000, 10000, 100000], warmups: 5, rounds: 7 };

async function measure(modulePath, name, rows) {
  assert.equal(typeof global.gc, "function", "Run with --expose-gc");
  const { createQueryable, WHERE, MAP, LIMIT, VALUES, LAZY, SORT } = await import(modulePath);
  const input = Object.fromEntries(Array.from({ length: rows }, (_, id) =>
    [`row${id}`, { id, score: id % 10 }]));
  const query = createQueryable(input);
  const sequence = name === "sequence-lazy-full" ? query[SORT](() => 0) : query;
  const matches = value => value.score >= 5;
  const project = value => value.id * 2;
  let predicate = matches;
  let mapper = project;
  const prefix = name.endsWith("prefix");
  const execute = () => {
    const source = name.includes("lazy") ? sequence[LAZY]() : sequence;
    const filtered = source[WHERE](predicate);
    if (name === "eager-filter") { return filtered[VALUES](); }
    const mapped = filtered[MAP](mapper);
    return (prefix ? mapped[LIMIT](5) : mapped)[VALUES]();
  };
  const expectedFiltered = Object.values(input).filter(matches);
  const expected = name === "eager-filter" ? expectedFiltered
    : expectedFiltered.map(project).slice(0, prefix ? 5 : undefined);
  const callbackCounts = { predicate: 0, mapper: 0 };
  predicate = value => { callbackCounts.predicate++; return matches(value); };
  mapper = value => { callbackCounts.mapper++; return project(value); };
  assert.deepEqual(execute(), expected);
  assert.deepEqual(callbackCounts, {
    predicate: prefix && name.includes("lazy") ? 10 : rows,
    mapper: name === "eager-filter" ? 0 : prefix && name.includes("lazy") ? 5 : rows / 2,
  });
  predicate = matches;
  mapper = project;
  const iterations = rows === 100000 ? 5 : 20;
  const retained = new Array(iterations);
  const batch = () => {
    for (let index = 0; index < iterations; index++) { retained[index] = execute(); }
  };
  for (let round = 0; round < options.warmups; round++) {
    batch();
    retained.fill(undefined);
  }
  const samplesUs = [];
  for (let round = 0; round < options.rounds; round++) {
    global.gc();
    const start = performance.now();
    batch();
    samplesUs.push((performance.now() - start) * 1000 / iterations);
    assert.deepEqual(retained.at(-1), expected);
    retained.fill(undefined);
  }
  return { name, rows, iterations, callbackCounts, validated: true, samplesUs, medianUs: median(samplesUs) };
}

if (process.argv[2] === "--child") {
  process.stdout.write(`${JSON.stringify(await measure(process.argv[3], process.argv[4], Number(process.argv[5])))}\n`);
} else {
  assert.ok(process.argv[2], "Usage: node --expose-gc bench/pipeline.mjs /absolute/baseline/dist/index.js [output.json]");
  const modules = {
    before: pathToFileURL(resolve(process.argv[2])).href,
    after: new URL("../dist/index.js", import.meta.url).href,
  };
  const results = [];
  for (const [pair, order] of [["before", "after"], ["after", "before"]].entries()) {
    for (const rows of options.sizes) {
      for (const name of cases) {
        for (const implementation of order) {
          const { stdout } = await runFile(process.execPath, [
            "--expose-gc", fileURLToPath(import.meta.url), "--child",
            modules[implementation], name, String(rows),
          ], { timeout: 120000, maxBuffer: 1024 * 1024 });
          results.push({ pair: pair + 1, implementation, ...JSON.parse(stdout) });
        }
      }
    }
  }
  const report = {
    measuredAt: new Date().toISOString(),
    runtime: { node: process.version, v8: process.versions.v8 },
    machine: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model },
    modules, options,
    methodology: "Two before/after pairs with reversed order; fresh sequential child per case. Warmups and explicit GC outside timed retained-result batches. Exact output and callback counts checked outside timers. Input/query preparation excluded. Full-result cases omit LIMIT. Sequence case starts from a pre-materialized stable sequence. Timing only; allocation and peak memory are not measured.",
    results,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (process.argv[3]) { await writeFile(resolve(process.argv[3]), json); }
  else { process.stdout.write(json); }
}
