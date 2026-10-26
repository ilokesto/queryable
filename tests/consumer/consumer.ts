import {
  AT, EVERY, FIND, FIND_ENTRY, FIRST_OR, FIRST_OR_ELSE, GROUP_BY, INCLUDES,
  IS_EMPTY, LAST, LAZY, MAP, REDUCE, SINGLE, SORT, VALUES, WHERE, createQueryable,
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

export const guardedEntry = ordered[FIND_ENTRY](value => typeof value === "string");
export const guardedSingle = lazy[SINGLE](value => typeof value === "number");
export const relative: string | number | undefined = lazy[AT](-1);
export const last: string | number | undefined = record[LAST]();
export const every: boolean = record[EVERY](value => typeof value === "string");
export const empty: boolean = lazy[IS_EMPTY]();
export const contains: boolean = ordered[INCLUDES](2);
export const fallbackValue = record[FIRST_OR](false);
export const fallbackFactory = ordered[FIRST_OR_ELSE](() => false);
