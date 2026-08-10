# Payment Links (Phase 4)

## Association

Payment Links are **not** standalone URLs. Every link requires:

`organization_id` + `merchant_profile_id` (auto-ensured from org) → `public_token` for checkout.

## Capabilities

| Operation | Behavior |
|---|---|
| Create | DRAFT or ACTIVE (default ACTIVE); idempotent |
| Update | Title/description/reference/expiry/max_uses/metadata; amount locked after first use |
| Activate | DRAFT/INACTIVE → ACTIVE |
| Deactivate | ACTIVE → INACTIVE |
| Expire | ACTIVE/INACTIVE → EXPIRED (manual) or auto when `expires_at` passes |
| Cancel | → CANCELLED (terminal) |
| Reuse | INACTIVE → ACTIVE for reusable (non one-time) links under max_uses |

## Amount modes

- `FIXED` — `amount_minor` required (>0)
- `CUSTOMER_ENTERED` — amount supplied at checkout session creation

## Limits

- `one_time=true` forces `max_uses=1` and `reusable=false`
- Successful payment increments `use_count`; hitting max_uses or one_time auto-sets status `EXPIRED`
- Cancelled/expired/inactive links cannot start checkout (`PAYMENT_LINK_NOT_AVAILABLE`)

## Public URL

`{API_BASE_URL}/api/v1/checkout/{public_token}` (returned as `public_url` on merchant APIs).
