import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { git, repositoryBoundary } from '../../scripts/verify-migration.mjs';

async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'queryable-worktree-boundary-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const repository = path.join(parent, 'repository');
  const linked = path.join(parent, 'linked');
  await mkdir(repository);
  await git(repository, ['init', '--quiet']);
  await git(repository, [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--allow-empty', '--quiet', '-m', 'fixture',
  ]);
  return { parent, repository, linked };
}

test('repository boundary: primary repository -> self-contained store accepted', async t => {
  const { repository } = await fixture(t);

  await repositoryBoundary(repository);
});

test('repository boundary: registered linked worktree -> common store accepted', async t => {
  const { repository, linked } = await fixture(t);
  await git(repository, ['worktree', 'add', '--detach', linked, 'HEAD']);

  await repositoryBoundary(linked);
});

test('repository boundary: unregistered external gitdir -> rejected', async t => {
  const { repository, linked } = await fixture(t);
  await mkdir(linked);
  await writeFile(path.join(linked, '.git'), `gitdir: ${path.join(repository, '.git')}\n`);

  const verify = repositoryBoundary(linked);

  await assert.rejects(verify, { code: 'EXTERNAL_OBJECT_STORE' });
});

test('repository boundary: linked worktree with incorrect backlink -> rejected', async t => {
  const { repository, linked } = await fixture(t);
  await git(repository, ['worktree', 'add', '--detach', linked, 'HEAD']);
  const pointer = await readFile(path.join(linked, '.git'), 'utf8');
  const gitDirectory = await realpath(pointer.trim().slice('gitdir: '.length));
  await writeFile(path.join(gitDirectory, 'gitdir'), `${path.join(repository, '.git')}\n`);

  const verify = repositoryBoundary(linked);

  await assert.rejects(verify, { code: 'EXTERNAL_OBJECT_STORE' });
});

test('repository boundary: linked worktree with alternate object store -> rejected', async t => {
  const { repository, linked } = await fixture(t);
  await git(repository, ['worktree', 'add', '--detach', linked, 'HEAD']);
  await writeFile(path.join(repository, '.git/objects/info/alternates'), '/outside/objects\n');

  const verify = repositoryBoundary(linked);

  await assert.rejects(verify, { code: 'EXTERNAL_OBJECT_STORE' });
});
