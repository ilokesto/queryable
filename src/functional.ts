import {
  COUNT, ENTRIES, FIND, FIRST, LAZY, LIMIT, MAP, PICK, REDUCE,
  SOME, SORT, TO_OBJECT, VALUES, WHERE,
} from "./core-symbols.js";
import type { Queryable, QuerySequence, Truthy } from "./index.js";

type Mapped<Q, U> = Q extends Queryable<unknown> ? Queryable<U> : QuerySequence<U>;
type Value<Q> = Q extends QuerySequence<infer T> ? T : never;

interface Transform<T, U> {
  <Q extends QuerySequence<T>>(query: Q): Mapped<Q, U>;
}

/**
 * @description Builds a data-last filter preserving original keys and record or sequence mode. Boolean and type-guard predicates narrow the resulting values.
 * @param {(value: T, key: string) => boolean} predicate - Test called with each value and its original key; exceptions propagate unchanged.
 * @returns {Transform<T, T>} Unary filter stage; eager inputs filter immediately and lazy inputs defer work until consumption.
 * @example
 * pipe(createQueryable({ a: 1, b: 2 }), where((value: number) => value > 1), values);
 */
export function where(predicate: BooleanConstructor): <Q extends QuerySequence<unknown>>(query: Q) => Mapped<Q, Truthy<Value<Q>>>;
export function where<T>(predicate: (value: T, key: string) => false): Transform<T, never>;
export function where<T, S extends T>(predicate: (value: T, key: string) => value is S): Transform<T, S>;
export function where<T>(predicate: (value: T, key: string) => boolean): Transform<T, T>;
export function where<T>(predicate: (value: T, key: string) => boolean): Transform<T, T> {
  function apply<Q extends QuerySequence<T>>(query: Q): Mapped<Q, T>;
  function apply(query: QuerySequence<T>): QuerySequence<T> {
    return query[WHERE](predicate);
  }
  return apply;
}

/**
 * @description Builds a data-last mapping stage preserving original keys and query mode.
 * @param {(value: T, key: string) => U} fn - Mapper receiving each value and original key in query order.
 * @returns {Transform<T, U>} Unary mapping stage; lazy inputs defer the mapper until consumption.
 * @example
 * pipe(createQueryable({ a: 2 }), map((value: number) => value * 3), values);
 */
export function map<T, U>(fn: (value: T, key: string) => U): Transform<T, U> {
  function apply<Q extends QuerySequence<T>>(query: Q): Mapped<Q, U>;
  function apply(query: QuerySequence<T>): QuerySequence<U> {
    return query[MAP](fn);
  }
  return apply;
}

/**
 * @description Builds a data-last slice stage. Positive counts retain a prefix; finite negative counts omit that many trailing entries and require buffering.
 * @param {number} n - Slice end, interpreted by the core LIMIT operator.
 * @returns {(query: Q) => Mapped<Q, Value<Q>>} Unary limit stage preserving keys and query mode.
 * @example
 * pipe(createQueryable({ a: 1, b: 2 }), limit(1), values);
 */
export function limit(n: number) {
  function apply<Q extends QuerySequence<unknown>>(query: Q): Mapped<Q, Value<Q>>;
  function apply<T>(query: QuerySequence<T>): QuerySequence<T> {
    return query[LIMIT](n);
  }
  return apply;
}

/**
 * @description Builds a data-last key selection stage, ignoring duplicate and absent keys while retaining stored undefined values. It selects entries, not value fields.
 * @param {string[]} keys - Requested original record keys; sequence selection buffers to preserve selection semantics.
 * @returns {(query: Q) => Mapped<Q, Value<Q>>} Unary selection stage preserving query mode.
 * @example
 * pipe(createQueryable({ a: 1, b: 2 }), pick("b"), values);
 */
export function pick(...keys: string[]) {
  function apply<Q extends QuerySequence<unknown>>(query: Q): Mapped<Q, Value<Q>>;
  function apply<T>(query: QuerySequence<T>): QuerySequence<T> {
    return query[PICK](...keys);
  }
  return apply;
}

