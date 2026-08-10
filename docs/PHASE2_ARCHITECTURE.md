# Phase 2 Architecture

```text
HTTP Routes
    |
    v
PaymentApplicationService (compatibility facade)
    |
    +--> PaymentService ---------> PaymentProvider
    |          |                      |
    |          +--> LedgerService     +--> SandboxProvider
    |
    +--> RefundService -----------> LedgerService
    |
    +--> PaymentLinkService ------> PaymentService
    |
    +--> CheckoutService ---------> PaymentLinkService + PaymentService
    |
    +--> WebhookDeliveryWorker ---> Outbox -> Webhook Endpoint
```

The key boundary is `PaymentProvider`. Application services should not know provider-specific HTTP, SDK, credentials, or payload shapes.
