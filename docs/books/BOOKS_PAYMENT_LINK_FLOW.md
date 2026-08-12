# Books ↔ Payment Platform — one-time payment link flow

**Status:** Operational contract (V4 PostgreSQL API)  
**Decision:** Books owns customers/invoices/catalog. Payment Platform is collection-only and notifies Books via **HMAC outbound webhooks** (not `success_url` alone, not polling-first).

## Sequence

1. Books creates the customer and invoice in Books.
2. Books creates a **one-time** payment link on this platform with `external_invoice_ref`.
3. Books embeds `{APP_PUBLIC_URL}/checkout/{public_token}` on the invoice.
4. Customer pays via Stripe Payment Element on the checkout page.
5. Platform finalizes payment (webhook and/or return sync), expires the link, emits `payment.succeeded` to outbox.
6. Platform delivers a signed HTTP webhook to Books; Books marks the invoice paid using `external_invoice_ref` + `event_id` idempotency.

## Create payment link

```http
POST /api/v1/merchant/payment-links
Authorization: Bearer <merchant_api_key>
Idempotency-Key: books:{invoice_id}:{attempt}
Content-Type: application/json
```

```json
{
  "title": "Invoice INV-1001",
  "amount_mode": "FIXED",
  "amount_minor": "15000",
  "currency_code": "SAR",
  "one_time": true,
  "max_uses": 1,
  "external_invoice_ref": "books:{invoice_id}",
  "success_url": "https://books.example/invoices/{id}/paid",
  "cancel_url": "https://books.example/invoices/{id}",
  "activate": true
}
```

**Notes**

- Prefer `Idempotency-Key: books:{invoice_id}:{attempt}` so retries do not create duplicate links.
- `external_invoice_ref` is required for Books reconciliation (echoed on outbound webhooks).
- Response includes `public_token` → checkout URL `{APP_PUBLIC_URL}/checkout/{public_token}`.
- Optional later: pass/store `external_customer_id` on the customer record for clearer matching.

## Outbound webhook (Books consumer)

Configure under **Developers → Outbound Webhooks**, or:

```http
POST /api/v1/merchant/webhook-endpoints
```

```json
{
  "url": "https://books.example/webhooks/payments",
  "subscribed_events": ["payment.succeeded", "payment.failed", "refund.succeeded"]
}
```

Signing secret (`whsec_…`) is returned **once**. Verify:

- Header `x-webhook-signature: sha256=<hex>` = `HMAC-SHA256(secret, raw_body)`
- Header `x-webhook-id` = event id (idempotency key on Books side)
- Header `x-webhook-event` = event type

### Payload shape

```json
{
  "id": "<outbox_event_uuid>",
  "type": "payment.succeeded",
  "created_at": "2026-08-12T12:00:00.000Z",
  "data": {
    "payment_intent_id": "...",
    "external_invoice_ref": "books:{invoice_id}",
    "amount_minor": "15000",
    "currency_code": "SAR",
    "status": "SUCCEEDED",
    "paid_at": "2026-08-12T12:00:01.000Z"
  }
}
```

Delivery retries with exponential backoff (up to 10 attempts). Books must treat duplicate `id` as no-ops.

## What Payment Platform does **not** own

- Product / price / invoice / subscription catalog UX (hidden from merchant console; Books is source of truth).
- Treating browser `success_url` as the only paid signal.

## Related

- [BOOKS_INTEGRATION.md](../BOOKS_INTEGRATION.md) — broader design notes
- [BOOKS-INTEGRATION-GAP.md](./BOOKS-INTEGRATION-GAP.md) — historical gap report
- [PAYMENT_PRODUCTION_CLOSURE.md](../ops/PAYMENT_PRODUCTION_CLOSURE.md) — deploy checklist
