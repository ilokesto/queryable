import { describe, expect, it } from "vitest";
import { FIRST, MAP, VALUES, createQuerySequence } from "../../src/index.js";

describe.each([1, 2, 32])("lazy mapping at %s stages", depth => {
  it("FIRST: upstream cleanup throws -> preserves cleanup failure and stops after the first entry", () => {
    const failure = Symbol("cleanup failure");
    const trace: string[] = [];
    let query = createQuerySequence<undefined>(function* () {
      try {
        trace.push("source");
        yield ["__proto__", undefined] as const;
        trace.push("unreachable");
        yield ["later", undefined] as const;
      } finally {
        trace.push("closed");
        throw failure;
      }
    });
    for (let stage = 0; stage < depth; stage++) {
      query = query[MAP]((value, key) => {
        trace.push(`${stage}:${key}`);
        return value;
      });
    }
    let caught: unknown;

    try { query[FIRST](); } catch (error) { caught = error; }

    expect(caught).toBe(failure);
    expect(trace).toEqual([
      "source", ...Array.from({ length: depth }, (_, stage) => `${stage}:__proto__`), "closed",
    ]);
  });

  it("MAP: callback and cleanup both throw -> preserves callback failure and retries with fresh consumption", () => {
    const failure = Symbol("callback failure");
    const cleanupFailure = Symbol("cleanup failure");
    let closed = 0;
    let fail = true;
    let query = createQuerySequence<number>(function* () {
      try {
        yield ["a", 1] as const;
      } finally {
        closed++;
        if (fail) { throw cleanupFailure; }
      }
    });
    for (let stage = 0; stage < depth; stage++) {
      query = query[MAP](value => {
        if (fail && stage === depth - 1) { throw failure; }
        return value + 1;
      });
    }
    let caught: unknown;

    try { query[VALUES](); } catch (error) { caught = error; }

    expect(caught).toBe(failure);
    expect(closed).toBe(1);
    fail = false;
    expect(query[VALUES]()).toEqual([1 + depth]);
    expect(closed).toBe(2);
  });
});
