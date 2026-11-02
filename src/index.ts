import type { Truthy } from "./predicates.js";
export { isDefined, isNonNullish, negate } from "./predicates.js";
export type { Truthy } from "./predicates.js";

import {
  MAX_BY, MIN_BY, NTH_BY, RANK_BY, SORT_BY, TOP_K,
  extremum, nthValue, rankKey, sortByEntries, topEntries, validatePosition,
} from "./ordering.js";
import type { OrderRules } from "./ordering.js";
export { MAX_BY, MIN_BY, NTH_BY, RANK_BY, SORT_BY, TOP_K } from "./ordering.js";
export type { OrderKey, OrderRule, OrderRules } from "./ordering.js";

import { EACH, PARTITION, SCAN, TAP, THROUGH, eachEntry, partitionEntries, scanEntries, tapEntries, through } from "./stateful.js";
import type { Stateful } from "./stateful.js";

export { EACH, PARTITION, SCAN, TAP, THROUGH } from "./stateful.js";

import {
  DISTINCT, DISTINCT_BY, DISTINCT_UNTIL_CHANGED, DISTINCT_UNTIL_CHANGED_BY,
  distinctEntries, distinctUntilChangedEntries, identity,
} from "./distinct.js";

export { DISTINCT, DISTINCT_BY, DISTINCT_UNTIL_CHANGED, DISTINCT_UNTIL_CHANGED_BY } from "./distinct.js";

import { AVERAGE, COUNT_BY, MAX, MIN, REDUCE_BY, STATS, SUM, numericStats, reduceBy } from "./aggregation.js";
import type { NumericStats } from "./aggregation.js";

export { AVERAGE, COUNT_BY, MAX, MIN, REDUCE_BY, STATS, SUM } from "./aggregation.js";
export type { NumericStats } from "./aggregation.js";
export { FINALIZE, ON_COMPLETE } from "./lifetime.js";
export type { ConsumptionOutcome } from "./lifetime.js";
export { MAP_CONCURRENT } from "./concurrency.js";
export type { ConcurrentMapOptions } from "./concurrency.js";
export { FALLBACK, createRetryAsyncQuerySequence } from "./recovery.js";
export type { AsyncFallbackFactory } from "./recovery.js";

import {
  AT, EVERY, FIND_ENTRY, FIRST_OR, FIRST_OR_ELSE, INCLUDES, IS_EMPTY, LAST, SINGLE,
  at, every, findEntry, firstOr, firstOrElse, includes, isEmpty, last, single,
} from "./lookup.js";
import type { LookupTerminals } from "./lookup.js";
export { AT, EVERY, FIND_ENTRY, FIRST_OR, FIRST_OR_ELSE, INCLUDES, IS_EMPTY, LAST, SINGLE } from "./lookup.js";

import {
  DROP_LAST, DROP_WHILE, SKIP, TAKE_LAST, TAKE_WHILE,
  dropLastEntries, dropWhileEntries, skipEntries, takeLastEntries, takeWhileEntries,
} from "./bounds.js";

export { DROP_LAST, DROP_WHILE, SKIP, TAKE_LAST, TAKE_WHILE } from "./bounds.js";

import { checkedEntries } from "./entries.js";
import { GROUP_JOIN, INNER_JOIN, LEFT_JOIN, groupJoinEntries, innerJoinEntries, leftJoinEntries } from "./joins.js";
import type { JoinEntry, JoinMatch, LeftJoinMatch, JoinOperations } from "./joins.js";
export { GROUP_JOIN, INNER_JOIN, LEFT_JOIN } from "./joins.js";
export type { JoinEntry, JoinMatch, LeftJoinMatch } from "./joins.js";
import type { EntrySourceFactory, KeyCollisionPolicy } from "./entries.js";
import { DIFFERENCE, INTERSECTION, UNION, membershipEntries, unionEntries } from "./sets.js";

export { DIFFERENCE, INTERSECTION, UNION } from "./sets.js";
import { CONCAT, ZIP, FLAT_MAP, concatEntries, flatMapEntries, managedEntries, zipEntries } from "./combine.js";

export { CONCAT, ZIP, FLAT_MAP } from "./combine.js";

import {
  CHUNK, WINDOW, PAIRWISE, SPLIT, PARTITION_BY,
  copyBuffer, copyPair, copyBuffers, windowEntries, pairEntries,
  splitEntries, partitionEntries as adjacentGroupEntries, validateWindowSize,
} from "./windows.js";
import type { EntryBuffer, EntryPair, WindowOperations } from "./windows.js";

export { CHUNK, WINDOW, PAIRWISE, SPLIT, PARTITION_BY } from "./windows.js";
export type { EntryBuffer, EntryPair, WindowEntry } from "./windows.js";

import { defer, filterEntries, fuseMap, fuseWhere, mapEntries } from "./fusion.js";

import { BFS, DFS, traversalDepth, traversalEntries } from "./traversal.js";
import type { ChildrenSelector, TraversalKeySelector, TraversalNode, TraversalOptions } from "./traversal.js";
export { BFS, DFS } from "./traversal.js";
export type { ChildrenSelector, TraversalContext, TraversalKeySelector, TraversalNode, TraversalOptions } from "./traversal.js";

export { DuplicateKeyError } from "./entries.js";
export type { EntrySourceFactory, KeyCollisionPolicy } from "./entries.js";
export {
  compose, count, entries, find, first, lazy, limit, map, pick, pipe,
  reduce, some, sort, toObject, values, where,
} from "./functional.js";
export { createShapeQueryable } from "./shape.js";
export type { ShapeEntry, ShapeQueryable, ShapeSnapshot } from "./shape.js";
export { createAsyncQuerySequence, iterateAsyncEntries, iterateAsyncValues } from "./async.js";
export type { AsyncEntrySourceFactory, AsyncQuerySequence, AsyncQuerySequenceOptions } from "./async.js";

import {
  COUNT, ENTRIES, FIND, FIRST, GROUP_BY, GROUP_BY_MAP, GROUP_BY_PROP, KEYS,
  LAZY, LIMIT, MAP, PICK, REDUCE, SOME, SORT, TO_MAP, TO_OBJECT, TO_SET, VALUES, WHERE,
} from "./core-symbols.js";
export {
  COUNT, ENTRIES, FIND, FIRST, GROUP_BY, GROUP_BY_MAP, GROUP_BY_PROP, KEYS,
  LAZY, LIMIT, MAP, PICK, REDUCE, SOME, SORT, TO_MAP, TO_OBJECT, TO_SET, VALUES, WHERE,
} from "./core-symbols.js";

const ITERATE = Symbol("iterate");
const COMBINE = Symbol("combine");
type Entry<T> = readonly [string, T];
type Mode = "record" | "sequence";
type Result<T, M extends Mode> = M extends "record" ? Queryable<T> : QuerySequence<T>;
type PropertyKeys<T> = T extends unknown ? keyof T : never;
type PropertyValue<T, P extends PropertyKey> = T extends unknown ? P extends keyof T ? T[P] : never : never;
type StringProperty<T> = {
  [P in PropertyKeys<T> & string]: Exclude<PropertyValue<T, P>, string | undefined> extends never
    ? Extract<PropertyValue<T, P>, string> extends never ? never : P
    : never;
}[PropertyKeys<T> & string];
type PropertyMember<T, P extends PropertyKey, K extends string> =
  T extends unknown ? P extends keyof T ? [T[P] & K] extends [never] ? never : T : never : never;
type PropertyGroups<T, P extends PropertyKey, M extends Mode> = {
  [K in Extract<PropertyValue<T, P>, string>]?: Result<PropertyMember<T, P, K>, M>;
};

interface Source<T> {
  [ITERATE](): Iterable<Entry<T>>;
  [COMBINE]<U>(factory: EntrySourceFactory<U>, options?: QuerySequenceOptions): QuerySequence<U>;
}

interface Terminals<T> extends Source<T>, LookupTerminals<T, Source<T>> {
  /**
   * @description Return the first value tied for the smallest lexicographic ordering key, or undefined when empty.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {T | undefined} Return the first value tied for the smallest lexicographic ordering key, or undefined when empty.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MIN_BY]({ select: value => value });
   * ```
   */
  [MIN_BY](this: Source<T>, ...rules: OrderRules<T>): T | undefined;
  /**
   * @description Return the first value tied for the largest lexicographic ordering key, or undefined when empty.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {T | undefined} Return the first value tied for the largest lexicographic ordering key, or undefined when empty.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MAX_BY]({ select: value => value });
   * ```
   */
  [MAX_BY](this: Source<T>, ...rules: OrderRules<T>): T | undefined;
  /**
   * @description Select a stable ordered position; negative safe integers count from the end and missing positions return undefined.
   * @param {number} index - Zero-based position; negative positions count from the end.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {T | undefined} Select a stable ordered position; negative safe integers count from the end and missing positions return undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[NTH_BY](-1, { select: value => value });
   * ```
   */
  [NTH_BY](this: Source<T>, index: number, ...rules: OrderRules<T>): T | undefined;
  /**
   * @description Return the zero-based stable rank of an original key, or undefined when that key is absent.
   * @param {string} key - Original string key whose stable rank is requested.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {number | undefined} Return the zero-based stable rank of an original key, or undefined when that key is absent.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[RANK_BY]("a", { select: value => value });
   * ```
   */
  [RANK_BY](this: Source<T>, key: string, ...rules: OrderRules<T>): number | undefined;
  /**
   * @description Consume into a fresh Map preserving entry order and stored undefined values.
   * @returns {Map<string, T>} Consume into a fresh Map preserving entry order and stored undefined values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TO_MAP]();
   * ```
   */
  [TO_MAP](this: Source<T>): Map<string, T>;
  /**
   * @description Consume into a fresh Set using SameValueZero equality and reference identity.
   * @returns {Set<T>} Consume into a fresh Set using SameValueZero equality and reference identity.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TO_SET]();
   * ```
   */
  [TO_SET](this: Source<T>): Set<T>;
  /**
   * @description Collect original string keys in query order into a fresh array.
   * @returns {string[]} Collect original string keys in query order into a fresh array.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[KEYS]();
   * ```
   */
  [KEYS](this: Source<T>): string[];
  /**
   * @description Sum selected numbers in query order; empty input returns positive zero.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number} Sum selected numbers in query order; empty input returns positive zero.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SUM](value => value);
   * ```
   */
  [SUM](this: Source<T>, selector: (value: T, key: string) => number): number;
  /**
   * @description Average selected numbers in one traversal; empty input returns undefined.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number | undefined} Average selected numbers in one traversal; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[AVERAGE](value => value);
   * ```
   */
  [AVERAGE](this: Source<T>, selector: (value: T, key: string) => number): number | undefined;
  /**
   * @description Find the minimum selected number using Math.min semantics; empty input returns undefined.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number | undefined} Find the minimum selected number using Math.min semantics; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MIN](value => value);
   * ```
   */
  [MIN](this: Source<T>, selector: (value: T, key: string) => number): number | undefined;
  /**
   * @description Find the maximum selected number using Math.max semantics; empty input returns undefined.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number | undefined} Find the maximum selected number using Math.max semantics; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MAX](value => value);
   * ```
   */
  [MAX](this: Source<T>, selector: (value: T, key: string) => number): number | undefined;
  /**
   * @description Compute count, sum, average, minimum, and maximum with one selector call per entry.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {NumericStats} Compute count, sum, average, minimum, and maximum with one selector call per entry.
   * - count `number` - Number of visited entries.
   * - sum `number` - Sum, or positive zero when empty.
   * - average `number | undefined` - Mean, or undefined when empty.
   * - min `number | undefined` - Minimum, or undefined when empty.
   * - max `number | undefined` - Maximum, or undefined when empty.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[STATS](value => value);
   * ```
   */
  [STATS](this: Source<T>, selector: (value: T, key: string) => number): NumericStats;
  /**
   * @description Count entries per selected string group without materializing the grouped values.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Partial<Record<K, number>>} Count entries per selected string group without materializing the grouped values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[COUNT_BY](value => value > 1 ? "large" : "small");
   * ```
   */
  [COUNT_BY]<K extends string>(this: Source<T>, keyFn: (value: T, key: string) => K): Partial<Record<K, number>>;
  /**
   * @description Fold each string group independently, initializing once before its first reducer call.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @param {(groupKey: K) => A} initial - Initial accumulator; grouped folds call this factory once per encountered group.
   * @param {(accumulator: A, value: T, key: string) => A} reducer - Fold (accumulator, value, originalKey) in query order.
   * @returns {Partial<Record<K, A>>} Fold each string group independently, initializing once before its first reducer call.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[REDUCE_BY](() => "all", () => 0, (sum, value) => sum + value);
   * ```
   */
  [REDUCE_BY]<K extends string, A>(
    this: Source<T>,
    keyFn: (value: T, key: string) => K,
    initial: (groupKey: K) => A,
    reducer: (accumulator: A, value: T, key: string) => A,
  ): Partial<Record<K, A>>;
  /**
   * @description Consume the query and count entries, returning zero for empty input.
   * @returns {number} Consume the query and count entries, returning zero for empty input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[COUNT]();
   * ```
   */
  [COUNT](this: Source<T>): number;
  /**
   * @description Read the first value without consuming later entries; empty input returns undefined.
   * @returns {T | undefined} Read the first value without consuming later entries; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIRST]();
   * ```
   */
  [FIRST](this: Source<T>): T | undefined;
  /**
   * @description Materialize a fresh value array in query order, retaining shallow references.
   * @returns {T[]} Materialize a fresh value array in query order, retaining shallow references.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[VALUES]();
   * ```
   */
  [VALUES](this: Source<T>): T[];
  /**
   * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @param {BooleanConstructor} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {Truthy<T> | undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIND](value => value > 1);
   * ```
   */
  [FIND](this: Source<T>, predicate: BooleanConstructor): Truthy<T> | undefined;
  /**
   * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @param {(value: T, key: string) => false} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIND](value => value > 1);
   * ```
   */
  [FIND](this: Source<T>, predicate: (value: T, key: string) => false): undefined;
  /**
   * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @param {(value: T, key: string) => value is S} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {S | undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIND](value => value > 1);
   * ```
   */
  [FIND]<S extends T>(this: Source<T>, predicate: (value: T, key: string) => value is S): S | undefined;
  /**
   * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @param {(value: T, key: string) => boolean} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {T | undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIND](value => value > 1);
   * ```
   */
  [FIND](this: Source<T>, predicate: (value: T, key: string) => boolean): T | undefined;
  /**
   * @description Stop at the first matching entry; empty input returns false.
   * @param {(value: T, key: string) => boolean} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {boolean} Stop at the first matching entry; empty input returns false.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SOME](value => value > 1);
   * ```
   */
  [SOME](this: Source<T>, predicate: (value: T, key: string) => boolean): boolean;
  /**
   * @description Materialize fresh key-value tuples in query order without copying nested values.
   * @returns {[string, T][]} Materialize fresh key-value tuples in query order without copying nested values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[ENTRIES]();
   * ```
   */
  [ENTRIES](this: Source<T>): [string, T][];
  /**
   * @description Materialize an ordinary shallow object with safe own special keys and native object key ordering.
   * @returns {Record<string, T>} Materialize an ordinary shallow object with safe own special keys and native object key ordering.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TO_OBJECT]();
   * ```
   */
  [TO_OBJECT](this: Source<T>): Record<string, T>;
  /**
   * @description Fold entries in query order from the supplied accumulator; empty input returns it unchanged.
   * @param {(accumulator: A, value: T, key: string) => A} reducer - Fold (accumulator, value, originalKey) in query order.
   * @param {A} initial - Initial accumulator returned unchanged for empty input.
   * @returns {A} Fold entries in query order from the supplied accumulator; empty input returns it unchanged.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[REDUCE]((sum, value) => sum + value, 0);
   * ```
   */
  [REDUCE]<A>(this: Source<T>, reducer: (accumulator: A, value: T, key: string) => A, initial: A): A;
}

