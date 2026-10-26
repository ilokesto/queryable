import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DROP_LAST, DROP_WHILE, ENTRIES, FIRST, LAZY, LIMIT, MAP, PICK, SKIP, SORT,
  TAKE_LAST, TAKE_WHILE, VALUES, createQueryable,
} from "./index.js";
import type { Queryable, QuerySequence } from "./index.js";

describe.each(["record", "ordered", "lazy"] as const)("%s bounds", mode => {
  function query<T>(record: Record<string, T>): QuerySequence<T> {
    const source = createQueryable(record);
    return mode === "record" ? source : mode === "ordered" ? source[SORT](() => 0) : source[LAZY]();
  }

  it.each([0, -0, -1, -1.9, -Infinity, NaN, 0.9, 1, 1.9, 2, 3, 10, Infinity])(
    "numeric bounds: %s -> consistent nonnegative truncated sizes",
    bound => {
      const source = query({ a: 1, b: 2, c: 3 });
      const size = Number.isNaN(bound) ? 0 : Math.max(0, Math.trunc(bound));
      const entries = [["a", 1], ["b", 2], ["c", 3]];

      const results = [source[SKIP](bound)[ENTRIES](), source[TAKE_LAST](bound)[ENTRIES](), source[DROP_LAST](bound)[ENTRIES]()];

      expect(results).toEqual([
        entries.slice(size),
        size === 0 ? [] : entries.slice(-size),
        size === 0 ? entries : entries.slice(0, -size),
      ]);
    },
  );

  it("prefixes: first mismatch -> keep or drop only the prefix with original keys", () => {
    const source = query({ a: 1, b: 2, c: 1 });
    const taken: string[] = [];
    const dropped: string[] = [];

    const results = [
      source[TAKE_WHILE]((n, key) => { taken.push(key); return n === 1; })[ENTRIES](),
      source[DROP_WHILE]((n, key) => { dropped.push(key); return n === 1; })[ENTRIES](),
    ];

    expect(results).toEqual([[["a", 1]], [["b", 2], ["c", 1]]]);
    expect(taken).toEqual(["a", "b"]);
    expect(dropped).toEqual(["a", "b"]);
  });

  it.each([true, false])("prefixes: constant %s -> full or empty results", matches => {
    const source = query({ a: 1, b: 2 });

    const results = [source[TAKE_WHILE](() => matches)[VALUES](), source[DROP_WHILE](() => matches)[VALUES]()];

    expect(results).toEqual(matches ? [[1, 2], []] : [[], [1, 2]]);
  });

  it("all operators: empty input -> no predicate calls and empty results", () => {
    const source = query<number>({});
    const predicate = () => { throw new Error("empty"); };

    const results = [
      source[SKIP](1), source[TAKE_LAST](1), source[DROP_LAST](1),
      source[TAKE_WHILE](predicate), source[DROP_WHILE](predicate),
    ].map(result => result[VALUES]());

    expect(results).toEqual([[], [], [], [], []]);
  });

  it("bounds: stored undefined and special keys -> safe keyed values without sentinels", () => {
    const source = query<number | undefined>(Object.fromEntries([
      ["__proto__", undefined], ["constructor", 2], ["toString", undefined],
    ]));

    const results = [
      source[SKIP](1)[ENTRIES](), source[TAKE_LAST](2)[ENTRIES](), source[DROP_LAST](1)[ENTRIES](),
      source[TAKE_WHILE](() => true)[ENTRIES](), source[DROP_WHILE](n => n === undefined)[ENTRIES](),
    ];

    expect(results).toEqual([
      [["constructor", 2], ["toString", undefined]],
      [["constructor", 2], ["toString", undefined]],
      [["__proto__", undefined], ["constructor", 2]],
      [["__proto__", undefined], ["constructor", 2], ["toString", undefined]],
      [["constructor", 2], ["toString", undefined]],
    ]);
  });

  it("tail ring: multiple wraps -> suffix and prefix stay in input order", () => {
    const source = query(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i])));

    const results = [source[TAKE_LAST](3)[VALUES](), source[DROP_LAST](3)[VALUES]()];

    expect(results).toEqual([[14, 15, 16], Array.from({ length: 14 }, (_, i) => i)]);
  });

  it("methods: chained queries -> shared prototype functions without own bindings", () => {
    const source = query({ a: 1, b: 2 });
    const chained = source[SKIP](0)[TAKE_WHILE](() => true)[DROP_WHILE](() => false)[TAKE_LAST](2)[DROP_LAST](0);

    for (const symbol of [SKIP, TAKE_WHILE, DROP_WHILE, TAKE_LAST, DROP_LAST] as const) {
      expect(chained[symbol]).toBe(source[symbol]);
      expect(Object.hasOwn(chained, symbol)).toBe(false);
    }
    expect(chained[VALUES]()).toEqual([1, 2]);
  });
});

