# Payment Platform

## Entity Relationship Model v1.0

**Status:** Approved Baseline for Implementation
**Date:** 2026-08-03
**Database:** MySQL 8+
**Architecture:** Modular Monolith
**Tenancy:** Multi-Tenant
**Financial Model:** Double-Entry Ledger

---

## 1. ER Model Principles

القواعد الأساسية:

1. كل Business Entity يجب أن تكون مرتبطة بـ Tenant/Merchant حيثما كان ذلك منطقيًا.
2. لا يوجد اعتماد مباشر للـ Domain على MySQL.
3. Financial records immutable.
4. لا يتم حذف Payment/Ledger/Payout/Settlement records.
5. التعديلات المالية تتم من خلال state transition أو reversal.
6. كل Financial Operation لديها:

   * `id`
   * `reference`
   * `correlation_id`
   * `created_at`
7. كل monetary value لها:

   * amount
   * currency
8. جميع الـ IDs تستخدم UUID/ULID داخليًا.
9. External provider IDs تحفظ منفصلة عن internal IDs.
10. كل Tenant معزول على مستوى Application + Repository + Authorization.

---

# 2. Core Entity Hierarchy

```text
Platform
│
├── Tenant
│   │
│   ├── Merchant
│   │   ├── Business Profile
│   │   ├── Users
│   │   ├── Roles
│   │   ├── Permissions
│   │   ├── KYC/KYB
│   │   ├── Bank Accounts
│   │   ├── Customers
│   │   ├── Payment Methods
│   │   ├── Payment Sessions
│   │   ├── Payments
│   │   ├── Refunds
│   │   ├── Disputes
│   │   ├── Payment Links
│   │   ├── Ledger Accounts
│   │   ├── Balances
│   │   ├── Settlements
│   │   ├── Payouts
│   │   ├── Reconciliation
│   │   ├── Webhooks
│   │   ├── API Keys
│   │   └── Reports
│   │
│   └── Platform Configuration
│
├── Providers
│   ├── Payment Providers
│   ├── Bank Providers
│   └── KYC Providers
│
└── Platform Services
    ├── Audit
    ├── Notifications
    ├── Outbox
    ├── Inbox
    └── Feature Flags
```

---

# 3. Identity Context

## Tenant

```text
Tenant
- id
- external_id
- name
- status
- default_country
- default_currency
- timezone
- locale
- created_at
- updated_at
```

Relationships:

```text
Tenant 1 ─── N Merchant
Tenant 1 ─── N User
Tenant 1 ─── N AuditLog
Tenant 1 ─── N APIKey
```

---

## Merchant

```text
Merchant
- id
- tenant_id
- legal_name
- display_name
- business_type
- industry
- country
- default_currency
- timezone
- status
- onboarding_status
- verification_status
- risk_status
- created_at
- updated_at
```

---

# 4. Users / RBAC

```text
User
- id
- tenant_id
- email
- password_hash
- first_name
- last_name
- phone
- status
- mfa_enabled
- last_login_at
```

```text
Role
- id
- tenant_id
- name
- description
```

```text
Permission
- id
- key
- description
```

Relations:

```text
User N ─── N Role
Role N ─── N Permission
```

Examples:

```text
payments.read
payments.create
payments.refund

customers.read
customers.write

payouts.read
payouts.create

reports.read
reports.export

developers.manage
webhooks.manage

users.manage
settings.write
```

---

# 5. Compliance Context

## KYC Application

```text
KycApplication
- id
- merchant_id
- status
- submitted_at
- approved_at
- rejected_at
- rejection_reason
- provider_id
- provider_reference
```

Statuses:

```text
DRAFT
SUBMITTED
PROCESSING
MORE_INFORMATION_REQUIRED
APPROVED
REJECTED
SUSPENDED
```

---

## Business Representative

```text
BusinessRepresentative
- id
- merchant_id
- first_name
- last_name
- email
- phone
- date_of_birth
- country
- verification_status
```

---

## Beneficial Owner

```text
BeneficialOwner
- id
- merchant_id
- first_name
- last_name
- ownership_percentage
- country
- verification_status
```

