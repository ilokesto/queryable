import {
  createQueryable, createAsyncQuerySequence, createRetryAsyncQuerySequence,
  CHUNK, DFS, DIFFERENCE, ENTRIES, FALLBACK, FIRST, GROUP_JOIN, LAZY,
  LEFT_JOIN, LIMIT, MAP_CONCURRENT, SCAN, STATS, TOP_K, VALUES, WINDOW,
} from "@ilokesto/queryable";
import { map, pipe, values } from "@ilokesto/queryable/operators";
import { VALUES as VALUES_SYMBOL } from "@ilokesto/queryable/symbols";
import { fromEventTarget, fromReadableStream } from "@ilokesto/queryable/streams";

const rows = createQueryable({ a: 1, b: 2, c: 3 });
export const sameSymbol = VALUES === VALUES_SYMBOL;
export const doubled = pipe(rows, map((n: number) => n * 2), values);
export const statistics = rows[STATS](n => n);
export const top = rows[TOP_K](2, { select: n => n, direction: "desc" })[ENTRIES]();
export const chunks = rows[CHUNK](2)[VALUES]();
export const windows = rows[LAZY]()[WINDOW](2)[VALUES]();
export const scan = rows[LAZY]()[SCAN]((sum, n) => sum + n, () => 0)[VALUES]();
const right = createQueryable({ x: 2 });
export const difference = rows[DIFFERENCE](right, n => n, n => n)[ENTRIES]();
export const counts = rows[GROUP_JOIN](right, n => n, n => n,
  (_value, matches) => matches.length)[VALUES]();
export const pairs = rows[LEFT_JOIN](right, n => n, n => n,
  (_value, match, key) => [key + (match.matched ? "/" + match.key : "/none"), match.matched])[ENTRIES]();
export const descendants = createQueryable({ root: 1 })[DFS](
  n => n < 3 ? [[String(n + 1), n + 1] as const] : [],
  (_value, context) => JSON.stringify(context.path),
)[VALUES]().map(row => ({ value: row.value, depth: row.depth }));

export async function asyncFamilies() {
  const recovered = createAsyncQuerySequence<number>(function* () {
    yield ["a", 1];
    throw new Error("upstream");
  })[FALLBACK](() => [["b", 2]]);
  let attempts = 0;
  const retried = createRetryAsyncQuerySequence<number>(function* () {
    const attempt = ++attempts;
    yield ["attempt", attempt];
    if (attempt === 1) { throw new Error("retry"); }
  }, 1);
  let stream: ReadableStream<number> | undefined;
  let cancellations = 0;
  const controller = new AbortController();
  const mapped = fromReadableStream(() => {
    stream = new ReadableStream<number>({
      start(controller) { controller.enqueue(2); controller.enqueue(3); },
      cancel() { cancellations += 1; },
    });
    return stream;
  }, { signal: controller.signal })[MAP_CONCURRENT](async n => n * 2, { concurrency: 2 })[LIMIT](1);
  const prefix = await mapped[VALUES]();
  controller.abort(); // Also interrupt any prefetched native reader wait.
  const target = new EventTarget();
  const event = fromEventTarget(target, "data", { capacity: 2, overflow: "error" })[FIRST]();
  target.dispatchEvent(new Event("data"));
  return {
    recovered: await recovered[VALUES](), retried: await retried[VALUES](), attempts,
    prefix, cancellations, unlocked: stream?.locked === false, eventType: (await event)?.type,
  };
}
