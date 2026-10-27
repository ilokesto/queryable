import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COUNT, DuplicateKeyError, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP,
  SOME, SORT, VALUES, WHERE, createAsyncQuerySequence, createQueryable,
  iterateAsyncEntries, iterateAsyncValues,
} from "../../src/index.js";
import type { AsyncEntrySourceFactory, AsyncQuerySequence, AsyncQuerySequenceOptions } from "../../src/index.js";

function controlled<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>(release => { resolve = release; });
  if (!resolve) {
    throw new Error("Promise executor did not initialize its resolver");
  }
  return { promise, resolve };
}

function trackedSource() {
  const trace: string[] = [];
  const factory: AsyncEntrySourceFactory<number> = () => {
    trace.push("factory");
    let index = 0;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<readonly [string, number]>> {
            trace.push(`next:${index}`);
            if (index === 3) {
              return { done: true, value: undefined };
            }
            return { done: false, value: [String(index), ++index] };
          },
          async return(): Promise<IteratorResult<readonly [string, number]>> {
            trace.push("return");
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
  return { trace, factory };
}

describe("async factory and normalized types", () => {
  it("createAsyncQuerySequence: mixed and nested Promises -> awaits values and retains keys", async () => {
    const nested = new Promise<Promise<number>>(resolve => { resolve(Promise.resolve(3)); });
    const source: AsyncEntrySourceFactory<number | Promise<number> | Promise<Promise<number>> | undefined> =
      async () => [["2", 1], ["1", Promise.resolve(2)], ["__proto__", nested], ["constructor", undefined]];
    const query = createAsyncQuerySequence(source);

    const entries = await query[ENTRIES]();

    expect(entries).toEqual([["2", 1], ["1", 2], ["__proto__", 3], ["constructor", undefined]]);
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<number | undefined>>();
    expectTypeOf(query[VALUES]()).toEqualTypeOf<Promise<(number | undefined)[]>>();
  });

  it("MAP: plain, Promise, mixed, nested and never results -> preserves Awaited inference", async () => {
    const query = createAsyncQuerySequence<number>(() => [["a", 1], ["b", 2]]);
    const plain = query[MAP](value => value + 1);
    const promised = query[MAP](async value => String(value));
    const mixed = query[MAP](value => value === 1 ? undefined : Promise.resolve(value));
    const nested = query[MAP](value => new Promise<Promise<number>>(resolve => { resolve(Promise.resolve(value)); }));
    const never = query[MAP]((): never => { throw "never"; });
    const rejected = query[MAP](() => Promise.reject<never>("rejected"));

    expect(await plain[VALUES]()).toEqual([2, 3]);
    expect(await promised[VALUES]()).toEqual(["1", "2"]);
    expect(await mixed[VALUES]()).toEqual([undefined, 2]);
    expect(await nested[VALUES]()).toEqual([1, 2]);
    await expect(never[VALUES]()).rejects.toBe("never");
    await expect(rejected[VALUES]()).rejects.toBe("rejected");
    expectTypeOf(plain).toEqualTypeOf<AsyncQuerySequence<number>>();
    expectTypeOf(promised).toEqualTypeOf<AsyncQuerySequence<string>>();
    expectTypeOf(mixed).toEqualTypeOf<AsyncQuerySequence<number | undefined>>();
    expectTypeOf(nested).toEqualTypeOf<AsyncQuerySequence<number>>();
    expectTypeOf(never).toEqualTypeOf<AsyncQuerySequence<never>>();
    expectTypeOf(rejected).toEqualTypeOf<AsyncQuerySequence<never>>();
  });

  it("WHERE and FIND: sync guards and async predicates -> narrow only explicit guards", async () => {
    const query = createAsyncQuerySequence<number | string>(() => [["a", 1], ["b", "two"]]);
    const strings = query[WHERE]((value): value is string => typeof value === "string");
    const asyncFiltered = query[WHERE](async value => typeof value === "string");
    const found = query[FIND]((value): value is string => typeof value === "string");

    expect(await strings[VALUES]()).toEqual(["two"]);
    expect(await asyncFiltered[VALUES]()).toEqual(["two"]);
    expect(await found).toBe("two");
    expect(await query[SOME](async value => value === 1)).toBe(true);
    expectTypeOf(strings).toEqualTypeOf<AsyncQuerySequence<string>>();
    expectTypeOf(asyncFiltered).toEqualTypeOf<AsyncQuerySequence<number | string>>();
    expectTypeOf(found).toEqualTypeOf<Promise<string | undefined>>();
  });

  it("async terminals: empty and stored undefined -> preserve empty contracts without callbacks", async () => {
    const empty = createAsyncQuerySequence<never>(() => []);
    const query = createAsyncQuerySequence(() => [["a", undefined]] as const);
    const fail = (): never => { throw new Error("empty callback"); };

    expect(await empty[COUNT]()).toBe(0);
    expect(await empty[FIRST]()).toBeUndefined();
    expect(await empty[FIND](fail)).toBeUndefined();
    expect(await empty[SOME](fail)).toBe(false);
    expect(await empty[MAP](fail)[WHERE](fail)[VALUES]()).toEqual([]);
    expect(await empty[SORT](fail)[ENTRIES]()).toEqual([]);
    const first = await empty[VALUES]();
    expect(await empty[VALUES]()).not.toBe(first);
    expect(await empty[GROUP_BY](fail)).toEqual({});
    expect(await query[COUNT]()).toBe(1);
    expect(await query[ENTRIES]()).toEqual([["a", undefined]]);
    expect(await query[SOME](value => value === undefined)).toBe(true);
    expectTypeOf(empty).toEqualTypeOf<AsyncQuerySequence<never>>();
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<undefined>>();
  });

  it("sync queries: Promise payload -> remains opaque after async exports are loaded", () => {
    const promise = Promise.resolve(1);
    const query = createQueryable({ a: promise });

    expect(query[FIRST]()).toBe(promise);
    expect(query[MAP](value => value)[VALUES]()).toEqual([promise]);
    expectTypeOf(query[FIRST]()).toEqualTypeOf<Promise<number> | undefined>();
  });

  it("async factory: fresh consumption and changed input -> no acquisition or cross-consumption cache", async () => {
    const rows = new Map([["a", 1]]);
    let calls = 0;
    const query = createAsyncQuerySequence(() => { calls++; return rows.entries(); })[LAZY]()[MAP](value => value * 2);

    expect(calls).toBe(0);
    expect(await query[VALUES]()).toEqual([2]);
    rows.set("a", 3);
    rows.set("b", 4);
    expect(await query[VALUES]()).toEqual([6, 8]);
    expect(calls).toBe(2);
    expect(Object.isFrozen(Object.getPrototypeOf(query))).toBe(true);
    const other = createAsyncQuerySequence<number>(() => []);
    for (const method of [MAP, WHERE, COUNT, FIRST, VALUES, ENTRIES, FIND, SOME, LIMIT, LAZY, SORT, GROUP_BY] as const) {
      expect(query[method]).toBe(other[method]);
      expect(Object.hasOwn(query, method)).toBe(false);
    }
  });

  it("async callbacks: controlled mapper -> pulls and invokes strictly in source order", async () => {
    const entered = controlled<void>();
    const release = controlled<number>();
    const { factory, trace } = trackedSource();
    const query = createAsyncQuerySequence(factory)[MAP]((value, key) => {
      trace.push(`map:${key}:${value}`);
      if (value === 1) {
        entered.resolve();
        return release.promise;
      }
      return value * 10;
    })[WHERE](async (value, key) => {
      trace.push(`where:${key}:${value}`);
      return value > 10;
    });

    const result = query[VALUES]();
    await entered.promise;
    expect(trace).toEqual(["factory", "next:0", "map:0:1"]);
    release.resolve(10);

    expect(await result).toEqual([20, 30]);
    expect(trace).toEqual([
      "factory", "next:0", "map:0:1", "where:0:10", "next:1", "map:1:2",
      "where:1:20", "next:2", "map:2:3", "where:2:30", "next:3",
    ]);
  });
});

describe("async iterator protocol", () => {
  it.each(["first", "find", "some", "limit", "break"] as const)(
    "async %s: prefix consumption -> closes upstream exactly once without another pull",
    async terminal => {
      const { factory, trace } = trackedSource();
      const query = createAsyncQuerySequence(factory)[MAP](async value => value)[WHERE](async () => true);

      if (terminal === "first") { await query[FIRST](); }
      if (terminal === "find") { await query[FIND](async () => true); }
      if (terminal === "some") { await query[SOME](async () => true); }
      if (terminal === "limit") { await query[LIMIT](1)[VALUES](); }
      if (terminal === "break") {
        for await (const _value of iterateAsyncValues(query)) { break; }
      }

      expect(trace).toEqual(["factory", "next:0", "return"]);
    },
  );

  it.each(["next", "value", "map", "where", "find", "some", "group"] as const)(
    "async %s: rejected work -> preserves rejection and awaits exactly one cleanup",
    async stage => {
      const failure = { stage };
      const closing = controlled<void>();
      const release = controlled<void>();
      let returns = 0;
      const factory: AsyncEntrySourceFactory<number | Promise<number>> = () => ({
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<readonly [string, number | Promise<number>]>> {
              if (stage === "next") { throw failure; }
              return { done: false, value: ["a", stage === "value" ? Promise.reject(failure) : 1] };
            },
            async return(): Promise<IteratorResult<readonly [string, number | Promise<number>]>> {
              returns++;
              closing.resolve();
              await release.promise;
              return { done: true, value: undefined };
            },
          };
        },
      });
      const query = createAsyncQuerySequence(factory);
      const reject = (): Promise<never> => Promise.reject(failure);
      const consume = () => {
        switch (stage) {
          case "map": return query[MAP](reject)[VALUES]();
          case "where": return query[WHERE](reject)[VALUES]();
          case "find": return query[FIND](reject);
          case "some": return query[SOME](reject);
          case "group": return query[GROUP_BY](reject);
          default: return query[VALUES]();
        }
      };
      let settled = false;

      const result = consume().finally(() => { settled = true; });
      const rejection = expect(result).rejects.toBe(failure);
      await closing.promise;
      expect(returns).toBe(1);
      expect(settled).toBe(false);
      release.resolve();

      await rejection;
      expect(returns).toBe(1);
      expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<number>>();
    },
  );

  it.each(["next", "callback", "early"] as const)(
    "async cleanup: return rejects during %s -> preserves primary failure or reports cleanup failure",
    async stage => {
      const primary = new Error("primary");
      const cleanup = new Error("cleanup");
      let returns = 0;
      const query = createAsyncQuerySequence<number>(() => ({
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<readonly [string, number]>> {
              if (stage === "next") { throw primary; }
              return { done: false, value: ["a", 1] };
            },
            async return(): Promise<IteratorResult<readonly [string, number]>> {
              returns++;
              throw cleanup;
            },
          };
        },
      }));

      const result = stage === "callback"
        ? query[MAP](() => { throw primary; })[FIRST]()
        : query[FIRST]();

      await expect(result).rejects.toBe(stage === "early" ? cleanup : primary);
      expect(returns).toBe(1);
    },
  );

  it("async factory: failed attempt -> a later consumption starts a fresh successful iterator", async () => {
    const failure = new Error("factory");
    let attempt = 0;
    const query = createAsyncQuerySequence<number>(async () => {
      if (++attempt === 1) { throw failure; }
      return [["a", 1]];
    });

    await expect(query[VALUES]()).rejects.toBe(failure);

    expect(await query[VALUES]()).toEqual([1]);
    expect(attempt).toBe(2);
  });

  it.each([false, true])(
    "async cleanup: return accessor fails with rejected next=%s -> retains error precedence",
    async rejectedNext => {
      const primary = new Error("next");
      const cleanup = new Error("return accessor");
      let reads = 0;
      const query = createAsyncQuerySequence<number>(() => ({
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<readonly [string, number]>> {
              if (rejectedNext) { throw primary; }
              return { done: false, value: ["a", 1] };
            },
            get return(): NonNullable<AsyncIterator<readonly [string, number]>["return"]> {
              reads++;
              throw cleanup;
            },
          };
        },
      }));

      await expect(query[FIRST]()).rejects.toBe(rejectedNext ? primary : cleanup);

      expect(reads).toBe(1);
    },
  );

  it("async values: custom thenable and shallow object -> assimilates only the value itself", async () => {
    const thenable: PromiseLike<number> = {
      then(onfulfilled, onrejected) { return Promise.resolve(2).then(onfulfilled, onrejected); },
    };
    const object = { nested: thenable };
    const query = createAsyncQuerySequence(() => [["a", thenable]] as const);

    expect(await query[MAP](value => value + 1)[VALUES]()).toEqual([3]);
    expect(await createAsyncQuerySequence(() => [["a", object]] as const)[FIRST]()).toBe(object);
    expectTypeOf(query).toEqualTypeOf<AsyncQuerySequence<number>>();
  });

  it("async views: interleaved iterators and reentrant terminal -> independent cursors and fresh tuples", async () => {
    const { factory, trace } = trackedSource();
    const query = createAsyncQuerySequence(factory);
    const entries = iterateAsyncEntries(query);
    const values = iterateAsyncValues(query);
    const first = entries[Symbol.asyncIterator]();
    const second = values[Symbol.asyncIterator]();

    expect(trace).toEqual([]);
    const entry = await first.next();
    if (!entry.done) { entry.value[0] = "changed"; }
    expect(await second.next()).toEqual({ done: false, value: 1 });
    expect(await query[FIRST]()).toBe(1);
    expect(await first.next()).toEqual({ done: false, value: ["1", 2] });
    await first.return?.();
    expect(await second.next()).toEqual({ done: false, value: 2 });
    await second.return?.();

    expect(trace.filter(event => event === "factory")).toHaveLength(3);
    expect(trace.filter(event => event === "return")).toHaveLength(3);
    expectTypeOf(entries).toEqualTypeOf<AsyncIterable<[string, number]>>();
    expectTypeOf(values).toEqualTypeOf<AsyncIterable<number>>();
  });

  it("sync entry iterator: next throws -> async seam closes it once and preserves the thrown value", async () => {
    let returns = 0;
    const query = createAsyncQuerySequence<number>(() => ({
      [Symbol.iterator]() {
        return {
          next(): IteratorResult<readonly [string, number]> { throw "sync next"; },
          return(): IteratorResult<readonly [string, number]> {
            returns++;
            return { done: true, value: undefined };
          },
        };
      },
    }));

    await expect(query[VALUES]()).rejects.toBe("sync next");

    expect(returns).toBe(1);
  });
});

