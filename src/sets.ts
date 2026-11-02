/** Keep the first left entry for each identity absent from the right. */
export const DIFFERENCE = Symbol("difference");
/** Keep the first left entry for each identity present on the right. */
export const INTERSECTION = Symbol("intersection");
/** Keep the first entry for each identity, visiting left before right. */
export const UNION = Symbol("union");

type Entry<T> = readonly [string, T];

/**
 * @description Indexes all right-side identities, then emits the first left entry for each identity either present or absent on the right using SameValueZero equality.
 * @param {Iterable<Entry<T>>} left - Entries considered for output after right-side indexing.
 * @param {Iterable<Entry<U>>} right - Entries fully consumed to build the membership set.
 * @param {(value: T, key: string) => K} leftSelector - Selects left identities using original keys.
 * @param {(value: U, key: string) => K} rightSelector - Selects right identities using original keys.
 * @param {boolean} intersect - True keeps identities present on the right; false keeps absent identities.
 * @returns {Generator<Entry<T>>} Distinct qualifying left entries in original order.
 * @example
 * ```ts
 * [...membershipEntries([["a", 1], ["b", 2]], [["x", 2]], n => n, n => n, false)];
 * // [["a", 1]]
 * ```
 */
export function* membershipEntries<T, U, K>(
  left: Iterable<Entry<T>>,
  right: Iterable<Entry<U>>,
  leftSelector: (value: T, key: string) => K,
  rightSelector: (value: U, key: string) => K,
  intersect: boolean,
): Generator<Entry<T>> {
  const membership = new Set<K>();
  for (const [key, value] of right) {
    membership.add(rightSelector(value, key));
  }
  const seen = new Set<K>();
  for (const entry of left) {
    const identity = leftSelector(entry[1], entry[0]);
    if (membership.has(identity) === intersect && !seen.has(identity)) {
      seen.add(identity);
      yield entry;
    }
  }
}

/**
 * @description Streams left then right, retaining the first entry for each selected SameValueZero identity across both sources without reconciling output key collisions.
 * @param {Iterable<Entry<T>>} left - Entries visited first and preferred for shared identities.
 * @param {Iterable<Entry<U>>} right - Entries visited after left exhaustion.
 * @param {(value: T, key: string) => K} leftSelector - Selects each left identity with the original key.
 * @param {(value: U, key: string) => K} rightSelector - Selects each right identity with the original key.
 * @returns {Generator<Entry<T | U>>} First entries for unique identities, preserving their original keys.
 * @example
 * ```ts
 * [...unionEntries([["a", 1]], [["b", 1], ["c", 2]], n => n, n => n)];
 * // [["a", 1], ["c", 2]]
 * ```
 */
export function* unionEntries<T, U, K>(
  left: Iterable<Entry<T>>,
  right: Iterable<Entry<U>>,
  leftSelector: (value: T, key: string) => K,
  rightSelector: (value: U, key: string) => K,
): Generator<Entry<T | U>> {
  const seen = new Set<K>();
  for (const entry of left) {
    const identity = leftSelector(entry[1], entry[0]);
    if (!seen.has(identity)) {
      seen.add(identity);
      yield entry;
    }
  }
  for (const entry of right) {
    const identity = rightSelector(entry[1], entry[0]);
    if (!seen.has(identity)) {
      seen.add(identity);
      yield entry;
    }
  }
}
