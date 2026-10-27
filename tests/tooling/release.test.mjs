import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { packRelease, validateReleaseIdentity, validateVerifyRun, verifyRelease } from '../../scripts/release-verify.mjs';

const rootDir = path.resolve(import.meta.dirname, '../..');
const sha = 'a'.repeat(40);
const repository = 'ilokesto/queryable';
const manifest = { name: '@ilokesto/queryable', version: '0.0.1',
  repository: { type: 'git', url: `git+https://github.com/${repository}.git` } };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('release identity: wrong SHA, foreign repository, or private package -> rejected', () => {
  const valid = { sha, manifest, repository, head: sha };
  validateReleaseIdentity(valid);
  for (const [overrides, message] of [
    [{ sha: 'main' }, /RELEASE_SHA_INVALID/],
    [{ head: 'b'.repeat(40) }, /RELEASE_SHA_CHANGED/],
    [{ repository: 'foreign/store' }, /FOREIGN_REPOSITORY/],
    [{ manifest: { ...manifest, private: true } }, /PRIVATE_RELEASE/],
  ]) assert.throws(() => validateReleaseIdentity({ ...valid, ...overrides }), message);
});

const runFixture = () => ({
  sha, repository, workflow: { id: 7, path: '.github/workflows/ci.yml' },
  run: { id: 11, workflow_id: 7, head_sha: sha, head_branch: 'main',
    repository: { full_name: repository }, head_repository: { full_name: repository },
    event: 'workflow_dispatch', status: 'completed', conclusion: 'success' },
  jobs: [{ id: 13, name: 'verify', head_sha: sha, conclusion: 'success' }],
  artifact: { id: 17, name: `verified-package-${sha}`, expired: false,
    workflow_run: { id: 11, head_sha: sha } },
  metadata: { schemaVersion: 1, repository, sha, packSha256: 'c'.repeat(64) },
  packSha256: 'c'.repeat(64),
});

test('Verify evidence: success text with mismatched machine identities -> rejected', () => {
  validateVerifyRun(runFixture());
  for (const [mutate, expected] of [
    [input => { input.run.head_sha = 'b'.repeat(40); }, /UNVERIFIED_RELEASE_SHA/],
    [input => { input.run.repository.full_name = 'foreign/store'; }, /FOREIGN_VERIFY/],
    [input => { input.run.head_repository.full_name = 'foreign/store'; }, /FOREIGN_VERIFY_HEAD/],
    [input => { input.run.workflow_id = 99; }, /FOREIGN_WORKFLOW/],
    [input => { input.run.conclusion = 'failure'; }, /VERIFY_FAILED/],
    [input => { input.run.event = 'pull_request'; }, /UNVERIFIED_RELEASE_EVENT/],
    [input => { input.jobs[0].head_sha = 'b'.repeat(40); }, /VERIFY_CHECK_SHA/],
    [input => { input.jobs = []; }, /MISSING_VERIFY_CHECK/],
    [input => { input.artifact.workflow_run.id = 99; }, /VERIFY_ARTIFACT_RUN/],
    [input => { input.artifact.expired = true; }, /VERIFY_ARTIFACT_EXPIRED/],
    [input => { input.metadata.packSha256 = 'd'.repeat(64); }, /RELEASE_ARTIFACT_CHANGED/],
  ]) {
    const input = runFixture();
    mutate(input);
    assert.throws(() => validateVerifyRun(input), expected);
  }
});

async function releaseFixture(t, publishingEnabled = false) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'queryable-release-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'repo');
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await mkdir(path.join(root, '.github/release'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.js'), 'export const value = 42;\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ ...manifest, files: ['dist'],
    type: 'module', packageManager: 'pnpm@10.17.1', publishConfig: { access: 'public', tag: 'latest' } }));
  await writeFile(path.join(root, '.github/release/policy.json'), JSON.stringify({ repository, distTag: 'latest', publishingEnabled }));
  const env = { ...process.env, GIT_MASTER: '1', GIT_PAGER: 'cat', PAGER: 'cat',
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test' };
  const git = args => execFileSync('git', ['--no-pager', '-C', root, ...args], { env, encoding: 'utf8' }).trim();
  git(['init', '--quiet', '-b', 'main']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'Release fixture']);
  const head = git(['rev-parse', 'HEAD']);
  const artifacts = path.join(temporary, 'artifacts');
  await mkdir(artifacts);
  const packed = await packRelease(root, artifacts);
  const metadata = { schemaVersion: 1, repository, sha: head, package: manifest.name,
    version: manifest.version, file: packed.file, packSha256: packed.packSha256 };
  await writeFile(path.join(artifacts, 'verification.json'), JSON.stringify(metadata));
  const zip = path.join(temporary, 'artifact.zip');
  execFileSync('zip', ['-q', zip, packed.file, 'verification.json'], { cwd: artifacts });
  const bytes = await readFile(zip);
  const run = { ...runFixture().run, head_sha: head, run_attempt: 1 };
  const artifact = { ...runFixture().artifact, name: `verified-package-${head}`,
    workflow_run: { id: run.id, head_sha: head }, digest: `sha256:${hash(bytes)}` };
  const state = { main: head, published: false, mainReads: 0, advance: false, tag: null, artifact, calls: [] };
  const github = async endpoint => {
    state.calls.push(endpoint);
    if (endpoint === `repos/${repository}`) return { full_name: repository, default_branch: 'main' };
    if (endpoint.endsWith('/git/ref/heads/main')) {
      state.mainReads++;
      return { object: { sha: state.advance && state.mainReads > 1 ? 'b'.repeat(40) : state.main } };
    }
    if (endpoint.endsWith('/actions/workflows/ci.yml')) return runFixture().workflow;
    if (endpoint.includes('/actions/workflows/7/runs?')) return { workflow_runs: [run] };
    if (endpoint.includes('/attempts/1/jobs?')) return { total_count: 1, jobs: [{ ...runFixture().jobs[0], head_sha: head }] };
    if (endpoint.includes('/runs/11/artifacts?')) return { total_count: 1, artifacts: [state.artifact] };
    if (endpoint.includes('/git/matching-refs/')) return state.tag ? [state.tag] : [];
    throw new Error(`Unexpected read ${endpoint}`);
  };
  const registry = async () => ({ published: state.published,
    metadata: { name: manifest.name, version: manifest.version, dist: { integrity: 'sha512-Zml4dHVyZQ==' } } });
  return { root, head, state, options: { root, sha: head, github, registry, downloadArtifact: async () => bytes } };
}

