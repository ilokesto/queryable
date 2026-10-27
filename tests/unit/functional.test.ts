import { expect, expectTypeOf, it } from "vitest";
import {
  ENTRIES, LAZY, LIMIT, MAP, PICK, SORT, VALUES, WHERE,
  compose, count, createQueryable, createQuerySequence, entries, find, first,
  lazy, limit, map, pick, pipe, reduce, some, sort, toObject, values, where,
} from "../../src/index.js";
import type { Queryable, QuerySequence } from "../../src/index.js";

it("predicate adapters: Boolean and literal false -> match core narrowing in every mode", () => {
  const source = createQueryable<0 | false | "" | "yes" | null | undefined>({
    a: 0, b: false, c: "", d: "yes", e: null, f: undefined,
  });
  const truthyRecord = pipe(source, where(Boolean));
  const truthySequence = pipe(source, lazy, where(Boolean));
  const emptyRecord = pipe(source, where(() => false));

  expectTypeOf(truthyRecord).toEqualTypeOf<Queryable<"yes">>();
  expectTypeOf(truthySequence).toEqualTypeOf<QuerySequence<"yes">>();
  expectTypeOf(emptyRecord).toEqualTypeOf<Queryable<never>>();
  expectTypeOf(pipe(source, find(Boolean))).toEqualTypeOf<"yes" | undefined>();
  expectTypeOf(pipe(source, find(() => false))).toEqualTypeOf<undefined>();
  expect(values(truthyRecord)).toEqual(["yes"]);
  expect(values(truthySequence)).toEqual(["yes"]);
  expect(values(emptyRecord)).toEqual([]);
});

it("adapters: record and sequence paths -> match direct keys, values, mode and traces", () => {
  const query = createQueryable({ 2: 2, 1: 1, a: 3, b: 4 });
  for (const source of [query, query[SORT]((a, b) => b - a), query[LAZY]()]) {
    const directTrace: string[] = [];
    const adapterTrace: string[] = [];
    const predicate = (trace: string[]) => (value: number, key: string) => {
      trace.push(`where:${key}:${value}`);
      return value > 1;
    };
    const mapper = (trace: string[]) => (value: number, key: string) => {
      trace.push(`map:${key}:${value}`);
      return value * 10;
    };
    const direct = source[WHERE](predicate(directTrace))[MAP](mapper(directTrace))
      [PICK]("b", "2", "a", "b", "missing")[LIMIT](-1);

    const adapted = pipe(source, where(predicate(adapterTrace)), map(mapper(adapterTrace)),
      compose<QuerySequence<number>>()(pick("b", "2", "a", "b", "missing"), limit(-1)));

    expect(entries(adapted)).toEqual(direct[ENTRIES]());
    expect(adapterTrace).toEqual(directTrace);
    expect(Object.getPrototypeOf(adapted)).toBe(Object.getPrototypeOf(direct));
    expect(adapted[MAP]).toBe(direct[MAP]);
    expect(Object.getOwnPropertySymbols(adapted)).toEqual([]);
  }
});

it("pipe: narrowed values and native unary stages -> retain record and sequence types", () => {
  const source = createQueryable<string | number>({ a: "one", b: 2 });
  const strings = where((value: string | number) => typeof value === "string");
  const lengths = map((value: string) => value.length);

  const record = pipe(source, strings, lengths);
  const sequence = pipe(source, strings, sort((a: string, b) => a.localeCompare(b)), lengths);
  const sequenceFiltered = pipe(source, lazy, strings, lengths);
  const selected = pipe(record, pick("a"), limit(1));
  const result = pipe(sequence, values, lengths => lengths.join(","), text => text.length, n => n > 0);

  expectTypeOf(record).toEqualTypeOf<Queryable<number>>();
  expectTypeOf(sequence).toEqualTypeOf<QuerySequence<number>>();
  expectTypeOf(sequenceFiltered).toEqualTypeOf<QuerySequence<number>>();
  expectTypeOf(selected).toEqualTypeOf<Queryable<number>>();
  expectTypeOf(result).toEqualTypeOf<boolean>();
  expectTypeOf(pipe(source, lazy)).toEqualTypeOf<QuerySequence<string | number>>();
  expectTypeOf(pipe(source, strings, first)).toEqualTypeOf<string | undefined>();
  expectTypeOf(pipe(source, find((v: string | number) => typeof v === "number")))
    .toEqualTypeOf<number | undefined>();
  expect(result).toBe(true);
});

