import {
  createQueryable, createShapeQueryable, createAsyncQuerySequence,
  ENTRIES, FINALIZE, GROUP_BY, LAZY, LIMIT, MAP, PICK, SORT, TO_OBJECT, VALUES,
  pipe, where, map, values,
} from "@ilokesto/queryable";

// Original keys survive filtering and mapping; integer keys use object order.
const migrationInput = { "10": 10, "2": 2, ["__proto__"]: 3, constructor: 4 };
const migrationRecord = createQueryable(migrationInput);
export const originalEntries = migrationRecord[ENTRIES]();
export const selectedEntries = migrationRecord[PICK]("10", "2", "__proto__", "2")[ENTRIES]();
const migrationOrdered = migrationRecord[SORT]((left, right) => right - left);
export const orderedEntries = migrationOrdered[ENTRIES]();
export const objectKeys = Object.keys(migrationOrdered[TO_OBJECT]());
export const projected = createQueryable({ alice: { name: "Alice", age: 25 } })
  [MAP](user => ({ name: user.name }))[VALUES]();
export const functionalNames: string[] = pipe(
  migrationRecord,
  where((value: number) => value >= 3),
  map((value: number, key: string) => `${key}:${value}`),
  values,
);

// Construction copied the input; LAZY observes the query record, not that input.
let migrationCalls = 0;
const migrationLive = migrationRecord[LAZY]()[MAP](value => {
  migrationCalls += 1;
  return value * 2;
});
export const firstLive = migrationLive[VALUES]();
migrationInput["2"] = 99;
migrationRecord["2"] = 7;
export const secondLive = migrationLive[VALUES]();
export const liveCalls = migrationCalls;

// Full-input buffering happens before a downstream prefix can be returned.
const migrationBarrierVisits: string[] = [];
export const bufferedPrefix = migrationRecord[LAZY]()
  [MAP]((value, key) => { migrationBarrierVisits.push(key); return value; })
  [SORT]((left, right) => right - left)[LIMIT](1)[VALUES]();
export const barrierVisits = migrationBarrierVisits;
let migrationGroupCalls = 0;
const migrationGroups = migrationRecord[LAZY]()[GROUP_BY](value => {
  migrationGroupCalls += 1;
  return value >= 4 ? "high" : "low";
});
export const eagerGroupCalls = migrationGroupCalls;
export const highGroup = migrationGroups.high?.[VALUES]();

// A structural type may hide extra runtime properties; whitelist actual keys.
const migrationWide = { count: 1, label: "one", secret: "hidden" };
const migrationPublic: { count: number; label: string } = migrationWide;
const migrationShape = createShapeQueryable(migrationPublic, ["count", "label"]);
export const shapeObject: Readonly<{ count?: number; label?: string }> =
  migrationShape[TO_OBJECT]();
export const shapeEntries = migrationShape[ENTRIES]();
export const shapeFrozen = Object.isFrozen(shapeObject)
  && Object.isFrozen(shapeEntries) && shapeEntries.every(Object.isFrozen);

// Install the cancellation listener before announcing the pending callback.
export async function cancelMigration() {
  const controller = new AbortController();
  const reason = new Error("migration cancelled");
  const events: string[] = [];
  let announceStarted: () => void = () => {};
  const started = new Promise<void>(resolve => { announceStarted = resolve; });
  const query = createAsyncQuerySequence(function* () {
    events.push("opened");
    try {
      yield ["source-key", Promise.resolve(1)] as const;
    } finally {
      events.push("closed");
    }
  }, { signal: controller.signal })
    [MAP]((_value, key, signal) => new Promise<number>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      events.push(key);
      announceStarted();
    }))
    [FINALIZE](outcome => { events.push(outcome.reason); });
  const pending = query[VALUES]().then(
    result => ({ result, error: undefined }),
    (error: unknown) => ({ result: undefined, error }),
  );
  await started;
  controller.abort(reason);
  const outcome = await pending;
  return { events, sameReason: outcome.error === reason, result: outcome.result };
}
