import { createAsyncQuerySequence, normalizedEntries } from "./async.js";
import type { AsyncEntrySourceFactory, AsyncQuerySequence, AsyncQuerySequenceOptions } from "./async.js";
import { ENTRIES } from "./core-symbols.js";
import { waitFor } from "./lifetime.js";

/** Switch once to an explicit fallback after an upstream pull fails. */
export { FALLBACK } from "./core-symbols.js";

type Entry<T> = readonly [string, T];

export type AsyncFallbackFactory<T> = (
  error: unknown,
  signal: AbortSignal | undefined,
) => ReturnType<AsyncEntrySourceFactory<T>>;

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
 * Buffer each fresh-factory attempt; expose only a completely successful attempt.
 * retries is the finite number of additional attempts, not total attempts.
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
