import type { EntrySourceFactory } from "./entries.js";

/** Append sources in order, retaining their explicit keys. */
export const CONCAT = Symbol("concat");
/** Pair positions until the first exhausted source, pulling left to right. */
export const ZIP = Symbol("zip");
/** Expand each value into explicitly keyed entries, retaining original callback keys. */
export const FLAT_MAP = Symbol("flat_map");

type Entry<T> = readonly [string, T];

// Unlike for-of, this also closes an iterator whose own next() throws.
export function* managedEntries<T>(factory: EntrySourceFactory<T>): Generator<Entry<T>> {
  const iterator = factory()[Symbol.iterator]();
  let failed = false;
  let exhausted = false;
  try {
    while (true) {
      const step = iterator.next();
      if (step.done) {
        exhausted = true;
        return;
      }
      yield step.value;
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      if (!exhausted) {
        iterator.return?.();
      }
    } catch (error) {
      if (!failed) {
        throw error;
      }
    }
  }
}

export function* concatEntries<T>(factories: readonly EntrySourceFactory<T>[]): Generator<Entry<T>> {
  for (const factory of factories) {
    yield* managedEntries(factory);
  }
}

export function* flatMapEntries<T, U>(
  source: EntrySourceFactory<T>,
  mapper: (value: T, originalKey: string) => Iterable<Entry<U>>,
): Generator<Entry<U>> {
  for (const [key, value] of managedEntries(source)) {
    yield* managedEntries(() => mapper(value, key));
  }
}

export function* zipEntries(
  factories: readonly EntrySourceFactory<unknown>[],
): Generator<Entry<unknown[]>> {
  const iterators: Iterator<Entry<unknown>>[] = [];
  let failed = false;
  try {
    // Acquisition is interleaved with pulls, so an empty prefix needs no later source.
    while (true) {
      const values: unknown[] = [];
      let key = "";
      for (let index = 0; index < factories.length; index++) {
        let iterator = iterators[index];
        if (!iterator) {
          const factory = factories[index];
          if (!factory) {
            throw new Error("Missing ZIP source");
          }
          iterator = factory()[Symbol.iterator]();
          iterators.push(iterator);
        }
        const step = iterator.next();
        if (step.done) {
          return;
        }
        if (index === 0) {
          key = step.value[0];
        }
        values.push(step.value[1]);
      }
      yield [key, values];
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    let cleanupFailed = false;
    let cleanupError: unknown;
    for (const iterator of iterators) {
      try {
        iterator.return?.();
      } catch (error) {
        if (!cleanupFailed) {
          cleanupFailed = true;
          cleanupError = error;
        }
      }
    }
    if (!failed && cleanupFailed) {
      throw cleanupError;
    }
  }
}
