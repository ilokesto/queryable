import { DuplicateKeyError } from "./entries.js";
import type { KeyCollisionPolicy } from "./entries.js";
import { FINALIZE, ON_COMPLETE, completeEntries, finalizeEntries, waitFor } from "./lifetime.js";
import type { ConsumptionOutcome } from "./lifetime.js";
import { MAP_CONCURRENT, concurrentEntries, concurrentMapOptions } from "./concurrency.js";
import type { ConcurrentMapOptions } from "./concurrency.js";
import { FALLBACK, fallbackEntries } from "./recovery.js";
import type { AsyncFallbackFactory } from "./recovery.js";
import { COUNT, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP, SOME, SORT, VALUES, WHERE } from "./core-symbols.js";

type Entry<T> = readonly [string, T];
type Awaitable<T> = T | PromiseLike<T>;
type EntrySource<T> = Iterable<Entry<T>> | AsyncIterable<Entry<T>>;

/** Each consumption requests a fresh iterator or repeatable iterable. */
export type AsyncEntrySourceFactory<T> = (signal?: AbortSignal) => Awaitable<EntrySource<T>>;

/** Key identity follows the synchronous factory's error/first/last policies. */
export interface AsyncQuerySequenceOptions {
  /** Defaults to error; first streams first occurrences, last buffers all entries in first-key order. */
  readonly duplicateKeys?: KeyCollisionPolicy;
  /** Configured cancellation forwarded to factories and callbacks; rejection preserves signal.reason. */
  readonly signal?: AbortSignal;
}

const ITERATE = Symbol("asyncIterate");

/**
 * Deferred, sequential query over awaited values. Use explicit async iterable views.
 * Terminal methods return Promises; GROUP_BY starts eager snapshot materialization.
 */
