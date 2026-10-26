# Lazy WHERE/MAP fusion observations

Issue #9, measured October 26, 2026. These are local observations, not performance
guarantees or correctness thresholds.

## Decision and invariants

Keep the small typed continuation implementation in `src/fusion.ts`. The existing
depth-16 identity-MAP workload took 17.118417 ms before and 8.135542 ms after per
20-query batch, a 52.5% reduction in this pair. Two additional pairs showed lower
full-traversal medians for both identity and costly callbacks. The benefit
shrinks as callback cost grows. Shallow and prefix workloads do not establish a
universal improvement: the original two-stage early-limit case regressed by
41.4% in its single pair, while the scoped depth-16 prefix cases improved.

`Plan<S, T>` retains the source's original type `S` and the current output type
`T`. Each appended operation composes typed callbacks; it does not put
heterogeneous callbacks into an erased instruction array. At consumption, the
plan builds callback links and runs one source generator. Each accepted entry
creates one output tuple regardless of MAP depth. Filters skip by not calling
the next callback. A library-owned optional tuple signals emission, so a stored
`undefined`, Symbol, or revoked proxy never becomes a control signal.

Execution state belongs to each generator invocation, not the immutable plan.
Branches reuse only source and compilation descriptions; repeated and reentrant
consumption get separate callback links, cursors, and output slots. Native
`for...of` iterator closure handles stopping and thrown callbacks. Zero stages
retain the original source. One stage uses the original direct filter/map
generator, bypassing compilation. Two or more adjacent stages use fusion.

SORT, sequence PICK, every LIMIT, and eager GROUP_BY remain outside this
mechanism. These wrappers break adjacency, so callbacks cannot move across a
buffering or stopping boundary. Eager operations and the frozen shared public
Symbol methods keep their existing implementation contracts.

This chooses ordinary typed callback composition over an opcode VM, unsafe
callback casts, payload shape tests, or one tagged allocation per intermediate
value. Compilation and callback call-stack depth remain linear in stage count;
there is no claim of stack-independent execution for arbitrarily deep chains.
The source still creates its entry tuples. Retained-heap measurements below do
not measure the avoided transient tuples or generator objects.

## Environment and reproduction

- Baseline: `367462bc8b32032461578ae25be2db08fc66068f`.
- Candidate: the uncommitted fusion implementation accompanying this report.
- Node `v24.22.1`, V8 `13.6.233.17-node.58`, pnpm `10.17.1`.
- Darwin `27.2.0`, arm64, Apple M4 Pro, 12 logical CPUs,
  25,769,803,776 bytes total memory.
- Existing harness baseline: `2026-10-26T03:16:37.916Z`.
- Existing harness candidate: `2026-10-26T03:21:25.615Z`.
- Complete scoped paired report: `2026-10-26T03:23:16.516Z`.

From this repository at the baseline revision, before applying the candidate:

```sh
export PATH=/Users/ayden/.nvm/versions/node/v24.22.1/bin:$PATH
pnpm install --frozen-lockfile
pnpm exec tsc --outDir /tmp/queryable-fusion-367462b
pnpm build
node --expose-gc bench/benchmark.mjs \
  --rows 2000 --instances 100 --iterations 20 --rounds 5 --warmups 3 \
  --mechanisms --early-limit
```

After applying the candidate in this repository:

```sh
pnpm build
node --expose-gc bench/fusion.mjs /tmp/queryable-fusion-367462b/index.js
node --expose-gc bench/benchmark.mjs \
  --rows 2000 --instances 100 --iterations 20 --rounds 5 --warmups 3 \
  --mechanisms --early-limit
```

The baseline build was read before comparison and contains no fusion import.
Neither the original harness nor its workloads changed. All 27 original cases
validated before and after. The scoped script runs fresh sequential children
for eight cases, once in before/after order and once in after/before order.
All 32 results validated against an independent per-entry oracle and exact
callback budgets. Timing includes lazy conversion, stage construction, traversal
and result collection, but excludes initial record construction and imports.
Each case has three warmup batches and five timed batches; GC runs outside the
timer. A separate five-batch pass measures post-GC heap with results retained.

