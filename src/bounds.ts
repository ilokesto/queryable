/** Skip the first n entries, retaining keys and query mode.
 * @example query[SKIP](2)
 */
export const SKIP = Symbol("skip");
/** Keep the matching prefix; type guards narrow retained values.
 * @example query[TAKE_WHILE](value => value.active)
 */
export const TAKE_WHILE = Symbol("take_while");
/** Drop the matching prefix; later entries are not tested.
 * @example query[DROP_WHILE](value => value.active)
 */
export const DROP_WHILE = Symbol("drop_while");
/** Keep the final n entries in their original order.
 * @example query[TAKE_LAST](2)
 */
export const TAKE_LAST = Symbol("take_last");
/** Exclude the final n entries, using bounded lookahead.
 * @example query[DROP_LAST](2)
 */
export const DROP_LAST = Symbol("drop_last");

type Entry<T> = readonly [string, T];

function normalizeSize(n: number): number {
  return Number.isNaN(n) ? 0 : Math.max(0, Math.trunc(n));
}

/**
 * @description Skips a normalized prefix, preserving the remaining entries and their keys. Sizes are truncated and clamped to zero; NaN means zero.
 * @param {Iterable<Entry<T>>} source - Entries in consumption order.
 * @param {number} n - Prefix size; Infinity excludes the entire source.
 * @returns {Generator<Entry<T>>} Remaining entries, streamed without buffering.
 * @example
 * ```ts
 * [...skipEntries([["a", 1], ["b", 2]], 1)]; // [["b", 2]]
 * ```
 */
export function* skipEntries<T>(source: Iterable<Entry<T>>, n: number): Generator<Entry<T>> {
  let remaining = normalizeSize(n);
  for (const entry of source) {
    if (remaining > 0) {
      remaining--;
    } else {
      yield entry;
    }
  }
}

/**
 * @description Yields the matching prefix and stops at the first rejected entry without testing later entries.
 * @param {Iterable<Entry<T>>} source - Entries in consumption order.
 * @param {(value: T, key: string) => boolean} predicate - Tests each visited value and original key.
 * @returns {Generator<Entry<T>>} Original entries before the first predicate failure.
 * @example
 * ```ts
 * [...takeWhileEntries([["a", 1], ["b", 0]], n => n > 0)]; // [["a", 1]]
 * ```
 */
export function* takeWhileEntries<T>(
  source: Iterable<Entry<T>>, predicate: (value: T, key: string) => boolean,
): Generator<Entry<T>> {
  for (const entry of source) {
    if (!predicate(entry[1], entry[0])) {
      return;
    }
    yield entry;
  }
}

/**
 * @description Drops the matching prefix, then yields the first rejected entry and all later entries without further predicate calls.
 * @param {Iterable<Entry<T>>} source - Entries in consumption order.
 * @param {(value: T, key: string) => boolean} predicate - Tests prefix values with their original keys.
 * @returns {Generator<Entry<T>>} Entries beginning at the first predicate failure.
 * @example
 * ```ts
 * [...dropWhileEntries([["a", 1], ["b", 0], ["c", 1]], n => n > 0)]; // [["b", 0], ["c", 1]]
 * ```
 */
export function* dropWhileEntries<T>(
  source: Iterable<Entry<T>>, predicate: (value: T, key: string) => boolean,
): Generator<Entry<T>> {
  let dropping = true;
  for (const entry of source) {
    if (dropping && predicate(entry[1], entry[0])) {
      continue;
    }
    dropping = false;
    yield entry;
  }
}

/**
 * @description Buffers the normalized final n entries and emits them in original order after source exhaustion. Zero consumes nothing.
 * @param {Iterable<Entry<T>>} source - Finite source whose suffix is requested.
 * @param {number} n - Truncated nonnegative suffix size; NaN means zero and Infinity retains everything.
 * @returns {Generator<Entry<T>>} Final entries with unchanged keys and value references.
 * @example
 * ```ts
 * [...takeLastEntries([["a", 1], ["b", 2]], 1)]; // [["b", 2]]
 * ```
 */
export function* takeLastEntries<T>(source: Iterable<Entry<T>>, n: number): Generator<Entry<T>> {
  const count = normalizeSize(n);
  if (count === 0) {
    return;
  }
  const buffer: Entry<T>[] = [];
  let next = 0;
  for (const entry of source) {
    if (buffer.length < count) {
      buffer.push(entry);
    } else {
      buffer[next] = entry;
      next = (next + 1) % count;
    }
  }
  for (let i = 0; i < buffer.length; i++) {
    // Every slot below length was filled, even when its stored value is undefined.
    yield buffer[(next + i) % buffer.length] as Entry<T>;
  }
}

/**
 * @description Excludes a normalized suffix using n-entry lookahead. Infinity still consumes upstream effects and errors but emits nothing.
 * @param {Iterable<Entry<T>>} source - Entries to consume in order.
 * @param {number} n - Truncated nonnegative suffix size; NaN means zero.
 * @returns {Generator<Entry<T>>} Original entries preceding the excluded suffix.
 * @example
 * ```ts
 * [...dropLastEntries([["a", 1], ["b", 2]], 1)]; // [["a", 1]]
 * ```
 */
export function* dropLastEntries<T>(source: Iterable<Entry<T>>, n: number): Generator<Entry<T>> {
  const count = normalizeSize(n);
  if (count === 0) {
    yield* source;
    return;
  }
  if (count === Infinity) {
    // All entries are excluded, but upstream effects and errors still execute.
    for (const _entry of source) {}
    return;
  }
  const buffer: Entry<T>[] = [];
  let next = 0;
  for (const entry of source) {
    if (buffer.length < count) {
      buffer.push(entry);
    } else {
      const oldest = buffer[next] as Entry<T>;
      buffer[next] = entry;
      next = (next + 1) % count;
      yield oldest;
    }
  }
}
