import {
  COUNT, ENTRIES, FIND, FIRST, LAZY, LIMIT, MAP, PICK, REDUCE,
  SOME, SORT, TO_OBJECT, VALUES, WHERE,
} from "./index.js";
import type { Queryable, QuerySequence, Truthy } from "./index.js";

type Mapped<Q, U> = Q extends Queryable<unknown> ? Queryable<U> : QuerySequence<U>;
type Value<Q> = Q extends QuerySequence<infer T> ? T : never;

interface Transform<T, U> {
  <Q extends QuerySequence<T>>(query: Q): Mapped<Q, U>;
}

/** Data-last WHERE; type guards narrow values while retaining the query mode. */
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

/** Data-last MAP, preserving keys and query mode. */
export function map<T, U>(fn: (value: T, key: string) => U): Transform<T, U> {
  function apply<Q extends QuerySequence<T>>(query: Q): Mapped<Q, U>;
  function apply(query: QuerySequence<T>): QuerySequence<U> {
    return query[MAP](fn);
  }
  return apply;
}

/** Data-last LIMIT with the core slice semantics. */
export function limit(n: number) {
  function apply<Q extends QuerySequence<unknown>>(query: Q): Mapped<Q, Value<Q>>;
  function apply<T>(query: QuerySequence<T>): QuerySequence<T> {
    return query[LIMIT](n);
  }
  return apply;
}

/** Data-last PICK selects record keys, not fields within values. */
export function pick(...keys: string[]) {
  function apply<Q extends QuerySequence<unknown>>(query: Q): Mapped<Q, Value<Q>>;
  function apply<T>(query: QuerySequence<T>): QuerySequence<T> {
    return query[PICK](...keys);
  }
  return apply;
}

/** Data-last SORT transitions to an ordered sequence. */
export function sort<T>(compare: (a: T, b: T) => number) {
  return (query: QuerySequence<T>): QuerySequence<T> => query[SORT](compare);
}

/** Unary LAZY stage; each terminal consumption re-executes pending work. */
export function lazy<T>(query: QuerySequence<T>): QuerySequence<T> {
  return query[LAZY]();
}

/** Unary terminal stages accept records and sequences. */
export function values<T>(query: QuerySequence<T>): T[] {
  return query[VALUES]();
}

export function entries<T>(query: QuerySequence<T>): [string, T][] {
  return query[ENTRIES]();
}

export function toObject<T>(query: QuerySequence<T>): Record<string, T> {
  return query[TO_OBJECT]();
}

export function count<T>(query: QuerySequence<T>): number {
  return query[COUNT]();
}

export function first<T>(query: QuerySequence<T>): T | undefined {
  return query[FIRST]();
}

export function find(predicate: BooleanConstructor): <T>(query: QuerySequence<T>) => Truthy<T> | undefined;
export function find<T>(predicate: (value: T, key: string) => false): (query: QuerySequence<T>) => undefined;
export function find<T, S extends T>(predicate: (value: T, key: string) => value is S): (query: QuerySequence<T>) => S | undefined;
export function find<T>(predicate: (value: T, key: string) => boolean): (query: QuerySequence<T>) => T | undefined;
export function find<T>(predicate: (value: T, key: string) => boolean) {
  return (query: QuerySequence<T>): T | undefined => query[FIND](predicate);
}

export function some<T>(predicate: (value: T, key: string) => boolean) {
  return (query: QuerySequence<T>): boolean => query[SOME](predicate);
}

export function reduce<T, A>(reducer: (accumulator: A, value: T, key: string) => A, initial: A) {
  return (query: QuerySequence<T>): A => query[REDUCE](reducer, initial);
}

/** Apply one to four unary stages left to right. Nest pipes for longer chains. */
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

/** Build a reusable left-to-right pipeline, seeding inference with its input type. */
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
