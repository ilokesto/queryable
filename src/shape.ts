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
  /**
   * @description Counts captured entries, including stored undefined values.
   * @returns {number} Number of present entries, or zero for an empty snapshot.
   * @example
   * const size = query[COUNT]();
   */
  [COUNT](this: ShapeSnapshot<E>): number;
  /**
   * @description Reads the first captured value without consuming or modifying the snapshot.
   * @returns {E[1] | undefined} First value or undefined when empty.
   * @example
   * const value = query[FIRST]();
   */
  [FIRST](this: ShapeSnapshot<E>): E[1] | undefined;
  /**
   * @description Extracts a fresh shallow frozen values array in snapshot order.
   * @returns {ReadonlyArray<E[1]>} Frozen values array; nested values are shared, not frozen.
   * @example
   * const values = query[VALUES]();
   */
  [VALUES](this: ShapeSnapshot<E>): ReadonlyArray<E[1]>;
  /**
   * @description Extracts a fresh frozen array sharing the snapshot's frozen tuples and shallow values.
   * @returns {ReadonlyArray<E>} Frozen entries in snapshot order.
   * @example
   * const entries = query[ENTRIES]();
   */
  [ENTRIES](this: ShapeSnapshot<E>): ReadonlyArray<E>;
  /**
   * @description Builds a fresh shallow frozen ordinary object; absent keys remain absent and special keys remain data.
   * @returns {ShapeObject<E>} Frozen record of captured entries, without cloning nested values.
   * @example
   * const record = query[TO_OBJECT]();
   */
  [TO_OBJECT](this: ShapeSnapshot<E>): ShapeObject<E>;
  /**
   * @description Selects existing keys using native object ordering of requests, ignoring absent and duplicate keys.
   * Stored undefined remains present; the original snapshot is untouched.
   * @param {K[]} keys - Requested string keys in desired order, subject to native integer-index ordering.
   * @returns {ShapeSnapshot<E & readonly [K, unknown]>} Shallow frozen snapshot of present requested keys.
   * @example
   * const selected = query[PICK]("label", "count", "label");
   */
  [PICK]<K extends string>(this: ShapeSnapshot<E>, ...keys: K[]): ShapeSnapshot<E & readonly [K, unknown]>;
  /**
   * @description Eagerly maps values once in snapshot order, preserving original keys and thrown-value identity.
   * @param {(value: E[1], key: E[0]) => U} fn - Mapper receiving each stored value and its original string key.
   * @returns {ShapeSnapshot<readonly [E[0], U]>} New shallow frozen snapshot with mapped values.
   * @example
   * const labeled = query[MAP]((value, key) => `${key}:${value}`);
   */
  [MAP]<U>(this: ShapeSnapshot<E>, fn: (value: E[1], key: E[0]) => U): ShapeSnapshot<readonly [E[0], U]>;
  /**
   * @description Eagerly filters in snapshot order, preserving tuples and original keys.
   * Explicit type guards narrow values; empty snapshots never invoke the callback.
   * @param {(value: E[1], key: E[0]) => boolean} predicate - Test receiving stored value and original string key; failures propagate unchanged.
   * @returns {ShapeSnapshot<E>} New shallow frozen snapshot retaining matching entries.
   * @example
   * const numbers = query[WHERE]((value): value is number => typeof value === "number");
   */
  [WHERE]<V extends E[1]>(
    this: ShapeSnapshot<E>,
    predicate: (value: E[1], key: E[0]) => value is V,
  ): ShapeSnapshot<E & readonly [string, V]>;
  /** Eagerly filters in snapshot order; callback failures propagate unchanged. */
  [WHERE](this: ShapeSnapshot<E>, predicate: (value: E[1], key: E[0]) => boolean): ShapeSnapshot<E>;
}

/** Readonly Symbol operations shared by shallow frozen shape snapshots. */
interface ShapeSnapshot<E extends Entry> extends Readonly<ShapeMethods<E>> {}
/**
 * @description Stores a shallow frozen entry snapshot and shares frozen Symbol-keyed operations.
 * Nested values remain shared; subsequent caller property replacement does not change the snapshot.
 * @example
 * const query = createShapeQueryable({ count: 1 }, ["count"]);
 * const count = query[COUNT]();
 */
class ShapeSnapshot<E extends Entry> {
  readonly #entries: ReadonlyArray<E>;

