/** Keep the first entry for each value using SameValueZero/reference identity. */
export const DISTINCT = Symbol("distinct");
/** Keep the first entry for each selected value. */
export const DISTINCT_BY = Symbol("distinct_by");
/** Keep the first entry of each adjacent run of equal values. */
export const DISTINCT_UNTIL_CHANGED = Symbol("distinct_until_changed");
/** Keep the first entry of each adjacent run of equal selected values. */
export const DISTINCT_UNTIL_CHANGED_BY = Symbol("distinct_until_changed_by");

type Entry<T> = readonly [string, T];

/**
 * @description Returns a value unchanged so identity-based operators can share the selector path without inspecting payloads.
 * @param {T} value - Value or reference to preserve.
 * @returns {T} The exact supplied value.
 * @example
 * ```ts
 * const item = { id: 1 };
 * identity(item) === item; // true
 * ```
 */
export function identity<T>(value: T): T {
  return value;
}

/**
 * @description Keeps the first entry for each selected identity using SameValueZero equality, including NaN equality and reference identity for objects.
 * @param {Iterable<Entry<T>>} source - Entries visited in source order.
 * @param {(value: T, key: string) => K} select - Selects one identity per visited value and original key.
 * @returns {Generator<Entry<T>>} First occurrences with unchanged entries; each consumption owns its seen set.
 * @example
 * ```ts
 * [...distinctEntries([["a", 1], ["b", 1], ["c", 2]], n => n)]; // [["a", 1], ["c", 2]]
 * ```
 */
export function* distinctEntries<T, K>(
  source: Iterable<Entry<T>>,
  select: (value: T, key: string) => K,
): Generator<Entry<T>> {
  const seen = new Set<K>();
  for (const entry of source) {
    const selected = select(entry[1], entry[0]);
    if (!seen.has(selected)) {
      seen.add(selected);
      yield entry;
    }
  }
}

/**
 * @description Keeps the first entry of each adjacent run of SameValueZero-equal selected identities, allowing separated repeats.
 * @param {Iterable<Entry<T>>} source - Entries whose adjacent values are compared.
 * @param {(value: T, key: string) => K} select - Selects an identity from each value and original key.
 * @returns {Generator<Entry<T>>} Original run-leading entries in source order.
 * @example
 * ```ts
 * [...distinctUntilChangedEntries([["a", 1], ["b", 1], ["c", 2], ["d", 1]], n => n)];
 * // [["a", 1], ["c", 2], ["d", 1]]
 * ```
 */
export function* distinctUntilChangedEntries<T, K>(
  source: Iterable<Entry<T>>,
  select: (value: T, key: string) => K,
): Generator<Entry<T>> {
  let initialized = false;
  let previous: K | undefined;
  for (const entry of source) {
    const selected = select(entry[1], entry[0]);
    const equal = selected === previous || (selected !== selected && previous !== previous);
    if (!initialized || !equal) {
      initialized = true;
      previous = selected;
      yield entry;
    }
  }
}
