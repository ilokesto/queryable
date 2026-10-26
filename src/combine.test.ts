import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CONCAT, ZIP, FLAT_MAP, DuplicateKeyError, ENTRIES, FIRST, LAZY, LIMIT, MAP, PICK,
  SORT, TO_OBJECT, VALUES, createQueryable, createQuerySequence, iterateEntries,
} from "./index.js";
import type { EntrySourceFactory, QuerySequence } from "./index.js";

function tracked<T>(
  name: string,
  entries: readonly (readonly [string, T])[],
  trace: string[],
  failure?: { at: number; error: unknown },
  cleanupError?: unknown,
): EntrySourceFactory<T> {
  return () => {
    trace.push(`${name}:acquire`);
    let index = 0;
    return {
      [Symbol.iterator]() {
        return {
          next(): IteratorResult<readonly [string, T]> {
            trace.push(`${name}:next`);
            if (failure && index === failure.at) {
              throw failure.error;
            }
            const entry = entries[index++];
            return entry ? { done: false, value: entry } : { done: true, value: undefined };
          },
          return(): IteratorResult<readonly [string, T]> {
            trace.push(`${name}:return`);
            if (cleanupError !== undefined) {
              throw cleanupError;
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
}

describe("CONCAT", () => {
  it("CONCAT: lazy prefix -> never acquires the later source and repeats freshly", () => {
    const trace: string[] = [];
    const left = createQuerySequence(tracked("left", [["a", 1]], trace));
    const right = createQuerySequence(tracked("right", [["b", 2]], trace));
    const query = left[CONCAT]([right]);

    expect(query[LIMIT](0)[VALUES]()).toEqual([]);
    expect(trace).toEqual([]);
    expect(query[FIRST]()).toBe(1);
    expect(query[FIRST]()).toBe(1);
    expect(trace).toEqual([
      "left:acquire", "left:next", "left:return",
      "left:acquire", "left:next", "left:return",
    ]);
  });

  it("CONCAT: eager and ordered receivers -> materializes and retains comparator order", () => {
    const trace: string[] = [];
    const right = createQuerySequence(tracked("right", [["c", 3]], trace));
    const query = createQueryable({ a: 1, b: 2 })[SORT]((a, b) => b - a)[CONCAT]([right]);

    expect(trace).toEqual(["right:acquire", "right:next", "right:next", "right:return"]);
    expect(query[ENTRIES]()).toEqual([["b", 2], ["a", 1], ["c", 3]]);
    expect(query[CONCAT]).toBe(createQueryable({})[CONCAT]);
    expect(Object.hasOwn(query, CONCAT)).toBe(false);
  });

  it("CONCAT: empty sources and heterogeneous values -> preserves explicit keys and union", () => {
    const query = createQueryable({ a: 1 })[LAZY]()[CONCAT]([
      createQueryable<string>({}), createQueryable({ b: "two" }),
    ]);

    expect(query[ENTRIES]()).toEqual([["a", 1], ["b", "two"]]);
    expectTypeOf(query).toEqualTypeOf<QuerySequence<number | string>>();
    expect(createQueryable({})[CONCAT]([])[VALUES]()).toEqual([]);
  });

  it("CONCAT: later next failure -> closes exhausted and failing sources and preserves the error", () => {
    const trace: string[] = [];
    const primary = new Error("later next");
    const first = createQuerySequence(tracked("first", [["a", 1]], trace));
    const later = createQuerySequence(tracked("later", [["b", 2]], trace, { at: 0, error: primary }, new Error("cleanup")));
    const query = first[CONCAT]([later]);

    let caught: unknown;
    try { query[VALUES](); } catch (error) { caught = error; }

    expect(caught).toBe(primary);
    expect(trace).toEqual([
      "first:acquire", "first:next", "first:next", "first:return",
      "later:acquire", "later:next", "later:return",
    ]);
  });
});

describe("ZIP", () => {
  it("ZIP: heterogeneous sources -> retains receiver keys and exact tuple types", () => {
    const query = createQueryable({ a: 1, b: 2 })[ZIP](
      createQueryable({ x: "one", y: "two" }),
      createQueryable({ p: true, q: false }),
    );

    expect(query[ENTRIES]()).toEqual([["a", [1, "one", true]], ["b", [2, "two", false]]]);
    expectTypeOf(query).toEqualTypeOf<QuerySequence<[number, string, boolean]>>();
    expect(createQueryable({ a: 1 })[ZIP]()[VALUES]()).toEqual([[1]]);
  });

  it("ZIP: shorter middle source -> pulls unmatched left once and closes all acquired sources", () => {
    const trace: string[] = [];
    const left = createQuerySequence(tracked("left", [["a", 1], ["b", 2]], trace));
    const middle = createQuerySequence(tracked("middle", [["x", "x"]], trace));
    const right = createQuerySequence(tracked("right", [["p", true], ["q", false]], trace));

    const values = left[ZIP](middle, right)[VALUES]();

    expect(values).toEqual([[1, "x", true]]);
    expect(trace).toEqual([
      "left:acquire", "left:next", "middle:acquire", "middle:next", "right:acquire", "right:next",
      "left:next", "middle:next", "middle:return", "left:return", "right:return",
    ]);
  });

  it("ZIP: empty first source -> does not acquire later sources", () => {
    const trace: string[] = [];
    const empty = createQuerySequence(tracked<number>("empty", [], trace));
    const later = createQuerySequence(tracked("later", [["a", 1]], trace));

    expect(empty[ZIP](later)[VALUES]()).toEqual([]);
    expect(trace).toEqual(["empty:acquire", "empty:next", "empty:return"]);
  });

  it("ZIP: early return and repeat -> closes each sibling exactly once per fresh iteration", () => {
    const trace: string[] = [];
    const left = createQuerySequence(tracked("left", [["a", 1], ["b", 2]], trace));
    const right = createQuerySequence(tracked("right", [["x", 3], ["y", 4]], trace));
    const query = left[ZIP](right);
    const first = iterateEntries(query)[Symbol.iterator]();
    const second = iterateEntries(query)[Symbol.iterator]();

    expect(first.next().value).toEqual(["a", [1, 3]]);
    expect(second.next().value).toEqual(["a", [1, 3]]);
    first.return?.();
    expect(second.next().value).toEqual(["b", [2, 4]]);
    second.return?.();

    expect(trace.filter(event => event.endsWith(":return"))).toEqual([
      "left:return", "right:return", "left:return", "right:return",
    ]);
  });

  it("ZIP: sibling next and cleanup failures -> closes all sources without masking the primary thrown value", () => {
    const trace: string[] = [];
    const primary = { reason: "next failed" };
    const left = createQuerySequence(tracked("left", [["a", 1]], trace, undefined, new Error("left cleanup")));
    const right = createQuerySequence(tracked("right", [["b", 2]], trace, { at: 0, error: primary }, new Error("right cleanup")));
    const query = left[ZIP](right);

    let caught: unknown;
    try { query[VALUES](); } catch (error) { caught = error; }

    expect(caught).toBe(primary);
    expect(trace.filter(event => event.endsWith(":return"))).toEqual(["right:return", "left:return"]);
  });

  it("ZIP: later acquisition failure -> closes the already acquired sibling", () => {
    const trace: string[] = [];
    const primary = new Error("factory failed");
    const left = createQuerySequence(tracked("left", [["a", 1]], trace));
    const right = createQuerySequence<number>(() => { throw primary; });

    expect(() => left[ZIP](right)[VALUES]()).toThrow(primary);
    expect(trace).toEqual(["left:acquire", "left:next", "left:return"]);
  });

  it("ZIP: early cleanup failure -> still closes every sibling and propagates the first cleanup error", () => {
    const trace: string[] = [];
    const primary = new Error("first cleanup");
    const left = createQuerySequence(tracked("left", [["a", 1]], trace, undefined, primary));
    const right = createQuerySequence(tracked("right", [["b", 2]], trace, undefined, new Error("second cleanup")));

    let caught: unknown;
    try { left[ZIP](right)[FIRST](); } catch (error) { caught = error; }

    expect(caught).toBe(primary);
    expect(trace.filter(event => event.endsWith(":return"))).toEqual(["left:return", "right:return"]);
  });
});

describe("FLAT_MAP", () => {
  it("FLAT_MAP: row expansion -> retains original callback context and explicit output identity", () => {
    const seen: [number, string][] = [];
    const query = createQueryable({ "2": 2, "1": 1 })[LAZY]()[FLAT_MAP]((value, key) => {
      seen.push([value, key]);
      return [[`${key}:a`, value], [`${key}:b`, undefined]] as const;
    });

    expect(seen).toEqual([]);
    expect(query[ENTRIES]()).toEqual([
      ["1:a", 1], ["1:b", undefined], ["2:a", 2], ["2:b", undefined],
    ]);
    expect(seen).toEqual([[1, "1"], [2, "2"]]);
    expectTypeOf(query).toEqualTypeOf<QuerySequence<number | undefined>>();
    expect(createQueryable<number>({})[FLAT_MAP](() => { throw new Error("not called"); })[VALUES]()).toEqual([]);
  });

  it("FLAT_MAP: nested next failure -> closes inner and outer without masking error identity", () => {
    const trace: string[] = [];
    const primary = Symbol("failure");
    const source = createQuerySequence(tracked("outer", [["a", 1]], trace, undefined, new Error("outer cleanup")));
    const query = source[FLAT_MAP](() => tracked("inner", [["x", 2]], trace, { at: 1, error: primary }, new Error("inner cleanup"))());

    let caught: unknown;
    try { query[VALUES](); } catch (error) { caught = error; }

    expect(caught).toBe(primary);
    expect(trace.filter(event => event.endsWith(":return"))).toEqual(["inner:return", "outer:return"]);
  });

  it("FLAT_MAP: mapper and downstream failures -> closes acquired iterators and preserves primary error", () => {
    for (const stage of ["mapper", "downstream"]) {
      const trace: string[] = [];
      const primary = new Error(stage);
      const source = createQuerySequence(tracked("outer", [["a", 1]], trace));
      const expanded = source[FLAT_MAP](() => {
        if (stage === "mapper") { throw primary; }
        return tracked("inner", [["x", 2]], trace, undefined, new Error("cleanup"))();
      })[MAP](() => { throw primary; });

      let caught: unknown;
      try { expanded[VALUES](); } catch (error) { caught = error; }

      expect(caught).toBe(primary);
      expect(trace.filter(event => event.endsWith(":return"))).toEqual(
        stage === "mapper" ? ["outer:return"] : ["inner:return", "outer:return"],
      );
    }
  });

  it("FLAT_MAP: eager receiver and opaque values -> snapshots entries without probing payloads", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const tuple: [string, object] = ["__proto__", proxy];
    const query = createQueryable({ a: 1 })[FLAT_MAP](() => [tuple]);
    tuple[0] = "changed";

    const entries = query[ENTRIES]();
    expect(entries[0]?.[0]).toBe("__proto__");
    expect(entries[0]?.[1]).toBe(proxy);
    entries[0]?.splice(0, 2);
    expect(query[ENTRIES]()[0]?.[0]).toBe("__proto__");
    expect(Object.hasOwn(query[TO_OBJECT](), "__proto__")).toBe(true);
  });

  it("FLAT_MAP: lazy early return and repeated reads -> closes inner and outer with fresh identities", () => {
    const trace: string[] = [];
    const source = createQuerySequence(tracked("outer", [["a", 1], ["b", 2]], trace));
    const query = source[FLAT_MAP]((value, key) => tracked("inner", [
      [`${key}:1`, value], [`${key}:2`, value * 2],
    ], trace)());

    expect(query[FIRST]()).toBe(1);
    expect(query[FIRST]()).toBe(1);

    expect(trace).toEqual([
      "outer:acquire", "outer:next", "inner:acquire", "inner:next", "inner:return", "outer:return",
      "outer:acquire", "outer:next", "inner:acquire", "inner:next", "inner:return", "outer:return",
    ]);
  });
});

describe("combined key identity", () => {
  for (const operator of ["concat", "flatMap"]) {
    const make = (duplicateKeys: "error" | "first" | "last" = "error") => {
      const source = createQueryable({ a: 1 })[LAZY]();
      return operator === "concat"
        ? source[CONCAT]([createQueryable({ a: 2 })], { duplicateKeys })
        : source[FLAT_MAP](() => [["a", 1], ["a", 2]] as const, { duplicateKeys });
    };
    it(`${operator}: duplicate identity -> ENTRIES, TO_OBJECT and PICK reject rather than overwrite`, () => {
      expect(() => make()[ENTRIES]()).toThrow(DuplicateKeyError);
      expect(() => make()[TO_OBJECT]()).toThrow(DuplicateKeyError);
      expect(() => make()[PICK]("a")[VALUES]()).toThrow(DuplicateKeyError);
    });

    it(`${operator}: explicit collision policy -> keeps first or last consistently across consumers`, () => {
      expect(make("first")[ENTRIES]()).toEqual([["a", 1]]);
      expect(make("last")[ENTRIES]()).toEqual([["a", 2]]);
      expect(make("last")[TO_OBJECT]()).toEqual({ a: 2 });
      expect(make("last")[PICK]("a")[VALUES]()).toEqual([2]);
    });
  }
});
