import {
  COUNT_BY, FIND, GROUP_BY, LAZY, MAP, REDUCE, REDUCE_BY, SORT, STATS,
  VALUES, WHERE, createQueryable,
} from "@ilokesto/queryable";
import type { Queryable, QuerySequence } from "@ilokesto/queryable";

export type { Queryable, QuerySequence } from "@ilokesto/queryable";

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
