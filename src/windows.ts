import type { QuerySequence } from "./index.js";

/** Batch entries, including the final partial chunk. */
export const CHUNK = Symbol("chunk");
/** Sliding windows; partial trailing windows are opt-in. */
export const WINDOW = Symbol("window");
/** Overlapping complete pairs of original entries. */
export const PAIRWISE = Symbol("pairwise");
/** Split at matching entries, excluding delimiters and empty groups. */
export const SPLIT = Symbol("split");
/** Group adjacent equal selector results using SameValueZero. */
export const PARTITION_BY = Symbol("partition_by");

/** Mutable key/value tuple exposed in a collected buffer; the payload reference is shared. */
export type WindowEntry<T> = [string, T];
/** Independently mutable array of shallow-copied entry tuples. */
export type EntryBuffer<T> = WindowEntry<T>[];
/** Two consecutive original entries, with a fresh tuple at every nesting level. */
export type EntryPair<T> = [WindowEntry<T>, WindowEntry<T>];
type Entry<T> = readonly [string, T];

/** Buffer-producing operators anchored at each buffer's first original key. */
export interface WindowOperations<T, Receiver> {
  /**
   * @description Batch original entries into independent buffers, including the final partial chunk.
   * @param {number} size - Positive finite integer number of entries per buffer.
   * @returns {QuerySequence<EntryBuffer<T>>} Batch original entries into independent buffers, including the final partial chunk.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[CHUNK](2);
   * ```
   */
  [CHUNK](this: Receiver, size: number): QuerySequence<EntryBuffer<T>>;
  /**
   * @description Emit independent sliding entry buffers; size and stride must be positive finite integers.
   * @param {number} size - Positive finite integer number of entries per buffer.
   * @param {number} [stride] - Positive finite integer distance between window starts; defaults to 1.
   * @param {boolean} [partial] - Whether to emit trailing incomplete windows; defaults to false.
   * @returns {QuerySequence<EntryBuffer<T>>} Emit independent sliding entry buffers; size and stride must be positive finite integers.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WINDOW](2, 1, true);
   * ```
   */
  [WINDOW](this: Receiver, size: number, stride?: number, partial?: boolean): QuerySequence<EntryBuffer<T>>;
  /**
   * @description Emit overlapping complete pairs of original entries; fewer than two entries yield no pairs.
   * @returns {QuerySequence<EntryPair<T>>} Emit overlapping complete pairs of original entries; fewer than two entries yield no pairs.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PAIRWISE]();
   * ```
   */
  [PAIRWISE](this: Receiver): QuerySequence<EntryPair<T>>;
  /**
   * @description Split at matching delimiter entries, excluding delimiters and empty groups.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<EntryBuffer<T>>} Split at matching delimiter entries, excluding delimiters and empty groups.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SPLIT](value => value === 2);
   * ```
   */
  [SPLIT](this: Receiver, predicate: (value: T, key: string) => boolean): QuerySequence<EntryBuffer<T>>;
  /**
   * @description Group adjacent equal selector results using SameValueZero equality into independent entry buffers.
   * @param {(value: T, key: string) => K} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {QuerySequence<EntryBuffer<T>>} Group adjacent equal selector results using SameValueZero equality into independent entry buffers.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PARTITION_BY](value => value % 2);
   * ```
   */
  [PARTITION_BY]<K>(this: Receiver, selector: (value: T, key: string) => K): QuerySequence<EntryBuffer<T>>;
}

/**
 * @description Validates a window size or stride before consumption, throwing RangeError for nonpositive, fractional, or nonfinite values.
 * @param {number} size - Proposed positive finite integer.
 * @param {string} name - Setting name included in the error message.
 * @example
 * ```ts
 * validateWindowSize(2, "size");
 * validateWindowSize(1, "stride");
 * ```
 */