  /**
   * @description Copies and freezes the entry array, then freezes this snapshot without cloning values.
   * Entries supplied by the shape factory and transforms are already frozen tuples.
   * @param {ReadonlyArray<E>} entries - Key/value tuples to capture in their current order.
   * @example
   * const snapshot = createShapeQueryable({ count: 1 }, ["count"]);
   */
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

  /**
   * @description Counts captured entries, including stored undefined values.
   * @returns {number} Number of present entries, or zero for an empty snapshot.
   * @example
   * const size = query[COUNT]();
   */
  private count(this: ShapeSnapshot<E>): number {
    return this.#entries.length;
  }

  /**
   * @description Reads the first captured value without consuming or modifying the snapshot.
   * @returns {E[1] | undefined} First value or undefined when empty.
   * @example
   * const value = query[FIRST]();
   */
  private first(this: ShapeSnapshot<E>): E[1] | undefined {
    return this.#entries[0]?.[1];
  }

  /**
   * @description Extracts a fresh shallow frozen values array in snapshot order.
   * @returns {ReadonlyArray<E[1]>} Frozen values array; nested values are shared, not frozen.
   * @example
   * const values = query[VALUES]();
   */
  private values(this: ShapeSnapshot<E>): ReadonlyArray<E[1]> {
    return Object.freeze(this.#entries.map(entry => entry[1]));
  }

  /**
   * @description Extracts a fresh frozen array sharing the snapshot's frozen tuples and shallow values.
   * @returns {ReadonlyArray<E>} Frozen entries in snapshot order.
   * @example
   * const entries = query[ENTRIES]();
   */
  private entries(this: ShapeSnapshot<E>): ReadonlyArray<E> {
    return Object.freeze([...this.#entries]);
  }

  private toObject(this: ShapeSnapshot<E>): ShapeObject<E>;
  /**
   * @description Builds a fresh shallow frozen ordinary object; absent keys remain absent and special keys remain data.
   * @returns {ShapeObject<E>} Frozen record of captured entries, without cloning nested values.
   * @example
   * const record = query[TO_OBJECT]();
   */
  private toObject(this: ShapeSnapshot<E>): Readonly<Record<string, unknown>> {
    // Entries are unique and keep their key/value pair; absent keys stay absent.
    return Object.freeze(Object.fromEntries(this.#entries));
  }

  /**
   * @description Selects existing keys using native object ordering of requests, ignoring absent and duplicate keys.
   * Stored undefined remains present; the original snapshot is untouched.
   * @param {K[]} keys - Requested string keys in desired order, subject to native integer-index ordering.
   * @returns {ShapeSnapshot<E & readonly [K, unknown]>} Shallow frozen snapshot of present requested keys.
   * @example
   * const selected = query[PICK]("label", "count", "label");
   */
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

  /**
   * @description Eagerly maps values once in snapshot order, preserving original keys and thrown-value identity.
   * @param {(value: E[1], key: E[0]) => U} fn - Mapper receiving each stored value and its original string key.
   * @returns {ShapeSnapshot<readonly [E[0], U]>} New shallow frozen snapshot with mapped values.
   * @example
   * const labeled = query[MAP]((value, key) => `${key}:${value}`);
   */
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
  /**
   * @description Eagerly filters in snapshot order, preserving tuples and original keys.
   * Explicit type guards narrow values; empty snapshots never invoke the callback.
   * @param {(value: E[1], key: E[0]) => boolean} predicate - Test receiving stored value and original string key; failures propagate unchanged.
   * @returns {ShapeSnapshot<E>} New shallow frozen snapshot retaining matching entries.
   * @example
   * const numbers = query[WHERE]((value): value is number => typeof value === "number");
   */
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
 * @description Snapshots selected own enumerable string keys, in the input's native order.
 * The explicit whitelist excludes extra properties hidden by structural typing.
 * Missing/inherited/non-enumerable keys are omitted; nested values stay shared.
 * Selected getters are evaluated once; repeated reads use the captured values.
 * @param {T} input - Object whose selected values are captured shallowly.
 * @param {ReadonlyArray<K>} keys - Explicit whitelist; duplicates, missing, inherited, non-enumerable, and symbol keys add no entries.
 * @returns {ShapeQueryable<Pick<T, K>>} Shallow frozen snapshot with shared Symbol operations and possibly absent keys.
 * @example
 * const query = createShapeQueryable({ count: 1, label: "one" }, ["count", "label"]);
 * const entries = query[ENTRIES]();
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
