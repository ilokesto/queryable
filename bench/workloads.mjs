import assert from "node:assert/strict";
import {
  COUNT, ENTRIES, FIRST, LAZY, MAP, PICK, SORT, VALUES, createQueryable,
} from "../dist/index.js";

export const mechanismCases = [
  ...[0, 1, 16].map((depth) => `lazy-stages/depth-${depth}`),
  ...["record", "sequence"].flatMap((kind) =>
    ["count", "first"].map((terminal) => `materialized-${terminal}/${kind}`)),
  ...["narrow", "wide"].flatMap((width) =>
    ["eager", "lazy", "native-map"].map((kind) => `sequence-pick-${width}/${kind}`)),
  ...["queryable", "native-values"].map((kind) => `expensive-sort/${kind}`),
];

export function makeWorkload(caseName, input) {
  const [track, implementation] = caseName.split("/");
  const query = createQueryable(input);
  const values = Object.values(input);
  let execute;
  let expected;
  let semantics;
  let details;
  if (track === "lazy-stages") {
    const depth = Number(implementation.slice("depth-".length));
    let identity = (value) => value;
    execute = () => {
      let sequence = query[LAZY]();
      for (let stage = 0; stage < depth; stage++) {
        sequence = sequence[MAP](identity);
      }
      return sequence[VALUES]();
    };
    expected = values;
    semantics = "values-only; lazy conversion, stage creation and traversal included";
    let callbackCalls = 0;
    identity = (value) => { callbackCalls++; return value; };
    assert.deepEqual(execute(), expected);
    assert.equal(callbackCalls, depth * values.length);
    details = { stages: depth, validationCallbackCalls: callbackCalls };
    identity = (value) => value;
  } else if (track.startsWith("materialized-")) {
    // Sorting creates a materialized Sequence outside measurement.
    const source = implementation === "record" ? query : query[SORT](() => 0);
    const terminal = track === "materialized-count" ? COUNT : FIRST;
    execute = () => source[terminal]();
    expected = terminal === COUNT ? values.length : values[0];
    semantics = "terminal-only; source construction and materialization excluded";
  } else if (track.startsWith("sequence-pick-")) {
    const width = track.endsWith("narrow") ? Math.min(4, values.length) : values.length;
    const keys = Array.from({ length: width }, (_, index) => `row${values.length - 1 - index}`);
    // Missing and repeated keys exercise the same key-preserving contract.
    keys.push("missing", keys[0]);
    const sequence = query[SORT](() => 0);
    const source = implementation === "lazy" ? sequence[LAZY]() : sequence;
    const entries = Object.entries(input);
    execute = implementation === "native-map"
      ? () => {
        const lookup = new Map(entries);
        const result = [];
        for (const key of keys) {
          if (lookup.has(key)) {
            result.push([key, lookup.get(key)]);
            lookup.delete(key);
          }
        }
        return result;
      }
      : () => source[PICK](...keys)[ENTRIES]();
    expected = [...new Set(keys)].filter((key) => Object.hasOwn(input, key))
      .map((key) => [key, input[key]]);
    semantics = "key-preserving entries in requested order; source sorting excluded; lookup buffering included";
    details = { requestedKeys: keys.length, uniqueExistingKeys: width };
  } else {
    const projection = (value) => {
      let hash = value.id >>> 0;
      for (let index = 0; index < 32; index++) {
        hash = Math.imul(hash ^ (hash >>> 13), 1597334677) >>> 0;
      }
      return hash;
    };
    let compare = (a, b) => projection(a) - projection(b);
    execute = implementation === "queryable"
      ? () => query[SORT](compare)[VALUES]()
      : () => values.toSorted(compare);
    expected = values.toSorted(compare);
    let comparatorCalls = 0;
    compare = (a, b) => {
      comparatorCalls++;
      return projection(a) - projection(b);
    };
    assert.deepEqual(execute(), expected);
    details = { comparatorCalls, projectionCalls: comparatorCalls * 2, projectionRounds: 32 };
    compare = (a, b) => projection(a) - projection(b);
    semantics = "values-only; projection recomputed twice per comparator call; no selector API or key cache";
  }
  assert.deepEqual(execute(), expected);
  assert.deepEqual(execute(), expected, "workloads must be repeatable");
  return {
    execute,
    expected,
    semantics,
    details,
    checksum: (result) => Array.isArray(result) ? result.length
      : typeof result === "number" ? result : result.id + 1,
  };
}
