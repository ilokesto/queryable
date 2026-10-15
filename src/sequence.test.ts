import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COUNT, ENTRIES, FIND, FIRST, GROUP_BY, LAZY, LIMIT, MAP, PICK, REDUCE,
  SOME, SORT, TO_OBJECT, VALUES, WHERE, createQueryable,
} from "./index.js";
import type { Queryable, QuerySequence } from "./index.js";

describe("ordered sequences", () => {
  it("SORT: integer keys and ties -> stable order survives transformations", () => {
    const query = createQueryable({ 1: 10, 2: 20, 3: 20 });

    const result = query[SORT]((a, b) => b - a)[WHERE](n => n > 0)
      [MAP](n => n + 1)[LIMIT](3);

    expect(result[ENTRIES]()).toEqual([["2", 21], ["3", 21], ["1", 11]]);
    expect(query[VALUES]()).toEqual([10, 20, 20]);
    expectTypeOf(result).toEqualTypeOf<QuerySequence<number>>();
  });

  it("SORT: eager callbacks -> results are snapshots before subsequent mutations", () => {
    const query = createQueryable({ a: 1, b: 2 });
    let calls = 0;

    const result = query[SORT]((a, b) => b - a)[MAP](n => { calls++; return n * 2; });
    query.b = 99;

    expect(calls).toBe(2);
    expect(result[VALUES]()).toEqual([4, 2]);
    expect(result[VALUES]()).toEqual([4, 2]);
    expect(calls).toBe(2);
  });

  it("PICK: ordered sequence -> requested order, unique keys and stored undefined", () => {
    const query = createQueryable({ a: undefined, b: 2 })[SORT](() => 0);

    const result = query[PICK]("b", "missing", "a", "b");

    expect(result[ENTRIES]()).toEqual([["b", 2], ["a", undefined]]);
  });

  it("GROUP_BY: sorted input -> materialized groups retain input order", () => {
    const query = createQueryable({ 1: 10, 2: 20, 3: 30 })[SORT]((a, b) => b - a);

    const groups = query[GROUP_BY](n => n >= 20 ? "large" : "small");

    expect(groups.large?.[ENTRIES]()).toEqual([["3", 30], ["2", 20]]);
    expect(groups.small?.[REDUCE]((sum, n) => sum + n, 0)).toBe(10);
    expectTypeOf(groups).toEqualTypeOf<Partial<Record<"large" | "small", QuerySequence<number>>>>();
  });

  it("methods: separate sequences -> frozen shared prototype functions", () => {
    const first = createQueryable({ a: 1 })[SORT](() => 0);
    const second = createQueryable({ b: 2 })[LAZY]();

    const methods = [WHERE, MAP, SORT, PICK, LIMIT, GROUP_BY, LAZY, FIND, SOME, REDUCE, ENTRIES, TO_OBJECT] as const;

    for (const method of methods) {
      expect(first[method]).toBe(second[method]);
      expect(Object.hasOwn(first, method)).toBe(false);
    }
    expect(Object.isFrozen(Object.getPrototypeOf(first))).toBe(true);
  });
});

