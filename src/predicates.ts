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

/**
 * @description Rejects only undefined, preserving null, false, zero, and empty strings while narrowing the retained type.
 * @param {T | undefined} value - Value to test for definedness.
 * @returns {boolean} True when value is not undefined, with a type predicate narrowing to T.
 * @example
 * ```ts
 * [0, null, undefined].filter(isDefined); // [0, null]
 * ```
 */
export const isDefined: DefinedPredicate = Object.freeze(Object.assign(
  <T>(value: T | undefined): value is T => value !== undefined,
  { [complement]: "defined" as const },
));

/**
 * @description Rejects null and undefined without discarding other falsy values, narrowing retained values to the non-nullish type.
 * @param {T | null | undefined} value - Value to test for nullish absence.
 * @returns {boolean} True for non-nullish values, with a type predicate narrowing to T.
 * @example
 * ```ts
 * [0, false, null, undefined].filter(isNonNullish); // [0, false]
 * ```
 */
export const isNonNullish: NonNullishPredicate = Object.freeze(Object.assign(
  <T>(value: T | null | undefined): value is T => value !== null && value !== undefined,
  { [complement]: "nonNullish" as const },
));

/**
 * @description Negates a predicate while forwarding all arguments. Only the exhaustive isDefined and isNonNullish predicates retain a narrowed complement type; arbitrary guards return a boolean predicate.
 * @param {(...args: A) => boolean} predicate - Predicate to invoke once with the returned function's arguments.
 * @returns {(...args: A) => boolean} Predicate returning the logical negation, without rebinding a receiver.
 * @example
 * ```ts
 * [0, null, undefined].filter(negate(isNonNullish)); // [null, undefined]
 * const odd = negate((n: number) => n % 2 === 0);
 * odd(3); // true
 * ```
 */
export function negate(predicate: typeof isDefined): <T>(value: T) => value is T & undefined;
export function negate(predicate: typeof isNonNullish): <T>(value: T) => value is T & (null | undefined);
export function negate<A extends unknown[]>(predicate: (...args: A) => boolean): (...args: A) => boolean;
export function negate<A extends unknown[]>(predicate: (...args: A) => boolean): (...args: A) => boolean {
  return (...args) => !predicate(...args);
}
