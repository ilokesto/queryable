import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AVERAGE, COUNT_BY, GROUP_BY, LAZY, LIMIT, MAP, MAX, MIN, REDUCE_BY, SORT, STATS, SUM, VALUES,
  createQueryable,
} from "./index.js";
import type { NumericStats, Queryable, QuerySequence } from "./index.js";

function inMode<T>(query: Queryable<T>, mode: string): Queryable<T> | QuerySequence<T> {
  if (mode === "lazy") {
    return query[LAZY]();
  }
  return mode === "sequence" ? query[SORT](() => 0) : query;
}

const numericMethods = [SUM, AVERAGE, MIN, MAX, STATS] as const;
const allMethods = [...numericMethods, COUNT_BY, REDUCE_BY] as const;

describe.each(["record", "sequence", "lazy"])("aggregation (%s)", mode => {
  it("numeric terminals: keyed selectors -> expected numbers with one call per entry", () => {
    const query = inMode(createQueryable({ a: { n: 2 }, b: { n: -1 }, c: { n: 5 } }), mode);
    const expected = [6, 2, -1, 5, { count: 3, sum: 6, average: 2, min: -1, max: 5 }];

    numericMethods.forEach((method, index) => {
      const calls: [string, number][] = [];
      const result = query[method]((value, key) => {
        calls.push([key, value.n]);
        return value.n;
      });

      expect(result).toEqual(expected[index]);
      expect(calls).toEqual([["a", 2], ["b", -1], ["c", 5]]);
    });
  });

  it("terminals: empty input -> empty identities without invoking callbacks", () => {
    const query = inMode(createQueryable<number>({}), mode);
    const fail = (): never => { throw new Error("empty callback"); };

    expect(query[SUM](fail)).toBe(0);
    expect(query[AVERAGE](fail)).toBeUndefined();
    expect(query[MIN](fail)).toBeUndefined();
    expect(query[MAX](fail)).toBeUndefined();
    expect(query[STATS](fail)).toEqual({ count: 0, sum: 0, average: undefined, min: undefined, max: undefined });
    for (const groups of [query[COUNT_BY](fail), query[REDUCE_BY](fail, fail, fail)]) {
      expect(Object.keys(groups)).toEqual([]);
      expect(Object.getPrototypeOf(groups)).toBeNull();
    }
  });

  it.each([
    [NaN, 2],
    [Infinity, 2],
    [-Infinity, 2],
    [Infinity, -Infinity],
    [Number.MAX_VALUE, Number.MAX_VALUE],
    [0, -0],
    [-0, 0],
    [-0, -0],
    [1e16, 1, -1e16],
  ])("numeric terminals: %j -> native addition and Math extrema", (...numbers) => {
    const query = inMode(createQueryable(Object.fromEntries(numbers.map((n, i) => [String(i), n]))), mode);
    const sum = numbers.reduce((total, n) => total + n, 0);
    const expected = {
      count: numbers.length,
      sum,
      average: sum / numbers.length,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
    };

    expect(query[STATS](n => n)).toEqual(expected);
    expect(query[SUM](n => n)).toBe(expected.sum);
    expect(query[AVERAGE](n => n)).toBe(expected.average);
    expect(query[MIN](n => n)).toBe(expected.min);
    expect(query[MAX](n => n)).toBe(expected.max);
  });

  it("numeric terminals: one negative zero -> positive-zero sum and signed extrema", () => {
    const query = inMode(createQueryable({ only: -0 }), mode);

    expect(query[STATS](n => n)).toEqual({ count: 1, sum: 0, average: 0, min: -0, max: -0 });
  });

  it("COUNT_BY: literal and special groups -> safe counts with optional presence", () => {
    const query = inMode(createQueryable({ a: "", b: "__proto__", c: "constructor", d: "toString", e: "" }), mode);
    const calls: string[] = [];

    const counts = query[COUNT_BY]((value, key) => {
      calls.push(key);
      return value;
    });

    expect(counts).toEqual({ "": 2, ["__proto__"]: 1, constructor: 1, toString: 1 });
    expect(Object.getPrototypeOf(counts)).toBeNull();
    expect(calls).toEqual(["a", "b", "c", "d", "e"]);
    expect(Object.hasOwn(counts, "__proto__")).toBe(true);
    expect(Object.hasOwn(counts, "absent")).toBe(false);
  });

  it("REDUCE_BY: mutable object accumulators -> one fresh factory result per encountered group", () => {
    const query = inMode(createQueryable({ a: 1, b: 2, c: 3 }), mode);
    const events: string[] = [];
    const created: { keys: string[]; total: number }[] = [];

    const groups = query[REDUCE_BY](
      (value, key) => {
        events.push(`key:${key}`);
        return value % 2 ? "odd" : "even";
      },
      groupKey => {
        events.push(`initial:${groupKey}`);
        const acc = { keys: [] as string[], total: 0 };
        created.push(acc);
        return acc;
      },
      (acc, value, key) => {
        events.push(`reduce:${key}`);
        acc.keys.push(key);
        acc.total += value;
        return acc;
      },
    );

    expect(groups).toEqual({ odd: { keys: ["a", "c"], total: 4 }, even: { keys: ["b"], total: 2 } });
    expect(groups.odd).toBe(created[0]);
    expect(groups.even).toBe(created[1]);
    expect(groups.odd).not.toBe(groups.even);
    expect(events).toEqual([
      "key:a", "initial:odd", "reduce:a", "key:b", "initial:even", "reduce:b", "key:c", "reduce:c",
    ]);
  });

  it.each([undefined, null, false, 0, "", NaN])(
    "REDUCE_BY: stored falsy accumulator %s -> retained rather than reinitialized",
    initial => {
      const query = inMode(createQueryable({ a: 1, b: 2 }), mode);
      const seen: unknown[] = [];
      let factories = 0;

      const groups = query[REDUCE_BY](() => "__proto__", (): unknown => {
        factories++;
        return initial;
      }, acc => {
        seen.push(acc);
        return initial;
      });

      expect(factories).toBe(1);
      expect(seen).toEqual([initial, initial]);
      expect(Object.hasOwn(groups, "__proto__")).toBe(true);
      expect(groups.__proto__).toBe(initial);
      expect(Object.getPrototypeOf(groups)).toBeNull();
    },
  );

  it("REDUCE_BY: reducer returns undefined -> subsequent entry receives stored undefined", () => {
    const query = inMode(createQueryable({ a: 1, b: 2 }), mode);
    const seen: (number | undefined)[] = [];
    let factories = 0;

    const groups = query[REDUCE_BY](() => "group", (): number | undefined => {
      factories++;
      return 7;
    }, acc => {
      seen.push(acc);
      return undefined;
    });

    expect(seen).toEqual([7, undefined]);
    expect(factories).toBe(1);
    expect(groups.group).toBeUndefined();
    expect(Object.hasOwn(groups, "group")).toBe(true);
  });

  it("aggregation: falsy and undefined entries -> selectors and reducers visit every original value", () => {
    type Value = undefined | null | boolean | number | string;
    const query = inMode(createQueryable<Value>({ a: undefined, b: null, c: false, d: 0, e: "" }), mode);
    const selected: [string, Value][] = [];

    const stats = query[STATS]((value, key) => {
      selected.push([key, value]);
      return value === undefined ? 1 : 0;
    });
    const groups = query[REDUCE_BY](
      (_value, key) => key === "a" ? "__proto__" : key === "b" ? "constructor" : "toString",
      (): [string, Value][] => [],
      (acc, value, key) => {
        acc.push([key, value]);
        return acc;
      },
    );

    expect(stats).toEqual({ count: 5, sum: 1, average: 0.2, min: 0, max: 1 });
    expect(selected).toEqual([["a", undefined], ["b", null], ["c", false], ["d", 0], ["e", ""]]);
    expect(groups).toEqual({
      ["__proto__"]: [["a", undefined]],
      constructor: [["b", null]],
      toString: [["c", false], ["d", 0], ["e", ""]],
    });
    expect(Object.getPrototypeOf(groups)).toBeNull();
  });

  it("numeric terminals: selector throws -> original error stops traversal", () => {
    const query = inMode(createQueryable({ a: 1, b: 2, c: 3 }), mode);
    const failure = new Error("selector failed");

    for (const method of numericMethods) {
      const calls: string[] = [];
      expect(() => query[method]((n, key) => {
        calls.push(key);
        if (n === 2) {
          throw failure;
        }
        return n;
      })).toThrow(failure);
      expect(calls).toEqual(["a", "b"]);
    }
  });

  it.each(["key", "initial", "reduce"])("REDUCE_BY: %s callback throws -> propagates and permits fresh consumption", stage => {
    const query = inMode(createQueryable({ a: 1, b: 2, c: 3 }), mode);
    const failure = new Error("group fold failed");
    const seen: string[] = [];
    const invoke = () => query[REDUCE_BY]((value, key) => {
      seen.push(`key:${key}`);
      if (stage === "key" && value === 2) {
        throw failure;
      }
      return String(value % 2);
    }, group => {
      seen.push(`initial:${group}`);
      if (stage === "initial" && group === "0") {
        throw failure;
      }
      return 0;
    }, (acc, value, key) => {
      seen.push(`reduce:${key}`);
      if (stage === "reduce" && value === 2) {
        throw failure;
      }
      return acc + value;
    });

    expect(invoke).toThrow(failure);
    expect(seen.some(event => event.endsWith(":c"))).toBe(false);
    expect(query[COUNT_BY](n => n % 2 ? "odd" : "even")).toEqual({ odd: 2, even: 1 });
  });

  it("COUNT_BY: key selector throws -> original error stops traversal", () => {
    const query = inMode(createQueryable({ a: 1, b: 2, c: 3 }), mode);
    const failure = new Error("group key failed");
    const seen: string[] = [];

    expect(() => query[COUNT_BY]((n, key) => {
      seen.push(key);
      if (n === 2) {
        throw failure;
      }
      return "group";
    })).toThrow(failure);
    expect(seen).toEqual(["a", "b"]);
  });

  it("aggregation types: selectors and literal group keys -> exact optional result types", () => {
    const query = inMode(createQueryable({ a: { n: 1 } }), mode);

    expectTypeOf(query[SUM]((value, key) => {
      expectTypeOf(value).toEqualTypeOf<{ n: number }>();
      expectTypeOf(key).toEqualTypeOf<string>();
      return value.n;
    })).toEqualTypeOf<number>();
    expectTypeOf(query[AVERAGE](value => value.n)).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[MIN](value => value.n)).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[MAX](value => value.n)).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[STATS](value => value.n)).toEqualTypeOf<NumericStats>();
    const counts = query[COUNT_BY](value => value.n > 0 ? "positive" : "other");
    expectTypeOf(counts).toEqualTypeOf<Partial<Record<"positive" | "other", number>>>();
    expectTypeOf(counts.positive).toEqualTypeOf<number | undefined>();
    const groups = query[REDUCE_BY](
      value => value.n > 0 ? "positive" : "other",
      group => {
        expectTypeOf(group).toEqualTypeOf<"positive" | "other">();
        const initial: number[] = [];
        return initial;
      },
      (acc, value, key) => {
        expectTypeOf(value).toEqualTypeOf<{ n: number }>();
        expectTypeOf(key).toEqualTypeOf<string>();
        return [...acc, value.n];
      },
    );
    expectTypeOf(groups).toEqualTypeOf<Partial<Record<"positive" | "other", number[]>>>();
    expectTypeOf<Parameters<(typeof query)[typeof SUM]>[0]>().returns.toEqualTypeOf<number>();
  });
});

