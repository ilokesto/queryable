import { LAZY, VALUES } from "@ilokesto/queryable";
import {
  breadthRows, depthRows,
  asyncMapped, asyncQuery, asyncValues, fallbackFactory, fallbackValue, guardedEntry, guardedSingle, groups,
  lazy, lifetimeQuery, literalCounts, literalFold, narrowed, ordered, record, recoveredQuery, retriedQuery, stats,
} from "./dist/consumer.js";
import type { AsyncQuerySequence, NumericStats, TraversalNode } from "@ilokesto/queryable";
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
export const forwardedRecovery: AsyncQuerySequence<number | string> = recoveredQuery;
export const forwardedRetry: AsyncQuerySequence<number> = retriedQuery;
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
export const forwardedBreadth: QuerySequence<TraversalNode<string | number>> = breadthRows;
export const forwardedDepth: QuerySequence<TraversalNode<string | number>> = depthRows;
export const forwardedPaths: ReadonlyArray<readonly string[]> = depthRows[VALUES]().map(row => row.path);

import { setDifference, setIntersection, setOrderedUnion, setUnion } from "./dist/consumer.js";

export const forwardedDifference: Queryable<{ id: number; name: string }> = setDifference;
export const forwardedIntersection: QuerySequence<{ id: number; name: string }> = setIntersection;
export const forwardedSetUnion: Queryable<{ id: number; name: string } | { code: number }> = setUnion;
export const forwardedOrderedUnion: QuerySequence<{ id: number; name: string } | { code: number }> = setOrderedUnion;
