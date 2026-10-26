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

export function defer<T, A extends unknown[]>(generate: (...args: A) => Iterable<T>, ...args: A): Iterable<T> {
  return new Deferred(generate, args);
}

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

export function* mapEntries<T, U>(
  source: Iterable<Entry<T>>,
  fn: (value: T, key: string) => U,
): Generator<Entry<U>> {
  for (const [key, value] of source) {
    yield [key, fn(value, key)];
  }
}

function* fusedEntries<S, T>(source: Iterable<Entry<S>>, compile: Compile<S, T>): Generator<Entry<T>> {
  // Only this library-owned tuple signals emission; payloads are never control values.
  let output: Entry<T> | undefined;
  const consume = compile((value, key) => { output = [key, value]; });
  for (const [key, value] of source) {
    output = undefined;
    consume(value, key);
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

export function fuseMap<T, U>(
  source: Iterable<Entry<T>>,
  fn: (value: T, key: string) => U,
): Iterable<Entry<U>> {
  if (isFused(source)) {
    return source.map(fn);
  }
  return new Plan(source, emit => (value, key) => emit(fn(value, key), key), defer(mapEntries, source, fn));
}
