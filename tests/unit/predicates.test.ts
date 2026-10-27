import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ENTRIES, FIND, GROUP_BY, GROUP_BY_PROP, LAZY, MAP, SORT, VALUES, WHERE,
  createQueryable, isDefined, isNonNullish, negate,
} from "../../src/index.js";
import type { Queryable, QuerySequence } from "../../src/index.js";

type Mixed = false | true | 0 | 1 | "" | "cat" | null | undefined;

describe("predicate types", () => {
  it("Boolean: literal falsy unions in every mode -> retains only truthy literals", () => {
    const record = createQueryable<Mixed>({
      no: false, yes: true, zero: 0, one: 1, empty: "", text: "cat", nil: null, missing: undefined,
    });
    const ordered = record[SORT](() => 0);
    const lazy = record[LAZY]();

    const results = [record[WHERE](Boolean), ordered[WHERE](Boolean), lazy[WHERE](Boolean)];

    expectTypeOf(record[WHERE](Boolean)).toEqualTypeOf<Queryable<true | 1 | "cat">>();
    expectTypeOf(ordered[WHERE](Boolean)).toEqualTypeOf<QuerySequence<true | 1 | "cat">>();
    expectTypeOf(lazy[WHERE](Boolean)).toEqualTypeOf<QuerySequence<true | 1 | "cat">>();
    for (const result of results) {
      expect(result[ENTRIES]()).toEqual([["yes", true], ["one", 1], ["text", "cat"]]);
    }
    for (const query of [record, ordered, lazy]) {
      expectTypeOf(query[FIND](Boolean)).toEqualTypeOf<true | 1 | "cat" | undefined>();
      expect(query[FIND](Boolean)).toBe(true);
    }
  });

  it("Boolean: broad number and bigint -> does not invent nonzero number types", () => {
    const record = createQueryable<number>({ zero: 0, nan: NaN, one: 1 });
    const bigints = createQueryable<0n | 1n>({ zero: 0n, one: 1n });

    const filtered = record[WHERE](Boolean);

    expectTypeOf(filtered).toEqualTypeOf<Queryable<number>>();
    expectTypeOf(record[FIND](Boolean)).toEqualTypeOf<number | undefined>();
    expectTypeOf(bigints[WHERE](Boolean)).toEqualTypeOf<Queryable<1n>>();
    expectTypeOf(createQueryable<bigint>({ zero: 0n })[WHERE](Boolean)).toEqualTypeOf<Queryable<bigint>>();
    expect(filtered[VALUES]()).toEqual([1]);
    expect(bigints[WHERE](Boolean)[VALUES]()).toEqual([1n]);
  });

  it("null checks: all falsy literals -> remove only the named nullish values", () => {
    const record = createQueryable<Mixed>({ no: false, zero: 0, empty: "", nil: null, missing: undefined });

    const defined = record[WHERE](isDefined);
    const nonNullish = record[WHERE](isNonNullish);

    expectTypeOf(defined).toEqualTypeOf<Queryable<Exclude<Mixed, undefined>>>();
    expectTypeOf(nonNullish).toEqualTypeOf<Queryable<NonNullable<Mixed>>>();
    expectTypeOf(record[LAZY]()[WHERE](isDefined)).toEqualTypeOf<QuerySequence<Exclude<Mixed, undefined>>>();
    expectTypeOf(record[SORT](() => 0)[WHERE](isNonNullish)).toEqualTypeOf<QuerySequence<NonNullable<Mixed>>>();
    expect(defined[VALUES]()).toEqual([false, 0, "", null]);
    expect(nonNullish[VALUES]()).toEqual([false, 0, ""]);
    for (const query of [record, record[SORT](() => 0), record[LAZY]()]) {
      expectTypeOf(query[FIND](isDefined)).toEqualTypeOf<Exclude<Mixed, undefined> | undefined>();
      expectTypeOf(query[FIND](isNonNullish)).toEqualTypeOf<NonNullable<Mixed> | undefined>();
      expect(query[FIND](isNonNullish)).toBe(false);
    }
  });

  it("literal false: WHERE and FIND in every mode -> never values and undefined", () => {
    const record = createQueryable<Mixed>({ no: false, nil: null, one: 1 });
    const reject = (_value: Mixed, _key: string): false => false;

    const results = [record[WHERE](reject), record[SORT](() => 0)[WHERE](reject), record[LAZY]()[WHERE](reject)];

    expectTypeOf(record[WHERE](() => false)).toEqualTypeOf<Queryable<never>>();
    expectTypeOf(record[SORT](() => 0)[WHERE](() => false)).toEqualTypeOf<QuerySequence<never>>();
    expectTypeOf(record[LAZY]()[WHERE](() => false)).toEqualTypeOf<QuerySequence<never>>();
    for (const result of results) {
      expect(result[VALUES]()).toEqual([]);
    }
    for (const query of [record, record[SORT](() => 0), record[LAZY]()]) {
      expectTypeOf(query[FIND](() => false)).toEqualTypeOf<undefined>();
      expect(query[FIND](reject)).toBeUndefined();
    }
  });

  it("predicate overloads: explicit and inferred guards and boolean fallback -> preserve inference", () => {
    const record = createQueryable<string | number | undefined>({ text: "cat", negative: -1, missing: undefined });
    const isString = (value: string | number | undefined): value is string => typeof value === "string";

    const inferred = record[WHERE](value => typeof value === "number");

    expectTypeOf(inferred).toEqualTypeOf<Queryable<number>>();
    expectTypeOf(record[WHERE](isString)).toEqualTypeOf<Queryable<string>>();
    expectTypeOf(record[WHERE]((value): boolean => typeof value === "string"))
      .toEqualTypeOf<Queryable<string | number | undefined>>();
    for (const query of [record, record[SORT](() => 0), record[LAZY]()]) {
      expectTypeOf(query[FIND](isString)).toEqualTypeOf<string | undefined>();
      expectTypeOf(query[FIND](value => typeof value === "number")).toEqualTypeOf<number | undefined>();
      expectTypeOf(query[FIND]((value): boolean => typeof value === "string"))
        .toEqualTypeOf<string | number | undefined>();
    }
    expect(inferred[VALUES]()).toEqual([-1]);
  });

  it("negate: exhaustive helpers -> narrow only their known complements", () => {
    const record = createQueryable<0 | null | undefined>({ zero: 0, nil: null, missing: undefined });

    const undefinedOnly = record[WHERE](negate(isDefined));
    const nullish = record[WHERE](negate(isNonNullish));

    expectTypeOf(undefinedOnly).toEqualTypeOf<Queryable<undefined>>();
    expectTypeOf(nullish).toEqualTypeOf<Queryable<null | undefined>>();
    expectTypeOf(createQueryable<unknown>({ missing: undefined })[WHERE](negate(isDefined)))
      .toEqualTypeOf<Queryable<undefined>>();
    expect(undefinedOnly[ENTRIES]()).toEqual([["missing", undefined]]);
    expect(nullish[ENTRIES]()).toEqual([["nil", null], ["missing", undefined]]);
  });

  it("negate: arbitrary partial guards -> retain rejected members of their asserted type", () => {
    const record = createQueryable<number | string>({ negative: -1, positive: 1, text: "cat" });
    const isPositive = (value: number | string): value is number => typeof value === "number" && value > 0;
    const partialDefined = <T>(value: T): value is Exclude<T, undefined> => value !== undefined && Boolean(value);
    const calls: [number | string, string][] = [];
    const rejectPositive = negate((value: number | string, key: string): value is number => {
      calls.push([value, key]);
      return isPositive(value);
    });

    const rejected = record[WHERE](rejectPositive);

    expectTypeOf(rejected).toEqualTypeOf<Queryable<number | string>>();
    expectTypeOf(record[LAZY]()[WHERE](negate(isPositive))).toEqualTypeOf<QuerySequence<number | string>>();
    expectTypeOf(record[SORT](() => 0)[WHERE](negate(isPositive))).toEqualTypeOf<QuerySequence<number | string>>();
    expectTypeOf(record[FIND](negate(isPositive))).toEqualTypeOf<number | string | undefined>();
    expectTypeOf(createQueryable<0 | undefined>({ zero: 0 })[WHERE](negate(partialDefined)))
      .toEqualTypeOf<Queryable<0 | undefined>>();
    expect(rejected[VALUES]()).toEqual([-1, "cat"]);
    expect(calls).toEqual([[-1, "negative"], [1, "positive"], ["cat", "text"]]);
  });
});

