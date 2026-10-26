import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COUNT, ENTRIES, FIRST, MAP, PICK, TO_OBJECT, VALUES, WHERE,
  createQueryable, createShapeQueryable,
} from "./index.js";
import type { ShapeEntry, ShapeQueryable } from "./index.js";

describe("shape snapshots", () => {
  it("construction: structurally hidden keys -> copies only the explicit domain", () => {
    const actual = { count: 1, hidden: "extra" };
    const declared: { count: number } = actual;

    const query = createShapeQueryable(declared, ["count"]);

    expect(query[ENTRIES]()).toEqual([["count", 1]]);
    expect(query[PICK]("hidden")[COUNT]()).toBe(0);
    expectTypeOf(query).toEqualTypeOf<ShapeQueryable<{ count: number }>>();
  });

  it("construction: optional and excluded keys -> keeps only enumerable own presence", () => {
    const symbol = Symbol("data");
    const input: { present: undefined; absent?: number; hidden?: string; inherited?: string; [symbol]: number } = {
      present: undefined, [symbol]: 3,
    };
    Object.setPrototypeOf(input, { inherited: "inherited" });
    Object.defineProperty(input, "hidden", { value: "hidden" });

    const query = createShapeQueryable(input, ["present", "absent", "hidden", "inherited"]);

    expect(query[TO_OBJECT]()).toEqual({ present: undefined });
    expect(Object.hasOwn(query[TO_OBJECT](), "present")).toBe(true);
    expect(query[COUNT]()).toBe(1);
    expect(query[PICK]("present", "absent")[ENTRIES]()).toEqual([["present", undefined]]);
  });

  it("construction: mutable caller and nested aliases -> freezes only its shallow copy", () => {
    const value = { count: 1 };
    const input = { item: value, label: "old" };
    const query = createShapeQueryable(input, ["item", "label"]);

    input.item = { count: 9 };
    input.label = "new";
    value.count = 2;

    expect(query[TO_OBJECT]()).toEqual({ item: { count: 2 }, label: "old" });
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(query)).toBe(true);
    expect(Reflect.set(query, "item", { count: 10 })).toBe(false);
    expect(Object.keys(query)).toEqual([]);
  });

  it("construction: getters and repeated reads -> evaluates each selected getter once", () => {
    let reads = 0;
    const input = { get value() { reads++; return reads; } };

    const query = createShapeQueryable(input, ["value", "value"]);

    expect(query[VALUES]()).toEqual([1]);
    expect(query[VALUES]()).toEqual([1]);
    expect(reads).toBe(1);
  });

  it("construction and PICK: numeric and special string keys -> preserve native record ordering", () => {
    const input = { z: 0, "10": 10, "2": 2, ["__proto__"]: 3, constructor: 4, toString: 5 };
    const query = createShapeQueryable(input, ["toString", "constructor", "__proto__", "10", "2", "z"]);

    const picked = query[PICK]("10", "z", "__proto__", "2", "z", "missing", "constructor", "toString");

    expect(query[ENTRIES]().map(entry => entry[0])).toEqual(["2", "10", "z", "__proto__", "constructor", "toString"]);
    expect(picked[ENTRIES]().map(entry => entry[0])).toEqual(["2", "10", "z", "__proto__", "constructor", "toString"]);
    expect(Object.getPrototypeOf(picked[TO_OBJECT]())).toBe(Object.prototype);
    expect(Object.hasOwn(picked[TO_OBJECT](), "__proto__")).toBe(true);
    expect(picked[TO_OBJECT]().__proto__).toBe(3);
  });

  it("PICK: argument order and duplicates -> reorders string keys without inventing values", () => {
    const query = createShapeQueryable({ a: 1, b: 2, c: 3 }, ["a", "b", "c"]);

    const result = query[PICK]("c", "a", "c", "unknown");

    expect(result[ENTRIES]()).toEqual([["c", 3], ["a", 1]]);
    expect(query[ENTRIES]()).toEqual([["a", 1], ["b", 2], ["c", 3]]);
  });

  it("terminals: extracted containers -> are fresh and readonly without freezing values", () => {
    const nested = { count: 1 };
    const query = createShapeQueryable({ nested }, ["nested"]);
    const entries = query[ENTRIES]();
    const values = query[VALUES]();
    const object = query[TO_OBJECT]();

    expect(Reflect.set(entries, "0", ["wrong", 0])).toBe(false);
    expect(Reflect.set(values, "0", 0)).toBe(false);
    expect(Reflect.set(object, "nested", 0)).toBe(false);
    for (const entry of entries) {
      expect(Object.isFrozen(entry)).toBe(true);
    }
    expect(entries).not.toBe(query[ENTRIES]());
    expect(values).not.toBe(query[VALUES]());
    expect(object).not.toBe(query[TO_OBJECT]());
    expect(Object.isFrozen(nested)).toBe(false);
    expect(values[0]).toBe(nested);
  });

  it("MAP and WHERE: eager chains -> call with original keys in order and preserve snapshots", () => {
    const calls: Array<readonly [string, string | number]> = [];
    const source = createShapeQueryable({ a: 1, b: "two", c: 3 }, ["a", "b", "c"]);

    const result = source[WHERE]((value, key) => {
      calls.push([key, value]);
      return typeof value === "number";
    })[MAP]((value, key) => `${key}:${value}`);

    expect(calls).toEqual([["a", 1], ["b", "two"], ["c", 3]]);
    expect(result[ENTRIES]()).toEqual([["a", "a:1"], ["c", "c:3"]]);
    expect(source[COUNT]()).toBe(3);
    expect(result[VALUES]()).toEqual(["a:1", "c:3"]);
    expect(calls).toHaveLength(3);
  });

  it("MAP and WHERE: callback failure -> propagates the thrown value unchanged", () => {
    const query = createShapeQueryable({ a: 1 }, ["a"]);
    const failure = Symbol("failure");
    const callback = () => { throw failure; };
    const operations = [() => query[MAP](callback), () => query[WHERE](callback)];

    for (const operation of operations) {
      let caught: unknown;
      try {
        operation();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(failure);
    }
    expect(query[VALUES]()).toEqual([1]);
  });

  it("terminals and transforms: empty input -> remain empty without invoking callbacks", () => {
    const query = createShapeQueryable({}, []);
    const callback = () => { throw new Error("empty callback"); };

    const transformed = query[WHERE](callback)[MAP](callback)[PICK]("missing");

    expect(transformed[COUNT]()).toBe(0);
    expect(transformed[FIRST]()).toBeUndefined();
    expect(transformed[VALUES]()).toEqual([]);
    expect(transformed[ENTRIES]()).toEqual([]);
    expect(transformed[TO_OBJECT]()).toEqual({});
  });

  it("methods: independent instances and chains -> share a frozen Symbol prototype", () => {
    const query = createShapeQueryable({ a: 1 }, ["a"]);
    const other = createShapeQueryable({ b: "two" }, ["b"]);
    const chained = query[MAP](String)[WHERE](Boolean)[PICK]("a");
    const prototype: object = Object.getPrototypeOf(query);
    const methods: Array<typeof COUNT | typeof FIRST | typeof VALUES | typeof ENTRIES | typeof TO_OBJECT | typeof MAP | typeof WHERE | typeof PICK> = [
      COUNT, FIRST, VALUES, ENTRIES, TO_OBJECT, MAP, WHERE, PICK,
    ];

    for (const symbol of methods) {
      expect(query[symbol]).toBe(other[symbol]);
      expect(query[symbol]).toBe(chained[symbol]);
      expect(Object.hasOwn(query, symbol)).toBe(false);
      expect(Reflect.set(prototype, symbol, () => 0)).toBe(false);
    }
    expect(Object.isFrozen(prototype)).toBe(true);
    expect(query[VALUES].call(query)).toEqual([1]);
  });

  it("mutable Queryable: independent use -> still permits arbitrary additions and deletion", () => {
    const query = createQueryable({ a: 1 });

    query.extra = 2;
    delete query.a;

    expect(query[TO_OBJECT]()).toEqual({ extra: 2 });
    expect(Object.isFrozen(query)).toBe(false);
  });
});

