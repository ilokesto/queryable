import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  EACH, ENTRIES, FIND, FIRST, LAZY, LIMIT, MAP, PARTITION, SCAN, SOME, SORT,
  TAP, THROUGH, VALUES, createQueryable,
} from "./index.js";
import type { Queryable, QuerySequence } from "./index.js";

const modes = ["record", "ordered", "lazy"] as const;

function inMode<T>(record: Queryable<T>, mode: typeof modes[number]): QuerySequence<T> {
  if (mode === "ordered") {
    return record[SORT](() => 0);
  }
  return mode === "lazy" ? record[LAZY]() : record;
}

describe.each(modes)("%s stateful contracts", mode => {
  it("PARTITION: keyed input -> one predicate per entry and independent eager snapshots", () => {
    const value = { amount: 2 };
    const record = createQueryable({ a: value, b: { amount: 1 }, c: value });
    const calls: string[] = [];
    const query = inMode(record, mode)[MAP]((entry, key) => {
      calls.push(`map:${key}`);
      return entry;
    });
    calls.length = 0;

    const [matching, nonmatching] = query[PARTITION]((entry, key) => {
      calls.push(`predicate:${key}`);
      return entry.amount === 2;
    });
    record.a = { amount: 99 };
    delete record.b;
    record.d = value;

    expect(calls).toEqual(mode === "lazy"
      ? ["map:a", "predicate:a", "map:b", "predicate:b", "map:c", "predicate:c"]
      : ["predicate:a", "predicate:b", "predicate:c"]);
    expect(matching[ENTRIES]()).toEqual([["a", value], ["c", value]]);
    expect(nonmatching[ENTRIES]()).toEqual([["b", { amount: 1 }]]);
    expect(matching[FIRST]()).toBe(value);
    matching[TAP](() => { calls.push("snapshot"); })[VALUES]();
    expect(calls.slice(-2)).toEqual(["snapshot", "snapshot"]);
    expect(nonmatching[VALUES]()).toEqual([{ amount: 1 }]);
  });

  it("PARTITION/SCAN/TAP/EACH: empty input -> empty outputs without entry callbacks", () => {
    const query = inMode(createQueryable<number>({}), mode);
    const callback = vi.fn(() => false);
    const reducer = vi.fn((sum: number, value: number) => sum + value);
    const seed = vi.fn(() => 0);

    const [matching, nonmatching] = query[PARTITION](callback);
    const scanned = query[SCAN](reducer, seed);
    const tapped = query[TAP](callback);
    const result = query[EACH](callback);

    expect(matching[ENTRIES]()).toEqual([]);
    expect(nonmatching[ENTRIES]()).toEqual([]);
    expect(scanned[ENTRIES]()).toEqual([]);
    expect(tapped[ENTRIES]()).toEqual([]);
    expect(result).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
    expect(reducer).not.toHaveBeenCalled();
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("SCAN: keyed input -> seed then running value per key without a seed entry", () => {
    const trace: string[] = [];
    const query = inMode(createQueryable({ a: 1, b: 2, c: 3 }), mode);

    const scanned = query[SCAN]((sum, value, key) => {
      trace.push(`${key}:${sum}:${value}`);
      return sum + value;
    }, () => {
      trace.push("seed");
      return 10;
    });

    expect(trace).toEqual(mode === "lazy" ? [] : ["seed", "a:10:1", "b:11:2", "c:13:3"]);
    expect(scanned[ENTRIES]()).toEqual([["a", 11], ["b", 13], ["c", 16]]);
    expect(trace).toEqual(["seed", "a:10:1", "b:11:2", "c:13:3"]);
  });

  it("SCAN: mutable seed -> emitted references alias within one consumption", () => {
    const seed = vi.fn((): number[] => []);
    const query = inMode(createQueryable({ a: 1, b: 2 }), mode);
    const scanned = query[SCAN]((accumulator, value) => {
      accumulator.push(value);
      return accumulator;
    }, seed);

    const first = scanned[VALUES]();
    const second = scanned[VALUES]();

    expect(first).toEqual([[1, 2], [1, 2]]);
    expect(first[0]).toBe(first[1]);
    expect(second[0]).toBe(second[1]);
    if (mode === "lazy") {
      expect(second[0]).not.toBe(first[0]);
    } else {
      expect(second[0]).toBe(first[0]);
    }
    expect(seed).toHaveBeenCalledTimes(mode === "lazy" ? 2 : 1);
  });

  it("TAP: false-returning effect -> retains key/value identity and visits all entries", () => {
    const value = { opaque: true };
    const calls: string[] = [];
    const query = inMode(createQueryable({ a: value, b: value }), mode);

    const tapped = query[TAP]((entry, key) => {
      expect(entry).toBe(value);
      calls.push(key);
      return false;
    });

    expect(calls).toEqual(mode === "lazy" ? [] : ["a", "b"]);
    expect(tapped[ENTRIES]()).toEqual([["a", value], ["b", value]]);
    expect(tapped[FIRST]()).toBe(value);
    expect(calls).toEqual(mode === "lazy" ? ["a", "b", "a"] : ["a", "b"]);
  });

  it("EACH: false-returning effect -> consumes all entries without array collection", () => {
    const calls: [string, number][] = [];
    const query = inMode(createQueryable({ a: 1, b: 2 }), mode);
    const collect = vi.spyOn(Array, "from");
    let result: void;
    try {
      result = query[EACH]((value, key) => {
        calls.push([key, value]);
        return false;
      });
      expect(collect).not.toHaveBeenCalled();
    } finally {
      collect.mockRestore();
    }

    expect(result).toBeUndefined();
    expect(calls).toEqual([["a", 1], ["b", 2]]);
    query[EACH]((value, key) => { calls.push([key, value]); });
    expect(calls).toEqual([["a", 1], ["b", 2], ["a", 1], ["b", 2]]);
  });

  it("THROUGH: external transform -> exact receiver and unmodified return", () => {
    const query = inMode(createQueryable({ a: 1 }), mode);
    const result = { external: true };
    const transform = vi.fn((received: QuerySequence<number>) => {
      expect(received).toBe(query);
      return result;
    });

    expect(query[THROUGH](transform)).toBe(result);
    expect(transform).toHaveBeenCalledTimes(1);
  });

  const failures = [
    ["PARTITION", (query: QuerySequence<number>, fail: () => never) => query[PARTITION](fail)],
    ["SCAN reducer", (query: QuerySequence<number>, fail: () => never) => query[SCAN](fail, () => 0)[VALUES]()],
    ["SCAN seed", (query: QuerySequence<number>, fail: () => never) => query[SCAN]((sum: number) => sum, fail)[VALUES]()],
    ["TAP", (query: QuerySequence<number>, fail: () => never) => query[TAP](fail)[VALUES]()],
    ["EACH", (query: QuerySequence<number>, fail: () => never) => query[EACH](fail)],
    ["THROUGH", (query: QuerySequence<number>, fail: () => never) => query[THROUGH](fail)],
  ] as const;

  it.each(failures)("%s: callback throws -> preserves exact thrown value", (_name, invoke) => {
    const failure = Object.freeze({ reason: "sentinel" });
    const query = inMode(createQueryable({ a: 1, b: 2 }), mode);
    let caught: unknown;

    try {
      invoke(query, () => { throw failure; });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
    expect(query[VALUES]()).toEqual([1, 2]);
  });
});

it("stateful operations: special and numeric keys -> retain native record or comparator order", () => {
  const record = createQueryable(Object.fromEntries([
    ["10", 10], ["2", 2], ["__proto__", 3], ["constructor", 4], ["toString", 5], ["absent", undefined],
  ]));
  const sorted = record[SORT]((a, b) => (b ?? -1) - (a ?? -1));

  for (const query of [record, sorted, sorted[LAZY]()]) {
    const entries = query[ENTRIES]();
    const [matching, nonmatching] = query[PARTITION]((value): boolean => value === undefined);

    expect(matching[ENTRIES]()).toEqual([["absent", undefined]]);
    expect(nonmatching[ENTRIES]()).toEqual(entries.filter(([, value]) => value !== undefined));
    expect(query[TAP](() => false)[ENTRIES]()).toEqual(entries);
    expect(query[SCAN]((sum, value) => sum + (value ?? 0), () => 0)[ENTRIES]())
      .toEqual(entries.map(([key], index) => [
        key, entries.slice(0, index + 1).reduce((sum, [, value]) => sum + (value ?? 0), 0),
      ]));
  }
  expect(sorted[ENTRIES]().map(([key]) => key)).toEqual(["10", "toString", "constructor", "__proto__", "2", "absent"]);
});

it("PARTITION: mutable record results -> changing one side leaves the other and source intact", () => {
  const source = createQueryable({ a: 1, b: 2 });
  const [matching, nonmatching] = source[PARTITION]((value): boolean => value === 1);

  matching.b = 99;
  delete nonmatching.b;

  expect(source[ENTRIES]()).toEqual([["a", 1], ["b", 2]]);
  expect(matching[ENTRIES]()).toEqual([["a", 1], ["b", 99]]);
  expect(nonmatching[ENTRIES]()).toEqual([]);
});

it("SCAN/TAP: live lazy chain -> demand, callback order and fresh partial reconsumption", () => {
  const source = createQueryable({ a: 1, b: 2, c: 3 });
  const trace: string[] = [];
  const query = source[LAZY]()[MAP]((value, key) => {
    trace.push(`map:${key}`);
    return value;
  })[SCAN]((sum, value, key) => {
    trace.push(`scan:${key}`);
    return sum + value;
  }, () => {
    trace.push("seed");
    return 0;
  })[TAP]((_value, key) => { trace.push(`tap:${key}`); });

  expect(query[LIMIT](0)[VALUES]()).toEqual([]);
  expect(trace).toEqual([]);
  expect(query[LIMIT](1)[VALUES]()).toEqual([1]);
  expect(trace).toEqual(["seed", "map:a", "scan:a", "tap:a"]);
  trace.length = 0;
  source.a = 10;
  expect(query[FIND](value => value >= 12)).toBe(12);
  expect(trace).toEqual(["seed", "map:a", "scan:a", "tap:a", "map:b", "scan:b", "tap:b"]);
  trace.length = 0;
  expect(query[SOME](value => value === 10)).toBe(true);
  expect(trace).toEqual(["seed", "map:a", "scan:a", "tap:a"]);
  trace.length = 0;
  expect(query[VALUES]()).toEqual([10, 12, 15]);
  expect(trace).toEqual([
    "seed", "map:a", "scan:a", "tap:a", "map:b", "scan:b", "tap:b", "map:c", "scan:c", "tap:c",
  ]);
});

it("SCAN: reentrant lazy consumption -> independent accumulator state", () => {
  let nested = false;
  let query: QuerySequence<number>;
  query = createQueryable({ a: 1, b: 2 })[LAZY]()[SCAN]((sum, value) => {
    if (!nested) {
      nested = true;
      expect(query[VALUES]()).toEqual([1, 3]);
      nested = false;
    }
    return sum + value;
  }, () => 0);

  expect(query[VALUES]()).toEqual([1, 3]);
});

it("stateful methods: separate chains -> shared frozen prototype functions", () => {
  const left = createQueryable({ a: 1 });
  const right = createQueryable({ b: 2 });
  const lazy = left[LAZY]();
  const ordered = right[SORT](() => 0);

  for (const symbol of [PARTITION, SCAN, TAP, EACH, THROUGH] as const) {
    expect(left[symbol]).toBe(right[symbol]);
    expect(lazy[symbol]).toBe(ordered[symbol]);
    expect(Object.hasOwn(left, symbol)).toBe(false);
    expect(Object.hasOwn(lazy, symbol)).toBe(false);
  }
  expect(left[EACH]).toBe(lazy[EACH]);
  expect(left[THROUGH]).toBe(lazy[THROUGH]);
  expect(Object.isFrozen(Object.getPrototypeOf(left))).toBe(true);
  expect(Object.isFrozen(Object.getPrototypeOf(lazy))).toBe(true);
});

it("stateful types: guards, factories and receivers -> preserve mode and exact return types", () => {
  const record = createQueryable<string | number>({});
  const sequence = record[LAZY]();

  expectTypeOf(record[PARTITION](value => typeof value === "string"))
    .toEqualTypeOf<[Queryable<string>, Queryable<string | number>]>();
  expectTypeOf(sequence[PARTITION](value => typeof value === "number"))
    .toEqualTypeOf<[QuerySequence<number>, QuerySequence<string | number>]>();
  expectTypeOf(record[PARTITION]((value): boolean => typeof value === "string"))
    .toEqualTypeOf<[Queryable<string | number>, Queryable<string | number>]>();
  expectTypeOf(record[SCAN]((sum, value, key) => {
    expectTypeOf(sum).toEqualTypeOf<number>();
    expectTypeOf(value).toEqualTypeOf<string | number>();
    expectTypeOf(key).toEqualTypeOf<string>();
    return sum + 1;
  }, () => 0)).toEqualTypeOf<Queryable<number>>();
  expectTypeOf(sequence[SCAN]((sum, value) => sum + String(value), () => ""))
    .toEqualTypeOf<QuerySequence<string>>();
  expectTypeOf(record[TAP](() => false)).toEqualTypeOf<Queryable<string | number>>();
  expectTypeOf(sequence[TAP](() => false)).toEqualTypeOf<QuerySequence<string | number>>();
  expectTypeOf(record[EACH]((_value, key) => { expectTypeOf(key).toEqualTypeOf<string>(); }))
    .toEqualTypeOf<void>();
  expectTypeOf(record[THROUGH](query => {
    expectTypeOf(query).toEqualTypeOf<typeof record>();
    return { answer: "yes" } as const;
  })).toEqualTypeOf<{ readonly answer: "yes" }>();
  const extended = Object.assign(sequence, { label: "extended" });
  expectTypeOf(extended[THROUGH](query => query)).toEqualTypeOf<typeof extended>();
  expectTypeOf<ThisParameterType<(typeof record)[typeof PARTITION]>>().toEqualTypeOf<typeof record>();
  expectTypeOf<ThisParameterType<(typeof record)[typeof SCAN]>>().toEqualTypeOf<typeof record>();
  expectTypeOf<ThisParameterType<(typeof sequence)[typeof TAP]>>().toEqualTypeOf<typeof sequence>();
  expectTypeOf<ThisParameterType<(typeof sequence)[typeof EACH]>>().toEqualTypeOf<typeof sequence>();
  expectTypeOf<ThisParameterType<(typeof sequence)[typeof THROUGH]>>().not.toEqualTypeOf<void>();
});