describe("bounds modes and types", () => {
  it("bounds: sorted numeric keys -> preserve sequence order rather than object ordering", () => {
    const source = createQueryable({ 1: 1, 2: 2, 3: 3, 4: 4 })[SORT]((a, b) => b - a);

    const results = [source[SKIP](1)[TAKE_LAST](2)[ENTRIES](), source[DROP_LAST](1)[ENTRIES]()];

    expect(results).toEqual([[["2", 2], ["1", 1]], [["4", 4], ["3", 3], ["2", 2]]]);
  });

  it("TAKE_WHILE: type guard -> narrows all modes while DROP_WHILE keeps the union", () => {
    const source = createQueryable<number | string>({ a: "one", b: 2, c: "three" });
    const isString = (value: number | string): value is string => typeof value === "string";
    const record = source[TAKE_WHILE](isString);
    const ordered = source[SORT](() => 0)[TAKE_WHILE](isString);
    const lazy = source[LAZY]()[TAKE_WHILE](isString);

    expectTypeOf(record).toEqualTypeOf<Queryable<string>>();
    expectTypeOf(ordered).toEqualTypeOf<QuerySequence<string>>();
    expectTypeOf(lazy).toEqualTypeOf<QuerySequence<string>>();
    expectTypeOf(source[DROP_WHILE](isString)).toEqualTypeOf<Queryable<number | string>>();
    expectTypeOf(source[LAZY]()[DROP_WHILE](isString)).toEqualTypeOf<QuerySequence<number | string>>();
    expectTypeOf(source[SKIP](1)[TAKE_LAST](2)[DROP_LAST](1)).toEqualTypeOf<Queryable<number | string>>();
    expect([record[VALUES](), ordered[VALUES](), lazy[VALUES]()]).toEqual([["one"], ["one"], ["one"]]);
  });

  it.each(["record", "ordered"] as const)("prefixes: eager %s errors -> throw on operation", mode => {
    const record = createQueryable({ a: 1 });
    const source: QuerySequence<number> = mode === "record" ? record : record[SORT](() => 0);
    const error = new Error("prefix failed");
    const predicate = () => { throw error; };

    expect(() => source[TAKE_WHILE](predicate)).toThrow(error);
    expect(() => source[DROP_WHILE](predicate)).toThrow(error);
  });
});

