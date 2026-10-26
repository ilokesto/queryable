# @ilokesto/queryable

## 0.1.0

### Minor Changes

- feb1fde: Add cooperative AbortSignal propagation, interruptible async waits, and separate finalization and successful-completion hooks.
- 635c744: Add explicit MAP_CONCURRENT with independently bounded callbacks, input prefetch,
  and reserved result capacity. Preserve original keys in ordered or opt-in
  completion order, stop promptly on failure or cancellation, and keep ordinary
  async MAP sequential.
- e40144c: Add an explicit streams subpath with bounded EventTarget/EventEmitter subscriptions and fresh ReadableStream factories, including abort and owned-resource cleanup.
- d68f465: Add per-consumption multi-rule SORT_BY, first-tie MIN_BY/MAX_BY terminals,
  ordered bounded-heap TOP_K, signed NTH_BY positions, and stable keyed RANK_BY.
  Document scalar, numeric-boundary, lazy-evaluation, and memory policies.
- 06b9c42: Add shared CONCAT, ZIP, and FLAT_MAP methods with explicit output identities,
  duplicate-key policies, repeatable lazy consumption, heterogeneous ZIP tuples,
  and deterministic cleanup of nested and sibling iterators.
- fadbc34: Add DISTINCT, DISTINCT_BY, DISTINCT_UNTIL_CHANGED, and DISTINCT_UNTIL_CHANGED_BY
  with SameValueZero/reference equality, first-entry key retention, and fresh
  streaming state for each lazy consumption.
- a142d66: Add explicit async FALLBACK with shared duplicate-key boundaries and finite fresh-factory buffered retry. Preserve cancellation and primary failures, document partial output and repeated side effects, and verify packed consumer exports.
- f48d194: Add thin data-last Symbol adapters, unary terminal helpers, and reusable composition with one to four typed stages. Preserve type guard narrowing, record/sequence transitions, callback timing, and repeatable live lazy evaluation.
- 05aefc8: Add indexed GROUP_JOIN, INNER_JOIN, and LEFT_JOIN with repeatable lazy execution, explicit expanded result keys, and shared duplicate-key policies.
- 0a8c3f1: Add CHUNK, WINDOW, PAIRWISE, SPLIT, and PARTITION_BY with original-entry buffers,
  unique anchor keys, independent lazy consumption, and SameValueZero adjacent grouping.
- 691fe51: Add ESM `operators` and `symbols` subpaths with shared Symbol identity. Operator-only
  consumers no longer load the root DSL at runtime; constructors intentionally retain
  the full shared prototype. Preserve all root exports and functional narrowing.
- eb69ecc: Add Boolean and literal-false predicate narrowing, defined/non-nullish checks, safe predicate negation, and eager string-discriminant GROUP_BY_PROP groups with correlated member types.
- 45380de: Add selector-based SUM, AVERAGE, MIN, MAX, and single-pass STATS terminals, plus COUNT_BY and REDUCE_BY for per-group counts and folds without full group materialization. Preserve shared methods, original callback keys, optional literal group keys, safe special keys, and repeatable live lazy consumption. Document empty results, JavaScript numeric semantics, and per-group accumulator factories in English and Korean.
- da82314: Add separate Promise-normalizing async query sequences with repeatable factories, shared Symbol operations, explicit async iterable views, eager awaited groups, and deterministic iterator cleanup.
- b5860fc: Add shared SKIP, TAKE_WHILE, DROP_WHILE, TAKE_LAST, and DROP_LAST Symbol operations with key-preserving eager and lazy behavior, type guard narrowing for TAKE_WHILE, and bounded finite tail buffers.
- 750b615: Add native Map-key grouping and fresh Map, Set, and key collection terminals.
- 883f76a: Add repeatable entry-source query sequences, explicit entry/value iterable views, and duplicate-key policies with typed collision errors.
- 1367ed4: Add shared LAST, AT, SINGLE, EVERY, IS_EMPTY, INCLUDES, FIND_ENTRY, FIRST_OR, and FIRST_OR_ELSE terminal methods for records and sequences, with presence-aware defaults and type guard narrowing.
- 4199508: Add lazy BFS and DFS hierarchy traversal with explicit child and result keys,
  root/path/depth context, optional visit identity and maximum depth, and shared
  duplicate-key policies.
- 15f882b: Add opt-in readonly shape snapshots with explicit key domains, correlated
  heterogeneous entries, optional-presence PICK, and safe MAP/WHERE transformations.
  Keep mutable Queryable behavior unchanged and freeze only snapshot-owned shallow
  containers, never caller objects or nested values.
- 734224d: Add key-preserving DIFFERENCE, INTERSECTION, and UNION with explicit selectors,
  first-entry set equality, repeatable lazy membership, and shared output key
  collision policies.
- 700dea5: Add eager PARTITION snapshots, factory-seeded keyed SCAN, identity-preserving TAP,
  array-free EACH, and exact-query THROUGH with shared Symbol methods and documented
  eager/lazy consumption contracts.

### Patch Changes

- 9a402d7: Fuse adjacent lazy WHERE and MAP stages while preserving callback order,
  original keys, repeatable live consumption, early cleanup, and buffering boundaries.
  Keep direct iteration for zero-stage views and direct generators for one-stage chains.
- 02e5d0c: Require Node.js 24.22.1 or newer and use the security-patched 24.22.1 release for development and CI.
- 13926b0: Read COUNT and FIRST directly from materialized sequence entries, and buffer only requested sequence PICK keys while preserving full upstream evaluation and requested output order.
