import { DuplicateKeyError } from "./entries.js";
import type { KeyCollisionPolicy } from "./entries.js";
import { COUNT, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP, SOME, SORT, VALUES, WHERE } from "./index.js";

type Entry<T> = readonly [string, T];
type Awaitable<T> = T | PromiseLike<T>;
type EntrySource<T> = Iterable<Entry<T>> | AsyncIterable<Entry<T>>;

/** Each consumption requests a fresh iterator or repeatable iterable. */
export type AsyncEntrySourceFactory<T> = () => Awaitable<EntrySource<T>>;

/** Key identity follows the synchronous factory's error/first/last policies. */
export interface AsyncQuerySequenceOptions {
  readonly duplicateKeys?: KeyCollisionPolicy;
}

const ITERATE = Symbol("asyncIterate");

/**
 * Deferred, sequential query over awaited values. Use explicit async iterable views.
 * Terminal methods return Promises; GROUP_BY starts eager snapshot materialization.
 */
export interface AsyncQuerySequence<T> {
  [ITERATE](): AsyncIterable<Entry<T>>;
  [MAP]<U>(this: AsyncQuerySequence<T>, fn: (value: T, key: string) => U): AsyncQuerySequence<Awaited<U>>;
  [WHERE]<S extends T>(this: AsyncQuerySequence<T>, predicate: (value: T, key: string) => value is S): AsyncQuerySequence<S>;
  [WHERE](this: AsyncQuerySequence<T>, predicate: (value: T, key: string) => Awaitable<boolean>): AsyncQuerySequence<T>;
  [COUNT](this: AsyncQuerySequence<T>): Promise<number>;
  [FIRST](this: AsyncQuerySequence<T>): Promise<T | undefined>;
  [VALUES](this: AsyncQuerySequence<T>): Promise<T[]>;
  [ENTRIES](this: AsyncQuerySequence<T>): Promise<[string, T][]>;
  [FIND]<S extends T>(this: AsyncQuerySequence<T>, predicate: (value: T, key: string) => value is S): Promise<S | undefined>;
  [FIND](this: AsyncQuerySequence<T>, predicate: (value: T, key: string) => Awaitable<boolean>): Promise<T | undefined>;
  [SOME](this: AsyncQuerySequence<T>, predicate: (value: T, key: string) => Awaitable<boolean>): Promise<boolean>;
  [LIMIT](this: AsyncQuerySequence<T>, n: number): AsyncQuerySequence<T>;
  [LAZY](this: AsyncQuerySequence<T>): AsyncQuerySequence<T>;
  /** Buffer at consumption, then stably sort with a synchronous value comparator. */
  [SORT](this: AsyncQuerySequence<T>, compareFn: (left: T, right: T) => number): AsyncQuerySequence<T>;
  [GROUP_BY]<K extends string>(
    this: AsyncQuerySequence<T>,
    keyFn: (value: T, key: string) => Awaitable<K>,
  ): Promise<Partial<Record<K, AsyncQuerySequence<T>>>>;
}

class Deferred<T, A extends unknown[]> implements AsyncIterable<T> {
  constructor(
    private readonly generate: (...args: A) => AsyncIterable<T>,
    private readonly args: A,
  ) {}

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.generate(...this.args)[Symbol.asyncIterator]();
  }
}

function defer<T, A extends unknown[]>(generate: (...args: A) => AsyncIterable<T>, ...args: A): AsyncIterable<T> {
  return new Deferred(generate, args);
}

async function* normalizedEntries<T>(factory: AsyncEntrySourceFactory<T>): AsyncGenerator<Entry<Awaited<T>>> {
  const source = await factory();
  const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  let exhausted = false;
  let failed = false;
  try {
    while (true) {
      const next = await iterator.next();
      if (next.done) {
        exhausted = true;
        return;
      }
      const entry = next.value;
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
        throw new TypeError("Query entries must be two-element arrays with string keys");
      }
      yield [entry[0], await entry[1]];
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // for-await alone does not close an iterator whose next() rejects.
    if (!exhausted) {
      try {
        const close: (() => Awaitable<IteratorResult<Entry<T>>>) | undefined = iterator.return;
        if (close) {
          await close.call(iterator);
        }
      } catch (error) {
        if (!failed) {
          throw error;
        }
      }
    }
  }
}

