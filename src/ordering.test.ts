import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createQueryable, ENTRIES, LAZY, LIMIT, MAP, MAX_BY, MIN_BY, NTH_BY, RANK_BY,
  SORT, SORT_BY, TOP_K, VALUES,
} from "./index.js";
import type { OrderKey, OrderRule, OrderRules, QuerySequence } from "./index.js";

const ascending = { select: (value: number) => value } satisfies OrderRule<number>;

describe("selector ordering", () => {
  it("SORT_BY: multiple rules and integer keys -> stable lexicographic sequence", () => {
    const query = createQueryable<{ group: string; score: number }>({
      2: { group: "a", score: 2 }, 1: { group: "a", score: 2 },
      z: { group: "b", score: 4 }, a: { group: "a", score: 1 },
    });

    const result = query[SORT_BY](
      { select: value => value.group }, { select: value => value.score, direction: "desc" },
    );

    expect(result[ENTRIES]().map(([key]) => key)).toEqual(["1", "2", "a", "z"]);
    expectTypeOf(result).toEqualTypeOf<QuerySequence<{ group: string; score: number }>>();
    expect(result[MAP](value => value.score)[LIMIT](2)[VALUES]()).toEqual([2, 2]);
    expect(Object.keys(query)).toEqual(["1", "2", "z", "a"]);
  });

  it("SORT_BY: mixed scalar keys -> documented total order and stable NaN ties", () => {
    const values: OrderKey[] = [undefined, null, NaN, Infinity, -Infinity, 0, -0, "a", 2n, true, false, NaN];
    const query = createQueryable(Object.fromEntries(values.map((value, index) => [String(index), value])));

    const ordered = query[SORT_BY]({ select: value => value })[VALUES]();

    expect(ordered).toEqual([false, true, -Infinity, 0, -0, Infinity, NaN, NaN, 2n, "a", null, undefined]);
    expect(query[SORT_BY]({ select: value => value, direction: "desc" })[VALUES]())
      .toEqual([undefined, null, "a", 2n, NaN, NaN, Infinity, 0, -0, -Infinity, true, false]);
  });

  it("SORT_BY: lazy reconsumption -> all rules run once per entry each time", () => {
    const query = createQueryable({ a: 3, b: 1, c: 2 });
    const calls: string[] = [];
    const sorted = query[LAZY]()[SORT_BY](
      { select: (value, key) => { calls.push(`first:${key}`); return value; } },
      { select: (value, key) => { calls.push(`second:${key}`); return value; } },
    );
    expect(calls).toEqual([]);

    expect(sorted[VALUES]()).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(6);
    query.d = 0;
    expect(sorted[VALUES]()).toEqual([0, 1, 2, 3]);
    expect(calls).toHaveLength(14);
  });

  it("SORT_BY: eager snapshot and later source replacement -> isolated entry membership", () => {
    const source = { a: 2, b: 1 };
    const query = createQueryable(source);
    let calls = 0;

    const sorted = query[SORT_BY]({ select: value => { calls++; return value; } });
    source.a = 9;
    query.a = 8;
    query.c = 0;

    expect(sorted[LAZY]()[VALUES]()).toEqual([1, 2]);
    expect(calls).toBe(2);
    expect(query[VALUES]()).toEqual([8, 1, 0]);
  });

  it("SORT_BY and SORT: repeated ordering -> existing comparator semantics retained", () => {
    const query = createQueryable({ a: 3, b: 1, c: 2 });

    const result = query[SORT_BY](ascending)[SORT]((a, b) => b - a)[SORT](() => 0);

    expect(result[VALUES]()).toEqual([3, 2, 1]);
  });

  it("ordering rules: scalar selectors and directions -> strict public types", () => {
    type AcceptsObject = { select: (value: number) => { value: number } } extends OrderRule<number> ? true : false;
    type AcceptsDirection = { select: (value: number) => number; direction: "sideways" } extends OrderRule<number> ? true : false;
    type AcceptsEmpty = [] extends OrderRules<number> ? true : false;
    const query = createQueryable<number | undefined>({ a: undefined });

    expectTypeOf<AcceptsObject>().toEqualTypeOf<false>();
    expectTypeOf<AcceptsDirection>().toEqualTypeOf<false>();
    expectTypeOf<AcceptsEmpty>().toEqualTypeOf<false>();
    expectTypeOf(query[MIN_BY]({ select: value => value })).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[MAX_BY]({ select: value => value })).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[NTH_BY](0, { select: value => value })).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[RANK_BY]("a", { select: value => value })).toEqualTypeOf<number | undefined>();
    expectTypeOf(query[TOP_K](1, { select: value => value })).toEqualTypeOf<QuerySequence<number | undefined>>();
  });
});