export function validateWindowSize(size: number, name: string): void {
  if (!Number.isInteger(size) || !Number.isFinite(size) || size <= 0) {
    throw new RangeError(`${name} must be a positive finite integer`);
  }
}

/**
 * @description Copies a buffer and each key/value tuple so callers may mutate containers without changing the stored buffer; payload references remain shared.
 * @param {EntryBuffer<T>} buffer - Collected entries to shallow-copy.
 * @returns {EntryBuffer<T>} Fresh array of fresh entry tuples with unchanged payload references.
 * @example
 * ```ts
 * const original: EntryBuffer<number> = [["a", 1]];
 * const copied = copyBuffer(original);
 * copied[0] !== original[0]; // true
 * ```
 */
export function copyBuffer<T>(buffer: EntryBuffer<T>): EntryBuffer<T> {
  return buffer.map(([key, value]) => [key, value]);
}

/**
 * @description Copies a consecutive entry pair and both nested tuples, retaining the original payload references.
 * @param {EntryPair<T>} pair - Earlier and later entries, each containing its original string key and value reference.
 * @returns {EntryPair<T>} Fresh pair and entry tuples.
 * - 0 `WindowEntry<T>` - Copy of the earlier entry.
 * : 0.0 `string` - Earlier entry's original key.
 * : 0.1 `T` - Earlier entry's unchanged value.
 * - 1 `WindowEntry<T>` - Copy of the later entry.
 * : 1.0 `string` - Later entry's original key.
 * : 1.1 `T` - Later entry's unchanged value.
 * @example
 * ```ts
 * copyPair([["a", 1], ["b", 2]]); // [["a", 1], ["b", 2]] in fresh containers
 * ```
 */
export function copyPair<T>(pair: EntryPair<T>): EntryPair<T> {
  return [[pair[0][0], pair[0][1]], [pair[1][0], pair[1][1]]];
}

/**
 * @description Applies a container-copy function to every entry value while retaining its key, so buffered query results can expose independent mutable containers.
 * @param {Iterable<Entry<T>>} source - Keyed buffers or other values requiring copies.
 * @param {(value: T) => T} copy - Copies each visited value once on demand.
 * @returns {Generator<Entry<T>>} Fresh entry tuples containing copied values and original keys.
 * @example
 * ```ts
 * const source: [string, EntryBuffer<number>][] = [["a", [["a", 1]]]];
 * [...copyBuffers(source, copyBuffer)]; // [["a", [["a", 1]]]]
 * ```
 */
export function* copyBuffers<T>(
  source: Iterable<Entry<T>>,
  copy: (value: T) => T,
): Generator<Entry<T>> {
  for (const [key, value] of source) {
    yield [key, copy(value)];
  }
}

function* emitBuffer<T>(buffer: readonly Entry<T>[]): Generator<Entry<EntryBuffer<T>>> {
  const first = buffer[0];
  if (first) {
    yield [first[0], buffer.map(([key, value]) => [key, value])];
  }
}

/**
 * @description Streams windows using a bounded buffer, advancing by stride even across gaps. Complete windows are emitted immediately; partial trailing windows are optional.
 * @param {Iterable<Entry<T>>} source - Entries in window order.
 * @param {number} size - Already validated positive finite integer window size.
 * @param {number} stride - Already validated positive finite integer distance between window starts.
 * @param {boolean} partial - Whether to emit nonempty incomplete windows after exhaustion.
 * @returns {Generator<Entry<EntryBuffer<T>>>} Fresh buffers and entry tuples anchored at their first original key.
 * @example
 * ```ts
 * [...windowEntries([["a", 1], ["b", 2], ["c", 3]], 2, 2, true)];
 * // [["a", [["a", 1], ["b", 2]]], ["c", [["c", 3]]]]
 * ```
 */
