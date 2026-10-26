import { waitFor } from "./lifetime.js";

/** Explicit bounded async mapping; ordinary MAP remains sequential. */
export const MAP_CONCURRENT = Symbol("map_concurrent");

export interface ConcurrentMapOptions {
  /** Maximum running callbacks. Positive safe integer. */
  readonly concurrency: number;
  /** Queued inputs plus the single pending upstream pull. Default 1; positive safe integer. */
  readonly prefetch?: number;
  /** Result reservations beyond the head/delivery slot. Default concurrency - 1; nonnegative safe integer. */
  readonly reorderBuffer?: number;
  /** Input order by default; false emits in observed completion order. */
  readonly ordered?: boolean;
}

type Entry<T> = readonly [string, T];

export function concurrentMapOptions(options: ConcurrentMapOptions): Required<ConcurrentMapOptions> {
  const { concurrency, prefetch = 1, reorderBuffer = concurrency - 1, ordered = true } = options;
  for (const [name, value, minimum] of [
    ["concurrency", concurrency, 1],
    ["prefetch", prefetch, 1],
    ["reorderBuffer", reorderBuffer, 0],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
    }
  }
  if (typeof ordered !== "boolean") {
    throw new TypeError("ordered must be a boolean");
  }
  return { concurrency, prefetch, reorderBuffer, ordered };
}

export async function* concurrentEntries<T, U>(
  source: AsyncIterable<Entry<T>>,
  mapper: (value: T, key: string, signal: AbortSignal) => U,
  options: Required<ConcurrentMapOptions>,
  configuredSignal?: AbortSignal,
): AsyncGenerator<Entry<Awaited<U>>> {
  configuredSignal?.throwIfAborted();
  const controller = new AbortController();
  const { signal } = controller;
  let iterator: AsyncIterator<Entry<T>> | undefined;
  const inputs: Entry<T>[] = [];
  // Each running callback reserves space for its eventual result. The first
  // reservation is the head/delivery slot; all others fit in reorderBuffer.
  const tasks = new Set<object>();
  const ready = new Map<object, Entry<Awaited<U>>>();
  let running = 0;
  let pulling = false;
  let exhausted = false;
  let stopped = false;
  let failure: { error: unknown } | undefined;
  let closing: Promise<IteratorResult<Entry<T>> | undefined> | undefined;
  let notify = () => {};
  let changed = new Promise<void>(resolve => { notify = resolve; });
  const close = () => {
    if (iterator && !exhausted && !closing) {
      const upstream = iterator;
      closing = Promise.resolve().then(() => upstream.return?.());
      // Close can start while the consumer is paused; observe its rejection now.
      void closing.then(() => {}, () => {});
    }
    return closing;
  };
  const fail = (error: unknown) => {
    if (!stopped) {
      failure = { error };
      stopped = true;
      controller.abort(error);
      close();
      notify();
    }
  };
  const forwardAbort = () => { fail(configuredSignal?.reason); };
  configuredSignal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    iterator = source[Symbol.asyncIterator]();
    while (true) {
      if (failure) {
        throw failure.error;
      }
      signal.throwIfAborted();
      const nextTask = options.ordered ? tasks.values().next().value : ready.keys().next().value;
      const entry = nextTask === undefined ? undefined : ready.get(nextTask);
      if (nextTask !== undefined && entry !== undefined) {
        ready.delete(nextTask);
        tasks.delete(nextTask);
        yield entry;
        continue;
      }
      if (exhausted && tasks.size === 0 && inputs.length === 0) {
        return;
      }
      while (inputs.length > 0 && running < options.concurrency && tasks.size <= options.reorderBuffer) {
        const input = inputs.shift();
        if (input === undefined) {
          break;
        }
        const task = {};
        tasks.add(task);
        running++;
        // Both handlers remain attached even if a sibling fails or consumption stops.
        void waitFor(() => Promise.resolve(mapper(input[1], input[0], signal)), signal).then(
          value => {
            running--;
            if (!stopped) {
              ready.set(task, [input[0], value]);
            }
            notify();
          },
          error => {
            running--;
            fail(error);
          },
        );
      }
      if (!pulling && !exhausted && inputs.length < options.prefetch) {
        pulling = true;
        const upstream = iterator;
        // Never await filling a window: a ready result must bypass a pending next().
        void waitFor(() => upstream.next(), signal).then(
          result => {
            pulling = false;
            if (!stopped) {
              if (result.done) {
                exhausted = true;
              } else {
                inputs.push(result.value);
              }
            }
            notify();
          },
          error => {
            pulling = false;
            fail(error);
          },
        );
      }
      // Abort and every task/pull settlement resolve this exact state event.
      // Do not replace a thrown undefined with AbortController's default reason.
      await changed;
      changed = new Promise<void>(resolve => { notify = resolve; });
    }
  } finally {
    const pendingPull = pulling;
    stopped = true;
    controller.abort();
    configuredSignal?.removeEventListener("abort", forwardAbort);
    inputs.length = 0;
    tasks.clear();
    ready.clear();
    if (iterator && !exhausted) {
      try {
        const returned = close();
        // A generator may queue return behind non-cooperative next(). Its outcome
        // is already observed; do not hold an early result or a primary failure.
        if (!pendingPull && !configuredSignal?.aborted && !failure) {
          await returned;
        }
      } catch (error) {
        if (!failure && !configuredSignal?.aborted) {
          throw error;
        }
      }
    }
  }
}