describe("aggregation traversal", () => {
  it("terminals: independent records and chains -> identical shared methods", () => {
    const query = createQueryable({ a: 1 });
    const views = [createQueryable({ b: 2 }), query[MAP](n => n), query[SORT](() => 0), query[LAZY]()];

    for (const view of views) {
      for (const method of allMethods) {
        expect(view[method]).toBe(query[method]);
        expect(Object.hasOwn(view, method)).toBe(false);
      }
    }
  });

  it("STATS and grouped folds: sorted sequence -> stable comparator order and original keys", () => {
    const query = createQueryable({ 1: 1e16, 2: -1e16, named: 1 })[SORT]((a, b) => a - b);
    const keys: string[] = [];

    expect(query[STATS]((n, key) => {
      keys.push(key);
      return n;
    }).sum).toBe(0);
    expect(keys).toEqual(["2", "named", "1"]);
    expect(query[REDUCE_BY](() => "all", (): string[] => [], (acc, _n, key) => [...acc, key]))
      .toEqual({ all: ["2", "named", "1"] });
  });

  it("STATS: lazy mapped limited source -> one traversal per call with live repeated evaluation", () => {
    const source = createQueryable({ a: 1, b: 2, c: 3 });
    let mapped = 0;
    let selected = 0;
    const query = source[LAZY]()[MAP](n => { mapped++; return n * 2; })[LIMIT](2);
    const selector = (n: number) => { selected++; return n; };

    expect(mapped).toBe(0);
    expect(query[STATS](selector)).toEqual({ count: 2, sum: 6, average: 3, min: 2, max: 4 });
    source.a = 4;
    expect(query[STATS](selector)).toEqual({ count: 2, sum: 12, average: 6, min: 4, max: 8 });
    expect(mapped).toBe(4);
    expect(selected).toBe(4);
  });

  it("grouped terminals: lazy source mutations -> fresh results and accumulators on every call", () => {
    const source = createQueryable({ a: 1, b: 2 });
    let mapped = 0;
    let factories = 0;
    const query = source[LAZY]()[MAP](n => { mapped++; return n; });
    const fold = () => query[REDUCE_BY](n => n % 2 ? "odd" : "even",
      (): number[] => { factories++; return []; }, (acc, n) => [...acc, n]);

    const first = fold();
    source.c = 3;
    const second = fold();
    const counts = query[COUNT_BY](n => n % 2 ? "odd" : "even");

    expect(first).toEqual({ odd: [1], even: [2] });
    expect(second).toEqual({ odd: [1, 3], even: [2] });
    expect(first.odd).not.toBe(second.odd);
    expect(counts).toEqual({ odd: 2, even: 1 });
    expect(mapped).toBe(8);
    expect(factories).toBe(4);
  });

  it("numeric terminals: lazy upstream errors -> no caching and fresh recovery", () => {
    const source = createQueryable({ a: 1, b: 2 });
    const failure = new Error("mapping failed");
    const seen: string[] = [];
    const query = source[LAZY]()[MAP]((n, key) => {
      seen.push(key);
      if (n === 2) {
        throw failure;
      }
      return n;
    });

    expect(() => query[STATS](n => n)).toThrow(failure);
    source.b = 3;
    expect(query[STATS](n => n).sum).toBe(4);
    expect(seen).toEqual(["a", "b", "a", "b"]);
  });

  it("GROUP_BY: lazy source -> existing groups remain eager full snapshots", () => {
    const source = createQueryable({ a: 1, b: 2 });
    let mapped = 0;
    const query = source[LAZY]()[MAP](n => { mapped++; return n; });

    const groups = query[GROUP_BY](() => "all");
    source.c = 3;

    expect(mapped).toBe(2);
    expect(groups.all?.[VALUES]()).toEqual([1, 2]);
    expect(groups.all?.[STATS](n => n).sum).toBe(3);
    expect(mapped).toBe(2);
  });
});
