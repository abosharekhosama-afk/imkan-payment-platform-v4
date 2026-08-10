# Webhook → Payment Intent State Apply (BG-W1)

**Status:** Implemented (sandbox / verified webhook path)  
**Production Ready:** NOT claimed

## Purpose

After a provider webhook is signature-verified, persisted, and de-duplicated, apply mapped terminal outcomes to the Payment Intent state machine.

## Flow

1. Receive webhook
2. Identify provider + validate signature / replay
3. Persist `provider_webhook_events` (dedupe by provider event id)
4. **`applyProviderWebhookToPaymentIntent`** (`apps/api/src/providers/webhook-state-apply.ts`)
5. Mark webhook PROCESSED
6. Outbox / audit as applicable

## Mapping

| Event type pattern | Target PI status |
|---|---|
| succeeded / captured / paid / success | SUCCEEDED |
| failed / declined / failure | FAILED |
| cancel | CANCELLED |

Unmapped types → no state change (`unmapped_event_type`).

## Idempotency

- Already at target status → skip
- Terminal PI (SUCCEEDED/FAILED/CANCELLED/EXPIRED) → skip
- CREATED / REQUIRES_PAYMENT → transition via PROCESSING first, then terminal

## Notes

- Does **not** write `payment_intents.provider_reference` (column lives on attempts where present)
- Sets `succeeded_at` / `failed_at` extras on terminal success/fail
- Live provider webhooks remain gated by **DEC-009**
