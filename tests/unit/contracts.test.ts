import { describe, expect, it } from "vitest";
import {
  COUNT, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP, PICK, REDUCE,
  SOME, SORT, TO_OBJECT, VALUES, WHERE, createQueryable,
} from "../../src/index.js";
import type { QuerySequence } from "../../src/index.js";

const modes = ["record", "ordered", "lazy"] as const;
type Mode = typeof modes[number];

function inMode<T>(record: Record<string, T>, mode: Mode): QuerySequence<T> {
  const query = createQueryable(record);
  if (mode === "ordered") {
    return query[SORT](() => 0);
  }
  return mode === "lazy" ? query[LAZY]() : query;
}

describe.each(modes)("%s composition contracts", mode => {
  it("WHERE/MAP/LIMIT: keyed composition -> stage order and exact lazy short circuit", () => {
    const trace: string[] = [];
    const source = inMode({ a: 1, b: 2, c: 3, d: 4 }, mode);

    const result = source[WHERE]((value, key) => {
      trace.push(`where:${key}:${value}`);
      return value % 2 === 0;
    })[MAP]((value, key) => {
      trace.push(`map:${key}:${value}`);
      return value * 10;
    })[LIMIT](1);

    expect(trace).toEqual(mode === "lazy" ? [] : [
      "where:a:1", "where:b:2", "where:c:3", "where:d:4", "map:b:2", "map:d:4",
    ]);
    expect(result[ENTRIES]()).toEqual([["b", 20]]);
    expect(trace).toEqual(mode === "lazy" ? [
      "where:a:1", "where:b:2", "map:b:2",
    ] : [
      "where:a:1", "where:b:2", "where:c:3", "where:d:4", "map:b:2", "map:d:4",
    ]);
  });

  it("terminals: independent consumption -> fresh containers and stable values", () => {
    const value = { shared: true };
    const query = inMode({ a: value, b: value }, mode);

    const first = query[ENTRIES]();
    const second = query[ENTRIES]();
    const object = query[TO_OBJECT]();
    first.splice(0);
    delete object.a;

    expect(second).toEqual([["a", value], ["b", value]]);
    expect(query[ENTRIES]()).toEqual(second);
    expect(query[VALUES]()[0]).toBe(value);
    expect(query[COUNT]()).toBe(2);
  });

  it("values: Symbols and hostile proxies -> preserve identity without inspecting payloads", () => {
    const symbol = Symbol("payload");
    const fail = () => { throw new Error("opaque payload inspected"); };
    const proxy = new Proxy({}, {
      get: fail, ownKeys: fail, getPrototypeOf: fail, getOwnPropertyDescriptor: fail,
    });
    const query = inMode<unknown>({ symbol, proxy }, mode);

    const result = query[WHERE](() => true)[MAP](value => value)
      [SORT](() => 0)[PICK]("proxy", "symbol")[LIMIT](-1)[VALUES]();

    expect(result.length).toBe(1);
    expect(result[0]).toBe(proxy);
    expect(query[FIND]((_value, key) => key === "symbol")).toBe(symbol);
    expect(query[SOME](value => value === proxy)).toBe(true);
    expect(query[REDUCE]((count, _value) => count + 1, 0)).toBe(2);
    expect(query[GROUP_BY]((_value, key) => key).symbol?.[FIRST]()).toBe(symbol);
  });

  const failures = [
    ["WHERE", (query: QuerySequence<number>, fail: () => never) =>
      query[WHERE](fail)[VALUES]()],
    ["MAP", (query: QuerySequence<number>, fail: () => never) =>
      query[MAP](fail)[VALUES]()],
    ["SORT", (query: QuerySequence<number>, fail: () => never) =>
      query[SORT](fail)[VALUES]()],
    ["GROUP_BY", (query: QuerySequence<number>, fail: () => never) =>
      query[GROUP_BY](fail)],
    ["FIND", (query: QuerySequence<number>, fail: () => never) =>
      query[FIND](fail)],
    ["SOME", (query: QuerySequence<number>, fail: () => never) =>
      query[SOME](fail)],
    ["REDUCE", (query: QuerySequence<number>, fail: () => never) =>
      query[REDUCE](fail, 0)],
  ] as const;

  it.each(failures)("%s: callback throws -> propagates the exact thrown value", (_name, invoke) => {
    const query = inMode({ a: 1, b: 2 }, mode);
    const failure = Object.freeze({ reason: "sentinel" });
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

describe("lazy consumption boundaries", () => {
  const barriers = [
    ["SORT", (query: QuerySequence<number>) => query[SORT]((a, b) => b - a), 3],
    ["PICK", (query: QuerySequence<number>) => query[PICK]("c", "a"), 3],
    ["negative LIMIT", (query: QuerySequence<number>) => query[LIMIT](-1), 1],
  ] as const;

  it.each(barriers)("%s: FIRST after barrier -> consumes all upstream before downstream", (_name, barrier, first) => {
    const trace: string[] = [];
    const source = createQueryable({ a: 1, b: 2, c: 3 })[LAZY]()[MAP]((value, key) => {
      trace.push(`up:${key}`);
      return value;
    });
    const query = barrier(source)[MAP]((value, key) => {
      trace.push(`down:${key}`);
      return value;
    });

    expect(trace).toEqual([]);
    const result = query[FIRST]();

    expect(result).toBe(first);
    expect(trace).toEqual(["up:a", "up:b", "up:c", first === 3 ? "down:c" : "down:a"]);
  });

  it("GROUP_BY: lazy composition -> eager interleaved grouping and repeatable snapshots", () => {
    const trace: string[] = [];
    const source = createQueryable({ a: 1, b: 2, c: 3 });
    const query = source[LAZY]()[MAP]((value, key) => {
      trace.push(`map:${key}`);
      return value;
    });

    const groups = query[GROUP_BY]((value, key) => {
      trace.push(`group:${key}`);
      return value % 2 ? "odd" : "even";
    });

    expect(trace).toEqual(["map:a", "group:a", "map:b", "group:b", "map:c", "group:c"]);
    source.a = 99;
    expect(groups.odd?.[ENTRIES]()).toEqual([["a", 1], ["c", 3]]);
    expect(groups.odd?.[ENTRIES]()).toEqual([["a", 1], ["c", 3]]);
    expect(trace.length).toBe(6);
  });

  it.each(barriers)("%s: downstream LIMIT(0) -> bypasses upstream barrier entirely", (_name, barrier) => {
    const fail = () => { throw new Error("upstream must not execute"); };
    const query = barrier(createQueryable({ a: 1, b: 2 })[LAZY]()[MAP](fail));

    const result = query[LIMIT](0)[VALUES]();

    expect(result).toEqual([]);
  });

  it("GROUP_BY: upstream LIMIT(0) -> no mapping or grouping callbacks", () => {
    const fail = () => { throw new Error("empty input must not execute callbacks"); };
    const query = createQueryable({ a: 1 })[LAZY]()[MAP](fail)[LIMIT](0);

    const groups = query[GROUP_BY](fail);

    expect(Object.keys(groups)).toEqual([]);
  });

  it("LAZY: reentrant consumption of same chain -> independent cursors without lost entries", () => {
    const trace: string[] = [];
    let nested = false;
    let query: QuerySequence<number>;
    query = createQueryable({ a: 1, b: 2 })[LAZY]()[MAP]((value, key) => {
      trace.push(`${nested ? "inner" : "outer"}:${key}`);
      if (!nested && key === "a") {
        nested = true;
        expect(query[VALUES]()).toEqual([10, 20]);
        nested = false;
      }
      return value * 10;
    });

    const result = query[VALUES]();

    expect(result).toEqual([10, 20]);
    expect(trace).toEqual(["outer:a", "inner:a", "inner:b", "outer:b"]);
  });

  it("LAZY: partial consumption and deferred failure -> fresh retries observe live source", () => {
    const failure = Symbol("failure");
    const source = createQueryable({ a: 1, b: 2, c: 3 });
    const trace: string[] = [];
    let fail = true;
    const query = source[LAZY]()[MAP]((value, key) => {
      trace.push(key);
      if (fail && key === "b") {
        throw failure;
      }
      return value;
    });

    expect(query[FIRST]()).toBe(1);
    let caught: unknown;
    try {
      query[VALUES]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    fail = false;
    source.b = 20;
    const result = query[VALUES]();

    expect(result).toEqual([1, 20, 3]);
    expect(trace).toEqual(["a", "a", "b", "a", "b", "c"]);
  });
});

describe.each(modes)("%s bounded differential oracle", mode => {
  const fixtures: Record<string, number>[] = [
    {},
    { only: 0 },
    { 10: 2, 2: -1, z: 2, a: 0 },
    Object.fromEntries([["__proto__", 3], ["constructor", -2], ["toString", 1], ["z", 3]]),
  ];
  const bounds = [0, 1, -1, 2.9, -2.9, Infinity, -Infinity, NaN];

  it.each(fixtures)("composition: %j -> agrees with native entries and slice across bounds", record => {
    const initial = Object.entries(record);
    const expected = initial.filter(([, value]) => value >= 0)
      .map(([key, value]): [string, number] => [key, value * 2])
      .sort((a, b) => b[1] - a[1]);
    const source = inMode(record, mode);

    const result = source[WHERE](value => value >= 0)[MAP](value => value * 2)
      [SORT]((a, b) => b - a);

    for (const bound of bounds) {
      const entries = expected.slice(0, bound);
      expect(result[LIMIT](bound)[ENTRIES]()).toEqual(entries);
      expect(result[LIMIT](bound)[COUNT]()).toBe(entries.length);
      expect(result[LIMIT](bound)[REDUCE]((sum, value) => sum + value, 0))
        .toBe(entries.reduce((sum, [, value]) => sum + value, 0));
    }
    const requested = ["z", "2", "missing", "__proto__", "z", "only"];
    const picked = [...new Set(requested)].flatMap(key => expected.filter(([entryKey]) => entryKey === key));
    expect(result[PICK](...requested)[ENTRIES]()).toEqual(picked);
    expect(source[ENTRIES]()).toEqual(initial);
  });

  it("PICK: integer keys before SORT -> native record ordering differs from sequence ordering", () => {
    const record = { 1: 10, 2: 20, named: 30 };
    const source = inMode(record, mode);
    const requested = ["named", "2", "1", "2"];
    const entries: [string, number][] = [["named", 30], ["2", 20], ["1", 10]];

    const result = source[PICK](...requested)[ENTRIES]();

    expect(result).toEqual(mode === "record" ? Object.entries(Object.fromEntries(entries)) : entries);
  });
});