async function* checkedEntries<T>(
  factory: AsyncEntrySourceFactory<T>,
  policy: KeyCollisionPolicy,
): AsyncGenerator<Entry<Awaited<T>>> {
  if (policy === "last") {
    const entries = new Map<string, Awaited<T>>();
    for await (const [key, value] of normalizedEntries(factory)) {
      entries.set(key, value);
    }
    yield* entries;
    return;
  }
  const seen = new Set<string>();
  for await (const entry of normalizedEntries(factory)) {
    if (seen.has(entry[0])) {
      if (policy === "error") {
        throw new DuplicateKeyError(entry[0]);
      }
      continue;
    }
    seen.add(entry[0]);
    yield entry;
  }
}

async function* mapEntries<T, U>(
  source: AsyncIterable<Entry<T>>,
  fn: (value: T, key: string) => U,
): AsyncGenerator<Entry<Awaited<U>>> {
  for await (const [key, value] of source) {
    yield [key, await fn(value, key)];
  }
}

async function* filterEntries<T>(
  source: AsyncIterable<Entry<T>>,
  predicate: (value: T, key: string) => Awaitable<boolean>,
): AsyncGenerator<Entry<T>> {
  for await (const entry of source) {
    if (await predicate(entry[1], entry[0])) {
      yield entry;
    }
  }
}

async function collectEntries<T>(source: AsyncIterable<Entry<T>>): Promise<[string, T][]> {
  const entries: [string, T][] = [];
  for await (const [key, value] of source) {
    entries.push([key, value]);
  }
  return entries;
}

async function* sortEntries<T>(
  source: AsyncIterable<Entry<T>>,
  compareFn: (left: T, right: T) => number,
): AsyncGenerator<Entry<T>> {
  const entries = await collectEntries(source);
  yield* entries.sort((left, right) => compareFn(left[1], right[1]));
}

async function* limitEntries<T>(source: AsyncIterable<Entry<T>>, n: number): AsyncGenerator<Entry<T>> {
  const count = Number.isNaN(n) ? 0 : Math.trunc(n);
  if (count === 0 || count === -Infinity) {
    return;
  }
  if (count < 0) {
    yield* (await collectEntries(source)).slice(0, count);
    return;
  }
  let remaining = count;
  for await (const entry of source) {
    yield entry;
    if (--remaining === 0) {
      return;
    }
  }
}

async function* snapshotEntries<T>(entries: ReadonlyArray<Entry<T>>): AsyncGenerator<Entry<T>> {
  yield* entries;
}

type SequenceConstructor = new <T>(source: AsyncIterable<Entry<T>>) => AsyncQuerySequence<T>;
let sequenceConstructor: SequenceConstructor | undefined;

function sequence<T>(source: AsyncIterable<Entry<T>>): AsyncQuerySequence<T> {
  sequenceConstructor ??= createSequenceConstructor();
  return new sequenceConstructor(source);
}

