import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DuplicateKeyError, ENTRIES, FALLBACK, FINALIZE, FIND, FIRST, LIMIT, MAP, ON_COMPLETE, VALUES,
  createAsyncQuerySequence, createRetryAsyncQuerySequence, iterateAsyncEntries, iterateAsyncValues,
} from "../../src/index.js";
import type { AsyncQuerySequence, ConsumptionOutcome } from "../../src/index.js";

function controlled<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((release, fail) => { resolve = release; reject = fail; });
  return { promise, resolve, reject };
}

describe("explicit async fallback", () => {
  it("FALLBACK: source fails after a prefix -> preserves prefix and switches once with error identity", async () => {
    const failure = {};
    const trace: unknown[] = [];
    const query = createAsyncQuerySequence<number>(async function* () {
      try {
        yield ["a", 1];
        throw failure;
      } finally {
        trace.push("closed");
      }
    })[FALLBACK]((error, signal) => {
      trace.push(error, signal);
      return [["b", Promise.resolve("fallback")]];
    });

    const entries = await query[ENTRIES]();

    expect(entries).toEqual([["a", 1], ["b", "fallback"]]);
    expect(trace).toEqual(["closed", failure, undefined]);
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<number | string>>();
  });

  it.each(["factory", "value", "mapper"] as const)(
    "FALLBACK: %s rejects -> recovers upstream failure without changing its identity",
    async stage => {
      const failure = {};
      let received: unknown;
      const query = createAsyncQuerySequence<number | Promise<number>>(() => {
        if (stage === "factory") { throw failure; }
        return [["a", stage === "value" ? Promise.reject(failure) : 1]];
      })[MAP](value => {
        if (stage === "mapper") { throw failure; }
        return value;
      })[FALLBACK](error => { received = error; return [["b", 2]]; });

      const values = await query[VALUES]();

      expect(values).toEqual([2]);
      expect(received).toBe(failure);
    },
  );

  it.each(["empty", "success", "limit"] as const)(
    "FALLBACK: %s without upstream failure -> never acquires fallback",
    async stage => {
      let calls = 0;
      const query = createAsyncQuerySequence<number>(() => stage === "empty" ? [] : [["a", 1]])
        [FALLBACK](() => { calls++; return [["b", 2]]; });

      const values = await (stage === "limit" ? query[LIMIT](0) : query)[VALUES]();

      expect(values).toEqual(stage === "success" ? [1] : []);
      expect(calls).toBe(0);
    },
  );

  it.each(["empty", "error"] as const)(
    "FALLBACK: fallback %s -> completes empty or propagates its own failure without recursion",
    async stage => {
      const failure = {};
      let calls = 0;
      const query = createAsyncQuerySequence<never>(() => { throw "source"; })
        [FALLBACK](() => {
          calls++;
          if (stage === "error") { throw failure; }
          return [];
        });

      const result = query[VALUES]();

      if (stage === "error") { await expect(result).rejects.toBe(failure); }
      else { expect(await result).toEqual([]); }
      expect(calls).toBe(1);
    },
  );

  it.each(["body", "map", "find", "throw"] as const)(
    "FALLBACK: downstream %s fails -> does not recover consumer errors",
    async stage => {
      const failure = {};
      let calls = 0;
      let closed = 0;
      const query = createAsyncQuerySequence<number>(function* () {
        try { yield ["a", 1]; yield ["b", 2]; } finally { closed++; }
      })[FALLBACK](() => { calls++; return [["fallback", 3]]; });
      const consume = async () => {
        if (stage === "map") {
          await query[MAP](() => { throw failure; })[VALUES]();
        } else if (stage === "find") {
          await query[FIND](() => { throw failure; });
        } else if (stage === "throw") {
          const iterator = iterateAsyncValues(query)[Symbol.asyncIterator]();
          await iterator.next();
          if (!iterator.throw) { throw new Error("Missing generator throw"); }
          await iterator.throw(failure);
        } else {
          for await (const _value of iterateAsyncValues(query)) { throw failure; }
        }
      };

      await expect(consume()).rejects.toBe(failure);

      expect(calls).toBe(0);
      expect(closed).toBe(1);
    },
  );

  it.each(["error", "first", "last"] as const)(
    "FALLBACK: duplicate key across source and fallback with %s -> applies one boundary policy",
    async duplicateKeys => {
      const query = createAsyncQuerySequence<number>(function* () {
        yield ["a", 1];
        yield ["b", 2];
        throw "source";
      })[FALLBACK](() => [["a", 3], ["c", 4], ["c", 5]], { duplicateKeys });
      const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();

      if (duplicateKeys === "last") {
        expect(await iterator.next()).toEqual({ done: false, value: ["a", 3] });
        expect(await iterator.next()).toEqual({ done: false, value: ["b", 2] });
        expect(await iterator.next()).toEqual({ done: false, value: ["c", 5] });
        expect((await iterator.next()).done).toBe(true);
      } else {
        expect(await iterator.next()).toEqual({ done: false, value: ["a", 1] });
        expect(await iterator.next()).toEqual({ done: false, value: ["b", 2] });
        if (duplicateKeys === "error") {
          await expect(iterator.next()).rejects.toBeInstanceOf(DuplicateKeyError);
        } else {
          expect(await iterator.next()).toEqual({ done: false, value: ["c", 4] });
          expect((await iterator.next()).done).toBe(true);
        }
      }
    },
  );

  it("FALLBACK: nested cleanup also fails -> fallback sees primary error and outer hook sees completion", async () => {
    const failure = {};
    const outcomes: ConsumptionOutcome[] = [];
    let received: unknown;
    const query = createAsyncQuerySequence<number>(function* () { throw failure; })
      [FINALIZE](outcome => { outcomes.push(outcome); throw "cleanup"; })
      [FALLBACK](error => { received = error; return [["a", 1]]; })
      [FINALIZE](outcome => { outcomes.push(outcome); });

    expect(await query[VALUES]()).toEqual([1]);

    expect(received).toBe(failure);
    expect(outcomes).toEqual([{ reason: "error", error: failure }, { reason: "complete" }]);
  });

  it("FALLBACK: empty fallback after a prefix -> completes with the already visible prefix", async () => {
    const query = createAsyncQuerySequence<number>(function* () {
      yield ["a", 1];
      throw "source";
    })[FALLBACK](() => []);

    const values = await query[VALUES]();

    expect(values).toEqual([1]);
  });

  it("FALLBACK: fallback pull and cleanup fail -> propagates fallback primary failure without another switch", async () => {
    const failure = {};
    let calls = 0;
    let closes = 0;
    const query = createAsyncQuerySequence<never>(() => { throw "source"; })
      [FALLBACK](() => {
        calls++;
        return {
          [Symbol.iterator]() {
            return {
              next(): IteratorResult<readonly [string, number]> { throw failure; },
              return(): IteratorResult<readonly [string, number]> { closes++; throw "cleanup"; },
            };
          },
        };
      });

    await expect(query[VALUES]()).rejects.toBe(failure);

    expect(calls).toBe(1);
    expect(closes).toBe(1);
  });

  it("FALLBACK: second consumption and early return -> fresh fallback state and cleanup per consumption", async () => {
    let calls = 0;
    let closes = 0;
    const query = createAsyncQuerySequence<never>(() => { throw "source"; })
      [FALLBACK](function* () {
        calls++;
        try { yield ["a", calls]; yield ["b", 0]; } finally { closes++; }
      });

    expect(await query[FIRST]()).toBe(1);
    expect(await query[FIRST]()).toBe(2);

    expect(closes).toBe(2);
    expect(query[FALLBACK]).toBe(createAsyncQuerySequence(() => [])[FALLBACK]);
    expect(Object.isFrozen(Object.getPrototypeOf(query))).toBe(true);
    expect(Object.hasOwn(query, FALLBACK)).toBe(false);
  });

  it.each(["source", "fallback"] as const)(
    "FALLBACK: abort during pending %s -> rejects exact reason and never recovers cancellation",
    async stage => {
      const controller = new AbortController();
      const entered = controlled<void>();
      const release = controlled<number>();
      const value: PromiseLike<number> = {
        then(onfulfilled, onrejected) {
          entered.resolve();
          return release.promise.then(onfulfilled, onrejected);
        },
      };
      const reason = {};
      let calls = 0;
      const query = createAsyncQuerySequence<PromiseLike<number>>(() => {
        if (stage === "fallback") { throw "source"; }
        return [["a", value]];
      }, { signal: controller.signal })[FALLBACK]((_error, signal) => {
        expect(signal).toBe(controller.signal);
        calls++;
        return [["b", value]];
      });

      const result = query[VALUES]();
      const rejection = expect(result).rejects.toBe(reason);
      await entered.promise;
      controller.abort(reason);

      await rejection;
      release.reject("late rejection");
      expect(calls).toBe(stage === "source" ? 0 : 1);
    },
  );
});

