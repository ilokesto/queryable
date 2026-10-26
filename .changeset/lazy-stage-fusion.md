---
"@ilokesto/queryable": patch
---

Fuse adjacent lazy WHERE and MAP stages while preserving callback order,
original keys, repeatable live consumption, early cleanup, and buffering boundaries.
Keep direct iteration for zero-stage views and direct generators for one-stage chains.
