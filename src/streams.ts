import { createAsyncQuerySequence } from "./async.js";
import type { AsyncQuerySequence } from "./async.js";

type Entry<T> = readonly [string, T];

export interface StreamSourceOptions<T> {
  readonly signal?: AbortSignal;
  /** Called before awaiting the value; the ordinal starts at zero per consumption. */
  readonly key?: (value: T, ordinal: bigint) => string;
}

export interface EventSourceOptions<T> extends StreamSourceOptions<T> {
  readonly capacity: number;
  readonly overflow: "error" | "drop-oldest" | "drop-newest";
}

export interface EventTargetOptions extends EventSourceOptions<Event> {
  readonly errorEvent?: string;
  readonly endEvent?: string;
}

export interface EventEmitterOptions<T extends unknown[]> extends EventSourceOptions<T> {
  /** Defaults to "error"; failures use the first emitted argument unchanged. */
  readonly errorEvent?: string | symbol;
  readonly endEvent?: string | symbol;
}

/** Structural contract: importing this module never imports node:events. */
export interface EventEmitterSource<T extends unknown[]> {
  on(event: string | symbol, listener: (...args: T) => void): unknown;
  off(event: string | symbol, listener: (...args: T) => void): unknown;
}

export class EventQueueOverflowError extends Error {
  constructor(readonly capacity: number) {
    super(`Event queue capacity ${capacity} exceeded`);
    this.name = "EventQueueOverflowError";
  }
}

type Listen = (add: () => void, remove: () => void) => void;
type Connect<T> = (receive: (value: T) => void, fail: (error: unknown) => void, end: () => void, listen: Listen) => void;

function eventSequence<T>(options: EventSourceOptions<T>, connect: Connect<T>): AsyncQuerySequence<Awaited<T>> {
  const { capacity, overflow, signal, key } = options;
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new RangeError("Event queue capacity must be a positive safe integer");
  }
  if (overflow !== "error" && overflow !== "drop-oldest" && overflow !== "drop-newest") {
    throw new TypeError(`Unsupported event overflow policy: ${String(overflow)}`);
  }
  return createAsyncQuerySequence(() => {
    const queue: Entry<T>[] = [];
    const removers: (() => void)[] = [];
    let state: "open" | "complete" | "error" | "return" = "open";
    let failure: unknown;
    let ordinal = 0n;
    let pending: {
      resolve: (result: IteratorResult<Entry<T>>) => void;
      reject: (error: unknown) => void;
    } | undefined;

    function detach(): void {
      let failed = false;
      let error: unknown;
      for (const remove of removers.splice(0)) {
        try {
          remove();
        } catch (cause) {
          if (!failed) {
            failed = true;
            error = cause;
          }
        }
      }
      if (failed) {
        throw error;
      }
    }

    function settle(): void {
      if (!pending) {
        return;
      }
      const waiting = pending;
      pending = undefined;
      if (state === "error") {
        waiting.reject(failure);
        return;
      }
      const entry = queue.shift();
      if (entry) {
        waiting.resolve({ done: false, value: entry });
      } else if (state !== "open") {
        waiting.resolve({ done: true, value: undefined });
      } else {
        pending = waiting;
      }
    }

    function finish(next: "complete" | "error" | "return", error?: unknown): void {
      if (state !== "open") {
        return;
      }
      state = next;
      failure = error;
      if (next !== "complete") {
        queue.length = 0;
      }
      try {
        detach();
      } catch (cause) {
        if (next !== "error") {
          state = "error";
          failure = cause;
          queue.length = 0;
        }
      }
      settle();
    }

    const fail = (error: unknown): void => { finish("error", error); };
    const listen: Listen = (add, remove) => {
      if (state !== "open") {
        return;
      }
      let installed = false;
      let removalRequested = false;
      removers.push(() => {
        if (installed) {
          remove();
        } else {
          removalRequested = true;
        }
      });
      try {
        add();
      } finally {
        installed = true;
        if (removalRequested) {
          remove();
        }
      }
    };
    const receive = (value: T): void => {
      if (state !== "open") {
        return;
      }
      try {
        const index = ordinal;
        ordinal++;
        const entry: Entry<T> = [key ? key(value, index) : String(index), value];
        // A key callback may synchronously abort this subscription.
        if (state !== "open") {
          return;
        }
        if (queue.length === capacity) {
          if (overflow === "error") {
            fail(new EventQueueOverflowError(capacity));
            return;
          }
          if (overflow === "drop-newest") {
            return;
          }
          queue.shift();
        }
        queue.push(entry);
        settle();
      } catch (error) {
        // Host EventTarget dispatch must never receive callback exceptions.
        fail(error);
      }
    };
    try {
      if (signal) {
        const abort = (): void => { fail(signal.reason); };
        listen(
          () => { signal.addEventListener("abort", abort, { once: true }); },
          () => { signal.removeEventListener("abort", abort); },
        );
        if (signal.aborted) {
          abort();
        }
      }
      if (state === "open") {
        connect(receive, fail, () => { finish("complete"); }, listen);
      }
    } catch (error) {
      fail(error);
    }
    const iterator: AsyncIterableIterator<Entry<T>> = {
      [Symbol.asyncIterator]() { return this; },
      next(): Promise<IteratorResult<Entry<T>>> {
        return new Promise((resolve, reject) => {
          pending = { resolve, reject };
          settle();
        });
      },
      async return(): Promise<IteratorResult<Entry<T>>> {
        finish("return");
        queue.length = 0;
        if (state === "error") {
          throw failure;
        }
        return { done: true, value: undefined };
      },
    };
    return iterator;
  }, signal === undefined ? {} : { signal });
}

