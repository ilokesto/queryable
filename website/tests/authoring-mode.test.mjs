import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const mode = JSON.parse(await readFile(new URL('../lib/docs-mode.json', import.meta.url), 'utf8'));

test('Queryable docs mode: local authoring collection -> no public or released source', () => {
  assert.equal(mode.mode, 'private-authoring-only');
  assert.equal(mode.package, 'queryable');
  assert.equal(mode.channel, 'next');
  assert.deepEqual(mode.locales, ['en', 'ko']);
  assert.deepEqual(mode.publicCollections, []);
  assert.deepEqual(mode.releasedCollections, []);
  assert.deepEqual(mode.runtimeAliases, []);
  assert.deepEqual(mode.publisherWorkflows, []);
});
