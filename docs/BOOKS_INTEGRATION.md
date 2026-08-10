# Payments ↔ Books Integration Contract

The payment platform keeps its own ledger and payment state. The Books application should treat Payments as the source of truth for payment execution and Books as the source of truth for accounting documents.

## Recommended flow

1. Books creates an invoice and stores its own `invoice_id`.
2. Books calls `POST /v1/integrations/books/payment-intents` with the invoice ID, amount, currency, customer and return/cancel URLs.
3. Payments returns a payment session. The Books UI redirects the customer to the hosted checkout/payment page.
4. Payments emits `payment.succeeded`, `payment.failed` and `refund.succeeded` events.
5. Books consumes those events idempotently and records/updates the invoice payment allocation.
6. For Zoho Books, the connector can record a customer payment through the Zoho Books `customerpayments` API.

## Idempotency

Every write from Books must include `Idempotency-Key`. Books should use a deterministic key such as `books:{invoice_id}:{attempt_number}`.

## External IDs

Use `external_invoice_id` and `external_customer_id` for cross-system correlation. Never use display invoice numbers as the primary correlation key.

## Security

- Use a dedicated Payments API key with the minimum required scope.
- Sign Books webhooks with HMAC-SHA256.
- Verify signatures before processing.
- Store event IDs and reject duplicates.
- Never send card number/CVV/PIN to Books or Payments core APIs.

## Zoho Books

The built-in Zoho Books connector uses OAuth 2.0 and encrypted access/refresh tokens. It supports invoice lookup and creating customer payments. The integration follows the official Zoho Books API model: OAuth 2.0, organization ID, invoice IDs, customer payments and webhooks.
