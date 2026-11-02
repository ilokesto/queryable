import type { EntrySourceFactory } from "./entries.js";

/** Append sources in order, retaining their explicit keys. */
export const CONCAT = Symbol("concat");
/** Pair positions until the first exhausted source, pulling left to right. */
export const ZIP = Symbol("zip");
/** Expand each value into explicitly keyed entries, retaining original callback keys. */
export const FLAT_MAP = Symbol("flat_map");

type Entry<T> = readonly [string, T];

// Unlike for-of, this also closes an iterator whose own next() throws.
/**
 * @description Acquires a source on first pull and closes its iterator on interruption or failure, including a throwing next. An original failure takes precedence over cleanup errors.
 * @param {EntrySourceFactory<T>} factory - Creates the keyed iterable when consumption begins.
 * @returns {Generator<Entry<T>>} Source entries unchanged; normal exhaustion does not call iterator.return.
 * @example
 * ```ts
 * [...managedEntries(() => [["item", 1]])]; // [["item", 1]]
 * ```
 */
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

/**
 * @description Streams sources consecutively, acquiring each only when reached and retaining duplicate keys for the caller's collision boundary.
 * @param {readonly EntrySourceFactory<T>[]} factories - Source factories in concatenation order.
 * @returns {Generator<Entry<T>>} All entries in source order with managed iterator cleanup.
 * @example
 * ```ts
 * [...concatEntries([() => [["a", 1]], () => [["b", 2]]])]; // [["a", 1], ["b", 2]]
 * ```
 */
export function* concatEntries<T>(factories: readonly EntrySourceFactory<T>[]): Generator<Entry<T>> {
  for (const factory of factories) {
    yield* managedEntries(factory);
  }
}

/**
 * @description Expands each source value into explicitly keyed entries, fully consuming one expansion before the next source value and managing both iterators.
 * @param {EntrySourceFactory<T>} source - Creates the outer keyed source on demand.
 * @param {(value: T, originalKey: string) => Iterable<Entry<U>>} mapper - Produces keyed output using the outer value and original key.
 * @returns {Generator<Entry<U>>} Expanded entries in outer-then-inner order.
 * @example
 * ```ts
 * [...flatMapEntries(() => [["a", 2]], (n, key) => [[`${key}/double`, n * 2]])]; // [["a/double", 4]]
 * ```
 */
export function* flatMapEntries<T, U>(
  source: EntrySourceFactory<T>,
  mapper: (value: T, originalKey: string) => Iterable<Entry<U>>,
): Generator<Entry<U>> {
  for (const [key, value] of managedEntries(source)) {
    yield* managedEntries(() => mapper(value, key));
  }
}

/**
 * @description Pulls nonempty source lists left to right and pairs positions until the first source is exhausted. Each row uses the first source's key; all acquired iterators are closed.
 * @param {readonly EntrySourceFactory<unknown>[]} factories - One or more source factories in tuple position order.
 * @returns {Generator<Entry<unknown[]>>} Keyed arrays of positional values, stopping at the shortest source.
 * @example
 * ```ts
 * [...zipEntries([() => [["a", 1]], () => [["x", "one"]]])]; // [["a", [1, "one"]]]
 * ```
 */
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
