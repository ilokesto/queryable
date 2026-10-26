# Bounded async mapping: issue #38

Measured on 2026-10-26 with Node v24.22.1, pnpm 10.17.1, macOS arm64,
Apple M4 Pro. The checkout is based on `7d5cffb3a6f538910fda1abc9e7f469588109680`
(main `a6869d0` plus the existing async lifetime work). No runtime dependency was
added; the package remains version `0.0.1`.

## Reproduce

```sh
pnpm build
node --expose-gc bench/async-concurrency.mjs
```

The script prints all observations as JSON. Each configuration gets one warmup
and five measured runs over 256 entries; the table uses the median elapsed run.
Async work is a controlled event-loop workload, not network latency or CPU
parallelism: each mapper awaits one `setImmediate`, except the slow-head workload
where the first mapper awaits 64. The slow-consumer workload awaits two additional
`setImmediate` events after each emitted value. No sleeps or elapsed-time
thresholds appear in correctness tests. Benchmark integrity checks only count
and checksum.

`C`, `P`, and `R` mean concurrency, prefetch, and reorderBuffer. `P` counts queued
unmapped inputs plus the pending upstream pull. `R` excludes the single
head/delivery reservation. Sequential MAP is the unchanged baseline.

| Configuration | Uniform async median ms | Slow head median ms | Slow consumer median ms |
| --- | ---: | ---: | ---: |
| Sequential MAP | 3.909 | 4.454 | 10.296 |
| Ordered C8 P1 R2 | 2.408 | 3.042 | 8.864 |
| Ordered C8 P1 R7 | 1.748 | 2.457 | 8.161 |
| Ordered C8 P4 R31 | 1.546 | 2.372 | 8.193 |
| Unordered C8 P1 R7 | 1.576 | 2.048 | 8.049 |

## Slow-head observations

These counters are taken at source pulls, mapper starts/completions, and consumer
delivery. Read-ahead is pulled entries minus consumed entries. Completed backlog
is completed callbacks minus consumed entries, including the head/delivery slot.

| Configuration | Peak running | Peak unmapped inputs | Peak read-ahead | Peak completed backlog | Work completed before head | Elapsed min-max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sequential MAP | 1 | 1 | 1 | 1 | 0 | 4.415-4.569 |
| Ordered C8 P1 R2 | 3 | 1 | 4 | 3 | 2 | 2.981-3.285 |
| Ordered C8 P1 R7 | 8 | 1 | 9 | 8 | 7 | 2.439-2.725 |
| Ordered C8 P4 R31 | 8 | 4 | 36 | 32 | 31 | 2.246-2.560 |
| Unordered C8 P1 R7 | 8 | 1 | 9 | 1 | 255 | 2.017-2.056 |

The JSON field `peakCompletedBehindHead` records cumulative work completed while
the first mapper is pending. **It is not retained memory in unordered mode**:
those 255 results were emitted as they completed, while completed backlog peaked
at one. In ordered mode they cannot pass the head, so that counter reaches R,
and backlog reaches R + 1 when the head completes.

R2 permits only three running callbacks despite C8. R7 permits eight. Increasing
the result budget to R31 allowed 31 later completions before the head, at the cost
of peak read-ahead increasing from nine to 36 entries. This is the intended
utilization versus bounded-retention tradeoff, not a worker-count memory claim.
With the slow consumer, completed backlog peaked at two for R2 and seven for the
other concurrent configurations; the scheduler did not refill without demand.
The larger P4/R31 configuration did not improve the slow-consumer median over
P1/R7 in this sample.

Heap deltas are also emitted, but they include allocations and GC timing, not
retained scheduler memory. For the slow-head median samples they were 141,632,
1,148,464, 1,095,800, 1,032,984, and 1,076,168 bytes in table order. They are not
capacity proofs or thresholds. These short synthetic timings do not predict
network workloads, CPU-heavy callbacks, different machines, or production
throughput; no general speedup is claimed.

## Invariant argument and policy

Before a mapper starts it occupies a task reservation. Reservations are released
only on emission or stop, never on completion alone. The launch condition is
`running < C && tasks.size <= R`, making running at most C and reservations at
most R + 1 even if every callback finishes behind a permanently blocked head.
Ordered head-of-line backlog is therefore at most R. Unordered completion queue
capacity is at most R + 1 including the delivery slot.

A single upstream pull starts only when no other pull is pending and
`inputs.length < P`. Its settlement exchanges that pending slot for one queued
entry, and launching a mapper removes one queued entry. Thus queued inputs plus
pending pull never exceed P. Combined scheduler ownership is bounded by
P + R + 1 entry/pull slots, independent of total source length. This excludes
upstream duplicate tracking, source buffering, user-owned work and terminal
collections; byte sizes are not bounded.

One exact state-change promise is resolved on pull settlement, mapper settlement,
or configured abort. The driver checks ready output before scheduling and does
not await a fill-window loop. A hung next pull cannot block a ready output.
Callbacks launch in input order; ordered is the default, while unordered emits
observed completion order with original keys unchanged.

The first observed error, including a thrown `undefined`, stops scheduling and
starts upstream return once, even if the consumer is paused. Every launched
promise has fulfillment and rejection handlers. The child signal is aborted on
stop; configured abort is forwarded, but the parent controller is never aborted
by this stage. A pending pull or mapper cannot keep an early result/error waiting:
upstream return is observed but detached when a pull is pending or on error/abort.
Otherwise cleanup is awaited. An upstream async generator can still defer its
underlying cleanup behind non-cooperative work. Existing factory/callback signal
identity is preserved, so this deliberately does not retrofit a new lifetime
signal through the earlier pipeline.

The public async-generator views serialize protocol calls. An explicit
`return()` queued while a consumer `next()` is pending cannot interrupt that
pending request; use the configured AbortSignal. Early break/FIRST after a ready
result do not have that restriction, even when sibling work or another upstream
pull is pending.

## Evidence and source comparison

`src/concurrency.test.ts` uses controlled promises and exact start, completion,
pull, and close events. It checks independent budgets, blocked heads,
out-of-order readiness, paused consumers, pending extra pulls, early break,
source and mapper failures, late rejections, abort reasons, shared methods,
independent repeated consumption, original keys and existing sequential MAP.
The packed fixture is imported by `tests/consumer/consumer.ts`, forwarded through
the emitted declarations in `downstream.ts`, and actually executed by
`runtime.mjs` through the existing `tests/tooling/package-consumer.test.mjs`.

Design references were read at the issue's pinned FxTS revision
`d7b614ea54a3bdb16e602359d53ea4bace1a97dd`: `src/Lazy/concurrent.ts`,
`src/Lazy/concurrentPool.ts`, and `test/Lazy/concurrentPool.spec.ts`.
Their demand/worker separation and pending-fetch regression informed the cases.
The pool intentionally keeps workers saturated while a consumer waits, allowing
ordered completed results to accumulate behind a slow head; that worker limit
alone is not the independent reorder-capacity contract required here. This
implementation reserves result capacity before launch instead, and starts
explicit mapper promises rather than claiming multiple synchronous source
`next()` calls are parallel callbacks. No external implementation was copied and
no FxTS runtime dependency was introduced.
