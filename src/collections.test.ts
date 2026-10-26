import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ENTRIES, FIRST, GROUP_BY, GROUP_BY_MAP, KEYS, LAZY, MAP, SORT,
  TO_MAP, TO_OBJECT, TO_SET, VALUES, createQueryable, createQuerySequence,
} from "./index.js";
import type { Queryable, QuerySequence } from "./index.js";

describe.each(["record", "ordered", "lazy"] as const)("collections (%s)", mode => {
  function query<T>(values: Record<string, T>): QuerySequence<T> {
    const source = createQueryable(values);
    return mode === "record" ? source : mode === "ordered" ? source[SORT](() => 0) : source[LAZY]();
  }

  it("outputs: special keys and stored undefined -> fresh ordered native collections", () => {
    const source = query(Object.fromEntries([["__proto__", undefined], ["constructor", 2], ["toString", 2]]));
    const map = source[TO_MAP]();
    const set = source[TO_SET]();
    const keys = source[KEYS]();

    expect([...map]).toEqual([["__proto__", undefined], ["constructor", 2], ["toString", 2]]);
    expect([...set]).toEqual([undefined, 2]);
    expect(keys).toEqual(["__proto__", "constructor", "toString"]);
    map.clear();
    set.clear();
    keys.pop();
    expect(source[ENTRIES]()).toEqual([["__proto__", undefined], ["constructor", 2], ["toString", 2]]);
    expect(source[TO_MAP]()).not.toBe(map);
    expect(source[TO_SET]()).not.toBe(set);
    expect(source[KEYS]()).not.toBe(keys);
  });

  it("GROUP_BY_MAP: arbitrary keys -> native identity without string coercion", () => {
    const objectA = {};
    const objectB = {};
    const symbol = Symbol("group");
    const groupKeys = [objectA, objectB, objectA, symbol, NaN, NaN, -0, 0, undefined];
    const source = query(Object.fromEntries(groupKeys.map((group, i) => [String(i), { group, i }])));
    const trace: string[] = [];
    const groups = source[GROUP_BY_MAP]((value, key) => { trace.push(key); return value.group; });

    expect([...groups.keys()]).toEqual([objectA, objectB, symbol, NaN, 0, undefined]);
    expect(groups.get(objectA)?.[KEYS]()).toEqual(["0", "2"]);
    expect(groups.get(objectB)?.[FIRST]()?.i).toBe(1);
    expect(groups.get(NaN)?.[KEYS]()).toEqual(["4", "5"]);
    expect(groups.get(0)?.[KEYS]()).toEqual(["6", "7"]);
    expect(trace).toEqual(groupKeys.map((_, i) => String(i)));
    expect(groups.get(undefined)?.[TO_OBJECT]()).toHaveProperty("8");
    expect(groups.has({})).toBe(false);
  });

  it("empty: all outputs -> fresh empty containers without callbacks", () => {
    const source = query<number>({});
    const groups = source[GROUP_BY_MAP](() => { throw new Error("unused"); });

    expect(groups.size).toBe(0);
    expect(source[TO_MAP]().size).toBe(0);
    expect(source[TO_SET]().size).toBe(0);
    expect(source[KEYS]()).toEqual([]);
  });

  it("TO_SET: duplicate values -> SameValueZero and shallow identity", () => {
    const object = {};
    const source = query<unknown>({ a: NaN, b: NaN, c: -0, d: 0, e: object, f: object, g: {} });
    const values = source[TO_SET]();

    expect(values.size).toBe(4);
    expect(values.has(NaN)).toBe(true);
    expect(values.has(0)).toBe(true);
    expect(values.has(object)).toBe(true);
    expect(values.has({})).toBe(false);
  });

  it("callback failure: grouping -> propagate the same value and allow a fresh retry", () => {
    const error = Symbol("failure");
    const source = query({ a: 1, b: 2 });
    let caught: unknown;
    try {
      source[GROUP_BY_MAP](() => { throw error; });
    } catch (value) {
      caught = value;
    }

    expect(caught).toBe(error);
    expect(source[GROUP_BY_MAP](() => "all").get("all")?.[VALUES]()).toEqual([1, 2]);
  });

  it("method ownership: chained outputs -> shared frozen prototype methods", () => {
    const source = query({ a: 1 });
    const chained = source[MAP](value => value)[GROUP_BY_MAP](() => "all").get("all");

    for (const symbol of [GROUP_BY_MAP, TO_MAP, TO_SET, KEYS] as const) {
      expect(chained?.[symbol]).toBe(source[symbol]);
      expect(Object.hasOwn(source, symbol)).toBe(false);
    }
    expect(Object.isFrozen(Object.getPrototypeOf(source))).toBe(true);
  });
});

it("GROUP_BY_MAP: lazy numeric-key source -> eagerly snapshot ordered groups once", () => {
  const record = createQueryable({ 1: 1, 2: 2, 3: 3 });
  const trace: number[] = [];
  const lazy = record[LAZY]()[MAP](value => { trace.push(value); return value; })[SORT]((a, b) => b - a);
  const groups = lazy[GROUP_BY_MAP](value => value % 2);
  const odd = groups.get(1);

  expect(trace).toEqual([1, 2, 3]);
  expect(odd?.[ENTRIES]()).toEqual([["3", 3], ["1", 1]]);
  record["1"] = 99;
  expect(odd?.[VALUES]()).toEqual([3, 1]);
  expect(odd?.[VALUES]()).toEqual([3, 1]);
  expect(trace).toEqual([1, 2, 3]);
  groups.clear();
  expect(odd?.[VALUES]()).toEqual([3, 1]);
  expect(lazy[GROUP_BY](value => String(value % 2))["1"]?.[VALUES]()).toEqual([99, 3]);
});

it("factory outputs: ordered input -> preserve identity policy and close on grouping error", () => {
  let closed = 0;
  const source = createQuerySequence(function* () {
    try {
      yield ["2", undefined] as const;
      yield ["1", 1] as const;
      yield ["2", 2] as const;
    } finally {
      closed++;
    }
  });

  expect(() => source[TO_MAP]()).toThrow("Duplicate query key");
  expect(closed).toBe(1);
  expect(() => source[GROUP_BY_MAP](() => { throw new RangeError("group"); })).toThrow(RangeError);
  expect(closed).toBe(2);
  expect(createQuerySequence(() => [["2", 2], ["1", 1]])[KEYS]()).toEqual(["2", "1"]);
});

it("collection types: generic group identity and mode -> preserve exact output types", () => {
  const source = createQueryable({ a: 1, b: 2 });
  const group = Symbol("group");

  expectTypeOf(source[GROUP_BY_MAP](() => group)).toEqualTypeOf<Map<symbol, Queryable<number>>>();
  expectTypeOf(source[LAZY]()[GROUP_BY_MAP](() => group)).toEqualTypeOf<Map<symbol, QuerySequence<number>>>();
  expectTypeOf(source[TO_MAP]()).toEqualTypeOf<Map<string, number>>();
  expectTypeOf(source[TO_SET]()).toEqualTypeOf<Set<number>>();
  expectTypeOf(source[KEYS]()).toEqualTypeOf<string[]>();
});
