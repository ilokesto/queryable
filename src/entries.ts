/** Creates a keyed iterable for each consumption; repeatability is the factory's responsibility. */
export type EntrySourceFactory<T> = () => Iterable<readonly [string, T]>;
/** Reject duplicates, stream the first occurrence, or buffer the last value at each key's first position. */
export type KeyCollisionPolicy = "error" | "first" | "last";

/**
 * @description Reports a repeated query key when the active collision policy rejects duplicates.
 * @example
 * ```ts
 * const error = new DuplicateKeyError("item");
 * error.key; // "item"
 * ```
 */
export class DuplicateKeyError extends Error {
  /** Original repeated key, including special names such as __proto__. */
  readonly key: string;

  /**
   * @description Creates a named duplicate-key error carrying the conflicting key.
   * @param {string} key - Key encountered more than once.
   * @example
   * ```ts
   * throw new DuplicateKeyError("invoice");
   * ```
   */
  constructor(key: string) {
    super(`Duplicate query key: ${key}`);
    this.name = "DuplicateKeyError";
    this.key = key;
  }
}

function* validatedEntries<T>(source: Iterable<readonly [string, T]>): Generator<readonly [string, T]> {
  for (const entry of source) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
      throw new TypeError("Query entries must be two-element arrays with string keys");
    }
    yield [entry[0], entry[1]];
  }
}

/**
 * @description Validates two-element string-keyed entries and applies a collision policy. Last-wins buffers all input while retaining each key's first insertion position; other policies stream.
 * @param {EntrySourceFactory<T>} factory - Creates the iterable when the generator is first pulled.
 * @param {KeyCollisionPolicy} policy - Duplicate handling: error throws DuplicateKeyError, first skips repeats, and last replaces values.
 * @returns {Generator<readonly [string, T]>} Fresh valid tuples with unique keys; malformed entries throw TypeError.
 * @example
 * ```ts
 * [...checkedEntries(() => [["a", 1], ["a", 2]], "last")]; // [["a", 2]]
 * ```
 */
export function* checkedEntries<T>(
  factory: EntrySourceFactory<T>,
  policy: KeyCollisionPolicy,
): Generator<readonly [string, T]> {
  switch (policy) {
    case "last": {
      const entries = new Map<string, T>();
      for (const [key, value] of validatedEntries(factory())) {
        entries.set(key, value);
      }
      yield* entries;
      return;
    }
    case "first":
    case "error": {
      const seen = new Set<string>();
      for (const [key, value] of validatedEntries(factory())) {
        if (seen.has(key)) {
          if (policy === "error") {
            throw new DuplicateKeyError(key);
          }
          continue;
        }
        seen.add(key);
        yield [key, value];
      }
      return;
    }
    default: {
      const unsupported: never = policy;
      throw new TypeError(`Unsupported duplicate key policy: ${String(unsupported)}`);
    }
  }
}