The scoped normal cases use 2,000 numeric rows and 20 queries per batch.
Small-source cases use one row and 2,000 queries. `map` has 16 MAP stages;
`mixed` has eight alternating MAP/WHERE pairs. WHERE rejects only `row0`.
Cheap MAP is identity; costly MAP performs 32 integer hash rounds and returns
the hash. Prefix cases use LIMIT(5). Within each case, before and after have
identical values, keys, callbacks, row counts, output and process arguments.

An initial scoped run also completed, but the interactive output lost its
first records to the log line limit. It is not pooled into the tables. The
complete rerun above was captured as compact JSON without changing the script
or measurement conditions. No other gate ran concurrently with these benchmark
commands in this task. The workstation was shared, not a dedicated benchmark
machine; unrelated work, JIT, GC, frequency and scheduling remain confounders.

## Existing depth and early-limit mechanisms

Timing samples are milliseconds per 20-query batch, rounded to six decimal
places. Heap samples are exact post-GC `heapUsed` deltas in bytes.

| Case | Before median ms | After median ms | Checksum, both |
| --- | ---: | ---: | ---: |
| lazy-stages/depth-0 | 2.085791 | 2.061625 | 20000 |
| lazy-stages/depth-1 | 4.291458 | 4.157417 | 20000 |
| lazy-stages/depth-16 | 17.118417 | 8.135542 | 20000 |
| early-limit/new-lazy | 0.545666 | 0.771667 | 50 |

| Case | Before timing samples | After timing samples | Before heap samples | After heap samples |
| --- | --- | --- | --- | --- |
| depth-0 | 2.289417, 2.081500, 2.309875, 2.085791, 1.980000 | 2.428583, 2.141375, 2.061625, 2.010750, 2.051792 | 349720, 349712, 349712, 349760, 349944 | 349720, 349712, 349712, 349760, 349944 |
| depth-1 | 4.639583, 3.057666, 4.291458, 2.973916, 4.435166 | 4.489417, 3.090792, 4.157417, 3.107292, 4.362208 | 344400, 360880, 346400, 360928, 354520 | 344352, 360880, 346400, 360928, 344576 |
| depth-16 | 18.261834, 17.034917, 17.118417, 17.207166, 16.925959 | 8.753667, 7.120417, 8.135542, 7.109333, 8.436791 | 349720, 355424, 355376, 353856, 355656 | 344248, 361304, 346192, 361280, 344424 |
| early-limit | 0.545666, 0.701959, 0.790750, 0.523167, 0.542666 | 0.844041, 0.771667, 0.780167, 0.584791, 0.582333 | 4600, 4640, 4592, 4640, 4824 | 4600, 4640, 5784, 4640, 4872 |

Depth-0/1/16 validation observed respectively 0, 2,000 and 32,000 MAP calls
per query. The original early-limit case observed 10 predicate and five mapper
calls before and after. These probes run outside timing.

## Callback cost, prefix and small-source comparison

Each median is a batch measurement, not a latency percentile. Pair 1 runs
before then after; pair 2 reverses that order.

| Case | Pair 1 before ms | Pair 1 after ms | Pair 2 before ms | Pair 2 after ms |
| --- | ---: | ---: | ---: | ---: |
| map/cheap/full | 16.860791 | 7.945333 | 17.204167 | 8.032083 |
| map/costly/full | 43.508167 | 34.561958 | 43.143250 | 34.816750 |
| mixed/cheap/full | 17.150667 | 7.446958 | 17.368959 | 7.540125 |
| mixed/costly/full | 29.262792 | 20.577709 | 29.797209 | 21.218250 |
| mixed/cheap/prefix | 0.693584 | 0.600416 | 0.767875 | 0.615625 |
| mixed/costly/prefix | 0.717916 | 0.655000 | 0.841167 | 0.655583 |
| small/depth-0 | 0.667375 | 0.617959 | 0.668833 | 0.672417 |
| small/depth-1 | 0.779667 | 0.786500 | 0.749542 | 0.723042 |

