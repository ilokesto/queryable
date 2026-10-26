import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AT, EVERY, FIND_ENTRY, FIRST, FIRST_OR, FIRST_OR_ELSE, INCLUDES, IS_EMPTY,
  LAST, LAZY, MAP, SINGLE, SORT, createQueryable,
} from "./index.js";
import type { Queryable, QuerySequence } from "./index.js";
import {
  at, every, findEntry, firstOr, firstOrElse, includes, isEmpty, last, single,
} from "./lookup.js";

describe.each(["record", "ordered", "lazy"] as const)("%s lookup contracts", mode => {
  function query<T>(record: Record<string, T>): Queryable<T> | QuerySequence<T> {
    const source = createQueryable(record);
    return mode === "ordered" ? source[SORT](() => 0) : mode === "lazy" ? source[LAZY]() : source;
  }

  it("empty: all lookups -> absent results and identity predicates", () => {
    const source = query<number>({});
    let calls = 0;
    const predicate = () => { calls++; return true; };

    expect(source[LAST]()).toBeUndefined();
    expect(source[AT](0)).toBeUndefined();
    expect(source[AT](-1)).toBeUndefined();
    expect(source[SINGLE]()).toBeUndefined();
    expect(source[SINGLE](predicate)).toBeUndefined();
    expect(source[EVERY](predicate)).toBe(true);
    expect(source[IS_EMPTY]()).toBe(true);
    expect(source[INCLUDES](0)).toBe(false);
    expect(source[FIND_ENTRY](predicate)).toBeUndefined();
    expect(source[FIRST_OR](false)).toBe(false);
    expect(source[FIRST_OR_ELSE](() => { calls++; return 0; })).toBe(0);
    expect(calls).toBe(1);
  });

  it.each([0, false, undefined, NaN, -0])("presence: stored %s -> never treated as absent", value => {
    const source = query({ a: value });
    let calls = 0;

    expect(source[IS_EMPTY]()).toBe(false);
    expect(source[LAST]()).toBe(value);
    expect(source[AT](0)).toBe(value);
    expect(source[AT](-1)).toBe(value);
    expect(source[SINGLE]()).toBe(value);
    expect(source[INCLUDES](value)).toBe(true);
    expect(source[FIND_ENTRY](() => true)).toEqual(["a", value]);
    expect(source[FIRST_OR]("fallback")).toBe(value);
    expect(source[FIRST_OR_ELSE](() => { calls++; return "fallback"; })).toBe(value);
    expect(calls).toBe(0);
  });

  it("SINGLE: no, one, and multiple matches -> explicit cardinality policy", () => {
    const source = query<number | undefined>({ a: undefined, b: 0, c: 3, d: 4 });
    const keys: string[] = [];

    expect(source[SINGLE](n => n === 9)).toBeUndefined();
    expect(source[SINGLE](n => n === undefined)).toBeUndefined();
    expect(source[SINGLE](n => n === 0)).toBe(0);
    expect(() => source[SINGLE]()).toThrow(RangeError);
    expect(() => source[SINGLE]((n, key) => {
      keys.push(key);
      return n === undefined || n === 3;
    })).toThrow(RangeError);
    expect(keys).toEqual(["a", "b", "c"]);
    expect(() => query({ a: undefined, b: undefined })[SINGLE]()).toThrow(RangeError);
  });

  it("EVERY and FIND_ENTRY: callbacks -> ordered keys and immediate short circuit", () => {
    const source = query({ a: 1, b: 0, c: 3 });
    const keys: string[] = [];

    expect(source[EVERY]((n, key) => { keys.push(key); return n > 0; })).toBe(false);
    expect(keys).toEqual(["a", "b"]);
    keys.length = 0;
    expect(source[FIND_ENTRY]((n, key) => { keys.push(key); return n === 0; })).toEqual(["b", 0]);
    expect(keys).toEqual(["a", "b"]);
    expect(source[EVERY](n => n >= 0)).toBe(true);
  });

  it("FIND_ENTRY: returned tuples -> fresh mutable containers with shared values", () => {
    const value = { n: 1 };
    const source = query({ a: value });
    const first = source[FIND_ENTRY](() => true);
    const second = source[FIND_ENTRY](() => true);

    expect(first).not.toBe(second);
    expect(first?.[1]).toBe(value);
    if (first) {
      first[0] = "changed";
      first[1] = { n: 99 };
    }
    expect(second).toEqual(["a", value]);
    expect(source[FIRST]()).toBe(value);
  });

  it("INCLUDES: SameValueZero -> NaN and signed zero match without coercion", () => {
    const object = {};
    const source = query<unknown>({ a: NaN, b: -0, c: object, d: undefined });

    expect(source[INCLUDES](NaN)).toBe(true);
    expect(source[INCLUDES](0)).toBe(true);
    expect(source[INCLUDES](-0)).toBe(true);
    expect(source[INCLUDES](object)).toBe(true);
    expect(source[INCLUDES]({})).toBe(false);
    expect(source[INCLUDES]("0")).toBe(false);
    expect(source[INCLUDES](false)).toBe(false);
    expect(source[INCLUDES](undefined)).toBe(true);
  });

  it("AT: numeric boundaries -> native relative index results", () => {
    const values = [10, 20, 30];
    const source = query({ a: 10, b: 20, c: 30 });
    const indexes = [0, -0, 1, 2, 3, -1, -2, -3, -4, 1.9, -1.9, -.9, NaN,
      Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE];

    for (const index of indexes) {
      expect(source[AT](index)).toBe(values.at(index));
    }
    expect(source[LAST]()).toBe(30);
  });

  it("guards and fallbacks: public types -> narrowed tuple and value unions", () => {
    const source = query<number | string | undefined>({ a: 0, b: "two" });
    const isString = (value: number | string | undefined): value is string => typeof value === "string";

    expectTypeOf(source[FIND_ENTRY](isString)).toEqualTypeOf<[string, string] | undefined>();
    expectTypeOf(source[SINGLE](isString)).toEqualTypeOf<string | undefined>();
    expectTypeOf(source[FIND_ENTRY](() => true)).toEqualTypeOf<[string, number | string | undefined] | undefined>();
    expectTypeOf(source[FIRST_OR](false)).toEqualTypeOf<number | string | undefined | boolean>();
    expectTypeOf(source[FIRST_OR_ELSE](() => false)).toEqualTypeOf<number | string | undefined | boolean>();
    expectTypeOf<ThisParameterType<typeof source[typeof LAST]>>().not.toEqualTypeOf<unknown>();
    expect(source[FIND_ENTRY](isString)).toEqual(["b", "two"]);
    expect(source[SINGLE](isString)).toBe("two");
  });

  it("callbacks: thrown sentinel -> identical error escapes", () => {
    const error = new Error("sentinel");
    const source = query({ a: 1 });
    const fail = (): never => { throw error; };

    for (const run of [
      () => source[SINGLE](fail), () => source[EVERY](fail), () => source[FIND_ENTRY](fail),
      () => query<number>({})[FIRST_OR_ELSE](fail),
    ]) {
      let caught: unknown;
      try { run(); } catch (thrown) { caught = thrown; }
      expect(caught).toBe(error);
    }
  });
});

