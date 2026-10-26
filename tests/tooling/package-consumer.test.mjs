import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import ts from 'typescript';
import { packRelease } from '../../scripts/release-verify.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const exec = promisify(execFile);
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  verbatimModuleSyntax: true,
  declaration: true,
  noEmitOnError: true,
  types: [],
};
const format = diagnostics => ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => root,
  getNewLine: () => '\n',
});

test('packed package: ESM and downstream declarations -> executable imports and checked contracts', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'queryable-consumer-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifacts = path.join(temporary, 'artifacts');
  const consumer = path.join(temporary, 'consumer');
  const installed = path.join(consumer, 'node_modules/@ilokesto/queryable');
  await mkdir(artifacts);
  await mkdir(installed, { recursive: true });
  await cp(path.join(root, 'tests/consumer'), consumer, { recursive: true });
  await writeFile(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');

  const packed = await packRelease(root, artifacts);
  await exec('tar', ['-xzf', path.join(artifacts, packed.file), '--strip-components=1', '-C', installed]);
  assert.equal(packed.manifest.version, '0.0.1');
  assert.equal(packed.manifest.publishConfig.access, 'public');
  assert.deepEqual(packed.manifest.dependencies ?? {}, {});
  for (const file of ['dist/index.js', 'dist/index.d.ts']) {
    assert.ok((await readFile(path.join(installed, file))).length > 0, file);
  }

  const program = ts.createProgram([path.join(consumer, 'consumer.ts')], {
    ...options, rootDir: consumer, outDir: path.join(consumer, 'dist'),
  });
  assert.equal(ts.getPreEmitDiagnostics(program).length, 0, format(ts.getPreEmitDiagnostics(program)));
  const emitted = program.emit();
  assert.equal(emitted.emitSkipped, false, format(emitted.diagnostics));
  assert.equal(emitted.diagnostics.length, 0, format(emitted.diagnostics));
  assert.ok((await readFile(path.join(consumer, 'dist/consumer.d.ts'))).length > 0);
  await exec(process.execPath, ['runtime.mjs'], { cwd: consumer });

  const downstream = ts.createProgram([path.join(consumer, 'downstream.ts')], { ...options, noEmit: true });
  const downstreamDiagnostics = ts.getPreEmitDiagnostics(downstream);
  assert.equal(downstreamDiagnostics.length, 0, format(downstreamDiagnostics));

  const invalidFile = path.join(consumer, 'invalid.ts');
  const invalid = ts.createProgram([invalidFile], { ...options, noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(invalid);
  const actual = diagnostics.map(diagnostic => {
    assert.equal(diagnostic.file?.fileName, invalidFile, format([diagnostic]));
    return [diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1, diagnostic.code];
  });
  assert.deepEqual(actual, [
    [7, 2684], [9, 2684], [10, 2345], [11, 2345], [12, 2769],
    [13, 2322], [14, 2322], [15, 2339], [17, 2540],
  ], format(diagnostics));
});
