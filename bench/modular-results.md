# Modular entry measurements

Issue #34 separates existing functional adapters from the constructor-owned DSL.
The separation unit is the existing adapter module plus a leaf containing the
20 core Symbols. It is not a new query engine or a per-operator file tree.

## Reproduction and artifacts

Run from this repository using Node 24.22.1 and pnpm 10.17.1:

```sh
pnpm install --frozen-lockfile
pnpm build
node bench/modular.mjs --output bench/modular-results.json
```

`modular-baseline.json` was freshly measured on October 26, 2026 at
05:05:15 UTC from base `bd97f2ef2e9baf5c07f45573660d9ae2d6d85c8e`,
before the runtime rewiring, using this same script with `--root-only`.
`modular-results.json` was measured at 05:08:11 UTC from the uncommitted
implementation. Both files contain exact consumer sources, environment,
esbuild settings, byte contributions, and complete metafile input/import graphs.
These are fresh measurements, not the older `bench/bundle.mjs` report.

Environment: macOS Darwin 27.2.0, arm64 Apple M4 Pro, Node v24.22.1,
V8 13.6.233.17-node.58, esbuild 0.28.2 from the existing Vitest/Vite toolchain.
No bundler or runtime dependency was added. The script requests browser-platform
ES2023 ESM output only as a measurement target, not an additional package build.

Each fixture gets one fresh in-memory minified, tree-shaken build with no legal
comments and a metafile. Sizes include the whole consumer module; gzip uses
level 9. The script checks semantic results in a separately bundled provider
and consumer, and directly executes constructor/chain outputs. The standalone
terminal/operator outputs omit their query provider, so they cannot be executed
against an independently bundled package copy with different local Symbols.
There are no timing, heap, size, or reproducibility thresholds in correctness tests.

## Results

Each cell is minified bytes / gzip bytes.

| Consumer | Baseline root | Rewired root | Operator subpath |
| --- | ---: | ---: | ---: |
| Constructor only | 11,579 / 3,802 | 11,583 / 3,803 | Not a constructor entry |
| `values` terminal on an existing query | 11,611 / 3,808 | 11,615 / 3,813 | 77 / 96 |
| `where(n => n > 1)` on an existing query | 11,642 / 3,824 | 11,646 / 3,833 | 108 / 112 |
| Constructor, lazy filter/map/limit, values | 11,948 / 3,922 | 11,952 / 3,922 | 11,952 / 3,923 |

The root constructor did not shrink. The full chain did not shrink either,
even when its adapters come from `operators`. Those consumers intentionally
retain the complete shared prototype and its family implementations.
The small byte differences are output layout/minifier effects, not performance
improvements. Gzip can exceed the raw size for tiny modules.

## Dependency graph evidence

Before the change, `functional.js -> index.js` and `async.js -> index.js`
form runtime cycles with the root's reexports. The root initializes and freezes
the complete record and sequence prototypes. Even a root `values` or `where`
consumer retains emitted `index.js`, `ordering.js`, `stateful.js`,
`distinct.js`, `aggregation.js`, `lookup.js`, `bounds.js`, and `fusion.js`.
The post-change root terminal/operator graphs still retain that DSL cost.

The new terminal/operator subpath graphs have exactly these package inputs:

```text
consumer -> dist/functional.js -> dist/core-symbols.js
```

Neither `index.js`, `async.js`, nor any family implementation is in those
metafile input graphs, not merely absent from their emitted byte contributions.
The terminal contributes 23 bytes from core Symbols and 28 from adapters; the
operator contributes 22 and 52 respectively. Consumer/export syntax accounts
for the rest.

The constructor and complete chain still emit the full synchronous families,
core Symbols, and root implementation. Their scanned graph also includes root
reexports whose output may be removed, such as the async implementation.
This distinction matters: scanning a module and emitting its code are different.

Native packed-ESM tests additionally use Node loader hooks to verify that an
`operators`-first import loads only `functional.js` and `core-symbols.js`.
The `symbols` entry reexports all 58 existing public Symbols from core and
family definitions; native ESM loads those family modules but no root, async,
or functional module. It does not promise per-Symbol module loading.
The existing `sideEffects: false` setting is unchanged and is not the evidence
for either boundary.

## Identity, types, and limits

Source tests exercise root-, symbols-, operators-, and async-first imports.
Packed consumers run root-, operators-, and symbols-first in fresh Node
processes. They compare every public Symbol, every adapter function, record
methods, sequence-chain methods, and shared terminals. Async queries accept the
same subpath Symbols. Packed NodeNext consumers compile, emit declarations,
compile downstream consumers of those declarations, and reject private or
nonexistent imports. Boolean/literal-false/type-guard narrowing remains intact.

All identity guarantees apply to one resolved package instance. Separate
installations or independently inlined bundles are separate instances; this
change does not introduce `Symbol.for` or a global registry.
Measurements are not runtime speed, retained heap, npm tarball size, or
incremental cost after a host has already bundled the DSL. An application that
creates its own query still pays the constructor cost.

The rejected alternative was splitting individual prototype methods into a
registration/plugin engine. That would change the established full-method
contract and require algorithm/lifetime changes outside this issue. Two new
Symbol modules and import-only rewiring provide the measured adapter boundary
without that trade-off. Future operator families can reexport their existing
Symbols through `symbols.ts`; platform adapters remain separate entries.
