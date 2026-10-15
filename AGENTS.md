# @ilokesto/queryable

Private beta record-query DSL based on shared Symbol-keyed prototype methods.

- Keep version `0.0.1` and `private: true` until the user explicitly requests a release.
- Do not register this package in the publisher or public documentation site.
- Keep runtime dependencies empty and preserve shared methods across query chains.
- `PICK` selects record keys, not fields within each value; `SELECT` was removed.
- Records use native object ordering; `SORT` returns a sequence preserving comparator order.
- `LAZY` is a live, repeatable view without memoization. Terminal calls execute pending work.
- Groups materialize eagerly; sorting, sequence PICK, and finite negative LIMIT need buffering.
- Keep benchmarks separate from correctness tests; never assert timing or heap thresholds.
- Document public exports with examples; test behavior in `src/index.test.ts`.
- Run `pnpm --filter @ilokesto/queryable typecheck`, `test`, and `build`.
- Read the root handbook and the `ilokesto-onboarding` skill before changes.
