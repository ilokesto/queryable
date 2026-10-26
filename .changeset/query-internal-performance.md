---
"@ilokesto/queryable": patch
---

Read COUNT and FIRST directly from materialized sequence entries, and buffer only requested sequence PICK keys while preserving full upstream evaluation and requested output order.
