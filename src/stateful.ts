import type { Queryable, QuerySequence } from "./index.js";

/** Eagerly split entries into matching and nonmatching snapshots. */
export const PARTITION = Symbol("partition");
/** Emit keyed running accumulators, starting fresh with a seed factory per consumption. */
export const SCAN = Symbol("scan");
/** Run a keyed effect while retaining each original entry. */
export const TAP = Symbol("tap");
/** Consume entries with a keyed effect without collecting a result. */
export const EACH = Symbol("each");
/** Pass the exact query to an external transformation. */
export const THROUGH = Symbol("through");

type Entry<T> = readonly [string, T];
type Result<T, M extends "record" | "sequence"> = M extends "record" ? Queryable<T> : QuerySequence<T>;

export interface Stateful<T, M extends "record" | "sequence"> {
  [PARTITION]<S extends T>(
    this: Result<T, M>, predicate: (value: T, key: string) => value is S,
  ): [Result<S, M>, Result<T, M>];
  [PARTITION](
    this: Result<T, M>, predicate: (value: T, key: string) => boolean,
  ): [Result<T, M>, Result<T, M>];
  [SCAN]<A>(
    this: Result<T, M>,
    reducer: (accumulator: A, value: T, key: string) => A,
    seed: () => A,
  ): Result<A, M>;
  [TAP](this: Result<T, M>, effect: (value: T, key: string) => void): Result<T, M>;
  [EACH](this: Result<T, M>, effect: (value: T, key: string) => void): void;
  [THROUGH]<Q extends Result<T, M>, R>(this: Q, fn: (query: Q) => R): R;
}

export function partitionEntries<T>(
  source: Iterable<Entry<T>>, predicate: (value: T, key: string) => boolean,
): [Entry<T>[], Entry<T>[]] {
  const matching: Entry<T>[] = [];
  const nonmatching: Entry<T>[] = [];
  for (const entry of source) {
    (predicate(entry[1], entry[0]) ? matching : nonmatching).push(entry);
  }
  return [matching, nonmatching];
}

export function* scanEntries<T, A>(
  source: Iterable<Entry<T>>,
  reducer: (accumulator: A, value: T, key: string) => A,
  seed: () => A,
): Generator<Entry<A>> {
  let accumulator = seed();
  for (const [key, value] of source) {
    accumulator = reducer(accumulator, value, key);
    yield [key, accumulator];
  }
}

export function* tapEntries<T>(
  source: Iterable<Entry<T>>, effect: (value: T, key: string) => void,
): Generator<Entry<T>> {
  for (const entry of source) {
    effect(entry[1], entry[0]);
    yield entry;
  }
}

export function eachEntry<T>(source: Iterable<Entry<T>>, effect: (value: T, key: string) => void): void {
  for (const [key, value] of source) {
    effect(value, key);
  }
}

export function through<Q, R>(this: Q, fn: (query: Q) => R): R {
  return fn(this);
}