describe("lazy bounds demand", () => {
  it.each([
    [SKIP, 2, 3, 3], [DROP_LAST, 2, 1, 3], [TAKE_LAST, 2, 4, 5],
    [TAKE_LAST, 0, undefined, 0], [DROP_LAST, 0, 1, 1],
    [SKIP, Infinity, undefined, 5], [DROP_LAST, Infinity, undefined, 5],
    [TAKE_LAST, Infinity, 1, 5],
  ] as const)("numeric operator %s(%s): FIRST -> exact upstream demand", (symbol, size, expected, pulls) => {
    const visited: number[] = [];
    const lazy = createQueryable({ a: 1, b: 2, c: 3, d: 4, e: 5 })[LAZY]()
      [MAP](n => { visited.push(n); return n; })[symbol](size);

    expect(visited).toEqual([]);
    expect(lazy[FIRST]()).toBe(expected);
    expect(visited).toEqual([1, 2, 3, 4, 5].slice(0, pulls));
  });

  it("prefixes: early terminals -> no extra pull or predicate call", () => {
    const visited: number[] = [];
    const tested: number[] = [];
    const source = createQueryable({ a: 1, b: 2, c: 3, d: 4 })[LAZY]()
      [MAP](n => { visited.push(n); return n; });
    const predicate = (n: number) => { tested.push(n); return n < 3; };

    expect(source[TAKE_WHILE](predicate)[LIMIT](1)[VALUES]()).toEqual([1]);
    expect(visited).toEqual([1]);
    expect(tested).toEqual([1]);
    visited.length = 0;
    tested.length = 0;
    expect(source[DROP_WHILE](predicate)[FIRST]()).toBe(3);
    expect(visited).toEqual([1, 2, 3]);
    expect(tested).toEqual([1, 2, 3]);
  });

  it.each([SKIP, TAKE_LAST, DROP_LAST] as const)("operator %s: zero downstream LIMIT -> never pulls upstream", symbol => {
    const lazy = createQueryable({ a: 1 })[LAZY]()[MAP](() => { throw new Error("unneeded"); })[symbol](2);

    expect(lazy[LIMIT](0)[VALUES]()).toEqual([]);
  });

  it.each([SKIP, TAKE_LAST, DROP_LAST] as const)("operator %s: repeat/live consumption -> fresh state after early termination", symbol => {
    const source = createQueryable({ a: 1, b: 2, c: 3 });
    const lazy = source[LAZY]()[symbol](1);
    const before = lazy[VALUES]();
    lazy[FIRST]();
    source.d = 4;

    const after = lazy[VALUES]();

    expect(before).toEqual(symbol === SKIP ? [2, 3] : symbol === TAKE_LAST ? [3] : [1, 2]);
    expect(after).toEqual(symbol === SKIP ? [2, 3, 4] : symbol === TAKE_LAST ? [4] : [1, 2, 3]);
    expect(lazy[VALUES]()).toEqual(after);
  });

  it.each([TAKE_WHILE, DROP_WHILE] as const)("operator %s: deferred failure -> next consumption starts fresh and live", symbol => {
    const source = createQueryable({ a: 1, b: 2, c: 3 });
    const error = new Error("deferred prefix");
    let fail = true;
    const lazy = source[LAZY]()[symbol](n => {
      if (fail) { throw error; }
      return n < 3;
    });

    expect(() => lazy[VALUES]()).toThrow(error);
    fail = false;
    expect(lazy[FIRST]()).toBe(symbol === TAKE_WHILE ? 1 : 3);
    source.a = 4;
    expect(lazy[VALUES]()).toEqual(symbol === TAKE_WHILE ? [] : [4, 2, 3]);
  });

  it.each([SKIP, TAKE_LAST, DROP_LAST] as const)("operator %s: upstream failure -> deferred and retried", symbol => {
    const error = new Error("upstream failure");
    let fail = true;
    const lazy = createQueryable({ a: 1, b: 2, c: 3 })[LAZY]()[MAP](n => {
      if (fail && n === 2) { throw error; }
      return n;
    })[symbol](1);

    expect(() => lazy[VALUES]()).toThrow(error);
    fail = false;
    expect(lazy[VALUES]()).toEqual(symbol === SKIP ? [2, 3] : symbol === TAKE_LAST ? [3] : [1, 2]);
  });

  it.each(["sort", "pick", "negative limit"] as const)("bounds: after %s barrier -> do not shortcut upstream buffering", barrier => {
    const visited: number[] = [];
    const source = createQueryable({ a: 1, b: 2, c: 3, d: 4 })[LAZY]()
      [MAP](n => { visited.push(n); return n; });
    const blocked = barrier === "sort" ? source[SORT]((a, b) => b - a)
      : barrier === "pick" ? source[PICK]("d", "a") : source[LIMIT](-1);

    const result = blocked[SKIP](1)[TAKE_WHILE](() => true)[DROP_LAST](0)[FIRST]();

    expect(result).toBe(barrier === "sort" ? 3 : barrier === "pick" ? 1 : 2);
    expect(visited).toEqual([1, 2, 3, 4]);
  });
});