interface Operations<T, M extends Mode> extends Terminals<T>, JoinOperations<T, M>, Stateful<T, M>, WindowOperations<T, Result<T, M>> {
  /**
   * @description Create a repeatable lazy breadth-first traversal with explicit output keys and optional visit deduplication.
   * @param {ChildrenSelector<T>} children - Select ordered child entries from (value, traversalContext).
   * @param {TraversalKeySelector<T>} keySelector - Select the output string identity from (value, traversalContext).
   * @param {TraversalOptions<T>} [options] - Traversal or output identity configuration.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @param {number} [options.maxDepth] - Inclusive maximum depth; defaults to Infinity.
   * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Skip repeated identities and their descendants across all roots.
   * @returns {QuerySequence<TraversalNode<T>>} Create a repeatable lazy breadth-first traversal with explicit output keys and optional visit deduplication.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[BFS](() => [], (_value, context) => JSON.stringify(context.path), { maxDepth: 2 });
   * ```
   */
  [BFS](this: Result<T, M>, children: ChildrenSelector<T>, keySelector: TraversalKeySelector<T>, options?: TraversalOptions<T>): QuerySequence<TraversalNode<T>>;
  /**
   * @description Create a repeatable lazy preorder depth-first traversal without using the recursive call stack.
   * @param {ChildrenSelector<T>} children - Select ordered child entries from (value, traversalContext).
   * @param {TraversalKeySelector<T>} keySelector - Select the output string identity from (value, traversalContext).
   * @param {TraversalOptions<T>} [options] - Traversal or output identity configuration.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @param {number} [options.maxDepth] - Inclusive maximum depth; defaults to Infinity.
   * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Skip repeated identities and their descendants across all roots.
   * @returns {QuerySequence<TraversalNode<T>>} Create a repeatable lazy preorder depth-first traversal without using the recursive call stack.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DFS](() => [], (_value, context) => JSON.stringify(context.path), { maxDepth: 2 });
   * ```
   */
  [DFS](this: Result<T, M>, children: ChildrenSelector<T>, keySelector: TraversalKeySelector<T>, options?: TraversalOptions<T>): QuerySequence<TraversalNode<T>>;
  /**
   * @description Keep the first left entry per selected identity absent from the buffered right side.
   * @param {QuerySequence<U>} right - Right input whose selected identities are buffered for comparison.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @returns {Result<T, M>} Keep the first left entry per selected identity absent from the buffered right side.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DIFFERENCE](createQuerySequence(() => [["x", 2]]), value => value, value => value);
   * ```
   */
  [DIFFERENCE]<U, K>(
    this: Result<T, M>, right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
  ): Result<T, M>;
  /**
   * @description Keep the first left entry per selected identity present in the buffered right side.
   * @param {QuerySequence<U>} right - Right input whose selected identities are buffered for comparison.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @returns {Result<T, M>} Keep the first left entry per selected identity present in the buffered right side.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[INTERSECTION](createQuerySequence(() => [["x", 2]]), value => value, value => value);
   * ```
   */
  [INTERSECTION]<U, K>(
    this: Result<T, M>, right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
  ): Result<T, M>;
  /**
   * @description Keep the first identity encountered left-to-right, applying the duplicate key policy to output keys.
   * @param {QuerySequence<U>} right - Right input visited after the left input; only the last duplicate-key policy requires full output buffering.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {Result<T | U, M>} Keep the first identity encountered left-to-right, applying the duplicate key policy to output keys.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[UNION](createQuerySequence(() => [["c", 3]]), value => value, value => value);
   * ```
   */
  [UNION]<U, K>(
    this: Result<T, M>, right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
    options?: QuerySequenceOptions,
  ): Result<T | U, M>;
  /**
   * @description Append keyed sources in order; output key collisions follow the supplied policy, defaulting to error.
   * @param {readonly (Queryable<U> | QuerySequence<U>)[]} sources - Additional keyed sources, consumed in argument order.
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {QuerySequence<T | U>} Append keyed sources in order; output key collisions follow the supplied policy, defaulting to error.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[CONCAT]([createQueryable({ c: 3 })]);
   * ```
   */
  [CONCAT]<U>(this: Result<T, M>, sources: readonly (Queryable<U> | QuerySequence<U>)[], options?: QuerySequenceOptions): QuerySequence<T | U>;
  /**
   * @description Pair positions from left to right until the shortest source ends, retaining the receiver key.
   * @param {{ [K in keyof U]: Queryable<U[K]> | QuerySequence<U[K]> }} sources - Additional keyed sources, consumed in argument order.
   * @returns {QuerySequence<[T, ...U]>} Pair positions from left to right until the shortest source ends, retaining the receiver key.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[ZIP](createQueryable({ x: "one", y: "two" }));
   * ```
   */
  [ZIP]<U extends readonly unknown[]>(this: Result<T, M>, ...sources: { [K in keyof U]: Queryable<U[K]> | QuerySequence<U[K]> }): QuerySequence<[T, ...U]>;
  /**
   * @description Flatten explicitly keyed mapper output, retaining each emitted identity under the duplicate key policy.
   * @param {(value: T, originalKey: string) => Iterable<Entry<U>>} mapper - Map (value, originalKey) to explicitly keyed output entries.
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {QuerySequence<U>} Flatten explicitly keyed mapper output, retaining each emitted identity under the duplicate key policy.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FLAT_MAP]((value, key) => [[key, value * 2]]);
   * ```
   */
  [FLAT_MAP]<U>(this: Result<T, M>, mapper: (value: T, originalKey: string) => Iterable<Entry<U>>, options?: QuerySequenceOptions): QuerySequence<U>;
  /**
   * @description Stably sort by lexicographic rules, caching each selector once per entry per consumption.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {QuerySequence<T>} Stably sort by lexicographic rules, caching each selector once per entry per consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SORT_BY]({ select: value => value, direction: "desc" });
   * ```
   */
  [SORT_BY](this: Result<T, M>, ...rules: OrderRules<T>): QuerySequence<T>;
  /**
   * @description Keep at most k winners and emit them in stable sorted order; k must be a nonnegative safe integer.
   * @param {number} k - Maximum number of winners; a nonnegative safe integer.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {QuerySequence<T>} Keep at most k winners and emit them in stable sorted order; k must be a nonnegative safe integer.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TOP_K](2, { select: value => value });
   * ```
   */
  [TOP_K](this: Result<T, M>, k: number, ...rules: OrderRules<T>): QuerySequence<T>;
  /**
   * @description Keep the first entry for each value using SameValueZero equality and reference identity.
   * @returns {Result<T, M>} Keep the first entry for each value using SameValueZero equality and reference identity.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT]();
   * ```
   */
  [DISTINCT](this: Result<T, M>): Result<T, M>;
  /**
   * @description Keep the first entry per selected identity, passing original keys to the selector.
   * @param {(value: T, key: string) => K} select - Select identity from (value, originalKey).
   * @returns {Result<T, M>} Keep the first entry per selected identity, passing original keys to the selector.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_BY](value => value % 2);
   * ```
   */
  [DISTINCT_BY]<K>(this: Result<T, M>, select: (value: T, key: string) => K): Result<T, M>;
  /**
   * @description Keep the first entry of each adjacent run of SameValueZero-equal values.
   * @returns {Result<T, M>} Keep the first entry of each adjacent run of SameValueZero-equal values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_UNTIL_CHANGED]();
   * ```
   */
  [DISTINCT_UNTIL_CHANGED](this: Result<T, M>): Result<T, M>;
  /**
   * @description Keep the first entry of each adjacent run of equal selected identities.
   * @param {(value: T, key: string) => K} select - Select identity from (value, originalKey).
   * @returns {Result<T, M>} Keep the first entry of each adjacent run of equal selected identities.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_UNTIL_CHANGED_BY](value => value % 2);
   * ```
   */
  [DISTINCT_UNTIL_CHANGED_BY]<K>(this: Result<T, M>, select: (value: T, key: string) => K): Result<T, M>;
  /**
   * @description Eagerly snapshot groups in a Map using native key identity and encounter order.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Map<K, Result<T, M>>} Eagerly snapshot groups in a Map using native key identity and encounter order.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_BY_MAP](value => value % 2);
   * ```
   */
  [GROUP_BY_MAP]<K>(this: Result<T, M>, keyFn: (value: T, key: string) => K): Map<K, Result<T, M>>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {BooleanConstructor} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {Result<Truthy<T>, M>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE](this: Result<T, M>, predicate: BooleanConstructor): Result<Truthy<T>, M>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {(value: T, key: string) => false} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {Result<never, M>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE](this: Result<T, M>, predicate: (value: T, key: string) => false): Result<never, M>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {(value: T, key: string) => value is S} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {Result<S, M>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE]<S extends T>(this: Result<T, M>, predicate: (value: T, key: string) => value is S): Result<S, M>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {(value: T, key: string) => boolean} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {Result<T, M>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE](this: Result<T, M>, predicate: (value: T, key: string) => boolean): Result<T, M>;
  /**
   * @description Stably order values with the comparator and return a sequence; lazy inputs defer sorting until consumption.
   * @param {(a: T, b: T) => number} compareFn - Compare (leftValue, rightValue); zero retains encounter order.
   * @returns {QuerySequence<T>} Stably order values with the comparator and return a sequence; lazy inputs defer sorting until consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SORT]((left, right) => right - left);
   * ```
   */
  [SORT](this: Result<T, M>, compareFn: (a: T, b: T) => number): QuerySequence<T>;
  /**
   * @description Transform values with their original keys, retaining the receiver evaluation mode.
   * @param {(value: T, key: string) => U} fn - Transform (value, originalKey) into the output value.
   * @returns {Result<U, M>} Transform values with their original keys, retaining the receiver evaluation mode.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MAP]((value, key) => `${key}:${value}`);
   * ```
   */
  [MAP]<U>(this: Result<T, M>, fn: (value: T, key: string) => U): Result<U, M>;
  /**
   * @description Select existing original keys once in requested order; sequence inputs are buffered and records use native object ordering.
   * @param {string[]} keys - Original record keys requested in selection order; missing and repeated keys are ignored.
   * @returns {Result<T, M>} Select existing original keys once in requested order; sequence inputs are buffered and records use native object ordering.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PICK]("b", "a", "missing");
   * ```
   */
  [PICK](this: Result<T, M>, ...keys: string[]): Result<T, M>;
  /**
   * @description Apply slice(0, n) semantics, truncating fractions; finite negative bounds buffer the input.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Result<T, M>} Apply slice(0, n) semantics, truncating fractions; finite negative bounds buffer the input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LIMIT](1);
   * ```
   */
  [LIMIT](this: Result<T, M>, n: number): Result<T, M>;
  /**
   * @description Skip a truncated nonnegative count; NaN and negative counts skip nothing.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Result<T, M>} Skip a truncated nonnegative count; NaN and negative counts skip nothing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SKIP](1);
   * ```
   */
  [SKIP](this: Result<T, M>, n: number): Result<T, M>;
  /**
   * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @param {(value: T, key: string) => value is S} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {Result<S, M>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_WHILE](value => value < 2);
   * ```
   */
  [TAKE_WHILE]<S extends T>(this: Result<T, M>, predicate: (value: T, key: string) => value is S): Result<S, M>;
  /**
   * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @param {(value: T, key: string) => boolean} predicate - Predicate receiving each tested value and its original key in query order.
   * @returns {Result<T, M>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_WHILE](value => value < 2);
   * ```
   */
  [TAKE_WHILE](this: Result<T, M>, predicate: (value: T, key: string) => boolean): Result<T, M>;
  /**
   * @description Drop only the matching prefix and retain all entries after the first false predicate.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) only until the first false result; later entries are retained without further tests.
   * @returns {Result<T, M>} Drop only the matching prefix and retain all entries after the first false predicate.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DROP_WHILE](value => value < 2);
   * ```
   */
  [DROP_WHILE](this: Result<T, M>, predicate: (value: T, key: string) => boolean): Result<T, M>;
  /**
   * @description Retain the final normalized count of entries, buffering at most that many until exhaustion.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Result<T, M>} Retain the final normalized count of entries, buffering at most that many until exhaustion.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_LAST](2);
   * ```
   */
  [TAKE_LAST](this: Result<T, M>, n: number): Result<T, M>;
  /**
   * @description Exclude the final normalized count of entries using bounded lookahead.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Result<T, M>} Exclude the final normalized count of entries using bounded lookahead.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DROP_LAST](1);
   * ```
   */
  [DROP_LAST](this: Result<T, M>, n: number): Result<T, M>;
  /**
   * @description Eagerly snapshot string-keyed groups with original entry keys; unencountered groups are absent.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Partial<Record<K, Result<T, M>>>} Eagerly snapshot string-keyed groups with original entry keys; unencountered groups are absent.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_BY](value => value > 1 ? "large" : "small");
   * ```
   */
  [GROUP_BY]<K extends string>(this: Result<T, M>, keyFn: (value: T, key: string) => K): Partial<Record<K, Result<T, M>>>;
  /**
   * @description Eagerly group by a string-valued discriminant, skipping missing and undefined properties.
   * @param {P} property - String-valued discriminant used to name groups.
   * @returns {PropertyGroups<T, P, M>} Eagerly group by a string-valued discriminant, skipping missing and undefined properties.
   * @example
   * ```ts
   * const query = createQueryable({ a: { kind: "cat" }, b: { kind: "dog" } });
   * query[GROUP_BY_PROP]("kind");
   * ```
   */
  [GROUP_BY_PROP]<P extends StringProperty<T>>(this: Result<T, M>, property: P): PropertyGroups<T, P, M>;
  /**
   * @description Return a repeatable lazy view without memoization; each consumption reruns pending work.
   * @returns {QuerySequence<T>} Return a repeatable lazy view without memoization; each consumption reruns pending work.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LAZY]();
   * ```
   */
  [LAZY](this: Result<T, M>): QuerySequence<T>;
}

