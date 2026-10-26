import {
  compose, count, createQueryable, entries, find, first, lazy, limit, map,
  pick, pipe, reduce, some, sort, toObject, values, where,
} from "@ilokesto/queryable";
import type { Queryable, QuerySequence } from "@ilokesto/queryable";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
function check<T extends true>(_result: T): void {}

const source = createQueryable<string | number>({ text: "one", number: 2 });
const strings = where((value: string | number) => typeof value === "string");
export const narrowed = pipe(source, strings);
export const mapped = pipe(source, strings, map((value: string) => value.length));
export const ordered = pipe(mapped, sort((a: number, b) => b - a));
export const deferred = pipe(source, lazy);
export const nativeResult = pipe(mapped, values, ns => ns.join(","), text => text.length, n => n > 0);
export const transform = compose<Queryable<string | number>>()(strings, map((value: string) => value.length), values);
export const transformed = transform(source);
export const found = pipe(source, find((value: string | number) => typeof value === "number"));

check<Equal<typeof narrowed, Queryable<string>>>(true);
check<Equal<typeof mapped, Queryable<number>>>(true);
check<Equal<typeof ordered, QuerySequence<number>>>(true);
check<Equal<typeof deferred, QuerySequence<string | number>>>(true);
check<Equal<typeof nativeResult, boolean>>(true);
check<Equal<typeof transformed, number[]>>(true);
check<Equal<typeof found, number | undefined>>(true);
check<Equal<Parameters<typeof pipe>["length"], 5>>(true);
check<Equal<Parameters<ReturnType<typeof compose<number>>>["length"], 4>>(true);

const result = {
  transformed, found, nativeResult,
  selected: pipe(source, pick("text"), limit(1), entries),
  first: first(narrowed),
  count: count(source),
  object: toObject(mapped),
  some: some((value: string | number) => value === 2)(source),
  total: reduce((sum: number, value: number) => sum + value, 0)(mapped),
};
if (JSON.stringify(result) !== JSON.stringify({
  transformed: [3], found: 2, nativeResult: true, selected: [["text", "one"]],
  first: "one", count: 2, object: { text: 3 }, some: true, total: 3,
})) {
  throw new Error("Packed functional adapter runtime contract failed");
}
