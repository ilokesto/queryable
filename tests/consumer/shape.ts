import {
  COUNT, ENTRIES, FIRST, MAP, PICK, TO_OBJECT, WHERE, createQueryable, createShapeQueryable,
} from "@ilokesto/queryable";
import type { ShapeEntry, ShapeQueryable } from "@ilokesto/queryable";

export const input: { count: number; label: string; optional?: boolean; stored: undefined } = {
  count: 1, label: "one", stored: undefined,
};
export const snapshot: ShapeQueryable<typeof input> = createShapeQueryable(
  input, ["count", "label", "optional", "stored"],
);
export const entries: ReadonlyArray<ShapeEntry<typeof input>> = snapshot[ENTRIES]();
export const picked = snapshot[PICK]("count", "optional");
export const absent: ReadonlyArray<never> = snapshot[PICK]("unknown")[ENTRIES]();
export const mapped = snapshot[MAP](String)[PICK]("count");
export const narrowed = snapshot[WHERE](value => typeof value === "number");
export const first: number | undefined = narrowed[FIRST]();
export const boundKeys: Array<"count" | "label"> = ["count"];
export const bounded = snapshot[PICK](...boundKeys);
export const unknownKeys: string[] = ["count", "unknown"];
export const unbounded = snapshot[PICK](...unknownKeys);
export const partial: Readonly<Partial<typeof input>> = unbounded[TO_OBJECT]();
export const optional: boolean | undefined = picked[TO_OBJECT]().optional;
export const maybeCount: number | undefined = bounded[TO_OBJECT]().count;
export const mappedCount: string | undefined = mapped[TO_OBJECT]().count;
export const narrowedCount: number | undefined = narrowed[TO_OBJECT]().count;
export const emptyFirst: undefined = createShapeQueryable({}, [])[FIRST]();
export const afterFiltering = snapshot[WHERE](() => false)[PICK]("count")[FIRST]();
export const dynamic = createQueryable({ count: 1 });
dynamic.extra = 2;
delete dynamic.count;

for (const [key, value] of entries) {
  if (key === "count") {
    const number: number = value;
    number.toFixed();
  }
  if (key === "label") {
    const text: string = value;
    text.toUpperCase();
  }
}

const wide: Record<string, number> = {};
export const openInput = createShapeQueryable(wide, ["missing"]);
export const absentOpenValue: number | undefined = openInput[TO_OBJECT]().missing;
export const subset = createShapeQueryable(input, ["count"]);
export const mutableCount: number = dynamic[COUNT]();

// The packed-package harness compiles these independently, without suppression
// comments, against this consumer's emitted declarations and the installed tarball.
export const invalidShapePrograms = [
  { name: "readonly-object", source: "snapshot[TO_OBJECT]().count = 3;", codes: [2540] },
  { name: "readonly-delete", source: "delete snapshot[TO_OBJECT]().count;", codes: [2704] },
  { name: "readonly-entries", source: 'snapshot[ENTRIES]().push(["count", 3]);', codes: [2339] },
  { name: "readonly-tuple", source: "for (const entry of snapshot[ENTRIES]()) { entry[0] = 'count'; }", codes: [2540] },
  { name: "readonly-method", source: "snapshot[COUNT] = () => 0;", codes: [2540] },
  { name: "readonly-chain-method", source: "mapped[COUNT] = () => 0;", codes: [2540] },
  { name: "not-a-record", source: "snapshot.label = 'changed';", codes: [2339] },
  { name: "unknown-pick", source: 'snapshot[PICK]("unknown")[TO_OBJECT]().unknown;', codes: [2339] },
  { name: "bounded-pick", source: "bounded[TO_OBJECT]().optional;", codes: [2339] },
  { name: "unbounded-pick", source: "unbounded[TO_OBJECT]().unknown;", codes: [2339] },
  { name: "optional-presence", source: "const value: number = picked[TO_OBJECT]().count;", codes: [2322] },
  { name: "optional-key", source: "const value: boolean = picked[TO_OBJECT]().optional;", codes: [2322] },
  { name: "first-presence", source: "const value: number = narrowed[FIRST]();", codes: [2322] },
  { name: "filtered-presence", source: "const value: number = afterFiltering;", codes: [2322] },
  { name: "map-output", source: "const value: number | undefined = mapped[TO_OBJECT]().count;", codes: [2322] },
  { name: "where-output", source: "const value: string | undefined = narrowed[TO_OBJECT]().count;", codes: [2322] },
  { name: "entry-correlation", source: 'for (const [key, value] of entries) { if (key === "count") { const text: string = value; } }', codes: [2322] },
  { name: "unknown-constructor-key", source: 'createShapeQueryable({ count: 1 }, ["unknown"]);', codes: [2322] },
  { name: "subset-domain", source: "subset[TO_OBJECT]().label;", codes: [2339] },
  { name: "open-presence", source: "const value: number = openInput[TO_OBJECT]().missing;", codes: [2322] },
];

export const shapeDownstreamSource = `
import { ENTRIES, FIRST, TO_OBJECT } from "@ilokesto/queryable";
import { snapshot, picked, mapped, narrowed, bounded, unbounded } from "./dist/shape.js";
export const count: number | undefined = picked[TO_OBJECT]().count;
export const optional: boolean | undefined = picked[TO_OBJECT]().optional;
export const mappedCount: string | undefined = mapped[TO_OBJECT]().count;
export const narrowedCount: number | undefined = narrowed[TO_OBJECT]().count;
export const boundedLabel: string | undefined = bounded[TO_OBJECT]().label;
export const unboundedLabel: string | undefined = unbounded[TO_OBJECT]().label;
export const maybeFirst: number | undefined = narrowed[FIRST]();
for (const [key, value] of snapshot[ENTRIES]()) {
  if (key === "count") { const number: number = value; number.toFixed(); }
  if (key === "label") { const text: string = value; text.toUpperCase(); }
}
`;