it("shape types: heterogeneous entries and optional PICK -> retain correlated values", () => {
  const input: { count: number; label: string; optional?: boolean; stored: undefined } = {
    count: 1, label: "one", stored: undefined,
  };
  const query = createShapeQueryable(input, ["count", "label", "optional", "stored"]);

  expectTypeOf(query[ENTRIES]()).toEqualTypeOf<ReadonlyArray<ShapeEntry<typeof input>>>();
  for (const [key, value] of query[ENTRIES]()) {
    if (key === "count") {
      expectTypeOf(value).toEqualTypeOf<number>();
    }
    if (key === "label") {
      expectTypeOf(value).toEqualTypeOf<string>();
    }
    if (key === "optional") {
      expectTypeOf(value).toEqualTypeOf<boolean | undefined>();
    }
  }
  expectTypeOf(query[PICK]("optional")[TO_OBJECT]().optional).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(query[PICK]("missing")[ENTRIES]()).toEqualTypeOf<ReadonlyArray<never>>();
  const bounded: Array<"count" | "label"> = ["count"];
  expectTypeOf(query[PICK](...bounded)[TO_OBJECT]()).toEqualTypeOf<Readonly<{ count?: number; label?: string }>>();
  const unbounded: string[] = ["count", "missing"];
  expectTypeOf(query[PICK](...unbounded)[TO_OBJECT]()).toEqualTypeOf<Readonly<Partial<typeof input>>>();
  expectTypeOf(query[FIRST]()).toEqualTypeOf<number | string | boolean | undefined>();
  expectTypeOf(query[WHERE](() => false)[FIRST]()).toEqualTypeOf<number | string | boolean | undefined>();
});

