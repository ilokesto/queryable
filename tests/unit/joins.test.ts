import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DuplicateKeyError, ENTRIES, FIRST, GROUP_BY, GROUP_JOIN, INNER_JOIN, LAZY,
  LEFT_JOIN, LIMIT, MAP, SORT, TO_OBJECT, VALUES,
  createQueryable, createQuerySequence, iterateValues,
} from "../../src/index.js";
import type { JoinEntry, JoinMatch, LeftJoinMatch, Queryable, QuerySequence } from "../../src/index.js";

describe("indexed joins", () => {
  it("GROUP_JOIN: zero, one and multiple matches -> one output per original outer key", () => {
    const outer = createQueryable({ absent: 0, one: 1, many: 2 });
    const inner = createQueryable({ x: 1, y: 2, z: 2 });

    const joined = outer[GROUP_JOIN](inner, n => n, n => n, (_n, matches) => matches);

    expect(joined[ENTRIES]()).toEqual([
      ["absent", []], ["one", [["x", 1]]], ["many", [["y", 2], ["z", 2]]],
    ]);
    expectTypeOf(joined).toEqualTypeOf<Queryable<readonly JoinEntry<number>[]>>();
  });

  it("INNER_JOIN: many-to-many sorted inputs -> stable outer then inner comparator order", () => {
    const outer = createQueryable({ 1: 1, 2: 2 })[SORT]((a, b) => b - a);
    const inner = createQueryable({ 3: 3, 4: 4 })[SORT]((a, b) => b - a);

    const joined = outer[INNER_JOIN](inner, () => 0, () => 0,
      (value, match, key) => [`${key}/${match.key}`, value * 10 + match.value]);

    expect(joined[ENTRIES]()).toEqual([["2/4", 24], ["2/3", 23], ["1/4", 14], ["1/3", 13]]);
    expectTypeOf(joined).toEqualTypeOf<QuerySequence<number>>();
    expect(joined[MAP]).toBe(outer[MAP]);
  });

  it("LEFT_JOIN: stored undefined and no match -> distinct discriminated contexts and special keys", () => {
    const outer = createQueryable({ ["__proto__"]: 1, constructor: 2 });
    const inner = createQueryable({ ["toString"]: undefined });

    const joined = outer[LEFT_JOIN](inner, n => n, () => 1,
      (_value, match, key) => [key, match]);

    expect(joined[ENTRIES]()).toEqual([
      ["__proto__", { matched: true, key: "toString", value: undefined }],
      ["constructor", { matched: false }],
    ]);
    expect(Object.hasOwn(joined[TO_OBJECT](), "__proto__")).toBe(true);
    expectTypeOf(joined).toEqualTypeOf<QuerySequence<LeftJoinMatch<undefined>>>();
  });

  it("join keys: SameValueZero and objects -> native Map identity without coercion", () => {
    const object = {};
    const other = {};
    const keys = [NaN, -0, object, other, undefined, "__proto__"];
    const outer = createQuerySequence(() => keys.map((key, i) => [String(i), key] as const));
    const inner = createQuerySequence(() => [
      ["nan", NaN], ["zero", 0], ["object", object], ["undefined", undefined], ["special", "__proto__"],
    ] as const);

    const joined = outer[GROUP_JOIN](inner, key => key, key => key,
      (_key, matches) => matches.map(([key]) => key));

    expect(joined[VALUES]()).toEqual([["nan"], ["zero"], ["object"], [], ["undefined"], ["special"]]);
  });

  it("expansion: duplicate output identity -> common error, first and last policies", () => {
    const outer = createQueryable({ a: 1 });
    const inner = createQueryable({ x: undefined, y: 2 });
    const project = (_value: number, match: JoinMatch<number | undefined>): JoinEntry<number | undefined> =>
      ["same", match.value];

    const consume = () => outer[INNER_JOIN](inner, () => 0, () => 0, project);

    expect(consume).toThrow(DuplicateKeyError);
    expect(outer[INNER_JOIN](inner, () => 0, () => 0, project, { duplicateKeys: "first" })[ENTRIES]())
      .toEqual([["same", undefined]]);
    expect(outer[LEFT_JOIN](inner, () => 0, () => 0,
      (_value, match) => ["same", match.matched ? match.value : 0], { duplicateKeys: "last" })[ENTRIES]())
      .toEqual([["same", 2]]);
  });

  it("lazy joins: no demand -> no factory acquisition or callbacks", () => {
    let calls = 0;
    const source = createQuerySequence<number>(() => { calls++; throw new Error("no demand"); });
    const joined = source[LEFT_JOIN](source, () => { calls++; return 0; }, () => 0,
      (_value, _match, key) => [key, 0]);

    const result = joined[LIMIT](0)[VALUES]();

    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("lazy INNER_JOIN: FIRST -> fully indexes inner then pulls one outer and one projection", () => {
    const trace: string[] = [];
    const outer = createQuerySequence(function* () {
      try { trace.push("outer:a"); yield ["a", 1] as const; trace.push("outer:b"); yield ["b", 2] as const; }
      finally { trace.push("outer:closed"); }
    });
    const inner = createQuerySequence(function* () {
      try { trace.push("inner:x"); yield ["x", 1] as const; trace.push("inner:y"); yield ["y", 1] as const; }
      finally { trace.push("inner:closed"); }
    });
    const joined = outer[INNER_JOIN](inner,
      (n, key) => { trace.push(`outerKey:${key}`); return n; },
      (n, key) => { trace.push(`innerKey:${key}`); return n; },
      (_n, match, key) => { trace.push(`project:${key}/${match.key}`); return [`${key}/${match.key}`, match.value]; });

    const first = joined[FIRST]();

    expect(first).toBe(1);
    expect(trace).toEqual(["inner:x", "innerKey:x", "inner:y", "innerKey:y", "inner:closed",
      "outer:a", "outerKey:a", "project:a/x", "outer:closed"]);
  });

  it("lazy joins: repeated and interleaved consumption -> fresh indexes and live mutations", () => {
    const outer = createQueryable({ a: 1 });
    const inner = createQueryable({ x: 1 });
    let innerCalls = 0;
    const joined = outer[LAZY]()[GROUP_JOIN](inner, n => n,
      n => { innerCalls++; return n; }, (_n, matches) => matches.length);
    const first = iterateValues(joined)[Symbol.iterator]();
    const second = iterateValues(joined)[Symbol.iterator]();

    expect(first.next().value).toBe(1);
    inner.y = 1;
    expect(second.next().value).toBe(2);
    first.return?.();
    second.return?.();
    expect(joined[VALUES]()).toEqual([2]);
    expect(innerCalls).toBe(5);
  });

  it("join callbacks: thrown values -> exact propagation, cleanup and fresh retry", () => {
    const failure = { reason: "callback" };
    for (const stage of ["inner", "outer", "project"]) {
      let innerClosed = 0;
      let outerClosed = 0;
      let fail = true;
      const inner = createQuerySequence(function* () {
        try { yield ["x", 1] as const; } finally { innerClosed++; }
      });
      const outer = createQuerySequence(function* () {
        try { yield ["a", 1] as const; } finally { outerClosed++; }
      });
      const joined = outer[LEFT_JOIN](inner,
        n => { if (fail && stage === "outer") { throw failure; } return n; },
        n => { if (fail && stage === "inner") { throw failure; } return n; },
        (n, _match, key) => { if (fail && stage === "project") { throw failure; } return [key, n]; });

      let caught: unknown;
      try { joined[VALUES](); } catch (error) { caught = error; }

      expect(caught).toBe(failure);
      expect(innerClosed).toBe(1);
      expect(outerClosed).toBe(stage === "inner" ? 0 : 1);
      fail = false;
      expect(joined[VALUES]()).toEqual([1]);
      expect(innerClosed).toBe(2);
      expect(outerClosed).toBe(stage === "inner" ? 1 : 2);
    }
  });

  it("GROUP_JOIN: eager and lazy modes -> preserves mode while GROUP_BY remains eager", () => {
    let calls = 0;
    const outer = createQueryable({ a: 1 });
    const inner = createQueryable<number>({});
    const project = (n: number) => { calls++; return n; };

    const eager = outer[GROUP_JOIN](inner, n => n, n => n, project);
    const lazy = outer[LAZY]()[GROUP_JOIN](inner, n => n, n => n, project);

    expect(calls).toBe(1);
    expect(eager[VALUES]()).toEqual([1]);
    const groups = lazy[GROUP_BY](() => "all");
    expect(calls).toBe(2);
    expect(groups.all?.[VALUES]()).toEqual([1]);
    expectTypeOf(lazy).toEqualTypeOf<QuerySequence<number>>();
  });

  it("empty inputs: joins -> empty outputs or unmatched outer without projection of absent rows", () => {
    const empty = createQueryable<number>({});
    const one = createQueryable({ a: 1 });
    let calls = 0;

    const joined = empty[GROUP_JOIN](one, n => n, n => n, () => { calls++; return 0; });

    expect(joined[VALUES]()).toEqual([]);
    expect(calls).toBe(0);
    expect(one[INNER_JOIN](empty, n => n, n => n, (_n, match, key) => [key, match.value])[VALUES]()).toEqual([]);
    expect(one[LEFT_JOIN](empty, n => n, n => n, (_n, match, key) => [key, match.matched])[VALUES]()).toEqual([false]);
  });

  it("join signatures: receiver and projection types -> explicit this and keyed results", () => {
    const query = createQueryable({ a: 1 });
    const inner = createQueryable({ x: "one" });
    type Method = typeof query[typeof INNER_JOIN];

    const joined = query[INNER_JOIN](inner, n => n, text => text.length,
      (n, match, key) => {
        expectTypeOf(n).toEqualTypeOf<number>();
        expectTypeOf(match).toEqualTypeOf<JoinMatch<string>>();
        expectTypeOf(key).toEqualTypeOf<string>();
        return [key, match.value];
      });

    expectTypeOf<ThisParameterType<Method>>().toEqualTypeOf<Queryable<number>>();
    expectTypeOf<Parameters<Method>[3]>().returns.toEqualTypeOf<JoinEntry<unknown>>();
    expectTypeOf(joined).toEqualTypeOf<QuerySequence<string>>();
  });
});
