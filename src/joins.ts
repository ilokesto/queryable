import type { Queryable, QuerySequence, QuerySequenceOptions } from "./index.js";

/** Project one result per outer entry, retaining its key. */
export const GROUP_JOIN = Symbol("group_join");
/** Project one explicitly keyed result per matching pair. */
export const INNER_JOIN = Symbol("inner_join");
/** Include unmatched outer entries using a discriminated match context. */
export const LEFT_JOIN = Symbol("left_join");

export interface JoinMatch<T> {
  readonly matched: true;
  readonly value: T;
  readonly key: string;
}

export type LeftJoinMatch<T> = JoinMatch<T> | { readonly matched: false };
export type JoinEntry<T> = readonly [string, T];
type Query<T> = Queryable<T> | QuerySequence<T>;
type Result<T, M> = M extends "record" ? Queryable<T> : QuerySequence<T>;

export interface JoinOperations<T, M> {
  [GROUP_JOIN]<I, K, U>(
    this: Result<T, M>, inner: Query<I>,
    outerKey: (value: T, key: string) => K,
    innerKey: (value: I, key: string) => K,
    project: (value: T, matches: readonly JoinEntry<I>[], key: string) => U,
  ): Result<U, M>;
  [INNER_JOIN]<I, K, U>(
    this: Result<T, M>, inner: Query<I>,
    outerKey: (value: T, key: string) => K,
    innerKey: (value: I, key: string) => K,
    project: (value: T, match: JoinMatch<I>, key: string) => JoinEntry<U>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U>;
  [LEFT_JOIN]<I, K, U>(
    this: Result<T, M>, inner: Query<I>,
    outerKey: (value: T, key: string) => K,
    innerKey: (value: I, key: string) => K,
    project: (value: T, match: LeftJoinMatch<I>, key: string) => JoinEntry<U>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U>;
}

function indexEntries<I, K>(
  inner: Iterable<JoinEntry<I>>, innerKey: (value: I, key: string) => K,
): Map<K, JoinEntry<I>[]> {
  const index = new Map<K, JoinEntry<I>[]>();
  for (const [key, value] of inner) {
    const joinKey = innerKey(value, key);
    let matches = index.get(joinKey);
    if (matches === undefined) {
      matches = [];
      index.set(joinKey, matches);
    }
    matches.push([key, value]);
  }
  return index;
}

export function* groupJoinEntries<T, I, K, U>(
  outer: Iterable<JoinEntry<T>>, inner: Iterable<JoinEntry<I>>,
  outerKey: (value: T, key: string) => K,
  innerKey: (value: I, key: string) => K,
  project: (value: T, matches: readonly JoinEntry<I>[], key: string) => U,
): Generator<JoinEntry<U>> {
  const index = indexEntries(inner, innerKey);
  for (const [key, value] of outer) {
    // Fresh tuples prevent one projection from changing later outer matches.
    const matches = (index.get(outerKey(value, key)) ?? []).map(
      ([innerKey, innerValue]): JoinEntry<I> => [innerKey, innerValue],
    );
    yield [key, project(value, matches, key)];
  }
}

export function* innerJoinEntries<T, I, K, U>(
  outer: Iterable<JoinEntry<T>>, inner: Iterable<JoinEntry<I>>,
  outerKey: (value: T, key: string) => K,
  innerKey: (value: I, key: string) => K,
  project: (value: T, match: JoinMatch<I>, key: string) => JoinEntry<U>,
): Generator<JoinEntry<U>> {
  const index = indexEntries(inner, innerKey);
  for (const [key, value] of outer) {
    for (const [innerKey, innerValue] of index.get(outerKey(value, key)) ?? []) {
      yield project(value, { matched: true, key: innerKey, value: innerValue }, key);
    }
  }
}

export function* leftJoinEntries<T, I, K, U>(
  outer: Iterable<JoinEntry<T>>, inner: Iterable<JoinEntry<I>>,
  outerKey: (value: T, key: string) => K,
  innerKey: (value: I, key: string) => K,
  project: (value: T, match: LeftJoinMatch<I>, key: string) => JoinEntry<U>,
): Generator<JoinEntry<U>> {
  const index = indexEntries(inner, innerKey);
  for (const [key, value] of outer) {
    const matches = index.get(outerKey(value, key));
    if (matches === undefined) {
      yield project(value, { matched: false }, key);
    } else {
      for (const [innerKey, innerValue] of matches) {
        yield project(value, { matched: true, key: innerKey, value: innerValue }, key);
      }
    }
  }
}