| Case | MAP calls/query | WHERE calls/query | Output length | Checksum, all four runs |
| --- | ---: | ---: | ---: | ---: |
| map/cheap/full | 32000 | 0 | 2000 | 19990000 |
| map/costly/full | 32000 | 0 | 2000 | 11439804250 |
| mixed/cheap/full | 15993 | 15993 | 1999 | 19990000 |
| mixed/costly/full | 15993 | 15993 | 1999 | 16225959780 |
| mixed/cheap/prefix | 41 | 41 | 5 | 150 |
| mixed/costly/prefix | 41 | 41 | 5 | 24210073530 |
| small/depth-0 | 0 | 0 | 1 | 0 |
| small/depth-1 | 1 | 0 | 1 | 0 |

Checksums add the unsigned sum of the last output array in each of ten measured
timing/heap batches. Full output equality is checked before measurements.
The zero small-source checksum is intentional because its only value is zero;
output length and exact output are checked separately.

### Raw scoped samples

| Pair and case | Before timing samples (ms) | After timing samples (ms) | Before heap samples (bytes) | After heap samples (bytes) |
| --- | --- | --- | --- | --- |
| 1: map/cheap/full | 17.188042, 17.289750, 16.860791, 16.449417, 16.616833 | 8.410625, 7.106083, 8.139458, 7.047500, 7.945333 | 349800, 354264, 355424, 355424, 355656 | 344400, 360192, 354936, 361232, 344424 |
| 1: map/costly/full | 44.231583, 43.512875, 43.508167, 43.017708, 42.856334 | 34.561958, 34.379667, 34.748833, 34.996625, 33.994125 | 349744, 355408, 355424, 355424, 355656 | 349696, 355792, 366456, 355712, 355944 |
| 1: mixed/cheap/full | 17.451750, 17.150667, 17.191000, 16.829375, 16.939250 | 8.309708, 6.371042, 7.487875, 6.340958, 7.446958 | 349800, 359608, 360720, 360720, 369488 | 344232, 360192, 346240, 361232, 344424 |
| 1: mixed/costly/full | 29.530834, 29.258209, 29.686375, 29.012417, 29.262792 | 20.497791, 20.759459, 20.739250, 20.577709, 20.263333 | 349696, 360752, 360720, 360768, 369488 | 349696, 355744, 357712, 355808, 355992 |
| 1: mixed/cheap/prefix | 0.638333, 0.817625, 0.693584, 0.730917, 0.677959 | 0.622250, 0.565166, 0.620167, 0.600416, 0.568125 | 4600, 4640, 4592, 4640, 4872 | 2656, 4640, 4640, 4640, 14088 |
| 1: mixed/costly/prefix | 0.813000, 0.717916, 0.728958, 0.716542, 0.679291 | 0.845500, 0.655000, 0.648500, 0.658958, 0.646791 | 4600, 4640, 4640, 4640, 4872 | 2656, 4640, 4640, 4640, 4872 |
| 1: small/depth-0 | 0.494750, 0.739792, 0.667375, 0.598875, 0.677709 | 0.550875, 0.735042, 0.672542, 0.617959, 0.503000 | 159960, 164952, 166744, 160168, 159856 | 155056, 159952, 166392, 165520, 163728 |
| 1: small/depth-1 | 0.779667, 0.904292, 0.714292, 0.606708, 1.268958 | 0.823292, 0.786500, 0.802333, 0.775125, 0.679000 | 170896, 164472, 160000, 165944, 169608 | 154640, 123200, 163968, 163992, 168112 |
| 2: map/cheap/full | 17.540625, 17.825458, 17.204167, 16.758375, 17.071750 | 8.548625, 6.808417, 8.032083, 6.895333, 8.080833 | 349800, 355400, 355376, 355424, 355656 | 344232, 360192, 354984, 361232, 344424 |
| 2: map/costly/full | 43.765833, 43.678542, 43.051000, 43.143250, 43.141208 | 34.415834, 34.345791, 35.002125, 34.816750, 35.759125 | 349696, 355504, 355424, 355376, 355656 | 349696, 355744, 366456, 355712, 355944 |
| 2: mixed/cheap/full | 17.997833, 17.300458, 17.332792, 17.368959, 17.421083 | 8.358083, 6.484375, 7.744167, 6.771459, 7.540125 | 349800, 359608, 360672, 360768, 369440 | 344232, 361280, 346192, 361280, 344424 |
| 2: mixed/costly/full | 30.516583, 30.548375, 29.797209, 29.651500, 29.754166 | 21.780667, 21.525042, 21.218250, 20.882709, 20.942542 | 349752, 360648, 360720, 360720, 369488 | 349696, 355792, 357760, 355760, 355992 |
| 2: mixed/cheap/prefix | 0.767875, 0.823541, 0.694791, 0.897750, 0.676208 | 0.597792, 0.786125, 0.615625, 0.754667, 0.577541 | 4600, 4592, 4592, 4592, 4824 | 2656, 4640, 4640, 4640, 14088 |
| 2: mixed/costly/prefix | 0.879750, 0.688167, 0.881208, 0.712916, 0.841167 | 0.650833, 0.786166, 0.655583, 0.758167, 0.617334 | 4600, 4592, 4640, 4640, 4872 | 2656, 4640, 4640, 4640, 4872 |
| 2: small/depth-0 | 0.477541, 0.716375, 0.668833, 0.625083, 0.692000 | 0.489916, 0.702625, 0.686042, 0.623500, 0.672417 | 159960, 170272, 160480, 160056, 152672 | 159960, 165120, 172120, 158120, 161544 |
| 2: small/depth-1 | 0.749542, 0.895666, 0.717917, 0.663042, 1.288083 | 0.723042, 0.762333, 0.788666, 0.667500, 0.641959 | 170336, 161504, 160056, 160344, 176672 | 118864, 166680, 169008, 159952, 165744 |