export interface AsyncQuerySequence<T> {
  /** Internal entry view used by adapters, not a public iteration Symbol. */
  [ITERATE](): AsyncIterable<Entry<T>>;
  /**
   * @description Defers sequential mapping; each result is awaited before the next input is pulled.
   * @param {(value: T, key: string, signal: AbortSignal | undefined) => U} fn - Mapper receiving value, original key, and configured signal.
   * @returns {AsyncQuerySequence<Awaited<U>>} Live mapped query preserving keys and input order.
   * @example
   * const doubled = query[MAP](async value => value * 2);
   */
  [MAP]<U>(this: AsyncQuerySequence<T>, fn: (value: T, key: string, signal: AbortSignal | undefined) => U): AsyncQuerySequence<Awaited<U>>;
  /**
   * @description Validates and snapshots budgets now, then maps on consumption with a fresh child signal.
   * Failure or termination aborts that child and closes upstream while observing late rejections.
   * @param {(value: T, key: string, signal: AbortSignal) => U} fn - Mapper receiving original key and child signal.
   * @param {ConcurrentMapOptions} options - Independent work and buffering budgets.
   * @param {number} options.concurrency - Positive safe-integer maximum running callbacks.
   * @param {number} [options.prefetch] - Positive safe-integer input budget including a pending pull; defaults to 1.
   * @param {number} [options.reorderBuffer] - Extra result reservations; defaults to concurrency minus one.
   * @param {boolean} [options.ordered] - True by default; false emits observed completion order.
   * @returns {AsyncQuerySequence<Awaited<U>>} Deferred bounded mapping with awaited values and retained keys.
   * @example
   * const mapped = query[MAP_CONCURRENT](async value => value * 2, { concurrency: 4 });
   */
  [MAP_CONCURRENT]<U>(
    this: AsyncQuerySequence<T>,
    fn: (value: T, key: string, signal: AbortSignal) => U,
    options: ConcurrentMapOptions,
  ): AsyncQuerySequence<Awaited<U>>;
  /**
   * @description Defers filtering in source order, awaiting each predicate; explicit synchronous guards narrow the result type.
   * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>} predicate - Test receiving value, original key, and configured signal.
   * @returns {AsyncQuerySequence<T>} Live view retaining matching entries and their keys.
   * @example
   * const positive = query[WHERE](async value => value > 0);
   */
  [WHERE]<S extends T>(this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => value is S): AsyncQuerySequence<S>;
  /** Awaits each predicate in source order and retains truthy matches. */
  [WHERE](this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): AsyncQuerySequence<T>;
  /**
   * @description Consumes every entry and counts stored undefined values as present.
   * @returns {Promise<number>} Entry count, or zero for empty input.
   * @example
   * const count = await query[COUNT]();
   */
  [COUNT](this: AsyncQuerySequence<T>): Promise<number>;
  /**
   * @description Returns the first value and closes upstream without pulling another entry.
   * @returns {Promise<T | undefined>} First value, or undefined for empty input.
   * @example
   * const first = await query[FIRST]();
   */
  [FIRST](this: AsyncQuerySequence<T>): Promise<T | undefined>;
  /**
   * @description Fully consumes the source into a fresh mutable array in emission order.
   * @returns {Promise<T[]>} Collected values, including stored undefined; empty input yields a fresh empty array.
   * @example
   * const values = await query[VALUES]();
   */
  [VALUES](this: AsyncQuerySequence<T>): Promise<T[]>;
  /**
   * @description Fully consumes the source into fresh mutable key/value tuples.
   * @returns {Promise<[string, T][]>} Fresh array of entries in emission order.
   * @example
   * const entries = await query[ENTRIES]();
   */
  [ENTRIES](this: AsyncQuerySequence<T>): Promise<[string, T][]>;
  /**
   * @description Awaits tests sequentially until the first match, then closes upstream.
   * An explicit synchronous type guard narrows the matching value.
   * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>} predicate - Test receiving value, original key, and configured signal.
   * @returns {Promise<T | undefined>} First matching value or undefined, with no callback for empty input.
   * @example
   * const found = await query[FIND](value => value > 10);
   */
  [FIND]<S extends T>(this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => value is S): Promise<S | undefined>;
  /** Awaits predicates until the first match; empty or unmatched input returns undefined. */
  [FIND](this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<T | undefined>;
  /**
   * @description Awaits tests in source order and closes upstream on the first match.
   * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>} predicate - Test receiving value, original key, and configured signal.
   * @returns {Promise<boolean>} Whether an entry matches; empty input returns false without callback calls.
   * @example
   * const hasPositive = await query[SOME](value => value > 0);
   */
  [SOME](this: AsyncQuerySequence<T>, predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<boolean>;
  /**
   * @description Defers a prefix limit after truncating n. Finite negative limits buffer all input
   * and omit the last absolute n entries; zero, NaN, and negative infinity avoid source acquisition.
   * @param {number} n - Prefix size, negative suffix omission, or positive infinity for all entries.
   * @returns {AsyncQuerySequence<T>} Limited live view preserving keys.
   * @example
   * const firstTen = query[LIMIT](10);
   */
  [LIMIT](this: AsyncQuerySequence<T>, n: number): AsyncQuerySequence<T>;
  /**
   * @description Returns another deferred view of the same source without memoization.
   * @returns {AsyncQuerySequence<T>} Live repeatable view; each consumption executes pending work again.
   * @example
   * const live = query[LAZY]();
   */
  [LAZY](this: AsyncQuerySequence<T>): AsyncQuerySequence<T>;
  /**
   * @description Defers full buffering followed by stable synchronous value sorting.
   * @param {(left: T, right: T, signal: AbortSignal | undefined) => number} compareFn - Comparator receiving two values and the configured signal; ties preserve source order.
   * @returns {AsyncQuerySequence<T>} Sorted live view retaining original keys.
   * @example
   * const ascending = query[SORT]((left, right) => left - right);
   */
  [SORT](this: AsyncQuerySequence<T>, compareFn: (left: T, right: T, signal: AbortSignal | undefined) => number): AsyncQuerySequence<T>;
  /**
   * @description Attaches awaited cleanup to every termination of a started stage; unused stages
   * do not finalize. Cleanup failures replace success or return, never a primary failure or abort.
   * @param {(outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>} finalize - Hook receiving completion, return, error, or abort outcome and configured signal.
   * @returns {AsyncQuerySequence<T>} Deferred view with unchanged entries and lifetime cleanup.
   * @example
   * const tracked = query[FINALIZE](outcome => { log.push(outcome.reason); });
   */
  [FINALIZE](
    this: AsyncQuerySequence<T>,
    finalize: (outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>,
  ): AsyncQuerySequence<T>;
  /**
   * @description Attaches an awaited hook after normal exhaustion, including empty input;
   * early return, error, abort, and unused stages skip it.
   * @param {(signal: AbortSignal | undefined) => Awaitable<void>} complete - Hook receiving the configured signal.
   * @returns {AsyncQuerySequence<T>} Deferred view whose completion waits for the hook.
   * @example
   * const tracked = query[ON_COMPLETE](() => { completed = true; });
   */
  [ON_COMPLETE](this: AsyncQuerySequence<T>, complete: (signal: AbortSignal | undefined) => Awaitable<void>): AsyncQuerySequence<T>;
  /**
   * @description Preserves an upstream prefix and switches once after an upstream pull fails.
   * Cancellation and downstream errors never recover; duplicate policy covers both sources.
   * @param {AsyncFallbackFactory<U>} fallback - Replacement factory receiving exact failure and configured signal.
   * @param {Pick<AsyncQuerySequenceOptions, "duplicateKeys">} [options] - Combined-source identity policy.
   * @param {KeyCollisionPolicy} [options.duplicateKeys] - Error by default; first streams first occurrences, last buffers all entries.
   * @returns {AsyncQuerySequence<T | Awaited<U>>} Deferred original entries followed by normalized replacement entries.
   * @example
   * const recovered = query[FALLBACK](() => [["cached", 42]]);
   */
  [FALLBACK]<U>(
    this: AsyncQuerySequence<T>,
    fallback: AsyncFallbackFactory<U>,
    options?: Pick<AsyncQuerySequenceOptions, "duplicateKeys">,
  ): AsyncQuerySequence<T | Awaited<U>>;
  /**
   * @description Starts full materialization immediately, awaiting group keys sequentially.
   * Groups are repeatable entry snapshots with original keys; special group names remain data.
   * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<K>} keyFn - Group selector receiving value, original key, and configured signal.
   * @returns {Promise<Partial<Record<K, AsyncQuerySequence<T>>>>} Null-prototype record containing only groups observed; empty input yields no groups.
   * @example
   * const groups = await query[GROUP_BY](value => value > 0 ? "positive" : "other");
   */
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

/**
 * @description Acquires a source on first demand, validates string-keyed two-element tuples,
 * and recursively awaits values. Attempts iterator closure on failure or early return; primary
 * failures win over cleanup failures, and abort never waits for non-cooperative closure.
 * @param {AsyncEntrySourceFactory<T>} factory - Fresh synchronous or asynchronous entry source factory.
 * @param {AbortSignal} [signal] - Cancellation observed during acquisition, pulls, and value resolution.
 * @returns {AsyncGenerator<Entry<Awaited<T>>>} Normalized entries without duplicate-key enforcement.
 * @example
 * for await (const [key, value] of normalizedEntries(() => [["answer", Promise.resolve(42)]])) {
 *   console.log(key, value);
 * }
 */
export async function* normalizedEntries<T>(factory: AsyncEntrySourceFactory<T>, signal?: AbortSignal): AsyncGenerator<Entry<Awaited<T>>> {
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
    yield* snapshotEntries(entries, signal);
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
  entries.sort((left, right) => {
    signal?.throwIfAborted();
    return compareFn(left[1], right[1], signal);
  });
  yield* snapshotEntries(entries, signal);
}

async function* limitEntries<T>(source: AsyncIterable<Entry<T>>, n: number, signal?: AbortSignal): AsyncGenerator<Entry<T>> {
  const count = Number.isNaN(n) ? 0 : Math.trunc(n);
  if (count === 0 || count === -Infinity) {
    return;
  }
  if (count < 0) {
    yield* snapshotEntries((await collectEntries(source)).slice(0, count), signal);
    return;
  }
  let remaining = count;
  signal?.throwIfAborted();
  for await (const entry of source) {
    yield entry;
    signal?.throwIfAborted();
    if (--remaining === 0) {
      return;
    }
  }
}

async function* snapshotEntries<T>(entries: Iterable<Entry<T>>, signal?: AbortSignal): AsyncGenerator<Entry<T>> {
  signal?.throwIfAborted();
  for (const entry of entries) {
    signal?.throwIfAborted();
    yield entry;
  }
  signal?.throwIfAborted();
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
    /**
     * @description Captures a repeatable entry stage without acquiring an iterator.
     * @param {AsyncIterable<Entry<T>>} source - Deferred entry stage.
     * @param {AbortSignal} [signal] - Cancellation propagated through chained stages.
     * @example
     * const query = createAsyncQuerySequence(() => [["a", 1]]);
     */
    constructor(private readonly source: AsyncIterable<Entry<T>>, private readonly signal?: AbortSignal) {}

    [ITERATE](): AsyncIterable<Entry<T>> {
      return this.source;
    }
    /**
     * @description Defers sequential mapping; each result is awaited before the next input is pulled.
     * @param {(value: T, key: string, signal: AbortSignal | undefined) => U} fn - Mapper receiving value, original key, and configured signal.
     * @returns {AsyncQuerySequence<Awaited<U>>} Live mapped query preserving keys and input order.
     * @example
     * const doubled = query[MAP](async value => value * 2);
     */
    [MAP]<U>(fn: (value: T, key: string, signal: AbortSignal | undefined) => U): AsyncQuerySequence<Awaited<U>> {
      return sequence(defer(mapEntries, this.source, fn, this.signal), this.signal);
    }
    /**
     * @description Validates and snapshots budgets now, then maps on consumption with a fresh child signal.
     * Failure or termination aborts that child and closes upstream while observing late rejections.
     * @param {(value: T, key: string, signal: AbortSignal) => U} fn - Mapper receiving original key and child signal.
     * @param {ConcurrentMapOptions} options - Independent work and buffering budgets.
     * @param {number} options.concurrency - Positive safe-integer maximum running callbacks.
     * @param {number} [options.prefetch] - Positive safe-integer input budget including a pending pull; defaults to 1.
     * @param {number} [options.reorderBuffer] - Extra result reservations; defaults to concurrency minus one.
     * @param {boolean} [options.ordered] - True by default; false emits observed completion order.
     * @returns {AsyncQuerySequence<Awaited<U>>} Deferred bounded mapping with awaited values and retained keys.
     * @example
     * const mapped = query[MAP_CONCURRENT](async value => value * 2, { concurrency: 4 });
     */
    [MAP_CONCURRENT]<U>(
      fn: (value: T, key: string, signal: AbortSignal) => U,
      options: ConcurrentMapOptions,
    ): AsyncQuerySequence<Awaited<U>> {
      return sequence(defer(concurrentEntries, this.source, fn, concurrentMapOptions(options), this.signal), this.signal);
    }
    /**
     * @description Defers filtering in source order, awaiting each predicate; explicit synchronous guards narrow the result type.
     * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>} predicate - Test receiving value, original key, and configured signal.
     * @returns {AsyncQuerySequence<T>} Live view retaining matching entries and their keys.
     * @example
     * const positive = query[WHERE](async value => value > 0);
     */
    [WHERE]<S extends T>(predicate: (value: T, key: string, signal: AbortSignal | undefined) => value is S): AsyncQuerySequence<S>;
    [WHERE](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): AsyncQuerySequence<T>;
    [WHERE](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): AsyncQuerySequence<T> {
      return sequence(defer(filterEntries, this.source, predicate, this.signal), this.signal);
    }
    /**
     * @description Consumes every entry and counts stored undefined values as present.
     * @returns {Promise<number>} Entry count, or zero for empty input.
     * @example
     * const count = await query[COUNT]();
     */
    async [COUNT](): Promise<number> {
      let count = 0;
      for await (const _entry of this.source) {
        count++;
      }
      return count;
    }
    /**
     * @description Returns the first value and closes upstream without pulling another entry.
     * @returns {Promise<T | undefined>} First value, or undefined for empty input.
     * @example
     * const first = await query[FIRST]();
     */
    async [FIRST](): Promise<T | undefined> {
      for await (const [, value] of this.source) {
        return value;
      }
      return undefined;
    }
    /**
     * @description Fully consumes the source into a fresh mutable array in emission order.
     * @returns {Promise<T[]>} Collected values, including stored undefined; empty input yields a fresh empty array.
     * @example
     * const values = await query[VALUES]();
     */
    async [VALUES](): Promise<T[]> {
      const values: T[] = [];
      for await (const [, value] of this.source) {
        values.push(value);
      }
      return values;
    }
    /**
     * @description Fully consumes the source into fresh mutable key/value tuples.
     * @returns {Promise<[string, T][]>} Fresh array of entries in emission order.
     * @example
     * const entries = await query[ENTRIES]();
     */
    [ENTRIES](): Promise<[string, T][]> {
      return collectEntries(this.source);
    }
    /**
     * @description Awaits tests sequentially until the first match, then closes upstream.
     * An explicit synchronous type guard narrows the matching value.
     * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>} predicate - Test receiving value, original key, and configured signal.
     * @returns {Promise<T | undefined>} First matching value or undefined, with no callback for empty input.
     * @example
     * const found = await query[FIND](value => value > 10);
     */
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
    /**
     * @description Awaits tests in source order and closes upstream on the first match.
     * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>} predicate - Test receiving value, original key, and configured signal.
     * @returns {Promise<boolean>} Whether an entry matches; empty input returns false without callback calls.
     * @example
     * const hasPositive = await query[SOME](value => value > 0);
     */
    async [SOME](predicate: (value: T, key: string, signal: AbortSignal | undefined) => Awaitable<boolean>): Promise<boolean> {
      for await (const [key, value] of this.source) {
        if (await waitFor(() => predicate(value, key, this.signal), this.signal)) {
          return true;
        }
      }
      return false;
    }
    /**
     * @description Defers a prefix limit after truncating n. Finite negative limits buffer all input
     * and omit the last absolute n entries; zero, NaN, and negative infinity avoid source acquisition.
     * @param {number} n - Prefix size, negative suffix omission, or positive infinity for all entries.
     * @returns {AsyncQuerySequence<T>} Limited live view preserving keys.
     * @example
     * const firstTen = query[LIMIT](10);
     */
    [LIMIT](n: number): AsyncQuerySequence<T> {
      return sequence(defer(limitEntries, this.source, n, this.signal), this.signal);
    }
    /**
     * @description Returns another deferred view of the same source without memoization.
     * @returns {AsyncQuerySequence<T>} Live repeatable view; each consumption executes pending work again.
     * @example
     * const live = query[LAZY]();
     */
    [LAZY](): AsyncQuerySequence<T> {
      return sequence(this.source, this.signal);
    }
    /**
     * @description Defers full buffering followed by stable synchronous value sorting.
     * @param {(left: T, right: T, signal: AbortSignal | undefined) => number} compareFn - Comparator receiving two values and the configured signal; ties preserve source order.
     * @returns {AsyncQuerySequence<T>} Sorted live view retaining original keys.
     * @example
     * const ascending = query[SORT]((left, right) => left - right);
     */
    [SORT](compareFn: (left: T, right: T, signal: AbortSignal | undefined) => number): AsyncQuerySequence<T> {
      return sequence(defer(sortEntries, this.source, compareFn, this.signal), this.signal);
    }
    /**
     * @description Attaches awaited cleanup to every termination of a started stage; unused stages
     * do not finalize. Cleanup failures replace success or return, never a primary failure or abort.
     * @param {(outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>} finalize - Hook receiving completion, return, error, or abort outcome and configured signal.
     * @returns {AsyncQuerySequence<T>} Deferred view with unchanged entries and lifetime cleanup.
     * @example
     * const tracked = query[FINALIZE](outcome => { log.push(outcome.reason); });
     */
    [FINALIZE](finalize: (outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>): AsyncQuerySequence<T> {
      return sequence(defer(finalizeEntries, this.source, finalize, this.signal), this.signal);
    }
    /**
     * @description Attaches an awaited hook after normal exhaustion, including empty input;
     * early return, error, abort, and unused stages skip it.
     * @param {(signal: AbortSignal | undefined) => Awaitable<void>} complete - Hook receiving the configured signal.
     * @returns {AsyncQuerySequence<T>} Deferred view whose completion waits for the hook.
     * @example
     * const tracked = query[ON_COMPLETE](() => { completed = true; });
     */
    [ON_COMPLETE](complete: (signal: AbortSignal | undefined) => Awaitable<void>): AsyncQuerySequence<T> {
      return sequence(defer(completeEntries, this.source, complete, this.signal), this.signal);
    }
    /**
     * @description Preserves an upstream prefix and switches once after an upstream pull fails.
     * Cancellation and downstream errors never recover; duplicate policy covers both sources.
     * @param {AsyncFallbackFactory<U>} fallback - Replacement factory receiving exact failure and configured signal.
     * @param {Pick<AsyncQuerySequenceOptions, "duplicateKeys">} [options] - Combined-source identity policy.
     * @param {KeyCollisionPolicy} [options.duplicateKeys] - Error by default; first streams first occurrences, last buffers all entries.
     * @returns {AsyncQuerySequence<T | Awaited<U>>} Deferred original entries followed by normalized replacement entries.
     * @example
     * const recovered = query[FALLBACK](() => [["cached", 42]]);
     */
    [FALLBACK]<U>(
      fallback: AsyncFallbackFactory<U>,
      options: Pick<AsyncQuerySequenceOptions, "duplicateKeys"> = {},
    ): AsyncQuerySequence<T | Awaited<U>> {
      const policy = options.duplicateKeys ?? "error";
      if (policy !== "error" && policy !== "first" && policy !== "last") {
        throw new TypeError(`Unsupported duplicate key policy: ${String(policy)}`);
      }
      return sequence(
        defer(checkedEntries, () => defer(fallbackEntries, this.source, fallback, this.signal), policy, this.signal),
        this.signal,
      );
    }
    /**
     * @description Starts full materialization immediately, awaiting group keys sequentially.
     * Groups are repeatable entry snapshots with original keys; special group names remain data.
     * @param {(value: T, key: string, signal: AbortSignal | undefined) => Awaitable<K>} keyFn - Group selector receiving value, original key, and configured signal.
     * @returns {Promise<Partial<Record<K, AsyncQuerySequence<T>>>>} Null-prototype record containing only groups observed; empty input yields no groups.
     * @example
     * const groups = await query[GROUP_BY](value => value > 0 ? "positive" : "other");
     */
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
 * @description Creates a live repeatable async sequence without acquiring a source until demand.
 * Source and mapped PromiseLike values are recursively awaited, not treated as opaque payloads.
 * Each consumption requests fresh iteration; no results are cached. Invalid policies throw immediately.
 * @param {AsyncEntrySourceFactory<T>} factory - Acquires a fresh cursor or repeatable iterable per consumption, receiving the configured signal.
 * @param {AsyncQuerySequenceOptions} [options] - Key identity and cancellation settings.
 * @param {KeyCollisionPolicy} [options.duplicateKeys] - Error by default; first streams first occurrences, last buffers the entire source and keeps last values in first-key order.
 * @param {AbortSignal} [options.signal] - Cancellation observed during acquisition, pulls, callbacks, and buffered emission, preserving its reason.
 * @returns {AsyncQuerySequence<Awaited<T>>} Deferred sequential query with explicit async entry/value views and Promise-returning terminals.
 * @example
 * const query = createAsyncQuerySequence(() => [["answer", Promise.resolve(42)]]);
 * const values = await query[MAP](value => value + 1)[VALUES]();
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

/**
 * @description Creates a repeatable async entry view without starting consumption.
 * Each cursor is independent and yields fresh mutable tuples; breaking closes that cursor's upstream.
 * @param {AsyncQuerySequence<T>} query - Query whose pending work runs independently for each iterator.
 * @returns {AsyncIterable<[string, T]>} Deferred async entry view retaining keys and awaited values.
 * @example
 * for await (const [key, value] of iterateAsyncEntries(query)) {
 *   consume(key, value);
 * }
 */
export function iterateAsyncEntries<T>(query: AsyncQuerySequence<T>): AsyncIterable<[string, T]> {
  return defer(entryView, query);
}

/**
 * @description Creates a repeatable async value view with independent cursors and no cross-consumption cache.
 * A consumer break closes the upstream iterator.
 * @param {AsyncQuerySequence<T>} query - Query whose pending work executes per consumption.
 * @returns {AsyncIterable<Awaited<T>>} Deferred async view of awaited values in query emission order.
 * @example
 * for await (const value of iterateAsyncValues(query)) {
 *   consume(value);
 * }
 */
export function iterateAsyncValues<T>(query: AsyncQuerySequence<T>): AsyncIterable<Awaited<T>> {
  return defer(valueView, query);
}
