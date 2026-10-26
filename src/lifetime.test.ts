import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  COUNT, FINALIZE, FIND, FIRST, GROUP_BY, LIMIT, MAP, ON_COMPLETE, SOME,
  SORT, VALUES, WHERE, createAsyncQuerySequence, iterateAsyncEntries,
} from "./index.js";
import type { ConsumptionOutcome } from "./index.js";

function controlled<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>(release => { resolve = release; });
  if (!resolve) {
    throw new Error("Promise executor did not initialize its resolver");
  }
  return { promise, resolve };
}

describe("async cancellation and lifetime", () => {
  it.each(["sort", "negative limit", "last"] as const)(
    "%s buffer: abort after first output -> rejects instead of yielding buffered values",
    async mode => {
      const controller = new AbortController();
      const reason = Symbol("buffer cancellation");
      const source = createAsyncQuerySequence(function* () {
        yield ["a", 1] as const;
        yield ["b", 2] as const;
        yield ["c", 3] as const;
        if (mode === "last") {
          yield ["a", 4] as const;
        }
      }, { signal: controller.signal, duplicateKeys: mode === "last" ? "last" : "error" });
      const query = mode === "sort" ? source[SORT]((a, b) => b - a)
        : mode === "negative limit" ? source[LIMIT](-1) : source;
      const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
      expect((await iterator.next()).done).toBe(false);

      controller.abort(reason);

      await expect(iterator.next()).rejects.toBe(reason);
      await iterator.return?.();
    },
  );

  it("SORT comparator aborts: completed sort -> rejects before emitting any buffered result", async () => {
    const controller = new AbortController();
    const reason = Symbol("comparator cancellation");
    const query = createAsyncQuerySequence(() => [["a", 2], ["b", 1]], { signal: controller.signal })
      [SORT]((a, b) => { controller.abort(reason); return a - b; });

    await expect(query[VALUES]()).rejects.toBe(reason);
  });

  it("signal: source and keyed callbacks -> receive the exact configured signal", async () => {
    const { signal } = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const query = createAsyncQuerySequence(sourceSignal => {
      seen.push(sourceSignal);
      return [["a", 1]];
    }, { signal })[MAP]((value, key, callbackSignal) => {
      expect(key).toBe("a");
      seen.push(callbackSignal);
      expectTypeOf(callbackSignal).toEqualTypeOf<AbortSignal | undefined>();
      return value;
    })[WHERE]((value, key, callbackSignal) => {
      seen.push(callbackSignal);
      return value === 1 && key === "a";
    });

    const found = await query[FIND]((_, __, callbackSignal) => {
      seen.push(callbackSignal);
      return true;
    });

    expect(found).toBe(1);
    expect(seen).toEqual([signal, signal, signal, signal]);
  });

  it("pre-aborted: first demand -> reject exact reason without acquiring a source", async () => {
    const controller = new AbortController();
    const reason = Symbol("cancel");
    controller.abort(reason);
    let acquired = 0;
    const query = createAsyncQuerySequence(() => {
      acquired++;
      return [["a", 1]];
    }, { signal: controller.signal });

    await expect(query[FIRST]()).rejects.toBe(reason);

    expect(acquired).toBe(0);
  });

  it("pending next: abort -> settles, attempts one close and removes listeners", async () => {
    const controller = new AbortController();
    const entered = controlled<void>();
    const pending = controlled<IteratorResult<readonly [string, number]>>();
    const reason = { cancelled: true };
    let closes = 0;
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const query = createAsyncQuerySequence(() => ({
      [Symbol.asyncIterator]() {
        return {
          next() {
            entered.resolve();
            return pending.promise;
          },
          async return() {
            closes++;
            return { done: true, value: undefined } as const;
          },
        };
      },
    }), { signal: controller.signal });
    const result = query[FIRST]();
    const rejection = expect(result).rejects.toBe(reason);
    await entered.promise;

    controller.abort(reason);
    await rejection;
    pending.resolve({ done: false, value: ["late", 1] });

    expect(closes).toBe(1);
    expect(remove.mock.calls.length).toBe(add.mock.calls.length);
    add.mockRestore();
    remove.mockRestore();
  });

  it("pending callback: abort -> no later output and cooperative signal is available", async () => {
    const controller = new AbortController();
    const entered = controlled<void>();
    const pending = controlled<number>();
    const reason = Symbol("callback cancellation");
    let closed = 0;
    let calls = 0;
    const query = createAsyncQuerySequence(function* () {
      try {
        yield ["a", 1] as const;
        yield ["b", 2] as const;
      } finally {
        closed++;
      }
    }, { signal: controller.signal })[MAP]((_, __, signal) => {
      calls++;
      expect(signal).toBe(controller.signal);
      entered.resolve();
      return pending.promise;
    });
    const result = query[VALUES]();
    const rejection = expect(result).rejects.toBe(reason);
    await entered.promise;

    controller.abort(reason);
    await rejection;
    pending.resolve(99);

    expect(closed).toBe(1);
    expect(calls).toBe(1);
  });

  it("natural completion versus early result -> only completion runs ON_COMPLETE", async () => {
    const outcomes: ConsumptionOutcome[] = [];
    let complete = 0;
    const query = createAsyncQuerySequence(() => [["a", 1], ["b", 2]])
      [ON_COMPLETE](() => { complete++; })
      [FINALIZE](outcome => { outcomes.push(outcome); });

    expect(await query[COUNT]()).toBe(2);
    expect(await query[FIRST]()).toBe(1);

    expect(complete).toBe(1);
    expect(outcomes).toEqual([{ reason: "complete" }, { reason: "return" }]);
  });

  it("callback failure plus finalizer failure -> preserve primary error identity", async () => {
    const primary = Symbol("primary");
    const cleanup = Symbol("cleanup");
    const outcomes: ConsumptionOutcome[] = [];
    const query = createAsyncQuerySequence(() => [["a", 1]])
      [MAP](() => { throw primary; })
      [FINALIZE](outcome => { outcomes.push(outcome); throw cleanup; });

    await expect(query[COUNT]()).rejects.toBe(primary);

    expect(outcomes).toEqual([{ reason: "error", error: primary }]);
  });

  it("successful traversal plus failing finalizer -> reject cleanup error", async () => {
    const error = Symbol("cleanup");
    const query = createAsyncQuerySequence(() => [["a", 1]])
      [FINALIZE](() => { throw error; });

    await expect(query[COUNT]()).rejects.toBe(error);
  });

  it("empty source -> completes and finalizes without invoking value callbacks", async () => {
    const hooks: string[] = [];
    const query = createAsyncQuerySequence<number>(() => [])
      [MAP](() => { throw new Error("unused"); })
      [ON_COMPLETE](() => { hooks.push("complete"); })
      [FINALIZE](outcome => { hooks.push(outcome.reason); });

    expect(await query[COUNT]()).toBe(0);

    expect(hooks).toEqual(["complete", "complete"]);
  });

  it("next failure plus return failure -> finalizer observes the original error", async () => {
    const reason = Symbol("next failure");
    const outcomes: ConsumptionOutcome[] = [];
    let closed = 0;
    const query = createAsyncQuerySequence<number>(() => ({
      [Symbol.asyncIterator]() {
        return {
          next() { throw reason; },
          return() { closed++; throw new Error("secondary"); },
        };
      },
    }), { signal: new AbortController().signal })
      [FINALIZE](outcome => { outcomes.push(outcome); });

    await expect(query[COUNT]()).rejects.toBe(reason);

    expect(closed).toBe(1);
    expect(outcomes).toEqual([{ reason: "error", error: reason }]);
  });

  it("unused and LIMIT0: no demand -> no source, completion or finalization", async () => {
    let acquired = 0;
    const hooks: string[] = [];
    const query = createAsyncQuerySequence(() => {
      acquired++;
      return [["a", 1]];
    })[ON_COMPLETE](() => { hooks.push("complete"); })
      [FINALIZE](() => { hooks.push("finalize"); });

    expect(await query[LIMIT](0)[COUNT]()).toBe(0);

    expect(acquired).toBe(0);
    expect(hooks).toEqual([]);
  });

  it("consumer return twice -> finalizes once and shared methods stay frozen", async () => {
    let finalized = 0;
    const source = createAsyncQuerySequence(() => [["a", 1], ["b", 2]]);
    const query = source[FINALIZE](() => { finalized++; });
    const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
    await iterator.next();

    await iterator.return?.();
    await iterator.return?.();

    expect(finalized).toBe(1);
    expect(query[FINALIZE]).toBe(source[FINALIZE]);
    expect(query[ON_COMPLETE]).toBe(source[ON_COMPLETE]);
    expect(Object.isFrozen(Object.getPrototypeOf(query))).toBe(true);
  });

  it("consumer throw -> preserves error identity and closes the upstream stage once", async () => {
    let finalized = 0;
    const reason = Symbol("consumer");
    const query = createAsyncQuerySequence(() => [["a", 1], ["b", 2]])
      [FINALIZE](() => { finalized++; });
    const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
    await iterator.next();
    if (!iterator.throw) {
      throw new Error("Expected an async generator view");
    }

    await expect(iterator.throw(reason)).rejects.toBe(reason);
    await iterator.return?.();

    expect(finalized).toBe(1);
  });

  it("abort finalizer: awaited cleanup -> preserves abort reason after cleanup settles", async () => {
    const controller = new AbortController();
    const entered = controlled<void>();
    const pending = controlled<IteratorResult<readonly [string, number]>>();
    const finalizing = controlled<void>();
    const release = controlled<void>();
    const outcomes: ConsumptionOutcome[] = [];
    const reason = Symbol("abort");
    const query = createAsyncQuerySequence(() => ({
      [Symbol.asyncIterator]() {
        return {
          next() { entered.resolve(); return pending.promise; },
          async return() { return { done: true, value: undefined } as const; },
        };
      },
    }), { signal: controller.signal })[FINALIZE](async outcome => {
      outcomes.push(outcome);
      finalizing.resolve();
      await release.promise;
    });
    let settled = false;
    const result = query[COUNT]().finally(() => { settled = true; });
    const rejection = expect(result).rejects.toBe(reason);
    await entered.promise;

    controller.abort(reason);
    await finalizing.promise;
    expect(settled).toBe(false);
    release.resolve();
    await rejection;

    expect(outcomes).toEqual([{ reason: "abort", error: reason }]);
    pending.resolve({ done: true, value: undefined });
  });

  it("SOME and GROUP_BY callbacks -> receive signal without changing eager group semantics", async () => {
    const { signal } = new AbortController();
    const query = createAsyncQuerySequence(() => [["a", 1]], { signal });
    const seen: (AbortSignal | undefined)[] = [];
    const found = await query[SOME]((_, __, current) => { seen.push(current); return true; });
    const groups = await query[GROUP_BY]((_, __, current) => { seen.push(current); return "one"; });

    expect(found).toBe(true);
    expect(await groups.one?.[VALUES]()).toEqual([1]);
    expect(seen).toEqual([signal, signal]);
  });
});
