/** Keep the first left entry for each identity absent from the right. */
export const DIFFERENCE = Symbol("difference");
/** Keep the first left entry for each identity present on the right. */
export const INTERSECTION = Symbol("intersection");
/** Keep the first entry for each identity, visiting left before right. */
export const UNION = Symbol("union");

type Entry<T> = readonly [string, T];

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