describe("fresh-factory buffered async retry", () => {
  it("createRetryAsyncQuerySequence: failed partial attempt -> buffers output but repeats source effects", async () => {
    const trace: string[] = [];
    let attempts = 0;
    const query = createRetryAsyncQuerySequence<number>(function* () {
      const attempt = ++attempts;
      try {
        trace.push(`effect:${attempt}`);
        yield ["a", attempt];
        if (attempt % 2 === 1) { throw "retry"; }
        yield ["b", 3];
      } finally { trace.push(`close:${attempt}`); }
    }, 1);

    expect(await query[ENTRIES]()).toEqual([["a", 2], ["b", 3]]);
    expect(await query[ENTRIES]()).toEqual([["a", 4], ["b", 3]]);

    expect(trace).toEqual(["effect:1", "close:1", "effect:2", "close:2", "effect:3", "close:3", "effect:4", "close:4"]);
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<number>>();
  });

  it("createRetryAsyncQuerySequence: controlled failed prefix -> exposes no value before successful exhaustion", async () => {
    const entered = controlled<void>();
    const release = controlled<void>();
    let attempts = 0;
    const query = createRetryAsyncQuerySequence<number>(async function* () {
      attempts++;
      yield ["a", attempts];
      if (attempts === 1) {
        entered.resolve();
        await release.promise;
        throw "retry";
      }
    }, 1);
    let settled = false;

    const first = query[FIRST]().finally(() => { settled = true; });
    await entered.promise;
    expect(settled).toBe(false);
    release.resolve();

    expect(await first).toBe(2);
    expect(attempts).toBe(2);
  });

  it.each([0, 1, 3])(
    "createRetryAsyncQuerySequence: retries=%s exhausted -> throws last exact error after bounded attempts",
    async retries => {
      let attempts = 0;
      const failures = Array.from({ length: retries + 1 }, () => ({}));
      const query = createRetryAsyncQuerySequence<never>(() => { throw failures[attempts++]; }, retries);

      await expect(query[VALUES]()).rejects.toBe(failures[retries]);

      expect(attempts).toBe(retries + 1);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "createRetryAsyncQuerySequence: invalid retries=%s -> rejects before acquisition",
    retries => {
      let calls = 0;

      expect(() => createRetryAsyncQuerySequence(() => { calls++; return []; }, retries)).toThrow(RangeError);

      expect(calls).toBe(0);
    },
  );

  it("createRetryAsyncQuerySequence: captured exhausted cursor -> preserves failure rather than treating closed cursor as empty success", async () => {
    const failure = {};
    let pulls = 0;
    let closes = 0;
    const cursor = (function* () {
      try { pulls++; yield ["a", 1] as const; throw failure; } finally { closes++; }
    })();
    const query = createRetryAsyncQuerySequence(() => cursor, 5);

    await expect(query[VALUES]()).rejects.toBe(failure);

    expect(pulls).toBe(1);
    expect(closes).toBe(1);
  });

  it("createRetryAsyncQuerySequence: repeatable iterable -> requests a distinct iterator for each retry", async () => {
    let attempts = 0;
    const source = {
      *[Symbol.iterator]() {
        if (++attempts === 1) { throw "retry"; }
        yield ["a", Promise.resolve(1)] as const;
      },
    };

    const query = createRetryAsyncQuerySequence(() => source, 1);

    expect(await query[VALUES]()).toEqual([1]);
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<number>>();
  });

  it("createRetryAsyncQuerySequence: cleanup rejects alongside source -> retains primary identity on exhaustion", async () => {
    const failure = {};
    let closes = 0;
    const query = createRetryAsyncQuerySequence<number>(() => ({
      [Symbol.iterator]() {
        return {
          next(): IteratorResult<readonly [string, number]> { throw failure; },
          return(): IteratorResult<readonly [string, number]> { closes++; throw "cleanup"; },
        };
      },
    }), 2);

    await expect(query[VALUES]()).rejects.toBe(failure);

    expect(closes).toBe(3);
  });

  it("createRetryAsyncQuerySequence: return accessor -> reads once and retains raw iterator receiver", async () => {
    const failure = {};
    let reads = 0;
    let closes = 0;
    const query = createRetryAsyncQuerySequence<number>(() => ({
      [Symbol.iterator]() {
        const iterator: Iterator<readonly [string, number]> = {
          next() { throw failure; },
          get return() {
            reads++;
            return function (this: Iterator<readonly [string, number]>): IteratorResult<readonly [string, number]> {
              expect(this).toBe(iterator);
              closes++;
              return { done: true, value: undefined };
            };
          },
        };
        return iterator;
      },
    }), 1);

    await expect(query[VALUES]()).rejects.toBe(failure);

    expect(reads).toBe(2);
    expect(closes).toBe(2);
  });

  it("createRetryAsyncQuerySequence: mapped query built inside factory -> restarts mapper with fresh lifetime hooks", async () => {
    let maps = 0;
    const outcomes: ConsumptionOutcome[] = [];
    const query = createRetryAsyncQuerySequence(() => iterateAsyncEntries(
      createAsyncQuerySequence(() => [["a", 1]] as const)
        [MAP](value => {
          if (++maps === 1) { throw "mapper"; }
          return value + 1;
        })
        [FINALIZE](outcome => { outcomes.push(outcome); }),
    ), 1);

    const values = await query[VALUES]();

    expect(values).toEqual([2]);
    expect(outcomes).toEqual([{ reason: "error", error: "mapper" }, { reason: "complete" }]);
  });

  it.each(["error", "first", "last"] as const)(
    "createRetryAsyncQuerySequence: duplicate keys with %s -> applies standard policy within attempts",
    async duplicateKeys => {
      let calls = 0;
      const query = createRetryAsyncQuerySequence(() => {
        calls++;
        return [["a", 1], ["a", 2]] as const;
      }, 1, { duplicateKeys });

      const result = query[VALUES]();

      if (duplicateKeys === "error") {
        await expect(result).rejects.toBeInstanceOf(DuplicateKeyError);
        expect(calls).toBe(2);
      } else {
        expect(await result).toEqual([duplicateKeys === "first" ? 1 : 2]);
        expect(calls).toBe(1);
      }
    },
  );

  it.each(["before", "second"] as const)(
    "createRetryAsyncQuerySequence: abort %s attempt -> starts no further retry and preserves reason",
    async stage => {
      const controller = new AbortController();
      const entered = controlled<void>();
      const release = controlled<never>();
      const reason = {};
      let attempts = 0;
      const query = createRetryAsyncQuerySequence<number>(signal => {
        expect(signal).toBe(controller.signal);
        attempts++;
        if (attempts === 1) { throw "retry"; }
        entered.resolve();
        return release.promise;
      }, 4, { signal: controller.signal });
      if (stage === "before") { controller.abort(reason); }

      const result = query[VALUES]();
      const rejection = expect(result).rejects.toBe(reason);
      if (stage === "second") {
        await entered.promise;
        controller.abort(reason);
      }

      await rejection;
      if (stage === "second") { release.reject("late rejection"); }
      expect(attempts).toBe(stage === "before" ? 0 : 2);
    },
  );

  it("createRetryAsyncQuerySequence: downstream failure -> does not retry callbacks outside the factory", async () => {
    let calls = 0;
    const failure = {};
    const query = createRetryAsyncQuerySequence(() => { calls++; return [["a", 1]] as const; }, 3)
      [MAP](() => { throw failure; });

    await expect(query[VALUES]()).rejects.toBe(failure);

    expect(calls).toBe(1);
  });

  it("createRetryAsyncQuerySequence: abort pending pull with cleanup failure -> closes once without retry", async () => {
    const controller = new AbortController();
    const entered = controlled<void>();
    const pending = controlled<IteratorResult<readonly [string, number]>>();
    const reason = {};
    let attempts = 0;
    let closes = 0;
    const query = createRetryAsyncQuerySequence<number>(() => {
      attempts++;
      return {
        [Symbol.asyncIterator]() {
          return {
            next() { entered.resolve(); return pending.promise; },
            async return(): Promise<IteratorResult<readonly [string, number]>> { closes++; throw "cleanup"; },
          };
        },
      };
    }, 3, { signal: controller.signal });

    const result = query[VALUES]();
    const rejection = expect(result).rejects.toBe(reason);
    await entered.promise;
    controller.abort(reason);

    await rejection;
    pending.reject("late rejection");
    expect(attempts).toBe(1);
    expect(closes).toBe(1);
  });

  it("createRetryAsyncQuerySequence: empty success -> completes once and runs outer completion hook", async () => {
    let calls = 0;
    let completes = 0;
    const query = createRetryAsyncQuerySequence(() => { calls++; return []; }, 3)
      [ON_COMPLETE](() => { completes++; });

    expect(await query[VALUES]()).toEqual([]);

    expect(calls).toBe(1);
    expect(completes).toBe(1);
  });
});
