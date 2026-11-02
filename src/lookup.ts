/** Read the last value in query order, or undefined. */
export const LAST = Symbol("last");
/** Read a relative index, with Array.at number coercion. */
export const AT = Symbol("at");
/** Read the only matching value; throw RangeError on a second match. */
export const SINGLE = Symbol("single");
/** Test all entries; an empty query returns true. */
export const EVERY = Symbol("every");
/** Test whether the query has no entries. */
export const IS_EMPTY = Symbol("is_empty");
/** Test values using SameValueZero equality. */
export const INCLUDES = Symbol("includes");
/** Find a matching value and return a fresh key/value tuple. */
export const FIND_ENTRY = Symbol("find_entry");
/** Read the first value, using a fallback only when no entry exists. */
export const FIRST_OR = Symbol("first_or");
/** Read the first value, calling a fallback only when no entry exists. */
export const FIRST_OR_ELSE = Symbol("first_or_else");

type Entries<T> = Iterable<readonly [string, T]>;

/** Short-circuiting lookups and cardinality checks over original keyed values. */
export interface LookupTerminals<T, Receiver> {
  /**
   * @description Consume through the final entry and return its value, or undefined for empty input.
   * @returns {T | undefined} Consume through the final entry and return its value, or undefined for empty input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[LAST]();
   * ```
   */
  [LAST](this: Receiver): T | undefined;
  /**
   * @description Read a zero-based position; negative indexes count from the end and absent positions return undefined.
   * @param {number} index - Zero-based position; negative positions count from the end.
   * @returns {T | undefined} Read a zero-based position; negative indexes count from the end and absent positions return undefined.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[AT](-1);
   * ```
   */
  [AT](this: Receiver, index: number): T | undefined;
  /**
   * @description Return the sole matching value or undefined when absent; throw when a second match exists.
   * @param {(value: T, key: string) => boolean} [predicate] - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {S | undefined} Return the sole matching value or undefined when absent; throw when a second match exists.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[SINGLE](value => value === 2);
   * ```
   */
  [SINGLE]<S extends T>(this: Receiver, predicate: (value: T, key: string) => value is S): S | undefined;
  /** Returns the sole match, or sole entry without a predicate; empty matches return undefined. */
  [SINGLE](this: Receiver, predicate?: (value: T, key: string) => boolean): T | undefined;
  /**
   * @description Stop on the first false predicate; empty input returns true.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {boolean} Stop on the first false predicate; empty input returns true.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[EVERY](value => value > 0);
   * ```
   */
  [EVERY](this: Receiver, predicate: (value: T, key: string) => boolean): boolean;
  /**
   * @description Probe whether an entry exists without traversing the remaining input.
   * @returns {boolean} Probe whether an entry exists without traversing the remaining input.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[IS_EMPTY]();
   * ```
   */
  [IS_EMPTY](this: Receiver): boolean;
  /**
   * @description Test for a value using SameValueZero equality, including NaN and reference identity.
   * @param {T} value - Value to compare or use as the empty-input fallback.
   * @returns {boolean} Test for a value using SameValueZero equality, including NaN and reference identity.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[INCLUDES](2);
   * ```
   */
  [INCLUDES](this: Receiver, value: T): boolean;
  /**
   * @description Return a fresh tuple for the first matching entry, or undefined when no entry matches.
   * @param {(value: T, key: string) => boolean} predicate - Test (value, originalKey) in query order; a type guard narrows matching values.
   * @returns {[string, S] | undefined} Return a fresh tuple for the first matching entry, or undefined when no entry matches.
   * - 0 `string` - Original entry key when a match exists.
   * - 1 `T` - Matching value when a match exists.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIND_ENTRY](value => value > 1);
   * ```
   */
  [FIND_ENTRY]<S extends T>(this: Receiver, predicate: (value: T, key: string) => value is S): [string, S] | undefined;
  /** Returns a fresh tuple for the first predicate match, or undefined. */
  [FIND_ENTRY](this: Receiver, predicate: (value: T, key: string) => boolean): [string, T] | undefined;
  /**
   * @description Read the first value, retaining stored undefined; use the fallback only when no entry exists.
   * @param {U} value - Value to compare or use as the empty-input fallback.
   * @returns {T | U} Read the first value, retaining stored undefined; use the fallback only when no entry exists.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIRST_OR](0);
   * ```
   */
  [FIRST_OR]<U>(this: Receiver, value: U): T | U;
  /**
   * @description Read the first value and invoke the fallback factory only when the query has no entries.
   * @param {() => U} factory - Create a fallback value only when there is no first entry.
   * @returns {T | U} Read the first value and invoke the fallback factory only when the query has no entries.
   * @example
   * ```ts
   * const query = createQueryable({ a: 1, b: 2 });
   * query[FIRST_OR_ELSE](() => 0);
   * ```
   */
  [FIRST_OR_ELSE]<U>(this: Receiver, factory: () => U): T | U;
}

