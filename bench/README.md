# Queryable benchmark

Run from this standalone repository root with Node 24 and pnpm 10.17.1.
Remeda remains a development dependency only:

```sh
pnpm install --frozen-lockfile
pnpm build
node --expose-gc bench/benchmark.mjs
```

Optional filter/map/first-five comparison:

```sh
node --expose-gc bench/benchmark.mjs --early-limit --mechanisms
```

A small smoke run, still using three measured samples:

```sh
node --expose-gc bench/benchmark.mjs \
  --rows 100 --instances 100 --iterations 2 --rounds 3 --warmups 1 \
  --early-limit --mechanisms
node bench/bundle.mjs
```

The script writes one JSON document to stdout, with Node/V8/Remeda versions,
machine information, all effective options, raw samples, medians, checksums,
and elapsed time. Query validation reports predicate/mapper invocation counts;
constructor validation counts distinct WHERE/VALUES function identities across up
to 1,000 instances. These probes run outside measurements. Errors go to stderr and
fail the command. `RESULTS.md` and `results.json` preserve a historical run of
the original 12 cases, not results for the new mechanism or bundle workloads.

## Tracks

| Track | Cases | Included work |
| --- | --- | --- |
| Retained small-instance construction | Original article Proxy, old `Object.entries` prototype, new eager | Construct and retain one wrapper per pre-existing small record. |
| Full-filter execution | Those three plus native JS and Remeda | Filter all values and collect the full matching array, starting with an already constructed query or raw record. |
| Optional early limit | New eager, new lazy, native loop, Remeda pipe | Filter values, map IDs to doubled numbers, and collect the first five results. |
| Optional lazy stages | Depth 0, 1, 16 | Construct a lazy view and zero/one/deep identity MAP stages, then collect all values. |
| Optional materialized terminals | Record and sorted materialized sequence, COUNT and FIRST | Invoke only the terminal on a prebuilt source; sorting is excluded. |
| Optional sequence PICK | Narrow (up to 4 keys) and wide (all keys), eager/lazy/native Map | Pick reversed record keys plus a duplicate and missing key; collect key/value entries. Source sorting is excluded; lookup buffering is included. |
| Optional expensive comparator | Queryable SORT and native values toSorted | Recompute a deterministic 32-round integer projection for both comparator operands. No selector-sort or projection cache API is assumed. |

`--mechanisms` adds 15 cases to the original suite; `--early-limit` adds four.
Zero/one/deep workloads keep output and traversed row count identical to expose
stage overhead without conflating selectivity. Lazy stage creation is included;
terminal-only sources and sequence PICK sources are prepared before measurement.
PICK is record-key selection, not field projection. Its lazy case starts from a
materialized sequence, isolating lazy PICK rather than measuring source sorting.
The native Map baseline has the same ordered, unique, existing-key semantics.
Exact outputs are checked twice for repeatability before warmup. Sort callback
counts are observed in a separate validation probe, never in timed callbacks.

The Proxy is the article's exact `WHERE`/`VALUES` implementation with TypeScript
annotations removed and the benchmark's imported symbols substituted. Its
`Object.entries().filter().reduce()` path and per-access returned closures are
preserved. It is **not** an extended Proxy model with invented map/limit methods.
The old prototype is the package's pre-optimization constructor and
`WHERE`/`VALUES` code, using `Object.entries` and a frozen null-root shared
prototype; unexercised methods are omitted. The new implementation comes from
`../dist/index.js`, so rebuild after changing source.

Native JS and Remeda have no DSL instance constructor. There is deliberately
no synthetic construction case or claimed wrapper-memory savings for them.
Their full-filter cases include `Object.values(input)` on every query:
native uses array `filter`, and Remeda uses `filter(array, predicate)`.
The early-limit Remeda case uses
`pipe(Object.values(input), filter(predicate), map(mapper), take(5))`.
That initial values array is fully materialized, even if Remeda fuses subsequent
operations. The native early-limit case uses an own-property guarded `for...in`
loop with an explicit break; the engine can still enumerate keys internally.
Queryable lazy conversion and pipeline creation occur inside each query;
initial `createQueryable` construction does not.

Inputs are deterministic plain records with non-integer `rowN` keys and shallow
`{ id, score: id % 10 }` values, with predicate `score >= 5`. They do not measure
accessors, mutation, special keys, grouping, or the cost of nested payload
allocation. Only the optional expensive-sort cases exercise complex callbacks
and timed sorting. Every child checks exact result equality against a native
reference before any warmup or measurement. The constructor
track also checks that its wrapper supports filtering and collection.

