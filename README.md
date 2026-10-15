# @ilokesto/queryable

**0.0.1 · Private beta.** A record query DSL with shared Symbol-keyed methods, ordered sequences, and opt-in lazy evaluation. No runtime dependencies.

This package is local to the pnpm workspace (`private: true`). It is not registered in the npm publisher or the public documentation site. No package has been published. To consume it from another workspace package, add `"@ilokesto/queryable": "workspace:*"` to that package's dependencies and build it.

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

| Operation | Result |
| --- | --- |
| `[WHERE]((value, key) => boolean)` | Matching records; type guards narrow the value type |
| `[SORT]((a, b) => number)` | Stable ordered `QuerySequence`, including numeric keys |
| `[MAP]((value, key) => next)` | Transformed values with original record keys |
| `[PICK](...keys)` | Whole values for existing **record keys**; missing/duplicate keys ignored |
| `[LIMIT](n)` | Entries selected by `slice(0, n)` |
| `[GROUP_BY]((value, key) => K)` | Materialized groups; `Partial<Record<K, ...>>` preserves literal keys |
| `[COUNT]()` | Number of records |
| `[FIRST]()` | First value or `undefined` |
| `[VALUES]()` | Fresh value array |
| `[FIND]((value, key) => boolean)` | First matching value, with type guard narrowing, or `undefined` |
| `[SOME]((value, key) => boolean)` | Boolean; stops on the first match |
| `[ENTRIES]()` | Fresh `[key, value]` tuples in query order |
| `[TO_OBJECT]()` | Ordinary shallow object, without query methods |
| `[REDUCE]((acc, value, key) => next, initial)` | Fold in query order; initial is required |
| `[LAZY]()` | Repeatable, non-memoized deferred sequence |

## Records, ordering, and migration

`createQueryable` returns a mutable `Queryable<T>` record. Its eager `WHERE`, `MAP`, `PICK`, and `LIMIT` return new records. `SORT` returns `QuerySequence<T>`: ordered entries rather than a record whose numeric keys could reorder themselves. Subsequent transformations keep the sequence representation. Use `VALUES` or `ENTRIES` to preserve order; `TO_OBJECT` intentionally restores native object key ordering. Do not use record indexing, object spread, or JSON on sequences to extract their data.

```ts
import { createQueryable, SORT, LIMIT, ENTRIES, TO_OBJECT } from "@ilokesto/queryable";

const sorted = createQueryable({ 1: 10, 2: 20 })[SORT]((a, b) => b - a);
sorted[LIMIT](1)[ENTRIES](); // [["2", 20]]
sorted[TO_OBJECT](); // ordinary object; numeric keys enumerate as "1", "2"
```

This private beta intentionally removes `SELECT`: rename imports and calls to `PICK`. It still selects **record keys**, not fields inside values. Use `MAP(user => ({ name: user.name }))` for field projection. Record `PICK` uses argument insertion order subject to native numeric-key ordering; sequence `PICK` preserves argument order exactly.

## Lazy evaluation and short-circuiting

```ts
import { createQueryable, LAZY, WHERE, MAP, LIMIT, VALUES } from "@ilokesto/queryable";

const query = createQueryable({ a: 1, b: 2, c: 3, d: 4 });
const firstEven = query[LAZY]()
  [WHERE](n => n % 2 === 0)
  [MAP](n => n * 10)
  [LIMIT](1);
firstEven[VALUES](); // [20]; only a and b reach the predicate
```

- Eager queries run callbacks when an operation is called. `LAZY` defers subsequent `WHERE`, `MAP`, `PICK`, `LIMIT`, and `SORT` until a terminal call.
- `VALUES`, `ENTRIES`, `TO_OBJECT`, `COUNT`, `REDUCE`, `FIRST`, `FIND`, `SOME`, and `GROUP_BY` consume pending work. `FIRST`, `FIND`, `SOME`, and nonnegative `LIMIT` can stop upstream iteration early; `LIMIT(0)` never consumes the source.
- `SORT`, sequence `PICK`, and finite negative `LIMIT` need the full upstream input. They buffer on consumption. `GROUP_BY` always executes immediately and returns eager snapshot groups: records for record queries, sequences for sequence queries.
- Each consumption starts fresh and reruns deferred callbacks. There is no cache. Errors propagate at consumption, and another consumption starts a fresh attempt.
- A record's lazy view reads that **query record** at consumption, so mutations between consumptions are visible. Changes to the original input object are not: construction already shallow-copied it. An eager sorted sequence is a snapshot; adding `LAZY` afterward does not rerun its already executed sort.
- Values are shallow references, not deeply frozen. Callbacks should not add, delete, or replace source records during a traversal; mutation during traversal is not a snapshot-isolation contract.

For a single lookup, prefer `query[FIND](predicate)` or `query[SOME](predicate)`. `query[WHERE](predicate)[FIRST]()` still eagerly builds the entire filtered record.

## Types and aggregation

```ts
import { createQueryable, WHERE, GROUP_BY, REDUCE } from "@ilokesto/queryable";

const mixed = createQueryable<number | string>({ a: 1, b: "two" });
const strings = mixed[WHERE]((value): value is string => typeof value === "string");
// Queryable<string>
const groups = createQueryable({ a: 1, b: 2, c: 3 })
  [GROUP_BY](n => n % 2 ? "odd" : "even");
const oddTotal = groups.odd?.[REDUCE]((sum, n) => sum + n, 0); // 4
// A possible group key may be absent, including for empty input.
```

## Contract and limitations

- Own enumerable string keys are data. Inherited, non-enumerable, and Symbol-keyed input properties are not copied. `__proto__`, `constructor`, and `toString` are supported as ordinary data keys; the shared prototype has a null root.
- Construction and query operations make shallow copies. Values remain shared references. Queries are mutable records, but operations do not mutate their source.
- `LIMIT` retains native `slice` semantics: negative numbers drop trailing entries, fractions truncate, `NaN` gives an empty result, and `Infinity` keeps all entries.
- Methods need their receiver: call `query[WHERE](predicate)`, not a detached method. Object spread and JSON on records retain data but lose query methods.
- Methods are shared and frozen, not bound per instance. This is a structural allocation choice, not a promise of a particular heap reduction or runtime speed.

## Development

```sh
pnpm --filter @ilokesto/queryable typecheck
pnpm --filter @ilokesto/queryable test
pnpm --filter @ilokesto/queryable build
pnpm --filter @ilokesto/queryable bench
```

Based on Ayden's [Proxy/prototype memory experiment](https://ayden94.com/posts/memory-cost-proxy-and-prototype), specifically its final implementation. The beta adds safe special keys, ordered sequences, explicit receiver types, short-circuiting, and regression tests.

See [benchmark methodology](./bench/README.md) and [measured results](./bench/RESULTS.md). Remeda is a development-only comparison dependency.

[한국어](./README.ko.md)