/**
 * Mutable data record with eager, shared Symbol methods.
 * Operations shallow-copy data; SORT and LAZY transition to QuerySequence.
 * @example
 * const query: Queryable<number> = createQueryable({ a: 1 });
 * query[MAP](n => n + 1)[VALUES]();
 */
export interface Queryable<T> extends Operations<T, "record"> {
  /** Own enumerable string-keyed data. Nested values remain shared references. */
  [key: string]: T;
}

/**
 * Ordered query result without direct record properties.
 * Use ENTRIES, VALUES, or TO_OBJECT to extract data. LAZY opts into deferred work.
 * @example
 * const ordered: QuerySequence<number> = createQueryable({ 1: 10, 2: 20 })[SORT]((a, b) => b - a);
 * ordered[VALUES](); // [20, 10]
 */
export type QuerySequence<T> = Operations<T, "sequence">;

function* recordEntries<T>(record: Readonly<Record<string, T>>): Generator<Entry<T>> {
  for (const key in record) {
    if (Object.hasOwn(record, key)) {
      // The enumerated own key exists; T itself may legitimately include undefined.
      yield [key, record[key] as T];
    }
  }
}

function sortEntries<T>(source: Iterable<Entry<T>>, compareFn: (a: T, b: T) => number): Entry<T>[] {
  return Array.from(source).sort((a, b) => compareFn(a[1], b[1]));
}

function* pickEntries<T>(source: Iterable<Entry<T>>, keys: readonly string[]): Generator<Entry<T>> {
  const requested = new Set(keys);
  const entries = new Map<string, T>();
  for (const [key, value] of source) {
    if (requested.has(key)) {
      entries.set(key, value);
    }
  }
  for (const key of keys) {
    if (entries.has(key)) {
      // has() distinguishes a stored undefined from an absent record.
      yield [key, entries.get(key) as T];
      entries.delete(key);
    }
  }
}

function* limitEntries<T>(source: Iterable<Entry<T>>, n: number): Generator<Entry<T>> {
  const count = Number.isNaN(n) ? 0 : Math.trunc(n);
  if (count === 0 || count === -Infinity) {
    return;
  }
  if (count < 0) {
    yield* Array.from(source).slice(0, count);
    return;
  }
  let remaining = count;
  for (const entry of source) {
    yield entry;
    if (--remaining === 0) {
      return;
    }
  }
}

function fromEntries<T>(entries: Iterable<Entry<T>>): Queryable<T> {
  const result: Queryable<T> = Object.create(queryablePrototype);
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

function propertyGroupKey<T>(value: T, property: string): string | undefined {
  if ((typeof value === "object" && value !== null || typeof value === "function") && property in value) {
    const groupKey: unknown = Reflect.get(value, property);
    if (typeof groupKey === "string") {
      return groupKey;
    }
  }
  return undefined;
}

/**
 * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @param {BooleanConstructor} predicate - Predicate receiving each tested value and its original key in query order.
 * @returns {Truthy<T> | undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND](value => value > 1);
 * ```
 */
function find<T>(this: Source<T>, predicate: BooleanConstructor): Truthy<T> | undefined;
/**
 * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @param {(value: T, key: string) => false} predicate - Predicate receiving each tested value and its original key in query order.
 * @returns {undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND](value => value > 1);
 * ```
 */
function find<T>(this: Source<T>, predicate: (value: T, key: string) => false): undefined;
/**
 * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @param {(value: T, key: string) => value is S} predicate - Predicate receiving each tested value and its original key in query order.
 * @returns {S | undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND](value => value > 1);
 * ```
 */
function find<T, S extends T>(this: Source<T>, predicate: (value: T, key: string) => value is S): S | undefined;
/**
 * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @param {(value: T, key: string) => boolean} predicate - Predicate receiving each tested value and its original key in query order.
 * @returns {T | undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND](value => value > 1);
 * ```
 */
function find<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): T | undefined;
/**
 * @description Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @param {(value: T, key: string) => boolean} predicate - Predicate receiving each tested value and its original key in query order.
 * @returns {T | undefined} Return the first matching value and stop; no match returns undefined and type guards narrow the result.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND](value => value > 1);
 * ```
 */
function find<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): T | undefined {
  for (const [key, value] of this[ITERATE]()) {
    if (predicate(value, key)) {
      return value;
    }
  }
  return undefined;
}

/**
 * @description Return the sole matching value or undefined when absent; throw when a second match exists.
 * @param {(value: T, key: string) => value is S} predicate - Predicate receiving each tested value and its original key in query order.
 * @returns {S | undefined} Return the sole matching value or undefined when absent; throw when a second match exists.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[SINGLE](value => value === 2);
 * ```
 */
function lookupSingle<T, S extends T>(this: Source<T>, predicate: (value: T, key: string) => value is S): S | undefined;
/**
 * @description Return the sole matching value or undefined when absent; throw when a second match exists.
 * @param {(value: T, key: string) => boolean} [predicate] - Predicate receiving each tested value and its original key in query order.
 * @returns {T | undefined} Return the sole matching value or undefined when absent; throw when a second match exists.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[SINGLE](value => value === 2);
 * ```
 */
function lookupSingle<T>(this: Source<T>, predicate?: (value: T, key: string) => boolean): T | undefined;
/**
 * @description Return the sole matching value or undefined when absent; throw when a second match exists.
 * @param {(value: T, key: string) => boolean} [predicate] - Predicate receiving each tested value and its original key in query order.
 * @returns {T | undefined} Return the sole matching value or undefined when absent; throw when a second match exists.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[SINGLE](value => value === 2);
 * ```
 */
function lookupSingle<T>(this: Source<T>, predicate?: (value: T, key: string) => boolean): T | undefined {
  return single(this[ITERATE](), predicate);
}

/**
 * @description Return a fresh tuple for the first matching entry, or undefined when no entry matches.
 * @param {(value: T, key: string) => value is S} predicate - Predicate receiving each tested value and its original key in query order.
 * @returns {[string, S] | undefined} Return a fresh tuple for the first matching entry, or undefined when no entry matches.
 * - 0 `string` - Original entry key when a match exists.
 * - 1 `S` - Matching value when a match exists.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND_ENTRY](value => value > 1);
 * ```
 */
function lookupEntry<T, S extends T>(this: Source<T>, predicate: (value: T, key: string) => value is S): [string, S] | undefined;
/**
 * @description Return a fresh tuple for the first matching entry, or undefined when no entry matches.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {[string, T] | undefined} Return a fresh tuple for the first matching entry, or undefined when no entry matches.
 * - 0 `string` - Original entry key when a match exists.
 * - 1 `T` - Matching value when a match exists.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND_ENTRY](value => value > 1);
 * ```
 */
function lookupEntry<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): [string, T] | undefined;
/**
 * @description Return a fresh tuple for the first matching entry, or undefined when no entry matches.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {[string, T] | undefined} Return a fresh tuple for the first matching entry, or undefined when no entry matches.
 * - 0 `string` - Original entry key when a match exists.
 * - 1 `T` - Matching value when a match exists.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[FIND_ENTRY](value => value > 1);
 * ```
 */
function lookupEntry<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): [string, T] | undefined {
  return findEntry(this[ITERATE](), predicate);
}