it("compose: every supported arity -> executes unary stages left to right", () => {
  const increment = (n: number) => n + 1;
  const double = (n: number) => n * 2;
  const text = (n: number) => `${n}`;
  const length = (s: string) => s.length;

  const results = [
    compose<number>()(increment)(2), compose<number>()(increment, double)(2),
    compose<number>()(increment, double, text)(2), compose<number>()(increment, double, text, length)(2),
  ];

  expect(results).toEqual([3, 6, "6", 1]);
  expectTypeOf(compose<number>()(increment, double, text, length)).toEqualTypeOf<(input: number) => number>();
});

it("compose: reusable lazy transform -> independent sources and repeated live consumption", () => {
  const a = createQueryable({ a: 1, b: 2 });
  const b = createQueryable({ c: 10, d: 20 });
  const trace: number[] = [];
  const transform = compose<Queryable<number>>()(lazy, map((n: number) => {
    trace.push(n);
    return n * 2;
  }), limit(1));
  const left = transform(a);
  const right = transform(b);
  expect(trace).toEqual([]);

  const before = [values(left), values(right), values(left)];
  a.a = 3;
  const after = values(left);

  expect(before).toEqual([[2], [20], [2]]);
  expect(after).toEqual([6]);
  expect(trace).toEqual([1, 10, 1, 3]);
  expect(left[MAP]).toBe(right[MAP]);
  expect(left[VALUES]).toBe(a[VALUES]);
  expect(values(transform(b))).toEqual([20]);
});

it("terminal adapters: opaque values and empty input -> preserve identity and terminal contracts", () => {
  const opaque = new Proxy({}, { get() { throw new Error("opaque read"); } });
  const marker = Symbol("value");
  const source = createQueryable<unknown>({ opaque, marker, absent: undefined });
  const empty = createQueryable<number>({});

  const output = pipe(source, values);

  expect(output[0]).toBe(opaque);
  expect(output[1]).toBe(marker);
  expect(output[2]).toBeUndefined();
  expect(entries(source).map(([key]) => key)).toEqual(["opaque", "marker", "absent"]);
  expect(toObject(source).opaque).toBe(opaque);
  expect(first(source)).toBe(opaque);
  expect(count(source)).toBe(3);
  expect(some((v: unknown) => v === marker)(source)).toBe(true);
  expect(find((v: unknown) => v === marker)(source)).toBe(marker);
  expect(reduce((sum: number, _v: unknown, key) => sum + key.length, 0)(source)).toBe(18);
  expect(first(empty)).toBeUndefined();
  expect(count(empty)).toBe(0);
  expect(reduce((sum: number, n: number) => sum + n, 7)(empty)).toBe(7);
});

it("adapters: callback and factory errors -> propagate exact thrown values on each execution", () => {
  const failure = Symbol("failure");
  let attempts = 0;
  const source = createQuerySequence<number>(() => {
    attempts++;
    throw failure;
  });
  const transform = compose<QuerySequence<number>>()(limit(1), values);
  const record = createQueryable({ a: 1 });
  const throwing = map((_value: number) => { throw failure; });

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const action of [
      () => transform(source), () => throwing(record),
      () => pipe(record, lazy, throwing, values),
    ]) {
      let caught: unknown;
      try {
        action();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(failure);
    }
  }

  expect(attempts).toBe(2);
});

it("pipe: boundary limits and buffered stages -> preserve core evaluation behavior", () => {
  const source = createQueryable({ 2: 20, 1: 10, a: 30 });
  const bounds = [0, -1, 1.8, NaN, Infinity, -Infinity];

  for (const bound of bounds) {
    expect(pipe(source, limit(bound), entries)).toEqual(source[LIMIT](bound)[ENTRIES]());
    expect(pipe(source, lazy, limit(bound), entries)).toEqual(source[LAZY]()[LIMIT](bound)[ENTRIES]());
  }
  expect(pipe(source, sort((a: number, b) => b - a), entries))
    .toEqual(source[SORT]((a, b) => b - a)[ENTRIES]());
  expect(pipe(source, lazy, pick("2", "1"), entries)).toEqual([["2", 20], ["1", 10]]);
});
