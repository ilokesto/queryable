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
