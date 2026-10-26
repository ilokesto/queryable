import {
  FIND, GROUP_BY_PROP, LAZY, VALUES, WHERE, createQueryable,
  isDefined, isNonNullish, negate,
} from "@ilokesto/queryable";
import type { Queryable, QuerySequence } from "@ilokesto/queryable";

const mixed = createQueryable<0 | false | "" | "cat" | null | undefined>({
  zero: 0, no: false, empty: "", text: "cat", nil: null, missing: undefined,
});

export const truthy: Queryable<"cat"> = mixed[WHERE](Boolean);
export const defined: Queryable<0 | false | "" | "cat" | null> = mixed[WHERE](isDefined);
export const nonNullish: QuerySequence<0 | false | "" | "cat"> = mixed[LAZY]()[WHERE](isNonNullish);
export const nullish: Queryable<null | undefined> = mixed[WHERE](negate(isNonNullish));
export const absent: Queryable<undefined> = mixed[WHERE](negate(isDefined));
export const empty: QuerySequence<never> = mixed[LAZY]()[WHERE](() => false);
export const missing: undefined = mixed[FIND](() => false);

type Cat = { readonly kind?: "cat"; readonly meow: true };
type Dog = { readonly kind: "dog"; readonly bark: true };
const pets = createQueryable<Cat | Dog>({ cat: { kind: "cat", meow: true }, missing: { meow: true } });
export const cats: Queryable<Cat> | undefined = pets[GROUP_BY_PROP]("kind").cat;
export const dogs: QuerySequence<Dog> | undefined = pets[LAZY]()[GROUP_BY_PROP]("kind").dog;
export const meows: true[] | undefined = cats?.[VALUES]().map(cat => cat.meow);
