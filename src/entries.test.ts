import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COUNT, DuplicateKeyError, ENTRIES, FIRST, GROUP_BY, LAZY, LIMIT, MAP, PICK,
  SORT, TO_OBJECT, VALUES, createQueryable, createQuerySequence, iterateEntries, iterateValues,
} from "./index.js";
import type { EntrySourceFactory, QuerySequence, QuerySequenceOptions } from "./index.js";

describe("entry-source factories", () => {
  it("createQuerySequence: construction and repeat consumption -> defers and rereads the factory", () => {
    const input = new Map([["a", 1]]);
    let calls = 0;
    const factory: EntrySourceFactory<number> = () => { calls++; return input.entries(); };

    const query = createQuerySequence(factory);

    expect(calls).toBe(0);
    expect(query[VALUES]()).toEqual([1]);
    input.set("a", 3);
    input.set("b", 2);
    expect(query[VALUES]()).toEqual([3, 2]);
    expect(calls).toBe(2);
    expectTypeOf(query).toEqualTypeOf<QuerySequence<number>>();
  });

  it("createQuerySequence: integer and special keys -> keeps sequence order and ordinary data keys", () => {
    const factory: EntrySourceFactory<number> = () => [
      ["2", 20], ["1", 10], ["__proto__", 3], ["constructor", 4],
    ];

    const query = createQuerySequence(factory);

    expect(query[ENTRIES]()).toEqual([
      ["2", 20], ["1", 10], ["__proto__", 3], ["constructor", 4],
    ]);
    expect(query[PICK]("constructor", "1")[ENTRIES]()).toEqual([["constructor", 4], ["1", 10]]);
    expect(Object.keys(query[TO_OBJECT]())).toEqual(["1", "2", "__proto__", "constructor"]);
    expect(Object.hasOwn(query[TO_OBJECT](), "__proto__")).toBe(true);
  });

  it("createQuerySequence: no entries requested -> never acquires the source", () => {
    let acquired = 0;
    const query = createQuerySequence<number>(() => {
      acquired++;
      throw new Error("source must not be acquired");
    });

    const result = query[LIMIT](0)[VALUES]();

    expect(result).toEqual([]);
    expect(acquired).toBe(0);
  });

  it("createQuerySequence: factory failure -> deferred exact error and fresh next attempt", () => {
    const failure = new Error("source failure");
    let fail = true;
    const query = createQuerySequence<number>(() => {
      if (fail) { throw failure; }
      return [["a", 1]];
    });

    expect(() => query[VALUES]()).toThrow(failure);
    fail = false;

    expect(query[VALUES]()).toEqual([1]);
  });

  it("createQuerySequence: returned array is repeatable -> calls the factory without memoizing", () => {
    const input: [string, number][] = [["a", 1]];
    let calls = 0;
    const query = createQuerySequence(() => { calls++; return input; });

    const first = query[VALUES]();
    input[0] = ["a", 2];
    const second = query[VALUES]();

    expect(first).toEqual([1]);
    expect(second).toEqual([2]);
    expect(calls).toBe(2);
  });

  it("createQuerySequence: factory sequences -> same frozen shared methods as ordinary sequences", () => {
    const fromFactory = createQuerySequence<number>(() => [["a", 1]]);
    const fromRecord = createQueryable({ a: 1 })[LAZY]();

    expect(fromFactory[MAP]).toBe(fromRecord[MAP]);
    expect(fromFactory[VALUES]).toBe(fromRecord[VALUES]);
    expect(Object.hasOwn(fromFactory, MAP)).toBe(false);
    expect(Object.isFrozen(Object.getPrototypeOf(fromFactory))).toBe(true);
  });
});

describe("explicit iterable views", () => {
  it("iterateEntries/iterateValues: view creation -> no consumption and fresh live iterations", () => {
    const input = new Map([["2", 20], ["1", 10]]);
    let calls = 0;
    const query = createQuerySequence(() => { calls++; return input.entries(); });

    const entries = iterateEntries(query);
    const values = iterateValues(query);

    expect(calls).toBe(0);
    expect(Array.from(entries)).toEqual([["2", 20], ["1", 10]]);
    input.set("2", 30);
    expect(Array.from(values)).toEqual([30, 10]);
    expect(Array.from(entries)).toEqual([["2", 30], ["1", 10]]);
    expect(calls).toBe(3);
    expectTypeOf(entries).toEqualTypeOf<Iterable<[string, number]>>();
    expectTypeOf(values).toEqualTypeOf<Iterable<number>>();
  });

  it("iterateEntries: caller edits returned tuples -> buffered sequence remains unchanged", () => {
    const query = createQueryable({ a: 1, b: 2 })[SORT]((a, b) => b - a);

    const entries = Array.from(iterateEntries(query));
    entries[0]?.splice(0, 2);

    expect(query[ENTRIES]()).toEqual([["b", 2], ["a", 1]]);
  });

  it("iterateValues: interleaved iterators -> independent cursors and early cleanup", () => {
    let acquired = 0;
    let closed = 0;
    const query = createQuerySequence(function* () {
      acquired++;
      try { yield ["a", 1] as const; yield ["b", 2] as const; }
      finally { closed++; }
    });
    const view = iterateValues(query);
    const first = view[Symbol.iterator]();
    const second = view[Symbol.iterator]();

    expect(first.next()).toEqual({ value: 1, done: false });
    expect(second.next()).toEqual({ value: 1, done: false });
    first.return?.();
    expect(second.next()).toEqual({ value: 2, done: false });
    second.return?.();

    expect(acquired).toBe(2);
    expect(closed).toBe(2);
  });

  it("iterateValues: consumer breaks -> closes the acquired generator exactly once", () => {
    let closed = 0;
    const query = createQuerySequence(function* () {
      try { yield ["a", 1] as const; yield ["b", 2] as const; }
      finally { closed++; }
    });

    for (const value of iterateValues(query)) {
      expect(value).toBe(1);
      break;
    }

    expect(closed).toBe(1);
  });

  it("createQuerySequence: downstream callback throws -> closes upstream and retries freshly", () => {
    const failure = new Error("mapper failure");
    let closed = 0;
    let fail = true;
    const query = createQuerySequence(function* () {
      try { yield ["a", 1] as const; }
      finally { closed++; }
    })[MAP](value => {
      if (fail) { throw failure; }
      return value;
    });

    expect(() => query[VALUES]()).toThrow(failure);
    expect(closed).toBe(1);
    fail = false;

    expect(query[VALUES]()).toEqual([1]);
    expect(closed).toBe(2);
  });
});