---

## Document

```text
Document
- id
- merchant_id
- kyc_application_id
- type
- storage_key
- mime_type
- status
- uploaded_at
```

---

# 6. Customer Context

```text
Customer
- id
- merchant_id
- external_reference
- name
- email
- phone
- country
- status
- metadata
- created_at
- updated_at
```

Relations:

```text
Customer
 ├── Addresses
 ├── PaymentMethods
 ├── PaymentSessions
 ├── Payments
 ├── Refunds
 ├── Disputes
 └── Mandates
```

---

# 7. Customer Address

```text
CustomerAddress
- id
- customer_id
- type
- name
- address_line_1
- address_line_2
- city
- state
- postal_code
- country
```

Types:

```text
BILLING
SHIPPING
```

---

# 8. Payment Method Context

## Payment Method

```text
PaymentMethod
- id
- merchant_id
- customer_id
- provider_id
- type
- status
- token_reference
- brand
- last4
- expiry_month
- expiry_year
- country
- metadata
```

Types:

```text
CARD
BANK_ACCOUNT
BANK_TRANSFER
ACH
UPI
WALLET
REGIONAL_METHOD
PROVIDER_METHOD
```

لا نخزن:

```text
PAN
CVV
Raw Banking Credentials
```

إلا إذا كان هناك architecture/PCI سبب واضح.

---

## Payment Method Session

```text
PaymentMethodSession
- id
- merchant_id
- customer_id
- provider_id
- status
- expires_at
```

---

# 9. Payment Context

## Payment Session

```text
PaymentSession
- id
- merchant_id
- customer_id
- amount_minor
- currency
- reference
- description
- return_url
- cancel_url
- status
- expires_at
- metadata
- created_at
- updated_at
```

Relations:

```text
PaymentSession 1 ─── N PaymentAttempt
PaymentSession 1 ─── 0..1 Payment
```

---

## Payment Attempt

```text
PaymentAttempt
- id
- payment_session_id
- provider_id
- payment_method_id
- provider_transaction_id
- amount_minor
- currency
- status
- failure_code
- failure_message
- risk_result
- idempotency_key
- created_at
- updated_at
```

Lifecycle:

```text
CREATED
   ↓
PENDING
 ┌─┴─┐
 ↓   ↓
FAILED SUCCEEDED
```

---

## Payment

```text
Payment
- id
- merchant_id
- customer_id
- payment_session_id
- payment_attempt_id
- provider_id
- provider_transaction_id
- amount_minor
- fee_minor
- net_amount_minor
- currency
- payment_method_id
- status
- risk_status
- reference
- description
- metadata
- created_at
- updated_at
```

Statuses:

```text
CREATED
PENDING
SUCCEEDED
FAILED
PARTIALLY_REFUNDED
REFUNDED
DISPUTED
CANCELLED
```

---

# 10. Payment Link

```text
PaymentLink
- id
- merchant_id
- customer_id
- amount_minor
- amount_paid_minor
- currency
- reference
- description
- customer_email
- customer_phone
- return_url
- expires_at
- status
- public_token
- created_by
- created_at
- updated_at
```

Statuses:

```text
ACTIVE
PAID
CANCELLED
EXPIRED
```

Payment Link:

```text
PaymentLink
   ↓
PaymentSession
   ↓
PaymentAttempt
   ↓
Payment
```

Payment Links should allow configuration of permitted payment methods, expiry and return behavior, matching the functional pattern documented by Zoho.

---

# 11. Refund Context

```text
Refund
- id
- merchant_id
- payment_id
- amount_minor
- currency
- reason
- status
- provider_refund_id
- failure_code
- failure_message
- requested_at
- processed_at
```

Statuses:

```text
REQUESTED
PROCESSING
SUCCEEDED
FAILED
```

Invariant:

```text
SUM(successful refunds)
<=
original payment amount
```

---

# 12. Dispute Context

```text
Dispute
- id
- merchant_id
- payment_id
- amount_minor
- fee_minor
- currency
- reason
- status
- deadline_at
- provider_reference
- resolution
- created_at
- updated_at
```

