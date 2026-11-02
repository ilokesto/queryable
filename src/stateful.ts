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

/** Key-preserving effects, accumulation, and eager partitioning across query modes. */
export interface Stateful<T, M extends "record" | "sequence"> {
  /**
   * @description Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * @param {(value: T, key: string) => value is S} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {[Result<S, M>, Result<T, M>]} Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * - 0 `QuerySequence<S>` - Matching entries with narrowed values when using a type guard.
   * - 1 `QuerySequence<T>` - Nonmatching entries retaining the original value type.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PARTITION](value => value > 1);
   * ```
   */
  [PARTITION]<S extends T>(
    this: Result<T, M>, predicate: (value: T, key: string) => value is S,
  ): [Result<S, M>, Result<T, M>];
  /** Eagerly splits entries into matching and nonmatching snapshots in that tuple order. */
  [PARTITION](
    this: Result<T, M>, predicate: (value: T, key: string) => boolean,
  ): [Result<T, M>, Result<T, M>];
  /**
   * @description Emit each running accumulator at its original key, creating a fresh seed for every consumption.
   * @param {(accumulator: A, value: T, key: string) => A} reducer - Fold (accumulator, value, originalKey) in query order.
   * @param {() => A} seed - Create a fresh initial accumulator for each consumption.
   * @returns {Result<A, M>} Emit each running accumulator at its original key, creating a fresh seed for every consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SCAN]((sum, value) => sum + value, () => 0);
   * ```
   */
  [SCAN]<A>(
    this: Result<T, M>,
    reducer: (accumulator: A, value: T, key: string) => A,
    seed: () => A,
  ): Result<A, M>;
  /**
   * @description Observe each entry without changing its value or key, respecting eager or lazy evaluation.
   * @param {(value: T, key: string) => void} effect - Observe (value, originalKey) in query order; thrown values propagate.
   * @returns {Result<T, M>} Observe each entry without changing its value or key, respecting eager or lazy evaluation.
   * @example
   * ```ts
   * const seen: [string, number][] = [];
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAP]((value, key) => seen.push([key, value]));
   * ```
   */
  [TAP](this: Result<T, M>, effect: (value: T, key: string) => void): Result<T, M>;
  /**
   * @description Consume entries for side effects in query order, passing each value and original key.
   * @param {(value: T, key: string) => void} effect - Observe (value, originalKey) in query order; thrown values propagate.
   * @example
   * ```ts
   * const seen: [string, number][] = [];
   * const query = createQueryable({ a: 1, b: 2 });
   * query[EACH]((value, key) => seen.push([key, value]));
   * ```
   */
  [EACH](this: Result<T, M>, effect: (value: T, key: string) => void): void;
  /**
   * @description Passes the exact receiver to an external transform once, returning its result without wrapping or cloning.
   * @param {(query: Q) => R} fn - Transform receiving that exact receiver.
   * @returns {R} Unmodified transformation result.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1 });
   * query[THROUGH](value => value[COUNT]()); // 1
   * ```
   */
  [THROUGH]<Q extends Result<T, M>, R>(this: Q, fn: (query: Q) => R): R;
}

/**
 * @description Eagerly separates entries in one traversal, evaluating the predicate once per entry and preserving order within both sides.
 * @param {Iterable<Entry<T>>} source - Keyed entries to partition.
 * @param {(value: T, key: string) => boolean} predicate - Chooses the matching side using each original value and key.
 * @returns {[Entry<T>[], Entry<T>[]]} Two fresh arrays containing the original entry references.
 * - 0 `Entry<T>[]` - Entries accepted by the predicate in source order.
 * - 1 `Entry<T>[]` - Entries rejected by the predicate in source order.
 * @example
 * ```ts
 * partitionEntries([["a", 1], ["b", 2]], n => n % 2 === 0);
 * // [[["b", 2]], [["a", 1]]]
 * ```
 */
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

/**
 * @description Creates an accumulator on first pull and emits the result after each reduction at the original key, without emitting the seed itself.
 * @param {Iterable<Entry<T>>} source - Entries reduced in source order.
 * @param {(accumulator: A, value: T, key: string) => A} reducer - Produces each running accumulator using the previous state and original key.
 * @param {() => A} seed - Called once when consumption starts, including for an empty source.
 * @returns {Generator<Entry<A>>} Keyed running accumulator references; mutable states are not cloned.
 * @example
 * ```ts
 * [...scanEntries([["a", 1], ["b", 2]], (sum, n) => sum + n, () => 0)];
 * // [["a", 1], ["b", 3]]
 * ```
 */
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

/**
 * @description Runs a keyed effect immediately before yielding each original entry. Effect return values are ignored and thrown values propagate.
 * @param {Iterable<Entry<T>>} source - Entries visited on demand.
 * @param {(value: T, key: string) => void} effect - Observes each visited value and original key.
 * @returns {Generator<Entry<T>>} Unchanged entries after their effects complete.
 * @example
 * ```ts
 * const seen: string[] = [];
 * [...tapEntries([["a", 1]], (_n, key) => { seen.push(key); })];
 * // seen is ["a"]
 * ```
 */
export function* tapEntries<T>(
  source: Iterable<Entry<T>>, effect: (value: T, key: string) => void,
): Generator<Entry<T>> {
  for (const entry of source) {
    effect(entry[1], entry[0]);
    yield entry;
  }
}

/**
 * @description Immediately consumes every entry for its effect without collecting output or treating a false return as a stop signal.
 * @param {Iterable<Entry<T>>} source - Entries to visit in source order.
 * @param {(value: T, key: string) => void} effect - Runs once per entry with the original value and key.
 * @example
 * ```ts
 * const seen: string[] = [];
 * eachEntry([["a", 1], ["b", 2]], (_n, key) => { seen.push(key); });
 * // seen is ["a", "b"]
 * ```
 */
export function eachEntry<T>(source: Iterable<Entry<T>>, effect: (value: T, key: string) => void): void {
  for (const [key, value] of source) {
    effect(value, key);
  }
}

/**
 * @description Passes the exact receiver to an external transform once, returning its result without wrapping or cloning.
 * @param {(query: Q) => R} fn - Transform receiving that exact receiver.
 * @returns {R} Unmodified transformation result.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1 });
 * query[THROUGH](value => value[COUNT]()); // 1
 * ```
 */
export function through<Q, R>(this: Q, fn: (query: Q) => R): R {
  return fn(this);
}
