# Local benchmark results

Measured on **2026-10-15** using the final implementation in this working tree.
The complete machine metadata, raw samples, checksums, and counters are preserved
in [results.json](./results.json). This is one local run, not a cross-runtime
performance guarantee.

```sh
pnpm --filter @ilokesto/queryable bench
```

Environment: Apple M2 Max, arm64, Darwin 27.2.0, 32 GiB RAM; Node v26.7.0,
V8 14.6.202.34-node.28; Remeda 2.51.0. Each case ran in a fresh sequential
`node --expose-gc` child. Defaults: 5,000 records, 5,000 four-entry instances,
10 queries per batch, 2 warmup batches, 5 timing and 5 separate heap samples.
Overall benchmark elapsed time was 2,108.87 ms, excluding the preceding build.
All 12 cases validated their outputs before measuring.

## Retained instance construction

| Implementation | Median microseconds / instance | Retained bytes / instance |
| --- | ---: | ---: |
| Original article Proxy | 0.0320 | 128.0 |
| Previous Object.entries prototype | 0.1697 | 56.0 |
| Current eager prototype | 0.0795 | 56.0 |

The current constructor avoids constructing entry tuples or an intermediate
entries array. It took less time than the previous prototype in this run, but
the Proxy constructor was faster. Ownership differs: Proxy references the
already-live input, while prototype construction shallow-copies its outer data.
Native JavaScript and Remeda have no comparable DSL wrapper constructor.

For 1,000 instances, retaining one WHERE and one VALUES lookup per instance
yielded 2,000 distinct Proxy function objects versus 2 shared functions for each
prototype implementation. This counts the two observed methods, not all
functions in the heap. The identity probe runs outside timing and heap samples.

## Full filtering: 5,000 input records, 2,500 returned values

| Implementation | Median microseconds / query | Retained bytes / result |
| --- | ---: | ---: |
| Original article Proxy | 1,314.86 | 20,049.6 |
| Previous Object.entries prototype | 1,188.05 | 20,042.4 |
| Current eager prototype | 981.32 | 26,609.6 |
| Native Object.values + filter | 698.96 | 23,596.8 |
| Remeda Object.values + filter | 691.70 | 23,596.8 |

Every case invoked the predicate 5,000 times. Current eager filtering improved
on the prior prototype's timing here, but native JavaScript and Remeda were
faster, and current eager retained more result heap than either prototype
baseline. Removing whole intermediate entries arrays does **not** establish a
universal heap improvement. Post-GC result retention is not total allocation.

## Filter, map, and first five matches

| Implementation | Median microseconds / query | Predicate calls | Mapper calls | Retained bytes / result |
| --- | ---: | ---: | ---: | ---: |
| Current eager | 1,225.21 | 5,000 | 2,500 | 256.8 |
| Current lazy | 271.96 | 10 | 5 | 255.2 |
| Native early-exit loop | 274.46 | 10 | 5 | 184.0 |
| Remeda Object.values + pipe | 636.82 | 10 | 5 | 180.8 |

Lazy evaluation avoided all but the required callbacks in this workload and
took roughly 4.5 times less time than the current eager pipeline. Its timing
was close to the native early-exit loop; the small difference is not evidence
of superiority. Remeda also short-circuited its callbacks, but this record-based
comparison includes its initial full Object.values conversion.

Callback counters come from a separate correctness probe, not instrumentation
inside timed runs. For-in key enumeration can still have engine-level costs
even when only ten values reach the predicate.

## Limits

- These measurements cover deterministic, non-integer-keyed plain records,
  shallow values, and simple callbacks. They do not measure sorting, grouping,
  accessors, mutations, deep data, or other engines.
- GC/JIT and thermal state can change results. The child order is fixed and
  disclosed in results.json. Repeat complete runs before making performance claims.
- Heap numbers measure retained managed-heap deltas after explicit GC, not total
  allocations, peak memory, RSS, or temporary-object counts. Small deltas are noisy.
- The suite asserts result equivalence, not timing or memory thresholds.
- Package checks passed: 92 runtime/type-contract tests, TypeScript checks,
  build, built-package import smoke, and 60 related CI/release contract tests.
  LSP diagnostics were unavailable locally; TypeScript CLI checks were used.

See [README.md](./README.md) for the complete methodology and configurable sizes.
