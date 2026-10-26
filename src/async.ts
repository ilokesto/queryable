import { DuplicateKeyError } from "./entries.js";
import type { KeyCollisionPolicy } from "./entries.js";
import { FINALIZE, ON_COMPLETE, completeEntries, finalizeEntries, waitFor } from "./lifetime.js";
import type { ConsumptionOutcome } from "./lifetime.js";
import { MAP_CONCURRENT, concurrentEntries, concurrentMapOptions } from "./concurrency.js";
import type { ConcurrentMapOptions } from "./concurrency.js";
import { COUNT, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP, SOME, SORT, VALUES, WHERE } from "./index.js";

type Entry<T> = readonly [string, T];
type Awaitable<T> = T | PromiseLike<T>;
type EntrySource<T> = Iterable<Entry<T>> | AsyncIterable<Entry<T>>;

/** Each consumption requests a fresh iterator or repeatable iterable. */
export type AsyncEntrySourceFactory<T> = (signal?: AbortSignal) => Awaitable<EntrySource<T>>;

/** Key identity follows the synchronous factory's error/first/last policies. */
export interface AsyncQuerySequenceOptions {
  readonly duplicateKeys?: KeyCollisionPolicy;
  readonly signal?: AbortSignal;
}

const ITERATE = Symbol("asyncIterate");

/**
 * Deferred, sequential query over awaited values. Use explicit async iterable views.
 * Terminal methods return Promises; GROUP_BY starts eager snapshot materialization.
 */
