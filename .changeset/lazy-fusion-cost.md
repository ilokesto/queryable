---
"@ilokesto/queryable": patch
---

Reduce lazy mapping and fused pipeline traversal overhead by reading normalized entry tuples directly instead of creating an array iterator for each entry.
