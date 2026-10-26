import assert from 'node:assert/strict';
import { LAZY, MAP, SORT, VALUES, createQueryable } from '@ilokesto/queryable';
import { found, groups, joinGroups, joinPairs, leftPairs, mapped, narrowed, total, values } from './dist/consumer.js';

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
assert.deepEqual(joinGroups[VALUES](), [1, 1]);
assert.deepEqual(joinPairs[VALUES](), [6, 2]);
assert.deepEqual(leftPairs[VALUES](), [true, true]);

const { setDifference, setIntersection, setUnion, setOrderedUnion } = await import('./dist/consumer.js');
assert.deepEqual(setDifference[VALUES](), [{ id: 1, name: 'one' }]);
assert.deepEqual(setIntersection[VALUES](), []);
assert.deepEqual(setUnion[VALUES](), [{ id: 1, name: 'one' }, { code: 2 }]);
assert.deepEqual(setOrderedUnion[VALUES](), setUnion[VALUES]());
