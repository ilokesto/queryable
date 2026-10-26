import { LAZY, VALUES } from "@ilokesto/queryable";
import {
  asyncMapped, asyncQuery, asyncValues, fallbackFactory, fallbackValue, guardedEntry, guardedSingle, groups,
  concurrentMapped, concurrentOptions, concurrentView, lazy, lifetimeQuery, literalCounts, literalFold, narrowed, ordered, record, stats,
} from "./dist/consumer.js";
import type { AsyncQuerySequence, ConcurrentMapOptions, NumericStats } from "@ilokesto/queryable";
import type { Queryable, QuerySequence } from "./dist/consumer.js";

export const forwardedRecord: Queryable<string | number> = record;
export const forwardedSequence: QuerySequence<string | number> = ordered;
export const forwardedLazy: QuerySequence<string | number> = lazy;
export const forwardedGroup: Queryable<string> | undefined = groups.text;
export const forwardedValues: string[] = narrowed[LAZY]()[VALUES]();
export const forwardedAsync: AsyncQuerySequence<number> = asyncQuery;
export const forwardedAsyncMapped: AsyncQuerySequence<string> = asyncMapped;
export const forwardedAsyncValues: Promise<string[]> = asyncValues;
export const forwardedLifetime: AsyncQuerySequence<number> = lifetimeQuery;
export const forwardedConcurrent: AsyncQuerySequence<string> = concurrentMapped;
export const forwardedConcurrentOptions: ConcurrentMapOptions = concurrentOptions;
export const forwardedConcurrentView: AsyncIterable<[string, string]> = concurrentView;
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