test('release verification: real pack and exact downloaded artifact -> read-only eligibility', async t => {
  const fixture = await releaseFixture(t);
  const result = await verifyRelease(fixture.options);
  assert.equal(result.status, 'eligible-unpublished');
  assert.equal(result.publishAllowed, false);
  assert.equal(result.bootstrapPublishingDisabled, true);
  assert.equal(result.publishPerformed, false);
  assert.equal(result.verify.runId, 11);
  assert.equal(result.verify.artifactId, 17);
  assert.equal(fixture.state.mainReads, 2);
});

test('packRelease: real pnpm archive -> stable gzip header and saved bytes', async t => {
  const fixture = await releaseFixture(t);
  const artifacts = path.join(path.dirname(fixture.root), 'pack-regression');
  await mkdir(artifacts);

  const packed = await packRelease(fixture.root, artifacts);
  const saved = await readFile(path.join(artifacts, packed.file));

  assert.equal(packed.bytes[9], 3);
  assert.deepEqual(packed.bytes, saved);
  assert.equal(packed.packSha256, hash(saved));
});

test('release verification: enabled policy and exact artifact -> eligible without publishing', async t => {
  const fixture = await releaseFixture(t, true);

  const result = await verifyRelease(fixture.options);

  assert.equal(result.publishAllowed, true);
  assert.equal(result.bootstrapPublishingDisabled, false);
  assert.equal(result.publishPerformed, false);
});

test('release verification: main advances after packing -> no stale eligibility', async t => {
  const fixture = await releaseFixture(t);
  fixture.state.advance = true;
  await assert.rejects(verifyRelease(fixture.options), /RELEASE_SHA_CHANGED/);
});

test('release verification: existing registry version -> explicit no-publish outcome', async t => {
  const fixture = await releaseFixture(t);
  fixture.state.published = true;
  const result = await verifyRelease(fixture.options);
  assert.equal(result.status, 'already-published-no-publish');
  assert.equal(result.publishAllowed, false);
});

test('release verification: wrong tag or artifact digest -> rejected after real pack', async t => {
  const fixture = await releaseFixture(t);
  fixture.state.artifact.digest = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(verifyRelease(fixture.options), /VERIFY_DOWNLOAD_DIGEST/);
  fixture.state.artifact.digest = `sha256:${hash(await fixture.options.downloadArtifact())}`;
  fixture.state.tag = { ref: `refs/tags/${manifest.name}@${manifest.version}`, object: { type: 'commit', sha: 'b'.repeat(40) } };
  await assert.rejects(verifyRelease(fixture.options), /RELEASE_TAG_MISMATCH/);
});