describe.each(["record", "ordered", "lazy"] as const)("%s query contracts", mode => {
  function query<T>(record: Record<string, T>): Queryable<T> | QuerySequence<T> {
    const source = createQueryable(record);
    if (mode === "ordered") {
      return source[SORT](() => 0);
    }
    return mode === "lazy" ? source[LAZY]() : source;
  }

  it("FIND: matching falsy value -> stops before later callbacks", () => {
    const source = query({ a: 1, b: 0, c: 3 });
    const keys: string[] = [];

    const found = source[FIND]((n, key) => { keys.push(key); return n === 0; });

    expect(found).toBe(0);
    expect(keys).toEqual(["a", "b"]);
  });

  it("SOME: matching undefined -> true without conflating value with absence", () => {
    const source = query({ a: undefined, b: 1 });
    const keys: string[] = [];

    const found = source[SOME]((n, key) => { keys.push(key); return n === undefined; });

    expect(found).toBe(true);
    expect(keys).toEqual(["a"]);
  });

  it("terminals: empty source -> identity and absent results without callbacks", () => {
    const source = query<number>({});
    const callback = () => { throw new Error("empty query must not call callbacks"); };

    const result = [
      source[FIND](callback), source[SOME](callback), source[REDUCE](callback, 42),
      source[FIRST](), source[COUNT](), source[ENTRIES](), source[TO_OBJECT](),
    ];

    expect(result).toEqual([undefined, false, 42, undefined, 0, [], {}]);
  });

  it("ENTRIES: extracted tuples modified -> source record remains intact", () => {
    const source = query({ a: 1 });

    const entries = source[ENTRIES]();
    entries[0]?.splice(0, 2);

    expect(source[ENTRIES]()).toEqual([["a", 1]]);
  });

  it("TO_OBJECT: special keys -> ordinary prototype and safe own properties", () => {
    const source = query(Object.fromEntries([["__proto__", 1], ["constructor", 2], ["toString", 3]]));

    const result = source[TO_OBJECT]();

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result.__proto__).toBe(1);
    expect(Object.keys(result)).toEqual(["__proto__", "constructor", "toString"]);
  });

  it("REDUCE: value and key arguments -> accumulated result in query order", () => {
    const source = query({ a: 1, b: 2 });

    const result = source[REDUCE]((text, n, key) => `${text}${key}:${n};`, "");

    expect(result).toBe("a:1;b:2;");
    expectTypeOf(result).toEqualTypeOf<string>();
  });

  it.each([0, -0, 1, 10, -1, -10, 1.9, -1.9, NaN, Infinity, -Infinity])(
    "LIMIT: %s -> agrees with slice for each query mode",
    bound => {
      const source = createQueryable({ a: 1, b: 2, c: 3 });

      const values = mode === "record"
        ? source[LIMIT](bound)[VALUES]()
        : (mode === "lazy" ? source[LAZY]() : source[SORT](() => 0))[LIMIT](bound)[VALUES]();

      expect(values).toEqual([1, 2, 3].slice(0, bound));
    },
  );
});

