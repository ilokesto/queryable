import {
  DROP_LAST, DROP_WHILE, SKIP, TAKE_LAST, TAKE_WHILE,
  dropLastEntries, dropWhileEntries, skipEntries, takeLastEntries, takeWhileEntries,
} from "./bounds.js";

export { DROP_LAST, DROP_WHILE, SKIP, TAKE_LAST, TAKE_WHILE } from "./bounds.js";

import { checkedEntries } from "./entries.js";
import type { EntrySourceFactory, KeyCollisionPolicy } from "./entries.js";

export { DuplicateKeyError } from "./entries.js";
export type { EntrySourceFactory, KeyCollisionPolicy } from "./entries.js";

/** Filter records, preserving type guard narrowing.
 * @example query[WHERE](value => value.age >= 20)
 */
export const WHERE = Symbol("where");
/** Sort into an ordered sequence, including integer-index keys.
 * @example query[SORT]((a, b) => b.age - a.age)[VALUES]()
 */
export const SORT = Symbol("sort");
/** Transform values without changing their record keys.
 * @example query[MAP](value => value.name)
 */
export const MAP = Symbol("map");
/** Pick record keys in argument order, ignoring missing and duplicate keys.
 * @example query[PICK]("alice", "bob")
 */
export const PICK = Symbol("pick");
/** Limit using slice(0, n) semantics.
 * @example query[LIMIT](5)
 */
export const LIMIT = Symbol("limit");
/** Materialize groups with literal key inference and optional presence.
 * @example query[GROUP_BY](value => value.active ? "active" : "inactive")
 */
export const GROUP_BY = Symbol("group_by");
/** Count records.
 * @example query[COUNT]()
 */
export const COUNT = Symbol("count");
/** Read the first value, or undefined.
 * @example query[FIRST]()
 */
export const FIRST = Symbol("first");
/** Collect values in query order.
 * @example query[VALUES]()
 */
export const VALUES = Symbol("values");
/** Find the first matching value without building a filtered collection.
 * @example query[FIND](value => value.age >= 20)
 */
export const FIND = Symbol("find");
/** Stop at the first matching value.
 * @example query[SOME](value => value.active)
 */
export const SOME = Symbol("some");
/** Collect fresh key/value tuples in query order.
 * @example query[ENTRIES]()
 */
export const ENTRIES = Symbol("entries");
/** Copy data to an ordinary object; integer keys regain native object ordering.
 * @example query[TO_OBJECT]()
 */
export const TO_OBJECT = Symbol("to_object");
/** Fold values and keys with an explicit initial accumulator.
 * @example query[REDUCE]((sum, value) => sum + value.price, 0)
 */
export const REDUCE = Symbol("reduce");
/** Create a repeatable, non-memoized lazy view.
 * @example query[LAZY]()[WHERE](value => value.active)[LIMIT](5)[VALUES]()
 */
export const LAZY = Symbol("lazy");

const ITERATE = Symbol("iterate");
type Entry<T> = readonly [string, T];
type Mode = "record" | "sequence";
type Result<T, M extends Mode> = M extends "record" ? Queryable<T> : QuerySequence<T>;

interface Source<T> {
  [ITERATE](): Iterable<Entry<T>>;
}

interface Terminals<T> extends Source<T> {
  /** Count records; consumes a lazy chain.
   * @example query[COUNT]()
   */
  [COUNT](this: Source<T>): number;
  /** Stop after the first value; undefined means no value was found.
   * @example query[FIRST]()
   */
  [FIRST](this: Source<T>): T | undefined;
  /** Materialize a fresh array in query order.
   * @example query[VALUES]()
   */
  [VALUES](this: Source<T>): T[];
  /** Find a matching value and preserve type guard narrowing.
   * @example query[FIND]((value): value is string => typeof value === "string")
   */
  [FIND]<S extends T>(this: Source<T>, predicate: (value: T, key: string) => value is S): S | undefined;
  [FIND](this: Source<T>, predicate: (value: T, key: string) => boolean): T | undefined;
  /** Return true on the first match, or false for an empty query.
   * @example query[SOME](value => value.active)
   */
  [SOME](this: Source<T>, predicate: (value: T, key: string) => boolean): boolean;
  /** Return fresh tuples, retaining key order.
   * @example query[ENTRIES]()
   */
  [ENTRIES](this: Source<T>): [string, T][];
  /** Return an ordinary shallow object with safe own special keys.
   * @example query[TO_OBJECT]()
   */
  [TO_OBJECT](this: Source<T>): Record<string, T>;
  /** Fold in query order; an empty query returns initial unchanged.
   * @example query[REDUCE]((sum, value) => sum + value, 0)
   */
  [REDUCE]<A>(this: Source<T>, reducer: (accumulator: A, value: T, key: string) => A, initial: A): A;
}

