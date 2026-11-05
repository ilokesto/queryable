/// <reference types="node" />
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { DuplicateKeyError, iterateAsyncEntries } from "../../src/index.js";
import type { AsyncQuerySequence } from "../../src/index.js";
import { fromEventEmitter, fromEventTarget, fromReadableStream } from "../../src/streams.js";

type Adapter = "EventTarget" | "EventEmitter" | "ReadableStream";

function source(
  adapter: Adapter,
  key?: (value: unknown, ordinal: bigint) => string,
): { query: AsyncQuerySequence<unknown>; emit: () => void } {
  const options = key === undefined ? {} : { key };
  if (adapter === "EventTarget") {
    const target = new EventTarget();
    return {
      query: fromEventTarget(target, "data", { capacity: 1, overflow: "error", ...options }),
      emit: () => { target.dispatchEvent(new Event("data")); },
    };
  }
  if (adapter === "EventEmitter") {
    const emitter = new EventEmitter();
    return {
      query: fromEventEmitter<[number]>(emitter, "data", { capacity: 1, overflow: "error", ...options }),
      emit: () => { emitter.emit("data", 1); },
    };
  }
  return {
    query: fromReadableStream(() => new ReadableStream<number>({
      pull(controller) { controller.enqueue(1); },
    }, { highWaterMark: 0 }), options),
    emit: () => {},
  };
}

describe.each(["EventTarget", "EventEmitter", "ReadableStream"] as const)("%s key history", adapter => {
  it("default keys: repeated incremental consumption -> fresh ordinals without historical key writes", async () => {
    const { query, emit } = source(adapter);
    const add = Set.prototype.add;
    let historicalKeyWrites = 0;

    for (let run = 0; run < 2; run++) {
      const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
      // Count key-storage operations rather than asserting timing or heap thresholds.
      const writes = vi.spyOn(Set.prototype, "add").mockImplementation(function (this: Set<unknown>, value: unknown) {
        if (typeof value === "string" && /^\d+$/.test(value)) {
          historicalKeyWrites++;
        }
        return add.call(this, value);
      });
      try {
        for (let ordinal = 0; ordinal < 128; ordinal++) {
          const pending = iterator.next();
          emit();
          const next = await pending;
          if (next.done || next.value[0] !== String(ordinal)) {
            throw new Error("Expected a fresh consecutive ordinal key");
          }
        }
      } finally {
        writes.mockRestore();
        await iterator.return?.();
      }
    }

    expect(historicalKeyWrites).toBe(0);
  });

  it("caller keys: duplicate special key -> preserves the first entry and rejects the collision", async () => {
    const { query, emit } = source(adapter, () => "__proto__");
    const iterator = iterateAsyncEntries(query)[Symbol.asyncIterator]();
    const first = iterator.next();
    emit();
    expect((await first).value?.[0]).toBe("__proto__");

    const duplicate = iterator.next();
    emit();

    await expect(duplicate).rejects.toBeInstanceOf(DuplicateKeyError);
    await iterator.return?.();
  });
});
