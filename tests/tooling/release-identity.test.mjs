import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReleaseIdentity } from '../../scripts/release-verify.mjs';

const sha = 'a'.repeat(40);
const identity = {
  sha,
  head: sha,
  repository: 'ilokesto/queryable',
  manifest: {
    name: '@ilokesto/queryable',
    version: '0.0.1',
    private: false,
    repository: { url: 'git+https://github.com/ilokesto/queryable.git' },
  },
};

test('release identity: public Queryable and exact repository HEAD -> accepted', () => {
  assert.doesNotThrow(() => validateReleaseIdentity(identity));
});

test('release identity: private Queryable -> rejected before network lookup', () => {
  assert.throws(
    () => validateReleaseIdentity({ ...identity, manifest: { ...identity.manifest, private: true } }),
    /PRIVATE_RELEASE/,
  );
});

test('release identity: malformed SHA -> rejected before repository or network lookup', () => {
  assert.throws(
    () => validateReleaseIdentity({ ...identity, sha: 'main' }),
    /RELEASE_SHA_INVALID/,
  );
});
