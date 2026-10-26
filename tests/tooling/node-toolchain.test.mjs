import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');

test('Node toolchain: repository version file -> security-patched Node 24.22.1 selected', async () => {
  const versionFile = path.join(root, '.nvmrc');

  const version = (await readFile(versionFile, 'utf8')).trim();

  assert.equal(version, '24.22.1');
});

for (const name of ['ci', 'release', 'publish']) {
  test(`Node toolchain: ${name} workflow -> repository version file selected`, async () => {
    const workflow = parse(await readFile(path.join(root, '.github/workflows', `${name}.yml`), 'utf8'));
    const setupSteps = Object.values(workflow.jobs).flatMap(job =>
      (job.steps ?? []).filter(step => step.uses?.startsWith('actions/setup-node@')),
    );

    const versions = setupSteps.map(step => ({
      file: step.with?.['node-version-file'],
      inline: step.with?.['node-version'],
    }));

    assert.ok(versions.length > 0);
    assert.deepEqual(versions, versions.map(() => ({ file: '.nvmrc', inline: undefined })));
  });
}