```text
DisputeEvidence
- id
- dispute_id
- type
- file_id
- description
- submitted_at
```

```text
DisputeEvent
- id
- dispute_id
- event_type
- payload
- created_at
```

---

# 13. Risk Context

```text
RiskAssessment
- id
- merchant_id
- payment_id
- customer_id
- score
- decision
- provider_result
- created_at
```

Decision:

```text
ALLOW
REVIEW
BLOCK
```

```text
RiskRule
- id
- merchant_id
- name
- condition
- action
- priority
- enabled
```

```text
RiskEvent
- id
- risk_assessment_id
- type
- value
- result
```

---

# 14. Ledger Context

## Ledger Account

```text
LedgerAccount
- id
- merchant_id
- account_code
- account_type
- currency
- status
```

Account types:

```text
ASSET
LIABILITY
REVENUE
EXPENSE
EQUITY
```

Examples:

```text
PROCESSOR_RECEIVABLE
MERCHANT_PAYABLE
PLATFORM_FEE_REVENUE
REFUND_LIABILITY
PAYOUT_CLEARING
BANK_CASH
CHARGEBACK_RECEIVABLE
```

---

## Ledger Transaction

```text
LedgerTransaction
- id
- merchant_id
- reference
- source_type
- source_id
- currency
- status
- correlation_id
- created_at
```

---

## Ledger Entry

```text
LedgerEntry
- id
- ledger_transaction_id
- ledger_account_id
- direction
- amount_minor
- currency
- entry_type
- created_at
```

Direction:

```text
DEBIT
CREDIT
```

---

# 15. Balance Context

```text
AccountBalance
- id
- merchant_id
- currency
- ledger_balance_minor
- available_balance_minor
- pending_balance_minor
- reserve_balance_minor
- payout_balance_minor
- negative_balance_minor
- updated_at
```

Ledger is the source of truth.

Balance is a projection.

---

# 16. Settlement

```text
Settlement
- id
- merchant_id
- provider_id
- currency
- gross_amount_minor
- fee_minor
- adjustment_minor
- net_amount_minor
- settlement_date
- provider_reference
- status
```

```text
SettlementTransaction
- id
- settlement_id
- provider_transaction_id
- payment_id
- amount_minor
- fee_minor
- currency
```

---

# 17. Payout

```text
Payout
- id
- merchant_id
- bank_account_id
- currency
- gross_amount_minor
- fee_minor
- adjustment_minor
- net_amount_minor
- status
- scheduled_at
- processed_at
- provider_reference
```

Statuses:

```text
SCHEDULED
PROCESSING
PAID
FAILED
RETURNED
```

---

# 18. Banking

```text
BankAccount
- id
- merchant_id
- provider_id
- account_holder_name
- bank_name
- country
- currency
- masked_account_number
- token_reference
- verification_status
```

```text
BankTransaction
- id
- bank_account_id
- provider_reference
- amount_minor
- currency
- transaction_date
- type
- status
```

```text
BankStatement
- id
- bank_account_id
- period_start
- period_end
- storage_key
- status
```

---

# 19. Reconciliation

```text
ReconciliationRecord
- id
- merchant_id
- source_type
- source_id
- matched_type
- matched_id
- status
- difference_minor
- currency
- reason
- resolved_by
- resolved_at
```

Statuses:

```text
MATCHED
PARTIALLY_MATCHED
UNMATCHED
EXCEPTION
RESOLVED
```

---

# 20. Developer Platform

```text
ApiKey
- id
- merchant_id
- name
- key_prefix
- secret_hash
- environment
- status
- last_used_at
- expires_at
```

```text
OAuthApp
- id
- merchant_id
- client_id
- client_secret_hash
- redirect_uris
- status
```

```text
OAuthGrant
- id
- oauth_app_id
- user_id
- scopes
- access_token_hash
- refresh_token_hash
- expires_at
```

---

# 21. Webhooks

```text
WebhookEndpoint
- id
- merchant_id
- url
- signing_secret_hash
- status
```

