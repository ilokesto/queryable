/** Sum selected numbers in query order, starting at +0. */
export const SUM = Symbol("sum");
/** Average selected numbers, or undefined for empty input. */
export const AVERAGE = Symbol("average");
/** Minimum selected number using Math.min semantics, or undefined. */
export const MIN = Symbol("min");
/** Maximum selected number using Math.max semantics, or undefined. */
export const MAX = Symbol("max");
/** Compute count, sum, average, min, and max in one traversal. */
export const STATS = Symbol("stats");
/** Count entries per string group without materializing full groups. */
export const COUNT_BY = Symbol("count_by");
/** Fold each group with a separately created initial accumulator. */
export const REDUCE_BY = Symbol("reduce_by");

/** Numeric summary; empty input has sum 0 and undefined average/min/max. */
export interface NumericStats {
  readonly count: number;
  readonly sum: number;
  readonly average: number | undefined;
  readonly min: number | undefined;
  readonly max: number | undefined;
}

export function numericStats<T>(
  entries: Iterable<readonly [string, T]>,
  selector: (value: T, key: string) => number,
): NumericStats {
  let count = 0;
  let sum = 0;
  let min: number | undefined;
  let max: number | undefined;
  for (const [key, value] of entries) {
    const selected = selector(value, key);
    sum += selected;
    min = min === undefined ? selected : Math.min(min, selected);
    max = max === undefined ? selected : Math.max(max, selected);
    count++;
  }
  return { count, sum, average: count === 0 ? undefined : sum / count, min, max };
}

export function reduceBy<T, K extends string, A>(
  entries: Iterable<readonly [string, T]>,
  keyFn: (value: T, key: string) => K,
  reducer: (accumulator: A, value: T, key: string) => A,
  initial: (groupKey: K) => A,
): Partial<Record<K, A>> {
  const groups = new Map<K, { value: A }>();
  for (const [key, value] of entries) {
    const groupKey = keyFn(value, key);
    let group = groups.get(groupKey);
    if (group === undefined) {
      group = { value: initial(groupKey) };
      groups.set(groupKey, group);
    }
    group.value = reducer(group.value, value, key);
  }
  const result: Partial<Record<K, A>> = Object.create(null);
  for (const [key, group] of groups) {
    result[key] = group.value;
  }
  return result;
}
