import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  COUNT, ENTRIES, FINALIZE, FIRST, LAZY, LIMIT, MAP, MAP_CONCURRENT, SORT, VALUES, WHERE,
  createAsyncQuerySequence, iterateAsyncEntries,
} from "./index.js";
import type { AsyncQuerySequence, ConcurrentMapOptions } from "./index.js";

function controlled<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  let reject: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  if (!resolve || !reject) {
    throw new Error("Promise executor did not initialize");
  }
  return { promise, resolve, reject };
}

function item<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Missing test item ${index}`);
  }
  return value;
}

describe("MAP_CONCURRENT", () => {
  it("options: invalid budgets -> throw before factory acquisition", () => {
    let acquired = 0;
    const source = createAsyncQuerySequence(() => { acquired++; return [["a", 1]]; });
    for (const invalid of [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      for (const name of ["concurrency", "prefetch", "reorderBuffer"] as const) {
        expect(() => source[MAP_CONCURRENT](value => value, { concurrency: 2, [name]: invalid })).toThrow(RangeError);
      }
    }
    expect(() => source[MAP_CONCURRENT](value => value, { concurrency: 0 })).toThrow(RangeError);
    expect(() => source[MAP_CONCURRENT](value => value, { concurrency: 1, prefetch: 0 })).toThrow(RangeError);
    const options = { concurrency: 1, ordered: true };
    Reflect.set(options, "ordered", "false");
    expect(() => source[MAP_CONCURRENT](value => value, options)).toThrow(TypeError);
    expect(acquired).toBe(0);
  });

  it("options: mutated after construction -> validated snapshot remains in effect", async () => {
    const options = { concurrency: 1, prefetch: 1, reorderBuffer: 0 };
    const query = createAsyncQuerySequence(() => [["a", 1]])[MAP_CONCURRENT](value => value, options);
    options.concurrency = 0;
    options.prefetch = 0;
    options.reorderBuffer = -1;

    expect(await query[VALUES]()).toEqual([1]);
  });

  it("shared API: awaited results, special keys and undefined -> retain identity and frozen methods", async () => {
    const input: ReadonlyArray<readonly [string, number | undefined]> = [
      ["__proto__", 1], ["2", undefined], ["constructor", 3],
    ];
    const source = createAsyncQuerySequence(() => input);
    const query = source[MAP_CONCURRENT](async (value, key, signal) => {
      expectTypeOf(signal).toEqualTypeOf<AbortSignal>();
      expect(input.some(entry => entry[0] === key)).toBe(true);
      return value;
    }, { concurrency: 3 });
    const typed: AsyncQuerySequence<number | undefined> = query;

    expect(await typed[ENTRIES]()).toEqual(input);
    expect(query[MAP_CONCURRENT]).toBe(source[LAZY]()[MAP_CONCURRENT]);
    expect(Object.isFrozen(Object.getPrototypeOf(query))).toBe(true);
    expectTypeOf(query[MAP_CONCURRENT]).thisParameter.toEqualTypeOf<AsyncQuerySequence<number | undefined>>();
  });

  it("empty and unused: no demand -> no callbacks or unnecessary acquisition", async () => {
    let acquisitions = 0;
    let callbacks = 0;
    const query = createAsyncQuerySequence<number>(() => { acquisitions++; return []; })
      [MAP_CONCURRENT](value => { callbacks++; return value; }, { concurrency: 2 });

    expect(await query[LIMIT](0)[VALUES]()).toEqual([]);
    expect(acquisitions).toBe(0);
    expect(await query[COUNT]()).toBe(0);
    expect(await query[FIRST]()).toBeUndefined();
    expect(acquisitions).toBe(2);
    expect(callbacks).toBe(0);
  });

  for (const ordered of [true, false]) {
    it(`emission: ordered=${ordered}, reversed readiness -> preserves keys in the selected order`, async () => {
      const gates = Array.from({ length: 3 }, () => controlled<number>());
      const started = controlled<void>();
      const completed = [controlled<void>(), controlled<void>(), controlled<void>()];
      const keys = ["__proto__", "2", "constructor"];
      let calls = 0;
      const query = createAsyncQuerySequence(() => keys.map((key, value) => [key, value] as const))
        [MAP_CONCURRENT]((value, key) => {
          expect(key).toBe(item(keys, value));
          if (++calls === 3) {
            started.resolve();
          }
          return item(gates, value).promise.then(result => {
            item(completed, value).resolve();
            return result;
          });
        }, { concurrency: 3, ordered });
      const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
      const first = iterator.next();
      await started.promise;

      item(gates, 2).resolve(30);
      await item(completed, 2).promise;
      if (!ordered) {
        expect(await first).toEqual({ done: false, value: ["constructor", 30] });
      }
      item(gates, 1).resolve(20);
      await item(completed, 1).promise;
      item(gates, 0).resolve(10);
      const entries = [(await first).value, (await iterator.next()).value, (await iterator.next()).value];

      expect(entries).toEqual(ordered
        ? [["__proto__", 10], ["2", 20], ["constructor", 30]]
        : [["constructor", 30], ["2", 20], ["__proto__", 10]]);
      expect((await iterator.next()).done).toBe(true);
    });
  }

  for (const options of ([
    { concurrency: 4, prefetch: 2, reorderBuffer: 1 },
    { concurrency: 2, prefetch: 1, reorderBuffer: 5 },
    { concurrency: 4, prefetch: 3, reorderBuffer: 0 },
  ] satisfies ConcurrentMapOptions[]).flatMap(options => [
    { ...options, ordered: true }, { ...options, ordered: false },
  ])) {
    it(`bounds: ${JSON.stringify(options)}, blocked head -> reserves completion and input capacity independently`, async () => {
      const gates = Array.from({ length: 12 }, () => controlled<number>());
      const headStarted = controlled<void>();
      const windowFilled = controlled<void>();
      const laterCompleted = controlled<void>();
      const width = Math.min(options.concurrency, options.reorderBuffer + 1);
      let pulled = 0;
      let started = 0;
      let completed = 0;
      let emitted = 0;
      let active = 0;
      let maximumActive = 0;
      const query = createAsyncQuerySequence(function* () {
        for (let value = 0; value < gates.length; value++) {
          pulled++;
          expect(pulled - started).toBeLessThanOrEqual(options.prefetch);
          if (pulled === width + options.prefetch) {
            windowFilled.resolve();
          }
          yield [String(value), value] as const;
        }
      })[MAP_CONCURRENT](value => {
        started++;
        active++;
        maximumActive = Math.max(active, maximumActive);
        expect(active).toBeLessThanOrEqual(options.concurrency);
        expect(started - emitted).toBeLessThanOrEqual(options.reorderBuffer + 1);
        if (value === 0) {
          headStarted.resolve();
        }
        return item(gates, value).promise.then(result => {
          active--;
          completed++;
          expect(completed - emitted).toBeLessThanOrEqual(options.reorderBuffer + 1);
          if (value === 1) {
            laterCompleted.resolve();
          }
          return result;
        });
      }, options);
      const result = (async () => {
        const values: number[] = [];
        for await (const [, value] of iterateAsyncEntries(query)) {
          emitted++;
          values.push(value);
        }
        return values;
      })();
      await headStarted.promise;
      await windowFilled.promise;
      expect(started).toBe(width);
      expect(pulled).toBe(width + options.prefetch);
      if (width > 1) {
        item(gates, 1).resolve(1);
        await laterCompleted.promise;
        if (options.ordered) {
          expect(started).toBe(width);
        }
      }

      gates.forEach((gate, value) => { gate.resolve(value); });

      const values = await result;
      expect(options.ordered ? values : [...values].sort((left, right) => left - right))
        .toEqual(gates.map((_, value) => value));
      expect(maximumActive).toBe(width);
    });
  }

  it("slow consumer: paused between demands -> no new callbacks or pulls after the finite window", async () => {
    const gates = Array.from({ length: 8 }, () => controlled<number>());
    const prefetched = controlled<void>();
    const completed = controlled<void>();
    let pulls = 0;
    let starts = 0;
    let finishes = 0;
    const query = createAsyncQuerySequence(function* () {
      for (let value = 0; value < gates.length; value++) {
        if (++pulls === 5) {
          prefetched.resolve();
        }
        yield [String(value), value] as const;
      }
    })[MAP_CONCURRENT](value => {
      starts++;
      return item(gates, value).promise.then(result => {
        if (++finishes === 3) {
          completed.resolve();
        }
        return result;
      });
    }, { concurrency: 3, prefetch: 2, reorderBuffer: 2 });
    const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
    const first = iterator.next();
    await prefetched.promise;
    item(gates, 0).resolve(0);
    expect((await first).value).toEqual(["0", 0]);

    item(gates, 1).resolve(1);
    item(gates, 2).resolve(2);
    await completed.promise;

    expect(starts).toBe(3);
    expect(pulls).toBe(5);
    await iterator.return?.();
  });

  it("pending extra next: ready mapper -> FIRST settles before non-cooperative source, with one eventual close", async () => {
    const entered = controlled<void>();
    const pending = controlled<IteratorResult<readonly [string, number]>>();
    const closed = controlled<void>();
    const parent = new AbortController();
    let pulls = 0;
    let closes = 0;
    let child: AbortSignal | undefined;
    const query = createAsyncQuerySequence(signal => {
      expect(signal).toBe(parent.signal);
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              if (++pulls === 1) {
                return Promise.resolve({ done: false, value: ["a", 1] } as const);
              }
              entered.resolve();
              return pending.promise;
            },
            async return() {
              closes++;
              closed.resolve();
              return { done: true, value: undefined } as const;
            },
          };
        },
      };
    }, { signal: parent.signal })[MAP_CONCURRENT]((value, _, signal) => {
      child = signal;
      return entered.promise.then(() => value);
    }, { concurrency: 2 });

    expect(await query[FIRST]()).toBe(1);

    expect(child?.aborted).toBe(true);
    expect(child).not.toBe(parent.signal);
    expect(parent.signal.aborted).toBe(false);
    expect(pulls).toBe(2);
    pending.reject(new Error("late upstream rejection"));
    await closed.promise;
    expect(closes).toBe(1);
  });

  it("early break: pending sibling mapper -> abort child and observe later rejection without waiting", async () => {
    const started = controlled<void>();
    const closed = controlled<void>();
    const head = controlled<number>();
    const pending = controlled<number>();
    const signals: AbortSignal[] = [];
    let closes = 0;
    const source = createAsyncQuerySequence(function* () {
      try {
        yield ["a", 1] as const;
        yield ["b", 2] as const;
        yield ["c", 3] as const;
      } finally {
        closes++;
        closed.resolve();
      }
    });
    const query = source[MAP_CONCURRENT]((value, _, signal) => {
      signals.push(signal);
      if (value === 2) {
        started.resolve();
      }
      return value === 1 ? head.promise : pending.promise;
    }, { concurrency: 2 });
    const result = (async () => {
      for await (const entry of iterateAsyncEntries(query)) {
        return entry;
      }
      return undefined;
    })();
    await started.promise;

    head.resolve(10);
    expect(await result).toEqual(["a", 10]);
    await closed.promise;
    pending.reject(Symbol("late mapper failure"));

    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(closes).toBe(1);
  });

  it("failure while consumer paused: sibling rejection -> starts exactly one close before another demand", async () => {
    const started = controlled<void>();
    const closed = controlled<void>();
    const head = controlled<number>();
    const sibling = controlled<number>();
    const reason = Symbol("paused failure");
    let calls = 0;
    let closes = 0;
    const query = createAsyncQuerySequence(function* () {
      try {
        for (let value = 0; value < 10; value++) {
          yield [String(value), value] as const;
        }
      } finally {
        closes++;
        closed.resolve();
      }
    })[MAP_CONCURRENT](value => {
      if (++calls === 2) {
        started.resolve();
      }
      return value === 0 ? head.promise : sibling.promise;
    }, { concurrency: 2 });
    const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
    const first = iterator.next();
    await started.promise;
    head.resolve(0);
    expect((await first).value).toEqual(["0", 0]);

    sibling.reject(reason);
    await closed.promise;

    expect(closes).toBe(1);
    expect(calls).toBe(2);
    await expect(iterator.next()).rejects.toBe(reason);
    await iterator.return?.();
    await iterator.return?.();
    expect(closes).toBe(1);
  });

  it("synchronous mapper throw: first input -> preserves identity and never launches another callback", async () => {
    const reason = Symbol("synchronous failure");
    let calls = 0;
    const query = createAsyncQuerySequence(() => [["a", 1], ["b", 2]])
      [MAP_CONCURRENT](() => { calls++; throw reason; }, { concurrency: 3, prefetch: 3 });

    await expect(query[VALUES]()).rejects.toBe(reason);

    expect(calls).toBe(1);
  });

  for (const reason of [undefined, 0, Symbol("middle mapper failure")]) {
    it(`mapper failure: ${String(reason)}, pending siblings -> preserves thrown identity and stops queued consumers`, async () => {
      const started = controlled<void>();
      const gates = Array.from({ length: 3 }, () => controlled<number>());
      let calls = 0;
      const query = createAsyncQuerySequence(() => [["a", 0], ["b", 1], ["c", 2], ["d", 3]])
        [MAP_CONCURRENT](value => {
          if (++calls === 3) {
            started.resolve();
          }
          return item(gates, value).promise;
        }, { concurrency: 3 });
      const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
      const failed = expect(iterator.next()).rejects.toBe(reason);
      const queued = iterator.next();
      await started.promise;

      item(gates, 1).reject(reason);
      await failed;

      expect(await queued).toEqual({ done: true, value: undefined });
      expect(calls).toBe(3);
      item(gates, 0).reject("late head");
      item(gates, 2).reject("late tail");
      await iterator.return?.();
      await iterator.return?.();
    });
  }

  it("source failure: pending mapper -> rejects immediately and closes source once", async () => {
    const started = controlled<void>();
    const pending = controlled<number>();
    const reason = Symbol("upstream");
    let closes = 0;
    let pulls = 0;
    const query = createAsyncQuerySequence(() => ({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (++pulls === 1) {
              return { done: false, value: ["a", 1] } as const;
            }
            await started.promise;
            throw reason;
          },
          async return() {
            closes++;
            return { done: true, value: undefined } as const;
          },
        };
      },
    }))[MAP_CONCURRENT](() => { started.resolve(); return pending.promise; }, { concurrency: 2 });

    await expect(query[FIRST]()).rejects.toBe(reason);
    pending.reject("late mapper");

    expect(closes).toBe(1);
    expect(pulls).toBe(2);
  });

  it("configured abort: pending pull and callback -> exact reason, one close, balanced listeners", async () => {
    const parent = new AbortController();
    const entered = controlled<void>();
    const pendingPull = controlled<IteratorResult<readonly [string, number]>>();
    const pendingMap = controlled<number>();
    const reason = Symbol("abort");
    const add = vi.spyOn(parent.signal, "addEventListener");
    const remove = vi.spyOn(parent.signal, "removeEventListener");
    let pulls = 0;
    let closes = 0;
    let child: AbortSignal | undefined;
    const query = createAsyncQuerySequence(() => ({
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (++pulls === 1) {
              return Promise.resolve({ done: false, value: ["a", 1] } as const);
            }
            entered.resolve();
            return pendingPull.promise;
          },
          async return() {
            closes++;
            return { done: true, value: undefined } as const;
          },
        };
      },
    }), { signal: parent.signal })[MAP_CONCURRENT]((_, __, signal) => {
      child = signal;
      return pendingMap.promise;
    }, { concurrency: 2 });
    const rejected = expect(query[VALUES]()).rejects.toBe(reason);
    await entered.promise;

    parent.abort(reason);
    await rejected;

    expect(child?.reason).toBe(reason);
    expect(closes).toBe(1);
    expect(pulls).toBe(2);
    expect(remove.mock.calls.length).toBe(add.mock.calls.length);
    pendingPull.reject("late pull");
    pendingMap.reject("late mapper");
    add.mockRestore();
    remove.mockRestore();
  });

  it("pre-aborted signal: first demand -> rejects before acquisition and never invokes mapper", async () => {
    const controller = new AbortController();
    const reason = Symbol("already aborted");
    controller.abort(reason);
    let acquired = 0;
    let mapped = 0;
    const query = createAsyncQuerySequence(() => { acquired++; return [["a", 1]]; }, { signal: controller.signal })
      [MAP_CONCURRENT](value => { mapped++; return value; }, { concurrency: 2 });

    await expect(query[FIRST]()).rejects.toBe(reason);
    await expect(query[FIRST]()).rejects.toBe(reason);

    expect(acquired).toBe(0);
    expect(mapped).toBe(0);
  });

  it("repeat and simultaneous consumption: live source -> independent cursors and child signals", async () => {
    const input = [["a", 1], ["b", 2]] satisfies Array<[string, number]>;
    const bothStarted = controlled<void>();
    const release = controlled<void>();
    const signals = new Set<AbortSignal>();
    let acquisitions = 0;
    const query = createAsyncQuerySequence(() => { acquisitions++; return input; })
      [MAP_CONCURRENT]((value, _, signal) => {
        signals.add(signal);
        if (signals.size === 2) {
          bothStarted.resolve();
        }
        return release.promise.then(() => value * 2);
      }, { concurrency: 2 })[LAZY]();
    const first = query[VALUES]();
    const second = query[VALUES]();
    await bothStarted.promise;

    release.resolve();
    expect(await first).toEqual([2, 4]);
    expect(await second).toEqual([2, 4]);
    input.push(["c", 3]);

    expect(await query[VALUES]()).toEqual([2, 4, 6]);
    expect(acquisitions).toBe(3);
    expect(signals.size).toBe(3);
    expect([...signals].every(signal => signal.aborted)).toBe(true);
  });

  it("ordinary MAP and composition: concurrent stage -> sequential MAP, filtering and sorting retain contracts", async () => {
    const head = controlled<number>();
    const started = controlled<void>();
    let calls = 0;
    const source = createAsyncQuerySequence(() => [["a", 1], ["b", 2], ["c", 3]]);
    const sequential = source[MAP](value => {
      calls++;
      if (value === 1) {
        started.resolve();
        return head.promise;
      }
      return value;
    });
    const result = sequential[VALUES]();
    await started.promise;
    expect(calls).toBe(1);
    head.resolve(1);
    expect(await result).toEqual([1, 2, 3]);
    const outcomes: string[] = [];

    const entries = await source[MAP_CONCURRENT](async value => value * 2, { concurrency: 2 })
      [WHERE](value => value > 2)[SORT]((left, right) => right - left)
      [FINALIZE](outcome => { outcomes.push(outcome.reason); })[ENTRIES]();

    expect(entries).toEqual([["c", 6], ["b", 4]]);
    expect(outcomes).toEqual(["complete"]);
  });
});
