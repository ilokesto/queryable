import {
  BFS, DFS,
  AT, COUNT_BY, EVERY, FINALIZE, FIND, FIND_ENTRY, FIRST_OR, FIRST_OR_ELSE, GROUP_BY, GROUP_BY_MAP,
  GROUP_JOIN, INNER_JOIN, LEFT_JOIN,
  INCLUDES, IS_EMPTY, KEYS, LAST, LAZY, MAP, REDUCE, REDUCE_BY, SINGLE, SORT, STATS,
  ON_COMPLETE, TO_MAP, TO_SET, VALUES, WHERE, createAsyncQuerySequence, createQueryable, iterateAsyncEntries,
} from "@ilokesto/queryable";
import type { Queryable, QuerySequence, TraversalContext, TraversalNode } from "@ilokesto/queryable";

export type { Queryable, QuerySequence } from "@ilokesto/queryable";
export * from "./predicate-types.js";

const input: Readonly<Record<string, string | number>> = { first: "one", second: 2 };
export const record = createQueryable(input);
export const narrowed: Queryable<string> = record[WHERE](value => typeof value === "string");
export const ordered = record[SORT](() => 0);
export const lazy = record[LAZY]();
export const mapped: QuerySequence<number> = lazy[MAP](value => String(value).length);
export const found: number | undefined = ordered[FIND](value => typeof value === "number");
export const groups = narrowed[GROUP_BY](() => "text" as const);
const initial: { sum: number; keys: string[] } = { sum: 0, keys: [] };
export const total = mapped[REDUCE]((acc, value, key) => ({
  sum: acc.sum + value,
  keys: [...acc.keys, key],
}), initial);
export const values: string[] = narrowed[VALUES].call(narrowed);
export const asyncQuery = createAsyncQuerySequence(() => [["number", Promise.resolve(1)]]);
export const asyncMapped = asyncQuery[MAP](async value => String(value));
export const asyncValues: Promise<string[]> = asyncMapped[VALUES]();
export const asyncView: AsyncIterable<[string, number]> = iterateAsyncEntries(asyncQuery);
export const lifetimeQuery = createAsyncQuerySequence(
  signal => [["a", signal?.aborted ? 0 : 1]],
  { signal: new AbortController().signal },
)[MAP]((value, key, signal) => signal?.aborted ? 0 : value + key.length)
  [ON_COMPLETE](signal => { signal?.throwIfAborted(); })
  [FINALIZE]((outcome, signal) => {
    if (outcome.reason === "error" || outcome.reason === "abort") {
      const error: unknown = outcome.error;
      void error;
    }
    void signal;
  });
export const mappedKeys: string[] = mapped[KEYS]();
export const mappedMap: Map<string, number> = mapped[TO_MAP]();
export const mappedSet: Set<number> = mapped[TO_SET]();
export const objectGroupKey = {};
export const objectGroups: Map<object, QuerySequence<number>> = mapped[GROUP_BY_MAP](() => objectGroupKey);

export const literalCounts = mapped[COUNT_BY](() => "positive" as const);
export const literalFold = mapped[REDUCE_BY](
  value => value > 0 ? "positive" as const : "other" as const,
  group => ({ group, sum: 0, keys: new Array<string>() }),
  (accumulator, value, key) => ({
    group: accumulator.group,
    sum: accumulator.sum + value,
    keys: [...accumulator.keys, key],
  }),
);
export const stats = mapped[STATS](value => value);

export const guardedEntry = ordered[FIND_ENTRY](value => typeof value === "string");
export const guardedSingle = lazy[SINGLE](value => typeof value === "number");
export const relative: string | number | undefined = lazy[AT](-1);
export const last: string | number | undefined = record[LAST]();
export const every: boolean = record[EVERY](value => typeof value === "string");
export const empty: boolean = lazy[IS_EMPTY]();
export const contains: boolean = ordered[INCLUDES](2);
export const fallbackValue = record[FIRST_OR](false);
export const fallbackFactory = ordered[FIRST_OR_ELSE](() => false);

export const breadthRows: QuerySequence<TraversalNode<string | number>> = record[BFS](
  (value, context: TraversalContext<string | number>) => context.depth < 1 ? [["child", value]] : [],
  (_value, context) => JSON.stringify(context.path),
);
export const depthRows = lazy[DFS](
  (value, context) => context.depth < 1 ? [["child", value]] : [],
  (_value, context) => JSON.stringify(context.path),
  { maxDepth: 1, visitIdentity: (_value, context) => JSON.stringify(context.path) },
);
const joinInner = createQueryable({ x: 3, y: 1 });
export const joinGroups: Queryable<number> = record[GROUP_JOIN](
  joinInner, value => String(value).length, value => value,
  (_value, matches) => matches.length,
);
export const joinPairs: QuerySequence<number> = mapped[INNER_JOIN](
  joinInner, value => value, value => value,
  (value, match, key) => [`${key}/${match.key}`, value + match.value],
);
export const leftPairs: QuerySequence<boolean> = lazy[LEFT_JOIN](
  joinInner, value => String(value).length, value => value,
  (_value, match, key) => [key, match.matched],
);
import { DIFFERENCE, INTERSECTION, UNION } from "@ilokesto/queryable";

const setLeft = createQueryable({ a: { id: 1, name: "one" } });
const setRight = createQueryable({ b: { code: 2 } });
export const setDifference = setLeft[DIFFERENCE](setRight, value => value.id, value => value.code);
export const setIntersection = setLeft[LAZY]()[INTERSECTION](setRight, value => value.id, value => value.code);
export const setUnion = setLeft[UNION](setRight, value => value.id, value => value.code, { duplicateKeys: "error" });
export const setOrderedUnion = setLeft[SORT](() => 0)[UNION](setRight, value => value.id, value => value.code);
