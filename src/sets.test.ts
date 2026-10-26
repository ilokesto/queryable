import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DIFFERENCE, DuplicateKeyError, ENTRIES, FIRST, INTERSECTION, LAZY, LIMIT,
  MAP, PICK, SORT, TO_OBJECT, UNION, VALUES, createQueryable, createQuerySequence, iterateEntries,
} from "./index.js";
import type { Queryable, QuerySequence } from "./index.js";

const identity = <T>(value: T): T => value;

describe.each(["record", "ordered", "lazy"] as const)("%s sets", mode => {
  function query<T>(record: Record<string, T>): QuerySequence<T> {
    const source = createQueryable(record);
    return mode === "record" ? source : mode === "ordered" ? source[SORT](() => 0) : source[LAZY]();
  }

  it("DIFFERENCE/INTERSECTION/UNION: repeated identities on both sides -> first original set entries", () => {
    const left = query({ a: 1, b: 1, c: 2, d: 2, e: 3 });
    const right = query({ r: 2, s: 2, t: 4, u: 4 });

    const results = [
      left[DIFFERENCE](right, identity, identity)[ENTRIES](),
      left[INTERSECTION](right, identity, identity)[ENTRIES](),
      left[UNION](right, identity, identity)[ENTRIES](),
    ];

    expect(results).toEqual([
      [["a", 1], ["e", 3]], [["c", 2]],
      [["a", 1], ["c", 2], ["e", 3], ["t", 4]],
    ]);
  });

  it("set selectors: asymmetric values -> preserve left payloads and infer each selector", () => {
    const original = { id: 1, name: "one" };
    const left = query({ a: original, b: { id: 2, name: "two" } });
    const right = query({ r: { code: 1 }, s: { code: 3 } });

    const difference = left[DIFFERENCE](right, (value, key) => value.id + key.length, (value, key) => value.code + key.length);
    const intersection = left[INTERSECTION](right, value => value.id, value => value.code);
    const union = left[UNION](right, value => value.id, value => value.code);

    expect(difference[ENTRIES]()).toEqual([["b", { id: 2, name: "two" }]]);
    expect(intersection[FIRST]()).toBe(original);
    expect(union[ENTRIES]()).toEqual([["a", original], ["b", { id: 2, name: "two" }], ["s", { code: 3 }]]);
  });

  it("set equality: NaN, zero signs, undefined, and objects -> SameValueZero and reference identity", () => {
    const shared = { id: 1 };
    const distinct = { id: 1 };
    const left = query({ a: NaN, b: NaN, c: -0, d: 0, e: undefined, f: shared, g: distinct });
    const right = query({ r: NaN, s: 0, t: undefined, u: shared });

    const intersection = left[INTERSECTION](right, identity, identity)[ENTRIES]();
    const difference = left[DIFFERENCE](right, identity, identity)[ENTRIES]();
    const union = left[UNION](right, identity, identity)[ENTRIES]();

    expect(intersection).toEqual([["a", NaN], ["c", -0], ["e", undefined], ["f", shared]]);
    expect(difference).toEqual([["g", distinct]]);
    expect(union).toEqual([...intersection, ["g", distinct]]);
    expect(difference[0]?.[1]).toBe(distinct);
  });

  it("set output: special keys and stored undefined -> safe collection and PICK identity", () => {
    const left = query(Object.fromEntries([["__proto__", undefined], ["constructor", 1], ["toString", 2]]));
    const empty = query<number | undefined>({});
    const result = left[UNION](empty, identity, identity);

    const entries = result[ENTRIES]();
    const object = result[TO_OBJECT]();
    const picked = result[PICK]("__proto__", "constructor", "__proto__")[ENTRIES]();

    expect(entries).toEqual([["__proto__", undefined], ["constructor", 1], ["toString", 2]]);
    expect(Object.hasOwn(object, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(object)).toBe(Object.prototype);
    expect(picked).toEqual([["__proto__", undefined], ["constructor", 1]]);
    expect(left[DIFFERENCE](empty, identity, identity)[ENTRIES]()).toEqual(entries);
    expect(left[INTERSECTION](left, identity, identity)[ENTRIES]()).toEqual(entries);
  });

  it.each(["first", "last"] as const)("UNION: distinct identities share keys with %s policy -> unique keyed outputs", policy => {
    const left = query<number | undefined>({ a: undefined, b: 1 });
    const right = query<number | undefined>({ a: 2, c: 3, b: undefined });
    const result = left[UNION](right, identity, identity, { duplicateKeys: policy });
    const expected = [["a", policy === "first" ? undefined : 2], ["b", 1], ["c", 3]];

    const outputs = [result[ENTRIES](), Object.entries(result[TO_OBJECT]()), result[PICK]("a", "b", "c")[ENTRIES]()];

    expect(outputs).toEqual([expected, expected, expected]);
  });

  it("UNION: last key policy with stored undefined -> last payload keeps first key position", () => {
    const left = query<number | undefined>({ a: 1, b: 2 });
    const right = query<number | undefined>({ a: undefined });

    const result = left[UNION](right, identity, identity, { duplicateKeys: "last" });

    expect(result[ENTRIES]()).toEqual([["a", undefined], ["b", 2]]);
    expect(result[PICK]("a")[ENTRIES]()).toEqual([["a", undefined]]);
    expect(Object.hasOwn(result[TO_OBJECT](), "a")).toBe(true);
  });

  it("UNION: equal selected identity at the same key -> deduplicate before key collision", () => {
    const left = query({ a: 1 });
    const right = query({ a: 1, b: 1 });

    const result = left[UNION](right, identity, identity)[ENTRIES]();

    expect(result).toEqual([["a", 1]]);
  });

  it("sets: empty sides -> empty or unique surviving side without empty-side callbacks", () => {
    const empty = query<number>({});
    const values = query({ a: 1, b: 1 });
    const never = () => { throw new Error("empty side selector"); };

    const results = [
      empty[DIFFERENCE](empty, never, never)[VALUES](),
      empty[INTERSECTION](empty, never, never)[VALUES](),
      empty[UNION](empty, never, never)[VALUES](),
      values[DIFFERENCE](empty, identity, never)[VALUES](),
      values[INTERSECTION](empty, identity, never)[VALUES](),
      empty[UNION](values, never, identity)[VALUES](),
    ];

    expect(results).toEqual([[], [], [], [1], [], [1]]);
  });

  it("set methods: chained results -> shared prototype functions without own bindings", () => {
    const left = query({ a: 1, b: 2 });
    const right = query({ c: 2 });

    const result = left[DIFFERENCE](right, identity, identity)[UNION](right, identity, identity)
      [INTERSECTION](left, identity, identity);

    for (const symbol of [DIFFERENCE, INTERSECTION, UNION] as const) {
      expect(result[symbol]).toBe(left[symbol]);
      expect(Object.hasOwn(result, symbol)).toBe(false);
    }
    expect(result[VALUES]()).toEqual([1, 2]);
  });
});

describe("set modes and boundaries", () => {
  it.each(["record", "ordered"] as const)("sets: eager %s selector errors -> throw on operation with original error", mode => {
    const record = createQueryable({ a: 1 });
    const left = mode === "record" ? record : record[SORT](() => 0);
    const right = createQueryable({ b: 2 });
    const failure = new Error("selector");
    const fail = () => { throw failure; };

    for (const symbol of [DIFFERENCE, INTERSECTION, UNION] as const) {
      expect(() => left[symbol](right, fail, identity)).toThrow(failure);
      expect(() => left[symbol](right, identity, fail)).toThrow(failure);
    }
    expect(() => left[UNION](createQueryable({ a: 3 }), identity, identity)).toThrow(DuplicateKeyError);
  });

  it("UNION: lazy default key policy -> all full consumers reject collisions at the common boundary", () => {
    const result = createQueryable({ a: 1 })[LAZY]()[UNION](createQueryable({ a: 2 }), identity, identity);

    expect(result[FIRST]()).toBe(1);
    expect(() => result[ENTRIES]()).toThrow(expect.objectContaining({ key: "a" }));
    expect(() => result[TO_OBJECT]()).toThrow(DuplicateKeyError);
    expect(() => result[PICK]("a")[VALUES]()).toThrow(DuplicateKeyError);
  });

  it("sets: numeric record keys versus descending sequence -> preserve native versus comparator order", () => {
    const record = createQueryable({ 1: 1, 2: 2, 3: 3 });
    const right = createQueryable({ 0: 0, 4: 4 });
    const ordered = record[SORT]((a, b) => b - a);

    expect(record[UNION](right, identity, identity)[ENTRIES]()).toEqual([["0", 0], ["1", 1], ["2", 2], ["3", 3], ["4", 4]]);
    expect(ordered[UNION](right, identity, identity)[ENTRIES]()).toEqual([["3", 3], ["2", 2], ["1", 1], ["0", 0], ["4", 4]]);
    expect(ordered[DIFFERENCE](right, identity, identity)[VALUES]()).toEqual([3, 2, 1]);
    expect(ordered[INTERSECTION](record, identity, identity)[VALUES]()).toEqual([3, 2, 1]);
  });

  it("sets: inferred heterogeneous public results -> preserve modes and payload unions", () => {
    const left = createQueryable({ a: { id: 1, name: "one" } });
    const right = createQueryable({ b: { code: 2 } });
    const difference = left[DIFFERENCE](right, value => value.id, value => value.code);
    const intersection = left[LAZY]()[INTERSECTION](right, value => value.id, value => value.code);
    const union = left[UNION](right, value => value.id, value => value.code);
    const sequence = left[SORT](() => 0)[UNION](right, value => value.id, value => value.code);

    expectTypeOf(difference).toEqualTypeOf<Queryable<{ id: number; name: string }>>();
    expectTypeOf(intersection).toEqualTypeOf<QuerySequence<{ id: number; name: string }>>();
    expectTypeOf(union).toEqualTypeOf<Queryable<{ id: number; name: string } | { code: number }>>();
    expectTypeOf(sequence).toEqualTypeOf<QuerySequence<{ id: number; name: string } | { code: number }>>();
    expectTypeOf<ThisParameterType<(typeof left)[typeof DIFFERENCE]>>().toEqualTypeOf<Queryable<{ id: number; name: string }>>();
    expect(union[VALUES]()).toEqual([{ id: 1, name: "one" }, { code: 2 }]);
  });

  it("sets: factory duplicate source keys -> source policy applies before selector membership", () => {
    const right = createQuerySequence<number>(() => [["r", 1], ["r", 2]]);
    const left = createQueryable({ a: 1 })[LAZY]();
    const normalized = createQuerySequence<number>(() => [["r", 1], ["r", 2]], { duplicateKeys: "last" });

    expect(() => left[DIFFERENCE](right, identity, identity)[VALUES]()).toThrow(DuplicateKeyError);
    expect(() => left[INTERSECTION](right, identity, identity)[VALUES]()).toThrow(DuplicateKeyError);
    expect(() => left[UNION](right, identity, identity)[VALUES]()).toThrow(DuplicateKeyError);
    expect(left[DIFFERENCE](normalized, identity, identity)[VALUES]()).toEqual([1]);
    expect(left[UNION](normalized, identity, identity)[VALUES]()).toEqual([1, 2]);
  });
});

describe("lazy set consumption", () => {
  it.each([DIFFERENCE, INTERSECTION] as const)("%s: FIRST -> buffer right before selecting only required left prefix", symbol => {
    const trace: string[] = [];
    let closed = 0;
    const left = createQuerySequence(function* () {
      try { yield ["a", 1] as const; yield ["b", 2] as const; yield ["c", 3] as const; }
      finally { closed++; }
    });
    const right = createQueryable({ r: 2, s: 2 })[LAZY]()[MAP]((value, key) => { trace.push(`read:${key}`); return value; });
    const result = left[symbol](right,
      (value, key) => { trace.push(`left:${key}`); return value; },
      (value, key) => { trace.push(`right:${key}`); return value; });

    expect(trace).toEqual([]);
    expect(result[FIRST]()).toBe(symbol === DIFFERENCE ? 1 : 2);
    expect(trace).toEqual(["read:r", "right:r", "read:s", "right:s", "left:a", ...(symbol === INTERSECTION ? ["left:b"] : [])]);
    expect(closed).toBe(1);
  });

  it("UNION: FIRST and last key policy -> stream left or buffer both sides with exact selector counts", () => {
    const trace: string[] = [];
    const left = createQueryable({ a: 1, b: 1 })[LAZY]();
    const right = createQueryable({ c: 2, d: 2 });
    const selectLeft = (value: number, key: string) => { trace.push(`left:${key}`); return value; };
    const selectRight = (value: number, key: string) => { trace.push(`right:${key}`); return value; };
    const streaming = left[UNION](right, selectLeft, selectRight);
    const buffered = left[UNION](right, selectLeft, selectRight, { duplicateKeys: "last" });

    expect(trace).toEqual([]);
    expect(streaming[FIRST]()).toBe(1);
    expect(trace).toEqual(["left:a"]);
    trace.length = 0;
    expect(buffered[FIRST]()).toBe(1);
    expect(trace).toEqual(["left:a", "left:b", "right:c", "right:d"]);
  });

  it.each([DIFFERENCE, INTERSECTION, UNION] as const)("%s: LIMIT zero -> no factories or selectors run", symbol => {
    const fail = () => { throw new Error("unrequested"); };
    const left = createQuerySequence<number>(fail);
    const right = createQuerySequence<number>(fail);

    const result = left[symbol](right, fail, fail)[LIMIT](0)[VALUES]();

    expect(result).toEqual([]);
  });

  it.each([DIFFERENCE, INTERSECTION, UNION] as const)("%s: early exit, mutations, and repeats -> rebuild membership and seen state", symbol => {
    const left = createQueryable({ a: 1, b: 1, c: 2 });
    const right = createQueryable({ r: 2 });
    const result = left[LAZY]()[symbol](right, identity, identity);

    result[FIRST]();
    expect(result[VALUES]()).toEqual(symbol === DIFFERENCE ? [1] : symbol === INTERSECTION ? [2] : [1, 2]);
    left.d = 3;
    right.r = 1;
    const after = result[VALUES]();

    expect(after).toEqual(symbol === DIFFERENCE ? [2, 3] : symbol === INTERSECTION ? [1] : [1, 2, 3]);
    expect(result[VALUES]()).toEqual(after);
  });

  it.each([DIFFERENCE, INTERSECTION, UNION] as const)("%s: selector or source fails -> exact error, generator cleanup, fresh retry", symbol => {
    const failure = new Error("membership");
    let fail = true;
    let closed = 0;
    const left = createQuerySequence<number>(() => [["a", 1]]);
    const right = createQuerySequence(function* () {
      try { yield ["r", 2] as const; }
      finally { closed++; }
    });
    const result = left[symbol](right, identity, value => {
      if (fail) { throw failure; }
      return value;
    });

    expect(() => result[VALUES]()).toThrow(failure);
    expect(closed).toBe(1);
    fail = false;

    expect(result[VALUES]()).toEqual(symbol === DIFFERENCE ? [1] : symbol === INTERSECTION ? [] : [1, 2]);
    expect(closed).toBe(2);
  });

  it.each([DIFFERENCE, INTERSECTION, UNION] as const)("%s: interleaved consumers -> independent identity sets", symbol => {
    const left = createQueryable({ a: 1, b: 2, c: 2 })[LAZY]();
    const right = createQueryable({ r: 2 });
    const result = left[symbol](right, identity, identity);
    const view = iterateEntries(result);
    const first = view[Symbol.iterator]();
    const second = view[Symbol.iterator]();

    expect(first.next()).toEqual(second.next());
    first.return?.();
    const remainder = Array.from({ [Symbol.iterator]: () => second });

    expect(remainder).toEqual(symbol === UNION ? [["b", 2]] : []);
    expect(result[VALUES]()).toEqual(symbol === DIFFERENCE ? [1] : symbol === INTERSECTION ? [2] : [1, 2]);
  });
});
