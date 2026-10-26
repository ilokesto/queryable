/** Keep the first entry for each value using SameValueZero/reference identity. */
export const DISTINCT = Symbol("distinct");
/** Keep the first entry for each selected value. */
export const DISTINCT_BY = Symbol("distinct_by");
/** Keep the first entry of each adjacent run of equal values. */
export const DISTINCT_UNTIL_CHANGED = Symbol("distinct_until_changed");
/** Keep the first entry of each adjacent run of equal selected values. */
export const DISTINCT_UNTIL_CHANGED_BY = Symbol("distinct_until_changed_by");

type Entry<T> = readonly [string, T];

export function identity<T>(value: T): T {
  return value;
}

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
