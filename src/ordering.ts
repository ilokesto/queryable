/** Scalar keys supported by selector ordering. */
export type OrderKey = boolean | number | bigint | string | null | undefined;

/** A cached selector and its direction; ascending is the default. */
export interface OrderRule<T> {
  readonly select: (value: T, key: string) => OrderKey;
  readonly direction?: "asc" | "desc";
}

export type OrderRules<T> = readonly [OrderRule<T>, ...OrderRule<T>[]];

/** Stable multi-rule ordering with per-consumption key caching. */
export const SORT_BY = Symbol("sort_by");
/** First value in the supplied ordering, retaining the first tie. */
export const MIN_BY = Symbol("min_by");
/** Last key in the supplied ordering, retaining the first tie. */
export const MAX_BY = Symbol("max_by");
/** The first K entries in the supplied ordering, returned in sorted order. */
export const TOP_K = Symbol("top_k");
/** Zero-based ordered position; negative positions count from the end. */
export const NTH_BY = Symbol("nth_by");
/** Zero-based stable ordinal position of a record key, or undefined. */
export const RANK_BY = Symbol("rank_by");

type Entry<T> = readonly [string, T];
interface Ranked<T> {
  readonly entry: Entry<T>;
  readonly keys: readonly OrderKey[];
  readonly index: number;
}

function category(key: OrderKey): number {
  if (typeof key === "boolean") { return 0; }
  if (typeof key === "number") { return 1; }
  if (typeof key === "bigint") { return 2; }
  if (typeof key === "string") { return 3; }
  return key === null ? 4 : 5;
}

function compareKeys(a: OrderKey, b: OrderKey): number {
  const difference = category(a) - category(b);
  if (difference !== 0) { return difference; }
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a)) { return Number.isNaN(b) ? 0 : 1; }
    if (Number.isNaN(b)) { return -1; }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === "string" && typeof b === "string") { return a < b ? -1 : a > b ? 1 : 0; }
  if (typeof a === "bigint" && typeof b === "bigint") { return a < b ? -1 : a > b ? 1 : 0; }
  if (typeof a === "boolean" && typeof b === "boolean") { return Number(a) - Number(b); }
  return 0;
}

function compare<T>(a: Ranked<T>, b: Ranked<T>, rules: OrderRules<T>, stable = true): number {
  for (const [index, rule] of rules.entries()) {
    const result = compareKeys(a.keys[index], b.keys[index]);
    if (result !== 0) { return rule.direction === "desc" ? -result : result; }
  }
  return stable ? a.index - b.index : 0;
}

function* decorate<T>(source: Iterable<Entry<T>>, rules: OrderRules<T>): Generator<Ranked<T>> {
  let index = 0;
  for (const entry of source) {
    yield { entry, keys: rules.map(rule => rule.select(entry[1], entry[0])), index: index++ };
  }
}

export function sortByEntries<T>(source: Iterable<Entry<T>>, rules: OrderRules<T>): Entry<T>[] {
  return Array.from(decorate(source, rules)).sort((a, b) => compare(a, b, rules)).map(item => item.entry);
}

export function extremum<T>(source: Iterable<Entry<T>>, rules: OrderRules<T>, maximum: boolean): T | undefined {
  let best: Ranked<T> | undefined;
  for (const candidate of decorate(source, rules)) {
    if (best === undefined || (maximum
      ? compare(candidate, best, rules, false) > 0
      : compare(candidate, best, rules, false) < 0)) {
      best = candidate;
    }
  }
  return best?.entry[1];
}

export function validatePosition(position: number, negative: boolean): void {
  if (Number.isSafeInteger(position) === false || (negative === false && position < 0)) {
    throw new RangeError(negative ? "Index must be a safe integer" : "K must be a nonnegative safe integer");
  }
}

// The root is the worst retained candidate. Both repairs are iterative, including
// adversarial sorted inputs; the buffer never contains more than capacity entries.
function selectHeap<T>(
  source: Iterable<Entry<T>>, capacity: number, rules: OrderRules<T>, reverse: boolean,
): Ranked<T>[] {
  const heap: Ranked<T>[] = [];
  if (capacity === 0) { return heap; }
  const ordered = (a: Ranked<T>, b: Ranked<T>): number => (reverse ? -1 : 1) * compare(a, b, rules);
  for (const candidate of decorate(source, rules)) {
    if (heap.length < capacity) {
      heap.push(candidate);
      let child = heap.length - 1;
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2);
        const above = heap[parent];
        const below = heap[child];
        if (above === undefined || below === undefined || ordered(below, above) <= 0) { break; }
        heap[parent] = below;
        heap[child] = above;
        child = parent;
      }
      continue;
    }
    const root = heap[0];
    if (root === undefined || ordered(candidate, root) >= 0) { continue; }
    heap[0] = candidate;
    let parent = 0;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      const leftItem = heap[left];
      if (leftItem === undefined) { break; }
      const rightItem = heap[right];
      const child = rightItem !== undefined && ordered(rightItem, leftItem) > 0 ? right : left;
      const below = heap[child];
      const above = heap[parent];
      if (above === undefined || below === undefined || ordered(below, above) <= 0) { break; }
      heap[parent] = below;
      heap[child] = above;
      parent = child;
    }
  }
  return heap;
}

export function topEntries<T>(source: Iterable<Entry<T>>, k: number, rules: OrderRules<T>): Entry<T>[] {
  return selectHeap(source, k, rules, false).sort((a, b) => compare(a, b, rules)).map(item => item.entry);
}

export function nthValue<T>(source: Iterable<Entry<T>>, index: number, rules: OrderRules<T>): T | undefined {
  const capacity = index < 0 ? -index : index + 1;
  const heap = selectHeap(source, capacity, rules, index < 0);
  return heap.length === capacity ? heap[0]?.entry[1] : undefined;
}

export function rankKey<T>(source: Iterable<Entry<T>>, key: string, rules: OrderRules<T>): number | undefined {
  const entries = Array.from(decorate(source, rules));
  const target = entries.find(item => item.entry[0] === key);
  if (target === undefined) { return undefined; }
  let rank = 0;
  for (const candidate of entries) {
    if (compare(candidate, target, rules) < 0) { rank++; }
  }
  return rank;
}
