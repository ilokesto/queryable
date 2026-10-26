import { describe, expect, it } from "vitest";
import {
  COUNT, ENTRIES, FIRST, GROUP_BY, LAZY, LIMIT, MAP, PICK, SORT, WHERE, createQueryable,
} from "./index.js";

describe("materialized terminal contracts", () => {
  it.each([undefined, 0, false, ""])(
    "COUNT/FIRST: materialized first value %s -> retain value and cardinality across chains",
    value => {
      const record = createQueryable({ a: value, b: value });
      const ordered = record[SORT](() => 0);
      const transformed = ordered[WHERE](() => true)[MAP](entry => entry)[LIMIT](1);
      const group = ordered[GROUP_BY](() => "all").all;

      const results = [ordered, ordered[LAZY](), transformed, group].map(query =>
        [query?.[COUNT](), query?.[FIRST]()]);

      expect(results).toEqual([[2, value], [2, value], [1, value], [2, value]]);
    },
  );

  it("COUNT/FIRST: mutable record and lazy view -> observe additions, deletions and new first value", () => {
    const record = createQueryable({ a: 1, b: 2 });
    const lazy = record[LAZY]();
    expect(record[COUNT]()).toBe(2);
    expect(lazy[COUNT]()).toBe(2);
    delete record.a;
    record.c = 3;
    delete record.b;

    const results = [record, lazy].map(query => [query[COUNT](), query[FIRST]()]);

    expect(results).toEqual([[1, 3], [1, 3]]);
  });

  it("COUNT/FIRST: pending callbacks after materialization -> execute independently on every consumption", () => {
    const trace: string[] = [];
    const lazy = createQueryable({ a: 1, b: 2 })[SORT](() => 0)[LAZY]()
      [WHERE]((value, key) => { trace.push(`where:${key}`); return value > 0; })
      [MAP]((value, key) => { trace.push(`map:${key}`); return value * 10; });

    const results = [lazy[FIRST](), lazy[COUNT](), lazy[FIRST]()];

    expect(results).toEqual([10, 2, 10]);
    expect(trace).toEqual([
      "where:a", "map:a",
      "where:a", "map:a", "where:b", "map:b",
      "where:a", "map:a",
    ]);
  });

  it("COUNT: pending callback throws after first entry -> propagates exact late failure", () => {
    const failure = Symbol("late");
    const lazy = createQueryable({ a: 1, b: 2 })[SORT](() => 0)[LAZY]()[MAP]((value, key) => {
      if (key === "b") { throw failure; }
      return value;
    });
    let caught: unknown;

    try { lazy[COUNT](); } catch (error) { caught = error; }

    expect(caught).toBe(failure);
    expect(lazy[FIRST]()).toBe(1);
  });

  it.each([COUNT, FIRST] as const)(
    "terminal %s: pending callback throws on first entry -> preserves thrown value",
    terminal => {
      const failure = Object.freeze({ reason: "first entry" });
      const lazy = createQueryable({ a: 1 })[SORT](() => 0)[LAZY]()[MAP](() => {
        throw failure;
      });
      let caught: unknown;

      try { lazy[terminal](); } catch (error) { caught = error; }

      expect(caught).toBe(failure);
    },
  );

  it("COUNT/FIRST: record and materialized chains -> share frozen prototype methods", () => {
    const record = createQueryable({ a: 1 });
    const ordered = record[SORT](() => 0);
    const lazy = ordered[LAZY]()[MAP](value => value);

    for (const query of [record, ordered, lazy]) {
      expect(query[COUNT]).toBe(record[COUNT]);
      expect(query[FIRST]).toBe(record[FIRST]);
      expect(Object.isFrozen(Object.getPrototypeOf(query))).toBe(true);
    }
  });
});

describe("sequence PICK buffering contracts", () => {
  it.each(["eager", "lazy"] as const)(
    "PICK: %s sequence with special, absent and duplicate keys -> emit requested unique entries",
    mode => {
      const ordered = createQueryable(Object.fromEntries([
        ["2", 2], ["a", 1], ["__proto__", undefined], ["constructor", 3], ["toString", 4],
      ]))[SORT](() => 0);
      const source = mode === "lazy" ? ordered[LAZY]() : ordered;
      const query = source[PICK]("toString", "missing", "__proto__", "2", "constructor", "2");

      const result = query[ENTRIES]();

      expect(result).toEqual([
        ["toString", 4], ["__proto__", undefined], ["2", 2], ["constructor", 3],
      ]);
      expect(query[ENTRIES]()).toEqual(result);
    },
  );

  it.each([[], ["a"], ["missing"]].map(keys => [keys] as const))(
    "PICK: requested keys %j -> consumes entire upstream before emitting downstream",
    keys => {
      const trace: string[] = [];
      const query = createQueryable({ a: 1, b: 2, c: 3 })[LAZY]()[MAP]((value, key) => {
        trace.push(`up:${key}`);
        return value;
      })[PICK](...keys)[MAP]((value, key) => {
        trace.push(`down:${key}`);
        return value;
      });

      const result = query[FIRST]();

      expect(result).toBe(keys[0] === "a" ? 1 : undefined);
      expect(trace).toEqual([
        "up:a", "up:b", "up:c", ...(keys[0] === "a" ? ["down:a"] : []),
      ]);
    },
  );

  it.each([[], ["a"], ["missing"]].map(keys => [keys] as const))(
    "PICK: keys %j and unrequested late failure -> throws before downstream and retries live input",
    keys => {
      const failure = Object.freeze({ reason: "late upstream" });
      const record = createQueryable({ a: 1, b: 2, c: 3 });
      const downstream: string[] = [];
      let fail = true;
      const query = record[LAZY]()[MAP]((value, key) => {
        if (fail && key === "c") { throw failure; }
        return value;
      })[PICK](...keys)[MAP]((value, key) => {
        downstream.push(key);
        return value;
      });
      let caught: unknown;

      try { query[FIRST](); } catch (error) { caught = error; }

      expect(caught).toBe(failure);
      expect(downstream).toEqual([]);
      fail = false;
      record.a = 10;
      expect(query[ENTRIES]()).toEqual(keys[0] === "a" ? [["a", 10]] : []);
    },
  );
});
