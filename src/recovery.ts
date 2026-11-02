import { createAsyncQuerySequence, normalizedEntries } from "./async.js";
import type { AsyncEntrySourceFactory, AsyncQuerySequence, AsyncQuerySequenceOptions } from "./async.js";
import { ENTRIES } from "./core-symbols.js";
import { waitFor } from "./lifetime.js";

/** Switch once to an explicit fallback after an upstream pull fails. */
export { FALLBACK } from "./core-symbols.js";

type Entry<T> = readonly [string, T];

/** Receives the exact upstream failure and configured signal, returning fresh replacement entries once per failed consumption. */
export type AsyncFallbackFactory<T> = (
  error: unknown,
  signal: AbortSignal | undefined,
) => ReturnType<AsyncEntrySourceFactory<T>>;

/**
 * @description Preserves the upstream prefix, closes a failed upstream iterator, then switches once
 * to normalized replacement entries. Downstream return/throw and cancellation do not trigger recovery;
 * replacement failures propagate without another fallback.
 * @param {AsyncIterable<Entry<T>>} source - Upstream whose next-call failures may be recovered.
 * @param {AsyncFallbackFactory<U>} fallback - Factory receiving the original failure after upstream cleanup.
 * @param {AbortSignal} [signal] - Cancellation preventing fallback acquisition after abort.
 * @returns {AsyncGenerator<Entry<T | Awaited<U>>>} Original prefix followed by awaited replacement values.
 * @example
 * for await (const entry of fallbackEntries(source, () => [["cached", 1]])) {
 *   consume(entry);
 * }
 */
export async function* fallbackEntries<T, U>(
  source: AsyncIterable<Entry<T>>,
  fallback: AsyncFallbackFactory<U>,
  signal?: AbortSignal,
): AsyncGenerator<Entry<T | Awaited<U>>> {
  const iterator = source[Symbol.asyncIterator]();
  let exhausted = false;
  let failed = false;
  let failure: unknown;
  try {
    while (true) {
      let next: IteratorResult<Entry<T>>;
      try {
        next = await waitFor(() => iterator.next(), signal);
      } catch (error) {
        failed = true;
        failure = error;
        break;
      }
      if (next.done) {
        exhausted = true;
        return;
      }
      // Keep yields outside the catch: downstream throw/return is not recovery.
      yield next.value;
    }
  } finally {
    if (!exhausted) {
      try {
        if (iterator.return) {
          const closing = Promise.resolve(iterator.return());
          if (signal?.aborted) {
            closing.then(() => {}, () => {});
          } else {
            await closing;
          }
        }
      } catch (error) {
        if (!failed) {
          throw error;
        }
      }
    }
  }
  signal?.throwIfAborted();
  yield* normalizedEntries(() => fallback(failure, signal), signal);
}

async function* retryEntries<T>(
  factory: AsyncEntrySourceFactory<T>,
  retries: number,
  options: AsyncQuerySequenceOptions,
): AsyncGenerator<Entry<Awaited<T>>> {
  const seen = new WeakSet<object>();
  let previousError: unknown;
  let reused = false;
  const fresh: AsyncEntrySourceFactory<T> = async signal => {
    const source = await waitFor(() => factory(signal), signal);
    const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
    if (seen.has(iterator)) {
      // A closed captured cursor is not a successful empty restart.
      reused = true;
      throw previousError;
    }
    seen.add(iterator);
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() { return await iterator.next(); },
          async return() {
            const close: (() => IteratorResult<Entry<T>> | PromiseLike<IteratorResult<Entry<T>>>) | undefined = iterator.return;
            return close ? await close.call(iterator) : { done: true as const, value: undefined };
          },
        };
      },
    };
  };
  for (let attempt = 0; ; attempt++) {
    let entries: [string, Awaited<T>][];
    try {
      entries = await createAsyncQuerySequence(fresh, options)[ENTRIES]();
    } catch (error) {
      options.signal?.throwIfAborted();
      if (reused || attempt === retries) {
        throw error;
      }
      previousError = error;
      continue;
    }
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      yield entry;
    }
    return;
  }
}

/**
 * @description Buffers each fresh-factory attempt and exposes only a completely successful attempt.
 * Reusing a captured iterator preserves the previous failure rather than treating it as empty success.
 * Cancellation stops retries; downstream callbacks outside the factory are never retried.
 * @param {AsyncEntrySourceFactory<T>} factory - Acquires a fresh iterator for each attempt and consumption.
 * @param {number} retries - Nonnegative safe-integer number of additional attempts; invalid values throw RangeError.
 * @param {AsyncQuerySequenceOptions} [options] - Identity and cancellation settings copied at construction.
 * @param {KeyCollisionPolicy} [options.duplicateKeys] - Error by default; first keeps the first value, last buffers and keeps the last value in first-key order.
 * @param {AbortSignal} [options.signal] - Cancellation shared across attempts.
 * @returns {AsyncQuerySequence<Awaited<T>>} Repeatable deferred query buffering a full successful attempt.
 * @example
 * const query = createRetryAsyncQuerySequence(() => loadEntries(), 2);
 * const values = await query[VALUES]();
 */
export function createRetryAsyncQuerySequence<T>(
  factory: AsyncEntrySourceFactory<T>,
  retries: number,
  options: AsyncQuerySequenceOptions = {},
): AsyncQuerySequence<Awaited<T>> {
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new RangeError("retries must be a nonnegative safe integer");
  }
  const settings: AsyncQuerySequenceOptions = {
    duplicateKeys: options.duplicateKeys ?? "error",
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  return createAsyncQuerySequence(() => retryEntries(factory, retries, settings), settings);
}
