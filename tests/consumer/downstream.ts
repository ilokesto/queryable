import { LAZY, VALUES } from "@ilokesto/queryable";
import {
  fallbackFactory, fallbackValue, guardedEntry, guardedSingle, groups,
  lazy, literalCounts, literalFold, narrowed, ordered, record, stats,
} from "./dist/consumer.js";
import type { NumericStats } from "@ilokesto/queryable";
import type { Queryable, QuerySequence } from "./dist/consumer.js";

export const forwardedRecord: Queryable<string | number> = record;
export const forwardedSequence: QuerySequence<string | number> = ordered;
export const forwardedLazy: QuerySequence<string | number> = lazy;
export const forwardedGroup: Queryable<string> | undefined = groups.text;
export const forwardedValues: string[] = narrowed[LAZY]()[VALUES]();
export const forwardedCount: number | undefined = literalCounts.positive;
export const forwardedFold:
  { group: "positive" | "other"; sum: number; keys: string[] } | undefined = literalFold.positive;
export const forwardedStats: NumericStats = stats;
export const countKey: keyof typeof literalCounts = "positive";
export const foldKey: keyof typeof literalFold = "other";

export const forwardedEntry: [string, string] | undefined = guardedEntry;
export const forwardedSingle: number | undefined = guardedSingle;
export const forwardedFallback: string | number | boolean = fallbackValue;
export const forwardedFactoryFallback: string | number | boolean = fallbackFactory;

import { setDifference, setIntersection, setOrderedUnion, setUnion } from "./dist/consumer.js";

export const forwardedDifference: Queryable<{ id: number; name: string }> = setDifference;
export const forwardedIntersection: QuerySequence<{ id: number; name: string }> = setIntersection;
export const forwardedSetUnion: Queryable<{ id: number; name: string } | { code: number }> = setUnion;
export const forwardedOrderedUnion: QuerySequence<{ id: number; name: string } | { code: number }> = setOrderedUnion;
