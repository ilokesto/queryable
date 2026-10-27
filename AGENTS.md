# @ilokesto/queryable

Public npm release target based on shared Symbol-keyed prototype methods.
This is a standalone repository. Do not use monorepo filters or refer to
sibling checkout paths.

- Keep version `0.0.1` and public npm access. Consumer-facing changes require a
  root Changeset; release-automation setup alone does not bump the version.
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
  sibling workspace dependencies, an npm runtime alias, or documentation deployment.
- Run from this repository with Node 24 (`.nvmrc`) and pnpm 10.17.1:
  `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`,
  `pnpm test`, and the four `pnpm docs:*` quality
  commands.
- `pnpm release:verify --sha <full-SHA>` is read-only. Main merges maintain a
  Changesets release PR; merging it publishes only the exact successful Verify
  artifact through GitHub Actions. Never publish locally.
- `NPM_TOKEN` may come from the ilokesto organization Actions secret with access
  granted to this repository. Do not override it with a different repository or
  Production environment secret.
- Preserve archived Git refs, source manifest, existing public API, version, and all
  original tests. No persistence or unrelated runtime API changes.

## Additive roadmap contracts

- Explicitly authorized roadmap work may add public APIs; the existing public
  API and all original tests remain compatibility requirements. The restriction
  above still excludes unrelated runtime API changes and persistence.
- New APIs must use shared Symbol-keyed methods with zero runtime dependencies.
  Specify empty-input behavior, distinguish stored `undefined` from absence,
  preserve special keys as data and stable ties, and document callback arguments
  and execution order. Existing callbacks receive `(value, originalKey)`,
  comparators receive `(leftValue, rightValue)`, and reducers receive
  `(accumulator, value, originalKey)`.
- Existing empty terminals return `0` for COUNT, `undefined` for FIRST/FIND,
  `false` for SOME, fresh empty containers for VALUES/ENTRIES/TO_OBJECT, and the
  initial accumulator for REDUCE, without invoking callbacks. PICK ignores absent
  and duplicate keys but retains stored `undefined`; SORT preserves ties.
- Contract-foundation work adds tests and policy only, not runtime APIs. Protect
  eager, ordered, and lazy composition, callback order and thrown-value identity,
  buffering boundaries, opaque values, and independent repeat/reentrant consumption
  through public methods rather than private implementation details.
- Use deterministic bounded cases and native-operation differential oracles.
  Test/policy-only work uses an empty Changeset and does not bump `0.0.1`.