interface Operations<T, M extends Mode> extends Terminals<T> {
  /** Keep matching records with type guard narrowing.
   * @example query[WHERE]((value): value is string => typeof value === "string")
   */
  [WHERE]<S extends T>(this: Result<T, M>, predicate: (value: T, key: string) => value is S): Result<S, M>;
  [WHERE](this: Result<T, M>, predicate: (value: T, key: string) => boolean): Result<T, M>;
  /** Stable sort into a sequence. Lazy sequences defer sorting until consumption.
   * @example query[SORT]((a, b) => a.age - b.age)
   */
  [SORT](this: Result<T, M>, compareFn: (a: T, b: T) => number): QuerySequence<T>;
  /** Transform values, retaining keys and evaluation mode.
   * @example query[MAP](value => value.name)
   */
  [MAP]<U>(this: Result<T, M>, fn: (value: T, key: string) => U): Result<U, M>;
  /** Pick record keys in argument order. On sequences this buffers the source.
   * @example query[PICK]("alice")
   */
  [PICK](this: Result<T, M>, ...keys: string[]): Result<T, M>;
  /** Apply slice(0, n) semantics; finite negative bounds buffer the source.
   * @example query[LIMIT](3)
   */
  [LIMIT](this: Result<T, M>, n: number): Result<T, M>;
  /** Skip a nonnegative truncated size; NaN and negative sizes mean zero.
   * @example query[SKIP](2)[LIMIT](3)
   */
  [SKIP](this: Result<T, M>, n: number): Result<T, M>;
  /** Keep the matching prefix, stopping at the first false predicate.
   * @example query[TAKE_WHILE](value => value.active)
   */
  [TAKE_WHILE]<S extends T>(this: Result<T, M>, predicate: (value: T, key: string) => value is S): Result<S, M>;
  [TAKE_WHILE](this: Result<T, M>, predicate: (value: T, key: string) => boolean): Result<T, M>;
  /** Drop only the matching prefix; does not narrow the remaining values.
   * @example query[DROP_WHILE](value => value.active)
   */
  [DROP_WHILE](this: Result<T, M>, predicate: (value: T, key: string) => boolean): Result<T, M>;
  /** Keep the final size entries; buffers at most size entries until exhaustion.
   * @example query[TAKE_LAST](2)
   */
  [TAKE_LAST](this: Result<T, M>, n: number): Result<T, M>;
  /** Drop the final size entries using bounded lookahead.
   * @example query[DROP_LAST](2)
   */
  [DROP_LAST](this: Result<T, M>, n: number): Result<T, M>;
  /** Eagerly materialize groups; a possible group key may still be absent.
   * @example query[GROUP_BY](value => value.active ? "yes" : "no")
   */
  [GROUP_BY]<K extends string>(this: Result<T, M>, keyFn: (value: T, key: string) => K): Partial<Record<K, Result<T, M>>>;
  /** Make a lazy view. Each consumption re-runs pending callbacks; no caching.
   * @example query[LAZY]()[MAP](value => value.name)[FIRST]()
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

// Store the shared generator and its arguments, rather than a closure per chain step.
class Deferred<T, A extends unknown[]> implements Iterable<T> {
  constructor(
    private readonly generate: (...args: A) => Iterable<T>,
    private readonly args: A,
  ) {}
  [Symbol.iterator](): Iterator<T> {
    return this.generate(...this.args)[Symbol.iterator]();
  }
}

function defer<T, A extends unknown[]>(generate: (...args: A) => Iterable<T>, ...args: A): Iterable<T> {
  return new Deferred(generate, args);
}

function* filterEntries<T>(source: Iterable<Entry<T>>, predicate: (value: T, key: string) => boolean): Generator<Entry<T>> {
  for (const entry of source) {
    if (predicate(entry[1], entry[0])) {
      yield entry;
    }
  }
}

function* mapEntries<T, U>(source: Iterable<Entry<T>>, fn: (value: T, key: string) => U): Generator<Entry<U>> {
  for (const [key, value] of source) {
    yield [key, fn(value, key)];
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

function find<T, S extends T>(this: Source<T>, predicate: (value: T, key: string) => value is S): S | undefined;
function find<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): T | undefined;
function find<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): T | undefined {
  for (const [key, value] of this[ITERATE]()) {
    if (predicate(value, key)) {
      return value;
    }
  }
  return undefined;
}

const terminals = {
  [FIND]: find,
  [SOME]<T>(this: Source<T>, predicate: (value: T, key: string) => boolean): boolean {
    for (const [key, value] of this[ITERATE]()) {
      if (predicate(value, key)) {
        return true;
      }
    }
    return false;
  },
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
  [VALUES]<T>(this: Source<T>): T[] {
    return Array.from(this[ITERATE](), ([, value]) => value);
  },
  [ENTRIES]<T>(this: Source<T>): [string, T][] {
    return Array.from(this[ITERATE](), ([key, value]): [string, T] => [key, value]);
  },
  [TO_OBJECT]<T>(this: Source<T>): Record<string, T> {
    return Object.fromEntries(this[ITERATE]());
  },
  [REDUCE]<T, A>(this: Source<T>, reducer: (accumulator: A, value: T, key: string) => A, initial: A): A {
    let accumulator = initial;
    for (const [key, value] of this[ITERATE]()) {
      accumulator = reducer(accumulator, value, key);
    }
    return accumulator;
  },
};

function where<T, S extends T>(this: Queryable<T>, predicate: (value: T, key: string) => value is S): Queryable<S>;
function where<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T>;
function where<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T> {
  return fromEntries(filterEntries(recordEntries(this), predicate));
}

function takeWhile<T, S extends T>(this: Queryable<T>, predicate: (value: T, key: string) => value is S): Queryable<S>;
function takeWhile<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T>;
function takeWhile<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T> {
  return fromEntries(takeWhileEntries(recordEntries(this), predicate));
}

const queryablePrototype = {
  ...terminals,
  [ITERATE]<T>(this: Queryable<T>): Iterable<Entry<T>> {
    return recordEntries(this);
  },
  [WHERE]: where,
  [SORT]<T>(this: Queryable<T>, compareFn: (a: T, b: T) => number): QuerySequence<T> {
    return new Sequence(sortEntries(recordEntries(this), compareFn), false);
  },
  [MAP]<T, U>(this: Queryable<T>, fn: (value: T, key: string) => U): Queryable<U> {
    return fromEntries(mapEntries(recordEntries(this), fn));
  },
  [PICK]<T>(this: Queryable<T>, ...keys: string[]): Queryable<T> {
    const result: Queryable<T> = Object.create(queryablePrototype);
    for (const key of keys) {
      if (!Object.hasOwn(result, key) && Object.prototype.propertyIsEnumerable.call(this, key)) {
        result[key] = this[key] as T;
      }
    }
    return result;
  },
  [LIMIT]<T>(this: Queryable<T>, n: number): Queryable<T> {
    return fromEntries(limitEntries(recordEntries(this), n));
  },
  [SKIP]<T>(this: Queryable<T>, n: number): Queryable<T> {
    return fromEntries(skipEntries(recordEntries(this), n));
  },
  [TAKE_WHILE]: takeWhile,
  [DROP_WHILE]<T>(this: Queryable<T>, predicate: (value: T, key: string) => boolean): Queryable<T> {
    return fromEntries(dropWhileEntries(recordEntries(this), predicate));
  },
  [TAKE_LAST]<T>(this: Queryable<T>, n: number): Queryable<T> {
    return fromEntries(takeLastEntries(recordEntries(this), n));
  },
  [DROP_LAST]<T>(this: Queryable<T>, n: number): Queryable<T> {
    return fromEntries(dropLastEntries(recordEntries(this), n));
  },
  [GROUP_BY]<T, K extends string>(this: Queryable<T>, keyFn: (value: T, key: string) => K): Partial<Record<K, Queryable<T>>> {
    const groups: Partial<Record<K, Queryable<T>>> = Object.create(null);
    for (const [key, value] of recordEntries(this)) {
      const groupKey = keyFn(value, key);
      const group = groups[groupKey] ?? (groups[groupKey] = createQueryable<T>({}));
      group[key] = value;
    }
    return groups;
  },
  [LAZY]<T>(this: Queryable<T>): QuerySequence<T> {
    return new Sequence(defer(recordEntries, this), true);
  },
};

// Both implementations use exactly the same terminal functions, not bound copies.
interface Sequence<T> extends Terminals<T> {}
class Sequence<T> implements QuerySequence<T> {
  constructor(private readonly source: Iterable<Entry<T>>, private readonly lazy: boolean) {}

  [ITERATE](): Iterable<Entry<T>> {
    return this.source;
  }

  private next<U>(source: Iterable<Entry<U>>): Sequence<U> {
    return new Sequence(this.lazy ? source : Array.from(source), this.lazy);
  }

  [WHERE]<S extends T>(predicate: (value: T, key: string) => value is S): QuerySequence<S>;
  [WHERE](predicate: (value: T, key: string) => boolean): QuerySequence<T>;
  [WHERE](predicate: (value: T, key: string) => boolean): QuerySequence<T> {
    return this.next(defer(filterEntries, this.source, predicate));
  }
  [MAP]<U>(fn: (value: T, key: string) => U): QuerySequence<U> {
    return this.next(defer(mapEntries, this.source, fn));
  }
  [SORT](compareFn: (a: T, b: T) => number): QuerySequence<T> {
    return new Sequence(
      this.lazy ? defer(sortEntries, this.source, compareFn) : sortEntries(this.source, compareFn),
      this.lazy,
    );
  }
  [PICK](...keys: string[]): QuerySequence<T> {
    return this.next(defer(pickEntries, this.source, keys));
  }
  [LIMIT](n: number): QuerySequence<T> {
    return this.next(defer(limitEntries, this.source, n));
  }
  [SKIP](n: number): QuerySequence<T> {
    return this.next(defer(skipEntries, this.source, n));
  }
  [TAKE_WHILE]<S extends T>(predicate: (value: T, key: string) => value is S): QuerySequence<S>;
  [TAKE_WHILE](predicate: (value: T, key: string) => boolean): QuerySequence<T>;
  [TAKE_WHILE](predicate: (value: T, key: string) => boolean): QuerySequence<T> {
    return this.next(defer(takeWhileEntries, this.source, predicate));
  }
  [DROP_WHILE](predicate: (value: T, key: string) => boolean): QuerySequence<T> {
    return this.next(defer(dropWhileEntries, this.source, predicate));
  }
  [TAKE_LAST](n: number): QuerySequence<T> {
    return this.next(defer(takeLastEntries, this.source, n));
  }
  [DROP_LAST](n: number): QuerySequence<T> {
    return this.next(defer(dropLastEntries, this.source, n));
  }
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
  [LAZY](): QuerySequence<T> {
    return new Sequence(this.source, true);
  }
}

Object.assign(Sequence.prototype, terminals);
Object.freeze(Sequence.prototype);
// A null root makes "__proto__", "constructor", and "toString" ordinary data keys.
Object.setPrototypeOf(queryablePrototype, null);
Object.freeze(queryablePrototype);

/**
 * Shallow-copy own enumerable string-keyed data into an eager queryable record.
 * Symbol, inherited, and non-enumerable input keys are excluded.
 * @example
 * const users = createQueryable({ alice: { age: 25 }, bob: { age: 18 } });
 * users[WHERE](user => user.age >= 20)[VALUES](); // [{ age: 25 }]
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
  readonly duplicateKeys?: KeyCollisionPolicy;
}

/**
 * Defer a repeatable entry factory until consumption, with explicit key identity.
 * Each consumption calls the factory again; it must return a fresh iterator or repeatable iterable.
 * @example
 * const query = createQuerySequence(() => new Map([["a", 1]]).entries());
 * query[VALUES](); // [1]
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
      return new Sequence(defer(checkedEntries, factory, policy), true);
    default: {
      const unsupported: never = policy;
      throw new TypeError(`Unsupported duplicate key policy: ${String(unsupported)}`);
    }
  }
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
 * Create a repeatable entry view without first materializing an array.
 * Each yielded tuple is fresh; nested values remain shallow references.
 * @example Array.from(iterateEntries(createQueryable({ a: 1 }))); // [["a", 1]]
 */
export function iterateEntries<T>(query: Queryable<T> | QuerySequence<T>): Iterable<[string, T]> {
  return defer(entryView, query);
}

/**
 * Create a repeatable value view without first materializing an array.
 * @example Array.from(iterateValues(createQueryable({ a: 1 }))); // [1]
 */
export function iterateValues<T>(query: Queryable<T> | QuerySequence<T>): Iterable<T> {
  return defer(valueView, query);
}
