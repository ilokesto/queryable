/// <reference types="node" />
import { EventEmitter, getEventListeners } from "node:events";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  DuplicateKeyError, ENTRIES, FIRST, LIMIT, MAP, VALUES, createAsyncQuerySequence,
  iterateAsyncValues,
} from "../../src/index.js";
import type { AsyncQuerySequence } from "../../src/index.js";
import { EventQueueOverflowError, fromEventEmitter, fromEventTarget, fromReadableStream } from "../../src/streams.js";
import type { EventEmitterSource } from "../../src/streams.js";

function controlled<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>(release => { resolve = release; });
  if (!resolve) {
    throw new Error("Missing resolver");
  }
  return { promise, resolve };
}

describe("event adapters", () => {
  it("fromEventTarget: unused, LIMIT(0), and pre-aborted -> never subscribes", async () => {
    const target = new EventTarget();
    const controller = new AbortController();
    const query = fromEventTarget(target, "data", { capacity: 1, overflow: "error" });
    const reason = {};
    controller.abort(reason);
    const aborted = fromEventTarget(target, "data", {
      capacity: 1, overflow: "error", signal: controller.signal,
    });

    expect(getEventListeners(target, "data")).toHaveLength(0);
    expect(await query[LIMIT](0)[VALUES]()).toEqual([]);
    await expect(aborted[VALUES]()).rejects.toBe(reason);
    expect(getEventListeners(target, "data")).toHaveLength(0);
  });

  it("fromEventTarget: hot repeat consumption -> no replay and fresh keys with shared methods", async () => {
    const target = new EventTarget();
    const query = fromEventTarget(target, "data", { capacity: 2, overflow: "error", endEvent: "end" });
    target.dispatchEvent(new Event("data"));
    expect(query[MAP]).toBe(createAsyncQuerySequence(() => [])[MAP]);

    for (let run = 0; run < 2; run++) {
      const consumption = query[ENTRIES]();
      expect(getEventListeners(target, "data")).toHaveLength(1);
      const first = new Event("data");
      const second = new Event("data");
      target.dispatchEvent(first);
      target.dispatchEvent(second);
      target.dispatchEvent(new Event("end"));
      expect(getEventListeners(target, "data")).toHaveLength(0);
      target.dispatchEvent(new Event("data"));
      expect(await consumption).toEqual([["0", first], ["1", second]]);
    }
  });

  it.each(["drop-oldest", "drop-newest"] as const)(
    "fromEventEmitter: %s during slow MAP -> bounded pending values and original event ordinals",
    async overflow => {
      const emitter = new EventEmitter();
      const entered = controlled<void>();
      const release = controlled<void>();
      const query = fromEventEmitter<[number]>(emitter, "data", {
        capacity: 2, overflow, endEvent: "end",
      })[MAP](async ([value]) => {
        if (value === 0) {
          entered.resolve();
          await release.promise;
        }
        return value;
      });
      const consumption = query[ENTRIES]();
      emitter.emit("data", 0);
      await entered.promise;

      emitter.emit("data", 1);
      emitter.emit("data", 2);
      emitter.emit("data", 3);
      emitter.emit("end");
      release.resolve();

      expect(await consumption).toEqual(overflow === "drop-oldest"
        ? [["0", 0], ["2", 2], ["3", 3]]
        : [["0", 0], ["1", 1], ["2", 2]]);
      expect(emitter.eventNames()).toEqual([]);
    },
  );

  it("fromEventEmitter: overflow burst -> immediate unsubscribe, discarded buffer, exact overflow", async () => {
    const emitter = new EventEmitter();
    const query = fromEventEmitter<[number]>(emitter, "data", { capacity: 1, overflow: "error" });
    const consumption = query[VALUES]();
    const rejection = expect(consumption).rejects.toMatchObject({
      name: "EventQueueOverflowError", capacity: 1,
    });

    emitter.emit("data", 1);
    emitter.emit("data", 2);

    expect(emitter.eventNames()).toEqual([]);
    emitter.emit("data", 3);
    await rejection;
    expect(new EventQueueOverflowError(1)).toBeInstanceOf(Error);
  });

  it.each([undefined, new Error("source")])(
    "fromEventEmitter: source error %s -> exact rejection and no remaining listeners",
    async failure => {
      const emitter = new EventEmitter();
      const query = fromEventEmitter<[unknown]>(emitter, "data", {
        capacity: 1, overflow: "error", endEvent: "end",
      });
      const consumption = query[VALUES]();
      const rejection = expect(consumption).rejects.toBe(failure);

      emitter.emit("error", failure);

      await rejection;
      expect(emitter.eventNames()).toEqual([]);
    },
  );

  it.each([undefined, new Error("key")])(
    "fromEventTarget: key callback throws %s -> dispatch stays safe and consumer fails exactly",
    async failure => {
      const target = new EventTarget();
      const query = fromEventTarget(target, "data", {
        capacity: 1, overflow: "error", key: () => { throw failure; },
      });
      const consumption = query[VALUES]();
      const rejection = expect(consumption).rejects.toBe(failure);

      expect(() => target.dispatchEvent(new Event("data"))).not.toThrow();

      await rejection;
      expect(getEventListeners(target, "data")).toHaveLength(0);
    },
  );

  it("fromEventTarget: source error event -> exact event identity and cleanup", async () => {
    const target = new EventTarget();
    const failure = new Event("failure");
    const result = fromEventTarget(target, "data", {
      capacity: 1, overflow: "error", errorEvent: "failure",
    })[VALUES]();
    const rejection = expect(result).rejects.toBe(failure);

    target.dispatchEvent(failure);

    await rejection;
    expect(getEventListeners(target, "failure")).toHaveLength(0);
    expect(getEventListeners(target, "data")).toHaveLength(0);
  });

  it("fromEventEmitter: FIRST and callback failure -> each listener removed once and late events ignored", async () => {
    const emitter = new EventEmitter();
    const removed: (string | symbol)[] = [];
    emitter.on("removeListener", (event: string | symbol) => { removed.push(event); });
    const query = fromEventEmitter<[number]>(emitter, "data", { capacity: 1, overflow: "error" });
    const first = query[FIRST]();
    emitter.emit("data", 1);
    expect(await first).toEqual([1]);
    expect(removed).toEqual(["error", "data"]);
    expect(emitter.emit("data", 2)).toBe(false);

    const failure = {};
    const consumption = query[MAP](() => { throw failure; })[VALUES]();
    const rejection = expect(consumption).rejects.toBe(failure);
    emitter.emit("data", 3);

    await rejection;
    expect(removed).toEqual(["error", "data", "error", "data"]);
  });

  it("fromEventTarget: pending public next and return -> configured abort interrupts and detaches immediately", async () => {
    const target = new EventTarget();
    const controller = new AbortController();
    const reason = {};
    const query = fromEventTarget(target, "data", {
      capacity: 1, overflow: "error", signal: controller.signal,
    });
    const iterator = iterateAsyncValues(query)[Symbol.asyncIterator]();
    const next = iterator.next();
    const rejection = expect(next).rejects.toBe(reason);
    const returned = iterator.return?.();
    expect(getEventListeners(target, "data")).toHaveLength(1);

    controller.abort(reason);

    expect(getEventListeners(target, "data")).toHaveLength(0);
    await rejection;
    expect(await returned).toEqual({ done: true, value: undefined });
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("fromEventEmitter: simultaneous consumption -> independent subscriptions and keys", async () => {
    const emitter = new EventEmitter();
    const query = fromEventEmitter<[string, number]>(emitter, "data", {
      capacity: 1, overflow: "error", endEvent: "end",
    });
    const left = query[ENTRIES]();
    const right = query[ENTRIES]();
    expect(emitter.listenerCount("data")).toBe(2);

    emitter.emit("data", "a", 1);
    emitter.emit("end");

    expect(await left).toEqual([["0", ["a", 1]]]);
    expect(await right).toEqual([["0", ["a", 1]]]);
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<[string, number]>>();
    expect(emitter.eventNames()).toEqual([]);
  });

  it("fromEventTarget: pending return without signal -> waits for source progress before cleanup", async () => {
    const target = new EventTarget();
    const iterator = iterateAsyncValues(fromEventTarget(target, "data", {
      capacity: 1, overflow: "error",
    }))[Symbol.asyncIterator]();
    const next = iterator.next();
    const returned = iterator.return?.();
    const event = new Event("data");

    expect(getEventListeners(target, "data")).toHaveLength(1);
    target.dispatchEvent(event);

    expect(await next).toEqual({ done: false, value: event });
    expect(await returned).toEqual({ done: true, value: undefined });
    expect(getEventListeners(target, "data")).toHaveLength(0);
  });

  it("fromEventEmitter: abort during registration -> removes even the listener installed after abort", async () => {
    const emitter = new EventEmitter();
    const controller = new AbortController();
    const reason = {};
    emitter.on("newListener", (name: string | symbol) => {
      if (name === "data") {
        controller.abort(reason);
      }
    });
    const query = fromEventEmitter<[number]>(emitter, "data", {
      capacity: 1, overflow: "error", signal: controller.signal,
    });

    await expect(query[VALUES]()).rejects.toBe(reason);

    expect(emitter.listenerCount("data")).toBe(0);
    expect(emitter.listenerCount("error")).toBe(0);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("fromEventTarget: selector aborts while dispatching -> exact abort and no leaked listener", async () => {
    const target = new EventTarget();
    const controller = new AbortController();
    const reason = {};
    const consumption = fromEventTarget(target, "data", {
      capacity: 1, overflow: "error", signal: controller.signal,
      key: () => { controller.abort(reason); return "ignored"; },
    })[VALUES]();
    const rejection = expect(consumption).rejects.toBe(reason);

    expect(() => target.dispatchEvent(new Event("data"))).not.toThrow();

    await rejection;
    expect(getEventListeners(target, "data")).toHaveLength(0);
  });

  it("fromEventEmitter: zero arguments and symbol names -> preserves empty tuples and ends cleanly", async () => {
    const emitter = new EventEmitter();
    const data = Symbol("data");
    const end = Symbol("end");
    const consumption = fromEventEmitter<[]>(emitter, data, {
      capacity: 1, overflow: "error", endEvent: end,
    })[ENTRIES]();

    emitter.emit(data);
    emitter.emit(end);

    expect(await consumption).toEqual([["0", []]]);
    expect(emitter.eventNames()).toEqual([]);
  });

  it("fromEventEmitter: special and duplicate selector keys -> preserves special keys and rejects duplicates", async () => {
    const emitter = new EventEmitter();
    const query = fromEventEmitter<[undefined]>(emitter, "data", {
      capacity: 2, overflow: "error", endEvent: "end", key: () => "__proto__",
    });
    const first = query[LIMIT](1)[ENTRIES]();
    emitter.emit("data", undefined);
    expect(await first).toEqual([["__proto__", [undefined]]]);
    const duplicate = query[ENTRIES]();
    const rejection = expect(duplicate).rejects.toBeInstanceOf(DuplicateKeyError);

    emitter.emit("data", undefined);
    emitter.emit("data", undefined);
    emitter.emit("end");

    await rejection;
    expect(emitter.eventNames()).toEqual([]);
  });

  it("fromEventEmitter: structural source cleanup throws -> primary failure wins including undefined", async () => {
    const emitter = new EventEmitter();
    const cleanupError = {};
    let removals = 0;
    const source: EventEmitterSource<[unknown]> = {
      on(event, listener) { emitter.on(event, listener); },
      off(event, listener) {
        removals++;
        emitter.off(event, listener);
        throw cleanupError;
      },
    };
    const query = fromEventEmitter(source, "data", { capacity: 1, overflow: "error" });
    const first = query[FIRST]();
    const cleanupRejection = expect(first).rejects.toBe(cleanupError);
    emitter.emit("data", 1);
    await cleanupRejection;
    const failed = query[VALUES]();
    const primaryRejection = expect(failed).rejects.toBeUndefined();

    emitter.emit("error", undefined);

    await primaryRejection;
    expect(removals).toBe(4);
    expect(emitter.eventNames()).toEqual([]);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "fromEventTarget: invalid capacity %s -> rejects before acquisition",
    capacity => {
      const target = new EventTarget();

      expect(() => fromEventTarget(target, "data", { capacity, overflow: "error" })).toThrow(RangeError);

      expect(getEventListeners(target, "data")).toHaveLength(0);
    },
  );
});

describe("readable stream adapter", () => {
  it.each(["complete", "early", "error", "abort"] as const)(
    "fromReadableStream: %s -> exactly one acquisition/release and cancellation only when needed",
    async mode => {
      const release = vi.spyOn(ReadableStreamDefaultReader.prototype, "releaseLock");
      const cancel = vi.spyOn(ReadableStreamDefaultReader.prototype, "cancel");
      const ready = controlled<ReadableStreamDefaultController<number>>();
      const pulled = controlled<void>();
      const controller = new AbortController();
      const reason = {};
      const stream = new ReadableStream<number>({
        start(source) { ready.resolve(source); },
        pull() { pulled.resolve(); },
      }, { highWaterMark: 0 });
      const acquire = vi.spyOn(stream, "getReader");
      try {
        const source = await ready.promise;
        const query = fromReadableStream(() => stream, { signal: controller.signal });
        const result = mode === "early" ? query[FIRST]() : query[VALUES]();
        const expected = mode === "error" || mode === "abort"
          ? expect(result).rejects.toBe(reason)
          : result;
        await pulled.promise;

        if (mode === "complete") {
          source.close();
        } else if (mode === "early") {
          source.enqueue(1);
        } else if (mode === "error") {
          source.error(reason);
        } else {
          controller.abort(reason);
        }
        await expected;

        expect(acquire).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledTimes(mode === "complete" ? 0 : 1);
        expect(stream.locked).toBe(false);
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
      } finally {
        acquire.mockRestore();
        cancel.mockRestore();
        release.mockRestore();
      }
    },
  );

  it("fromReadableStream: unused, LIMIT(0), pre-aborted -> no factory or reader acquisition", async () => {
    let acquisitions = 0;
    const factory = () => {
      acquisitions++;
      return new ReadableStream<number>();
    };
    const query = fromReadableStream(factory);
    const controller = new AbortController();
    const reason = {};
    controller.abort(reason);

    expect(await query[LIMIT](0)[VALUES]()).toEqual([]);
    await expect(fromReadableStream(factory, { signal: controller.signal })[VALUES]()).rejects.toBe(reason);

    expect(acquisitions).toBe(0);
  });

  it("fromReadableStream: fresh cold consumption -> awaited payloads, mapped keys and unlocked readers", async () => {
    const streams: ReadableStream<Promise<number> | undefined>[] = [];
    let cancellations = 0;
    const query = fromReadableStream(() => {
      const stream = new ReadableStream<Promise<number> | undefined>({
        start(controller) {
          controller.enqueue(Promise.resolve(2));
          controller.enqueue(undefined);
          controller.close();
        },
        cancel() { cancellations++; },
      });
      streams.push(stream);
      return stream;
    }, { key: (_value, ordinal) => ordinal === 0n ? "__proto__" : "constructor" });

    for (let run = 0; run < 2; run++) {
      expect(await query[MAP](async value => value)[ENTRIES]()).toEqual([
        ["__proto__", 2], ["constructor", undefined],
      ]);
    }

    expect(streams).toHaveLength(2);
    expect(streams.every(stream => !stream.locked)).toBe(true);
    expect(cancellations).toBe(0);
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<number | undefined>>();
  });

  it("fromReadableStream: empty source -> empty terminal and released reader", async () => {
    const stream = new ReadableStream<never>({ start(controller) { controller.close(); } });

    expect(await fromReadableStream(() => stream)[VALUES]()).toEqual([]);

    expect(stream.locked).toBe(false);
  });

  it("fromReadableStream: FIRST -> cancels once, releases immediately, and awaits cancellation", async () => {
    const cancelled = controlled<unknown>();
    const finishCancel = controlled<void>();
    let calls = 0;
    const stream = new ReadableStream<number>({
      start(controller) { controller.enqueue(7); },
      cancel(reason) {
        calls++;
        cancelled.resolve(reason);
        return finishCancel.promise;
      },
    });
    const result = fromReadableStream(() => stream)[FIRST]();

    expect(await cancelled.promise).toBeUndefined();
    expect(stream.locked).toBe(false);
    finishCancel.resolve();

    expect(await result).toBe(7);
    expect(calls).toBe(1);
  });

  it("fromReadableStream: pending read and queued return -> abort cancels once and unlocks without producer cooperation", async () => {
    const pulled = controlled<void>();
    const cancelled = controlled<unknown>();
    const cancelCompletion = controlled<void>();
    const controller = new AbortController();
    let cancellations = 0;
    const reason = {};
    const stream = new ReadableStream<number>({
      pull() { pulled.resolve(); },
      cancel(cause) {
        cancellations++;
        cancelled.resolve(cause);
        return cancelCompletion.promise;
      },
    }, { highWaterMark: 0 });
    const iterator = iterateAsyncValues(fromReadableStream(() => stream, {
      signal: controller.signal,
    }))[Symbol.asyncIterator]();
    const next = iterator.next();
    const rejection = expect(next).rejects.toBe(reason);
    await pulled.promise;
    const returned = iterator.return?.();

    controller.abort(reason);

    expect(stream.locked).toBe(false);
    expect(await cancelled.promise).toBe(reason);
    await rejection;
    expect(await returned).toEqual({ done: true, value: undefined });
    expect(cancellations).toBe(1);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    cancelCompletion.resolve();
  });

  it.each([undefined, new Error("read")])(
    "fromReadableStream: native read failure %s -> exact error and released lock",
    async failure => {
      const stream = new ReadableStream<number>({ start(controller) { controller.error(failure); } });

      await expect(fromReadableStream(() => stream)[VALUES]()).rejects.toBe(failure);

      expect(stream.locked).toBe(false);
    },
  );

  it("fromReadableStream: cleanup rejection -> replaces early success but not callback failure", async () => {
    const cleanupError = {};
    const streams: ReadableStream<number>[] = [];
    const query = fromReadableStream(() => {
      const stream = new ReadableStream<number>({
        start(controller) { controller.enqueue(1); },
        cancel() { throw cleanupError; },
      });
      streams.push(stream);
      return stream;
    });

    await expect(query[FIRST]()).rejects.toBe(cleanupError);
    await expect(query[MAP](() => { throw undefined; })[VALUES]()).rejects.toBeUndefined();

    expect(streams.every(stream => !stream.locked)).toBe(true);
  });

  it("fromReadableStream: key callback failure -> passes exact reason to cancel and releases", async () => {
    const reasons: unknown[] = [];
    const stream = new ReadableStream<number>({
      start(controller) { controller.enqueue(1); },
      cancel(reason) { reasons.push(reason); },
    });

    await expect(fromReadableStream(() => stream, {
      key: () => { throw undefined; },
    })[VALUES]()).rejects.toBeUndefined();

    expect(reasons).toEqual([undefined]);
    expect(stream.locked).toBe(false);
  });
});
