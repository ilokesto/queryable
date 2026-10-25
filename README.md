# @ilokesto/queryable

Query records with shared Symbol methods, ordered sequences, and optional lazy evaluation.

![Private beta](https://img.shields.io/badge/status-private_beta-555?style=flat)

[Docs](./docs/index.mdx) | [API](./docs/index.mdx#operations) | [한국어](./README.ko.md)

- **Composable queries** for filtering, sorting, mapping, and grouping.
- **Explicit ordering** with sequences that preserve comparator order.
- **Lazy when needed** with short-circuit lookups and no runtime dependencies.

## Local setup

**Private beta 0.0.1 — not published to npm.** Run inside this repository; cross-repository workspace links are unsupported. The local documentation site covers `next` only.

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

## Further reading

- [Operations and contracts](./docs/index.mdx#operations)
- [Ordering and migration](./docs/index.mdx#records-ordering-and-migration)
- [Lazy evaluation](./docs/index.mdx#lazy-evaluation-and-short-circuiting)
- [Benchmark methodology](./bench/README.md) and [measured results](./bench/RESULTS.md)

<details>
<summary>Development</summary>

Use Node 22 and pnpm 10.17.1 from this repository.

```sh
pnpm typecheck
pnpm test
pnpm test:tooling
pnpm migrate:verify
pnpm docs:publication:verify
pnpm docs:typecheck
pnpm docs:build
pnpm docs:test
pnpm bench
```

Publishing remains disabled. Benchmarks are measurements, not correctness gates; Remeda is a development-only comparison dependency.

</details>

Based on Ayden's [Proxy/prototype memory experiment](https://ayden94.com/posts/memory-cost-proxy-and-prototype).
