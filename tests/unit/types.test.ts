import { expectTypeOf, it } from "vitest";
import {
  COUNT, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP, PICK, REDUCE,
  SOME, SORT, TO_OBJECT, VALUES, WHERE, createQueryable,
} from "../../src/index.js";
import type { Queryable, QuerySequence } from "../../src/index.js";

it("WHERE and FIND: inferred guards and boolean predicates -> preserve narrowing by mode", () => {
  const record = createQueryable<string | number | undefined>({ a: "one", b: 2, c: undefined });
  const ordered = record[SORT](() => 0);
  const lazy = record[LAZY]();

  expectTypeOf(record[WHERE](value => typeof value === "string")).toEqualTypeOf<Queryable<string>>();
  expectTypeOf(ordered[WHERE](value => typeof value === "number")).toEqualTypeOf<QuerySequence<number>>();
  expectTypeOf(lazy[WHERE](value => value !== undefined)).toEqualTypeOf<QuerySequence<string | number>>();
  for (const query of [record, ordered, lazy]) {
    expectTypeOf(query[FIND](value => typeof value === "string")).toEqualTypeOf<string | undefined>();
    expectTypeOf(query[FIND]((value): boolean => typeof value === "string"))
      .toEqualTypeOf<string | number | undefined>();
    expectTypeOf(query[FIRST]()).toEqualTypeOf<string | number | undefined>();
    expectTypeOf(query[SOME](value => value === undefined)).toEqualTypeOf<boolean>();
  }
  expectTypeOf(record[WHERE]((value): boolean => typeof value === "string"))
    .toEqualTypeOf<Queryable<string | number | undefined>>();
});

it("createQueryable and GROUP_BY: readonly literals -> retain value and optional group types", () => {
  const input = { first: { kind: "yes", amount: 1 }, second: { kind: "no", amount: 2 } } as const;
  type Value = (typeof input)[keyof typeof input];
  const record = createQueryable(input);

  expectTypeOf(record).toEqualTypeOf<Queryable<Value>>();
  expectTypeOf(record[MAP](value => value.kind)).toEqualTypeOf<Queryable<"yes" | "no">>();
  expectTypeOf(record[WHERE](value => value.kind === "yes")).toEqualTypeOf<Queryable<typeof input.first>>();
  expectTypeOf(record[GROUP_BY](value => value.kind))
    .toEqualTypeOf<Partial<Record<"yes" | "no", Queryable<Value>>>>();
  expectTypeOf(record[LAZY]()[GROUP_BY](value => value.kind).yes)
    .toEqualTypeOf<QuerySequence<Value> | undefined>();
  expectTypeOf(record[SORT](() => 0)[GROUP_BY](value => value.kind))
    .toEqualTypeOf<Partial<Record<"yes" | "no", QuerySequence<Value>>>>();
  expectTypeOf(createQueryable({ a: "on", b: "off" } as const))
    .toEqualTypeOf<Queryable<"on" | "off">>();
});

it("operations: record and sequence chains -> retain mode until SORT or LAZY", () => {
  const record = createQueryable({ a: 1, b: 2 });
  const retained = record[WHERE](n => n > 0)[MAP](String)[PICK]("a")[LIMIT](1);
  const sorted = retained[SORT]((a, b) => a.localeCompare(b));
  const lazy = retained[LAZY]();

  expectTypeOf(retained).toEqualTypeOf<Queryable<string>>();
  expectTypeOf(sorted).toEqualTypeOf<QuerySequence<string>>();
  expectTypeOf(lazy).toEqualTypeOf<QuerySequence<string>>();
  for (const sequence of [sorted, lazy]) {
    expectTypeOf(sequence[WHERE](value => value.length > 0)[MAP](Number)[PICK]("a")[LIMIT](-1))
      .toEqualTypeOf<QuerySequence<number>>();
    expectTypeOf(sequence[SORT](() => 0)[LAZY]()).toEqualTypeOf<QuerySequence<string>>();
    expectTypeOf(sequence[ENTRIES]()).toEqualTypeOf<[string, string][]>();
    expectTypeOf(sequence[TO_OBJECT]()).toEqualTypeOf<Record<string, string>>();
    expectTypeOf(sequence[VALUES]()).toEqualTypeOf<string[]>();
    expectTypeOf(sequence[COUNT]()).toEqualTypeOf<number>();
  }
});

it("REDUCE and receivers: explicit accumulator and bound methods -> retain callback contracts", () => {
  const record = createQueryable({ a: 1 });
  const initial: { total: number; keys: string[] } = { total: 0, keys: [] };

  for (const query of [record, record[SORT](() => 0), record[LAZY]()]) {
    const result = query[REDUCE]((accumulator, value, key) => {
      expectTypeOf(accumulator).toEqualTypeOf<typeof initial>();
      expectTypeOf(value).toEqualTypeOf<number>();
      expectTypeOf(key).toEqualTypeOf<string>();
      return { total: accumulator.total + value, keys: [...accumulator.keys, key] };
    }, initial);
    expectTypeOf(result).toEqualTypeOf<typeof initial>();
    expectTypeOf(query[VALUES].call(query)).toEqualTypeOf<number[]>();
    expectTypeOf(query[FIRST].bind(query)()).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[COUNT].call(query)).toEqualTypeOf<number>();
    expectTypeOf<ThisParameterType<(typeof query)[typeof VALUES]>>().not.toEqualTypeOf<void>();
  }
  expectTypeOf<ThisParameterType<(typeof record)[typeof MAP]>>().toEqualTypeOf<Queryable<number>>();
  expectTypeOf<ThisParameterType<(typeof record)[typeof LIMIT]>>().toEqualTypeOf<Queryable<number>>();
  const sequence = record[LAZY]();
  expectTypeOf<ThisParameterType<(typeof sequence)[typeof MAP]>>().toEqualTypeOf<QuerySequence<number>>();
  expectTypeOf<ThisParameterType<(typeof sequence)[typeof LIMIT]>>().toEqualTypeOf<QuerySequence<number>>();
});