/**
 * @description Builds a data-last stable sort stage that changes a record into a sequence so comparator order is retained.
 * @param {(a: T, b: T) => number} compare - Synchronous value comparator; zero preserves the original order of ties.
 * @returns {(query: QuerySequence<T>) => QuerySequence<T>} Unary sorting stage; sorting buffers its input.
 * @example
 * pipe(createQueryable({ a: 2, b: 1 }), sort((a: number, b: number) => a - b), values);
 */
export function sort<T>(compare: (a: T, b: T) => number) {
  return (query: QuerySequence<T>): QuerySequence<T> => query[SORT](compare);
}

/**
 * @description Creates a live repeatable lazy view without memoization. Each terminal consumption re-executes pending work.
 * @param {QuerySequence<T>} query - Record or sequence to view lazily.
 * @returns {QuerySequence<T>} Lazy query sharing its source rather than a materialized snapshot.
 * @example
 * pipe(createQueryable({ a: 1 }), lazy, map((value: number) => value + 1), values);
 */
export function lazy<T>(query: QuerySequence<T>): QuerySequence<T> {
  return query[LAZY]();
}

/**
 * @description Consumes a record or sequence into a fresh value array in query order.
 * @param {QuerySequence<T>} query - Query whose pending work will execute.
 * @returns {T[]} Values in query order, or an empty array for an empty source.
 * @example
 * values(createQueryable({ a: 1 })); // [1]
 */
export function values<T>(query: QuerySequence<T>): T[] {
  return query[VALUES]();
}

/**
 * @description Consumes a query into a fresh array of fresh key/value tuples.
 * @param {QuerySequence<T>} query - Query whose pending work will execute.
 * @returns {[string, T][]} Original keys paired with values in query order.
 * @example
 * entries(createQueryable({ a: 1 })); // [["a", 1]]
 */
export function entries<T>(query: QuerySequence<T>): [string, T][] {
  return query[ENTRIES]();
}

/**
 * @description Consumes a query into a fresh shallow ordinary object, safely retaining special keys as own data properties.
 * @param {QuerySequence<T>} query - Query to materialize; integer-like keys follow native object ordering.
 * @returns {Record<string, T>} Original keys mapped to their values, or an empty object.
 * @example
 * toObject(createQueryable({ a: 1 })); // { a: 1 }
 */
export function toObject<T>(query: QuerySequence<T>): Record<string, T> {
  return query[TO_OBJECT]();
}

/**
 * @description Counts entries, consuming pending lazy work without inspecting value truthiness.
 * @param {QuerySequence<T>} query - Query to count.
 * @returns {number} Number of entries, including entries storing undefined; zero for an empty source.
 * @example
 * count(createQueryable({ a: undefined })); // 1
 */
export function count<T>(query: QuerySequence<T>): number {
  return query[COUNT]();
}

/**
 * @description Reads the first value and stops consumption immediately afterward.
 * @param {QuerySequence<T>} query - Query to inspect in query order.
 * @returns {T | undefined} First stored value, or undefined for an empty source.
 * @example
 * first(createQueryable({ a: 2, b: 1 })); // 2
 */
export function first<T>(query: QuerySequence<T>): T | undefined {
  return query[FIRST]();
}

/**
 * @description Builds a data-last terminal that stops at the first matching value. Boolean and type-guard predicates preserve narrowing.
 * @param {(value: T, key: string) => boolean} predicate - Test receiving each value and original key until a match is found.
 * @returns {(query: QuerySequence<T>) => T | undefined} Unary terminal returning the matching value, or undefined when no entry matches.
 * @example
 * pipe(createQueryable({ a: 1, b: 2 }), find((value: number) => value > 1)); // 2
 */
export function find(predicate: BooleanConstructor): <T>(query: QuerySequence<T>) => Truthy<T> | undefined;
export function find<T>(predicate: (value: T, key: string) => false): (query: QuerySequence<T>) => undefined;
export function find<T, S extends T>(predicate: (value: T, key: string) => value is S): (query: QuerySequence<T>) => S | undefined;
export function find<T>(predicate: (value: T, key: string) => boolean): (query: QuerySequence<T>) => T | undefined;
export function find<T>(predicate: (value: T, key: string) => boolean) {
  return (query: QuerySequence<T>): T | undefined => query[FIND](predicate);
}

