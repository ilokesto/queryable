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
