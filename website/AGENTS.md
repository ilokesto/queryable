# Queryable authoring website

- This private Next.js/Fumadocs workspace renders canonical `../docs` only.
- Keep the explicit `queryable/next` authoring path for English and Korean.
- Do not add release snapshots, receipts, public package catalog entries,
  released Queryable routes, a runtime alias, a library demo, or a publish
  workflow.
- Keep the existing ilokesto Fumadocs neutral theme and bilingual navigation
  conventions. Do not duplicate editable MDX here.
- Package commands are exposed from the repository root as `docs:build`,
  `docs:typecheck`, `docs:test`, `docs:start`, and
  `docs:publication:verify`; `docs:http <origin>` checks the emitted local
  origin. Run them under Node 24 (the root `.nvmrc`) and pnpm 10.17.1.
- Browser proof is local-only. Never deploy this workspace or invoke a
  publisher.
