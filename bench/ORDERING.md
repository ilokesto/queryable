# Ordering measurements

Measured on 2026-10-26, Apple M4 Pro, macOS arm64, Node 24.22.1,
pnpm 10.17.1. Run independently from correctness tests:

```sh
pnpm build
node bench/ordering.mjs
```

The script uses deterministic permuted integer values, one warm-up followed by
five timed calls per case, and reports median milliseconds. Every timed call
includes result extraction. SORT and SORT_BY materialize N values before
slicing to K; TOP_K materializes only its K winners. All three return identical
ordering keys. The expensive selector executes 100 integer hash rounds and
updates an observable checksum; it returns the original key. Runs share a
process, run in the printed order, and do not force GC or isolate thermal/JIT
effects. These are observations, not portable speed guarantees.

| N | K | Selector | SORT ms | SORT_BY ms | TOP_K ms |
| --- | --- | --- | --- | --- | --- |
| 1000 | 1 | identity | 0.205 | 0.585 | 0.111 |
| 1000 | 1 | 100 hash rounds | 1.234 | 0.350 | 0.187 |
| 1000 | 100 | identity | 0.131 | 0.254 | 0.222 |
| 1000 | 100 | 100 hash rounds | 1.233 | 0.550 | 0.227 |
| 1000 | 1000 | identity | 0.132 | 0.204 | 0.336 |
| 1000 | 1000 | 100 hash rounds | 1.234 | 0.341 | 0.383 |
| 10000 | 1 | identity | 2.347 | 5.775 | 1.641 |
| 10000 | 1 | 100 hash rounds | 17.654 | 4.603 | 2.945 |
| 10000 | 1000 | identity | 2.271 | 2.966 | 2.259 |
| 10000 | 1000 | 100 hash rounds | 17.382 | 4.250 | 3.436 |
| 10000 | 10000 | identity | 2.093 | 2.785 | 3.843 |
| 10000 | 10000 | 100 hash rounds | 17.544 | 4.187 | 5.078 |

Selector calls per consumption, independent of K and selector cost in this run:

| N | SORT (both comparator operands) | SORT_BY | TOP_K |
| --- | --- | --- | --- |
| 1000 | 17050 | 1000 | 1000 |
| 10000 | 239932 | 10000 | 10000 |

Caching reduced selector work here but added decoration and key-array work:
SORT_BY was slower than SORT with identity selectors in every measured case.
TOP_K helped for small K but cost more than SORT_BY at K=N. No operation is
silently rewritten to another implementation.

Memory trade-off (algorithmic retained workspace, not measured peak heap):
SORT stores N entry references without selector keys; SORT_BY decorates N
entries with R cached keys, then sorts the decorations. TOP_K decorates each
visited entry but retains at most min(K,N) candidates and their R keys, then
sorts that heap. Rejected candidate allocations still create GC pressure.
MIN_BY/MAX_BY retain one candidate with R keys. NTH_BY retains at most
min(index+1,N) candidates for positive positions or min(abs(index),N) for
negative positions. RANK_BY caches all N entries to evaluate selectors once
while finding the target and counting predecessors, but does not sort.
Transient allocation, returned arrays, input storage, and GC are additional
costs; this report makes no measured-byte or peak-heap claim.

No timing, heap, or probability thresholds belong to the correctness suite.
