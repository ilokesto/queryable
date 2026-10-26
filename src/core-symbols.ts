/** Eagerly group by arbitrary native Map key identity. */
export const GROUP_BY_MAP = Symbol("group_by_map");
/** Collect original keys and values in a fresh Map, preserving query order. */
export const TO_MAP = Symbol("to_map");
/** Collect distinct values in first-occurrence order using SameValueZero. */
export const TO_SET = Symbol("to_set");
/** Collect original string keys in query order. */
export const KEYS = Symbol("keys");

/** Filter records, preserving type guard narrowing.
 * @example query[WHERE](value => value.age >= 20)
 */
export const WHERE = Symbol("where");
/** Sort into an ordered sequence, including integer-index keys.
 * @example query[SORT]((a, b) => b.age - a.age)[VALUES]()
 */
export const SORT = Symbol("sort");
/** Transform values without changing their record keys.
 * @example query[MAP](value => value.name)
 */
export const MAP = Symbol("map");
/** Pick record keys in argument order, ignoring missing and duplicate keys.
 * @example query[PICK]("alice", "bob")
 */
export const PICK = Symbol("pick");
/** Limit using slice(0, n) semantics.
 * @example query[LIMIT](5)
 */
export const LIMIT = Symbol("limit");
/** Materialize groups with literal key inference and optional presence.
 * @example query[GROUP_BY](value => value.active ? "active" : "inactive")
 */
export const GROUP_BY = Symbol("group_by");
/** Group by a string discriminant, narrowing each group's union members.
 * @example query[GROUP_BY_PROP]("kind").cat?.[VALUES]()
 */
export const GROUP_BY_PROP = Symbol("group_by_prop");
/** Count records.
 * @example query[COUNT]()
 */
export const COUNT = Symbol("count");
/** Read the first value, or undefined.
 * @example query[FIRST]()
 */
export const FIRST = Symbol("first");
/** Collect values in query order.
 * @example query[VALUES]()
 */
export const VALUES = Symbol("values");
/** Find the first matching value without building a filtered collection.
 * @example query[FIND](value => value.age >= 20)
 */
export const FIND = Symbol("find");
/** Stop at the first matching value.
 * @example query[SOME](value => value.active)
 */
export const SOME = Symbol("some");
/** Collect fresh key/value tuples in query order.
 * @example query[ENTRIES]()
 */
export const ENTRIES = Symbol("entries");
/** Copy data to an ordinary object; integer keys regain native object ordering.
 * @example query[TO_OBJECT]()
 */
export const TO_OBJECT = Symbol("to_object");
/** Fold values and keys with an explicit initial accumulator.
 * @example query[REDUCE]((sum, value) => sum + value.price, 0)
 */
export const REDUCE = Symbol("reduce");
/** Create a repeatable, non-memoized lazy view.
 * @example query[LAZY]()[WHERE](value => value.active)[LIMIT](5)[VALUES]()
 */
export const LAZY = Symbol("lazy");