/**
 * @description Builds a data-last terminal that stops as soon as a predicate succeeds.
 * @param {(value: T, key: string) => boolean} predicate - Test receiving each value and original key in query order.
 * @returns {(query: QuerySequence<T>) => boolean} Unary terminal returning true on the first match and false for an empty source or no match.
 * @example
 * pipe(createQueryable({ a: 2 }), some((value: number) => value > 1)); // true
 */
export function some<T>(predicate: (value: T, key: string) => boolean) {
  return (query: QuerySequence<T>): boolean => query[SOME](predicate);
}

/**
 * @description Builds a data-last fold that visits values in query order and propagates callback exceptions unchanged.
 * @param {(accumulator: A, value: T, key: string) => A} reducer - Updates the accumulator using the value and original key.
 * @param {A} initial - Starting accumulator, returned unchanged for an empty source.
 * @returns {(query: QuerySequence<T>) => A} Unary reduction terminal.
 * @example
 * pipe(createQueryable({ a: 2, b: 3 }), reduce((sum: number, value: number) => sum + value, 0)); // 5
 */
export function reduce<T, A>(reducer: (accumulator: A, value: T, key: string) => A, initial: A) {
  return (query: QuerySequence<T>): A => query[REDUCE](reducer, initial);
}

/**
 * @description Applies one to four unary stages from left to right, passing each result to the next stage. Nest pipes for longer chains.
 * @param {A} input - Initial value supplied to the first stage.
 * @param {(value: A) => B} ab - First stage.
 * @param {(value: B) => C} bc - Second stage when using an overload with at least two stages.
 * @param {(value: C) => D} cd - Third stage when using an overload with at least three stages.
 * @param {(value: D) => E} de - Fourth stage when using the four-stage overload.
 * @returns {B | C | D | E} Result of the final supplied stage, with its precise overload return type.
 * @example
 * pipe(createQueryable({ a: 1, b: 2 }), limit(1), values); // [1]
 */
export function pipe<A, B>(input: A, ab: (value: A) => B): B;
export function pipe<A, B, C>(input: A, ab: (value: A) => B, bc: (value: B) => C): C;
export function pipe<A, B, C, D>(input: A, ab: (value: A) => B, bc: (value: B) => C, cd: (value: C) => D): D;
export function pipe<A, B, C, D, E>(input: A, ab: (value: A) => B, bc: (value: B) => C, cd: (value: C) => D, de: (value: D) => E): E;
export function pipe<A, B, C, D, E>(
  input: A, ab: (value: A) => B, bc?: (value: B) => C,
  cd?: (value: C) => D, de?: (value: D) => E,
) {
  const b = ab(input);
  if (!bc) { return b; }
  const c = bc(b);
  if (!cd) { return c; }
  const d = cd(c);
  return de ? de(d) : d;
}

/**
 * @description Creates a typed pipeline builder for one to four unary stages, seeding inference with the initial input type.
 * @returns {{ <B>(ab: (value: A) => B): (input: A) => B; <B, C>(ab: (value: A) => B, bc: (value: B) => C): (input: A) => C; <B, C, D>(ab: (value: A) => B, bc: (value: B) => C, cd: (value: C) => D): (input: A) => D; <B, C, D, E>(ab: (value: A) => B, bc: (value: B) => C, cd: (value: C) => D, de: (value: D) => E): (input: A) => E; }} Builder accepting stages in left-to-right order and returning a reusable unary pipeline.
 * @example
 * const double = compose<number>()(value => value * 2, value => String(value));
 * double(3); // "6"
 */
export function compose<A>() {
  function build<B>(ab: (value: A) => B): (input: A) => B;
  function build<B, C>(ab: (value: A) => B, bc: (value: B) => C): (input: A) => C;
  function build<B, C, D>(ab: (value: A) => B, bc: (value: B) => C, cd: (value: C) => D): (input: A) => D;
  function build<B, C, D, E>(ab: (value: A) => B, bc: (value: B) => C, cd: (value: C) => D, de: (value: D) => E): (input: A) => E;
  function build<B, C, D, E>(
    ab: (value: A) => B, bc?: (value: B) => C,
    cd?: (value: C) => D, de?: (value: D) => E,
  ) {
    return (input: A) => {
      const b = ab(input);
      if (!bc) { return b; }
      const c = bc(b);
      if (!cd) { return c; }
      const d = cd(c);
      return de ? de(d) : d;
    };
  }
  return build;
}
