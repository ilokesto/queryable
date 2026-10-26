import { MAP, VALUES } from "@ilokesto/queryable";
import type { AsyncQuerySequence } from "@ilokesto/queryable";
import { fromEventEmitter, fromEventTarget, fromReadableStream } from "@ilokesto/queryable/streams";
import type { EventEmitterSource, EventSourceOptions, StreamSourceOptions } from "@ilokesto/queryable/streams";

export const eventOptions: EventSourceOptions<Event> = { capacity: 2, overflow: "error" };
export const streamOptions: StreamSourceOptions<number> = { key: (_value, ordinal) => String(ordinal) };
export const targetQuery: AsyncQuerySequence<Event> = fromEventTarget(new EventTarget(), "data", eventOptions);
export function emitterQuery(source: EventEmitterSource<[number, string]>): AsyncQuerySequence<[number, string]> {
  return fromEventEmitter(source, "data", { capacity: 2, overflow: "drop-oldest" });
}
export const coldQuery = fromReadableStream(() => new ReadableStream<number>({
  start(controller) {
    controller.enqueue(3);
    controller.close();
  },
}), streamOptions)[MAP](async value => String(value));
export const coldValues: Promise<string[]> = coldQuery[VALUES]();