const terminals = {
  /**
   * @description Return the first value tied for the smallest lexicographic ordering key, or undefined when empty.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {T | undefined} Return the first value tied for the smallest lexicographic ordering key, or undefined when empty.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MIN_BY]({ select: value => value });
   * ```
   */
  [MIN_BY]<T>(this: Source<T>, ...rules: OrderRules<T>): T | undefined {
    return extremum(this[ITERATE](), rules, false);
  },
  /**
   * @description Return the first value tied for the largest lexicographic ordering key, or undefined when empty.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {T | undefined} Return the first value tied for the largest lexicographic ordering key, or undefined when empty.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MAX_BY]({ select: value => value });
   * ```
   */
  [MAX_BY]<T>(this: Source<T>, ...rules: OrderRules<T>): T | undefined {
    return extremum(this[ITERATE](), rules, true);
  },
  /**
   * @description Select a stable ordered position; negative safe integers count from the end and missing positions return undefined.
   * @param {number} index - Zero-based position; negative positions count from the end.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {T | undefined} Select a stable ordered position; negative safe integers count from the end and missing positions return undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[NTH_BY](-1, { select: value => value });
   * ```
   */
  [NTH_BY]<T>(this: Source<T>, index: number, ...rules: OrderRules<T>): T | undefined {
    validatePosition(index, true);
    return nthValue(this[ITERATE](), index, rules);
  },
  /**
   * @description Return the zero-based stable rank of an original key, or undefined when that key is absent.
   * @param {string} key - Original string key whose stable rank is requested.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {number | undefined} Return the zero-based stable rank of an original key, or undefined when that key is absent.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[RANK_BY]("a", { select: value => value });
   * ```
   */
  [RANK_BY]<T>(this: Source<T>, key: string, ...rules: OrderRules<T>): number | undefined {
    return rankKey(this[ITERATE](), key, rules);
  },
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
  [EACH]<T>(this: Source<T>, effect: (value: T, key: string) => void): void {
    eachEntry(this[ITERATE](), effect);
  },
  [THROUGH]: through,
  /**
   * @description Consume into a fresh Map preserving entry order and stored undefined values.
   * @returns {Map<string, T>} Consume into a fresh Map preserving entry order and stored undefined values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TO_MAP]();
   * ```
   */
  [TO_MAP]<T>(this: Source<T>): Map<string, T> {
    return new Map(this[ITERATE]());
  },
  /**
   * @description Consume into a fresh Set using SameValueZero equality and reference identity.
   * @returns {Set<T>} Consume into a fresh Set using SameValueZero equality and reference identity.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TO_SET]();
   * ```
   */
  [TO_SET]<T>(this: Source<T>): Set<T> {
    const values = new Set<T>();
    for (const [, value] of this[ITERATE]()) {
      values.add(value);
    }
    return values;
  },
  /**
   * @description Collect original string keys in query order into a fresh array.
   * @returns {string[]} Collect original string keys in query order into a fresh array.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[KEYS]();
   * ```
   */
  [KEYS]<T>(this: Source<T>): string[] {
    return Array.from(this[ITERATE](), ([key]) => key);
  },
  /**
   * @description Sum selected numbers in query order; empty input returns positive zero.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number} Sum selected numbers in query order; empty input returns positive zero.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SUM](value => value);
   * ```
   */
  [SUM]<T>(this: Source<T>, selector: (value: T, key: string) => number): number {
    return numericStats(this[ITERATE](), selector).sum;
  },
  /**
   * @description Average selected numbers in one traversal; empty input returns undefined.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number | undefined} Average selected numbers in one traversal; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[AVERAGE](value => value);
   * ```
   */
  [AVERAGE]<T>(this: Source<T>, selector: (value: T, key: string) => number): number | undefined {
    return numericStats(this[ITERATE](), selector).average;
  },
  /**
   * @description Find the minimum selected number using Math.min semantics; empty input returns undefined.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number | undefined} Find the minimum selected number using Math.min semantics; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MIN](value => value);
   * ```
   */
  [MIN]<T>(this: Source<T>, selector: (value: T, key: string) => number): number | undefined {
    return numericStats(this[ITERATE](), selector).min;
  },
  /**
   * @description Find the maximum selected number using Math.max semantics; empty input returns undefined.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {number | undefined} Find the maximum selected number using Math.max semantics; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MAX](value => value);
   * ```
   */
  [MAX]<T>(this: Source<T>, selector: (value: T, key: string) => number): number | undefined {
    return numericStats(this[ITERATE](), selector).max;
  },
  /**
   * @description Compute count, sum, average, minimum, and maximum with one selector call per entry.
   * @param {(value: T, key: string) => number} selector - Select a value from (value, originalKey) once per visited entry.
   * @returns {NumericStats} Compute count, sum, average, minimum, and maximum with one selector call per entry.
   * - count `number` - Number of visited entries.
   * - sum `number` - Sum, or positive zero when empty.
   * - average `number | undefined` - Mean, or undefined when empty.
   * - min `number | undefined` - Minimum, or undefined when empty.
   * - max `number | undefined` - Maximum, or undefined when empty.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[STATS](value => value);
   * ```
   */
  [STATS]<T>(this: Source<T>, selector: (value: T, key: string) => number): NumericStats {
    return numericStats(this[ITERATE](), selector);
  },
  /**
   * @description Count entries per selected string group without materializing the grouped values.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Partial<Record<K, number>>} Count entries per selected string group without materializing the grouped values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[COUNT_BY](value => value > 1 ? "large" : "small");
   * ```
   */
  [COUNT_BY]<T, K extends string>(this: Source<T>, keyFn: (value: T, key: string) => K): Partial<Record<K, number>> {
    return reduceBy(this[ITERATE](), keyFn, count => count + 1, () => 0);
  },
  /**
   * @description Fold each string group independently, initializing once before its first reducer call.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @param {(groupKey: K) => A} initial - Initial accumulator; grouped folds call this factory once per encountered group.
   * @param {(accumulator: A, value: T, key: string) => A} reducer - Fold (accumulator, value, originalKey) in query order.
   * @returns {Partial<Record<K, A>>} Fold each string group independently, initializing once before its first reducer call.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[REDUCE_BY](() => "all", () => 0, (sum, value) => sum + value);
   * ```
   */
  [REDUCE_BY]<T, K extends string, A>(
    this: Source<T>,
    keyFn: (value: T, key: string) => K,
    initial: (groupKey: K) => A,
    reducer: (accumulator: A, value: T, key: string) => A,
  ): Partial<Record<K, A>> {
    return reduceBy(this[ITERATE](), keyFn, reducer, initial);
  },
  /**
   * @description Consume through the final entry and return its value, or undefined for empty input.
   * @returns {T | undefined} Consume through the final entry and return its value, or undefined for empty input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LAST]();
   * ```
   */
  [LAST]<T>(this: Source<T>): T | undefined {
    return last(this[ITERATE]());
  },
  /**
   * @description Read a zero-based position; negative indexes count from the end and absent positions return undefined.
   * @param {number} index - Zero-based position; negative positions count from the end.
   * @returns {T | undefined} Read a zero-based position; negative indexes count from the end and absent positions return undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[AT](-1);
   * ```
   */
  [AT]<T>(this: Source<T>, index: number): T | undefined {
    return at(this[ITERATE](), index);
  },
  [SINGLE]: lookupSingle,
  /**
   * @description Stop on the first false predicate; empty input returns true.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {boolean} Stop on the first false predicate; empty input returns true.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[EVERY](value => value > 0);
   * ```
   */
  [EVERY]<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): boolean {
    return every(this[ITERATE](), predicate);
  },
  /**
   * @description Probe whether an entry exists without traversing the remaining input.
   * @returns {boolean} Probe whether an entry exists without traversing the remaining input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[IS_EMPTY]();
   * ```
   */
  [IS_EMPTY]<T>(this: Source<T>): boolean {
    return isEmpty(this[ITERATE]());
  },
  /**
   * @description Test for a value using SameValueZero equality, including NaN and reference identity.
   * @param {T} value - Value to compare or use as the empty-input fallback.
   * @returns {boolean} Test for a value using SameValueZero equality, including NaN and reference identity.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[INCLUDES](2);
   * ```
   */
  [INCLUDES]<T>(this: Source<T>, value: T): boolean {
    return includes(this[ITERATE](), value);
  },
  [FIND_ENTRY]: lookupEntry,
  /**
   * @description Read the first value, retaining stored undefined; use the fallback only when no entry exists.
   * @param {U} value - Value to compare or use as the empty-input fallback.
   * @returns {T | U} Read the first value, retaining stored undefined; use the fallback only when no entry exists.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIRST_OR](0);
   * ```
   */
  [FIRST_OR]<T, U>(this: Source<T>, value: U): T | U {
    return firstOr(this[ITERATE](), value);
  },
  /**
   * @description Read the first value and invoke the fallback factory only when the query has no entries.
   * @param {() => U} factory - Create a fallback value only when there is no first entry.
   * @returns {T | U} Read the first value and invoke the fallback factory only when the query has no entries.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIRST_OR_ELSE](() => 0);
   * ```
   */
  [FIRST_OR_ELSE]<T, U>(this: Source<T>, factory: () => U): T | U {
    return firstOrElse(this[ITERATE](), factory);
  },
  [FIND]: find,
  /**
   * @description Stop at the first matching entry; empty input returns false.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {boolean} Stop at the first matching entry; empty input returns false.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SOME](value => value > 1);
   * ```
   */
  [SOME]<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): boolean {
    for (const [key, value] of this[ITERATE]()) {
      if (predicate(value, key)) {
        return true;
      }
    }
    return false;
  },
  /**
   * @description Consume the query and count entries, returning zero for empty input.
   * @returns {number} Consume the query and count entries, returning zero for empty input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[COUNT]();
   * ```
   */
  [COUNT]<T>(this: Source<T>): number {
    const source = this[ITERATE]();
    if (Array.isArray(source)) {
      return source.length;
    }
    let count = 0;
    for (const _entry of source) {
      count++;
    }
    return count;
  },
  /**
   * @description Read the first value without consuming later entries; empty input returns undefined.
   * @returns {T | undefined} Read the first value without consuming later entries; empty input returns undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIRST]();
   * ```
   */
  [FIRST]<T>(this: Source<T>): T | undefined {
    const source = this[ITERATE]();
    if (Array.isArray(source)) {
      return source[0]?.[1];
    }
    for (const [, value] of source) {
      return value;
    }
    return undefined;
  },
  /**
   * @description Materialize a fresh value array in query order, retaining shallow references.
   * @returns {T[]} Materialize a fresh value array in query order, retaining shallow references.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[VALUES]();
   * ```
   */
  [VALUES]<T>(this: Source<T>): T[] {
    return Array.from(this[ITERATE](), ([, value]) => value);
  },
  /**
   * @description Materialize fresh key-value tuples in query order without copying nested values.
   * @returns {[string, T][]} Materialize fresh key-value tuples in query order without copying nested values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[ENTRIES]();
   * ```
   */
  [ENTRIES]<T>(this: Source<T>): [string, T][] {
    return Array.from(this[ITERATE](), ([key, value]): [string, T] => [key, value]);
  },
  /**
   * @description Materialize an ordinary shallow object with safe own special keys and native object key ordering.
   * @returns {Record<string, T>} Materialize an ordinary shallow object with safe own special keys and native object key ordering.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TO_OBJECT]();
   * ```
   */
  [TO_OBJECT]<T>(this: Source<T>): Record<string, T> {
    return Object.fromEntries(this[ITERATE]());
  },
  /**
   * @description Fold entries in query order from the supplied accumulator; empty input returns it unchanged.
   * @param {(accumulator: A, value: T, key: string) => A} reducer - Fold (accumulator, value, originalKey) in query order.
   * @param {A} initial - Initial accumulator returned unchanged for empty input.
   * @returns {A} Fold entries in query order from the supplied accumulator; empty input returns it unchanged.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[REDUCE]((sum, value) => sum + value, 0);
   * ```
   */
  [REDUCE]<T, A>(this: Source<T>, reducer: (accumulator: A, value: T, key: string) => A, initial: A): A {
    let accumulator = initial;
    for (const [key, value] of this[ITERATE]()) {
      accumulator = reducer(accumulator, value, key);
    }
    return accumulator;
  },
};

/**
 * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @param {BooleanConstructor} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<Truthy<T>>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[WHERE](value => value > 1);
 * ```
 */
function where<T>(this: Queryable<T>, predicate: BooleanConstructor): Queryable<Truthy<T>>;
/**
 * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @param {(value: T, key: string) => false} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<never>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[WHERE](value => value > 1);
 * ```
 */
function where<T>(this: Queryable<T>, predicate: (value: T, key: string) => false): Queryable<never>;
/**
 * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @param {(value: T, key: string) => value is S} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<S>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[WHERE](value => value > 1);
 * ```
 */
function where<T, S extends T>(this: Queryable<T>, predicate: (value: T, key: string) => value is S): Queryable<S>;
/**
 * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<T>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[WHERE](value => value > 1);
 * ```
 */
function where<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T>;
/**
 * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<T>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[WHERE](value => value > 1);
 * ```
 */