// Delay computed Symbol keys until a factory call: index.ts reexports this module.
function createSequenceConstructor(): SequenceConstructor {
  class Sequence<T> implements AsyncQuerySequence<T> {
    constructor(private readonly source: AsyncIterable<Entry<T>>) {}

    [ITERATE](): AsyncIterable<Entry<T>> {
      return this.source;
    }
    [MAP]<U>(fn: (value: T, key: string) => U): AsyncQuerySequence<Awaited<U>> {
      return sequence(defer(mapEntries, this.source, fn));
    }
    [WHERE]<S extends T>(predicate: (value: T, key: string) => value is S): AsyncQuerySequence<S>;
    [WHERE](predicate: (value: T, key: string) => Awaitable<boolean>): AsyncQuerySequence<T>;
    [WHERE](predicate: (value: T, key: string) => Awaitable<boolean>): AsyncQuerySequence<T> {
      return sequence(defer(filterEntries, this.source, predicate));
    }
    async [COUNT](): Promise<number> {
      let count = 0;
      for await (const _entry of this.source) {
        count++;
      }
      return count;
    }
    async [FIRST](): Promise<T | undefined> {
      for await (const [, value] of this.source) {
        return value;
      }
      return undefined;
    }
    async [VALUES](): Promise<T[]> {
      const values: T[] = [];
      for await (const [, value] of this.source) {
        values.push(value);
      }
      return values;
    }
    [ENTRIES](): Promise<[string, T][]> {
      return collectEntries(this.source);
    }
    [FIND]<S extends T>(predicate: (value: T, key: string) => value is S): Promise<S | undefined>;
    [FIND](predicate: (value: T, key: string) => Awaitable<boolean>): Promise<T | undefined>;
    async [FIND](predicate: (value: T, key: string) => Awaitable<boolean>): Promise<T | undefined> {
      for await (const [key, value] of this.source) {
        if (await predicate(value, key)) {
          return value;
        }
      }
      return undefined;
    }
    async [SOME](predicate: (value: T, key: string) => Awaitable<boolean>): Promise<boolean> {
      for await (const [key, value] of this.source) {
        if (await predicate(value, key)) {
          return true;
        }
      }
      return false;
    }
    [LIMIT](n: number): AsyncQuerySequence<T> {
      return sequence(defer(limitEntries, this.source, n));
    }
    [LAZY](): AsyncQuerySequence<T> {
      return sequence(this.source);
    }
    [SORT](compareFn: (left: T, right: T) => number): AsyncQuerySequence<T> {
      return sequence(defer(sortEntries, this.source, compareFn));
    }
    async [GROUP_BY]<K extends string>(
      keyFn: (value: T, key: string) => Awaitable<K>,
    ): Promise<Partial<Record<K, AsyncQuerySequence<T>>>> {
      const entries = new Map<K, Entry<T>[]>();
      for await (const entry of this.source) {
        const key = await keyFn(entry[1], entry[0]);
        const group = entries.get(key);
        if (group) {
          group.push(entry);
        } else {
          entries.set(key, [entry]);
        }
      }
      const groups: Partial<Record<K, AsyncQuerySequence<T>>> = {};
      Object.setPrototypeOf(groups, null);
      for (const [key, group] of entries) {
        groups[key] = sequence(defer(snapshotEntries, group));
      }
      return groups;
    }
  }
  Object.freeze(Sequence.prototype);
  return Sequence;
}

/**
 * Create a live, repeatable async sequence. Source and mapped PromiseLike values
 * are recursively awaited; unlike synchronous queries, Promises are not opaque data.
 */
export function createAsyncQuerySequence<T>(
  factory: AsyncEntrySourceFactory<T>,
  options: AsyncQuerySequenceOptions = {},
): AsyncQuerySequence<Awaited<T>> {
  const policy = options.duplicateKeys ?? "error";
  switch (policy) {
    case "error":
    case "first":
    case "last":
      return sequence(defer(checkedEntries, factory, policy));
    default: {
      const unsupported: never = policy;
      throw new TypeError(`Unsupported duplicate key policy: ${String(unsupported)}`);
    }
  }
}

async function* entryView<T>(query: AsyncQuerySequence<T>): AsyncGenerator<[string, T]> {
  for await (const [key, value] of query[ITERATE]()) {
    yield [key, value];
  }
}

async function* valueView<T>(query: AsyncQuerySequence<T>): AsyncGenerator<Awaited<T>> {
  for await (const [, value] of query[ITERATE]()) {
    yield value;
  }
}

/** Repeatable async entry view with fresh tuples and independent cursors. */
export function iterateAsyncEntries<T>(query: AsyncQuerySequence<T>): AsyncIterable<[string, T]> {
  return defer(entryView, query);
}

/** Repeatable async value view; a consumer break closes the upstream iterator. */
export function iterateAsyncValues<T>(query: AsyncQuerySequence<T>): AsyncIterable<Awaited<T>> {
  return defer(valueView, query);
}