test('CI dispatch: main, PR, moving head, and foreign repository -> exact gate semantics', async t => {
  const workflow = parse(await readFile(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8'));
  assert.equal(workflow.on.workflow_dispatch.inputs.expected_head_sha.required, true);
  const gate = workflow.jobs.quality.steps[0];
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'queryable-ci-gate-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await writeFile(path.join(temporary, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$TEST_LIVE_SHA"\n', { mode: 0o755 });
  const base = { ...process.env, PATH: `${temporary}:${process.env.PATH}`, GITHUB_REPOSITORY: repository,
    EVENT_BASE: 'main', EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha,
    EXPECTED_HEAD_SHA: sha, TEST_LIVE_SHA: sha, EVENT_HEAD: sha, RELEASE_PR_NUMBER: '' };
  const run = overrides => spawnSync('bash', ['-c', gate.run], { env: { ...base, ...overrides }, encoding: 'utf8' });
  assert.equal(run({}).status, 0);
  assert.notEqual(run({ TEST_LIVE_SHA: 'b'.repeat(40) }).status, 0);
  assert.notEqual(run({ EXPECTED_HEAD_SHA: 'main' }).status, 0);
  assert.notEqual(run({ GITHUB_SHA: 'b'.repeat(40) }).status, 0);
  assert.notEqual(run({ GITHUB_REPOSITORY: 'foreign/store' }).status, 0);
  assert.equal(run({ EVENT_NAME: 'pull_request', GITHUB_SHA: 'b'.repeat(40), GITHUB_REF: 'refs/pull/1/merge' }).status, 0);
  assert.notEqual(run({ EVENT_NAME: 'pull_request', EVENT_HEAD: 'b'.repeat(40) }).status, 0);
  for (const result of ['failure', 'cancelled', 'skipped', '']) {
    assert.notEqual(spawnSync('bash', ['-c', workflow.jobs.verify.steps[0].run], { env: { ...process.env, QUALITY_RESULT: result } }).status, 0);
  }
  assert.equal(workflow.jobs.verify.name, 'verify');
  assert.equal(workflow.jobs.quality.steps[1].with['fetch-depth'], 0);
  const changesets = workflow.jobs.quality.steps.find(step => step.run === 'pnpm changeset:status --since=origin/main');
  assert.ok(changesets);
  assert.equal(changesets.if, "github.event_name == 'pull_request' && github.head_ref != 'changeset-release/main'");
});

test('publisher policy: enabled automation outside Actions -> local publication rejected', async () => {
  const policy = JSON.parse(await readFile(path.join(rootDir, '.github/release/policy.json'), 'utf8'));

  const result = spawnSync(process.execPath, ['.github/release/publish-verified.mjs', sha], {
    cwd: rootDir, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false' },
  });

  assert.equal(policy.publishingEnabled, true);
  assert.equal(policy.releasePrEnabled, true);
  assert.equal(policy.distTag, 'latest');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOCAL_PUBLISH_FORBIDDEN/);
});

test('CI release PR dispatch: exact open same-repository head -> accepted, stale or foreign head -> rejected', async t => {
  const workflow = parse(await readFile(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8'));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'queryable-release-pr-gate-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await writeFile(path.join(temporary, 'gh'), '#!/bin/sh\ncase "$2" in\n  */pulls/*) printf "%s\\n" "$TEST_PR" ;;\n  *) printf "%s\\n" "$TEST_LIVE_SHA" ;;\nesac\n', { mode: 0o755 });
  const pr = { state: 'open', base: { ref: 'main' }, head: {
    ref: 'changeset-release/main', repo: { full_name: repository }, sha,
  } };
  const base = { ...process.env, PATH: `${temporary}:${process.env.PATH}`, GITHUB_REPOSITORY: repository,
    EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/changeset-release/main', GITHUB_SHA: sha,
    EXPECTED_HEAD_SHA: sha, TEST_LIVE_SHA: sha, EVENT_HEAD: sha, RELEASE_PR_NUMBER: '17',
    TEST_PR: JSON.stringify(pr) };

  const run = overrides => spawnSync('bash', ['-c', workflow.jobs.quality.steps[0].run], {
    env: { ...base, ...overrides }, encoding: 'utf8',
  }).status;

  assert.equal(run({}), 0);
  assert.notEqual(run({ TEST_LIVE_SHA: 'b'.repeat(40) }), 0);
  assert.notEqual(run({ RELEASE_PR_NUMBER: 'main' }), 0);
  assert.notEqual(run({ TEST_PR: JSON.stringify({ ...pr, state: 'closed' }) }), 0);
  assert.notEqual(run({ TEST_PR: JSON.stringify({ ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } }) }), 0);
  assert.notEqual(run({ TEST_PR: JSON.stringify({ ...pr, head: { ...pr.head, repo: { full_name: 'foreign/queryable' } } }) }), 0);
});

test('version-packages: patch Changeset -> manifest and pnpm lock stay synchronized', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'queryable-version-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(path.join(temporary, '.changeset'));
  for (const file of ['package.json', 'pnpm-lock.yaml', '.changeset/config.json']) {
    await copyFile(path.join(rootDir, file), path.join(temporary, file));
  }
  await symlink(path.join(rootDir, 'node_modules'), path.join(temporary, 'node_modules'));
  await writeFile(path.join(temporary, '.changeset/fixture.md'), '---\n"@ilokesto/queryable": patch\n---\n\nVersion fixture.\n');
  const before = JSON.parse(await readFile(path.join(temporary, 'package.json'), 'utf8'));
  const expected = before.version.replace(/\d+$/, patch => String(Number(patch) + 1));

  const result = spawnSync('pnpm', ['version-packages'], {
    cwd: temporary, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' },
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const after = JSON.parse(await readFile(path.join(temporary, 'package.json'), 'utf8'));
  const pnpmLock = parse(await readFile(path.join(temporary, 'pnpm-lock.yaml'), 'utf8'));
  assert.equal(after.version, expected);
  for (const [name, version] of Object.entries(after.devDependencies)) {
    assert.equal(pnpmLock.importers['.'].devDependencies[name].specifier, version);
  }
});