function where<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T> {
  const result: Queryable<T> = Object.create(queryablePrototype);
  for (const key in this) {
    if (Object.hasOwn(this, key)) {
      const value = this[key] as T;
      if (predicate(value, key)) {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * @description Pair positions from left to right until the shortest source ends, retaining the receiver key.
 * @param {{ [K in keyof U]: Source<U[K]> }} sources - Additional keyed sources, consumed in argument order.
 * @returns {QuerySequence<[T, ...U]>} Pair positions from left to right until the shortest source ends, retaining the receiver key.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[ZIP](createQueryable({ x: "one", y: "two" }));
 * ```
 */
function zip<T, U extends readonly unknown[]>(
  this: Source<T>, ...sources: { [K in keyof U]: Source<U[K]> }
): QuerySequence<[T, ...U]>;
/**
 * @description Pair positions from left to right until the shortest source ends, retaining the receiver key.
 * @param {Source<unknown>[]} sources - Additional keyed sources, consumed in argument order.
 * @returns {QuerySequence<unknown[]>} Pair positions from left to right until the shortest source ends, retaining the receiver key.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[ZIP](createQueryable({ x: "one", y: "two" }));
 * ```
 */
function zip<T>(this: Source<T>, ...sources: Source<unknown>[]): QuerySequence<unknown[]> {
  const factories: EntrySourceFactory<unknown>[] = [
    () => this[ITERATE](),
    ...sources.map(source => () => source[ITERATE]()),
  ];
  // The helper emits one value per source, in the variadic signature's order.
  return this[COMBINE](() => zipEntries(factories));
}

const combinationMethods = {
  /**
   * @description Append keyed sources in order; output key collisions follow the supplied policy, defaulting to error.
   * @param {readonly Source<U>[]} sources - Additional keyed sources, consumed in argument order.
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {QuerySequence<T | U>} Append keyed sources in order; output key collisions follow the supplied policy, defaulting to error.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[CONCAT]([createQueryable({ c: 3 })]);
   * ```
   */
  [CONCAT]<T, U>(this: Source<T>, sources: readonly Source<U>[], options?: QuerySequenceOptions): QuerySequence<T | U> {
    const factories: EntrySourceFactory<T | U>[] = [
      () => this[ITERATE](),
      ...sources.map(source => () => source[ITERATE]()),
    ];
    return this[COMBINE](() => concatEntries(factories), options);
  },
  [ZIP]: zip,
  /**
   * @description Flatten explicitly keyed mapper output, retaining each emitted identity under the duplicate key policy.
   * @param {(value: T, originalKey: string) => Iterable<Entry<U>>} mapper - Map (value, originalKey) to explicitly keyed output entries.
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {QuerySequence<U>} Flatten explicitly keyed mapper output, retaining each emitted identity under the duplicate key policy.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FLAT_MAP]((value, key) => [[key, value * 2]]);
   * ```
   */
  [FLAT_MAP]<T, U>(
    this: Source<T>,
    mapper: (value: T, originalKey: string) => Iterable<Entry<U>>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U> {
    return this[COMBINE](() => flatMapEntries(() => this[ITERATE](), mapper), options);
  },
};

/**
 * @description Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
 * @param {(value: T, key: string) => value is S} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {[Queryable<S>, Queryable<T>]} Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
 * - 0 `Queryable<S>` - Matching entries with narrowed values when using a type guard.
 * - 1 `Queryable<T>` - Nonmatching entries retaining the original value type.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[PARTITION](value => value > 1);
 * ```
 */
function partition<T, S extends T>(
  this: Queryable<T>, predicate: (value: T, key: string) => value is S,
): [Queryable<S>, Queryable<T>];
/**
 * @description Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {[Queryable<T>, Queryable<T>]} Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
 * - 0 `Queryable<T>` - Matching entries with narrowed values when using a type guard.
 * - 1 `Queryable<T>` - Nonmatching entries retaining the original value type.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[PARTITION](value => value > 1);
 * ```
 */
function partition<T>(
  this: Queryable<T>, predicate: (value: T, key: string) => boolean,
): [Queryable<T>, Queryable<T>];
/**
 * @description Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {[Queryable<T>, Queryable<T>]} Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
 * - 0 `Queryable<T>` - Matching entries with narrowed values when using a type guard.
 * - 1 `Queryable<T>` - Nonmatching entries retaining the original value type.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[PARTITION](value => value > 1);
 * ```
 */
function partition<T>(
  this: Queryable<T>, predicate: (value: T, key: string) => boolean,
): [Queryable<T>, Queryable<T>] {
  const [matching, nonmatching] = partitionEntries(recordEntries(this), predicate);
  return [fromEntries(matching), fromEntries(nonmatching)];
}

/**
 * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
 * @param {(value: T, key: string) => value is S} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<S>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[TAKE_WHILE](value => value < 2);
 * ```
 */
function takeWhile<T, S extends T>(this: Queryable<T>, predicate: (value: T, key: string) => value is S): Queryable<S>;
/**
 * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<T>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[TAKE_WHILE](value => value < 2);
 * ```
 */
function takeWhile<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T>;
/**
 * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
 * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
 * @returns {Queryable<T>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
 * @example
 * ```ts
 * const query = createQueryable({ a: 1, b: 2 });
 * query[TAKE_WHILE](value => value < 2);
 * ```
 */
function takeWhile<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T> {
  return fromEntries(takeWhileEntries(recordEntries(this), predicate));
}

const queryablePrototype = {
  ...terminals,
  /**
   * @description Create a repeatable lazy breadth-first traversal with explicit output keys and optional visit deduplication.
   * @param {ChildrenSelector<T>} children - Select ordered child entries from (value, traversalContext).
   * @param {TraversalKeySelector<T>} keySelector - Select the output string identity from (value, traversalContext).
   * @param {TraversalOptions<T>} [options] - Traversal or output identity configuration.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @param {number} [options.maxDepth] - Inclusive maximum depth; defaults to Infinity.
   * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Skip repeated identities and their descendants across all roots.
   * @returns {QuerySequence<TraversalNode<T>>} Create a repeatable lazy breadth-first traversal with explicit output keys and optional visit deduplication.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[BFS](() => [], (_value, context) => JSON.stringify(context.path), { maxDepth: 2 });
   * ```
   */
  [BFS]<T>(this: Queryable<T>, children: ChildrenSelector<T>, keySelector: TraversalKeySelector<T>, options: TraversalOptions<T> = {}): QuerySequence<TraversalNode<T>> {
    return traverse(this, children, keySelector, options, true);
  },
  /**
   * @description Create a repeatable lazy preorder depth-first traversal without using the recursive call stack.
   * @param {ChildrenSelector<T>} children - Select ordered child entries from (value, traversalContext).
   * @param {TraversalKeySelector<T>} keySelector - Select the output string identity from (value, traversalContext).
   * @param {TraversalOptions<T>} [options] - Traversal or output identity configuration.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @param {number} [options.maxDepth] - Inclusive maximum depth; defaults to Infinity.
   * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Skip repeated identities and their descendants across all roots.
   * @returns {QuerySequence<TraversalNode<T>>} Create a repeatable lazy preorder depth-first traversal without using the recursive call stack.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DFS](() => [], (_value, context) => JSON.stringify(context.path), { maxDepth: 2 });
   * ```
   */
  [DFS]<T>(this: Queryable<T>, children: ChildrenSelector<T>, keySelector: TraversalKeySelector<T>, options: TraversalOptions<T> = {}): QuerySequence<TraversalNode<T>> {
    return traverse(this, children, keySelector, options, false);
  },
  /**
   * @description Buffer the inner input and project once per outer entry with all matching inner entries.
   * @param {Queryable<I> | QuerySequence<I>} inner - Inner keyed input buffered for matching against each outer entry.
   * @param {(value: T, key: string) => K} outerKey - Select join identity from an outer (value, originalKey).
   * @param {(value: I, key: string) => K} innerKey - Select join identity from an inner (value, originalKey).
   * @param {(value: T, matches: readonly JoinEntry<I>[], key: string) => U} project - Project the outer value, matching inner data, and original outer key.
   * @returns {Queryable<U>} Buffer the inner input and project once per outer entry with all matching inner entries.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_JOIN](createQueryable({ x: 1 }), value => value, value => value, (value, matches) => [value, matches.length]);
   * ```
   */
  [GROUP_JOIN]<T, I, K, U>(
    this: Queryable<T>, inner: Queryable<I> | QuerySequence<I>,
    outerKey: (value: T, key: string) => K, innerKey: (value: I, key: string) => K,
    project: (value: T, matches: readonly JoinEntry<I>[], key: string) => U,
  ): Queryable<U> {
    return fromEntries(groupJoinEntries(recordEntries(this), iterateEntries(inner), outerKey, innerKey, project));
  },
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
  [INNER_JOIN]<T, I, K, U>(
    this: Queryable<T>, inner: Queryable<I> | QuerySequence<I>,
    outerKey: (value: T, key: string) => K, innerKey: (value: I, key: string) => K,
    project: (value: T, match: JoinMatch<I>, key: string) => JoinEntry<U>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U> {
    const query = createQuerySequence(
      () => innerJoinEntries(recordEntries(this), iterateEntries(inner), outerKey, innerKey, project), options,
    );
    return new Sequence(Array.from(query[ITERATE]()), false);
  },
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
  [LEFT_JOIN]<T, I, K, U>(
    this: Queryable<T>, inner: Queryable<I> | QuerySequence<I>,
    outerKey: (value: T, key: string) => K, innerKey: (value: I, key: string) => K,
    project: (value: T, match: LeftJoinMatch<I>, key: string) => JoinEntry<U>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U> {
    const query = createQuerySequence(
      () => leftJoinEntries(recordEntries(this), iterateEntries(inner), outerKey, innerKey, project), options,
    );
    return new Sequence(Array.from(query[ITERATE]()), false);
  },
  /**
   * @description Keep the first left entry per selected identity absent from the buffered right side.
   * @param {QuerySequence<U>} right - Right input whose selected identities are buffered for comparison.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @returns {Queryable<T>} Keep the first left entry per selected identity absent from the buffered right side.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DIFFERENCE](createQuerySequence(() => [["x", 2]]), value => value, value => value);
   * ```
   */
  [DIFFERENCE]<T, U, K>(
    this: Queryable<T>, right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
  ): Queryable<T> {
    return fromEntries(membershipEntries(recordEntries(this), iterateEntries(right), leftSelector, rightSelector, false));
  },
  /**
   * @description Keep the first left entry per selected identity present in the buffered right side.
   * @param {QuerySequence<U>} right - Right input whose selected identities are buffered for comparison.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @returns {Queryable<T>} Keep the first left entry per selected identity present in the buffered right side.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[INTERSECTION](createQuerySequence(() => [["x", 2]]), value => value, value => value);
   * ```
   */
  [INTERSECTION]<T, U, K>(
    this: Queryable<T>, right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
  ): Queryable<T> {
    return fromEntries(membershipEntries(recordEntries(this), iterateEntries(right), leftSelector, rightSelector, true));
  },
  /**
   * @description Keep the first identity encountered left-to-right, applying the duplicate key policy to output keys.
   * @param {QuerySequence<U>} right - Right input visited after the left input; only the last duplicate-key policy requires full output buffering.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {Queryable<T | U>} Keep the first identity encountered left-to-right, applying the duplicate key policy to output keys.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[UNION](createQuerySequence(() => [["c", 3]]), value => value, value => value);
   * ```
   */
  [UNION]<T, U, K>(
    this: Queryable<T>, right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
    options?: QuerySequenceOptions,
  ): Queryable<T | U> {
    return fromEntries(iterateEntries(createQuerySequence(
      () => unionEntries(recordEntries(this), iterateEntries(right), leftSelector, rightSelector), options,
    )));
  },
  ...combinationMethods,
  [COMBINE]<U>(factory: EntrySourceFactory<U>, options?: QuerySequenceOptions): QuerySequence<U> {
    return new Sequence(Array.from(iterateEntries(createQuerySequence(factory, options))), false);
  },
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
  [CHUNK]<T>(this: Queryable<T>, size: number): QuerySequence<EntryBuffer<T>> {
    return new Sequence(recordEntries(this), false)[CHUNK](size);
  },
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
  [WINDOW]<T>(this: Queryable<T>, size: number, stride = 1, partial = false): QuerySequence<EntryBuffer<T>> {
    return new Sequence(recordEntries(this), false)[WINDOW](size, stride, partial);
  },
  /**
   * @description Emit overlapping complete pairs of original entries; fewer than two entries yield no pairs.
   * @returns {QuerySequence<EntryPair<T>>} Emit overlapping complete pairs of original entries; fewer than two entries yield no pairs.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PAIRWISE]();
   * ```
   */
  [PAIRWISE]<T>(this: Queryable<T>): QuerySequence<EntryPair<T>> {
    return new Sequence(recordEntries(this), false)[PAIRWISE]();
  },
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
  [SPLIT]<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): QuerySequence<EntryBuffer<T>> {
    return new Sequence(recordEntries(this), false)[SPLIT](predicate);
  },
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
  [PARTITION_BY]<T, K>(this: Queryable<T>, selector: (value: T, key: string) => K): QuerySequence<EntryBuffer<T>> {
    return new Sequence(recordEntries(this), false)[PARTITION_BY](selector);
  },
  /**
   * @description Stably sort by lexicographic rules, caching each selector once per entry per consumption.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {QuerySequence<T>} Stably sort by lexicographic rules, caching each selector once per entry per consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SORT_BY]({ select: value => value, direction: "desc" });
   * ```
   */
  [SORT_BY]<T>(this: Queryable<T>, ...rules: OrderRules<T>): QuerySequence<T> {
    return new Sequence(sortByEntries(recordEntries(this), rules), false);
  },
  /**
   * @description Keep at most k winners and emit them in stable sorted order; k must be a nonnegative safe integer.
   * @param {number} k - Maximum number of winners; a nonnegative safe integer.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {QuerySequence<T>} Keep at most k winners and emit them in stable sorted order; k must be a nonnegative safe integer.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TOP_K](2, { select: value => value });
   * ```
   */
  [TOP_K]<T>(this: Queryable<T>, k: number, ...rules: OrderRules<T>): QuerySequence<T> {
    validatePosition(k, false);
    return new Sequence(topEntries(recordEntries(this), k, rules), false);
  },
  /**
   * @description Keep the first entry for each value using SameValueZero equality and reference identity.
   * @returns {Queryable<T>} Keep the first entry for each value using SameValueZero equality and reference identity.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT]();
   * ```
   */
  [DISTINCT]<T>(this: Queryable<T>): Queryable<T> {
    return fromEntries(distinctEntries(recordEntries(this), identity));
  },
  /**
   * @description Keep the first entry per selected identity, passing original keys to the selector.
   * @param {(value: T, key: string) => K} select - Select identity from (value, originalKey).
   * @returns {Queryable<T>} Keep the first entry per selected identity, passing original keys to the selector.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_BY](value => value % 2);
   * ```
   */
  [DISTINCT_BY]<T, K>(this: Queryable<T>, select: (value: T, key: string) => K): Queryable<T> {
    return fromEntries(distinctEntries(recordEntries(this), select));
  },
  /**
   * @description Keep the first entry of each adjacent run of SameValueZero-equal values.
   * @returns {Queryable<T>} Keep the first entry of each adjacent run of SameValueZero-equal values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_UNTIL_CHANGED]();
   * ```
   */
  [DISTINCT_UNTIL_CHANGED]<T>(this: Queryable<T>): Queryable<T> {
    return fromEntries(distinctUntilChangedEntries(recordEntries(this), identity));
  },
  /**
   * @description Keep the first entry of each adjacent run of equal selected identities.
   * @param {(value: T, key: string) => K} select - Select identity from (value, originalKey).
   * @returns {Queryable<T>} Keep the first entry of each adjacent run of equal selected identities.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_UNTIL_CHANGED_BY](value => value % 2);
   * ```
   */
  [DISTINCT_UNTIL_CHANGED_BY]<T, K>(this: Queryable<T>, select: (value: T, key: string) => K): Queryable<T> {
    return fromEntries(distinctUntilChangedEntries(recordEntries(this), select));
  },
  /**
   * @description Eagerly snapshot groups in a Map using native key identity and encounter order.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Map<K, Queryable<T>>} Eagerly snapshot groups in a Map using native key identity and encounter order.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_BY_MAP](value => value % 2);
   * ```
   */
  [GROUP_BY_MAP]<T, K>(this: Queryable<T>, keyFn: (value: T, key: string) => K): Map<K, Queryable<T>> {
    const groups = new Map<K, Queryable<T>>();
    for (const [key, value] of recordEntries(this)) {
      const groupKey = keyFn(value, key);
      let group = groups.get(groupKey);
      if (group === undefined) {
        group = createQueryable<T>({});
        groups.set(groupKey, group);
      }
      group[key] = value;
    }
    return groups;
  },
  [ITERATE]<T>(this: Queryable<T>): Iterable<Entry<T>> {
    return recordEntries(this);
  },
  [WHERE]: where,
  [PARTITION]: partition,
  /**
   * @description Emit each running accumulator at its original key, creating a fresh seed for every consumption.
   * @param {(accumulator: A, value: T, key: string) => A} reducer - Fold (accumulator, value, originalKey) in query order.
   * @param {() => A} seed - Create a fresh initial accumulator for each consumption.
   * @returns {Queryable<A>} Emit each running accumulator at its original key, creating a fresh seed for every consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SCAN]((sum, value) => sum + value, () => 0);
   * ```
   */
  [SCAN]<T, A>(
    this: Queryable<T>, reducer: (accumulator: A, value: T, key: string) => A, seed: () => A,
  ): Queryable<A> {
    return fromEntries(scanEntries(recordEntries(this), reducer, seed));
  },
  /**
   * @description Observe each entry without changing its value or key, respecting eager or lazy evaluation.
   * @param {(value: T, key: string) => void} effect - Observe (value, originalKey) in query order; thrown values propagate.
   * @returns {Queryable<T>} Observe each entry without changing its value or key, respecting eager or lazy evaluation.
   * @example
   * ```ts
   * const seen: [string, number][] = [];
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAP]((value, key) => seen.push([key, value]));
   * ```
   */
  [TAP]<T>(this: Queryable<T>, effect: (value: T, key: string) => void): Queryable<T> {
    return fromEntries(tapEntries(recordEntries(this), effect));
  },
  /**
   * @description Stably order values with the comparator and return a sequence; lazy inputs defer sorting until consumption.
   * @param {(a: T, b: T) => number} compareFn - Compare (leftValue, rightValue); zero retains encounter order.
   * @returns {QuerySequence<T>} Stably order values with the comparator and return a sequence; lazy inputs defer sorting until consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SORT]((left, right) => right - left);
   * ```
   */
  [SORT]<T>(this: Queryable<T>, compareFn: (a: T, b: T) => number): QuerySequence<T> {
    return new Sequence(sortEntries(recordEntries(this), compareFn), false);
  },
  /**
   * @description Transform values with their original keys, retaining the receiver evaluation mode.
   * @param {(value: T, key: string) => U} fn - Transform (value, originalKey) into the output value.
   * @returns {Queryable<U>} Transform values with their original keys, retaining the receiver evaluation mode.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MAP]((value, key) => `${key}:${value}`);
   * ```
   */
  [MAP]<T, U>(this: Queryable<T>, fn: (value: T, key: string) => U): Queryable<U> {
    const result: Queryable<U> = Object.create(queryablePrototype);
    for (const key in this) {
      if (Object.hasOwn(this, key)) {
        result[key] = fn(this[key] as T, key);
      }
    }
    return result;
  },
  /**
   * @description Select existing original keys once in requested order; sequence inputs are buffered and records use native object ordering.
   * @param {string[]} keys - Original record keys requested in selection order; missing and repeated keys are ignored.
   * @returns {Queryable<T>} Select existing original keys once in requested order; sequence inputs are buffered and records use native object ordering.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PICK]("b", "a", "missing");
   * ```
   */
  [PICK]<T>(this: Queryable<T>, ...keys: string[]): Queryable<T> {
    const result: Queryable<T> = Object.create(queryablePrototype);
    for (const key of keys) {
      if (!Object.hasOwn(result, key) && Object.prototype.propertyIsEnumerable.call(this, key)) {
        result[key] = this[key] as T;
      }
    }
    return result;
  },
  /**
   * @description Apply slice(0, n) semantics, truncating fractions; finite negative bounds buffer the input.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Queryable<T>} Apply slice(0, n) semantics, truncating fractions; finite negative bounds buffer the input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LIMIT](1);
   * ```
   */
  [LIMIT]<T>(this: Queryable<T>, n: number): Queryable<T> {
    const count = Number.isNaN(n) ? 0 : Math.trunc(n);
    if (count < 0 && count !== -Infinity) {
      return fromEntries(limitEntries(recordEntries(this), n));
    }
    const result: Queryable<T> = Object.create(queryablePrototype);
    if (count === 0 || count === -Infinity) {
      return result;
    }
    let remaining = count;
    for (const key in this) {
      if (Object.hasOwn(this, key)) {
        result[key] = this[key] as T;
        if (--remaining === 0) {
          break;
        }
      }
    }
    return result;
  },
  /**
   * @description Skip a truncated nonnegative count; NaN and negative counts skip nothing.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Queryable<T>} Skip a truncated nonnegative count; NaN and negative counts skip nothing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SKIP](1);
   * ```
   */
  [SKIP]<T>(this: Queryable<T>, n: number): Queryable<T> {
    return fromEntries(skipEntries(recordEntries(this), n));
  },
  [TAKE_WHILE]: takeWhile,
  /**
   * @description Drop only the matching prefix and retain all entries after the first false predicate.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) only until the first false result; later entries are retained without further tests.
   * @returns {Queryable<T>} Drop only the matching prefix and retain all entries after the first false predicate.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DROP_WHILE](value => value < 2);
   * ```
   */
  [DROP_WHILE]<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T> {
    return fromEntries(dropWhileEntries(recordEntries(this), predicate));
  },
  /**
   * @description Retain the final normalized count of entries, buffering at most that many until exhaustion.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Queryable<T>} Retain the final normalized count of entries, buffering at most that many until exhaustion.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_LAST](2);
   * ```
   */
  [TAKE_LAST]<T>(this: Queryable<T>, n: number): Queryable<T> {
    return fromEntries(takeLastEntries(recordEntries(this), n));
  },
  /**
   * @description Exclude the final normalized count of entries using bounded lookahead.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {Queryable<T>} Exclude the final normalized count of entries using bounded lookahead.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DROP_LAST](1);
   * ```
   */
  [DROP_LAST]<T>(this: Queryable<T>, n: number): Queryable<T> {
    return fromEntries(dropLastEntries(recordEntries(this), n));
  },
  /**
   * @description Eagerly snapshot string-keyed groups with original entry keys; unencountered groups are absent.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Partial<Record<K, Queryable<T>>>} Eagerly snapshot string-keyed groups with original entry keys; unencountered groups are absent.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_BY](value => value > 1 ? "large" : "small");
   * ```
   */
  [GROUP_BY]<T, K extends string>(this: Queryable<T>, keyFn: (value: T, key: string) => K): Partial<Record<K, Queryable<T>>> {
    const groups: Partial<Record<K, Queryable<T>>> = Object.create(null);
    for (const [key, value] of recordEntries(this)) {
      const groupKey = keyFn(value, key);
      const group = groups[groupKey] ?? (groups[groupKey] = createQueryable<T>({}));
      group[key] = value;
    }
    return groups;
  },
  /**
   * @description Eagerly group by a string-valued discriminant, skipping missing and undefined properties.
   * @param {P} property - String-valued discriminant used to name groups.
   * @returns {PropertyGroups<T, P, "record">} Eagerly group by a string-valued discriminant, skipping missing and undefined properties.
   * @example
   * ```ts
   * const query = createQueryable({ a: { kind: "cat" }, b: { kind: "dog" } });
   * query[GROUP_BY_PROP]("kind");
   * ```
   */
  [GROUP_BY_PROP]<T, P extends StringProperty<T>>(this: Queryable<T>, property: P): PropertyGroups<T, P, "record"> {
    const groups: Partial<Record<string, Queryable<T>>> = Object.create(null);
    for (const [key, value] of recordEntries(this)) {
      const groupKey = propertyGroupKey(value, property);
      if (groupKey !== undefined) {
        const group = groups[groupKey] ?? (groups[groupKey] = createQueryable<T>({}));
        group[key] = value;
      }
    }
    // Each string key was read from this member's discriminant, once.
    return groups as PropertyGroups<T, P, "record">;
  },
  /**
   * @description Return a repeatable lazy view without memoization; each consumption reruns pending work.
   * @returns {QuerySequence<T>} Return a repeatable lazy view without memoization; each consumption reruns pending work.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LAZY]();
   * ```
   */
  [LAZY]<T>(this: Queryable<T>): QuerySequence<T> {
    return new Sequence(defer(recordEntries, this), true);
  },
};

// Both implementations use exactly the same terminal functions, not bound copies.
interface Sequence<T> extends Terminals<T>, Pick<Stateful<T, "sequence">, typeof EACH | typeof THROUGH> {
  /** Append keyed sources in order, applying the requested output key collision policy. */
  [CONCAT]: Operations<T, "sequence">[typeof CONCAT];
  /** Pair values by position until the shortest source ends, retaining the left key. */
  [ZIP]: Operations<T, "sequence">[typeof ZIP];
  /** Flatten explicitly keyed mapper results with the requested collision policy. */
  [FLAT_MAP]: Operations<T, "sequence">[typeof FLAT_MAP];
}
/**
 * @description Hold ordered entries with shared Symbol methods; eager chains snapshot derived entries while lazy chains reacquire pending work on consumption.
 * @example
 * ```ts
 * const ordered = createQueryable({ a: 1, b: 2 })[SORT]((a, b) => b - a);
 * ordered[VALUES](); // [2, 1]
 * ```
 */
class Sequence<T> implements QuerySequence<T> {
  /**
   * @description Store the entry source and evaluation mode shared by derived sequences.
   * @param {Iterable<Entry<T>>} source - Ordered entries; eager callers supply a materialized snapshot.
   * @param {boolean} lazy - Whether derived operations defer consumption.
   * @example
   * ```ts
   * const sequence = createQuerySequence(() => [["a", 1]]);
   * sequence[VALUES]();
   * ```
   */
  constructor(private readonly source: Iterable<Entry<T>>, private readonly lazy: boolean) {}

  /**
   * @description Buffer the inner input and project once per outer entry with all matching inner entries.
   * @param {Queryable<I> | QuerySequence<I>} inner - Inner keyed input buffered for matching against each outer entry.
   * @param {(value: T, key: string) => K} outerKey - Select join identity from an outer (value, originalKey).
   * @param {(value: I, key: string) => K} innerKey - Select join identity from an inner (value, originalKey).
   * @param {(value: T, matches: readonly JoinEntry<I>[], key: string) => U} project - Project the outer value, matching inner data, and original outer key.
   * @returns {QuerySequence<U>} Buffer the inner input and project once per outer entry with all matching inner entries.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_JOIN](createQueryable({ x: 1 }), value => value, value => value, (value, matches) => [value, matches.length]);
   * ```
   */
  [GROUP_JOIN]<I, K, U>(
    this: Sequence<T>, inner: Queryable<I> | QuerySequence<I>,
    outerKey: (value: T, key: string) => K, innerKey: (value: I, key: string) => K,
    project: (value: T, matches: readonly JoinEntry<I>[], key: string) => U,
  ): QuerySequence<U> {
    return this.next(defer(groupJoinEntries, this.source, iterateEntries(inner), outerKey, innerKey, project));
  }
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
    this: Sequence<T>, inner: Queryable<I> | QuerySequence<I>,
    outerKey: (value: T, key: string) => K, innerKey: (value: I, key: string) => K,
    project: (value: T, match: JoinMatch<I>, key: string) => JoinEntry<U>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U> {
    const query = createQuerySequence(
      () => innerJoinEntries(this.source, iterateEntries(inner), outerKey, innerKey, project), options,
    );
    return this.next(query[ITERATE]());
  }
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
    this: Sequence<T>, inner: Queryable<I> | QuerySequence<I>,
    outerKey: (value: T, key: string) => K, innerKey: (value: I, key: string) => K,
    project: (value: T, match: LeftJoinMatch<I>, key: string) => JoinEntry<U>,
    options?: QuerySequenceOptions,
  ): QuerySequence<U> {
    const query = createQuerySequence(
      () => leftJoinEntries(this.source, iterateEntries(inner), outerKey, innerKey, project), options,
    );
    return this.next(query[ITERATE]());
  }
  [ITERATE](): Iterable<Entry<T>> {
    return this.source;
  }

  [COMBINE]<U>(factory: EntrySourceFactory<U>, options?: QuerySequenceOptions): QuerySequence<U> {
    return this.next(iterateEntries(createQuerySequence(factory, options)));
  }

  private next<U>(source: Iterable<Entry<U>>): Sequence<U> {
    return new Sequence(this.lazy ? source : Array.from(source), this.lazy);
  }

  /**
   * @description Create a repeatable lazy breadth-first traversal with explicit output keys and optional visit deduplication.
   * @param {ChildrenSelector<T>} children - Select ordered child entries from (value, traversalContext).
   * @param {TraversalKeySelector<T>} keySelector - Select the output string identity from (value, traversalContext).
   * @param {TraversalOptions<T>} [options] - Traversal or output identity configuration.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @param {number} [options.maxDepth] - Inclusive maximum depth; defaults to Infinity.
   * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Skip repeated identities and their descendants across all roots.
   * @returns {QuerySequence<TraversalNode<T>>} Create a repeatable lazy breadth-first traversal with explicit output keys and optional visit deduplication.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[BFS](() => [], (_value, context) => JSON.stringify(context.path), { maxDepth: 2 });
   * ```
   */
  [BFS](this: QuerySequence<T>, children: ChildrenSelector<T>, keySelector: TraversalKeySelector<T>, options: TraversalOptions<T> = {}): QuerySequence<TraversalNode<T>> {
    return traverse(this, children, keySelector, options, true);
  }
  /**
   * @description Create a repeatable lazy preorder depth-first traversal without using the recursive call stack.
   * @param {ChildrenSelector<T>} children - Select ordered child entries from (value, traversalContext).
   * @param {TraversalKeySelector<T>} keySelector - Select the output string identity from (value, traversalContext).
   * @param {TraversalOptions<T>} [options] - Traversal or output identity configuration.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @param {number} [options.maxDepth] - Inclusive maximum depth; defaults to Infinity.
   * @param {(value: T, context: TraversalContext<T>) => unknown} [options.visitIdentity] - Skip repeated identities and their descendants across all roots.
   * @returns {QuerySequence<TraversalNode<T>>} Create a repeatable lazy preorder depth-first traversal without using the recursive call stack.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DFS](() => [], (_value, context) => JSON.stringify(context.path), { maxDepth: 2 });
   * ```
   */
  [DFS](this: QuerySequence<T>, children: ChildrenSelector<T>, keySelector: TraversalKeySelector<T>, options: TraversalOptions<T> = {}): QuerySequence<TraversalNode<T>> {
    return traverse(this, children, keySelector, options, false);
  }
  /**
   * @description Keep the first left entry per selected identity absent from the buffered right side.
   * @param {QuerySequence<U>} right - Right input whose selected identities are buffered for comparison.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @returns {QuerySequence<T>} Keep the first left entry per selected identity absent from the buffered right side.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DIFFERENCE](createQuerySequence(() => [["x", 2]]), value => value, value => value);
   * ```
   */
  [DIFFERENCE]<U, K>(
    right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
  ): QuerySequence<T> {
    return this.next(defer(membershipEntries, this.source, iterateEntries(right), leftSelector, rightSelector, false));
  }
  /**
   * @description Keep the first left entry per selected identity present in the buffered right side.
   * @param {QuerySequence<U>} right - Right input whose selected identities are buffered for comparison.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @returns {QuerySequence<T>} Keep the first left entry per selected identity present in the buffered right side.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[INTERSECTION](createQuerySequence(() => [["x", 2]]), value => value, value => value);
   * ```
   */
  [INTERSECTION]<U, K>(
    right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
  ): QuerySequence<T> {
    return this.next(defer(membershipEntries, this.source, iterateEntries(right), leftSelector, rightSelector, true));
  }
  /**
   * @description Keep the first identity encountered left-to-right, applying the duplicate key policy to output keys.
   * @param {QuerySequence<U>} right - Right input visited after the left input; only the last duplicate-key policy requires full output buffering.
   * @param {(value: T, key: string) => K} leftSelector - Select identity from a left (value, originalKey).
   * @param {(value: U, key: string) => K} rightSelector - Select identity from a right (value, originalKey).
   * @param {QuerySequenceOptions} [options] - Output key collision settings.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Output key policy: error (default), first, or last.
   * @returns {QuerySequence<T | U>} Keep the first identity encountered left-to-right, applying the duplicate key policy to output keys.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[UNION](createQuerySequence(() => [["c", 3]]), value => value, value => value);
   * ```
   */
  [UNION]<U, K>(
    right: QuerySequence<U>,
    leftSelector: (value: T, key: string) => K, rightSelector: (value: U, key: string) => K,
    options?: QuerySequenceOptions,
  ): QuerySequence<T | U> {
    return this[COMBINE]<T | U>(
      () => unionEntries(this.source, iterateEntries(right), leftSelector, rightSelector), options,
    );
  }

  private buffers<U>(source: Iterable<Entry<U>>, copy: (value: U) => U): Sequence<U> {
    return new Sequence(this.lazy ? source : defer(copyBuffers, Array.from(source), copy), this.lazy);
  }

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
  [CHUNK](size: number): QuerySequence<EntryBuffer<T>> {
    validateWindowSize(size, "size");
    return this.buffers(defer(windowEntries, this.source, size, size, true), copyBuffer<T>);
  }
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
  [WINDOW](size: number, stride = 1, partial = false): QuerySequence<EntryBuffer<T>> {
    validateWindowSize(size, "size");
    validateWindowSize(stride, "stride");
    return this.buffers(defer(windowEntries, this.source, size, stride, partial), copyBuffer<T>);
  }
  /**
   * @description Emit overlapping complete pairs of original entries; fewer than two entries yield no pairs.
   * @returns {QuerySequence<EntryPair<T>>} Emit overlapping complete pairs of original entries; fewer than two entries yield no pairs.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PAIRWISE]();
   * ```
   */
  [PAIRWISE](): QuerySequence<EntryPair<T>> {
    return this.buffers(defer(pairEntries, this.source), copyPair<T>);
  }
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
  [SPLIT](predicate: (value: T, key: string) => boolean): QuerySequence<EntryBuffer<T>> {
    return this.buffers(defer(splitEntries, this.source, predicate), copyBuffer<T>);
  }
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
  [PARTITION_BY]<K>(selector: (value: T, key: string) => K): QuerySequence<EntryBuffer<T>> {
    return this.buffers(defer(adjacentGroupEntries, this.source, selector), copyBuffer<T>);
  }

  /**
   * @description Stably sort by lexicographic rules, caching each selector once per entry per consumption.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {QuerySequence<T>} Stably sort by lexicographic rules, caching each selector once per entry per consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SORT_BY]({ select: value => value, direction: "desc" });
   * ```
   */
  [SORT_BY](...rules: OrderRules<T>): QuerySequence<T> {
    return this.next(defer(sortByEntries, this.source, rules));
  }
  /**
   * @description Keep at most k winners and emit them in stable sorted order; k must be a nonnegative safe integer.
   * @param {number} k - Maximum number of winners; a nonnegative safe integer.
   * @param {OrderRules<T>} rules - Nonempty ordering rules applied lexicographically; selectors receive (value, originalKey).
   * @returns {QuerySequence<T>} Keep at most k winners and emit them in stable sorted order; k must be a nonnegative safe integer.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TOP_K](2, { select: value => value });
   * ```
   */
  [TOP_K](k: number, ...rules: OrderRules<T>): QuerySequence<T> {
    validatePosition(k, false);
    return this.next(defer(topEntries, this.source, k, rules));
  }

  /**
   * @description Keep the first entry for each value using SameValueZero equality and reference identity.
   * @returns {QuerySequence<T>} Keep the first entry for each value using SameValueZero equality and reference identity.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT]();
   * ```
   */
  [DISTINCT](): QuerySequence<T> {
    return this.next(defer(distinctEntries, this.source, identity<T>));
  }
  /**
   * @description Keep the first entry per selected identity, passing original keys to the selector.
   * @param {(value: T, key: string) => K} select - Select identity from (value, originalKey).
   * @returns {QuerySequence<T>} Keep the first entry per selected identity, passing original keys to the selector.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_BY](value => value % 2);
   * ```
   */
  [DISTINCT_BY]<K>(select: (value: T, key: string) => K): QuerySequence<T> {
    return this.next(defer(distinctEntries, this.source, select));
  }
  /**
   * @description Keep the first entry of each adjacent run of SameValueZero-equal values.
   * @returns {QuerySequence<T>} Keep the first entry of each adjacent run of SameValueZero-equal values.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_UNTIL_CHANGED]();
   * ```
   */
  [DISTINCT_UNTIL_CHANGED](): QuerySequence<T> {
    return this.next(defer(distinctUntilChangedEntries, this.source, identity<T>));
  }
  /**
   * @description Keep the first entry of each adjacent run of equal selected identities.
   * @param {(value: T, key: string) => K} select - Select identity from (value, originalKey).
   * @returns {QuerySequence<T>} Keep the first entry of each adjacent run of equal selected identities.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DISTINCT_UNTIL_CHANGED_BY](value => value % 2);
   * ```
   */
  [DISTINCT_UNTIL_CHANGED_BY]<K>(select: (value: T, key: string) => K): QuerySequence<T> {
    return this.next(defer(distinctUntilChangedEntries, this.source, select));
  }

  /**
   * @description Eagerly snapshot groups in a Map using native key identity and encounter order.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Map<K, QuerySequence<T>>} Eagerly snapshot groups in a Map using native key identity and encounter order.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_BY_MAP](value => value % 2);
   * ```
   */
  [GROUP_BY_MAP]<K>(keyFn: (value: T, key: string) => K): Map<K, QuerySequence<T>> {
    const entries = new Map<K, Entry<T>[]>();
    for (const entry of this.source) {
      const groupKey = keyFn(entry[1], entry[0]);
      const group = entries.get(groupKey);
      if (group === undefined) {
        entries.set(groupKey, [entry]);
      } else {
        group.push(entry);
      }
    }
    const groups = new Map<K, QuerySequence<T>>();
    for (const [key, group] of entries) {
      groups.set(key, new Sequence(group, false));
    }
    return groups;
  }

  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {BooleanConstructor} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<Truthy<T>>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE](predicate: BooleanConstructor): QuerySequence<Truthy<T>>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {(value: T, key: string) => false} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<never>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE](predicate: (value: T, key: string) => false): QuerySequence<never>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {(value: T, key: string) => value is S} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<S>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE]<S extends T>(predicate: (value: T, key: string) => value is S): QuerySequence<S>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<T>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE](predicate: (value: T, key: string) => boolean): QuerySequence<T>;
  /**
   * @description Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {Source<T>} Keep matching entries and original keys; type guards and Boolean preserve narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[WHERE](value => value > 1);
   * ```
   */
  [WHERE](predicate: (value: T, key: string) => boolean): Source<T> {
    return this.next(this.lazy ? fuseWhere(this.source, predicate) : defer(filterEntries, this.source, predicate));
  }
  /**
   * @description Transform values with their original keys, retaining the receiver evaluation mode.
   * @param {(value: T, key: string) => U} fn - Transform (value, originalKey) into the output value.
   * @returns {QuerySequence<U>} Transform values with their original keys, retaining the receiver evaluation mode.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[MAP]((value, key) => `${key}:${value}`);
   * ```
   */
  [MAP]<U>(fn: (value: T, key: string) => U): QuerySequence<U> {
    return this.next(this.lazy ? fuseMap(this.source, fn) : defer(mapEntries, this.source, fn));
  }
  /**
   * @description Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * @param {(value: T, key: string) => value is S} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {[QuerySequence<S>, QuerySequence<T>]} Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * - 0 `QuerySequence<S>` - Matching entries with narrowed values when using a type guard.
   * - 1 `QuerySequence<T>` - Nonmatching entries retaining the original value type.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PARTITION](value => value > 1);
   * ```
   */
  [PARTITION]<S extends T>(predicate: (value: T, key: string) => value is S): [QuerySequence<S>, QuerySequence<T>];
  /**
   * @description Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {[QuerySequence<T>, QuerySequence<T>]} Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * - 0 `QuerySequence<T>` - Matching entries with narrowed values when using a type guard.
   * - 1 `QuerySequence<T>` - Nonmatching entries retaining the original value type.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PARTITION](value => value > 1);
   * ```
   */
  [PARTITION](predicate: (value: T, key: string) => boolean): [QuerySequence<T>, QuerySequence<T>];
  /**
   * @description Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {[QuerySequence<T>, QuerySequence<T>]} Eagerly split into matching and nonmatching snapshots, evaluating the predicate once per entry.
   * - 0 `QuerySequence<T>` - Matching entries with narrowed values when using a type guard.
   * - 1 `QuerySequence<T>` - Nonmatching entries retaining the original value type.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PARTITION](value => value > 1);
   * ```
   */
  [PARTITION](predicate: (value: T, key: string) => boolean): [QuerySequence<T>, QuerySequence<T>] {
    const [matching, nonmatching] = partitionEntries(this.source, predicate);
    return [new Sequence(matching, false), new Sequence(nonmatching, false)];
  }
  /**
   * @description Emit each running accumulator at its original key, creating a fresh seed for every consumption.
   * @param {(accumulator: A, value: T, key: string) => A} reducer - Fold (accumulator, value, originalKey) in query order.
   * @param {() => A} seed - Create a fresh initial accumulator for each consumption.
   * @returns {QuerySequence<A>} Emit each running accumulator at its original key, creating a fresh seed for every consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SCAN]((sum, value) => sum + value, () => 0);
   * ```
   */
  [SCAN]<A>(reducer: (accumulator: A, value: T, key: string) => A, seed: () => A): QuerySequence<A> {
    return this.next(defer(scanEntries, this.source, reducer, seed));
  }
  /**
   * @description Observe each entry without changing its value or key, respecting eager or lazy evaluation.
   * @param {(value: T, key: string) => void} effect - Observe (value, originalKey) in query order; thrown values propagate.
   * @returns {QuerySequence<T>} Observe each entry without changing its value or key, respecting eager or lazy evaluation.
   * @example
   * ```ts
   * const seen: [string, number][] = [];
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAP]((value, key) => seen.push([key, value]));
   * ```
   */
  [TAP](effect: (value: T, key: string) => void): QuerySequence<T> {
    return this.next(defer(tapEntries, this.source, effect));
  }
  /**
   * @description Stably order values with the comparator and return a sequence; lazy inputs defer sorting until consumption.
   * @param {(a: T, b: T) => number} compareFn - Compare (leftValue, rightValue); zero retains encounter order.
   * @returns {QuerySequence<T>} Stably order values with the comparator and return a sequence; lazy inputs defer sorting until consumption.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SORT]((left, right) => right - left);
   * ```
   */
  [SORT](compareFn: (a: T, b: T) => number): QuerySequence<T> {
    return new Sequence(
      this.lazy ? defer(sortEntries, this.source, compareFn) : sortEntries(this.source, compareFn),
      this.lazy,
    );
  }
  /**
   * @description Select existing original keys once in requested order; sequence inputs are buffered and records use native object ordering.
   * @param {string[]} keys - Original record keys requested in selection order; missing and repeated keys are ignored.
   * @returns {QuerySequence<T>} Select existing original keys once in requested order; sequence inputs are buffered and records use native object ordering.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[PICK]("b", "a", "missing");
   * ```
   */
  [PICK](...keys: string[]): QuerySequence<T> {
    return this.next(defer(pickEntries, this.source, keys));
  }
  /**
   * @description Apply slice(0, n) semantics, truncating fractions; finite negative bounds buffer the input.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {QuerySequence<T>} Apply slice(0, n) semantics, truncating fractions; finite negative bounds buffer the input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LIMIT](1);
   * ```
   */
  [LIMIT](n: number): QuerySequence<T> {
    return this.next(defer(limitEntries, this.source, n));
  }
  /**
   * @description Skip a truncated nonnegative count; NaN and negative counts skip nothing.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {QuerySequence<T>} Skip a truncated nonnegative count; NaN and negative counts skip nothing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SKIP](1);
   * ```
   */
  [SKIP](n: number): QuerySequence<T> {
    return this.next(defer(skipEntries, this.source, n));
  }
  /**
   * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @param {(value: T, key: string) => value is S} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<S>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_WHILE](value => value < 2);
   * ```
   */
  [TAKE_WHILE]<S extends T>(predicate: (value: T, key: string) => value is S): QuerySequence<S>;
  /**
   * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<T>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_WHILE](value => value < 2);
   * ```
   */
  [TAKE_WHILE](predicate: (value: T, key: string) => boolean): QuerySequence<T>;
  /**
   * @description Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {QuerySequence<T>} Keep the matching prefix and stop at the first false predicate, preserving type guard narrowing.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_WHILE](value => value < 2);
   * ```
   */
  [TAKE_WHILE](predicate: (value: T, key: string) => boolean): QuerySequence<T> {
    return this.next(defer(takeWhileEntries, this.source, predicate));
  }
  /**
   * @description Drop only the matching prefix and retain all entries after the first false predicate.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) only until the first false result; later entries are retained without further tests.
   * @returns {QuerySequence<T>} Drop only the matching prefix and retain all entries after the first false predicate.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DROP_WHILE](value => value < 2);
   * ```
   */
  [DROP_WHILE](predicate: (value: T, key: string) => boolean): QuerySequence<T> {
    return this.next(defer(dropWhileEntries, this.source, predicate));
  }
  /**
   * @description Retain the final normalized count of entries, buffering at most that many until exhaustion.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {QuerySequence<T>} Retain the final normalized count of entries, buffering at most that many until exhaustion.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[TAKE_LAST](2);
   * ```
   */
  [TAKE_LAST](n: number): QuerySequence<T> {
    return this.next(defer(takeLastEntries, this.source, n));
  }
  /**
   * @description Exclude the final normalized count of entries using bounded lookahead.
   * @param {number} n - Entry count, normalized according to this operation.
   * @returns {QuerySequence<T>} Exclude the final normalized count of entries using bounded lookahead.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[DROP_LAST](1);
   * ```
   */
  [DROP_LAST](n: number): QuerySequence<T> {
    return this.next(defer(dropLastEntries, this.source, n));
  }
  /**
   * @description Eagerly snapshot string-keyed groups with original entry keys; unencountered groups are absent.
   * @param {(value: T, key: string) => K} keyFn - Select a group identity from (value, originalKey).
   * @returns {Partial<Record<K, QuerySequence<T>>>} Eagerly snapshot string-keyed groups with original entry keys; unencountered groups are absent.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[GROUP_BY](value => value > 1 ? "large" : "small");
   * ```
   */
  [GROUP_BY]<K extends string>(keyFn: (value: T, key: string) => K): Partial<Record<K, QuerySequence<T>>> {
    const entries: Partial<Record<K, Entry<T>[]>> = Object.create(null);
    for (const entry of this.source) {
      const key = keyFn(entry[1], entry[0]);
      (entries[key] ??= []).push(entry);
    }
    const groups: Partial<Record<K, QuerySequence<T>>> = Object.create(null);
    for (const key in entries) {
      const group = entries[key];
      if (group) {
        groups[key] = new Sequence(group, false);
      }
    }
    return groups;
  }
  /**
   * @description Eagerly group by a string-valued discriminant, skipping missing and undefined properties.
   * @param {P} property - String-valued discriminant used to name groups.
   * @returns {PropertyGroups<T, P, "sequence">} Eagerly group by a string-valued discriminant, skipping missing and undefined properties.
   * @example
   * ```ts
   * const query = createQueryable({ a: { kind: "cat" }, b: { kind: "dog" } });
   * query[GROUP_BY_PROP]("kind");
   * ```
   */
  [GROUP_BY_PROP]<P extends StringProperty<T>>(property: P): PropertyGroups<T, P, "sequence"> {
    const entries: Partial<Record<string, Entry<T>[]>> = Object.create(null);
    for (const entry of this.source) {
      const groupKey = propertyGroupKey(entry[1], property);
      if (groupKey !== undefined) {
        (entries[groupKey] ??= []).push(entry);
      }
    }
    const groups: Partial<Record<string, QuerySequence<T>>> = Object.create(null);
    for (const key in entries) {
      const group = entries[key];
      if (group) {
        groups[key] = new Sequence(group, false);
      }
    }
    return groups as PropertyGroups<T, P, "sequence">;
  }
  /**
   * @description Return a repeatable lazy view without memoization; each consumption reruns pending work.
   * @returns {QuerySequence<T>} Return a repeatable lazy view without memoization; each consumption reruns pending work.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LAZY]();
   * ```
   */
  [LAZY](): QuerySequence<T> {
    return new Sequence(this.source, true);
  }
}

Object.assign(Sequence.prototype, terminals, combinationMethods);
Object.freeze(Sequence.prototype);
// A null root makes "__proto__", "constructor", and "toString" ordinary data keys.
Object.setPrototypeOf(queryablePrototype, null);
Object.freeze(queryablePrototype);

/**
 * @description Shallow-copy own enumerable string-keyed data into an eager queryable record. Symbol, inherited, and non-enumerable keys are excluded; nested values remain shared.
 * @param {Readonly<Record<string, T>>} obj - Record whose own enumerable data is copied.
 * @returns {Queryable<T>} Mutable shallow snapshot with shared Symbol methods and native object key ordering.
 * @example
 * ```ts
 * const users = createQueryable({ alice: { age: 25 }, bob: { age: 18 } });
 * users[WHERE](user => user.age >= 20)[VALUES]();
 * ```
 */
export function createQueryable<T>(obj: Readonly<Record<string, T>>): Queryable<T> {
  const instance: Queryable<T> = Object.create(queryablePrototype);
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      instance[key] = obj[key] as T;
    }
  }
  return instance;
}

