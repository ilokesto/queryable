import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import { MAP, MAP_CONCURRENT, createAsyncQuerySequence, iterateAsyncEntries } from '../dist/index.js';

const count = 256;
const repeats = 5;
const configurations = [
  { name: 'sequential MAP', options: undefined },
  { name: 'ordered C8 P1 R2', options: { concurrency: 8, prefetch: 1, reorderBuffer: 2 } },
  { name: 'ordered C8 P1 R7', options: { concurrency: 8, prefetch: 1, reorderBuffer: 7 } },
  { name: 'ordered C8 P4 R31', options: { concurrency: 8, prefetch: 4, reorderBuffer: 31 } },
  { name: 'unordered C8 P1 R7', options: { concurrency: 8, prefetch: 1, reorderBuffer: 7, ordered: false } },
];

async function measure(workload, configuration) {
  let pulled = 0;
  let started = 0;
  let completed = 0;
  let consumed = 0;
  let running = 0;
  let headPending = true;
  let peakRunning = 0;
  let peakInputQueue = 0;
  let peakReadAhead = 0;
  let peakCompleted = 0;
  let completedBehindHead = 0;
  let peakCompletedBehindHead = 0;
  const source = createAsyncQuerySequence(function* () {
    for (let value = 0; value < count; value++) {
      pulled++;
      peakInputQueue = Math.max(peakInputQueue, pulled - started);
      peakReadAhead = Math.max(peakReadAhead, pulled - consumed);
      yield [String(value), value];
    }
  });
  const mapper = async value => {
    started++;
    running++;
    peakRunning = Math.max(peakRunning, running);
    const rounds = workload === 'slow head' && value === 0 ? 64 : 1;
    for (let round = 0; round < rounds; round++) {
      await setImmediate();
    }
    running--;
    completed++;
    if (value === 0) {
      headPending = false;
    } else if (headPending) {
      completedBehindHead++;
      peakCompletedBehindHead = Math.max(peakCompletedBehindHead, completedBehindHead);
    }
    peakCompleted = Math.max(peakCompleted, completed - consumed);
    return value;
  };
  const query = configuration.options
    ? source[MAP_CONCURRENT](mapper, configuration.options)
    : source[MAP](mapper);
  globalThis.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  let checksum = 0;
  for await (const [, value] of iterateAsyncEntries(query)) {
    consumed++;
    checksum += value;
    if (workload === 'slow consumer') {
      await setImmediate();
      await setImmediate();
    }
  }
  const elapsedMs = performance.now() - start;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  // Data integrity only. Timing, heap, and utilization are observations, not gates.
  if (consumed !== count || checksum !== count * (count - 1) / 2) {
    throw new Error('Benchmark lost or duplicated output');
  }
  return {
    elapsedMs, heapDeltaBytes, peakRunning, peakInputQueue, peakReadAhead,
    peakCompleted, peakCompletedBehindHead,
  };
}

const results = [];
for (const workload of ['uniform async', 'slow head', 'slow consumer']) {
  for (const configuration of configurations) {
    await measure(workload, configuration);
    const samples = [];
    for (let repetition = 0; repetition < repeats; repetition++) {
      samples.push(await measure(workload, configuration));
    }
    samples.sort((left, right) => left.elapsedMs - right.elapsedMs);
    const median = samples[Math.floor(samples.length / 2)];
    results.push({
      workload, configuration: configuration.name, ...median,
      minMs: samples[0].elapsedMs, maxMs: samples.at(-1).elapsedMs,
    });
  }
}
process.stdout.write(`${JSON.stringify({
  node: process.version, platform: process.platform, arch: process.arch,
  cpu: os.cpus()[0]?.model, count, repeats, results,
}, null, 2)}\n`);
