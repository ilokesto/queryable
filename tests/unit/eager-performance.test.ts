import { describe, expect, it } from "vitest";
import { ENTRIES, LIMIT, MAP, WHERE, createQueryable } from "../../src/index.js";

describe("eager record iteration contracts", () => {
  it.each(["WHERE", "MAP"] as const)(
    "%s: callback mutates and reenters source -> retains current value and visits remaining live keys once",
    operation => {
      const source = createQueryable({ a: 1, b: 2, c: 3 });
      const trace: string[] = [];
      let nested: [string, number][] = [];
      Object.defineProperty(source, "c", {
        enumerable: true,
        get() { trace.push("get:c"); return 30; },
      });
      const callback = (value: number, key: string) => {
        trace.push(`${key}:${value}`);
        if (key === "a") {
          source.a = 99;
          delete source.b;
          source.late = 4;
          nested = source[LIMIT](1)[ENTRIES]();
        }
        return value;
      };

      const result = operation === "WHERE"
        ? source[WHERE]((value, key) => Boolean(callback(value, key)))
        : source[MAP](callback);

      expect(result[ENTRIES]()).toEqual([["a", 1], ["c", 30]]);
      expect(nested).toEqual([["a", 99]]);
      expect(trace).toEqual(["a:1", "get:c", "c:30"]);
      source.a = 100;
      expect(result[ENTRIES]()).toEqual([["a", 1], ["c", 30]]);
    },
  );

  it.each([0, -0, NaN, -Infinity, 0.9])(
    "LIMIT(%s): empty bound and throwing accessor -> returns fresh empty records without reads",
    bound => {
      const source = createQueryable({ a: 1 });
      Object.defineProperty(source, "a", {
        enumerable: true,
        get() { throw new Error("unexpected read"); },
      });

      const first = source[LIMIT](bound);
      const second = source[LIMIT](bound);

      expect(first[ENTRIES]()).toEqual([]);
      expect(second[ENTRIES]()).toEqual([]);
      expect(first).not.toBe(second);
    },
  );

  it("LIMIT: positive fractional bound -> reads only retained entries once", () => {
    const source = createQueryable({ a: 1, b: 2, c: 3 });
    const reads: string[] = [];
    for (const [key, value] of Object.entries(source)) {
      Object.defineProperty(source, key, {
        enumerable: true,
        get() { reads.push(key); return value; },
      });
    }

    const result = source[LIMIT](1.9);

    expect(result[ENTRIES]()).toEqual([["a", 1]]);
    expect(result[ENTRIES]()).toEqual([["a", 1]]);
    expect(reads).toEqual(["a"]);
  });

  it.each([-1, -4, Infinity])(
    "LIMIT(%s): late accessor throws -> preserves full reads and thrown identity",
    bound => {
      const source = createQueryable({ a: 1, b: 2 });
      const failure = Symbol("late getter");
      const reads: string[] = [];
      Object.defineProperty(source, "a", {
        enumerable: true,
        get() { reads.push("a"); return 1; },
      });
      Object.defineProperty(source, "b", {
        enumerable: true,
        get() { reads.push("b"); throw failure; },
      });
      let caught: unknown;

      try { source[LIMIT](bound); } catch (error) { caught = error; }

      expect(caught).toBe(failure);
      expect(reads).toEqual(["a", "b"]);
    },
  );
});