describe("async identity and materialization barriers", () => {
  const duplicates: AsyncEntrySourceFactory<number | undefined> = () => [
    ["b", undefined], ["a", 1], ["b", 2], ["c", 3],
  ];

  it("async duplicate keys: error and first policies -> match sync identity including undefined", async () => {
    const query = createAsyncQuerySequence(duplicates);
    const first = createAsyncQuerySequence(duplicates, { duplicateKeys: "first" });

    expect(await query[FIRST]()).toBeUndefined();
    await expect(query[ENTRIES]()).rejects.toBeInstanceOf(DuplicateKeyError);
    await expect(query[COUNT]()).rejects.toMatchObject({ key: "b" });
    await expect(query[GROUP_BY](() => "all")).rejects.toBeInstanceOf(DuplicateKeyError);
    expect(await first[ENTRIES]()).toEqual([["b", undefined], ["a", 1], ["c", 3]]);
    expect(await first[ENTRIES]()).toEqual([["b", undefined], ["a", 1], ["c", 3]]);
  });

  it("async duplicate keys: last policy -> buffers before callbacks and keeps first-key positions", async () => {
    const trace: string[] = [];
    const query = createAsyncQuerySequence(function* () {
      for (const entry of [["b", 1], ["a", 2], ["b", 3]] as const) {
        trace.push(`source:${entry[0]}`);
        yield entry;
      }
    }, { duplicateKeys: "last" })[MAP]((value, key) => { trace.push(`map:${key}`); return value; });

    expect(await query[FIRST]()).toBe(3);

    expect(trace).toEqual(["source:b", "source:a", "source:b", "map:b"]);
    expect(await query[ENTRIES]()).toEqual([["b", 3], ["a", 2]]);
  });

  it("async identity: later duplicate insertion -> validates each fresh consumption", async () => {
    const rows: [string, number][] = [["a", 1]];
    const query = createAsyncQuerySequence(() => rows);

    expect(await query[VALUES]()).toEqual([1]);
    rows.push(["a", 2]);
    await expect(query[VALUES]()).rejects.toBeInstanceOf(DuplicateKeyError);
    rows.pop();

    expect(await query[VALUES]()).toEqual([1]);
  });

  it("async entry validation: malformed tuple -> deferred TypeError and upstream cleanup", async () => {
    const entry: [string, number] = ["a", 1];
    let closed = 0;
    const query = createAsyncQuerySequence(function* () {
      try { yield entry; } finally { closed++; }
    });
    Reflect.set(entry, 0, 1);

    await expect(query[VALUES]()).rejects.toBeInstanceOf(TypeError);
    Reflect.set(entry, 0, "a");
    entry.pop();
    await expect(query[VALUES]()).rejects.toBeInstanceOf(TypeError);

    expect(closed).toBe(2);
  });

  it("async options: invalid JavaScript policy -> rejects before acquiring source", () => {
    const options: AsyncQuerySequenceOptions = { duplicateKeys: "error" };
    Reflect.set(options, "duplicateKeys", "invalid");
    let acquired = 0;

    expect(() => createAsyncQuerySequence(() => { acquired++; return []; }, options)).toThrow(TypeError);

    expect(acquired).toBe(0);
  });

  it.each([0, -0, NaN, -Infinity, 0.5])(
    "async LIMIT(%s): empty slice -> never acquires source",
    async count => {
      const query = createAsyncQuerySequence<number>(() => { throw new Error("must not acquire"); });

      expect(await query[LIMIT](count)[VALUES]()).toEqual([]);
    },
  );

  it.each([-1, -1.8, -10, Infinity, 2.8])(
    "async LIMIT(%s): slice semantics -> matches native output and buffering boundaries",
    async count => {
      const { factory, trace } = trackedSource();
      const query = createAsyncQuerySequence(factory)[LIMIT](count);

      expect(await query[VALUES]()).toEqual([1, 2, 3].slice(0, count));

      expect(trace).toEqual(count < 0 || count === Infinity
        ? ["factory", "next:0", "next:1", "next:2", "next:3"]
        : ["factory", "next:0", "next:1", "return"]);
    },
  );

  it("async SORT: deferred consumption -> full buffer, stable ties and repeated live sorting", async () => {
    const rows: [string, number][] = [["2", 2], ["1", 1], ["__proto__", 2]];
    const trace: string[] = [];
    const query = createAsyncQuerySequence(function* () {
      for (const entry of rows) { trace.push(`source:${entry[0]}`); yield entry; }
    })[SORT]((left, right) => { trace.push("compare"); return right - left; });

    expect(trace).toEqual([]);
    expect(await query[LIMIT](1)[ENTRIES]()).toEqual([["2", 2]]);
    expect(trace.slice(0, 3)).toEqual(["source:2", "source:1", "source:__proto__"]);
    expect(await query[ENTRIES]()).toEqual([["2", 2], ["__proto__", 2], ["1", 1]]);
    rows.push(["0", 3]);

    expect(await query[FIRST]()).toBe(3);
  });

  it("async GROUP_BY: call starts pending work -> awaited groups are ordered eager snapshots", async () => {
    const entered = controlled<void>();
    const release = controlled<void>();
    let calls = 0;
    const rows: [string, number][] = [["2", 2], ["1", 1], ["__proto__", 4]];
    const query = createAsyncQuerySequence(() => { calls++; return rows; });
    const keys: string[] = [];

    const pending = query[GROUP_BY](async (value, key) => {
      keys.push(key);
      if (key === "2") { entered.resolve(); await release.promise; }
      return value % 2 === 0 ? "__proto__" : "constructor";
    });
    await entered.promise;
    expect(keys).toEqual(["2"]);
    release.resolve();
    const groups = await pending;
    rows.push(["later", 6]);

    expect(keys).toEqual(["2", "1", "__proto__"]);
    expect(calls).toBe(1);
    expect(Object.getPrototypeOf(groups)).toBeNull();
    expect(await groups.__proto__?.[ENTRIES]()).toEqual([["2", 2], ["__proto__", 4]]);
    expect(await groups.constructor?.[VALUES]()).toEqual([1]);
    expect(await groups.__proto__?.[LAZY]()[VALUES]()).toEqual([2, 4]);
    expect(calls).toBe(1);
    expectTypeOf(groups).toEqualTypeOf<Partial<Record<"__proto__" | "constructor", AsyncQuerySequence<number>>>>();
  });
});
