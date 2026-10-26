import { createQueryable, WHERE as ROOT_WHERE } from "@ilokesto/queryable";
import type { Queryable, QuerySequence } from "@ilokesto/queryable";
import {
  compose, find, lazy, map, pipe, sort, values, where,
} from "@ilokesto/queryable/operators";
import { VALUES, WHERE } from "@ilokesto/queryable/symbols";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
function check<T extends true>(_result: T): void {}

const source = createQueryable<0 | false | "" | "yes" | null | undefined>({ a: 0, b: "yes" });
export const truthy = pipe(source, where(Boolean));
export const empty = pipe(source, where(() => false));
export const truthySequence = pipe(source, lazy, where(Boolean));
export const truthyFound = pipe(source, find(Boolean));
export const neverFound = pipe(source, find(() => false));
export const guarded = pipe(source, where((value): value is "yes" => value === "yes"));
export const mapped = pipe(guarded, map((text: string) => text.length));
export const ordered = pipe(mapped, sort((a: number, b) => a - b));
export const transform = compose<Queryable<string>>()(
  map((text: string) => text.length), values,
);
export const symbolWhere: typeof ROOT_WHERE = WHERE;

check<Equal<typeof truthy, Queryable<"yes">>>(true);
check<Equal<typeof empty, Queryable<never>>>(true);
check<Equal<typeof truthySequence, QuerySequence<"yes">>>(true);
check<Equal<typeof truthyFound, "yes" | undefined>>(true);
check<Equal<typeof neverFound, undefined>>(true);
check<Equal<typeof guarded, Queryable<"yes">>>(true);
check<Equal<typeof mapped, Queryable<number>>>(true);
check<Equal<typeof ordered, QuerySequence<number>>>(true);
check<Equal<typeof transform, (query: Queryable<string>) => number[]>>(true);
check<Equal<typeof WHERE, typeof ROOT_WHERE>>(true);
if (JSON.stringify(truthy[VALUES]()) !== '["yes"]' || WHERE !== ROOT_WHERE) {
  throw new Error("Packed modular runtime contract failed");
}