/** Hot, non-replaying events; each consumption owns an independent subscription. */
export function fromEventTarget(
  source: EventTarget,
  event: string,
  options: EventTargetOptions,
): AsyncQuerySequence<Event> {
  return eventSequence(options, (receive, fail, end, listen) => {
    const attach = (name: string, listener: (event: Event) => void): void => {
      listen(
        () => { source.addEventListener(name, listener); },
        () => { source.removeEventListener(name, listener); },
      );
    };
    if (options.errorEvent !== undefined) {
      attach(options.errorEvent, fail);
    }
    if (options.endEvent !== undefined) {
      attach(options.endEvent, end);
    }
    attach(event, receive);
  });
}

/** EventEmitter values are argument tuples, including zero-argument events. */
export function fromEventEmitter<T extends unknown[]>(
  source: EventEmitterSource<T>,
  event: string | symbol,
  options: EventEmitterOptions<T>,
): AsyncQuerySequence<T> {
  return eventSequence(options, (receive, fail, end, listen) => {
    const attach = (name: string | symbol, listener: (...args: T) => void): void => {
      listen(
        () => { source.on(name, listener); },
        () => { source.off(name, listener); },
      );
    };
    attach(options.errorEvent ?? "error", (...args) => { fail(args[0]); });
    if (options.endEvent !== undefined) {
      attach(options.endEvent, end);
    }
    attach(event, (...args) => { receive(args); });
  });
}

/**
 * Cold source: return a fresh, unlocked stream synchronously for every consumption.
 * Normal exhaustion releases; all other exits cancel then release the reader.
 */
export function fromReadableStream<T>(
  factory: (signal?: AbortSignal) => ReadableStream<T>,
  options: StreamSourceOptions<T> = {},
): AsyncQuerySequence<Awaited<T>> {
  const { signal, key } = options;
  return createAsyncQuerySequence(async function* () {
    signal?.throwIfAborted();
    const reader = factory(signal).getReader();
    let closing: Promise<void> | undefined;
    let exhausted = false;
    let failed = false;
    let ordinal = 0n;

    function close(cancel: boolean, reason?: unknown): Promise<void> {
      if (closing) {
        return closing;
      }
      signal?.removeEventListener("abort", abort);
      let cancellation: Promise<void>;
      try {
        cancellation = cancel ? reader.cancel(reason) : Promise.resolve();
      } catch (error) {
        cancellation = Promise.reject(error);
      }
      // Releasing does not wait for a producer's potentially non-settling cancel.
      try {
        reader.releaseLock();
        closing = cancellation;
      } catch (error) {
        closing = cancellation.then(() => { throw error; });
      }
      return closing;
    }
    function abort(): void {
      close(true, signal?.reason).catch(() => {});
    }

    signal?.addEventListener("abort", abort, { once: true });
    try {
      signal?.throwIfAborted();
      while (true) {
        const next = await reader.read();
        signal?.throwIfAborted();
        if (next.done) {
          exhausted = true;
          return;
        }
        yield [key ? key(next.value, ordinal) : String(ordinal), next.value];
        ordinal++;
      }
    } catch (error) {
      failed = true;
      close(true, error).catch(() => {});
      throw error;
    } finally {
      try {
        await close(!exhausted);
      } catch (error) {
        if (!failed) {
          throw error;
        }
      }
    }
  }, signal === undefined ? {} : { signal });
}
