import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const first = process.argv[2];
const loaded = [];
const hooks = registerHooks({
  load(url, context, nextLoad) {
    if (url.includes("/@ilokesto/queryable/dist/")) {
      loaded.push(url.slice(url.lastIndexOf("/") + 1));
    }
    return nextLoad(url, context);
  },
});
await import(first);
const firstLoaded = [...loaded].sort();
if (first === "@ilokesto/queryable/operators") {
  assert.deepEqual(firstLoaded, ["core-symbols.js", "functional.js"]);
}
if (first === "@ilokesto/queryable/symbols") {
  assert.ok(firstLoaded.includes("symbols.js"));
  assert.ok(!firstLoaded.includes("index.js"));
  assert.ok(!firstLoaded.includes("async.js"));
  assert.ok(!firstLoaded.includes("functional.js"));
}
const root = await import("@ilokesto/queryable");
const operators = await import("@ilokesto/queryable/operators");
const symbols = await import("@ilokesto/queryable/symbols");
hooks.deregister();

assert.deepEqual(
  Object.entries(root).filter(([, value]) => typeof value === "symbol"),
  Object.entries(symbols),
);
for (const [name, operator] of Object.entries(operators)) {
  assert.equal(root[name], operator);
}
const source = root.createQueryable({ a: 1, b: 2 });
const mapped = operators.map(n => n * 10)(source);
assert.deepEqual(operators.values(mapped), [10, 20]);
assert.equal(Object.getPrototypeOf(mapped), Object.getPrototypeOf(source));
for (const symbol of Object.values(symbols)) {
  if (symbol in source) {
    assert.equal(mapped[symbol], source[symbol]);
  }
}
const sequence = operators.lazy(source);
const chained = operators.map(n => n + 1)(sequence);
assert.equal(chained[symbols.MAP], sequence[symbols.MAP]);
assert.equal(chained[symbols.VALUES], source[symbols.VALUES]);
assert.deepEqual(operators.values(chained), [2, 3]);
assert.deepEqual(await root.createAsyncQuerySequence(() => [["a", 3]])[symbols.VALUES](), [3]);

for (const subpath of ["functional", "core-symbols", "dist/index.js", "operators/where", "missing"]) {
  await assert.rejects(import(`@ilokesto/queryable/${subpath}`), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
}