## Limits and verification

The evidence supports keeping this limited fusion mechanism for deep chains,
not adding a VM or claiming every query is faster. Short-chain construction
still creates a plan descriptor, and early consumers may not amortize that
cost. Single-stage traversal itself uses the original generator. Small-source
medians vary in both directions. The original early-limit regression is
retained rather than discarded or explained away as proven noise.

Heap results retain final arrays, not transient tuples, callback links or
generators. They do not establish reduced total allocation, peak heap, RSS,
closure counts, or production latency. No allocation profile or bundle-size
comparison was run. There are no timing or heap assertions in correctness
tests. The two paired scoped runs and one original-harness pair do not provide
confidence intervals.

All required gates passed with the pinned toolchain:
`pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`
(204 tests), `pnpm test:tooling` (90 tests), `pnpm migrate:verify`,
`pnpm docs:publication:verify`, `pnpm docs:typecheck`, `pnpm docs:build`, and
`pnpm docs:test` (six tests). The benchmark script also passed `node --check`;
changed TypeScript files and the benchmark script had no LSP diagnostics.
Install reported the repository's ignored esbuild/sharp build scripts; all
subsequent checks succeeded without changing that policy.

The 16 new behavior cases cover type-changing branches, opaque values,
reentrant/interleaved consumption, exact short-circuit closure, failures at each
fused position, stale-output rejection, zero-limit barriers and eager groups.
Original tests are untouched. This is an internal execution optimization with
no added public API or changed consumer contract, so canonical bilingual API
documentation requires no new entry. A root patch Changeset records the
optimization; version `0.0.1`, runtime dependencies and public access are
unchanged. All changes are uncommitted.