describe("lookup evaluation", () => {
  it("shared methods: record and both sequence modes -> same function identities", () => {
    const record = createQueryable({ a: 1 });
    const ordered = record[SORT](() => 0);
    const lazy = record[LAZY]();

    for (const symbol of [LAST, AT, SINGLE, EVERY, IS_EMPTY, INCLUDES, FIND_ENTRY, FIRST_OR, FIRST_OR_ELSE] as const) {
      expect(record[symbol]).toBe(ordered[symbol]);
      expect(record[symbol]).toBe(lazy[symbol]);
      expect(Object.hasOwn(record, symbol)).toBe(false);
      expect(Object.hasOwn(lazy, symbol)).toBe(false);
    }
  });

  it("ordered lookups: sorted numeric keys -> comparator order rather than object order", () => {
    const source = createQueryable({ 1: 10, 2: 20, 3: 30 })[SORT]((a, b) => b - a);

    expect(source[AT](0)).toBe(30);
    expect(source[AT](-1)).toBe(10);
    expect(source[LAST]()).toBe(10);
    expect(source[FIND_ENTRY](() => true)).toEqual(["3", 30]);
  });

  it("lazy lookups: short circuits -> exact work and repeatable live reads", () => {
    const record = createQueryable({ a: 1, b: 2, c: 3, d: 4 });
    const seen: string[] = [];
    const source = record[LAZY]()[MAP]((n, key) => { seen.push(key); return n; });
    const cases: [() => unknown, string[]][] = [
      [() => source[AT](1), ["a", "b"]],
      [() => source[AT](NaN), ["a"]],
      [() => source[AT](-2), ["a", "b", "c", "d"]],
      [() => source[LAST](), ["a", "b", "c", "d"]],
      [() => source[IS_EMPTY](), ["a"]],
      [() => source[INCLUDES](2), ["a", "b"]],
      [() => source[FIRST_OR](0), ["a"]],
      [() => source[FIRST_OR_ELSE](() => 0), ["a"]],
      [() => source[EVERY](n => n < 2), ["a", "b"]],
      [() => source[FIND_ENTRY](n => n === 2), ["a", "b"]],
    ];
    for (const [read, expected] of cases) {
      seen.length = 0;
      read();
      expect(seen).toEqual(expected);
    }
    record.a = 99;
    expect(source[AT](0)).toBe(99);
  });

  it("AT: infinities and coercion errors -> no iteration or pending callbacks", () => {
    let calls = 0;
    const source = createQueryable({ a: 1 })[LAZY]()[MAP](n => { calls++; return n; });

    expect(source[AT](Infinity)).toBeUndefined();
    expect(source[AT](-Infinity)).toBeUndefined();
    expect(calls).toBe(0);
    const error = new Error("coercion");
    const index = { valueOf(): never { throw error; } };
    expect(() => Reflect.apply(source[AT], source, [index])).toThrow(error);
    expect(calls).toBe(0);
    expect(Reflect.apply(source[AT], source, ["0"])).toBe(1);
    expect(Reflect.apply(source[AT], source, [undefined])).toBe(1);
    expect(() => Reflect.apply(source[AT], source, [1n])).toThrow(TypeError);
  });

  it("INCLUDES: proxy values -> identity comparison without coercion traps", () => {
    const error = new Error("unexpected value access");
    const value = new Proxy({}, { get() { throw error; } });
    const source = createQueryable({ a: value })[LAZY]();

    expect(source[INCLUDES](value)).toBe(true);
    expect(source[INCLUDES]({})).toBe(false);
    expect(source[FIRST_OR_ELSE](() => ({}))).toBe(value);
  });

  it("helper iteration: early returns and callback errors -> iterator cleanup", () => {
    let closed = 0;
    function* entries(): Generator<readonly [string, number]> {
      try {
        yield ["a", 1];
        yield ["b", 2];
        yield ["c", 3];
      } finally {
        closed++;
      }
    }
    const error = new Error("callback");
    const fail = (): never => { throw error; };
    const reads = [
      () => at(entries(), 0), () => at(entries(), -1), () => last(entries()),
      () => isEmpty(entries()), () => includes(entries(), 1),
      () => every(entries(), () => false), () => findEntry(entries(), () => true),
      () => firstOr(entries(), 0), () => firstOrElse(entries(), () => 0),
      () => single(entries(), n => n === 2),
    ];
    for (const read of reads) {
      const before = closed;
      read();
      expect(closed).toBe(before + 1);
    }
    for (const read of [
      () => single(entries()), () => single(entries(), fail),
      () => every(entries(), fail), () => findEntry(entries(), fail),
    ]) {
      const before = closed;
      expect(read).toThrow();
      expect(closed).toBe(before + 1);
    }
  });

  it("FIND_ENTRY helper: reused source tuple -> independent output tuple", () => {
    const tuple: [string, number] = ["a", 1];
    const found = findEntry([tuple], () => true);
    tuple[0] = "changed";

    expect(found).toEqual(["a", 1]);
    expect(found).not.toBe(tuple);
  });
});
