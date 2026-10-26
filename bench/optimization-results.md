# Internal terminal and PICK observations

Local bounded comparison for issues #7 and #8, measured October 26, 2026.
These observations are not performance guarantees or test thresholds.

## Environment and reproduction

- Before: `f6f7bcf`, unchanged library source and built output.
- After: the uncommitted `src/index.ts` changes accompanying this report.
- Node `v24.22.1`, V8 `13.6.233.17-node.58`, pnpm `10.17.1`,
  Remeda `2.51.0` (development dependency).
- Darwin `27.2.0`, arm64, Apple M4 Pro, 12 logical CPUs,
  25,769,803,776 bytes total memory.
- Before completed at `2026-10-26T02:45:40.650Z`; after completed at
  `2026-10-26T02:46:27.183Z`. Full harness elapsed times were
  `2346.332625` and `2268.254291` ms, including unrelated tracks and child startup.

Run from the repository root, with the pinned Node installation first on PATH:

```sh
export PATH=/Users/ayden/.nvm/versions/node/v24.22.1/bin:$PATH
pnpm install --frozen-lockfile
pnpm build
node --expose-gc bench/benchmark.mjs \
  --rows 2000 --instances 100 --iterations 20 --rounds 3 --warmups 2 --mechanisms
```

The existing harness ran unchanged. Each case uses a fresh sequential Node
child, two warmup batches, three timed batches of 20 queries, and a separate
three-batch retained-heap pass. Explicit GC is outside the timer.
Native-result equality and repeatability are checked before measurement;
all ten cases below returned `validated: true` with matching before/after
checksums. The full harness also completed successfully.

Source construction and sorting are excluded from the reported cases.
Terminal cases reuse a prebuilt record or materialized sorted sequence.
PICK includes lookup buffering and fresh ordered entry extraction: narrow
requests four existing keys, wide requests all 2,000 existing keys, both in
reverse order with one missing and one repeated key added. The lazy PICK case
starts from a materialized sequence with no pending callbacks.

## Samples

Each timing cell contains the three observed batch samples in milliseconds,
formatted to six decimal places. Heap cells contain the three exact post-GC
`heapUsed` deltas in bytes. Negative heap samples are retained, not clamped.

| Case | Before timing samples (ms) | After timing samples (ms) | Before heap samples (bytes) | After heap samples (bytes) | Checksum, both |
| --- | --- | --- | --- | --- | --- |
| materialized-count/record | 1.475500, 1.702291, 1.461125 | 1.635041, 1.468458, 1.527375 | -40, 0, 0 | -40, 0, 0 | 12000 |
| materialized-first/record | 0.617750, 0.674000, 0.480459 | 0.610458, 0.624666, 0.485000 | -40, 0, 0 | -40, 0, -48 | 6 |
| materialized-count/sequence | 0.105416, 0.019000, 0.017625 | 0.003042, 0.004250, 0.003250 | -40, 0, -48 | -40, 0, 0 | 12000 |
| materialized-first/sequence | 0.005917, 0.005250, 0.005542 | 0.011833, 0.003875, 0.003375 | -40, 0, -48 | -40, 0, -48 | 6 |
| sequence-pick-narrow/eager | 0.607417, 0.757042, 0.623708 | 0.653583, 0.445084, 0.427834 | 6680, 15488, 6672 | -8880, 6984, 6720 | 24 |
| sequence-pick-narrow/lazy | 0.719583, 0.663500, 0.751833 | 0.541333, 0.436875, 0.450292 | 6680, 15536, 6720 | -8880, 6984, 6672 | 24 |
| sequence-pick-narrow/native-map | 0.654083, 0.675042, 0.662125 | 0.672833, 0.712750, 0.757208 | 8760, 16776, 8752 | 8760, 16728, 8800 | 24 |
| sequence-pick-wide/eager | 4.356291, 3.337666, 3.402792 | 5.558292, 4.475250, 4.047500 | 2909720, 2909856, 2909712 | 2909888, 2909760, 2909712 | 12000 |
| sequence-pick-wide/lazy | 4.086958, 3.628125, 2.967541 | 4.606625, 4.152584, 4.552875 | 2909792, 2909712, 2909880 | 2909888, 2909712, 2909712 | 12000 |
| sequence-pick-wide/native-map | 1.623875, 1.746709, 1.684625 | 1.529209, 1.766834, 1.495292 | 3031960, 3031952, 3031952 | 3031960, 3031952, 3031952 | 12000 |

| Case | Before median batch ms | After median batch ms |
| --- | --- | --- |
| materialized-count/record | 1.475500 | 1.527375 |
| materialized-first/record | 0.617750 | 0.610458 |
| materialized-count/sequence | 0.019000 | 0.003250 |
| materialized-first/sequence | 0.005542 | 0.003875 |
| sequence-pick-narrow/eager | 0.623708 | 0.445084 |
| sequence-pick-narrow/lazy | 0.719583 | 0.450292 |
| sequence-pick-narrow/native-map | 0.662125 | 0.712750 |
| sequence-pick-wide/eager | 3.402792 | 4.475250 |
| sequence-pick-wide/lazy | 3.628125 | 4.552875 |
| sequence-pick-wide/native-map | 1.684625 | 1.529209 |

## Interpretation and limits

Materialized sequence terminals and narrow PICK had lower median batch times in
this local pair. Wide PICK had higher medians: requested-key Set construction and
membership checks add work when almost every source entry is retained. This is a
trade-off, not an across-the-board speed improvement. Record terminals continue
to enumerate live records; their small changes here do not establish an
improvement. FIRST batches are very short and particularly sensitive to noise.
Unchanged native Map cases also varied between runs.

The mechanism change bounds PICK's lookup values by the number of requested
existing keys, while still consuming every upstream entry before emitting.
The requested-key Set itself uses space proportional to unique requested keys.
This is an inspection of the algorithm, not a measured peak-memory claim.
Returned arrays survive the heap pass, but the temporary lookup does not.
Retained heap therefore cannot measure reduced transient allocation or peak
memory; this run provides no allocation, RSS, or closure-count evidence.

Only one before/after pair is reported, with three samples per pass. An earlier
baseline smoke run also completed but is not pooled into these samples. This was
a shared development workstation, not a controlled benchmark machine. Fixed
case order, JIT/GC effects, process scheduling and thermal/frequency changes
remain confounders. The data does not establish confidence intervals, production
latency, universal speed ratios, or behavior for expensive callbacks and mutable
inputs. Public-behavior tests, rather than timings or heap thresholds, protect
callback execution, late errors, empty requests, special keys and repeatability.
