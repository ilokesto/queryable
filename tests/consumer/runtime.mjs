import assert from 'node:assert/strict';
import { ENTRIES, LAZY, MAP, MAP_CONCURRENT, SORT, VALUES, createAsyncQuerySequence, createQueryable, iterateAsyncEntries } from '@ilokesto/queryable';
import { concurrentMapped, concurrentView, found, groups, mapped, narrowed, recoveredQuery, retriedQuery, total, values } from './dist/consumer.js';

assert.deepEqual(values, ['one']);
assert.deepEqual(narrowed[VALUES](), ['one']);
assert.equal(found, 2);
assert.deepEqual(groups.text[VALUES](), ['one']);
assert.deepEqual(mapped[VALUES](), [3, 1]);
assert.deepEqual(total, { sum: 4, keys: ['first', 'second'] });
const query = createQueryable({ 1: 10, 2: 20 });
assert.deepEqual(query[SORT]((a, b) => b - a)[VALUES](), [20, 10]);
assert.equal(query[MAP], createQueryable({ a: 1 })[MAP]);
assert.equal(query[LAZY]()[MAP], mapped[MAP]);

assert.deepEqual(await concurrentMapped[ENTRIES](), [['__proto__', '__proto__:1'], ['2', '2:2']]);
assert.deepEqual(await Array.fromAsync(concurrentView), [['__proto__', '__proto__:1'], ['2', '2:2']]);
assert.equal(concurrentMapped[MAP_CONCURRENT], createAsyncQuerySequence(() => [])[MAP_CONCURRENT]);
assert.ok(Object.isFrozen(Object.getPrototypeOf(concurrentMapped)));
const gates = [Promise.withResolvers(), Promise.withResolvers()];
const started = Promise.withResolvers();
let calls = 0;
const completionOrder = createAsyncQuerySequence(() => [['a', 0], ['b', 1]])
  [MAP_CONCURRENT](value => {
    if (++calls === 2) {
      started.resolve();
    }
    return gates[value].promise;
  }, { concurrency: 2, prefetch: 1, reorderBuffer: 1, ordered: false });
const iterator = iterateAsyncEntries(completionOrder)[Symbol.asyncIterator]();
const first = iterator.next();
await started.promise;
gates[1].resolve('second');
assert.deepEqual(await first, { done: false, value: ['b', 'second'] });
gates[0].resolve('first');
assert.deepEqual(await iterator.next(), { done: false, value: ['a', 'first'] });
assert.equal((await iterator.next()).done, true);
assert.deepEqual(await recoveredQuery[VALUES](), ['recovered']);
assert.deepEqual(await retriedQuery[VALUES](), [7]);
