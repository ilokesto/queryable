import {
  AT, COUNT_BY, EVERY, FIND, FIND_ENTRY, FIRST_OR, FIRST_OR_ELSE, GROUP_BY, GROUP_BY_MAP,
  INCLUDES, IS_EMPTY, KEYS, LAST, LAZY, MAP, REDUCE, REDUCE_BY, SINGLE, SORT, STATS,
  TO_MAP, TO_SET, VALUES, WHERE, createAsyncQuerySequence, createQueryable, iterateAsyncEntries,
} from "@ilokesto/queryable";
import type { Queryable, QuerySequence } from "@ilokesto/queryable";

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
