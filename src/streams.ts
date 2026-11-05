import { createAsyncQuerySequence, createUniqueAsyncQuerySequence } from "./async.js";
import type { AsyncQuerySequence } from "./async.js";

type Entry<T> = readonly [string, T];

/** Key generation and cancellation shared by cold streams and hot subscriptions. */
export interface StreamSourceOptions<T> {
  /** Stops consumption with the signal's exact reason and releases source resources. */
  readonly signal?: AbortSignal;
  /** Called before awaiting the value; the ordinal starts at zero per consumption. */
  readonly key?: (value: T, ordinal: bigint) => string;
}

/** Explicit bounded buffering policy for each independent hot subscription. */
export interface EventSourceOptions<T> extends StreamSourceOptions<T> {
  /** Positive safe-integer maximum number of pending events. */
  readonly capacity: number;
  /** Fail and discard the queue, or discard the oldest/newest pending event when full. */
  readonly overflow: "error" | "drop-oldest" | "drop-newest";
}

/** EventTarget event names; neither error nor completion is inferred by default. */
export interface EventTargetOptions extends EventSourceOptions<Event> {
  /** Optional event whose Event object becomes the exact failure. */
  readonly errorEvent?: string;
  /** Optional event that detaches listeners and drains queued data before completion. */
  readonly endEvent?: string;
}

/** EventEmitter event names and bounded buffering of emitted argument tuples. */
export interface EventEmitterOptions<T extends unknown[]> extends EventSourceOptions<T> {
  /** Defaults to "error"; failures use the first emitted argument unchanged. */
  readonly errorEvent?: string | symbol;
  /** Optional completion event; queued data is drained after listeners detach. */
  readonly endEvent?: string | symbol;
}

/** Structural contract: importing this module never imports node:events. */
export interface EventEmitterSource<T extends unknown[]> {
  /** Installs a listener; the return value is ignored by the adapter. */
  on(event: string | symbol, listener: (...args: T) => void): unknown;
  /** Removes the exact listener installed by on; the return value is ignored. */
  off(event: string | symbol, listener: (...args: T) => void): unknown;
}

/**
 * @description Signals that a hot subscription's pending queue exceeded its configured capacity
 * under the error overflow policy. The subscription detaches and discards its queued events.
 * @example
 * if (error instanceof EventQueueOverflowError) console.error(error.capacity);
 */
export class EventQueueOverflowError extends Error {
  /**
   * @description Records the queue capacity that was exceeded.
   * @param {number} capacity - Configured maximum pending events.
   * @example
   * const error = new EventQueueOverflowError(16);
   */
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
  const create = key === undefined ? createUniqueAsyncQuerySequence : createAsyncQuerySequence;
  return create(() => {
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

/**
 * @description Creates a hot, non-replaying query; each started consumption owns listeners and a
 * bounded queue. End events drain queued data; errors, abort, and early return detach and discard it.
 * @param {EventTarget} source - Target to subscribe to only when consumption starts.
 * @param {string} event - Data event name.
 * @param {EventTargetOptions} options - Required queue policy and optional event names.
 * @param {number} options.capacity - Positive safe-integer pending-event limit.
 * @param {"error" | "drop-oldest" | "drop-newest"} options.overflow - Action when the queue is full; error produces EventQueueOverflowError.
 * @param {AbortSignal} [options.signal] - Cancellation shared with the query.
 * @param {(value: Event, ordinal: bigint) => string} [options.key] - Key callback before awaiting values; defaults to decimal zero-based ordinals per subscription, including dropped events.
 * @param {string} [options.errorEvent] - Failure event; its Event object is rejected unchanged.
 * @param {string} [options.endEvent] - Completion event; omitted means no event-driven completion.
 * @returns {AsyncQuerySequence<Event>} Deferred subscription with the AsyncQuerySequence operations.
 * @example
 * const query = fromEventTarget(target, "message", { capacity: 16, overflow: "drop-oldest" });
 * const first = await query[FIRST]();
 */
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

/**
 * @description Creates independent hot subscriptions yielding argument tuples, including empty tuples.
 * No events replay. End detaches and drains; failures, abort, and early return detach and discard buffers.
 * @param {EventEmitterSource<T>} source - Structural on/off emitter; this module never imports node:events.
 * @param {(event: string | symbol, listener: (...args: T) => void) => unknown} source.on - Installs a listener; its return value is ignored.
 * @param {(event: string | symbol, listener: (...args: T) => void) => unknown} source.off - Removes the exact installed listener; its return value is ignored.
 * @param {string | symbol} event - Data event name.
 * @param {EventEmitterOptions<T>} options - Required queue policy and optional event names.
 * @param {number} options.capacity - Positive safe-integer pending-tuple limit.
 * @param {"error" | "drop-oldest" | "drop-newest"} options.overflow - Fail with EventQueueOverflowError or discard pending tuples when full.
 * @param {AbortSignal} [options.signal] - Cancellation whose exact reason rejects consumption.
 * @param {(value: T, ordinal: bigint) => string} [options.key] - Tuple key callback; defaults to decimal ordinals counting all received data events.
 * @param {string | symbol} [options.errorEvent] - Defaults to error; the first emitted argument is rejected unchanged, even undefined.
 * @param {string | symbol} [options.endEvent] - Optional completion event.
 * @returns {AsyncQuerySequence<T>} Deferred query over emitted argument tuples.
 * @example
 * const query = fromEventEmitter<[number]>(emitter, "data", { capacity: 8, overflow: "error" });
 * const first = await query[FIRST]();
 */
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
 * @description Creates a cold query acquiring a fresh unlocked stream for every consumption.
 * Normal exhaustion releases its reader; all other exits cancel then release it. Cancellation does
 * not wait for a producer's non-settling cancel, and primary failures retain their identity.
 * @param {(signal?: AbortSignal) => ReadableStream<T>} factory - Synchronously returns a fresh unlocked stream with the configured signal.
 * @param {StreamSourceOptions<T>} [options] - Key and cancellation settings.
 * @param {AbortSignal} [options.signal] - Cancellation checked before acquisition and while reading.
 * @param {(value: T, ordinal: bigint) => string} [options.key] - Key before awaiting each value; defaults to decimal zero-based ordinals per consumption.
 * @returns {AsyncQuerySequence<Awaited<T>>} Repeatable deferred stream query with awaited values.
 * @example
 * const query = fromReadableStream(() => new ReadableStream({
 *   start(controller) { controller.enqueue(42); controller.close(); },
 * }));
 * const values = await query[VALUES]();
 */
export function fromReadableStream<T>(
  factory: (signal?: AbortSignal) => ReadableStream<T>,
  options: StreamSourceOptions<T> = {},
): AsyncQuerySequence<Awaited<T>> {
  const { signal, key } = options;
  const create = key === undefined ? createUniqueAsyncQuerySequence : createAsyncQuerySequence;
  return create(async function* () {
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
