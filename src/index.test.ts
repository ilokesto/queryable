import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COUNT, FIRST, GROUP_BY, LIMIT, MAP, PICK, SORT, TO_OBJECT, VALUES, WHERE,
  createQueryable,
} from "./index.js";
import type { Queryable } from "./index.js";

const sample = {
  alice: { name: "Alice", age: 25, dept: "Engineering" },
  bob: { name: "Bob", age: 30, dept: "Design" },
  charlie: { name: "Charlie", age: 20, dept: "Engineering" },
};

describe("queryable", () => {
  it("chain: filter, sort, limit and map -> expected values without source mutation", () => {
    const users = createQueryable(sample);

    const result = users[WHERE](user => user.age >= 25)
      [SORT]((a, b) => b.age - a.age)[LIMIT](1)[MAP](user => user.name);

    expect(result[VALUES]()).toEqual(["Bob"]);
    expect(result[COUNT]()).toBe(1);
    expect(users[VALUES]()).toEqual(Object.values(sample));
    expect(users.alice).toBe(sample.alice);
    expect(Object.keys(sample)).toEqual(["alice", "bob", "charlie"]);
  });

  it("createQueryable: inherited, hidden and symbol keys -> only own enumerable string data", () => {
    const source = Object.assign(Object.create({ inherited: 4 }), { visible: 1 });
    Object.defineProperty(source, "hidden", { value: 2 });
    source[Symbol("metadata")] = 3;

    const query = createQueryable<number>(source);

    expect(Object.keys(query)).toEqual(["visible"]);
    expect(query[VALUES]()).toEqual([1]);
    expect(Object.getOwnPropertySymbols(query)).toEqual([]);
    expect(JSON.stringify(query)).toBe('{"visible":1}');
    expect({ ...query }).toEqual({ visible: 1 });
  });

  it("createQueryable: source assignment -> query keeps a shallow snapshot", () => {
    const original = { age: 25 };
    const source = { alice: original };
    const query = createQueryable(source);

    source.alice = { age: 40 };

    expect(query.alice).toBe(original);
  });

  it("methods: independent instances and chains -> same frozen prototype functions", () => {
    const first = createQueryable(sample);
    const second = createQueryable(sample);
    const chained = first[WHERE](() => true)[MAP](user => user);

    const methods = [WHERE, SORT, MAP, PICK, LIMIT, GROUP_BY, COUNT, FIRST, VALUES] as const;

    for (const method of methods) {
      expect(first[method]).toBe(second[method]);
      expect(first[method]).toBe(chained[method]);
      expect(Object.hasOwn(first, method)).toBe(false);
    }
    expect(Object.isFrozen(Object.getPrototypeOf(first))).toBe(true);
  });

  it("WHERE and MAP: keyed callbacks -> retain original record keys", () => {
    const users = createQueryable(sample);

    const result = users[WHERE]((_user, key) => key !== "bob")
      [MAP]((user, key) => `${key}:${user.name}`);

    expect({ ...result }).toEqual({ alice: "alice:Alice", charlie: "charlie:Charlie" });
    expectTypeOf(result).toEqualTypeOf<Queryable<string>>();
  });

  it("PICK: record keys, duplicates and absent keys -> whole values in requested order", () => {
    const users = createQueryable(sample);

    const selected = users[PICK]("bob", "missing", "alice", "bob");

    expect(selected[VALUES]()).toEqual([sample.bob, sample.alice]);
    expect(selected[PICK]("age")[COUNT]()).toBe(0);
    expectTypeOf(selected).toEqualTypeOf<typeof users>();
  });

  it("GROUP_BY: department keys -> independently chainable groups", () => {
    const users = createQueryable(sample);

    const groups = users[GROUP_BY](user => user.dept);

    expect(Object.getPrototypeOf(groups)).toBeNull();
    expect(groups.Engineering?.[MAP](user => user.name)[VALUES]()).toEqual(["Alice", "Charlie"]);
    expect(groups.Design?.[COUNT]()).toBe(1);
    expect(groups.Engineering?.[WHERE]).toBe(users[WHERE]);
  });

  it("GROUP_BY: callback uses record key -> groups retain keyed values", () => {
    const query = createQueryable({ aa: 1, ab: 2, ba: 3 });

    const groups = query[GROUP_BY]((_value, key) => key.slice(0, 1));

    expect({ ...groups.a }).toEqual({ aa: 1, ab: 2 });
    expect(groups.b?.[VALUES]()).toEqual([3]);
  });

  it("special keys: __proto__, constructor and toString -> ordinary records across operations", () => {
    const source = Object.fromEntries([["__proto__", 3], ["constructor", 2], ["toString", 1]]);
    const query = createQueryable(source);

    const result = query[WHERE](() => true)[SORT]((a, b) => a - b)
      [MAP](value => value * 2)[PICK]("__proto__", "constructor", "toString")[LIMIT](3);

    expect(result[TO_OBJECT]()).toEqual({ ["__proto__"]: 6, constructor: 4, toString: 2 });
    expect(result[WHERE]).toBe(query[SORT]((a, b) => a - b)[WHERE]);
  });

  it.each(["__proto__", "constructor", "toString"])(
    "GROUP_BY: special group key %s -> usable query without prototype collision",
    groupKey => {
      const query = createQueryable({ item: 1 });

      const groups = query[GROUP_BY](() => groupKey);

      expect(groups[groupKey]?.[VALUES]()).toEqual([1]);
      expect(Object.hasOwn(groups, groupKey)).toBe(true);
    },
  );

  it.each([
    [0, []], [1, [1]], [10, [1, 2, 3]], [-1, [1, 2]], [1.9, [1]],
    [NaN, []], [Infinity, [1, 2, 3]], [-Infinity, []],
  ])("LIMIT: bound %s -> native slice semantics", (bound, expected) => {
    const query = createQueryable({ a: 1, b: 2, c: 3 });

    const limited = query[LIMIT](bound);

    expect(limited[VALUES]()).toEqual(expected);
  });

  it("empty query: all operations -> empty results and undefined FIRST", () => {
    const query = createQueryable<number>({});

    const result = query[WHERE](() => true)[SORT]((a, b) => a - b)
      [MAP](n => n * 2)[PICK]("absent")[LIMIT](5);

    expect(result[VALUES]()).toEqual([]);
    expect(result[COUNT]()).toBe(0);
    expect(result[FIRST]()).toBeUndefined();
    expect(Object.keys(result[GROUP_BY](String))).toEqual([]);
  });

  it("SORT: integer-index keys -> sequence preserves comparator ordering", () => {
    const query = createQueryable({ "2": 20, "1": 10, named: 30 });

    const sorted = query[SORT]((a, b) => b - a);

    expect(sorted[VALUES]()).toEqual([30, 20, 10]);
    expect(sorted[LIMIT](2)[VALUES]()).toEqual([30, 20]);
  });

  it("SORT: equal comparator results -> stable order", () => {
    const query = createQueryable(sample);

    const sorted = query[SORT](() => 0);

    expect(sorted[VALUES]()).toEqual(Object.values(sample));
  });

  it("FIRST: falsy first value -> returns that value rather than skipping it", () => {
    const query = createQueryable({ a: 0, b: 1 });

    const first = query[FIRST]();

    expect(first).toBe(0);
    expectTypeOf(first).toEqualTypeOf<number | undefined>();
  });

  it("VALUES: detached method -> receiver is required", () => {
    const query = createQueryable({ a: 1 });
    const values = query[VALUES];

    const invokeDetached = () => Reflect.apply(values, undefined, []);

    expect(invokeDetached).toThrow(TypeError);
  });

  it("WHERE: callback throws -> propagates the original error", () => {
    const query = createQueryable({ a: 1 });
    const failure = new Error("predicate failed");

    const invoke = () => query[WHERE](() => { throw failure; });

    expect(invoke).toThrow(failure);
    expect(query[VALUES]()).toEqual([1]);
  });
});
