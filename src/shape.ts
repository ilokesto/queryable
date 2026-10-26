import { COUNT, ENTRIES, FIRST, MAP, PICK, TO_OBJECT, VALUES, WHERE } from "./index.js";

/** A union of correlated, readonly tuples for the string keys of a shape. */
export type ShapeEntry<S extends object> = {
  [K in keyof S & string]-?: readonly [K, S[K]];
}[keyof S & string];

/** A shallow readonly snapshot. Every key may be absent; no nonempty claim is made. */
export type ShapeQueryable<S extends object> = ShapeSnapshot<ShapeEntry<S>>;
export type { ShapeSnapshot };

type Entry = readonly [string, unknown];
type ShapeObject<E extends Entry> = Readonly<{ [P in E as P[0]]?: P[1] }>;

interface ShapeMethods<E extends Entry> {
  [COUNT](this: ShapeSnapshot<E>): number;
  [FIRST](this: ShapeSnapshot<E>): E[1] | undefined;
  [VALUES](this: ShapeSnapshot<E>): ReadonlyArray<E[1]>;
  [ENTRIES](this: ShapeSnapshot<E>): ReadonlyArray<E>;
  [TO_OBJECT](this: ShapeSnapshot<E>): ShapeObject<E>;
  [PICK]<K extends string>(this: ShapeSnapshot<E>, ...keys: K[]): ShapeSnapshot<E & readonly [K, unknown]>;
  [MAP]<U>(this: ShapeSnapshot<E>, fn: (value: E[1], key: E[0]) => U): ShapeSnapshot<readonly [E[0], U]>;
  [WHERE]<V extends E[1]>(
    this: ShapeSnapshot<E>,
    predicate: (value: E[1], key: E[0]) => value is V,
  ): ShapeSnapshot<E & readonly [string, V]>;
  [WHERE](this: ShapeSnapshot<E>, predicate: (value: E[1], key: E[0]) => boolean): ShapeSnapshot<E>;
}

interface ShapeSnapshot<E extends Entry> extends Readonly<ShapeMethods<E>> {}
class ShapeSnapshot<E extends Entry> {
  readonly #entries: ReadonlyArray<E>;

  constructor(entries: ReadonlyArray<E>) {
    this.#entries = Object.freeze([...entries]);
    // Initialize once, after the root module's Symbols exist. All instances and
    // chains share these unbound methods, including across different shapes.
    if (!Object.isFrozen(ShapeSnapshot.prototype)) {
      const methods: ShapeMethods<E> = {
        [COUNT]: this.count,
        [FIRST]: this.first,
        [VALUES]: this.values,
        [ENTRIES]: this.entries,
        [TO_OBJECT]: this.toObject,
        [PICK]: this.pick,
        [MAP]: this.map,
        [WHERE]: this.where,
      };
      Object.assign(ShapeSnapshot.prototype, methods);
      Object.freeze(ShapeSnapshot.prototype);
    }
    Object.freeze(this);
  }

  private count(this: ShapeSnapshot<E>): number {
    return this.#entries.length;
  }

  private first(this: ShapeSnapshot<E>): E[1] | undefined {
    return this.#entries[0]?.[1];
  }

  private values(this: ShapeSnapshot<E>): ReadonlyArray<E[1]> {
    return Object.freeze(this.#entries.map(entry => entry[1]));
  }

  /** Return a fresh frozen array of shared frozen tuples, with shallow values. */
  private entries(this: ShapeSnapshot<E>): ReadonlyArray<E> {
    return Object.freeze([...this.#entries]);
  }

  private toObject(this: ShapeSnapshot<E>): ShapeObject<E>;
  private toObject(this: ShapeSnapshot<E>): Readonly<Record<string, unknown>> {
    // Entries are unique and keep their key/value pair; absent keys stay absent.
    return Object.freeze(Object.fromEntries(this.#entries));
  }

  private pick<K extends string>(this: ShapeSnapshot<E>, ...keys: K[]): ShapeSnapshot<E & readonly [K, unknown]> {
    const requested = new Set<string>(keys);
    const entries = this.#entries.filter(
      (entry): entry is E & readonly [K, unknown] => requested.has(entry[0]),
    );
    const byKey = new Map<string, E & readonly [K, unknown]>(
      entries.map(entry => [entry[0], entry]),
    );
    const picked: Array<E & readonly [K, unknown]> = [];
    // Object ordering handles integer-index keys, duplicates, and special keys.
    for (const key of Object.keys(Object.fromEntries(keys.map(key => [key, true])))) {
      const entry = byKey.get(key);
      if (entry) {
        picked.push(entry);
      }
    }
    return new ShapeSnapshot(picked);
  }

  private map<U>(this: ShapeSnapshot<E>, fn: (value: E[1], key: E[0]) => U): ShapeSnapshot<readonly [E[0], U]> {
    const entries = this.#entries.map(([key, value]): readonly [E[0], U] => {
      const entry: readonly [E[0], U] = [key, fn(value, key)];
      return Object.freeze(entry);
    });
    return new ShapeSnapshot(entries);
  }

  private where<V extends E[1]>(
    this: ShapeSnapshot<E>,
    predicate: (value: E[1], key: E[0]) => value is V,
  ): ShapeSnapshot<E & readonly [string, V]>;
  private where(
    this: ShapeSnapshot<E>,
    predicate: (value: E[1], key: E[0]) => boolean,
  ): ShapeSnapshot<E>;
  private where(
    this: ShapeSnapshot<E>,
    predicate: (value: E[1], key: E[0]) => boolean,
  ): ShapeSnapshot<E> {
    return new ShapeSnapshot(this.#entries.filter(([key, value]) => predicate(value, key)));
  }
}

// Indexing by this very key preserves correlation. The overload distributes a
// union K into tuples; its implementation only reads input[key], once.
function snapshotEntry<T extends object, K extends keyof T & string>(input: T, key: K): ShapeEntry<Pick<T, K>>;
function snapshotEntry<T extends object, K extends keyof T & string>(input: T, key: K): readonly [K, T[K]] {
  const entry: readonly [K, T[K]] = [key, input[key]];
  return Object.freeze(entry);
}

/**
 * Snapshot selected own enumerable string keys, in the input's native order.
 * The explicit whitelist excludes extra properties hidden by structural typing.
 * Missing/inherited/non-enumerable keys are omitted; nested values stay shared.
 * @example createShapeQueryable({ count: 1, label: "one" }, ["count", "label"])
 */
export function createShapeQueryable<T extends object, K extends keyof T & string>(
  input: T,
  keys: ReadonlyArray<K>,
): ShapeQueryable<Pick<T, K>> {
  const selected = new Map<string, K>(keys.map(key => [key, key]));
  const entries: Array<ShapeEntry<Pick<T, K>>> = [];
  for (const key of Object.keys(input)) {
    const selectedKey = selected.get(key);
    if (selectedKey !== undefined && Object.prototype.propertyIsEnumerable.call(input, key)) {
      entries.push(snapshotEntry(input, selectedKey));
    }
  }
  return new ShapeSnapshot(entries);
}