describe("lazy evaluation", () => {
  it("LAZY: construction and limit -> callbacks deferred and upstream stops exactly", () => {
    const query = createQueryable({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    const visited: number[] = [];
    const mapped: number[] = [];

    const lazy = query[LAZY]()[WHERE](n => { visited.push(n); return n % 2 === 0; })
      [MAP](n => { mapped.push(n); return n * 10; })[LIMIT](1);

    expect(visited).toEqual([]);
    expect(mapped).toEqual([]);
    expect(lazy[VALUES]()).toEqual([20]);
    expect(visited).toEqual([1, 2]);
    expect(mapped).toEqual([2]);
  });

  it("LAZY: repeated consumption -> re-evaluates the live query, not the input object", () => {
    const input = { a: 1 };
    const query = createQueryable(input);
    let calls = 0;
    const lazy = query[LAZY]()[MAP](n => { calls++; return n * 2; });
    const before = lazy[VALUES]();
    input.a = 100;
    query.a = 3;
    query.b = 4;

    const after = lazy[VALUES]();

    expect(before).toEqual([2]);
    expect(after).toEqual([6, 8]);
    expect(calls).toBe(3);
  });

  it("LAZY: repeated consumption -> fresh iterators after early termination", () => {
    const lazy = createQueryable({ a: 1, b: 2, c: 3 })[LAZY]()[MAP](n => n * 2);

    const results = [lazy[FIRST](), lazy[FIND](n => n === 4), lazy[VALUES](), lazy[COUNT]()];

    expect(results).toEqual([2, 4, [2, 4, 6], 3]);
  });

  it("LAZY: callback error -> deferred until consumption and retry re-evaluates", () => {
    const error = new Error("deferred failure");
    let fail = true;
    const lazy = createQueryable({ a: 1 })[LAZY]()[MAP](n => {
      if (fail) { throw error; }
      return n;
    });

    const consume = () => lazy[VALUES]();

    expect(consume).toThrow(error);
    fail = false;
    expect(consume()).toEqual([1]);
  });

  it("LAZY: zero LIMIT -> does not invoke upstream callbacks", () => {
    const lazy = createQueryable({ a: 1 })[LAZY]()[MAP](() => { throw new Error("unneeded"); });

    const result = lazy[LIMIT](0)[VALUES]();

    expect(result).toEqual([]);
  });

  it("SORT: lazy ordering barrier -> evaluates all entries only upon consumption", () => {
    const visited: number[] = [];
    const lazy = createQueryable({ 1: 1, 2: 2, 3: 3 })[LAZY]()
      [MAP](n => { visited.push(n); return n; })[SORT]((a, b) => b - a)[LIMIT](1);

    expect(visited).toEqual([]);
    const result = lazy[ENTRIES]();

    expect(result).toEqual([["3", 3]]);
    expect(visited).toEqual([1, 2, 3]);
  });

  it("PICK: lazy requested order -> defers buffering until consumed", () => {
    let calls = 0;
    const lazy = createQueryable({ a: 1, b: 2 })[LAZY]()
      [MAP](n => { calls++; return n; })[PICK]("b", "a", "b");

    expect(calls).toBe(0);
    const result = lazy[ENTRIES]();

    expect(result).toEqual([["b", 2], ["a", 1]]);
    expect(calls).toBe(2);
  });

  it("GROUP_BY: lazy source -> eagerly snapshots groups without rerunning callbacks", () => {
    const query = createQueryable({ 1: 1, 2: 2, 3: 3 });
    let calls = 0;
    const lazy = query[LAZY]()[MAP](n => { calls++; return n; })[SORT]((a, b) => b - a);

    const groups = lazy[GROUP_BY](n => n % 2 ? "odd" : "even");
    query["3"] = 99;

    expect(calls).toBe(3);
    expect(groups.odd?.[VALUES]()).toEqual([3, 1]);
    expect(groups.odd?.[VALUES]()).toEqual([3, 1]);
    expect(calls).toBe(3);
  });
});

describe("type inference", () => {
  it("WHERE and FIND: type guards -> narrow eager, ordered and lazy values", () => {
    const source = createQueryable<number | string>({ a: 1, b: "two" });
    const isString = (value: number | string): value is string => typeof value === "string";

    const eager = source[WHERE](isString);
    const ordered = source[SORT](() => 0)[WHERE](isString);
    const lazy = source[LAZY]()[WHERE](isString);

    expectTypeOf(eager).toEqualTypeOf<Queryable<string>>();
    expectTypeOf(ordered).toEqualTypeOf<QuerySequence<string>>();
    expectTypeOf(lazy).toEqualTypeOf<QuerySequence<string>>();
    expectTypeOf(source[FIND](isString)).toEqualTypeOf<string | undefined>();
    expectTypeOf(source[LAZY]()[FIND](isString)).toEqualTypeOf<string | undefined>();
    expect(eager[VALUES]()).toEqual(["two"]);
    expect(ordered[VALUES]()).toEqual(["two"]);
    expect(lazy[VALUES]()).toEqual(["two"]);
  });

  it("GROUP_BY: literal union key -> preserves possible keys without claiming presence", () => {
    const query = createQueryable({ a: 2 });

    const groups = query[GROUP_BY](n => n % 2 ? "odd" : "even");

    expectTypeOf(groups).toEqualTypeOf<Partial<Record<"odd" | "even", Queryable<number>>>>();
    expectTypeOf(groups.even).toEqualTypeOf<Queryable<number> | undefined>();
    expect(groups.odd).toBeUndefined();
  });
});