/**
 * @description Consumes the source and returns its final value, retaining stored undefined rather than testing truthiness.
 * @param {Entries<T>} source - Keyed values in query order.
 * @returns {T | undefined} Final value, or undefined when empty.
 * @example
 * ```ts
 * last([["a", 1], ["b", 2]]); // 2
 * ```
 */
export function last<T>(source: Entries<T>): T | undefined {
  let result: T | undefined;
  for (const [, value] of source) {
    result = value;
  }
  return result;
}

/**
 * @description Reads a relative position after truncation; NaN selects zero and infinities select nothing. Negative positions buffer the required tail until exhaustion.
 * @param {Entries<T>} source - Keyed values in positional order.
 * @param {number} index - Zero-based index, or negative distance from the end.
 * @returns {T | undefined} Value at the position, or undefined when outside the source.
 * @example
 * ```ts
 * at([["a", 1], ["b", 2]], -1); // 2
 * ```
 */
export function at<T>(source: Entries<T>, index: number): T | undefined {
  const integer = Math.trunc(index);
  if (!Number.isFinite(integer)) {
    // Array.at treats NaN as zero; infinities cannot select an entry.
    if (Number.isNaN(integer)) {
      return at(source, 0);
    }
    return undefined;
  }
  if (integer >= 0) {
    let position = 0;
    for (const [, value] of source) {
      if (position++ === integer) {
        return value;
      }
    }
    return undefined;
  }
  const distance = -integer;
  const tail: T[] = [];
  let cursor = 0;
  for (const [, value] of source) {
    if (tail.length < distance) {
      tail.push(value);
    } else {
      tail[cursor] = value;
      cursor = (cursor + 1) % distance;
    }
  }
  return tail.length < distance ? undefined : tail[cursor];
}

/**
 * @description Returns the only matching value and throws RangeError immediately on a second match. Without a predicate, every entry counts as a match.
 * @param {Entries<T>} source - Keyed values to check for a single match.
 * @param {(value: T, key: string) => boolean} [predicate] - Optional keyed predicate or narrowing guard.
 * @returns {T | undefined} Sole matching value (narrowed by a guard), or undefined when none match.
 * @example
 * ```ts
 * single([["a", 1], ["b", 2]], n => n > 1); // 2
 * ```
 */
export function single<T, S extends T>(source: Entries<T>, predicate: (value: T, key: string) => value is S): S | undefined;
export function single<T>(source: Entries<T>, predicate?: (value: T, key: string) => boolean): T | undefined;
export function single<T>(source: Entries<T>, predicate?: (value: T, key: string) => boolean): T | undefined {
  let found = false;
  let result: T | undefined;
  for (const [key, value] of source) {
    if (!predicate || predicate(value, key)) {
      if (found) {
        throw new RangeError("SINGLE matched more than one entry");
      }
      found = true;
      result = value;
    }
  }
  return result;
}

