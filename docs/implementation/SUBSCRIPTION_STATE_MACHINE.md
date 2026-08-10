# Subscription State Machine (Phase 6)

Statuses: `TRIALING`, `ACTIVE`, `PAST_DUE`, `PAUSED`, `CANCELLED`, `UNPAID`, `EXPIRED`.

Renewal-eligible: `TRIALING`, `ACTIVE`, `PAST_DUE`.

Key transitions (DEC-007):

- Failed collection → `PAST_DUE`
- Max retries exhausted → `UNPAID` (+ 3-day `grace_until`)
- Grace elapsed → `EXPIRED`
- Successful collection → `ACTIVE` + period advance
- `cancel_at_period_end` → `CANCELLED` when `current_period_end` passes

Append-only history: `subscription_transitions`.