export function* windowEntries<T>(
  source: Iterable<Entry<T>>, size: number, stride: number, partial: boolean,
): Generator<Entry<EntryBuffer<T>>> {
  const buffer: Entry<T>[] = [];
  let skip = 0;
  for (const entry of source) {
    if (skip > 0) {
      skip--;
      continue;
    }
    buffer.push(entry);
    if (buffer.length === size) {
      yield* emitBuffer(buffer);
      buffer.splice(0, stride);
      skip = Math.max(0, stride - size);
    }
  }
  if (partial) {
    while (buffer.length > 0) {
      yield* emitBuffer(buffer);
      buffer.splice(0, stride);
    }
  }
}

/**
 * @description Emits overlapping pairs of consecutive entries with fresh nested tuples, using the earlier entry's key as the output anchor.
 * @param {Iterable<Entry<T>>} source - Entries paired in consumption order.
 * @returns {Generator<Entry<EntryPair<T>>>} Complete two-entry pairs; empty or singleton sources emit nothing.
 * @example
 * ```ts
 * [...pairEntries([["a", 1], ["b", 2]])]; // [["a", [["a", 1], ["b", 2]]]]
 * ```
 */
export function* pairEntries<T>(source: Iterable<Entry<T>>): Generator<Entry<EntryPair<T>>> {
  let previous: Entry<T> | undefined;
  for (const entry of source) {
    if (previous) {
      yield [previous[0], [[previous[0], previous[1]], [entry[0], entry[1]]]];
    }
    previous = entry;
  }
}

/**
 * @description Splits at matching delimiters, excluding delimiter entries and empty groups while preserving original keys inside fresh entry buffers.
 * @param {Iterable<Entry<T>>} source - Entries tested in source order.
 * @param {(value: T, key: string) => boolean} predicate - True marks an excluded delimiter; receives each original key.
 * @returns {Generator<Entry<EntryBuffer<T>>>} Nonempty groups anchored at their first retained entry's key.
 * @example
 * ```ts
 * [...splitEntries([["a", 1], ["b", 0], ["c", 2]], n => n === 0)];
 * // [["a", [["a", 1]]], ["c", [["c", 2]]]]
 * ```
 */
export function* splitEntries<T>(
  source: Iterable<Entry<T>>, predicate: (value: T, key: string) => boolean,
): Generator<Entry<EntryBuffer<T>>> {
  let buffer: Entry<T>[] = [];
  for (const entry of source) {
    if (predicate(entry[1], entry[0])) {
      yield* emitBuffer(buffer);
      buffer = [];
    } else {
      buffer.push(entry);
    }
  }
  yield* emitBuffer(buffer);
}

/**
 * @description Groups adjacent equal selector identities using SameValueZero, buffering one run and emitting fresh tuples without merging separated runs.
 * @param {Iterable<Entry<T>>} source - Entries grouped in consumption order.
 * @param {(value: T, key: string) => K} selector - Selects each entry's run identity using the original key.
 * @returns {Generator<Entry<EntryBuffer<T>>>} Nonempty adjacent groups anchored at their first original key.
 * @example
 * ```ts
 * [...partitionEntries([["a", "A"], ["b", "A"], ["c", "B"]], value => value)];
 * // [["a", [["a", "A"], ["b", "A"]]], ["c", [["c", "B"]]]]
 * ```
 */
export function* partitionEntries<T, K>(
  source: Iterable<Entry<T>>, selector: (value: T, key: string) => K,
): Generator<Entry<EntryBuffer<T>>> {
  let buffer: Entry<T>[] = [];
  let initialized = false;
  let previous: K | undefined;
  for (const entry of source) {
    const selected = selector(entry[1], entry[0]);
    // SameValueZero matches Set/DISTINCT_BY: NaN equals NaN and signed zeros agree.
    if (initialized && !(selected === previous || (selected !== selected && previous !== previous))) {
      yield* emitBuffer(buffer);
      buffer = [];
    }
    buffer.push(entry);
    previous = selected;
    initialized = true;
  }
  yield* emitBuffer(buffer);
}