/** Duplicate-key handling for factory-backed sequences. */
export interface QuerySequenceOptions {
  /** Repeated output key handling: error by default, first occurrence, or buffered last occurrence. */
  readonly duplicateKeys?: KeyCollisionPolicy;
}

/**
 * @description Defer a repeatable entry factory until consumption without memoization. Each consumption reacquires the factory; supply a fresh iterator or repeatable iterable.
 * @param {EntrySourceFactory<T>} factory - Create explicitly keyed entries on each consumption.
 * @param {QuerySequenceOptions} [options] - Output key collision configuration.
 * @param {KeyCollisionPolicy} [options.duplicateKeys] - Use error (default), first, or last for repeated output keys. The last policy buffers the source.
 * @returns {QuerySequence<T>} Lazy repeatable sequence preserving entry order under the selected key policy.
 * @example
 * ```ts
 * const query = createQuerySequence(() => [["a", 1], ["b", 2]]);
 * query[VALUES](); // [1, 2]
 * ```
 */
export function createQuerySequence<T>(
  factory: EntrySourceFactory<T>,
  options: QuerySequenceOptions = {},
): QuerySequence<T> {
  const policy = options.duplicateKeys ?? "error";
  switch (policy) {
    case "error":
    case "first":
    case "last":
      return new Sequence(defer(checkedEntries, () => managedEntries(factory), policy), true);
    default: {
      const unsupported: never = policy;
      throw new TypeError(`Unsupported duplicate key policy: ${String(unsupported)}`);
    }
  }
}

