---
name: Database CHECK synchronization
description: Why changed state and timing checks need explicit SQL reconciliation.
---

Schema push does not reliably replace an existing PostgreSQL CHECK definition.
Changing accepted state values or duration rules needs explicit atomic CHECK
reconciliation and a test against the running database.

**Why:** Schema push reported success while an older database check still rejected
interviewer-ended submissions that the updated application and schema allowed.

**How to apply:** Verify actual database constraint definitions when extending
session state or timing. Reconcile without resetting or deleting session history;
do not treat a successful schema push as proof the changed rule is active.
