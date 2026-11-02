type Entry<T> = readonly [string, T];
type Sink<T> = (value: T, key: string) => void;
type Compile<S, T> = (emit: Sink<T>) => Sink<S>;

// Store shared generators and arguments instead of a closure per deferred operation.
class Deferred<T, A extends unknown[]> implements Iterable<T> {
  constructor(
    private readonly generate: (...args: A) => Iterable<T>,
    private readonly args: A,
  ) {}
  [Symbol.iterator](): Iterator<T> {
    return this.generate(...this.args)[Symbol.iterator]();
  }
}

/**
 * @description Defers generator invocation until iteration and invokes it anew for each iterator, without caching output.
 * @param {(...args: A) => Iterable<T>} generate - Creates the iterable from the captured arguments.
 * @param {A} args - Arguments passed unchanged on each iteration.
 * @returns {Iterable<T>} Repeatable invocation wrapper; underlying repeatability depends on generate.
 * @example
 * ```ts
 * const values = defer(function* (n: number) { yield n; }, 3);
 * [...values]; // [3]
 * ```
 */
export function defer<T, A extends unknown[]>(generate: (...args: A) => Iterable<T>, ...args: A): Iterable<T> {
  return new Deferred(generate, args);
}

/**
 * @description Streams entries accepted by a predicate, preserving original tuples, keys, and source order.
 * @param {Iterable<Entry<T>>} source - Keyed entries to test on demand.
 * @param {(value: T, key: string) => boolean} predicate - Tests each value and original key once when visited.
 * @returns {Generator<Entry<T>>} Accepted original entries.
 * @example
 * ```ts
 * [...filterEntries([["a", 1], ["b", 2]], n => n > 1)]; // [["b", 2]]
 * ```
 */
export function* filterEntries<T>(
  source: Iterable<Entry<T>>,
  predicate: (value: T, key: string) => boolean,
): Generator<Entry<T>> {
  for (const entry of source) {
    if (predicate(entry[1], entry[0])) {
      yield entry;
    }
  }
}

/**
 * @description Transforms each value on demand while retaining its original key and position.
 * @param {Iterable<Entry<T>>} source - Keyed values to transform.
 * @param {(value: T, key: string) => U} fn - Maps each visited value with its original key.
 * @returns {Generator<Entry<U>>} Fresh tuples containing unchanged keys and mapped values.
 * @example
 * ```ts
 * [...mapEntries([["a", 2]], (n, key) => `${key}:${n}`)]; // [["a", "a:2"]]
 * ```
 */
export function* mapEntries<T, U>(
  source: Iterable<Entry<T>>,
  fn: (value: T, key: string) => U,
): Generator<Entry<U>> {
  for (const entry of source) {
    const key = entry[0];
    yield [key, fn(entry[1], key)];
  }
}

function* fusedEntries<S, T>(source: Iterable<Entry<S>>, compile: Compile<S, T>): Generator<Entry<T>> {
  // Only this library-owned tuple signals emission; payloads are never control values.
  let output: Entry<T> | undefined;
  const consume = compile((value, key) => { output = [key, value]; });
  for (const entry of source) {
    output = undefined;
    consume(entry[1], entry[0]);
    if (output !== undefined) {
      yield output;
    }
  }
}

interface Fused<T> extends Iterable<Entry<T>> {
  where(predicate: (value: T, key: string) => boolean): Fused<T>;
  map<U>(fn: (value: T, key: string) => U): Fused<U>;
}

// S stays captured in this implementation; callers need only the output type T.
class Plan<S, T> implements Fused<T> {
  constructor(
    private readonly source: Iterable<Entry<S>>,
    private readonly compile: Compile<S, T>,
    private readonly single?: Iterable<Entry<T>>,
  ) {}

  [Symbol.iterator](): Iterator<Entry<T>> {
    return (this.single ?? fusedEntries(this.source, this.compile))[Symbol.iterator]();
  }

  where(predicate: (value: T, key: string) => boolean): Fused<T> {
    const { source, compile } = this;
    return new Plan(source, emit => compile((value, key) => {
      if (predicate(value, key)) {
        emit(value, key);
      }
    }));
  }

  map<U>(fn: (value: T, key: string) => U): Fused<U> {
    const { source, compile } = this;
    return new Plan(source, emit => compile((value, key) => emit(fn(value, key), key)));
  }
}

function isFused<T>(source: Iterable<Entry<T>>): source is Fused<T> {
  return source instanceof Plan;
}

/**
 * @description Adds a deferred filtering stage, composing with an existing fused plan when possible. Each iteration has independent state and preserves per-entry callback order.
 * @param {Iterable<Entry<T>>} source - Source entries or an existing fused plan.
 * @param {(value: T, key: string) => boolean} predicate - Tests values reaching this stage with original keys.
 * @returns {Iterable<Entry<T>>} Lazy accepted entries without memoization.
 * @example
 * ```ts
 * const kept = fuseWhere(fuseMap([["a", 2]], n => n * 2), n => n > 3);
 * [...kept]; // [["a", 4]]
 * ```
 */
export function fuseWhere<T>(
  source: Iterable<Entry<T>>,
  predicate: (value: T, key: string) => boolean,
): Iterable<Entry<T>> {
  if (isFused(source)) {
    return source.where(predicate);
  }
  return new Plan(source, emit => (value, key) => {
    if (predicate(value, key)) {
      emit(value, key);
    }
  }, defer(filterEntries, source, predicate));
}

/**
 * @description Adds a deferred mapping stage, composing adjacent fused stages without inspecting mapped payloads or treating undefined as absence.
 * @param {Iterable<Entry<T>>} source - Source entries or an existing fused plan.
 * @param {(value: T, key: string) => U} fn - Maps values reaching this stage with their original keys.
 * @returns {Iterable<Entry<U>>} Lazy mapped entries, recomputed independently on each iteration.
 * @example
 * ```ts
 * [...fuseMap(fuseWhere([["a", 2], ["b", 0]], n => n > 0), n => String(n))]; // [["a", "2"]]
 * ```
 */
export function fuseMap<T, U>(
  source: Iterable<Entry<T>>,
  fn: (value: T, key: string) => U,
): Iterable<Entry<U>> {
  if (isFused(source)) {
    return source.map(fn);
  }
  return new Plan(source, emit => (value, key) => emit(fn(value, key), key), defer(mapEntries, source, fn));
}
