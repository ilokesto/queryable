# @ilokesto/queryable

Private beta record-query DSL based on shared Symbol-keyed prototype methods.
This is a standalone repository. Do not use monorepo filters or refer to
sibling checkout paths.

- Keep version `0.0.1` and `private: true`. Do not publish or promote it.
- Keep runtime dependencies empty and preserve shared methods across query chains.
- `PICK` selects record keys, not fields within each value; `SELECT` was removed.
- Records use native object ordering; `SORT` returns a sequence preserving comparator order.
- `LAZY` is a live, repeatable view without memoization. Terminal calls execute pending work.
- Groups materialize eagerly; sorting, sequence PICK, and finite negative LIMIT need buffering.
- Keep benchmarks separate from correctness tests; never assert timing or heap thresholds.
- Canonical bilingual content remains in `docs/`. `website/` is a private
  authoring-only renderer of those files, not a second editable content tree.
- Only `/en/queryable/next` and `/ko/queryable/next` are documentation routes.
  Do not create released/public Queryable discovery, receipts, or versioned
  examples.
- The website may depend on registry documentation tooling only. Do not add
  sibling workspace dependencies, an npm runtime alias, or a publish workflow.
- Run from this repository with Node 22 and pnpm 10.17.1:
  `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`,
  `pnpm test`, `pnpm migrate:verify`, and the four `pnpm docs:*` quality
  commands.
- `pnpm release:verify --sha <full-SHA>` must reject this private package
  before remote lookup.
- Preserve archived Git refs, source manifest, public API, version, and all
  original tests. No persistence or runtime API changes.