type Cat = { readonly kind: "cat"; readonly meow: true };
type Dog = { readonly kind: "dog"; readonly bark: true };

describe("GROUP_BY_PROP", () => {
  it("GROUP_BY_PROP: readonly cat/dog union -> correlates optional groups without changing GROUP_BY", () => {
    const cat: Cat = { kind: "cat", meow: true };
    const dog: Dog = { kind: "dog", bark: true };
    const record = createQueryable<Cat | Dog>({ 2: cat, 1: dog });

    const groups = record[GROUP_BY_PROP]("kind");

    expectTypeOf(groups).toEqualTypeOf<{ cat?: Queryable<Cat>; dog?: Queryable<Dog> }>();
    expectTypeOf(record[GROUP_BY](value => value.kind))
      .toEqualTypeOf<Partial<Record<"cat" | "dog", Queryable<Cat | Dog>>>>();
    expectTypeOf(record[SORT](() => 0)[GROUP_BY_PROP]("kind"))
      .toEqualTypeOf<{ cat?: QuerySequence<Cat>; dog?: QuerySequence<Dog> }>();
    expect(groups.cat?.[ENTRIES]()).toEqual([["2", cat]]);
    expect(groups.dog?.[ENTRIES]()).toEqual([["1", dog]]);
    expect(groups.cat?.[WHERE]).toBe(record[WHERE]);
    expect(Object.getPrototypeOf(groups)).toBeNull();
    expect(Object.isFrozen(Object.getPrototypeOf(record))).toBe(true);
    expect(record[GROUP_BY_PROP]).toBe(createQueryable<Cat | Dog>({})[GROUP_BY_PROP]);
    expect(Object.hasOwn(record, GROUP_BY_PROP)).toBe(false);
  });

  it("GROUP_BY_PROP: optional and missing discriminants -> skips undefined and retains conservative member types", () => {
    type OptionalCat = { readonly kind?: "cat"; readonly meow: true };
    type Unnamed = { readonly unnamed: true };
    const record = createQueryable<OptionalCat | Dog | Unnamed>({
      cat: { kind: "cat", meow: true }, missing: { meow: true }, unnamed: { unnamed: true },
    });

    const groups = record[GROUP_BY_PROP]("kind");

    expectTypeOf(groups.cat).toEqualTypeOf<Queryable<OptionalCat> | undefined>();
    expectTypeOf(groups.dog).toEqualTypeOf<Queryable<Dog> | undefined>();
    expect(groups.cat?.[ENTRIES]()).toEqual([["cat", { kind: "cat", meow: true }]]);
    expect(groups.dog).toBeUndefined();
    expect(Object.keys(groups)).toEqual(["cat"]);
    expect(Object.keys(createQueryable<Cat | Dog>({})[GROUP_BY_PROP]("kind"))).toEqual([]);
    for (const sequence of [record[SORT](() => 0), record[LAZY]()]) {
      const sequenceGroups = sequence[GROUP_BY_PROP]("kind");
      expectTypeOf(sequenceGroups.cat).toEqualTypeOf<QuerySequence<OptionalCat> | undefined>();
      expect(sequenceGroups.cat?.[ENTRIES]()).toEqual([["cat", { kind: "cat", meow: true }]]);
      expect(sequenceGroups.dog).toBeUndefined();
    }
  });

  it("GROUP_BY_PROP: numeric property and broad string -> accepts strings without numeric coercion promises", () => {
    const record = createQueryable<{ kind: string; code: number }>({ item: { kind: "cat", code: 1 } });

    const groups = record[GROUP_BY_PROP]("kind");

    expectTypeOf<Parameters<(typeof record)[typeof GROUP_BY_PROP]>[0]>().toEqualTypeOf<"kind">();
    expectTypeOf(groups.cat).toEqualTypeOf<Queryable<{ kind: string; code: number }> | undefined>();
    expect(groups.cat?.[VALUES]()).toEqual([{ kind: "cat", code: 1 }]);
  });

  it("GROUP_BY_PROP: broad and literal discriminants together -> never excludes overlapping union members", () => {
    type Broad = { readonly kind: string; readonly other: true };
    const record = createQueryable<Cat | Broad>({
      cat: { kind: "cat", meow: true }, broad: { kind: "cat", other: true },
    });

    const groups = record[GROUP_BY_PROP]("kind");

    expectTypeOf(groups.cat).toEqualTypeOf<Queryable<Cat | Broad> | undefined>();
    expect(groups.cat?.[VALUES]()).toEqual([{ kind: "cat", meow: true }, { kind: "cat", other: true }]);
  });

  it("GROUP_BY_PROP: ordered lazy input -> reads each discriminant once and materializes repeatable eager groups", () => {
    let reads = 0;
    let maps = 0;
    const cat = { get kind(): "cat" { reads++; return "cat"; }, meow: true };
    const record = createQueryable({ 2: cat, 1: cat });
    const lazy = record[LAZY]()[SORT](() => 0)[MAP](value => { maps++; return value; });

    const groups = lazy[GROUP_BY_PROP]("kind");

    expect(reads).toBe(2);
    expect(maps).toBe(2);
    record.extra = cat;
    expect(groups.cat?.[ENTRIES]().map(([key]) => key)).toEqual(["1", "2"]);
    expect(groups.cat?.[ENTRIES]().map(([key]) => key)).toEqual(["1", "2"]);
    expect(reads).toBe(2);
    expect(maps).toBe(2);
    expect(groups.cat?.[WHERE]).toBe(record[SORT](() => 0)[WHERE]);
    expect(Object.isFrozen(Object.getPrototypeOf(lazy))).toBe(true);
    expect(lazy[GROUP_BY_PROP]).toBe(record[SORT](() => 0)[GROUP_BY_PROP]);
  });

  it("GROUP_BY_PROP: sorted numeric keys -> preserves comparator order within each sequence group", () => {
    const record = createQueryable({ 1: { kind: "cat", rank: 1 }, 2: { kind: "cat", rank: 2 } } as const);

    const groups = record[SORT]((left, right) => right.rank - left.rank)[GROUP_BY_PROP]("kind");

    expect(groups.cat?.[ENTRIES]().map(([key]) => key)).toEqual(["2", "1"]);
  });

  it("GROUP_BY_PROP: throwing discriminant getter -> propagates the same error immediately in every mode", () => {
    const failure = new Error("discriminant failed");
    const record = createQueryable({ item: { get kind(): "cat" { throw failure; } } });

    const invocations = [
      () => record[GROUP_BY_PROP]("kind"),
      () => record[SORT](() => 0)[GROUP_BY_PROP]("kind"),
      () => record[LAZY]()[GROUP_BY_PROP]("kind"),
    ];

    for (const invoke of invocations) {
      expect(invoke).toThrow(failure);
    }
  });

  it.each(["__proto__", "constructor", "toString", ""])(
    "GROUP_BY_PROP: special discriminant %s -> ordinary own group keys in every mode",
    kind => {
      const record = createQueryable({ item: { kind } });

      const results = [
        record[GROUP_BY_PROP]("kind"),
        record[SORT](() => 0)[GROUP_BY_PROP]("kind"),
        record[LAZY]()[GROUP_BY_PROP]("kind"),
      ];

      for (const groups of results) {
        expect(Object.getPrototypeOf(groups)).toBeNull();
        expect(Object.hasOwn(groups, kind)).toBe(true);
        expect(groups[kind]?.[ENTRIES]()).toEqual([["item", { kind }]]);
      }
    },
  );

  it("GROUP_BY_PROP: special property keys -> reads discriminants as ordinary properties", () => {
    const record = createQueryable({ item: { ["__proto__"]: "cat", constructor: "dog", toString: "cat" } } as const);

    const groups = record[GROUP_BY_PROP]("__proto__");

    expect(groups.cat?.[VALUES]()).toEqual([record.item]);
    expect(record[GROUP_BY_PROP]("constructor").dog?.[VALUES]()).toEqual([record.item]);
    expect(record[GROUP_BY_PROP]("toString").cat?.[VALUES]()).toEqual([record.item]);
  });
});
