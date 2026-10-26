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

export interface LookupTerminals<T, Receiver> {
  [LAST](this: Receiver): T | undefined;
  [AT](this: Receiver, index: number): T | undefined;
  [SINGLE]<S extends T>(this: Receiver, predicate: (value: T, key: string) => value is S): S | undefined;
  [SINGLE](this: Receiver, predicate?: (value: T, key: string) => boolean): T | undefined;
  [EVERY](this: Receiver, predicate: (value: T, key: string) => boolean): boolean;
  [IS_EMPTY](this: Receiver): boolean;
  [INCLUDES](this: Receiver, value: T): boolean;
  [FIND_ENTRY]<S extends T>(this: Receiver, predicate: (value: T, key: string) => value is S): [string, S] | undefined;
  [FIND_ENTRY](this: Receiver, predicate: (value: T, key: string) => boolean): [string, T] | undefined;
  [FIRST_OR]<U>(this: Receiver, value: U): T | U;
  [FIRST_OR_ELSE]<U>(this: Receiver, factory: () => U): T | U;
}

export function last<T>(source: Entries<T>): T | undefined {
  let result: T | undefined;
  for (const [, value] of source) {
    result = value;
  }
  return result;
}

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

export function every<T>(source: Entries<T>, predicate: (value: T, key: string) => boolean): boolean {
  for (const [key, value] of source) {
    if (!predicate(value, key)) {
      return false;
    }
  }
  return true;
}

export function isEmpty<T>(source: Entries<T>): boolean {
  for (const _entry of source) {
    return false;
  }
  return true;
}

export function includes<T>(source: Entries<T>, target: T): boolean {
  for (const [, value] of source) {
    if (value === target || (value !== value && target !== target)) {
      return true;
    }
  }
  return false;
}

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

export function firstOr<T, U>(source: Entries<T>, fallback: U): T | U {
  for (const [, value] of source) {
    return value;
  }
  return fallback;
}

export function firstOrElse<T, U>(source: Entries<T>, factory: () => U): T | U {
  for (const [, value] of source) {
    return value;
  }
  return factory();
}