describe("entry key identity", () => {
  const duplicateFactory: EntrySourceFactory<number | undefined> = () => [
    ["b", undefined], ["a", 1], ["b", 2], ["c", 3],
  ];

  it("duplicate key: default policy -> full consumers reject rather than silently overwrite", () => {
    const query = createQuerySequence(duplicateFactory);

    const consume = () => query[TO_OBJECT]();

    expect(consume).toThrow(DuplicateKeyError);
    expect(consume).toThrow(expect.objectContaining({ key: "b" }));
    expect(() => query[PICK]("a")[VALUES]()).toThrow(DuplicateKeyError);
    expect(() => query[GROUP_BY](() => "all")).toThrow(DuplicateKeyError);
    expect(() => query[COUNT]()).toThrow(DuplicateKeyError);
  });

  it("duplicate key: prefix consumer -> validates only requested entries and closes upstream", () => {
    let closed = 0;
    const query = createQuerySequence(function* () {
      try { yield ["a", 1] as const; yield ["a", 2] as const; }
      finally { closed++; }
    });

    const first = query[FIRST]();

    expect(first).toBe(1);
    expect(closed).toBe(1);
    expect(() => query[ENTRIES]()).toThrow(DuplicateKeyError);
    expect(closed).toBe(2);
  });

  it("duplicate key: first policy -> retains first values including stored undefined", () => {
    const query = createQuerySequence(duplicateFactory, { duplicateKeys: "first" });

    const result = query[ENTRIES]();

    expect(result).toEqual([["b", undefined], ["a", 1], ["c", 3]]);
    expect(query[ENTRIES]()).toEqual(result);
  });

  it("duplicate key: last policy -> buffers input and retains first-key positions", () => {
    const trace: string[] = [];
    const query = createQuerySequence(function* () {
      for (const entry of duplicateFactory()) {
        trace.push(`source:${entry[0]}`);
        yield entry;
      }
    }, { duplicateKeys: "last" })[MAP]((value, key) => {
      trace.push(`map:${key}`);
      return value;
    });

    const first = query[FIRST]();

    expect(first).toBe(2);
    expect(trace).toEqual(["source:b", "source:a", "source:b", "source:c", "map:b"]);
    expect(query[ENTRIES]()).toEqual([["b", 2], ["a", 1], ["c", 3]]);
  });

  it("duplicate key: later input changes -> each consumption checks fresh state", () => {
    const input: [string, number][] = [["a", 1]];
    const query = createQuerySequence(() => input);

    expect(query[VALUES]()).toEqual([1]);
    input.push(["a", 2]);
    expect(() => query[VALUES]()).toThrow(DuplicateKeyError);
    input.pop();

    expect(query[VALUES]()).toEqual([1]);
  });

  it("entry validation: non-string key or malformed tuple -> deferred TypeError", () => {
    const entry: [string, number] = ["a", 1];
    const query = createQuerySequence(() => [entry]);
    Reflect.set(entry, 0, 1);

    expect(() => query[VALUES]()).toThrow(TypeError);
    Reflect.set(entry, 0, "a");
    entry.pop();

    expect(() => query[VALUES]()).toThrow(TypeError);
  });

  it("collision policy: invalid JavaScript option -> rejected before source acquisition", () => {
    const options: QuerySequenceOptions = { duplicateKeys: "error" };
    Reflect.set(options, "duplicateKeys", "invalid");
    let acquired = 0;

    const construct = () => createQuerySequence(() => { acquired++; return []; }, options);

    expect(construct).toThrow(TypeError);
    expect(acquired).toBe(0);
  });

  it("entry payload: revoked proxy -> accepted without probing the value", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const query = createQuerySequence(() => [["opaque", proxy]] as const);

    const result = query[VALUES]();

    expect(result[0]).toBe(proxy);
  });
});
