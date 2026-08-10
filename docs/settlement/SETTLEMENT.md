# Settlement

**Status:** PARTIAL (P15.1-A draft model)  
**Fees:** DEC-008 RESOLVED — schedule-driven platform fees; provider fees field; not hard-coded forever.

## Draft create

- Eligible amount per PI = captured − refunds (PENDING|SUCCEEDED)
- Excludes PIs already in an active settlement line
- Applies active fee schedule (bps + fixed, half-up)
- Stores `provider_fees_minor`, `platform_fees_minor`, `reserves_minor` (0), `adjustments_minor`, `net_minor`
- Explicit `period_start` / `period_end` (no cron)

## Not yet (P15.1-D)

Finalize, cancel, ledger posts, immutable finalized state.