it("shape types: MAP and WHERE -> retain keys and narrow overlapping value domains safely", () => {
  const input: { mixed: number | string; count: number; label: string } = {
    mixed: 1, count: 2, label: "two",
  };
  const query = createShapeQueryable(input, ["mixed", "count", "label"]);
  const numbers = query[WHERE](value => typeof value === "number");
  const literal = query[WHERE]((value): value is 1 => value === 1);

  expectTypeOf(numbers[VALUES]()).toEqualTypeOf<ReadonlyArray<number>>();
  expectTypeOf(numbers[TO_OBJECT]().mixed).toEqualTypeOf<number | undefined>();
  expectTypeOf(literal[VALUES]()).toEqualTypeOf<ReadonlyArray<1>>();
  const mapped = query[MAP]((value, key) => {
    expectTypeOf(value).toEqualTypeOf<number | string>();
    expectTypeOf(key).toEqualTypeOf<"mixed" | "count" | "label">();
    return String(value);
  });
  expectTypeOf(mapped[PICK]("count")[TO_OBJECT]().count).toEqualTypeOf<string | undefined>();
  expectTypeOf(mapped[PICK]("unknown")[ENTRIES]()).toEqualTypeOf<ReadonlyArray<never>>();
});

it("shape types: open records and unbounded constructor keys -> narrow PICK without guaranteeing presence", () => {
  const input: Record<string, number> = { a: 1 };
  const keys: string[] = ["a"];
  const query = createShapeQueryable(input, keys);

  const picked = query[PICK]("a", "missing");

  expect(picked[TO_OBJECT]()).toEqual({ a: 1 });
  expectTypeOf(picked[TO_OBJECT]()).toEqualTypeOf<Readonly<{ a?: number; missing?: number }>>();
  expectTypeOf(picked[FIRST]()).toEqualTypeOf<number | undefined>();
});
