import type { Queryable, QuerySequence, QuerySequenceOptions } from "./index.js";

/** Project one result per outer entry, retaining its key. */
export const GROUP_JOIN = Symbol("group_join");
/** Project one explicitly keyed result per matching pair. */
export const INNER_JOIN = Symbol("inner_join");
/** Include unmatched outer entries using a discriminated match context. */
export const LEFT_JOIN = Symbol("left_join");

/** A present inner entry; stored undefined remains a successful match. */
export interface JoinMatch<T> {
  /** Discriminant distinguishing a present match from an unmatched left row. */
  readonly matched: true;
  /** Original inner value, not a clone. */
  readonly value: T;
  /** Original inner key, independent of the projected output key. */
  readonly key: string;
}

/** A present inner entry or an unmatched outer row with matched set to false. */
export type LeftJoinMatch<T> = JoinMatch<T> | { readonly matched: false };
/** Explicit output key and value; projections choose both. */
export type JoinEntry<T> = readonly [string, T];
type Query<T> = Queryable<T> | QuerySequence<T>;
type Result<T, M> = M extends "record" ? Queryable<T> : QuerySequence<T>;

/** Indexed join operators; the entire inner input is indexed before outer projection. */
export interface JoinOperations<T, M> {
  /**
   * @description Buffer the inner input and project once per outer entry with all matching inner entries.
   * @param {Queryable<I> | QuerySequence<I>} inner - Inner keyed input buffered for matching against each outer entry.
   * @param {(value: T, key: string) => K} outerKey - Select join identity from an outer (value, originalKey).
   * @param {(value: I, key: string) => K} innerKey - Select join identity from an inner (value, originalKey).
   * @param {(value: T, matches: readonly JoinEntry<I>[], key: string) => U} project - Project the outer value, matching inner data, and original outer key.
   * @returns {Result<U, M>} Buffer the inner input and project once per outer entry with all matching inner entries.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_JOIN](createQueryable({ x: 1 }), value => value, value => value, (value, matches) => [value, matches.length]);
   * ```
   */
  [GROUP_JOIN]<I, K, U>(
    this: Result<T, M>, inner: Query<I>,
    outerKey: (value: T, key: string) => K,
    innerKey: (value: I, key: string) => K,
    project: (value: T, matches: readonly JoinEntry<I>[], key: string) => U,
  ): Result<U, M>;
  /**
   * @description Emit projected explicitly keyed matches in outer order and inner encounter order, omitting unmatched outer entries.
   * @param {Queryable<I> | QuerySequence<I>} inner - Inner keyed input buffered for matching against each outer entry.
   * @param {(value: T, key: string) => K} outerKey - Select join identity from an outer (value, originalKey).
   * @param {(value: I, key: string) => K} innerKey - Select join identity from an inner (value, originalKey).
   * @param {(value: T, match: JoinMatch<I>, key: string) => JoinEntry<U>} project - Project the outer value, matching inner data, and original outer key.
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {QuerySequence<U>} Emit projected explicitly keyed matches in outer order and inner encounter order, omitting unmatched outer entries.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[INNER_JOIN](createQueryable({ x: 1 }), value => value, value => value, (value, match, key) => [`${key}:${match.key}`, value]);
   * ```
   */
  [INNER_JOIN]<I, K, U>(
    this: Result<T, M>, inner: Query<I>,
    outerKey: (value: T, key: string) => K,
    innerKey: (value: I, key: string) => K,
    project: (value: T, match: JoinMatch<I>, key: string) => JoinEntry<U>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U>;
  /**
   * @description Emit matches in outer order and project an explicit unmatched result when no inner entry matches.
   * @param {Queryable<I> | QuerySequence<I>} inner - Inner keyed input buffered for matching against each outer entry.
   * @param {(value: T, key: string) => K} outerKey - Select join identity from an outer (value, originalKey).
   * @param {(value: I, key: string) => K} innerKey - Select join identity from an inner (value, originalKey).
   * @param {(value: T, match: LeftJoinMatch<I>, key: string) => JoinEntry<U>} project - Project the outer value, matching inner data, and original outer key.
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {QuerySequence<U>} Emit matches in outer order and project an explicit unmatched result when no inner entry matches.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LEFT_JOIN](createQueryable({ x: 1 }), value => value, value => value, (value, match, key) => [match.matched ? `${key}:${match.key}` : key, value]);
   * ```
   */
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

/**
 * @description Indexes the inner input with SameValueZero keys, then projects every outer entry once with fresh matching tuples, including an empty array for no matches.
 * @param {Iterable<JoinEntry<T>>} outer - Outer entries in projection order.
 * @param {Iterable<JoinEntry<I>>} inner - Inner entries fully indexed before the first outer pull.
 * @param {(value: T, key: string) => K} outerKey - Selects each outer join identity using its original key.
 * @param {(value: I, key: string) => K} innerKey - Selects each inner join identity once during indexing.
 * @param {(value: T, matches: readonly JoinEntry<I>[], key: string) => U} project - Maps the outer value and ordered matching inner entries using the outer key.
 * @returns {Generator<JoinEntry<U>>} One projected value at each unchanged outer key.
 * @example
 * ```ts
 * [...groupJoinEntries([["a", 1]], [["x", 1]], n => n, n => n, (_n, matches) => matches.length)];
 * // [["a", 1]]
 * ```
 */
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

/**
 * @description Indexes all inner entries, then emits projected matching pairs in outer-then-inner order using SameValueZero join identities.
 * @param {Iterable<JoinEntry<T>>} outer - Outer entries to match after indexing.
 * @param {Iterable<JoinEntry<I>>} inner - Inner entries indexed in source order.
 * @param {(value: T, key: string) => K} outerKey - Selects the outer identity from the value and original key.
 * @param {(value: I, key: string) => K} innerKey - Selects the inner identity from the value and original key.
 * @param {(value: T, match: JoinMatch<I>, key: string) => JoinEntry<U>} project - Chooses an explicit output key and value for each matched pair.
 * @returns {Generator<JoinEntry<U>>} Projected pairs; unmatched outer entries produce no output.
 * @example
 * ```ts
 * [...innerJoinEntries([["a", 1]], [["x", 1]], n => n, n => n,
 *   (n, match, key) => [`${key}/${match.key}`, n + match.value])]; // [["a/x", 2]]
 * ```
 */
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

/**
 * @description Indexes inner entries and projects matching pairs, or one unmatched context per outer entry without a match. Stored undefined is distinguished by the matched discriminant.
 * @param {Iterable<JoinEntry<T>>} outer - Outer entries, all represented in the result.
 * @param {Iterable<JoinEntry<I>>} inner - Inner entries fully indexed first using SameValueZero identities.
 * @param {(value: T, key: string) => K} outerKey - Selects the outer join identity with the original key.
 * @param {(value: I, key: string) => K} innerKey - Selects the inner join identity with the original key.
 * @param {(value: T, match: LeftJoinMatch<I>, key: string) => JoinEntry<U>} project - Produces an explicit output tuple for each match or unmatched row.
 * @returns {Generator<JoinEntry<U>>} Projected tuples in outer-then-inner order, without output collision filtering.
 * @example
 * ```ts
 * [...leftJoinEntries([["a", 1]], [], n => n, (n: number) => n,
 *   (_n, match, key) => [key, match.matched ? match.value : 0])]; // [["a", 0]]
 * ```
 */
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
