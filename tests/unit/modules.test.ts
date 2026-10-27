import { expect, expectTypeOf, it, vi } from "vitest";
import type { Queryable, QuerySequence } from "../../src/index.js";

it.each(["root", "symbols", "operators", "async"])(
  "module entries: %s imported first -> shared symbols and prototype methods",
  async first => {
    vi.resetModules();
    const load = {
      root: () => import("../../src/index.js"),
      symbols: () => import("../../src/symbols.js"),
      operators: () => import("../../src/functional.js"),
      async: () => import("../../src/async.js"),
    };
    if (first === "root") { await load.root(); }
    if (first === "symbols") { await load.symbols(); }
    if (first === "operators") { await load.operators(); }
    if (first === "async") { await load.async(); }
    const [root, symbols, operators, async] = await Promise.all([
      load.root(), load.symbols(), load.operators(), load.async(),
    ]);
    const source = root.createQueryable({ a: 1, b: 2 });

    const mapped = operators.map((n: number) => n * 10)(source);

    expect(Object.entries(root).filter(([, value]) => typeof value === "symbol")
      .sort(([left], [right]) => left.localeCompare(right)))
      .toEqual(Object.entries(symbols).sort(([left], [right]) => left.localeCompare(right)));
    for (const [name, operator] of Object.entries(operators)) {
      expect(Reflect.get(root, name)).toBe(operator);
    }
    expect(operators.values(mapped)).toEqual([10, 20]);
    expect(Object.getPrototypeOf(mapped)).toBe(Object.getPrototypeOf(source));
    for (const symbol of Object.values(symbols)) {
      if (symbol in source) {
        expect(Reflect.get(mapped, symbol)).toBe(Reflect.get(source, symbol));
      }
    }
    const left = operators.lazy(source);
    const right = operators.map((n: number) => n + 1)(left);
    expect(right[symbols.MAP]).toBe(left[symbols.MAP]);
    expect(right[symbols.VALUES]).toBe(source[symbols.VALUES]);
    expect(await async.createAsyncQuerySequence(() => [["a", 3]])[symbols.VALUES]()).toEqual([3]);
  },
);

it("operator subpath types: truthy, false and guarded stages -> preserve root inference", async () => {
  const { createQueryable } = await import("../../src/index.js");
  const { find, lazy, map, pipe, sort, values, where } = await import("../../src/functional.js");
  const source = createQueryable<0 | false | "" | "yes" | null | undefined>({ a: 0, b: "yes" });

  const truthy = pipe(source, where(Boolean));

  expectTypeOf(truthy).toEqualTypeOf<Queryable<"yes">>();
  expectTypeOf(pipe(source, lazy, where(Boolean))).toEqualTypeOf<QuerySequence<"yes">>();
  expectTypeOf(pipe(source, where(() => false))).toEqualTypeOf<Queryable<never>>();
  expectTypeOf(pipe(source, find(Boolean))).toEqualTypeOf<"yes" | undefined>();
  expectTypeOf(pipe(source, find(() => false))).toEqualTypeOf<undefined>();
  const strings = pipe(source, where((value): value is "yes" => value === "yes"));
  const lengths = pipe(strings, map((text: string) => text.length), sort((a: number, b) => a - b));
  expectTypeOf(lengths).toEqualTypeOf<QuerySequence<number>>();
  expect(values(lengths)).toEqual([3]);
});
