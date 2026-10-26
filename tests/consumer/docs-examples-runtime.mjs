import assert from 'node:assert/strict';
import {
  originalEntries, selectedEntries, orderedEntries, objectKeys, projected,
  functionalNames, firstLive, secondLive, liveCalls, bufferedPrefix,
  barrierVisits, eagerGroupCalls, highGroup, shapeObject, shapeEntries,
  shapeFrozen, cancelMigration,
} from './dist/docs-examples.js';

assert.deepEqual(originalEntries, [['2', 2], ['10', 10], ['__proto__', 3], ['constructor', 4]]);
assert.deepEqual(selectedEntries, [['2', 2], ['10', 10], ['__proto__', 3]]);
assert.deepEqual(orderedEntries, [['10', 10], ['constructor', 4], ['__proto__', 3], ['2', 2]]);
assert.deepEqual(objectKeys, ['2', '10', 'constructor', '__proto__']);
assert.deepEqual(projected, [{ name: 'Alice' }]);
assert.deepEqual(functionalNames, ['10:10', '__proto__:3', 'constructor:4']);
assert.deepEqual(firstLive, [4, 20, 6, 8]);
assert.deepEqual(secondLive, [14, 20, 6, 8]);
assert.equal(liveCalls, 8);
assert.deepEqual(bufferedPrefix, [10]);
assert.deepEqual(barrierVisits, ['2', '10', '__proto__', 'constructor']);
assert.equal(eagerGroupCalls, 4);
assert.deepEqual(highGroup, [7, 10, 4]);
assert.deepEqual(shapeObject, { count: 1, label: 'one' });
assert.deepEqual(shapeEntries, [['count', 1], ['label', 'one']]);
assert.equal(shapeFrozen, true);
assert.deepEqual(await cancelMigration(), {
  events: ['opened', 'source-key', 'closed', 'abort'],
  sameReason: true,
  result: undefined,
});

const family = await import('./dist/family-examples.js');
assert.equal(family.sameSymbol, true);
assert.deepEqual(family.doubled, [2, 4, 6]);
assert.deepEqual(family.statistics, { count: 3, sum: 6, average: 2, min: 1, max: 3 });
assert.deepEqual(family.top, [['c', 3], ['b', 2]]);
assert.deepEqual(family.chunks, [[['a', 1], ['b', 2]], [['c', 3]]]);
assert.deepEqual(family.windows, [[['a', 1], ['b', 2]], [['b', 2], ['c', 3]]]);
assert.deepEqual(family.scan, [1, 3, 6]);
assert.deepEqual(family.difference, [['a', 1], ['c', 3]]);
assert.deepEqual(family.counts, [0, 1, 0]);
assert.deepEqual(family.pairs, [['a/none', false], ['b/x', true], ['c/none', false]]);
assert.deepEqual(family.descendants, [{ value: 1, depth: 0 }, { value: 2, depth: 1 }, { value: 3, depth: 2 }]);
assert.deepEqual(await family.asyncFamilies(), {
  recovered: [1, 2], retried: [2], attempts: 2, prefix: [4],
  cancellations: 1, unlocked: true, eventType: 'data',
});