/**
 * @description Tests values in source order, stopping at the first rejection and returning true for an empty source.
 * @param {Entries<T>} source - Keyed values to test.
 * @param {(value: T, key: string) => boolean} predicate - Receives each visited value and original key.
 * @returns {boolean} Whether every visited entry passes the predicate.
 * @example
 * ```ts
 * every([["a", 1], ["b", 2]], n => n > 0); // true
 * ```
 */
export function every<T>(source: Entries<T>, predicate: (value: T, key: string) => boolean): boolean {
  for (const [key, value] of source) {
    if (!predicate(value, key)) {
      return false;
    }
  }
  return true;
}

/**
 * @description Checks absence by requesting at most one entry; a stored undefined value still makes the source nonempty.
 * @param {Entries<T>} source - Keyed iterable whose presence is tested.
 * @returns {boolean} True only when the source has no entries.
 * @example
 * ```ts
 * isEmpty([["a", undefined]]); // false
 * ```
 */
export function isEmpty<T>(source: Entries<T>): boolean {
  for (const _entry of source) {
    return false;
  }
  return true;
}

/**
 * @description Searches values with SameValueZero equality, stopping at the first match; objects compare by reference and NaN matches NaN.
 * @param {Entries<T>} source - Keyed values to search without comparing keys.
 * @param {T} target - Value or reference to find.
 * @returns {boolean} Whether a matching value exists.
 * @example
 * ```ts
 * includes([["reading", NaN]], NaN); // true
 * ```
 */
export function includes<T>(source: Entries<T>, target: T): boolean {
  for (const [, value] of source) {
    if (value === target || (value !== value && target !== target)) {
      return true;
    }
  }
  return false;
}

/**
 * @description Stops at the first predicate match and returns a fresh mutable tuple containing the original key and value reference.
 * @param {Entries<T>} source - Keyed values to search in order.
 * @param {(value: T, key: string) => boolean} predicate - Keyed predicate or type guard selecting the first match.
 * @returns {[string, T] | undefined} Matching entry tuple, or undefined when no match exists.
 * - 0 `string` - Original key of the matching entry.
 * - 1 `T` - Original value, narrowed to S when a type guard is supplied.
 * @example
 * ```ts
 * findEntry([["a", 1], ["b", 2]], n => n > 1); // ["b", 2]
 * ```
 */
export function findEntry<T, S extends T>(source: Entries<T>, predicate: (value: T, key: string) => value is S): [string, S] | undefined;
export function findEntry<T>(source: Entries<T>, predicate: (value: T, key: string) => boolean): [string, T] | undefined;
export function findEntry<T>(source: Entries<T>, predicate: (value: T, key: string) => boolean): [string, T] | undefined {
  for (const [key, value] of source) {
    if (predicate(value, key)) {
      return [key, value];
    }
  }
  return undefined;
}

/**
 * @description Returns the first stored value, using the supplied fallback only for an empty source.
 * @param {Entries<T>} source - Keyed values from which at most one entry is requested.
 * @param {U} fallback - Value returned when no entry exists.
 * @returns {T | U} First value, including stored undefined, or the fallback.
 * @example
 * ```ts
 * firstOr([["a", undefined]], "missing"); // undefined
 * ```
 */
export function firstOr<T, U>(source: Entries<T>, fallback: U): T | U {
  for (const [, value] of source) {
    return value;
  }
  return fallback;
}

/**
 * @description Returns the first stored value and calls the fallback factory only when the source has no entries.
 * @param {Entries<T>} source - Keyed values from which at most one entry is requested.
 * @param {() => U} factory - Creates the fallback once only for an empty source.
 * @returns {T | U} First value or the factory's unmodified result.
 * @example
 * ```ts
 * firstOrElse([], () => ({ status: "missing" })); // { status: "missing" }
 * ```
 */
export function firstOrElse<T, U>(source: Entries<T>, factory: () => U): T | U {
  for (const [, value] of source) {
    return value;
  }
  return factory();
}
