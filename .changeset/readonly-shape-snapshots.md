---
"@ilokesto/queryable": minor
---

Add opt-in readonly shape snapshots with explicit key domains, correlated
heterogeneous entries, optional-presence PICK, and safe MAP/WHERE transformations.
Keep mutable Queryable behavior unchanged and freeze only snapshot-owned shallow
containers, never caller objects or nested values.
