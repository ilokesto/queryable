import assert from "node:assert/strict";
import { createRequire } from "node:module";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Use the installed test toolchain; do not fetch or add a bundler dependency.
const require = createRequire(import.meta.url);
const fromVitest = createRequire(require.resolve("vitest/package.json"));
const fromVite = createRequire(fromVitest.resolve("vite/package.json"));
const { build, version } = fromVite("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = {
  native: "export const run = input => Object.values(input).filter(v => v.score >= 5);",
  remeda: 'import { filter } from "remeda"; export const run = input => filter(Object.values(input), v => v.score >= 5);',
  queryable: 'import { createQueryable, WHERE, VALUES } from "@ilokesto/queryable"; export const run = input => createQueryable(input)[WHERE](v => v.score >= 5)[VALUES]();',
};
const settings = {
  bundle: true,
  minify: true,
  treeShaking: true,
  platform: "browser",
  format: "esm",
  target: "es2023",
  legalComments: "none",
  write: false,
  metafile: true,
};
const input = { first: { score: 2 }, second: { score: 7 }, third: { score: 9 } };
const expected = Object.values(input).filter((value) => value.score >= 5);
const results = [];
for (const [name, contents] of Object.entries(fixtures)) {
  const samples = [];
  for (let round = 0; round < 3; round++) {
    const output = await build({
      ...settings,
      stdin: { contents, resolveDir: root, sourcefile: `consumer-${name}.mjs` },
      absWorkingDir: root,
    });
    assert.equal(output.outputFiles.length, 1);
    assert.equal(output.warnings.length, 0);
    const bytes = output.outputFiles[0].contents;
    const consumer = await import(`data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}`);
    assert.deepEqual(consumer.run(input), expected);
    samples.push({
      minifiedBytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
    });
    if (round === 0) {
      results.push({
        case: name, source: contents, validated: true,
        includedInputs: Object.entries(Object.values(output.metafile.outputs)[0].inputs)
          .filter(([, contribution]) => contribution.bytesInOutput > 0)
          .map(([path, contribution]) => ({ path, bytesInOutput: contribution.bytesInOutput })),
        samples,
      });
    }
  }
  assert.deepEqual(samples[1], samples[0], "bundle size must be reproducible");
  assert.deepEqual(samples[2], samples[0], "bundle size must be reproducible");
}
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  runtime: { node: process.version, v8: process.versions.v8, esbuild: version },
  machine: { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model },
  settings,
  methodology: "three independent in-memory builds; whole minified consumer and level-9 gzip bytes; not runtime timing, heap, npm tarball or incremental package cost",
  semantics: "values-only full filter; Queryable also constructs its wrapper per call",
  results,
}, null, 2)}\n`);
