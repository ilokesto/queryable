import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COUNT, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP, PICK, SOME, SORT,
  VALUES, WHERE, createQueryable, createQuerySequence, iterateValues,
} from "./index.js";
import type { QuerySequence } from "./index.js";

describe("adjacent lazy stages", () => {
  it("WHERE/MAP: changing types and branching -> original keys and exact per-entry stage order", () => {
    const trace: string[] = [];
    const source = createQueryable({ 2: 2, 1: 1, a: 3 })[LAZY]()
      [WHERE]((value, key) => { trace.push(`number:${key}:${value}`); return value > 1; })
      [MAP]((value, key) => { trace.push(`text:${key}:${value}`); return `${value}`; });
    const branch = source[MAP]((value, key) => {
      trace.push(`object:${key}:${value}`);
      return { text: value };
    })[WHERE]((value, key) => {
      trace.push(`keep:${key}:${value.text}`);
      return key === "a";
    })[MAP]((value, key) => {
      trace.push(`length:${key}:${value.text}`);
      return value.text.length;
    });

    const result = branch[ENTRIES]();

    expectTypeOf(branch).toEqualTypeOf<QuerySequence<number>>();
    expect(result).toEqual([["a", 1]]);
    expect(trace).toEqual([
      "number:1:1", "number:2:2", "text:2:2", "object:2:2", "keep:2:2",
      "number:a:3", "text:a:3", "object:a:3", "keep:a:3", "length:a:3",
    ]);
    expect(source[ENTRIES]()).toEqual([["2", "2"], ["a", "3"]]);
  });

  it("MAP/WHERE: opaque and undefined outputs -> no payload inspection or skipped stored values", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const symbol = Symbol("payload");
    const payloads: unknown[] = [undefined, symbol, proxy, false, null];
    const query = createQueryable(Object.fromEntries(payloads.map((value, index) => [`key${index}`, value])))
      [LAZY]()[MAP](value => ({ wrapped: value }))[MAP](value => value.wrapped)
      [WHERE]((_value, key) => key !== "key3")[MAP](value => value);

    const result = query[VALUES]();

    expect(result.length).toBe(4);
    expect(result[0]).toBeUndefined();
    expect(result[1]).toBe(symbol);
    expect(result[2]).toBe(proxy);
    expect(result[3]).toBeNull();
  });

  it("MAP/WHERE: reentrant middle callback -> separate output slots and live repeat consumption", () => {
    const record = createQueryable({ a: 1, b: 2 });
    const trace: string[] = [];
    let nested = false;
    let query: QuerySequence<string>;
    query = record[LAZY]()[MAP](value => value * 10)[WHERE]((value, key) => {
      trace.push(`${nested ? "inner" : "outer"}:${key}:${value}`);
      if (!nested && key === "a") {
        nested = true;
        expect(query[VALUES]()).toEqual(Object.values(record).map(item => String(item * 10)));
        nested = false;
      }
      return true;
    })[MAP](String);

    const result = query[VALUES]();

    expect(result).toEqual(["10", "20"]);
    expect(trace).toEqual(["outer:a:10", "inner:a:10", "inner:b:20", "outer:b:20"]);
    record.a = 3;
    expect(query[FIRST]()).toBe("30");
  });

  it("MAP/WHERE: interleaved consumers -> independent cursors and exactly one close each", () => {
    let closed = 0;
    const query = createQuerySequence(function* () {
      try { yield ["a", 1] as const; yield ["b", 2] as const; }
      finally { closed++; }
    })[MAP](value => value * 10)[WHERE](() => true)[MAP](String);
    const view = iterateValues(query);
    const first = view[Symbol.iterator]();
    const second = view[Symbol.iterator]();

    expect(first.next()).toEqual({ value: "10", done: false });
    expect(second.next()).toEqual({ value: "10", done: false });
    first.return?.();
    expect(second.next()).toEqual({ value: "20", done: false });
    second.return?.();

    expect(closed).toBe(2);
    expect(query[VALUES]()).toEqual(["10", "20"]);
    expect(closed).toBe(3);
  });

  const consumers = [
    ["FIRST", (query: QuerySequence<number>) => query[FIRST]()],
    ["FIND", (query: QuerySequence<number>) => query[FIND](value => value === 4)],
    ["SOME", (query: QuerySequence<number>) => query[SOME](value => value === 4)],
    ["LIMIT", (query: QuerySequence<number>) => query[LIMIT](1)[VALUES]()],
  ] as const;

  it.each(consumers)("%s: accepted prefix after several stages -> exact upstream stop and closure", (_name, consume) => {
    const trace: string[] = [];
    const query = createQuerySequence(function* () {
      try {
        for (const value of [1, 2, 3]) {
          trace.push(`source:${value}`);
          yield [`key${value}`, value] as const;
        }
      } finally { trace.push("closed"); }
    })[WHERE](value => value % 2 === 0)
      [MAP](value => { trace.push(`map:${value}`); return value * 2; })
      [WHERE](value => { trace.push(`where:${value}`); return true; });

    consume(query);

    expect(trace).toEqual(["source:1", "source:2", "map:2", "where:4", "closed"]);
  });

  it.each([0, 1, 2])("MAP/WHERE: failure at stage %s -> exact thrown value, cleanup and fresh retry", stage => {
    const failure = Symbol("callback failure");
    let closed = 0;
    let fail = true;
    const visit = (value: number, index: number) => {
      if (fail && stage === index) { throw failure; }
      return value;
    };
    const query = createQuerySequence(function* () {
      try { yield ["a", 1] as const; }
      finally { closed++; }
    })[MAP](value => visit(value, 0))[WHERE](value => visit(value, 1) > 0)
      [MAP](value => visit(value, 2));
    let caught: unknown;

    try { query[VALUES](); } catch (error) { caught = error; }

    expect(caught).toBe(failure);
    expect(closed).toBe(1);
    fail = false;
    expect(query[VALUES]()).toEqual([1]);
    expect(closed).toBe(2);
  });

  it("WHERE: every entry rejected after emission -> does not repeat the previous output", () => {
    const query = createQueryable({ a: 1, b: 2, c: 3 })[LAZY]()
      [MAP](value => value * 10)[WHERE](value => value === 10)[MAP](String);

    const result = query[VALUES]();

    expect(result).toEqual(["10"]);
    expect(query[COUNT]()).toBe(1);
  });

  const barriers = [
    ["SORT", (query: QuerySequence<number>) => query[SORT]((a, b) => b - a)],
    ["PICK", (query: QuerySequence<number>) => query[PICK]("c", "a")],
    ["negative LIMIT", (query: QuerySequence<number>) => query[LIMIT](-1)],
  ] as const;

  it.each(barriers)("%s: multi-stage sides and LIMIT(0) -> no source acquisition or callbacks", (_name, barrier) => {
    const fail = () => { throw new Error("zero limit must not acquire or execute upstream"); };
    const upstream = createQuerySequence<number>(fail)[MAP](fail)[WHERE](fail)[MAP](fail);
    const query = barrier(upstream)[WHERE](fail)[MAP](fail);

    const result = query[LIMIT](0)[VALUES]();

    expect(result).toEqual([]);
  });

  it("GROUP_BY: several fused stages -> eager interleaved groups remain snapshots", () => {
    const trace: string[] = [];
    const record = createQueryable({ a: 1, b: 2 });
    const query = record[LAZY]()[MAP]((value, key) => {
      trace.push(`map:${key}`);
      return value * 10;
    })[WHERE]((value, key) => {
      trace.push(`where:${key}`);
      return value > 0;
    })[MAP](String);

    const groups = query[GROUP_BY]((_value, key) => { trace.push(`group:${key}`); return "all"; });

    expect(trace).toEqual(["map:a", "where:a", "group:a", "map:b", "where:b", "group:b"]);
    record.a = 99;
    expect(groups.all?.[VALUES]()).toEqual(["10", "20"]);
    expect(groups.all?.[VALUES]()).toEqual(["10", "20"]);
    expect(groups.all?.[MAP]).toBe(query[MAP]);
    expect(Object.isFrozen(Object.getPrototypeOf(query))).toBe(true);
  });
});