## Measurement

Each case runs in a fresh, sequential Node child with `--expose-gc`. Inputs,
query setup, imports, validation, and process startup are excluded from reported
batch timing. Sequential children avoid concurrent CPU contention between cases;
the reported overall elapsed time includes child startup and all measurement
passes. Run on an otherwise idle machine and compare multiple complete runs.

Each case warms up, then takes repeated timed batches. Results stay in a
preallocated retention array through the end of each batch and are released
before the next. Explicit GC runs before, not inside, the timer; natural GC can
still occur inside timing. The script reports median batch milliseconds and
microseconds per instance/query. These are batch averages, not latency
percentiles or confidence intervals.

A **separate, untimed pass** samples `heapUsed` before constructing a batch and
after explicit GC while the batch's wrappers or result arrays remain reachable.
It reports raw deltas, median bytes, and bytes per instance/query. This is
retained managed-heap growth, **not total allocation**, peak memory, RSS,
temporary entry-array churn, or a count of closures. GC/JIT bookkeeping and heap
layout can yield noisy or negative deltas; do not clamp them or interpret a
small difference as proof.

**Transient allocation is not measured.** The JSON explicitly records this
instead of relabeling retained heap deltas as allocation. Discarded entry tuples,
generator objects and closures can affect timing without surviving explicit GC.
Use a dedicated allocation profiler in a separate run to investigate them;
neither these heap samples nor bundle bytes quantify temporary allocation.

## Consumer bundle footprint

`node bench/bundle.mjs` uses esbuild already installed through Vitest -> Vite.
It fails if that tooling is unavailable; it never downloads a bundler. It reports
the esbuild and Node/V8 versions, machine metadata, exact fixture sources,
included module paths, settings, and three independent build-size samples.
Each generated consumer is executed and checked against a native full filter.
Sizes must be reproducible across the three builds, with no size threshold.

All three consumers return values only: native `Object.values().filter()`,
Remeda `filter(Object.values())`, and Queryable construction/WHERE/VALUES.
These are not key-preserving record equivalents. Runtime comparisons also
retain the original distinction: full-filter/early-limit return values, while
the sequence PICK cases return ordered entries and preserve keys.

Measurements are the **whole consumer** minified ESM bytes and level-9 gzip
bytes, targeting browser ES2023 with tree shaking and no sourcemaps or legal
comments. They are not npm tarball size, raw source size, incremental library
cost, runtime memory, or loading time. The native fixture is a disclosed baseline,
not a number subtracted to claim a universal package size. The shared Symbol
prototype can retain methods not explicitly imported by a consumer; the emitted
module list and whole-consumer bytes expose this without promising per-method
tree shaking. Bundle sizes are deterministic artifacts, not statistical timing
samples; the three builds check reproducibility rather than confidence.

## Retention and limits

Construction ownership differs: the article Proxy references its already-live
input record, while both prototype constructors shallow-copy its outer record.
All inputs and nested values exist before the baseline heap sample. This track
therefore measures incremental wrapper/copy retention, not ownership-equivalent
total object graphs. Construction does not retain `WHERE` or `VALUES` function
lookups: the Proxy allocates method closures when accessed, not two permanent
method closures simply by being constructed. Full-filter timing exercises those
accesses, but post-GC heap deltas do not count discarded closures.

Defaults are 5,000 rows, 5,000 four-entry instances, 10 queries per batch,
2 warmups, and 5 samples in each measurement pass. They target a run below
roughly 30 seconds on a contemporary development machine; this is not a
cross-machine guarantee. Each child has a 20-second hard timeout and failures
abort the report rather than print partial success.

`--help` lists options. Integer ranges are validated: rows/instances 1-100,000,
small-size 1-32, iterations 1-1,000, rounds 3-25, warmups 1-10. Combined work is
capped at 100 million entry/stage visits per case across passes (the mechanism
suite conservatively applies its maximum 16-stage depth); full-query retention is
capped at one million input entries per batch. Larger configurations can still
take longer than defaults. Case order is fixed and disclosed by the JSON; CPU
thermal/frequency changes, engine optimization, and imported-library overhead
remain limitations. This benchmark supports local comparisons, not universal
performance or memory claims.

## Sources

- Original implementation:
  https://ayden94.com/posts/memory-cost-proxy-and-prototype
- Official Remeda API reference (`filter`, `map`, `pipe`, `take`):
  https://remedajs.com/docs/

Remeda is a development dependency only; no Remeda runtime dependency is needed
by queryable consumers. Context7 was unavailable while authoring this benchmark,
so the Remeda calls were checked against its official documentation.
