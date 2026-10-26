/** Values whose falsiness can be represented as literal types. */
type Falsy = false | 0 | 0n | "" | null | undefined;

/** Broad numbers remain numbers: TypeScript cannot express nonzero or non-NaN numbers. */
export type Truthy<T> = T extends Falsy ? never : T;

const complement = Symbol("predicate_complement");

interface DefinedPredicate {
  <T>(value: T | undefined): value is T;
  readonly [complement]: "defined";
}

interface NonNullishPredicate {
  <T>(value: T | null | undefined): value is T;
  readonly [complement]: "nonNullish";
}

/** Remove only undefined; keep null and other falsy values. */
export const isDefined: DefinedPredicate = Object.freeze(Object.assign(
  <T>(value: T | undefined): value is T => value !== undefined,
  { [complement]: "defined" as const },
));

/** Remove null and undefined; keep false, zero and empty strings. */
export const isNonNullish: NonNullishPredicate = Object.freeze(Object.assign(
  <T>(value: T | null | undefined): value is T => value !== null && value !== undefined,
  { [complement]: "nonNullish" as const },
));

/** Negate a predicate, forwarding every argument.
 * Only the branded, exhaustive null checks have a known false-side contract.
 * Arbitrary type guards may reject values inside their asserted type.
 */
export function negate(predicate: typeof isDefined): <T>(value: T) => value is T & undefined;
export function negate(predicate: typeof isNonNullish): <T>(value: T) => value is T & (null | undefined);
export function negate<A extends unknown[]>(predicate: (...args: A) => boolean): (...args: A) => boolean;
export function negate<A extends unknown[]>(predicate: (...args: A) => boolean): (...args: A) => boolean {
  return (...args) => !predicate(...args);
}
