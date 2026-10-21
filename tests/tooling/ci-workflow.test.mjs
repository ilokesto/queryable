import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflowPath = path.join(root, '.github/workflows/ci.yml');
const sha = 'b6a11ef2a07b4414193c0f035c0355bbdbd2323d';
const movedSha = 'c6a11ef2a07b4414193c0f035c0355bbdbd2323d';

async function readGuard() {
  const workflow = await readFile(workflowPath, 'utf8');
  const guardName = '      - name: Validate immutable event head before checkout';
  const guardAt = workflow.indexOf(guardName);
  const checkoutAt = workflow.indexOf('      - uses: actions/checkout@v4');
  assert.ok(guardAt >= 0 && checkoutAt > guardAt);

  const runAt = workflow.indexOf('        run: |\n', guardAt);
  assert.ok(runAt > guardAt);
  const body = workflow.slice(runAt + '        run: |\n'.length).split('\n');
  const script = [];
  for (const line of body) {
    if (line.length > 0 && !line.startsWith('          ')) break;
    script.push(line.startsWith('          ') ? line.slice(10) : '');
  }
  return { workflow, script: script.join('\n') };
}

function executeGuard(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', ['-c', script], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

function eventEnv(overrides = {}) {
  return {
    GITHUB_REPOSITORY: 'ilokesto/queryable',
    GITHUB_SHA: sha,
    EVENT_NAME: 'pull_request',
    EVENT_REF: 'refs/pull/42/merge',
    EVENT_HEAD: sha,
    EVENT_BASE: 'main',
    EXPECTED_HEAD_SHA: sha,
    GH_TOKEN: 'fixture-token',
    ...overrides,
  };
}

test('CI contract: manual main exact head and live ref -> accepted read-only', async () => {
  const { workflow, script } = await readGuard();
  assert.match(workflow, /expected_head_sha:[\s\S]*required: true[\s\S]*type: string/);
  assert.match(workflow, /name: verify/);
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /\b(?:npm|pnpm)\s+publish\b|changesets\/action/);

  const fixture = await mkdtemp(path.join(os.tmpdir(), 'queryable-ci-head-'));
  try {
    const gh = path.join(fixture, 'gh');
    await writeFile(gh, '#!/bin/sh\nprintf "%s\\n" "$MOCK_LIVE_MAIN"\n');
    await chmod(gh, 0o755);
    const result = await executeGuard(script, eventEnv({
      EVENT_NAME: 'workflow_dispatch',
      EVENT_REF: 'refs/heads/main',
      EVENT_HEAD: sha,
      GITHUB_SHA: sha,
      EXPECTED_HEAD_SHA: sha,
      MOCK_LIVE_MAIN: sha,
      PATH: `${fixture}:${process.env.PATH}`,
    }));

    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('CI contract: wrong manual workflow SHA -> rejected before live-main lookup', async () => {
  const { script } = await readGuard();
  const result = await executeGuard(script, eventEnv({
    EVENT_NAME: 'workflow_dispatch',
    EVENT_REF: 'refs/heads/main',
    GITHUB_SHA: sha,
    EXPECTED_HEAD_SHA: movedSha,
  }));

  assert.equal(result.code, 1);
});

test('CI contract: moved live main -> rejected for manual run', async () => {
  const { script } = await readGuard();
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'queryable-ci-head-'));
  try {
    const gh = path.join(fixture, 'gh');
    await writeFile(gh, '#!/bin/sh\nprintf "%s\\n" "$MOCK_LIVE_MAIN"\n');
    await chmod(gh, 0o755);
    const result = await executeGuard(script, eventEnv({
      EVENT_NAME: 'workflow_dispatch',
      EVENT_REF: 'refs/heads/main',
      EVENT_HEAD: sha,
      GITHUB_SHA: sha,
      EXPECTED_HEAD_SHA: sha,
      MOCK_LIVE_MAIN: movedSha,
      PATH: `${fixture}:${process.env.PATH}`,
    }));

    assert.equal(result.code, 1);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('CI contract: immutable pull request head mismatch -> rejected', async () => {
  const { script } = await readGuard();
  const result = await executeGuard(script, eventEnv({ EXPECTED_HEAD_SHA: movedSha }));

  assert.equal(result.code, 1);
});

test('CI contract: malformed manual expected head -> rejected', async () => {
  const { script } = await readGuard();
  const result = await executeGuard(script, eventEnv({
    EVENT_NAME: 'workflow_dispatch',
    EVENT_REF: 'refs/heads/main',
    EXPECTED_HEAD_SHA: 'main',
  }));

  assert.equal(result.code, 1);
});
