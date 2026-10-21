import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { verifyAuthoring } from '../../scripts/docs-publication.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('docs publication verifier: private canonical content -> authoring-only result', async () => {
  const result = await verifyAuthoring(root);

  assert.equal(result.status, 'pass');
  assert.equal(result.mode, 'private-authoring-only');
  assert.equal(result.private, true);
  assert.deepEqual(result.locales, ['en', 'ko']);
  assert.equal(result.publicCollections, 0);
  assert.equal(result.releasedCollections, 0);
  assert.equal(result.releaseReceipts, 0);
  assert.equal(result.runtimeAliases, 0);
  assert.equal(result.publisherWorkflows, 0);
});

test('docs publication verifier: private false fixture -> rejected before authoring acceptance', async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'queryable-docs-private-'));
  try {
    const packageManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    packageManifest.private = false;
    await writeFile(path.join(fixture, 'package.json'), JSON.stringify(packageManifest));
    await mkdir(path.join(fixture, 'website/lib'), { recursive: true });
    await mkdir(path.join(fixture, 'docs'), { recursive: true });
    await mkdir(path.join(fixture, '.github/workflows'), { recursive: true });
    await writeFile(path.join(fixture, 'website/package.json'), JSON.stringify({
      private: true,
      dependencies: {},
    }));
    await writeFile(path.join(fixture, 'website/lib/docs-mode.json'), JSON.stringify({
      mode: 'private-authoring-only',
      package: 'queryable',
      channel: 'next',
      locales: ['en', 'ko'],
      canonicalDocs: '../docs',
      publicCollections: [],
      releasedCollections: [],
      runtimeAliases: [],
      publisherWorkflows: [],
    }));
    await writeFile(path.join(fixture, 'website/source.config.ts'), 'defineDocs({ dir: authoringMode.canonicalDocs });');
    await writeFile(path.join(fixture, 'pnpm-workspace.yaml'), 'packages:\n  - .\n  - website\n');
    await writeFile(path.join(fixture, 'docs/meta.json'), '{"pages":["index"]}');
    await writeFile(path.join(fixture, 'docs/index.mdx'), '# Queryable');
    await writeFile(path.join(fixture, 'docs/index.ko.mdx'), '# Queryable');
    await writeFile(path.join(fixture, '.github/workflows/ci.yml'), 'name: Verify\n');

    await assert.rejects(
      verifyAuthoring(fixture),
      error => error.code === 'PRIVATE_PACKAGE_REQUIRED',
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
