import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { verifyRelease } from '../../scripts/release-verify.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('release verifier: clean private repository and exact HEAD -> rejects before network lookup', async () => {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  await assert.rejects(
    verifyRelease({ root, sha }),
    error => error.message === 'PRIVATE_RELEASE',
  );
});

test('release verifier: malformed SHA -> rejects before repository or network lookup', async () => {
  await assert.rejects(
    verifyRelease({ root, sha: 'main' }),
    error => error.message === 'RELEASE_SHA_INVALID',
  );
});
