# API Specification v1.0 — Initial Executable Surface

All endpoints are versioned under `/v1`.

- `GET /health`
- `GET /v1/dashboard/summary`
- `POST /v1/payment-sessions`
- `GET /v1/payment-sessions/:id`
- `POST /v1/payment-sessions/:id/pay` (sandbox execution)
- `GET /v1/payments`

Financial POST endpoints require `Idempotency-Key`. Production authentication will replace the development `X-Tenant-ID` mechanism with API keys/OAuth and scopes.

Error shape:
```json
{"error":{"code":"CODE","message":"Human readable message","request_id":"..."}}
```
