/** Run on completion, early return, error, or abort of this started stage. */
export const FINALIZE = Symbol("finalize");
/** Run only when this stage's upstream exhausts normally. */
export const ON_COMPLETE = Symbol("on_complete");

/** Discriminated termination state; error and abort retain the original thrown value in error. */
export type ConsumptionOutcome =
  | {
    /** Upstream exhausted normally, including an empty source. */
    readonly reason: "complete"
  }
  | {
    /** The consumer stopped before upstream exhaustion. */
    readonly reason: "return"
  }
  | {
    /** Upstream or a stage callback failed. */
    readonly reason: "error";
    /** Exact thrown value, including undefined, preserved without wrapping. */
    readonly error: unknown
  }
  | {
    /** The configured signal aborted with the same reason as the failure. */
    readonly reason: "abort";
    /** Exact configured signal reason, preserved without wrapping. */
    readonly error: unknown
  };

type Awaitable<T> = T | PromiseLike<T>;
type Entry<T> = readonly [string, T];

/**
 * @description Starts work unless already aborted, races its settlement against cancellation,
 * and observes late rejections without claiming to stop non-cooperative external work.
 * @param {() => Awaitable<T>} start - Work invoked once after the abort check.
 * @param {AbortSignal} [signal] - Cancellation whose exact reason rejects the wait.
 * @returns {Promise<T>} The awaited work result, or a rejection with its failure or abort reason.
 * @example
 * const value = await waitFor(() => Promise.resolve(42), controller.signal);
 */
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

/**
 * @description Forwards entries and awaits one finalizer when the started stage ends.
 * Finalizer failures replace successful completion or early return, but never a primary error or abort.
 * @param {AsyncIterable<Entry<T>>} source - Upstream entries to consume.
 * @param {(outcome: ConsumptionOutcome, signal: AbortSignal | undefined) => Awaitable<void>} finalize - Cleanup receiving the termination state and configured signal.
 * @param {AbortSignal} [signal] - Signal used to identify an abort by reason identity.
 * @returns {AsyncGenerator<Entry<T>>} Entries unchanged, with cleanup awaited on termination.
 * @example
 * for await (const entry of finalizeEntries(source, outcome => { log.push(outcome.reason); })) {
 *   consume(entry);
 * }
 */
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

/**
 * @description Forwards entries and awaits a completion hook only after normal upstream exhaustion,
 * including an empty source; early return and upstream failure skip the hook.
 * @param {AsyncIterable<Entry<T>>} source - Entries to forward.
 * @param {(signal: AbortSignal | undefined) => Awaitable<void>} complete - Completion work receiving the configured signal.
 * @param {AbortSignal} [signal] - Cancellation observed while awaiting the hook.
 * @returns {AsyncGenerator<Entry<T>>} Unchanged entries followed by completion work.
 * @example
 * for await (const entry of completeEntries(source, () => { finished = true; })) {
 *   consume(entry);
 * }
 */
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