export interface AsyncQuerySequence<T> {
  [ITERATE](): AsyncIterable<Entry<T>>;
  [MAP]<U>(this: AsyncQuerySequence<T>, fn: (value: T, key: string, signal: AbortSignal | undefined) => U): AsyncQuerySequence<Awaited<U>>;
  [MAP_CONCURRENT]<U>(
    this: AsyncQuerySequence<T>,
    fn: (value: T, key: string, signal: AbortSignal) => U,
    options: ConcurrentMapOptions,
  ): AsyncQuerySequence<Awaited<U>>;
  [WHERE]<S extends T>(this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => value is S): AsyncQuerySequence<S>;
  [WHERE](this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): AsyncQuerySequence<T>;
  [COUNT](this: AsyncQuerySequence<T>): Promise<number>;
  [FIRST](this: AsyncQuerySequence<T>): Promise<T | undefined>;
  [VALUES](this: AsyncQuerySequence<T>): Promise<T[]>;
  [ENTRIES](this: AsyncQuerySequence<T>): Promise<[string, T][]>;
  [FIND]<S extends T>(this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => value is S): Promise<S | undefined>;
  [FIND](this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<T | undefined>;
  [SOME](this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<boolean>;
  [LIMIT](this: AsyncQuerySequence<T>, n: number): AsyncQuerySequence<T>;
  [LAZY](this: AsyncQuerySequence<T>): AsyncQuerySequence<T>;
  /** Buffer at consumption, then stably sort with a synchronous value comparator. */
  [SORT](this: AsyncQuerySequence<T>, compareFn: (left: T, right: T, signal: AbortSignal | undefined) => number): AsyncQuerySequence<T>;
  [FINALIZE](
    this: AsyncQuerySequence<T>,
    finalize: (outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>,
  ): AsyncQuerySequence<T>;
  [ON_COMPLETE](this: AsyncQuerySequence<T>, complete: (signal: AbortSignal | undefined) => Awaitable<void>): AsyncQuerySequence<T>;
  [GROUP_BY]<K extends string>(
    this: AsyncQuerySequence<T>,
    keyFn: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<K>,
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

async function* normalizedEntries<T>(factory: AsyncEntrySourceFactory<T>, signal?: AbortSignal): AsyncGenerator<Entry<Awaited<T>>> {
  const source = await waitFor(() => factory(signal), signal);
  const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  let exhausted = false;
  let failed = false;
  try {
    while (true) {
      const next = await waitFor(() => iterator.next(), signal);
      if (next.done) {
        exhausted = true;
        return;
      }
      const entry = next.value;
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
        throw new TypeError("Query entries must be two-element arrays with string keys");
      }
      yield [entry[0], await waitFor(() => entry[1], signal)];
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
          const closing = Promise.resolve(close.call(iterator));
          if (signal?.aborted) {
            // Non-cooperative pending next() can keep an async generator's return queued.
            // Attempt closure now, but cancellation must not wait for that external work.
            closing.then(() => {}, () => {});
          } else {
            await closing;
          }
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
  signal?: AbortSignal,
): AsyncGenerator<Entry<Awaited<T>>> {
  if (policy === "last") {
    const entries = new Map<string, Awaited<T>>();
    for await (const [key, value] of normalizedEntries(factory, signal)) {
      entries.set(key, value);
    }
    yield* entries;
    return;
  }
  const seen = new Set<string>();
  for await (const entry of normalizedEntries(factory, signal)) {
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
  fn: (value: T, key: string, signal: AbortSignal | undefined) => U,
  signal?: AbortSignal,
): AsyncGenerator<Entry<Awaited<U>>> {
  for await (const [key, value] of source) {
    yield [key, await waitFor(() => fn(value, key, signal), signal)];
  }
}

async function* filterEntries<T>(
  source: AsyncIterable<Entry<T>>,
  predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>,
  signal?: AbortSignal,
): AsyncGenerator<Entry<T>> {
  for await (const entry of source) {
    if (await waitFor(() => predicate(entry[1], entry[0], signal), signal)) {
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
  compareFn: (left: T, right: T, signal: AbortSignal | undefined) => number,
  signal?: AbortSignal,
): AsyncGenerator<Entry<T>> {
  const entries = await collectEntries(source);
  yield* entries.sort((left, right) => {
    signal?.throwIfAborted();
    return compareFn(left[1], right[1], signal);
  });
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

async function* snapshotEntries<T>(entries: ReadonlyArray<Entry<T>>, signal?: AbortSignal): AsyncGenerator<Entry<T>> {
  for (const entry of entries) {
    signal?.throwIfAborted();
    yield entry;
  }
}

type SequenceConstructor = new <T>(source: AsyncIterable<Entry<T>>, signal?: AbortSignal) => AsyncQuerySequence<T>;
let sequenceConstructor: SequenceConstructor | undefined;

function sequence<T>(source: AsyncIterable<Entry<T>>, signal?: AbortSignal): AsyncQuerySequence<T> {
  sequenceConstructor ??= createSequenceConstructor();
  return new sequenceConstructor(source, signal);
}

// Delay computed Symbol keys until a factory call: index.ts reexports this module.
function createSequenceConstructor(): SequenceConstructor {
  class Sequence<T> implements AsyncQuerySequence<T> {
    constructor(private readonly source: AsyncIterable<Entry<T>>, private readonly signal?: AbortSignal) {}

    [ITERATE](): AsyncIterable<Entry<T>> {
      return this.source;
    }
    [MAP]<U>(fn: (value: T, key: string, signal: AbortSignal | undefined) => U): AsyncQuerySequence<Awaited<U>> {
      return sequence(defer(mapEntries, this.source, fn, this.signal), this.signal);
    }
    [MAP_CONCURRENT]<U>(
      fn: (value: T, key: string, signal: AbortSignal) => U,
      options: ConcurrentMapOptions,
    ): AsyncQuerySequence<Awaited<U>> {
      return sequence(defer(concurrentEntries, this.source, fn, concurrentMapOptions(options), this.signal), this.signal);
    }
    [WHERE]<S extends T>(predicate: (value: T, key: string, signal: AbortSignal | undefined) => value is S): AsyncQuerySequence<S>;
    [WHERE](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): AsyncQuerySequence<T>;
    [WHERE](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): AsyncQuerySequence<T> {
      return sequence(defer(filterEntries, this.source, predicate, this.signal), this.signal);
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
    [FIND]<S extends T>(predicate: (value: T, key: string, signal: AbortSignal | undefined) => value is S): Promise<S | undefined>;
    [FIND](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<T | undefined>;
    async [FIND](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<T | undefined> {
      for await (const [key, value] of this.source) {
        if (await waitFor(() => predicate(value, key, this.signal), this.signal)) {
          return value;
        }
      }
      return undefined;
    }
    async [SOME](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<boolean> {
      for await (const [key, value] of this.source) {
        if (await waitFor(() => predicate(value, key, this.signal), this.signal)) {
          return true;
        }
      }
      return false;
    }
    [LIMIT](n: number): AsyncQuerySequence<T> {
      return sequence(defer(limitEntries, this.source, n), this.signal);
    }
    [LAZY](): AsyncQuerySequence<T> {
      return sequence(this.source, this.signal);
    }
    [SORT](compareFn: (left: T, right: T, signal: AbortSignal | undefined) => number): AsyncQuerySequence<T> {
      return sequence(defer(sortEntries, this.source, compareFn, this.signal), this.signal);
    }
    [FINALIZE](finalize: (outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>): AsyncQuerySequence<T> {
      return sequence(defer(finalizeEntries, this.source, finalize, this.signal), this.signal);
    }
    [ON_COMPLETE](complete: (signal: AbortSignal | undefined) => Awaitable<void>): AsyncQuerySequence<T> {
      return sequence(defer(completeEntries, this.source, complete, this.signal), this.signal);
    }
    async [GROUP_BY]<K extends string>(
      keyFn: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<K>,
    ): Promise<Partial<Record<K, AsyncQuerySequence<T>>>> {
      const entries = new Map<K, Entry<T>[]>();
      for await (const entry of this.source) {
        const key = await waitFor(() => keyFn(entry[1], entry[0], this.signal), this.signal);
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
        groups[key] = sequence(defer(snapshotEntries, group, this.signal), this.signal);
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
      return sequence(defer(checkedEntries, factory, policy, options.signal), options.signal);
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
