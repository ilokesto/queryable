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

export type WindowEntry<T> = [string, T];
export type EntryBuffer<T> = WindowEntry<T>[];
export type EntryPair<T> = [WindowEntry<T>, WindowEntry<T>];
type Entry<T> = readonly [string, T];

export interface WindowOperations<T, Receiver> {
  [CHUNK](this: Receiver, size: number): QuerySequence<EntryBuffer<T>>;
  [WINDOW](this: Receiver, size: number, stride?: number, partial?: boolean): QuerySequence<EntryBuffer<T>>;
  [PAIRWISE](this: Receiver): QuerySequence<EntryPair<T>>;
  [SPLIT](this: Receiver, predicate: (value: T, key: string) => boolean): QuerySequence<EntryBuffer<T>>;
  [PARTITION_BY]<K>(this: Receiver, selector: (value: T, key: string) => K): QuerySequence<EntryBuffer<T>>;
}

export function validateWindowSize(size: number, name: string): void {
  if (!Number.isInteger(size) || !Number.isFinite(size) || size <= 0) {
    throw new RangeError(`${name} must be a positive finite integer`);
  }
}

export function copyBuffer<T>(buffer: EntryBuffer<T>): EntryBuffer<T> {
  return buffer.map(([key, value]) => [key, value]);
}

export function copyPair<T>(pair: EntryPair<T>): EntryPair<T> {
  return [[pair[0][0], pair[0][1]], [pair[1][0], pair[1][1]]];
}

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

export function* pairEntries<T>(source: Iterable<Entry<T>>): Generator<Entry<EntryPair<T>>> {
  let previous: Entry<T> | undefined;
  for (const entry of source) {
    if (previous) {
      yield [previous[0], [[previous[0], previous[1]], [entry[0], entry[1]]]];
    }
    previous = entry;
  }
}

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
