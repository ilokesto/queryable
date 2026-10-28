# Record pipeline optimization results

Measured on 2026-10-28 with Node 24.22.1, V8 13.6.233.17-node.58,
and Apple M4 Pro (darwin arm64).

Baseline: main `cf10dc321fde5f3935fe91ebf5fd8e4f7ec21ee4`.
Candidate: the eager record-loop change in `7c30830` and direct entry-indexing
change in `50ded81` on `perf/query-pipeline`. Package version remains 0.1.0.

## Changes

- Eager record WHERE, MAP, and nonnegative LIMIT write results directly while
  traversing the record. They avoid intermediate generator and entry-tuple
  transport, but still materialize a separate record per eager operation.
- Lazy mapping and fused traversal index normalized entry arrays directly,
  avoiding tuple destructuring's per-entry iterator protocol. Fusion, callback
  order, tuple ownership, and iterator cleanup remain unchanged.
- Finite negative LIMIT retains its existing full-buffer implementation.
- No key cache, runtime dependency, or public API was added.

## Pipeline comparison

`pipeline-results.json` contains all 72 child results and raw timing samples.
The six workloads run at 1,000, 10,000, and 100,000 rows, in two independent
before/after pairs with reversed implementation order. Each child uses five
warmup batches and seven measured batches. Queries and inputs are prepared
outside timing; exact outputs and callback counts are validated outside timing.
Full-result cases omit LIMIT. The sequence workload starts from a previously
materialized stable sequence.

The table reports milliseconds per query, averaging the two independently
measured batch-median latencies at 10,000 rows. Reduction is relative to baseline;
a negative reduction means slower in this run.

| Workload | Before ms | After ms | Time reduction |
| --- | ---: | ---: | ---: |
| Eager WHERE / VALUES | 1.580 | 1.307 | 17.3% |
| Eager WHERE / MAP / VALUES | 2.174 | 1.767 | 18.7% |
| Eager WHERE / MAP / LIMIT(5) / VALUES | 1.984 | 1.568 | 21.0% |
| Lazy WHERE / MAP / VALUES | 0.997 | 0.945 | 5.3% |
| Lazy WHERE / MAP / LIMIT(5) / VALUES | 0.351 | 0.362 | -3.0% |
| Materialized sequence, lazy WHERE / MAP / VALUES | 0.285 | 0.268 | 6.2% |

Eager full filter/map speedups were 1.40-1.41x at 1,000 rows,
1.22-1.24x at 10,000 rows, and 1.16-1.17x at 100,000 rows across
the two comparison pairs. Lazy full record traversal improved in both pairs
at every tested size. Lazy prefix retrieval did not show a consistent
improvement: the 1,000- and 10,000-row cases were slightly slower in both
pairs, while the 100,000-row pairs straddled parity. Do not claim that
this optimization solves record-prefix performance.

## Deep lazy chains

The existing `fusion.mjs` benchmark also ran against the same baseline.
`pipeline-fusion-results.json` retains its 32 child results, exact output and
callback checks, raw timing samples, and separate retained-heap samples.

At 16 stages, full cheap MAP chains improved 1.09-1.14x, and alternating
cheap MAP/WHERE chains improved 1.12-1.24x across the two pairs. Costly full
MAP chains improved about 1.02x and costly mixed chains 1.05-1.06x.
One-stage tiny inputs and cheap prefix retrieval had mixed directions, so
these cases support no reliable improvement claim. Retained heap is not
total allocation or peak memory.

## Remaining costs and scope

Record-backed lazy consumption still starts with native object key enumeration.
A separate exploratory first-value probe, without transformation callbacks,
showed similar size-dependent costs for guarded for-in and Object.keys on
the same query. Replacing one with the other did not remove this cost.
Caching keys would change the current live behavior under direct additions
and deletions, so this change does not introduce such a cache.

This is a before/after comparison of this library, not a new competitor ranking.
It excludes constructor cost, expensive sort/group/join operations, async
workloads, and allocation profiling. Earlier competitor results used a
different full-result pipeline with an explicit LIMIT; do not compare those
absolute latencies directly. These single-machine measurements are batch
averages, not latency percentiles or statistical confidence intervals.

## Validation and reproduction

On Node 24.22.1 and pnpm 10.17.1, frozen-lockfile installation and typecheck
passed. The complete `pnpm test` passed: 30 unit-test files / 951 tests,
type tests, and 37 tooling tests. Seventeen added public contract cases protect
mutation/reentry, accessor reads, snapshot ownership, LIMIT boundaries, and
callback-versus-cleanup exception precedence. Original tests were preserved.

Build both revisions independently, then run from the candidate repository:

```sh
pnpm build
node --expose-gc bench/pipeline.mjs /absolute/baseline/dist/index.js pipeline-results.json
node --expose-gc bench/fusion.mjs /absolute/baseline/dist/index.js
```

The measured commands ran sequentially after implementation and test jobs
finished. A PATH-only pnpm shim was needed locally because package scripts
invoke `pnpm` directly; no repository configuration was changed for it.
