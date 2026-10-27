import { describe, expect, expectTypeOf, it } from "vitest";
import {
  BFS, COUNT, DFS, DuplicateKeyError, ENTRIES, FIRST, LAZY, LIMIT, MAP,
  SORT, VALUES, createQueryable, createQuerySequence, iterateValues,
} from "../../src/index.js";
import type { QuerySequence, TraversalContext, TraversalNode } from "../../src/index.js";

interface Tree {
  readonly id: string;
  readonly children: ReadonlyArray<readonly [string, Tree]>;
}

const leaf = (id: string): Tree => ({ id, children: [] });
const a: Tree = { id: "a", children: [["x", { id: "ax", children: [["z", leaf("axz")]] }], ["y", leaf("ay")]] };
const b: Tree = { id: "b", children: [["x", leaf("bx")]] };
const children = (node: Tree) => node.children;
const pathKey = (_value: Tree, context: TraversalContext<Tree>) => JSON.stringify(context.path);

describe.each([BFS, DFS] as const)("traversal %s", operation => {
  it("traversal: empty roots -> no selectors run", () => {
    const fail = () => { throw new Error("unexpected selector"); };

    const result = createQueryable<Tree>({})[operation](fail, fail)[VALUES]();

    expect(result).toEqual([]);
  });

  it("traversal: multiple roots and ordered children -> preserves specified traversal order", () => {
    const query = createQueryable({ a, b });

    const result = query[operation](children, pathKey)[MAP](node => node.value.id)[VALUES]();

    expect(result).toEqual(operation === BFS
      ? ["a", "b", "ax", "ay", "bx", "axz"]
      : ["a", "ax", "axz", "ay", "b", "bx"]);
  });

  it("traversal: numeric child keys -> iterable order survives output sequences", () => {
    const query = createQueryable<Tree>({ root: { id: "r", children: [["2", leaf("two")], ["1", leaf("one")]] } });

    const result = query[operation](children, pathKey)[MAP](node => node.key)[VALUES]();

    expect(result).toEqual(["root", "2", "1"]);
  });

  it("traversal: output key selection -> retains exact root path depth and payload context", () => {
    const contexts: TraversalContext<Tree>[] = [];
    const query = createQueryable({ original: a })[operation](
      (value, context) => {
        expectTypeOf(value).toEqualTypeOf<Tree>();
        expectTypeOf(context).toEqualTypeOf<TraversalContext<Tree>>();
        contexts.push(context);
        return value.children;
      },
      (value, context) => {
        expectTypeOf(value).toEqualTypeOf<Tree>();
        expectTypeOf(context).toEqualTypeOf<TraversalContext<Tree>>();
        return value.id;
      },
    );

    const entries = query[ENTRIES]();
    const deepest = entries.find(([key]) => key === "axz")?.[1];

    expect(deepest).toEqual({
      value: leaf("axz"), key: "z", root: a, rootKey: "original",
      path: ["original", "x", "z"], depth: 2,
    });
    expect(deepest?.root).toBe(a);
    expect(contexts.find(context => context.key === "z")?.path).toEqual(["original", "x", "z"]);
    expectTypeOf(query).toEqualTypeOf<QuerySequence<TraversalNode<Tree>>>();
  });

  it("traversal: path array mutated by JavaScript consumer -> ancestor context remains intact", () => {
    const query = createQueryable({ original: a })[operation](children, pathKey);
    const root = query[FIRST]();
    if (root) {
      Reflect.set(root.path, 0, "changed");
    }

    const paths = query[MAP](node => node.path)[VALUES]();

    expect(root?.path).toEqual(["original"]);
    expect(paths.every(path => path[0] === "original")).toBe(true);
  });

  it("traversal: deep chain -> iterative traversal avoids recursive stack overflow", () => {
    const query = createQueryable({ root: 0 })[operation](
      value => value < 20_000 ? [["child", value + 1]] : [],
      value => String(value),
    );

    const count = query[COUNT]();

    expect(count).toBe(20_001);
  });

  it("traversal: linked cycle and repeated roots -> selected visit identity skips repeated subtrees freshly", () => {
    const repeated: { id: string; children: Array<readonly [string, Tree]> } = { id: "shared", children: [] };
    repeated.children.push(["self", repeated], ["leaf", leaf("end")]);
    const query = createQueryable<Tree>({ first: repeated, second: repeated })[operation](
      children, value => value.id, { visitIdentity: value => value },
    );

    const first = query[MAP](node => node.value.id)[VALUES]();
    const second = query[MAP](node => node.value.id)[VALUES]();

    expect(first).toEqual(["shared", "end"]);
    expect(second).toEqual(first);
  });

  it("traversal: repeated reference without identity -> visits each path independently", () => {
    const shared = leaf("shared");
    const query = createQueryable<Tree>({ root: { id: "r", children: [["a", shared], ["b", shared]] } });

    const rows = query[operation](children, pathKey)[VALUES]();

    expect(rows.map(node => node.path)).toEqual([["root"], ["root", "a"], ["root", "b"]]);
    expect(rows[1]?.value).toBe(rows[2]?.value);
  });

  it("traversal: cycle without identity and finite depth -> inclusive bound terminates expansion", () => {
    const cyclic: { id: string; children: Array<readonly [string, Tree]> } = { id: "cycle", children: [] };
    cyclic.children.push(["self", cyclic]);
    let expansions = 0;
    const query = createQueryable<Tree>({ root: cyclic })[operation](
      value => { expansions++; return value.children; }, pathKey, { maxDepth: 3 },
    );

    const depths = query[MAP](node => node.depth)[VALUES]();

    expect(depths).toEqual([0, 1, 2, 3]);
    expect(expansions).toBe(3);
  });

  it("traversal: zero max depth -> emits roots without invoking children", () => {
    const query = createQueryable({ a, b })[operation](
      () => { throw new Error("must not expand"); }, pathKey, { maxDepth: 0 },
    );

    const ids = query[MAP](node => node.value.id)[VALUES]();

    expect(ids).toEqual(["a", "b"]);
  });

  it.each([-1, -Infinity, NaN, 1.1, Number.MAX_SAFE_INTEGER + 1])(
    "traversal: invalid maxDepth %s -> synchronous rejection before acquisition",
    maxDepth => {
      let acquired = 0;
      const query = createQuerySequence<Tree>(() => { acquired++; return []; });

      const construct = () => query[operation](children, pathKey, { maxDepth });

      expect(construct).toThrow(RangeError);
      expect(acquired).toBe(0);
    },
  );

  it("traversal: prefix demand -> deferred selectors and no expansion of final requested node", () => {
    let acquired = 0;
    const expanded: string[] = [];
    const query = createQuerySequence(() => { acquired++; return [["a", a], ["b", b]] as const; })[operation](
      value => { expanded.push(value.id); return value.children; }, pathKey,
    );

    expect(acquired).toBe(0);
    expect(query[LIMIT](0)[VALUES]()).toEqual([]);
    expect(acquired).toBe(0);
    expect(query[FIRST]()?.value).toBe(a);
    expect(acquired).toBe(1);
    expect(expanded).toEqual([]);
    expect(query[LIMIT](2)[COUNT]()).toBe(2);
    expect(expanded).toEqual(["a"]);
  });

  it("traversal: live source and reconsumption -> fresh rows and identity state", () => {
    const source = createQueryable({ a });
    const query = source[operation](children, pathKey, { visitIdentity: value => value.id });
    const first = query[FIRST]();
    source.b = b;

    const second = query[VALUES]();

    expect(second[0]).not.toBe(first);
    expect(second.some(node => node.root === b)).toBe(true);
    expect(query[COUNT]()).toBe(6);
  });

  it("traversal: result key collision -> common error first and last boundary applies", () => {
    const source = createQueryable({ a, b });
    const key = () => "same";

    const consume = () => source[operation](children, key)[VALUES]();

    expect(consume).toThrow(DuplicateKeyError);
    expect(source[operation](children, key, { duplicateKeys: "first" })[VALUES]().map(node => node.value.id)).toEqual(["a"]);
    expect(source[operation](children, key, { duplicateKeys: "last" })[VALUES]().map(node => node.value.id))
      .toEqual([operation === BFS ? "axz" : "bx"]);
  });

  it("traversal: last collision policy and prefix terminal -> buffers entire traversal", () => {
    const expanded: string[] = [];
    const query = createQueryable({ a })[operation](
      value => { expanded.push(value.id); return value.children; }, () => "same", { duplicateKeys: "last" },
    );

    const first = query[FIRST]();

    expect(expanded).toHaveLength(4);
    expect(first?.value.id).toBe(operation === BFS ? "axz" : "ay");
  });

  it("traversal: root iterator error -> closes acquired iterator and retries freshly", () => {
    const failure = new Error("root next");
    let closed = 0;
    let fail = true;
    const query = createQuerySequence<Tree>(function* () {
      try {
        if (fail) { throw failure; }
        yield ["a", a];
      } finally {
        closed++;
      }
    })[operation](children, pathKey);

    expect(() => query[VALUES]()).toThrow(failure);
    fail = false;

    expect(query[COUNT]()).toBe(4);
    expect(closed).toBe(2);
  });

  it("traversal: opaque payload -> no implicit identity or payload probing", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const query = createQueryable({ root: proxy })[operation](() => [], (_value, context) => context.key);

    const row = query[FIRST]();

    expect(row?.value).toBe(proxy);
    expect(row?.root).toBe(proxy);
  });

  it("traversal: undefined payload and special local keys -> preserved as data and context", () => {
    const query = createQueryable<undefined>({ root: undefined })[operation](
      (_value, context) => context.depth === 0 ? [["__proto__", undefined]] : [],
      (_value, context) => context.key,
    );

    const entries = query[ENTRIES]();

    expect(entries.map(([key, node]) => [key, node.value, node.root, node.path]))
      .toEqual([["root", undefined, undefined, ["root"]], ["__proto__", undefined, undefined, ["root", "__proto__"]]]);
  });

  it("traversal: interleaved consumers -> independent traversal and visit state", () => {
    const query = createQueryable({ a })[operation](children, pathKey, { visitIdentity: value => value });
    const first = iterateValues(query)[Symbol.iterator]();
    const second = iterateValues(query)[Symbol.iterator]();

    const firstRoot = first.next().value;
    const secondRoot = second.next().value;
    first.return?.();
    const secondChild = second.next().value;
    second.return?.();

    expect(firstRoot?.value).toBe(a);
    expect(secondRoot?.value).toBe(a);
    expect(secondChild?.value.id).toBe("ax");
  });

  it("traversal: malformed child entry -> deferred TypeError without payload inspection", () => {
    const entry: [string, Tree] = ["x", a];
    Reflect.set(entry, 0, 1);
    const query = createQueryable({ root: a })[operation](() => [entry], pathKey);

    const consume = () => query[VALUES]();

    expect(consume).toThrow(TypeError);
  });
});

