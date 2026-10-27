import assert from "node:assert/strict";
import { EventEmitter, getEventListeners } from "node:events";
import { ENTRIES, FIRST, MAP, VALUES } from "@ilokesto/queryable";
import { fromEventEmitter, fromEventTarget, fromReadableStream } from "@ilokesto/queryable/streams";
import { coldValues, emitterQuery } from "./dist/streams.js";

assert.deepEqual(await coldValues, ["3"]);
const emitter = new EventEmitter();
const result = emitterQuery(emitter)[FIRST]();
emitter.emit("data", 1, "one");
assert.deepEqual(await result, [1, "one"]);
assert.equal(emitter.listenerCount("data"), 0);
assert.equal(emitter.listenerCount("error"), 0);
const target = new EventTarget();
assert.throws(() => fromEventTarget(target, "data", { capacity: 1, overflow: "invalid" }), TypeError);
const event = new Event("data");
const targetResult = fromEventTarget(target, "data", { capacity: 1, overflow: "error" })[FIRST]();
target.dispatchEvent(event);
assert.equal(await targetResult, event);
assert.equal(getEventListeners(target, "data").length, 0);
const stream = new ReadableStream({
  start(controller) { controller.enqueue(2); controller.close(); },
});
assert.deepEqual(await fromReadableStream(() => stream)[MAP](async value => value * 2)[ENTRIES](), [["0", 4]]);
assert.equal(stream.locked, false);
assert.deepEqual(await fromEventEmitter(new EventEmitter(), "data", {
  capacity: 1, overflow: "error", signal: AbortSignal.abort("stopped"),
})[VALUES]().catch(error => error), "stopped");
