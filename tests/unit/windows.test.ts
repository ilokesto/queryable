import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CHUNK, WINDOW, PAIRWISE, SPLIT, PARTITION_BY, ENTRIES, FIRST, GROUP_BY,
  LAZY, LIMIT, MAP, SORT, TO_OBJECT, VALUES,
  createQueryable, createQuerySequence, iterateValues,
} from "../../src/index.js";
import type { EntryBuffer, EntryPair, QuerySequence } from "../../src/index.js";

describe("entry buffers", () => {
  it.each([false, true])("CHUNK: eager/lazy %s with tail -> original anchors and partial chunk", lazy => {
    const record = createQueryable({ a: 1, b: 2, c: undefined });
    const query = lazy ? record[LAZY]() : record;

    const result = query[CHUNK](2);

    expect(result[ENTRIES]()).toEqual([
      ["a", [["a", 1], ["b", 2]]], ["c", [["c", undefined]]],
    ]);
    expectTypeOf(result).toEqualTypeOf<QuerySequence<EntryBuffer<number | undefined>>>();
  });

  it("WINDOW: bounded deterministic inputs -> slice oracle for overlap gaps and partial tails", () => {
    for (let length = 0; length <= 7; length++) {
      const entries: [string, number][] = Array.from({ length }, (_, n) => [`k${n}`, n]);
      for (const size of [1, 2, 3, 8]) {
        for (const stride of [1, 2, 4, 9]) {
          for (const partial of [false, true]) {
            const expected = [];
            for (let start = 0; start < length; start += stride) {
              const slice = entries.slice(start, start + size);
              if (partial || slice.length === size) {
                expected.push([`k${start}`, slice]);
              }
            }
            const query = createQuerySequence(() => entries);

            expect(query[WINDOW](size, stride, partial)[ENTRIES]()).toEqual(expected);
          }
        }
      }
    }
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity])(
    "CHUNK/WINDOW: invalid size/stride %s -> immediate RangeError without pulling",
    invalid => {
      let acquired = 0;
      const query = createQuerySequence<number>(() => { acquired++; return []; });

      expect(() => query[CHUNK](invalid)).toThrow(RangeError);
      expect(() => query[WINDOW](invalid)).toThrow(RangeError);
      expect(() => query[WINDOW](2, invalid)).toThrow(RangeError);
      expect(acquired).toBe(0);
    },
  );

  it("PAIRWISE: short and populated inputs -> exact two-entry tuples without partial pair", () => {
    const query = createQueryable({ a: undefined, b: 2, c: 3 });

    const pairs = query[PAIRWISE]();

    expect(pairs[VALUES]()).toEqual([
      [["a", undefined], ["b", 2]], [["b", 2], ["c", 3]],
    ]);
    expect(createQueryable({ a: 1 })[PAIRWISE]()[VALUES]()).toEqual([]);
    expect(createQueryable<number>({})[PAIRWISE]()[VALUES]()).toEqual([]);
    expectTypeOf(pairs).toEqualTypeOf<QuerySequence<EntryPair<number | undefined>>>();
    expectTypeOf(pairs[FIRST]()).toEqualTypeOf<
      [[string, number | undefined], [string, number | undefined]] | undefined
    >();
  });

  it.each([false, true])("buffers: exposed eager/lazy %s arrays and tuples -> independent across pulls", lazy => {
    const record = createQueryable({ a: 1, b: 2, c: 3 });
    const query = lazy ? record[LAZY]() : record;
    const windows = query[WINDOW](2);
    const expected = [[["a", 1], ["b", 2]], [["b", 2], ["c", 3]]];

    const iterator = iterateValues(windows)[Symbol.iterator]();
    const first = iterator.next().value;
    if (first) { first[0]?.splice(0, 2); first.push(["corrupt", 9]); }
    const second = iterator.next().value;
    iterator.return?.();

    expect(second).toEqual(expected[1]);
    expect(windows[VALUES]()).toEqual(expected);
    const pairs = query[PAIRWISE]();
    const exposed = pairs[FIRST]();
    if (exposed) { exposed[0][0] = "corrupt"; exposed[1][1] = 9; }
    expect(pairs[VALUES]()).toEqual(expected);
  });

  it("SPLIT: leading repeated trailing delimiters -> excludes delimiters and empty groups", () => {
    const calls: [number, string][] = [];
    const query = createQueryable({ a: 0, b: 1, c: 0, d: 0, e: 2, f: 3, g: 0 });

    const result = query[SPLIT]((value, key) => { calls.push([value, key]); return value === 0; });

    expect(result[ENTRIES]()).toEqual([
      ["b", [["b", 1]]], ["e", [["e", 2], ["f", 3]]],
    ]);
    expect(calls).toEqual(query[ENTRIES]().map(([key, value]) => [value, key]));
    expect(createQueryable({ a: 0 })[SPLIT](() => true)[VALUES]()).toEqual([]);
    expect(query[SPLIT](() => false)[VALUES]()).toEqual([query[ENTRIES]()]);
  });

  it("PARTITION_BY: A,A,B,A -> three ordered groups rather than global GROUP_BY", () => {
    const query = createQueryable({ a: "A", b: "A", c: "B", d: "A" });

    const groups = query[PARTITION_BY](value => value);

    expect(groups[ENTRIES]()).toEqual([
      ["a", [["a", "A"], ["b", "A"]]], ["c", [["c", "B"]]], ["d", [["d", "A"]]],
    ]);
    expect(query[GROUP_BY](value => value).A?.[VALUES]()).toEqual(["A", "A", "A"]);
  });

  it("PARTITION_BY: undefined NaN signed zeros and references -> SameValueZero boundaries", () => {
    const shared = {};
    const distinct = {};
    const values: unknown[] = [undefined, undefined, NaN, NaN, -0, 0, shared, shared, distinct, undefined];
    const query = createQuerySequence(() => values.map((value, n): [string, unknown] => [`k${n}`, value]));

    const groups = query[PARTITION_BY](value => value)[VALUES]();

    expect(groups.map(group => group.length)).toEqual([2, 2, 2, 2, 1, 1]);
    expect(groups.flat().map(entry => entry[1])).toEqual(values);
  });

  it("buffer operations: empty input -> no groups or callbacks", () => {
    const query = createQueryable<number>({})[LAZY]();
    const unexpected = () => { throw new Error("empty callback"); };

    expect(query[CHUNK](2)[VALUES]()).toEqual([]);
    expect(query[WINDOW](2, 1, true)[VALUES]()).toEqual([]);
    expect(query[SPLIT](unexpected)[VALUES]()).toEqual([]);
    expect(query[PARTITION_BY](unexpected)[VALUES]()).toEqual([]);
  });

  it("buffers: special/numeric keys and sorted order -> unique original anchors and shallow values", () => {
    const value = { rank: 3 };
    const query = createQueryable(Object.fromEntries([
      ["1", value], ["2", { rank: 2 }], ["__proto__", { rank: 1 }], ["constructor", { rank: 0 }],
    ]))[SORT]((a, b) => a.rank - b.rank);

    const result = query[WINDOW](2, 1, true);

    expect(result[ENTRIES]().map(([key]) => key)).toEqual(["constructor", "__proto__", "2", "1"]);
    expect(Object.hasOwn(result[TO_OBJECT](), "__proto__")).toBe(true);
    expect(result[VALUES]().at(-1)?.[0]?.[1]).toBe(value);
    expect(result[MAP](group => group.length)[VALUES]()).toEqual([2, 2, 2, 1]);
  });

  it("LAZY buffers: record mutation and reentrant consumption -> live independent traversal", () => {
    const record = createQueryable({ a: 1, b: 1, c: 2 });
    const query = record[LAZY]()[PARTITION_BY](value => value);
    const first = iterateValues(query)[Symbol.iterator]();

    expect(first.next().value).toEqual([["a", 1], ["b", 1]]);
    expect(query[VALUES]()).toEqual([[["a", 1], ["b", 1]], [["c", 2]]]);
    expect(first.next().value).toEqual([["c", 2]]);
    first.return?.();
    record.b = 2;

    expect(query[VALUES]()).toEqual([[["a", 1]], [["b", 2], ["c", 2]]]);
  });

  it.each(["chunk", "window", "pair", "split", "partition"] as const)(
    "%s: prefix consumer -> minimum pulls and one upstream close on each consumption",
    operation => {
      let pulled = 0;
      let closed = 0;
      const source = createQuerySequence(function* () {
        try {
          for (let n = 0; n < 6; n++) { pulled++; yield [`k${n}`, n] as const; }
        } finally { closed++; }
      });
      const query = operation === "chunk" ? source[CHUNK](2)
        : operation === "window" ? source[WINDOW](2, 4)
        : operation === "pair" ? source[PAIRWISE]()
        : operation === "split" ? source[SPLIT](n => n === 2)
        : source[PARTITION_BY](n => Math.floor(n / 2));

      expect(query[LIMIT](0)[VALUES]()).toEqual([]);
      expect(pulled).toBe(0);
      expect(query[FIRST]()).toEqual([["k0", 0], ["k1", 1]]);
      expect(pulled).toBe(operation === "split" || operation === "partition" ? 3 : 2);
      expect(closed).toBe(1);
      expect(query[FIRST]()).toEqual([["k0", 0], ["k1", 1]]);
      expect(closed).toBe(2);
    },
  );

  it.each(["split", "partition"] as const)(
    "%s: callback failure -> exact thrown identity cleanup and fresh retry",
    operation => {
      const failure = {};
      let closed = 0;
      let fail = true;
      const source = createQuerySequence(function* () {
        try { yield ["a", undefined] as const; yield ["b", 1] as const; }
        finally { closed++; }
      });
      const callback = (value: number | undefined) => {
        if (fail) { throw failure; }
        return value === undefined;
      };
      const query = operation === "split" ? source[SPLIT](callback) : source[PARTITION_BY](callback);
      let caught: unknown;

      try { query[VALUES](); } catch (error) { caught = error; }
      expect(caught).toBe(failure);
      expect(closed).toBe(1);
      fail = false;

      expect(query[VALUES]().flat().map(entry => entry[1])).toEqual(operation === "split" ? [1] : [undefined, 1]);
      expect(closed).toBe(2);
    },
  );

  it("buffer methods: independent records and sequence chains -> frozen shared prototype functions", () => {
    const record = createQueryable({ a: 1 });
    const other = createQueryable({ b: 2 });
    const sequence = record[LAZY]();
    const chained = sequence[CHUNK](1);

    for (const method of [CHUNK, WINDOW, PAIRWISE, SPLIT, PARTITION_BY] as const) {
      expect(record[method]).toBe(other[method]);
      expect(sequence[method]).toBe(chained[method]);
      expect(Object.hasOwn(record, method)).toBe(false);
      expect(Object.hasOwn(chained, method)).toBe(false);
    }
  });

  it("PARTITION_BY: full consumption -> selector once per original entry in order", () => {
    const calls: [number, string][] = [];
    const query = createQueryable({ a: 1, b: 1, c: 2 })[LAZY]()
      [PARTITION_BY]((value, key) => { calls.push([value, key]); return value; });

    expect(calls).toEqual([]);
    expect(query[VALUES]()).toEqual([[["a", 1], ["b", 1]], [["c", 2]]]);

    expect(calls).toEqual([[1, "a"], [1, "b"], [2, "c"]]);
  });

  it.each(["chunk", "window", "pair", "split", "partition"] as const)(
    "%s: source or downstream failure -> unchanged error cleanup and repeatable recovery",
    operation => {
      const failure = {};
      let failSource = true;
      let closed = 0;
      const source = createQuerySequence(function* () {
        try {
          yield ["a", 1] as const;
          if (failSource) { throw failure; }
          yield ["b", 2] as const;
          yield ["c", 3] as const;
        } finally { closed++; }
      });
      const query = operation === "chunk" ? source[CHUNK](2)
        : operation === "window" ? source[WINDOW](2)
        : operation === "pair" ? source[PAIRWISE]()
        : operation === "split" ? source[SPLIT](n => n === 3)
        : source[PARTITION_BY](n => n < 3);
      let caught: unknown;

      try { query[VALUES](); } catch (error) { caught = error; }
      expect(caught).toBe(failure);
      expect(closed).toBe(1);
      failSource = false;
      caught = undefined;
      try { query[MAP](() => { throw failure; })[VALUES](); } catch (error) { caught = error; }
      expect(caught).toBe(failure);
      expect(closed).toBe(2);

      expect(query[FIRST]()).toEqual([["a", 1], ["b", 2]]);
      expect(closed).toBe(3);
    },
  );

  it("PARTITION_BY/SPLIT: eager callbacks and exposed mutation -> snapshot with fresh buffers", () => {
    const query = createQueryable({ a: 1, b: 2, c: 3 });
    let calls = 0;
    const partitioned = query[PARTITION_BY](value => { calls++; return value < 3; });
    const split = query[SPLIT](value => value === 3);
    const expected = [[["a", 1], ["b", 2]]];

    partitioned[FIRST]()?.splice(0);
    split[FIRST]()?.[0]?.splice(0);
    query.a = 9;

    expect(calls).toBe(3);
    expect(partitioned[VALUES]()).toEqual([...expected, [["c", 3]]]);
    expect(split[VALUES]()).toEqual(expected);
    expect(calls).toBe(3);
  });
});