describe.each([BFS, DFS] as const)("traversal lifecycle %s", operation => {
  function tracked() {
    const acquired = new Set<string>();
    const closed = new Set<string>();
    const root = createQuerySequence<Tree>(function* () {
      acquired.add("roots");
      try { yield ["a", a]; yield ["b", b]; }
      finally { closed.add("roots"); }
    });
    const select = (value: Tree): Iterable<readonly [string, Tree]> => ({
      [Symbol.iterator]() {
        acquired.add(value.id);
        const iterator = value.children[Symbol.iterator]();
        return {
          next: () => iterator.next(),
          return(): IteratorResult<readonly [string, Tree]> {
            closed.add(value.id);
            return { done: true, value: undefined };
          },
        };
      },
    });
    return { acquired, closed, root, select };
  }

  it("traversal: consumer breaks -> closes every still-acquired iterator", () => {
    const { acquired, closed, root, select } = tracked();
    const query = root[operation](select, pathKey);
    let count = 0;

    for (const _row of iterateValues(query)) {
      if (++count === 2) { break; }
    }

    expect(acquired).toEqual(new Set(["roots", "a"]));
    expect(closed).toEqual(acquired);
  });

  it("traversal: children selector throws -> closes suspended roots and children", () => {
    const { acquired, closed, root, select } = tracked();
    const failure = new Error("children");
    const query = root[operation]((value, context) => {
      if (context.depth > 0 || value.id === "b") { throw failure; }
      return select(value);
    }, pathKey);

    const consume = () => query[VALUES]();

    expect(consume).toThrow(failure);
    expect(closed).toEqual(acquired);
  });

  it("traversal: child next throws -> closes child iterator and suspended iterators", () => {
    const failure = new Error("child next");
    let rootsClosed = 0;
    let childrenClosed = 0;
    const source = createQuerySequence(function* () {
      try { yield ["a", a] as const; yield ["b", b] as const; }
      finally { rootsClosed++; }
    });
    const query = source[operation](() => ({
      [Symbol.iterator]() {
        return {
          next(): IteratorResult<readonly [string, Tree]> { throw failure; },
          return(): IteratorResult<readonly [string, Tree]> {
            childrenClosed++;
            return { done: true, value: undefined };
          },
        };
      },
    }), pathKey);

    const consume = () => query[VALUES]();

    expect(consume).toThrow(failure);
    expect(rootsClosed).toBe(1);
    expect(childrenClosed).toBe(operation === BFS ? 2 : 1);
  });

  it("traversal: output selector or downstream throws -> closes upstream without replacing error", () => {
    const failure = new Error("callback");
    const first = tracked();
    const second = tracked();
    const keyFailure = first.root[operation](first.select, (_value, context) => {
      if (context.depth > 0 || context.key === "b") { throw failure; }
      return pathKey(_value, context);
    });
    const downstreamFailure = second.root[operation](second.select, pathKey)[MAP](node => {
      if (node.depth > 0 || node.key === "b") { throw failure; }
      return node;
    });

    expect(() => keyFailure[VALUES]()).toThrow(failure);
    expect(() => downstreamFailure[VALUES]()).toThrow(failure);

    expect(first.closed).toEqual(first.acquired);
    expect(second.closed).toEqual(second.acquired);
  });

  it("traversal: cleanup throws -> still attempts all remaining iterator returns", () => {
    const failure = new Error("cleanup");
    const returned: string[] = [];
    const source = createQuerySequence(function* () {
      try { yield ["a", a] as const; yield ["b", b] as const; }
      finally { returned.push("roots"); throw failure; }
    });
    const query = source[operation](value => ({
      [Symbol.iterator]() {
        const iterator = value.children[Symbol.iterator]();
        return {
          next: () => iterator.next(),
          return(): IteratorResult<readonly [string, Tree]> {
            returned.push(value.id);
            throw failure;
          },
        };
      },
    }), pathKey);

    const consume = () => query[LIMIT](2)[VALUES]();

    expect(consume).toThrow(failure);
    expect(returned).toEqual(["roots", "a"]);
  });

  it("traversal: visit identity throws and cleanup also fails -> preserves original thrown value", () => {
    const failure = { reason: "identity" };
    let closed = 0;
    const source = createQuerySequence(function* () {
      try { yield ["a", a] as const; }
      finally { closed++; throw new Error("cleanup"); }
    });
    const query = source[operation](children, pathKey, {
      visitIdentity: () => { throw failure; },
    });
    let caught: unknown;

    try { query[VALUES](); }
    catch (error) { caught = error; }

    expect(caught).toBe(failure);
    expect(closed).toBe(1);
  });
});

it("traversal methods: records and sequences -> shared frozen prototypes and exact receiver types", () => {
  const first = createQueryable({ a });
  const second = createQueryable({ b });
  const lazy = first[LAZY]();
  const ordered = first[SORT](() => 0);

  expect(first[BFS]).toBe(second[BFS]);
  expect(first[DFS]).toBe(second[DFS]);
  expect(lazy[BFS]).toBe(ordered[BFS]);
  expect(lazy[DFS]).toBe(ordered[DFS]);
  expect(Object.isFrozen(Object.getPrototypeOf(first))).toBe(true);
  expect(Object.isFrozen(Object.getPrototypeOf(lazy))).toBe(true);
  expectTypeOf(first[BFS]).thisParameter.toEqualTypeOf<typeof first>();
  expectTypeOf(first[DFS]).thisParameter.toEqualTypeOf<typeof first>();
  expectTypeOf(lazy[BFS]).thisParameter.toEqualTypeOf<QuerySequence<Tree>>();
  expectTypeOf(lazy[DFS]).thisParameter.toEqualTypeOf<QuerySequence<Tree>>();
});