```text
WebhookSubscription
- id
- endpoint_id
- event_type
- enabled
```

```text
WebhookEvent
- id
- event_id
- event_type
- aggregate_type
- aggregate_id
- payload
- created_at
```

```text
WebhookDelivery
- id
- webhook_event_id
- endpoint_id
- attempt_number
- status
- response_code
- response_body
- next_retry_at
```

---

# 22. Idempotency

```text
IdempotencyRecord
- id
- tenant_id
- key
- operation
- request_hash
- response_status
- response_body
- resource_type
- resource_id
- expires_at
- created_at
```

Unique:

```text
tenant_id + operation + key
```

---

# 23. Outbox / Inbox

```text
OutboxEvent
- id
- aggregate_type
- aggregate_id
- event_type
- payload
- status
- attempts
- available_at
- processed_at
```

```text
InboxEvent
- id
- consumer
- event_id
- status
- processed_at
```

Unique:

```text
consumer + event_id
```

---

# 24. Audit

```text
AuditLog
- id
- tenant_id
- actor_id
- action
- resource_type
- resource_id
- before_json
- after_json
- ip
- user_agent
- request_id
- correlation_id
- created_at
```

---

# 25. Notification

```text
Notification
- id
- merchant_id
- recipient_id
- channel
- event_type
- subject
- body
- status
- sent_at
```

Channels:

```text
EMAIL
SMS
WEBHOOK
IN_APP
PUSH
```

---

# 26. Files

```text
File
- id
- tenant_id
- storage_provider
- storage_key
- filename
- mime_type
- size_bytes
- checksum
- created_at
```

---

# 27. Reports

```text
ReportJob
- id
- merchant_id
- report_type
- filters
- format
- status
- storage_key
- requested_by
- completed_at
```

Formats:

```text
CSV
XLSX
PDF
JSON
```

---

# 28. Advanced Contexts

Reserved entities:

```text
Mandate
MandateExecution

VirtualAccount
CollectionTransaction

ConnectedAccount
SplitRule
Transfer
Reversal

POSLocation
POSTerminal
DeviceSession
POSPayment
```

These are implemented only after Core Financial Flow is stable.

---

# 29. Main Relationships

```text
Tenant
  |
  +-- Merchant
       |
       +-- Customer
       |     |
       |     +-- PaymentMethod
       |
       +-- PaymentSession
       |     |
       |     +-- PaymentAttempt
       |             |
       |             +-- Payment
       |                    |
       |                    +-- Refund
       |                    |
       |                    +-- Dispute
       |
       +-- PaymentLink
       |
       +-- LedgerAccount
       |       |
       |       +-- LedgerEntry
       |
       +-- AccountBalance
       |
       +-- Settlement
       |
       +-- Payout
       |
       +-- BankAccount
       |
       +-- Reconciliation
       |
       +-- WebhookEndpoint
       |
       +-- ApiKey
       |
       +-- ReportJob
```

---

# 30. Ownership Rules

Payment owns:

```text
PaymentSession
PaymentAttempt
Payment
```

Refund owns:

```text
Refund
```

Ledger owns:

```text
LedgerTransaction
LedgerEntry
```

Balance owns:

```text
AccountBalance projection
```

Settlement owns:

```text
Settlement
SettlementTransaction
```

Payout owns:

```text
Payout
PayoutTransaction
```

Reconciliation owns:

```text
ReconciliationRecord
```

لا يسمح Context بتعديل بيانات Context آخر مباشرة.

التواصل يكون عبر:

```text
Application Service
Domain Event
Repository Contract
```

---

# 31. Critical Invariants

1. Payment cannot reference another merchant.
2. Refund cannot exceed refundable amount.
3. Ledger transaction must balance.
4. Ledger entries cannot be edited after posting.
5. Payout cannot exceed available balance.
6. Currency cannot change within a financial transaction.
7. Duplicate webhook cannot cause duplicate financial effects.
8. Duplicate idempotency key cannot create duplicate operation.
9. Financial records cannot be deleted.
10. Every financial event must be traceable to source.