describe("extrema and selection", () => {
  it.each([MIN_BY, MAX_BY] as const)("extremum %s: tied keys -> first value wins without a sort", method => {
    const query = createQueryable({ a: { n: 2 }, b: { n: 2 }, c: { n: 2 } });
    let calls = 0;

    const result = query[method]({ select: value => { calls++; return value.n; } });

    expect(result).toBe(query.a);
    expect(calls).toBe(3);
  });

  it("extrema: mixed directions -> same key extrema as a pure sorted oracle", () => {
    const query = createQueryable({ a: { n: 3 }, b: { n: 1 }, c: { n: 2 } });
    const rule = { select: (value: { n: number }) => value.n, direction: "desc" } satisfies OrderRule<{ n: number }>;

    const result = [query[MIN_BY](rule), query[MAX_BY](rule)];

    expect(result).toEqual([query.a, query.b]);
  });

  it("selection: adversarial inputs and K/N boundaries -> stable sort oracle", () => {
    const inputs = [
      Array.from({ length: 257 }, (_, i) => i),
      Array.from({ length: 257 }, (_, i) => 256 - i),
      Array.from({ length: 257 }, () => 1),
      Array.from({ length: 257 }, (_, i) => (i * 137) % 23),
    ];
    for (const input of inputs) {
      const query = createQueryable(Object.fromEntries(input.map((n, i) => [`k${i}`, { n }])));
      const rules: OrderRules<{ n: number }> = [{ select: value => value.n }];
      const oracle = Object.entries(query).sort((a, b) => a[1].n - b[1].n);

      for (const k of [0, 1, 2, 25, 256, 257, 258, Number.MAX_SAFE_INTEGER]) {
        expect(query[TOP_K](k, ...rules)[ENTRIES]()).toEqual(oracle.slice(0, k));
      }
      for (const index of [-Number.MAX_SAFE_INTEGER, -258, -257, -25, -1, -0, 0, 1, 25, 256, 257, Number.MAX_SAFE_INTEGER]) {
        expect(query[NTH_BY](index, ...rules)).toBe(oracle.at(index)?.[1]);
      }
      for (const [position, entry] of oracle.entries()) {
        expect(query[RANK_BY](entry[0], ...rules)).toBe(position);
      }
    }
  });

  it("TOP_K: all scalar categories with ties -> SORT_BY oracle for both directions", () => {
    const query = createQueryable<OrderKey>({
      ["__proto__"]: undefined, constructor: null, toString: NaN, 1: -Infinity, 2: Infinity,
      a: NaN, b: 0, c: -0, d: "x", e: 1n, f: true, g: false,
    });
    for (const direction of ["asc", "desc"] as const) {
      const rule: OrderRule<OrderKey> = { select: value => value, direction };
      const oracle = query[SORT_BY](rule)[ENTRIES]();

      for (let k = 0; k <= oracle.length + 1; k++) {
        expect(query[TOP_K](k, rule)[ENTRIES]()).toEqual(oracle.slice(0, k));
      }
      expect(query[RANK_BY]("__proto__", rule)).toBe(oracle.findIndex(([key]) => key === "__proto__"));
      expect(query[NTH_BY](-1, rule)).toBe(oracle.at(-1)?.[1]);
    }
  });

  it("selection: multiple mixed-direction rules -> cached stable oracle", () => {
    const query = createQueryable({
      a: { team: "b", score: 4 }, b: { team: "a", score: 2 },
      c: { team: "a", score: 3 }, d: { team: "a", score: 3 },
    });
    let calls = 0;
    const rules: OrderRules<{ team: string; score: number }> = [
      { select: value => { calls++; return value.team; } },
      { select: value => { calls++; return value.score; }, direction: "desc" },
    ];
    const oracle = [query.c, query.d, query.b, query.a];

    expect(query[TOP_K](3, ...rules)[VALUES]()).toEqual(oracle.slice(0, 3));
    expect(calls).toBe(8);
    expect(query[NTH_BY](-3, ...rules)).toBe(query.d);
    expect(calls).toBe(16);
    expect(query[RANK_BY]("d", ...rules)).toBe(1);
    expect(calls).toBe(24);
    expect(query[MIN_BY](...rules)).toBe(query.c);
    expect(query[MAX_BY](...rules)).toBe(query.a);
    expect(calls).toBe(40);
  });

  it("NTH_BY: large sorted and reverse inputs -> bounded iterative selection", () => {
    for (const reverse of [false, true]) {
      const input = Object.fromEntries(Array.from(
        { length: 20000 }, (_, index) => [`k${index}`, reverse ? 19999 - index : index],
      ));
      const query = createQueryable(input);

      expect(query[NTH_BY](9999, ascending)).toBe(9999);
      expect(query[NTH_BY](-10000, ascending)).toBe(10000);
    }
  });

  it("selection: empty input or absent positions -> undefined or empty winners", () => {
    const empty = createQueryable<number>({});
    const query = createQueryable<number | undefined>({ ["__proto__"]: undefined });

    expect(empty[MIN_BY](ascending)).toBeUndefined();
    expect(empty[MAX_BY](ascending)).toBeUndefined();
    expect(empty[NTH_BY](-1, ascending)).toBeUndefined();
    expect(empty[RANK_BY]("missing", ascending)).toBeUndefined();
    expect(empty[TOP_K](2, ascending)[VALUES]()).toEqual([]);
    expect(query[TOP_K](1, { select: value => value })[ENTRIES]()).toEqual([["__proto__", undefined]]);
    expect(query[RANK_BY]("__proto__", { select: value => value })).toBe(0);
    expect(query[RANK_BY]("missing", { select: value => value })).toBeUndefined();
  });

  it.each([NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "numeric positions: %s -> RangeError before consuming lazy input", position => {
      let calls = 0;
      const query = createQueryable({ a: 1 })[LAZY]()[MAP](value => { calls++; return value; });

      expect(() => query[TOP_K](position, ascending)).toThrow(RangeError);
      expect(() => query[NTH_BY](position, ascending)).toThrow(RangeError);
      expect(calls).toBe(0);
    },
  );

  it("TOP_K: negative K and zero K -> reject negative and do not consume zero", () => {
    let calls = 0;
    const query = createQueryable({ a: 1 })[LAZY]()[MAP](value => { calls++; return value; });

    expect(() => query[TOP_K](-1, ascending)).toThrow(RangeError);
    expect(query[TOP_K](-0, ascending)[VALUES]()).toEqual([]);
    expect(calls).toBe(0);
  });

  it("selection terminals: live lazy source -> selectors recomputed once on each consumption", () => {
    const query = createQueryable({ a: 3, b: 1, c: 2 });
    for (const consume of [
      (source: QuerySequence<number>, rule: OrderRule<number>) => source[MIN_BY](rule),
      (source: QuerySequence<number>, rule: OrderRule<number>) => source[MAX_BY](rule),
      (source: QuerySequence<number>, rule: OrderRule<number>) => source[NTH_BY](-1, rule),
      (source: QuerySequence<number>, rule: OrderRule<number>) => source[RANK_BY]("a", rule),
    ]) {
      let calls = 0;
      const rule: OrderRule<number> = { select: value => { calls++; return value; } };
      const lazy = query[LAZY]();
      const before = Object.keys(query).length;

      consume(lazy, rule);
      expect(calls).toBe(Object.keys(query).length);
      query.d = 0;
      consume(lazy, rule);
      expect(calls).toBe(before + Object.keys(query).length);
    }
  });

  it("TOP_K: eager and lazy chains -> evaluation timing and live sorted winners", () => {
    const query = createQueryable({ a: 3, b: 1, c: 2 });
    let calls = 0;
    const rule: OrderRule<number> = { select: value => { calls++; return value; } };
    const eager = query[TOP_K](2, rule);
    expect(calls).toBe(3);
    const lazy = query[LAZY]()[TOP_K](2, rule);
    expect(calls).toBe(3);

    expect(lazy[VALUES]()).toEqual([1, 2]);
    expect(calls).toBe(6);
    query.d = 0;
    expect(lazy[VALUES]()).toEqual([0, 1]);
    expect(calls).toBe(10);
    expect(eager[VALUES]()).toEqual([1, 2]);
  });

  it("ordering: lazy LIMIT after a positive selection -> full upstream is consumed", () => {
    for (const select of [
      (query: QuerySequence<number>) => query[SORT_BY](ascending),
      (query: QuerySequence<number>) => query[TOP_K](1, ascending),
    ]) {
      let calls = 0;
      const query = createQueryable({ a: 3, b: 1, c: 2 })[LAZY]()
        [MAP](value => { calls++; return value; });

      expect(select(query)[LIMIT](1)[VALUES]()).toEqual([1]);
      expect(calls).toBe(3);
    }
  });

  it("extrema and ordinal terminals: lazy mutation -> current values and unchanged exceptions", () => {
    const query = createQueryable({ a: 3, b: 1, c: 2 });
    const lazy = query[LAZY]();

    expect(lazy[MIN_BY](ascending)).toBe(1);
    expect(lazy[MAX_BY](ascending)).toBe(3);
    expect(lazy[NTH_BY](-1, ascending)).toBe(3);
    expect(lazy[RANK_BY]("a", ascending)).toBe(2);
    query.a = 0;
    expect(lazy[MIN_BY](ascending)).toBe(0);
    expect(lazy[MAX_BY](ascending)).toBe(2);
    expect(lazy[NTH_BY](-1, ascending)).toBe(2);
    expect(lazy[RANK_BY]("a", ascending)).toBe(0);
    const sentinel = new Error("selector failure");
    const rule: OrderRule<number> = { select: () => { throw sentinel; } };
    for (const consume of [
      () => lazy[MIN_BY](rule), () => lazy[MAX_BY](rule),
      () => lazy[NTH_BY](0, rule), () => lazy[RANK_BY]("a", rule),
    ]) {
      let caught: unknown;
      try { consume(); } catch (error) { caught = error; }
      expect(caught).toBe(sentinel);
    }
  });

  it("ordering callbacks: thrown sentinel -> exact identity at eager and lazy consumption", () => {
    const sentinel = { failure: true };
    const rule: OrderRule<number> = { select: () => { throw sentinel; } };
    const query = createQueryable({ a: 1 });
    const operations = [
      () => query[SORT_BY](rule), () => query[TOP_K](1, rule),
      () => query[MIN_BY](rule), () => query[MAX_BY](rule),
      () => query[NTH_BY](0, rule), () => query[RANK_BY]("a", rule),
    ];
    const deferred = [query[LAZY]()[SORT_BY](rule), query[LAZY]()[TOP_K](1, rule)];
    for (const operation of [...operations, ...deferred.map(result => () => result[VALUES]())]) {
      let caught: unknown;
      try { operation(); } catch (error) { caught = error; }
      expect(caught).toBe(sentinel);
    }
    for (const result of deferred) {
      let caught: unknown;
      try { result[VALUES](); } catch (error) { caught = error; }
      expect(caught).toBe(sentinel);
    }
  });

  it("ordering methods: independent instances and chains -> shared frozen prototype functions", () => {
    const a = createQueryable({ a: 1 });
    const b = createQueryable({ b: 2 });
    const sequence = a[SORT_BY](ascending);
    const other = b[TOP_K](1, ascending);

    for (const method of [SORT_BY, TOP_K, MIN_BY, MAX_BY, NTH_BY, RANK_BY] as const) {
      expect(a[method]).toBe(b[method]);
      expect(sequence[method]).toBe(other[method]);
      expect(Object.hasOwn(a, method)).toBe(false);
      expect(Object.hasOwn(sequence, method)).toBe(false);
    }
    for (const method of [MIN_BY, MAX_BY, NTH_BY, RANK_BY] as const) {
      expect(a[method]).toBe(sequence[method]);
    }
    expect(Object.isFrozen(Object.getPrototypeOf(sequence))).toBe(true);
    expect(Object.isFrozen(Object.getPrototypeOf(a))).toBe(true);
  });
});