function traverse<T>(
  source: Queryable<T> | QuerySequence<T>,
  children: ChildrenSelector<T>,
  keySelector: TraversalKeySelector<T>,
  options: TraversalOptions<T>,
  breadthFirst: boolean,
): QuerySequence<TraversalNode<T>> {
  const maxDepth = traversalDepth(options);
  return createQuerySequence(
    () => traversalEntries(iterateEntries(source), children, keySelector, options, maxDepth, breadthFirst),
    options,
  );
}

function* entryView<T>(query: Source<T>): Generator<[string, T]> {
  for (const [key, value] of query[ITERATE]()) {
    yield [key, value];
  }
}

function* valueView<T>(query: Source<T>): Generator<T> {
  for (const [, value] of query[ITERATE]()) {
    yield value;
  }
}

/**
 * @description Create a repeatable entry view without first materializing an array. Each yielded tuple is fresh; nested values remain shared references.
 * @param {Queryable<T> | QuerySequence<T>} query - Query consumed anew on each iteration.
 * @returns {Iterable<[string, T]>} Repeatable view yielding original keys and values in query order.
 * @example
 * ```ts
 * Array.from(iterateEntries(createQueryable({ a: 1 }))); // [["a", 1]]
 * ```
 */
export function iterateEntries<T>(query: Queryable<T> | QuerySequence<T>): Iterable<[string, T]> {
  return defer(entryView, query);
}

/**
 * @description Create a repeatable value view without first materializing an array; iteration executes pending lazy work anew.
 * @param {Queryable<T> | QuerySequence<T>} query - Query consumed anew on each iteration.
 * @returns {Iterable<T>} Repeatable view of shallow values in query order.
 * @example
 * ```ts
 * Array.from(iterateValues(createQueryable({ a: 1 }))); // [1]
 * ```
 */
export function iterateValues<T>(query: Queryable<T> | QuerySequence<T>): Iterable<T> {
  return defer(valueView, query);
}
