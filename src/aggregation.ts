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
  /** Number of visited entries, including selected NaN values. */
  readonly count: number;
  /** Left-to-right native addition, beginning at positive zero. */
  readonly sum: number;
  /** Sum divided by count, or undefined when no entries were visited. */
  readonly average: number | undefined;
  /** Math.min result, including NaN and signed-zero behavior; undefined when empty. */
  readonly min: number | undefined;
  /** Math.max result, including NaN and signed-zero behavior; undefined when empty. */
  readonly max: number | undefined;
}

/**
 * @description Calculates numeric summary fields in one traversal, calling the selector once per entry in source order.
 * @param {Iterable<readonly [string, T]>} entries - Keyed values to summarize.
 * @param {(value: T, key: string) => number} selector - Selects a number using the value and original key.
 * @returns {NumericStats} Fresh numeric summary; empty input has sum zero and undefined average and extrema.
 * - count `number` - Number of entries visited.
 * - sum `number` - Native left-to-right sum starting at positive zero.
 * - average `number | undefined` - Sum divided by count, or undefined for empty input.
 * - min `number | undefined` - Math.min of selected values, or undefined for empty input.
 * - max `number | undefined` - Math.max of selected values, or undefined for empty input.
 * @example
 * ```ts
 * numericStats([["a", 2], ["b", 4]], value => value); // { count: 2, sum: 6, average: 3, min: 2, max: 4 }
 * ```
 */
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

/**
 * @description Folds each selected string group independently, initializing it once on first encounter. Special keys are safe own properties of a null-prototype result.
 * @param {Iterable<readonly [string, T]>} entries - Keyed values visited in source order.
 * @param {(value: T, key: string) => K} keyFn - Selects each entry's group before its reducer runs.
 * @param {(accumulator: A, value: T, key: string) => A} reducer - Updates the group's accumulator with the original entry key.
 * @param {(groupKey: K) => A} initial - Creates the initial accumulator once for each encountered group.
 * @returns {Partial<Record<K, A>>} Group accumulators; absent groups have no own property, while stored undefined is retained.
 * @example
 * ```ts
 * reduceBy([["a", 1], ["b", 3]], () => "odd", (sum, n) => sum + n, () => 0); // { odd: 4 }
 * ```
 */
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
