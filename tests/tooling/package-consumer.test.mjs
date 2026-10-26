import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
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

  for (const [title, file] of [['migration-example', 'docs-examples.ts'], ['family-example', 'family-examples.ts']]) {
    const example = await readFile(path.join(consumer, file), 'utf8');
    for (const document of ['docs/index.mdx', 'docs/index.ko.mdx']) {
      const source = await readFile(path.join(root, document), 'utf8');
      const fences = [...source.matchAll(new RegExp('^```ts title="' + title + '"\\r?\\n([\\s\\S]*?)^```$', 'gm'))];
      assert.equal(fences.length, 1, `${document}: one executable ${title} module`);
      assert.equal(fences[0][1], example, `${document}: shipped example matches packed consumer`);
    }
  }

  const packed = await packRelease(root, artifacts);
  await exec('tar', ['-xzf', path.join(artifacts, packed.file), '--strip-components=1', '-C', installed]);
  assert.equal(packed.manifest.version, '0.0.1');
  assert.equal(packed.manifest.publishConfig.access, 'public');
  assert.deepEqual(packed.manifest.dependencies ?? {}, {});
  for (const entry of ['.', './streams', './operators', './symbols']) {
    const exported = packed.manifest.exports[entry];
    assert.deepEqual(Object.keys(exported), ['types', 'import']);
    for (const file of Object.values(exported)) {
      assert.ok((await readFile(path.join(installed, file))).length > 0, file);
    }
  }

  const program = ts.createProgram(['consumer.ts', 'streams.ts', 'functional.ts', 'modules.ts', 'shape.ts', 'docs-examples.ts', 'family-examples.ts'].map(file => path.join(consumer, file)), {
    ...options, rootDir: consumer, outDir: path.join(consumer, 'dist'),
  });
  assert.equal(ts.getPreEmitDiagnostics(program).length, 0, format(ts.getPreEmitDiagnostics(program)));
  const emitted = program.emit();
  assert.equal(emitted.emitSkipped, false, format(emitted.diagnostics));
  assert.equal(emitted.diagnostics.length, 0, format(emitted.diagnostics));
  assert.ok((await readFile(path.join(consumer, 'dist/consumer.d.ts'))).length > 0);
  await exec(process.execPath, ['runtime.mjs'], { cwd: consumer });
  await exec(process.execPath, ['streams-runtime.mjs'], { cwd: consumer });
  await exec(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.EventTarget = undefined;
    globalThis.ReadableStream = undefined;
    const root = await import('@ilokesto/queryable');
    assert.equal('fromReadableStream' in root, false);
    const streams = await import('@ilokesto/queryable/streams');
    assert.equal(typeof streams.fromEventTarget, 'function');
  `], { cwd: consumer });
  await exec(process.execPath, ['dist/functional.js'], { cwd: consumer });
  await exec(process.execPath, ['docs-examples-runtime.mjs'], { cwd: consumer, timeout: 10_000 });
  await exec(process.execPath, ['dist/modules.js'], { cwd: consumer });
  for (const entry of ['@ilokesto/queryable', '@ilokesto/queryable/operators', '@ilokesto/queryable/symbols']) {
    await exec(process.execPath, ['modules.mjs', entry], { cwd: consumer });
  }

  await writeFile(path.join(consumer, 'functional-downstream.ts'), [
    'import { narrowed, mapped, ordered, deferred, transform, nativeResult, found } from "./dist/functional.js";',
    'import type { Queryable, QuerySequence } from "@ilokesto/queryable";',
    'export const record: Queryable<string> = narrowed;',
    'export const numbers: Queryable<number> = mapped;',
    'export const sequence: QuerySequence<number> = ordered;',
    'export const live: QuerySequence<string | number> = deferred;',
    'export const reuse: (query: Queryable<string | number>) => number[] = transform;',
    'export const native: boolean = nativeResult;',
    'export const lookup: number | undefined = found;',
  ].join('\n'));
  await writeFile(path.join(consumer, 'modules-downstream.ts'), [
    'import { truthy, empty, truthySequence, truthyFound, neverFound, mapped, ordered, transform, symbolWhere } from "./dist/modules.js";',
    'import type { Queryable, QuerySequence, WHERE } from "@ilokesto/queryable";',
    'export const record: Queryable<"yes"> = truthy;',
    'export const absent: Queryable<never> = empty;',
    'export const live: QuerySequence<"yes"> = truthySequence;',
    'export const found: "yes" | undefined = truthyFound;',
    'export const none: undefined = neverFound;',
    'export const numbers: Queryable<number> = mapped;',
    'export const sequence: QuerySequence<number> = ordered;',
    'export const reuse: (query: Queryable<string>) => number[] = transform;',
    'export const key: typeof WHERE = symbolWhere;',
  ].join('\n'));
  const { invalidShapePrograms, shapeDownstreamSource } = await import(pathToFileURL(path.join(consumer, 'dist/shape.js')).href);
  const shapeDownstream = path.join(consumer, 'shape-downstream.ts');
  await writeFile(shapeDownstream, shapeDownstreamSource);
  const shapeProgram = ts.createProgram([shapeDownstream], { ...options, noEmit: true });
  const shapeDiagnostics = ts.getPreEmitDiagnostics(shapeProgram);
  assert.equal(shapeDiagnostics.length, 0, format(shapeDiagnostics));
  for (const { name, source, codes } of invalidShapePrograms) {
    const file = path.join(consumer, `invalid-shape-${name}.ts`);
    await writeFile(file, [
      'import { COUNT, ENTRIES, FIRST, PICK, TO_OBJECT, createShapeQueryable } from "@ilokesto/queryable";',
      'import { snapshot, picked, mapped, narrowed, bounded, unbounded, entries, afterFiltering, subset, openInput } from "./dist/shape.js";',
      source,
    ].join('\n'));
    const invalidShape = ts.createProgram([file], { ...options, noEmit: true });
    const failures = ts.getPreEmitDiagnostics(invalidShape);
    assert.ok(failures.every(failure => failure.file?.fileName === file), format(failures));
    assert.deepEqual(failures.map(failure => failure.code), codes, `${name}\n${format(failures)}`);
  }

  const downstream = ts.createProgram([
    path.join(consumer, 'downstream.ts'), path.join(consumer, 'functional-downstream.ts'),
    path.join(consumer, 'modules-downstream.ts'),
  ], { ...options, noEmit: true });
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

  const modularInvalidFile = path.join(consumer, 'modules-invalid.ts');
  const modularInvalid = ts.createProgram([modularInvalidFile], { ...options, noEmit: true });
  const modularDiagnostics = ts.getPreEmitDiagnostics(modularInvalid);
  assert.deepEqual(modularDiagnostics.map(diagnostic => {
    assert.equal(diagnostic.file?.fileName, modularInvalidFile, format([diagnostic]));
    return [diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1, diagnostic.code];
  }), [[1, 2305], [2, 2724], [3, 2307], [4, 2307], [5, 2307], [6, 2307]], format(modularDiagnostics));
});
