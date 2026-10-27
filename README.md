# @ilokesto/queryable

Query records with shared Symbol methods, ordered sequences, and optional lazy evaluation.

![Public npm target](https://img.shields.io/badge/status-public_npm_target-555?style=flat)

[한국어](./README.ko.md)

- **Composable queries** for filtering, sorting, mapping, and grouping.
- **Explicit ordering** with sequences that preserve comparator order.
- **Lazy when needed** with short-circuit lookups and no runtime dependencies.

## Local setup

Run inside this repository; cross-repository workspace links are unsupported.

```sh
pnpm install --frozen-lockfile
pnpm build
```

## Quick start

```ts
import { createQueryable, WHERE, SORT, LIMIT, MAP, VALUES } from "@ilokesto/queryable";

const users = createQueryable({
  alice: { name: "Alice", age: 25 },
  bob: { name: "Bob", age: 30 },
  charlie: { name: "Charlie", age: 20 },
});

const names = users
  [WHERE](user => user.age >= 25)
  [SORT]((a, b) => b.age - a.age)
  [LIMIT](2)
  [MAP](user => user.name)
  [VALUES](); // ["Bob", "Alice"]
```

`PICK` selects record keys, not fields inside values. After `SORT`, use `VALUES` or `ENTRIES` to preserve order. Lazy views rerun on each consumption; values remain shallow references.

Records use native object key order. `LAZY` reads the constructed query record
again on each consumption without memoization. Sorting and finite negative limits
may buffer the upstream; grouping materializes immediately.

Use `createShapeQueryable(input, whitelist)` for shallow readonly snapshots of
selected own enumerable keys. For async sources, provide a fresh iterator per
consumption to `createAsyncQuerySequence`, forward its signal to external work,
and release resources in iterator cleanup.

## Further reading

- [Executable migration example](./tests/consumer/migration-example.ts)
- [Operation examples](./tests/consumer/family-examples.ts)
- [Benchmark methodology](./bench/README.md) and [measured results](./bench/RESULTS.md)

<details>
<summary>Development</summary>

Use Node 24 (see `.nvmrc`) and pnpm 10.17.1 from this repository.

```sh
pnpm typecheck
pnpm test
pnpm test:tooling
pnpm bench
```

Main merges maintain a Changesets release PR. Merging that PR publishes only the exact successful Verify artifact; local publishing is forbidden. Configure the shared organization `NPM_TOKEN` with access to this repository. Benchmarks are measurements, not correctness gates; Remeda is a development-only comparison dependency.

</details>

Based on Ayden's [Proxy/prototype memory experiment](https://ayden94.com/posts/memory-cost-proxy-and-prototype).
