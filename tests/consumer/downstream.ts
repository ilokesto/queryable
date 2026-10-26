import { LAZY, VALUES } from "@ilokesto/queryable";
import {
  fallbackFactory, fallbackValue, guardedEntry, guardedSingle, groups,
  lazy, narrowed, ordered, record,
} from "./dist/consumer.js";
import type { Queryable, QuerySequence } from "./dist/consumer.js";

export const forwardedRecord: Queryable<string | number> = record;
export const forwardedSequence: QuerySequence<string | number> = ordered;
export const forwardedLazy: QuerySequence<string | number> = lazy;
export const forwardedGroup: Queryable<string> | undefined = groups.text;
export const forwardedValues: string[] = narrowed[LAZY]()[VALUES]();
export const forwardedEntry: [string, string] | undefined = guardedEntry;
export const forwardedSingle: number | undefined = guardedSingle;
export const forwardedFallback: string | number | boolean = fallbackValue;
export const forwardedFactoryFallback: string | number | boolean = fallbackFactory;
