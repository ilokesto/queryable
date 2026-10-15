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
  const entries = new Map(source);
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
    let count = 0;
    for (const _entry of this[ITERATE]()) {
      count++;
    }
    return count;
  },
  [FIRST]<T>(this: Source<T>): T | undefined {
    for (const [, value] of this[ITERATE]()) {
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
