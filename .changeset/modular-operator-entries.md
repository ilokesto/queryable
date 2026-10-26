---
"@ilokesto/queryable": minor
---

Add ESM `operators` and `symbols` subpaths with shared Symbol identity. Operator-only
consumers no longer load the root DSL at runtime; constructors intentionally retain
the full shared prototype. Preserve all root exports and functional narrowing.
