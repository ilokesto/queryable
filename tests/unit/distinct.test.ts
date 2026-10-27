import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DISTINCT, DISTINCT_BY, DISTINCT_UNTIL_CHANGED, DISTINCT_UNTIL_CHANGED_BY,
  ENTRIES, FIRST, LAZY, LIMIT, MAP, SORT, VALUES, WHERE, createQueryable,
} from "../../src/index.js";
import type { Queryable, QuerySequence } from "../../src/index.js";

const operations = [DISTINCT, DISTINCT_UNTIL_CHANGED] as const;
const selectedOperations = [DISTINCT_BY, DISTINCT_UNTIL_CHANGED_BY] as const;

describe("distinct", () => {
  it("DISTINCT: repeated values -> first entries retain original native record keys", () => {
    const query = createQueryable({ z: 2, 2: 1, 1: 2, a: 1, b: 3 });

    const result = query[DISTINCT]();

    expect(result[ENTRIES]()).toEqual([["1", 2], ["2", 1], ["b", 3]]);
    expect(query[VALUES]()).toEqual([2, 1, 2, 1, 3]);
    expectTypeOf(result).toEqualTypeOf<Queryable<number>>();
  });

  it("DISTINCT_UNTIL_CHANGED: separated repeats -> first entry of every adjacent run", () => {
    const query = createQueryable({ a: 1, b: 1, c: 2, d: 1, e: 1 });

    const result = query[DISTINCT_UNTIL_CHANGED]();

    expect(result[ENTRIES]()).toEqual([["a", 1], ["c", 2], ["d", 1]]);
  });

  it.each(operations)("%s: SameValueZero and identity -> NaN/zero merge but distinct references remain", operation => {
    const first = {};
    const second = {};
    const query = createQueryable<unknown>({
      a: undefined, b: undefined, c: NaN, d: NaN, e: -0, f: 0, g: first, h: first, i: second,
    });

    const result = query[operation]()[ENTRIES]();

    expect(result).toEqual([["a", undefined], ["c", NaN], ["e", -0], ["g", first], ["i", second]]);
    expect(result[3]?.[1]).toBe(first);
    expect(result[4]?.[1]).toBe(second);
  });

  it.each(operations)("%s: special keys -> first entries remain safe own data properties", operation => {
    const query = createQueryable(Object.fromEntries([
      ["__proto__", 1], ["duplicate", 1], ["constructor", 2], ["toString", 3],
    ]));

    const result = query[operation]();

    expect(Object.keys(result)).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result[ENTRIES]()).toEqual([["__proto__", 1], ["constructor", 2], ["toString", 3]]);
  });

  it.each(selectedOperations)("%s: ordered sequence -> selector receives original keys in comparator order", operation => {
    const trace: string[] = [];
    const query = createQueryable({ 1: 11, 2: 22, 3: 21, named: 12 })[SORT]((a, b) => b - a);

    const result = query[operation]((value, key) => { trace.push(key); return Math.floor(value / 10); });

    expect(trace).toEqual(["2", "3", "named", "1"]);
    expect(result[ENTRIES]()).toEqual([["2", 22], ["named", 12]]);
    expectTypeOf(result).toEqualTypeOf<QuerySequence<number>>();
  });

  it.each(selectedOperations)("%s: selectors on records -> retain values and distinguish selected object identity", operation => {
    const category = {};
    const a = { category };
    const b = { category };
    const c = { category: {} };
    const query = createQueryable({ a, b, c });

    const result = query[operation](value => value.category);

    expect(result[ENTRIES]()).toEqual([["a", a], ["c", c]]);
    expectTypeOf(result).toEqualTypeOf<typeof query>();
  });

  it.each(selectedOperations)("%s: lazy partial consumption and mutation -> every consumption starts fresh", operation => {
    const trace: string[] = [];
    const query = createQueryable({ a: 1, b: 1, c: 2, d: 2 });
    const lazy = query[LAZY]()[operation]((value, key) => { trace.push(key); return value; });

    expect(trace).toEqual([]);
    expect(lazy[LIMIT](1)[VALUES]()).toEqual([1]);
    expect(trace.splice(0)).toEqual(["a"]);
    expect(lazy[VALUES]()).toEqual([1, 2]);
    expect(trace.splice(0)).toEqual(["a", "b", "c", "d"]);
    query.a = 3;
    expect(lazy[VALUES]()).toEqual([3, 1, 2]);
    expect(trace).toEqual(["a", "b", "c", "d"]);
  });

  it.each(operations)("%s: identity lazy partial consumption -> repeat and composed operations retain fresh state", operation => {
    const lazy = createQueryable({ a: 1, b: 1, c: 2 })[LAZY]()[operation]();

    expect(lazy[FIRST]()).toBe(1);
    expect(lazy[WHERE](value => value > 0)[MAP](value => value * 10)[VALUES]()).toEqual([10, 20]);
    expect(lazy[VALUES]()).toEqual([1, 2]);
    expectTypeOf(lazy).toEqualTypeOf<QuerySequence<number>>();
  });

  it.each(selectedOperations)("%s: selector errors -> eager throws immediately and lazy retries from first entry", operation => {
    const failure = new Error("selector failed");
    const query = createQueryable({ a: 1, b: 2 });
    const trace: string[] = [];
    const select = (value: number, key: string) => {
      trace.push(key);
      if (value === 2) {
        throw failure;
      }
      return value;
    };

    expect(() => query[operation](select)).toThrow(failure);
    expect(trace.splice(0)).toEqual(["a", "b"]);
    const lazy = query[LAZY]()[operation](select);
    expect(trace).toEqual([]);
    expect(() => lazy[VALUES]()).toThrow(failure);
    expect(trace.splice(0)).toEqual(["a", "b"]);
    expect(() => lazy[VALUES]()).toThrow(failure);
    expect(trace).toEqual(["a", "b"]);
  });

  it("distinct methods: independent chains -> methods are shared and absent from instances", () => {
    const first = createQueryable({ a: 1 });
    const second = createQueryable({ b: 2 })[DISTINCT]();
    const sequence = first[LAZY]();
    const otherSequence = second[SORT](() => 0);

    for (const method of [...operations, ...selectedOperations]) {
      expect(first[method]).toBe(second[method]);
      expect(sequence[method]).toBe(otherSequence[method]);
      expect(Object.hasOwn(first, method)).toBe(false);
      expect(Object.hasOwn(sequence, method)).toBe(false);
    }
    expect(Object.isFrozen(Object.getPrototypeOf(first))).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(sequence))).toBe(true);
  });

  it.each(operations)("%s: empty record and lazy sequence -> empty outputs", operation => {
    const query = createQueryable<undefined>({});

    expect(query[operation]()[ENTRIES]()).toEqual([]);
    expect(query[LAZY]()[operation]()[VALUES]()).toEqual([]);
  });
});
