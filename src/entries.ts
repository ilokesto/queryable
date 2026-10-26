export type EntrySourceFactory<T> = () => Iterable<readonly [string, T]>;
export type KeyCollisionPolicy = "error" | "first" | "last";

export class DuplicateKeyError extends Error {
  readonly key: string;

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
