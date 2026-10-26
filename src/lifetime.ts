/** Run on completion, early return, error, or abort of this started stage. */
export const FINALIZE = Symbol("finalize");
/** Run only when this stage's upstream exhausts normally. */
export const ON_COMPLETE = Symbol("on_complete");

export type ConsumptionOutcome =
  | { readonly reason: "complete" }
  | { readonly reason: "return" }
  | { readonly reason: "error"; readonly error: unknown }
  | { readonly reason: "abort"; readonly error: unknown };

type Awaitable<T> = T | PromiseLike<T>;
type Entry<T> = readonly [string, T];

/** Observe cancellation while retaining handlers on late external rejections. */
export async function waitFor<T>(start: () => Awaitable<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) {
    return await start();
  }
  signal.throwIfAborted();
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      onAbort = () => { reject(signal.reason); };
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(start()).then(resolve, reject);
    });
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

export async function* finalizeEntries<T>(
  source: AsyncIterable<Entry<T>>,
  finalize: (outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>,
  signal?: AbortSignal,
): AsyncGenerator<Entry<T>> {
  let outcome: ConsumptionOutcome = { reason: "return" };
  try {
    for await (const entry of source) {
      yield entry;
    }
    outcome = { reason: "complete" };
  } catch (error) {
    outcome = signal?.aborted && error === signal.reason
      ? { reason: "abort", error }
      : { reason: "error", error };
    throw error;
  } finally {
    try {
      await finalize(outcome, signal);
    } catch (error) {
      switch (outcome.reason) {
        case "complete":
        case "return":
          throw error;
        case "error":
        case "abort":
          break;
        default: {
          const unsupported: never = outcome;
          throw unsupported;
        }
      }
    }
  }
}

export async function* completeEntries<T>(
  source: AsyncIterable<Entry<T>>,
  complete: (signal: AbortSignal | undefined) => Awaitable<void>,
  signal?: AbortSignal,
): AsyncGenerator<Entry<T>> {
  for await (const entry of source) {
    yield entry;
  }
  await waitFor(() => complete(signal), signal);
}
