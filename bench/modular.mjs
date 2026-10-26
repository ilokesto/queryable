import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const fromVitest = createRequire(require.resolve("vitest/package.json"));
const fromVite = createRequire(fromVitest.resolve("vite/package.json"));
const { build, version } = fromVite("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const rootOnly = process.argv.includes("--root-only");
const settings = {
  bundle: true, minify: true, treeShaking: true,
  platform: "browser", format: "esm", target: "es2023",
  legalComments: "none", write: false, metafile: true,
};
const fixtures = {
  constructor: {
    source: 'import { createQueryable } from "@ilokesto/queryable"; export const run = createQueryable;',
    check: run => assert.deepEqual(Object.entries(run({ a: 1 })), [["a", 1]]),
  },
  terminal: {
    source: 'import { values } from "ENTRY"; export const run = values;',
    check: (run, query) => assert.deepEqual(run(query), [1, 2, 3]),
  },
  operator: {
    source: 'import { where } from "ENTRY"; export const run = where(n => n > 1);',
    check: (run, query, symbols) => assert.deepEqual(run(query)[symbols.VALUES](), [2, 3]),
  },
  chain: {
    source: 'import { createQueryable } from "@ilokesto/queryable"; import { pipe, lazy, where, map, limit, values } from "ENTRY"; export const run = input => pipe(pipe(createQueryable(input), lazy, where(n => n > 1), map(n => n * 10)), limit(1), values);',
    check: run => assert.deepEqual(run({ a: 1, b: 2, c: 3 }), [20]),
  },
};
const results = [];
for (const entry of rootOnly ? ["root"] : ["root", "operators"]) {
  for (const [name, fixture] of Object.entries(fixtures)) {
    if (entry === "operators" && name === "constructor") { continue; }
    const source = fixture.source.replaceAll("ENTRY",
      entry === "root" ? "@ilokesto/queryable" : "@ilokesto/queryable/operators");
    const output = await build({
      ...settings, absWorkingDir: root,
      stdin: { contents: source, resolveDir: root, sourcefile: `consumer-${entry}-${name}.mjs` },
    });
    assert.equal(output.outputFiles.length, 1);
    assert.deepEqual(output.warnings, []);
    const bytes = output.outputFiles[0].contents;
    const consumer = await import(`data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}`);
    // Build the provider and consumer together only for execution validation.
    // Independently bundled copies intentionally have distinct local Symbols.
    const validation = await build({
      ...settings, absWorkingDir: root,
      stdin: {
        contents: `${source}\nimport * as api from "@ilokesto/queryable"; export { api };`,
        resolveDir: root, sourcefile: `validate-${entry}-${name}.mjs`,
      },
    });
    const validated = await import(`data:text/javascript;base64,${Buffer.from(validation.outputFiles[0].contents).toString("base64")}`);
    fixture.check(validated.run, validated.api.createQueryable({ a: 1, b: 2, c: 3 }), validated.api);
    if (name === "constructor" || name === "chain") { fixture.check(consumer.run); }
    const emitted = Object.values(output.metafile.outputs)[0];
    results.push({
      entry, case: name, source, validated: true,
      minifiedBytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
      includedInputs: Object.entries(emitted.inputs)
        .filter(([, contribution]) => contribution.bytesInOutput > 0)
        .map(([path, contribution]) => ({ path, bytesInOutput: contribution.bytesInOutput })),
      importGraph: Object.entries(output.metafile.inputs)
        .map(([path, input]) => ({ path, imports: input.imports })),
    });
  }
}
const report = {
  schemaVersion: 1, measuredAt: new Date().toISOString(),
  runtime: { node: process.version, v8: process.versions.v8, esbuild: version },
  machine: { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model },
  settings,
  methodology: "one fresh in-memory build per fixture; whole minified ESM consumer and level-9 gzip bytes; separate combined provider validates execution; no size thresholds",
  limits: "terminal/operator receive an existing query: provider cost is excluded there; constructor/chain include the complete shared prototype; not runtime timing, heap, tarball size, or a claim about duplicated package installations",
  results,
};
const outputIndex = process.argv.indexOf("--output");
if (outputIndex !== -1) {
  const destination = process.argv[outputIndex + 1];
  assert.ok(destination, "--output requires a path");
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify({
  ...report,
  results: report.results.map(({ importGraph, includedInputs, ...result }) => ({
    ...result, graphInputs: importGraph.map(input => input.path), includedInputs,
  })),
}, null, 2)}\n`);
