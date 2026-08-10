# Payment Platform

## System Architecture Specification v1.0

**Version:** 1.0
**Date:** 2026-08-03
**Status:** Architecture Baseline
**Architecture Style:** Modular Monolith
**Initial Database:** MySQL
**Initial Cache / Messaging:** Redis
**Primary Backend:** TypeScript / Node.js
**API:** REST / JSON / Versioned
**Initial Provider Mode:** Sandbox
**Deployment Target:** Containerized / Horizontally Scalable

---

# 1. Architecture Objective

الهدف من النظام هو بناء منصة Payment Infrastructure مستقلة وظيفيًا ومعماريًا، قريبة من نطاق منصات الدفع الحديثة مثل Zoho Payments من حيث:

* Merchant Management
* Customers
* Payment Methods
* Payment Sessions
* Payment Attempts
* Payments
* Hosted Checkout
* Payment Links
* Refunds
* Disputes
* Ledger
* Balances
* Settlements
* Payouts
* Reconciliation
* KYC/KYB
* Risk
* Providers
* Banks
* Webhooks
* API Keys
* OAuth
* Reports
* Notifications
* Admin
* Sandbox
* Advanced Payment Modules

لكن النظام سيكون مستقلًا بالكامل في:

* Source Code
* Database
* API
* UI
* Branding
* Domain Model
* Provider Adapters
* Infrastructure

---

# 2. Architectural Principles

هذه القواعد إلزامية في التصميم.

## 2.1 Modular Monolith First

لن يتم تقسيم النظام إلى Microservices في البداية.

البنية:

```text
                    Payment Platform
                           |
                     Modular Monolith
                           |
       +-------------------+-------------------+
       |                   |                   |
     Domain           Application       Infrastructure
       |                   |                   |
       +-------------------+-------------------+
                           |
                       Interfaces
```

كل Bounded Context سيكون Module مستقلًا منطقيًا.

يمكن استخراج أي Module لاحقًا إلى Service مستقل عند الحاجة.

---

# 3. Dependency Rule

الاتجاه المسموح:

```text
Interfaces
    |
Application
    |
Domain
    |
Contracts
```

والـ Infrastructure تنفذ الـ Contracts.

```text
                    Application
                         |
                  Repository Interface
                         |
                 +-------+-------+
                 |               |
             MySQL Adapter   Future Adapter
```

ممنوع:

```text
Domain -> MySQL
Domain -> Redis
Domain -> Stripe
Domain -> HTTP
Domain -> Fastify
```

الـ Domain يجب ألا يعرف أي شيء عن Infrastructure.

---

# 4. High-Level Architecture

```text
                         Internet
                            |
                         CDN/WAF
                            |
                     Load Balancer
                            |
                    API / Web Gateway
                            |
              +-------------+-------------+
              |                           |
         Merchant API                 Admin API
              |                           |
              +-------------+-------------+
                            |
                    Application Layer
                            |
        +-------------------+-------------------+
        |                   |                   |
      Domain            Event System        Policies
        |                   |                   |
        +-------------------+-------------------+
                            |
             +--------------+--------------+
             |              |              |
           MySQL          Redis          Object Storage
             |
       Transactional Data
```

---

# 5. Bounded Contexts

النظام مقسم إلى Bounded Contexts التالية:

```text
Identity
Merchant
Compliance
Customer
Payment Methods
Payments
Checkout
Payment Links
Refunds
Disputes
Risk
Ledger
Balance
Settlement
Payout
Reconciliation
Developer Platform
Notifications
Reporting
Integrations
Admin
Sandbox
```

Advanced:

```text
Mandates
Virtual Accounts
Marketplace
Connected Accounts
POS
```

---

# 6. Context Ownership

كل Context يملك:

* Domain entities
* Business rules
* Application services
* Repository contracts
* Domain events
* State machines
* Validation rules

ولا يجوز لـ Context تعديل جداول Context آخر مباشرة.

مثال:

```text
Refund Module
      |
      | RefundSucceeded
      v
Ledger Module
      |
      v
Balance Module
```

وليس:

```text
Refund Service
      |
      +---- UPDATE ledger_entries
      +---- UPDATE account_balances
```

---

# 7. Identity Context

مسؤول عن:

* Users
* Sessions
* Authentication
* Roles
* Permissions
* Invitations
* API authentication foundation

Entities:

```text
User
Role
Permission
UserRole
Session
Invitation
```

---

# 8. Merchant Context

يمثل الـ Merchant / Tenant.

```text
Tenant
   |
   +-- Merchant
          |
          +-- Business Profile
          +-- Users
          +-- Bank Accounts
          +-- Customers
          +-- Payments
          +-- Payouts
```

Merchant يحتوي على:

```text
id
tenant_id
legal_name
display_name
country
default_currency
business_type
status
onboarding_status
verification_status
risk_status
created_at
updated_at
```

---

# 9. Multi-Tenancy Architecture

كل Request يجب أن يمتلك Tenant Context.

```text
Request
   |
Authentication
   |
Resolve Tenant
   |
Authorization
   |
Application Service
   |
Repository
   |
Tenant-scoped Query
```

كل Repository يجب أن يكون Tenant-aware.

مثال:

```text
findPayment(
    tenantId,
    paymentId
)
```

وليس:

```text
findPayment(paymentId)
```

ويجب منع الوصول إلى Resource تابع لـ Tenant آخر حتى لو تم معرفة الـ UUID.

---

# 10. Authorization

سيتم استخدام RBAC مع إمكانية إضافة Policies مستقبلًا.

مثال:

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

التدفق:

```text
User
 |
Role
 |
Permissions
 |
Policy
 |
Resource
 |
Allow / Deny
```

---

# 11. Compliance Context

مسؤول عن:

* KYC
* KYB
* Representatives
* Beneficial Owners
* Documents
* Verification
* Compliance status

Lifecycle:

```text
DRAFT
 |
SUBMITTED
 |
PROCESSING
 |
+------------------------+
|                        |
APPROVED        MORE_INFORMATION_REQUIRED
|                        |
ACTIVE                 REVIEW
|
SUSPENDED
```

---

# 12. KYC Provider Abstraction

```text
KYCProvider
    |
    +-- SandboxKYCProvider
    +-- ProviderA
    +-- ProviderB
```

Interface:

```text
verifyBusiness()
verifyPerson()
verifyOwner()
uploadDocument()
getVerificationStatus()
```

الـ Compliance Domain لا يعرف اسم Provider معين.

---

# 13. Customer Context

Customer:

```text
Customer
 |
 +-- Addresses
 +-- Payment Methods
 +-- Payment Sessions
 +-- Payments
 +-- Refunds
 +-- Disputes
 +-- Mandates
```

يجب أن يكون Customer مرتبطًا بـ Merchant وليس Platform بشكل عام.

---

# 14. Payment Methods Context

أنواع:

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

النظام لا يخزن Card PAN/CVV في Core Database.

الهدف:

```text
Card
 |
Provider / Vault
 |
Token
 |
Payment Platform
```

يتم تخزين:

```text
provider_token
brand
last4
expiry_month
expiry_year
type
provider_reference
```

---

# 15. Payment Method Session

الغرض منها إنشاء جلسة آمنة لجمع Payment Method.

```text
PaymentMethodSession
 |
 +-- merchant
 +-- customer
 +-- provider
 +-- status
 +-- expires_at
```

---

# 16. Payment Context

هذا هو قلب النظام.

العلاقة:

```text
Customer
   |
Payment Session
   |
   +---- Attempt #1
   |
   +---- Attempt #2
   |
   +---- Attempt #3
              |
           Success
              |
           Payment
```

---

# 17. Payment Session

Payment Session تمثل Intent.

لا تمثل الأموال نفسها.

```text
PaymentSession
 |
 +-- merchant_id
 +-- customer_id
 +-- amount
 +-- currency
 +-- reference
 +-- description
 +-- return_url
 +-- cancel_url
 +-- expires_at
 +-- status
 +-- metadata
```

---

# 18. Payment Attempt

كل محاولة مستقلة.

```text
PaymentAttempt
 |
 +-- payment_session_id
 +-- provider_id
 +-- provider_transaction_id
 +-- payment_method_id
 +-- amount
 +-- currency
 +-- status
 +-- failure_code
 +-- failure_message
 +-- risk_result
```

Lifecycle:

```text
CREATED
   |
PENDING
   |
   +--------+
   |        |
FAILED   SUCCEEDED
```

يمكن وجود عدة Attempts لنفس Session.

---

# 19. Payment Entity

Payment يمثل النتيجة المالية النهائية.

```text
Payment
 |
 +-- merchant
 +-- customer
 +-- session
 +-- attempt
 +-- provider
 +-- amount
 +-- fee
 +-- net_amount
 +-- currency
 +-- status
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

يجب فرض State Machine.

---

# 20. Payment State Machine

غير مسموح بأي انتقال عشوائي.

مثال:

```text
CREATED
   |
   v
PENDING
   |
   +------------+
   |            |
SUCCEEDED     FAILED
   |
   +-------------------+
   |                   |
PARTIALLY_REFUNDED   REFUNDED
   |
REFUNDED
```

Dispute يتم التعامل معه كـ Financial/Dispute state/event وليس كـ destructive modification.

---

# 21. Provider Architecture

الـ Payment Core لا يتعامل مباشرة مع Provider.

```text
Payment Application
        |
        v
PaymentProvider Interface
        |
   +----+---------+----------+
   |              |          |
Sandbox       Provider A  Provider B
```

Provider Interface يدعم:

```text
createPaymentSession()
authorize()
capture()
cancel()
getPayment()
refund()
getRefund()
createPayout()
getPayout()
tokenizePaymentMethod()
getPaymentMethod()
```

---

# 22. Provider Capabilities

ليس كل Provider يدعم كل Feature.

لذلك:

```text
ProviderCapabilities
```

مثل:

```text
cards
bank_transfer
refunds
partial_refunds
payouts
recurring
disputes
tokenization
three_ds
webhooks
```

قبل تنفيذ العملية:

```text
Check Capability
      |
      +---- supported -> Execute
      |
      +---- unsupported -> ProviderCapabilityError
```

---

# 23. Bank Architecture

Payment Gateway وBank يجب أن يكونا منفصلين.

```text
BankProvider
 |
 +-- BankA
 +-- BankB
 +-- BankC
```

Interface:

```text
createBeneficiary()
verifyAccount()
initiateTransfer()
getTransfer()
getBalance()
fetchTransactions()
fetchStatements()
createDebit()
```

---

# 24. Checkout Architecture

نوعان:

```text
Hosted Checkout
Embedded Checkout
```

## Hosted

```text
Merchant
 |
Create Payment Session
 |
Checkout Session
 |
Customer Browser
 |
Payment Platform
```

## Embedded

```text
Merchant Website
 |
Checkout SDK
 |
Payment Platform API
```

Checkout لا يحتوي Ledger Logic.

---

# 25. Payment Link Architecture

```text
Merchant
 |
Create Payment Link
 |
Public Link
 |
Customer
 |
Checkout
 |
Payment Session
 |
Payment
 |
Payment Link = PAID
```

Statuses:

```text
ACTIVE
PAID
CANCELLED
EXPIRED
```

---

# 26. Refund Context

Refund منفصل عن Payment.

```text
Payment
 |
 +-- Refund
 +-- Refund
 +-- Refund
```

Lifecycle:

```text
REQUESTED
 |
PROCESSING
 |
 +--------+
 |        |
SUCCESS  FAILED
```

Business invariant:

```text
Total Refunded <= Refundable Amount
```

Refund لا يغير Ledger Entries القديمة.

بدلًا من ذلك:

```text
Original Ledger Transaction
          |
          v
Compensating / Reversal Transaction
```

---

# 27. Dispute Context

```text
Payment
 |
Dispute
 |
 +-- Evidence
 +-- Events
 +-- Deadline
 +-- Resolution
```

Capabilities:

```text
View
Accept
Challenge
Upload Evidence
Track Evidence
Track Deadline
Resolve
```

---

# 28. Risk Context

Risk مستقل عن Payment.

Input:

```text
Transaction
Customer
Device
IP
Country
Amount
Payment Method
Velocity
History
Provider Risk
Merchant Risk
```

Output:

```text
ALLOW
REVIEW
BLOCK
```

كل Risk Decision يجب أن يكون قابلًا للتدقيق.

---

# 29. Ledger Context

الـ Ledger هو Financial Source of Truth.

Entities:

```text
LedgerAccount
LedgerTransaction
LedgerEntry
AccountBalance
```

---

# 30. Double-Entry Principle

كل Financial Transaction يجب أن تحقق:

```text
Total Debits = Total Credits
```

مثال Payment = 100:

```text
Debit:
Processor Receivable     100

Credit:
Merchant Payable         100
```

Payment = 100 / Fee = 3:

```text
Debit:
Processor Receivable     100

Credit:
Merchant Payable          97

Credit:
Platform Fee               3
```

---

# 31. Ledger Immutability

بعد Posting:

ممنوع:

```text
UPDATE ledger_entry
DELETE ledger_entry
```

التصحيح:

```text
Original Transaction
        |
        v
Compensating Transaction
```

كل Transaction تحتوي:

```text
reference
source_type
source_id
currency
created_at
```

---

# 32. Ledger Account Model

أقترح أنواع Accounts:

```text
ASSET
LIABILITY
EQUITY
REVENUE
EXPENSE
```

مثال:

```text
Processor Receivable
Merchant Payable
Platform Fee Revenue
Refund Liability
Payout Clearing
Bank Cash
Reserve
```

---

# 33. Balance Context

Balance ليس مصدر الحقيقة.

Ledger هو المصدر.

Balance عبارة عن Projection:

```text
Ledger
 |
Balance Projection
 |
+-- Ledger Balance
+-- Available Balance
+-- Pending Balance
+-- Reserve Balance
+-- Payout Balance
```

عند اختلاف Balance Projection:

```text
Ledger
   |
Rebuild Projection
```

---

# 34. Settlement Context

Settlement يربط Provider transactions بالمال الذي وصل فعليًا.

```text
Provider
 |
Settlement File / API
 |
Settlement
 |
Settlement Transactions
 |
Ledger
```

Settlement:

```text
gross_amount
fees
adjustments
net_amount
settlement_date
provider_reference
status
```

---

# 35. Payout Context

المسار:

```text
Payment
 |
Ledger
 |
Available Balance
 |
Settlement
 |
Payout
 |
Merchant Bank Account
```

Statuses:

```text
SCHEDULED
PROCESSING
PAID
FAILED
RETURNED
```

يجب منع:

```text
Payout Amount > Eligible Available Balance
```

---

# 36. Negative Balance

يتم احتساب:

```text
Available Balance < 0
```

وقد ينتج عن:

* Refund
* Dispute
* Chargeback
* Fees
* Adjustments

ويجب توفير Recovery Workflow.

---

# 37. Reconciliation Context

Reconciliation ليس Report فقط.

هو Financial Control System.

المصادر:

```text
Internal Ledger
Provider Transactions
Settlement Files
Bank Transactions
Payouts
```

المخرجات:

```text
MATCHED
PARTIALLY_MATCHED
UNMATCHED
EXCEPTION
RESOLVED
```

---

# 38. Reconciliation Matching Engine

المطابقة باستخدام:

```text
Provider Transaction ID
Bank Reference
Settlement ID
Payout ID
Amount
Currency
Date
Merchant
Fee
```

يجب دعم:

```text
Exact Match
Partial Match
Many-to-One
One-to-Many
Exception
Manual Resolution
```

---

# 39. Developer Platform

المكونات:

```text
REST API
API Keys
OAuth 2.0
Scopes
Webhooks
API Logs
SDKs
Sandbox
```

API:

```text
/v1/customers
/v1/payment-sessions
/v1/payment-attempts
/v1/payments
/v1/payment-methods
/v1/payment-links
/v1/refunds
/v1/disputes
/v1/payouts
/v1/settlements
/v1/mandates
/v1/virtual-accounts
/v1/connected-accounts
/v1/transfers
```

---

# 40. API Request Pipeline

كل API Request يمر تقريبًا عبر:

```text
HTTP Request
      |
Request ID
      |
Correlation ID
      |
Authentication
      |
Tenant Resolution
      |
Authorization
      |
Validation
      |
Idempotency
      |
Application Service
      |
Domain
      |
Transaction
      |
Outbox
      |
Response
```

---

# 41. Idempotency Architecture

كل Financial Command يجب أن يكون Idempotent.

```text
Idempotency-Key
       |
Hash Request
       |
Lookup Record
       |
+------+----------------+
|                       |
Not Found             Found
|                       |
Execute              Compare Hash
|                       |
Save Response       +---+---+
                    |       |
                  Same    Different
                    |       |
                 Replay   Conflict
```

Record:

```text
tenant_id
key
operation
request_hash
response
status
expires_at
created_at
```

---

# 42. Event Architecture

نستخدم Transactional Outbox.

```text
Command
 |
Application Service
 |
Domain Change
 |
Database Transaction
 |
+----------------------+
| Domain Data          |
| Outbox Event         |
+----------------------+
 |
Worker
 |
Event Bus
 |
+---------+---------+---------+
|         |         |         |
Ledger  Webhook Notification Reports
```

لا يتم نشر Event قبل Commit.

---

# 43. Inbox Architecture

للـ inbound events:

```text
Provider Webhook
 |
Signature Verification
 |
Event Validation
 |
Inbox
 |
Deduplication
 |
Queue
 |
Worker
 |
Domain
```

إذا وصل نفس Event مرتين:

```text
Financial Effect = 1
```

وليس:

```text
Financial Effect = 2
```

---

# 44. Webhook Architecture

النظام يدعم:

* Endpoint Registration
* Event Subscription
* Signature Verification
* Delivery ID
* Event ID
* Retry
* Exponential Backoff
* Delivery Logs
* Replay
* Dead Letter Queue
* Test Events

Events:

```text
payment.succeeded
payment.pending
payment.failed

payment_link.paid
payment_link.cancelled
payment_link.expired

refund.succeeded
refund.failed

payout.initiated
payout.paid
payout.failed

dispute.created
dispute.updated
dispute.resolved
```

---

# 45. Notification Architecture

القنوات:

```text
Email
SMS
Webhook
In-App
Push (future)
```

يتم تشغيل Notifications من Events وليس من Domain مباشرة.

```text
PaymentSucceeded
 |
Notification Handler
 |
+-- Email
+-- Webhook
+-- In-App
```

---

# 46. Reporting Architecture

Reports يجب ألا تؤثر على Payment Transactions.

```text
Report Request
 |
Report Job
 |
Queue
 |
Worker
 |
Read Model / Reporting Queries
 |
File
 |
Object Storage
 |
Download
```

الصيغ:

```text
CSV
XLSX
PDF
API
```

---

# 47. Admin Architecture

Admin منفصل منطقيًا عن Merchant Dashboard.

Admin يستطيع:

```text
Merchant Search
KYC Review
Payment Search
Refund Monitoring
Dispute Monitoring
Payout Monitoring
Reconciliation Exceptions
Provider Status
Webhook Delivery
Audit Logs
Support Actions
Feature Flags
System Configuration
```

High-risk actions:

```text
Admin
 |
Strong Authorization
 |
Confirmation
 |
Audit Log
 |
Execution
```

---

# 48. Audit Architecture

كل عملية حساسة تسجل:

```text
actor_id
tenant_id
action
resource_type
resource_id
before
after
timestamp
ip
user_agent
request_id
correlation_id
```

يمنع تسجيل:

```text
Card PAN
CVV
Secrets
Passwords
Sensitive Tokens
```

---

# 49. Observability

يجب توفير:

```text
Structured Logs
Metrics
Tracing
Request IDs
Correlation IDs
```

Metrics أساسية:

```text
payment_success_rate
payment_failure_rate
provider_latency
provider_failure_rate
webhook_delivery_rate
queue_depth
database_health
payout_failure_rate
reconciliation_exceptions
```

---

# 50. Error Architecture

API Error Format موحد.

مثال:

```json
{
  "error": {
    "code": "PAYMENT_NOT_REFUNDABLE",
    "message": "Payment cannot be refunded.",
    "request_id": "req_...",
    "details": {}
  }
}
```

لا يجب إظهار Stack Traces للمستخدم.

---

# 51. Money Architecture

ممنوع استخدام Floating Point.

يفضل:

```text
amount_minor
currency
```

مثال:

```text
100.50 USD
```

يتم تخزين:

```text
10050
USD
```

مع وجود Currency Metadata لتحديد:

* Minor units
* Currency code
* Country
* Settlement rules
* Regional behavior

---

# 52. Financial Invariants

هذه القواعد غير قابلة للتفاوض:

### Rule 1

كل Ledger Transaction متوازنة.

### Rule 2

لا يمكن Refund أكثر من Refundable Amount.

### Rule 3

لا يمكن Payout أكبر من Eligible Balance.

### Rule 4

Failed Payment Attempt لا ينشئ Successful Ledger Posting.

### Rule 5

Duplicate Webhook لا يسبب Financial Effect إضافي.

### Rule 6

Financial Records لا تحذف.

### Rule 7

Reversal يتم بTransaction جديدة.

### Rule 8

Currency لا تتغير داخل Financial Transaction.

### Rule 9

كل Financial Operation تحتوي Reference/Correlation ID.

### Rule 10

كل Reconciliation Exception قابلة للعرض والحل.

---

# 53. State Machine Rule

كل Aggregate مالي يجب أن يملك State Machine.

على الأقل:

```text
Payment
PaymentAttempt
PaymentSession
Refund
Payout
Settlement
Dispute
Mandate
PaymentLink
KYC Application
```

ممنوع تعديل Status مباشرة من Controller.

الصحيح:

```text
Controller
 |
Application Command
 |
Aggregate
 |
Transition
 |
Domain Event
```

---

# 54. Repository Architecture

مثال:

```text
PaymentRepository

create()
findById()
findByReference()
save()
list()
```

والـ Implementation:

```text
PaymentRepository
       |
       +-- MySQLPaymentRepository
       +-- FuturePostgresPaymentRepository
```

Domain لا يعرف أي Implementation.

---

# 55. Transaction Boundary

Financial Operations يجب أن تكون Atomic.

مثال Payment Success:

```text
BEGIN TRANSACTION

Update Payment
Create Ledger Transaction
Create Ledger Entries
Create Outbox Event
Create Audit Event

COMMIT
```

إذا فشل أي جزء:

```text
ROLLBACK
```

ولا يصبح النظام في حالة جزئية.

---

# 56. Payment Success Architecture

المسار الأساسي:

```text
Customer
 |
Checkout
 |
Payment Session
 |
Payment Attempt
 |
Risk
 |
Provider Adapter
 |
Provider
 |
Provider Result
 |
Webhook / Polling
 |
Inbox
 |
Payment State Machine
 |
Ledger Posting
 |
Balance Projection
 |
Outbox
 |
Webhook to Merchant
```

---

# 57. Payment Failure Architecture

```text
Payment Attempt
 |
Provider
 |
Failure
 |
PaymentAttempt = FAILED
 |
Payment = FAILED
 |
Outbox
 |
Webhook
 |
Notification
```

لا يتم Ledger Posting كـ Successful Payment.

---

# 58. Refund Architecture

```text
Refund Request
 |
Authorization
 |
Idempotency
 |
Refund Domain
 |
Provider Adapter
 |
Provider Refund
 |
Webhook
 |
Refund State Machine
 |
Ledger Reversal
 |
Balance Update
 |
Merchant Webhook
```

---

# 59. Payout Architecture

```text
Payout Request / Scheduler
 |
Balance Eligibility
 |
Risk / Compliance
 |
Payout Creation
 |
Bank Provider
 |
Processing
 |
Webhook / Polling
 |
Payout State Machine
 |
Ledger
 |
Reconciliation
```

---

# 60. Sandbox Architecture

Sandbox يجب أن يكون معزولًا عن Production.

```text
Sandbox
 |
Test Merchant
 |
Test Customer
 |
Sandbox Provider
 |
Simulated Payment
 |
Simulated Webhook
```

ممنوع:

```text
Sandbox -> Production Bank
Sandbox -> Production Payment Gateway
Sandbox -> Real Funds
```

---

# 61. Feature Flags

الـ Advanced Modules تكون خلف Feature Flags:

```text
mandates.enabled
virtual_accounts.enabled
split_payments.enabled
connected_accounts.enabled
pos.enabled
```

ويمكن أن يكون القرار حسب:

```text
Country
Merchant
Provider
Currency
Account Type
```

---

# 62. Advanced Modules

لا تعتمد هذه Modules على Core جديد.

بل تستخدم Payment Core:

```text
Mandates
Virtual Accounts
Marketplace
Connected Accounts
POS
       |
       v
Payment Core
       |
       v
Provider
       |
       v
Ledger
```

---

# 63. Marketplace Architecture

```text
Customer
 |
Payment
 |
Platform Ledger
 |
+---------+----------+
|                    |
Seller A           Seller B
 |
Transfer
 |
Connected Account
```

يتم دعم:

```text
ConnectedAccount
SplitRule
Transfer
Reversal
```

---

# 64. Virtual Accounts

```text
Customer
 |
Bank Transfer
 |
Virtual Account
 |
Provider / Bank
 |
Webhook / Statement
 |
Reconciliation
 |
Customer Allocation
 |
Ledger
```

---

# 65. POS

POS ليس Payment Core جديدًا.

```text
POS Terminal
 |
Device Session
 |
POS Payment
 |
Payment Session
 |
Payment Attempt
 |
Payment Core
 |
Provider
```

---

# 66. Database Architecture

MySQL هو Database Adapter الأول.

المبدأ:

```text
Domain
 |
Repository Contracts
 |
MySQL Adapter
 |
MySQL
```

يجب استخدام:

* UUID/ULID identifiers
* Foreign Keys
* Unique Constraints
* Check Constraints حيثما أمكن
* Indexes
* Composite Indexes
* Optimistic locking حيث يلزم
* Created/Updated timestamps
* Versioned migrations

---

# 67. Database Ownership

كل Table يجب أن يكون مملوكًا لـ Module.

مثال:

```text
Payments:
payment_sessions
payment_attempts
payments

Refunds:
refunds

Ledger:
ledger_accounts
ledger_transactions
ledger_entries
```

لا توجد جداول "مشتركة" بلا سبب.

---

# 68. Database Migration Strategy

استخدام:

```text
001_initial
002_identity
003_merchants
004_customers
005_payments
...
```

ويجب دعم:

```text
Expand
 |
Backfill
 |
Validate
 |
Contract
```

ممنوع destructive migrations غير مدروسة.

---

# 69. Index Strategy

أمثلة مهمة:

```text
tenant_id
merchant_id
customer_id
payment_id
payment_session_id
provider_transaction_id
reference
status
created_at
currency
```

مع Composite Indexes للـ queries الشائعة:

```text
(tenant_id, merchant_id, created_at)
(tenant_id, status, created_at)
(merchant_id, customer_id)
```

---

# 70. API Pagination

جميع Collections يجب أن تدعم Pagination.

الأفضل:

```text
Cursor Pagination
```

للمجموعات المالية الكبيرة.

مثال:

```text
GET /v1/payments?limit=50&starting_after=...
```

---

# 71. API Filtering

مثال:

```text
status
currency
customer_id
merchant_id
provider_id
created_from
created_to
amount_min
amount_max
```

مع Sorting محدود ومحدد مسبقًا.

---

# 72. Security Architecture

الطبقات:

```text
TLS
 |
WAF
 |
Rate Limiting
 |
Authentication
 |
Authorization
 |
Input Validation
 |
Business Rules
 |
Audit
```

كما يجب توفير:

* Encryption at Rest
* Secrets Management
* MFA
* RBAC
* Least Privilege
* Secure Headers
* Dependency Scanning
* Vulnerability Management
* Backup Encryption
* Disaster Recovery

---

# 73. Secrets

ممنوع وضع:

```text
API Secrets
Provider Secrets
Database Passwords
Encryption Keys
```

في Git.

Development:

```text
.env
```

Production:

```text
Secrets Manager
```

---

# 74. Logging Rules

ممنوع Logging:

```text
PAN
CVV
Passwords
API Secrets
OAuth Tokens
Bank Credentials
Full Payment Tokens
```

Logs يجب أن تكون:

```text
Structured
Searchable
Correlated
Redacted
```

---

# 75. Reliability Architecture

يجب التعامل مع:

```text
Provider Timeout
Duplicate Webhook
Delayed Webhook
Out-of-order Webhook
Provider Outage
Network Failure
Queue Failure
Database Failure
Retry Storm
```

الأدوات:

```text
Timeouts
Retries
Exponential Backoff
Circuit Breaker
Idempotency
Inbox
Outbox
DLQ
Reconciliation
```

---

# 76. Retry Policy

لا يتم Retry عشوائيًا.

يتم تحديد:

```text
Retryable
Non-Retryable
```

مثال:

```text
Network Timeout -> Retry
503 -> Retry
429 -> Retry with Backoff
Invalid Card -> No Retry
Invalid Request -> No Retry
Authentication Failure -> No Retry
```

---

# 77. Queue Architecture

الـ Queue يستخدم للعمليات غير المتزامنة:

```text
Webhook Delivery
Notifications
Reports
Reconciliation
Provider Polling
Settlement Processing
Payout Processing
KYC callbacks
```

الـ Payment Authorization critical path يجب ألا يعتمد على Worker غير ضروري.

---

# 78. Outbox Worker

```text
Database
 |
outbox_events
 |
Publisher Worker
 |
Queue/Event Bus
 |
Consumers
```

إذا فشل Worker:

```text
Event remains pending
```

وبالتالي لا يضيع Event.

---

# 79. Dead Letter Queue

أي Event فشل بعد عدد Retry معين:

```text
Queue
 |
Retry 1
 |
Retry 2
 |
Retry 3
 |
DLQ
```

Admin يستطيع:

```text
Inspect
Replay
Resolve
```

---

# 80. API Authentication

الدعم المستقبلي:

```text
API Key
OAuth 2.0
Access Token
Refresh Token
Scopes
```

لكن Authentication يجب أن يكون منفصلًا عن Authorization.

---

# 81. API Key Architecture

```text
Merchant
 |
API Key
 |
Hash
 |
Database
```

لا يتم تخزين Secret خام.

عند الإنشاء:

```text
Display Once
Hash Immediately
```

---

# 82. OAuth Architecture

```text
Developer App
 |
Authorization
 |
Consent
 |
Authorization Code
 |
Access Token
 |
Refresh Token
 |
Scopes
```

يجب فصل OAuth App عن Merchant User.

---

# 83. Web Application Architecture

Frontend:

```text
React
 |
Router
 |
Feature Modules
 |
API Client
 |
Authentication
 |
State Management
```

Navigation:

```text
Dashboard

Payments
Customers
Payment Links
Refunds
Disputes

Balances
Settlements
Payouts

Reports

Developer
  API Keys
  OAuth
  Webhooks
  API Logs

Integrations

Settings
```

---

# 84. Frontend Domain Rule

Frontend لا يحتوي Business Rules مالية حساسة.

مثال:

غير صحيح:

```text
Frontend calculates available balance
```

الصحيح:

```text
API -> Balance Service -> Ledger Projection
```

Frontend يعرض النتيجة فقط.

---

# 85. UI Architecture

يجب تصميم الواجهة لتكون:

* Responsive
* Desktop
* Tablet
* Mobile
* Accessible
* Localizable
* RTL-ready
* Multi-currency
* Multi-language

---

# 86. Dashboard Architecture

Dashboard يستهلك Read APIs:

```text
GET /v1/dashboard/summary
GET /v1/dashboard/payments
GET /v1/dashboard/balance
GET /v1/dashboard/payouts
GET /v1/dashboard/settlements
```

لا يحتوي على Ledger mutations.

---

# 87. Read Models

لتحسين الأداء:

```text
Write Model
     |
Events
     |
Read Models
```

مثال:

```text
Payment
 |
PaymentSucceeded
 |
Dashboard Projection
```

لكن المصدر المالي يظل Ledger.

---

# 88. Reporting Read Model

Reports لا تقرأ كل Ledger Entries في كل Request.

يمكن بناء:

```text
Reporting Projection
```

لكن يجب أن تكون قابلة للمقارنة مع Source of Truth.

---

# 89. Scaling Strategy

المرحلة الأولى:

```text
1 Modular Application
1 MySQL
1 Redis
Workers
```

عند النمو:

```text
Load Balancer
 |
+---- App 1
+---- App 2
+---- App 3
 |
MySQL
 |
Read Replicas
 |
Redis Cluster
 |
Queue
 |
Workers
```

---

# 90. Future Service Extraction

يمكن لاحقًا استخراج:

```text
Webhook Service
Reporting Service
Notification Service
Reconciliation Service
Risk Service
Provider Gateway
```

لكن فقط عندما تكون هناك حاجة تشغيلية حقيقية.

---

# 91. Deployment Architecture

الهدف:

```text
                    CDN / WAF
                        |
                  Load Balancer
                        |
            +-----------+-----------+
            |                       |
        App Instance           App Instance
            |                       |
            +-----------+-----------+
                        |
                     MySQL
                        |
                 +------+------+
                 |             |
               Redis        Read Replica
                 |
             Queue/Event Bus
                 |
        +--------+--------+
        |        |        |
     Worker   Worker   Worker
        |
   +----+-----+------+
   |          |      |
Providers   Banks   KYC
```

---

# 92. Object Storage

يستخدم لـ:

* KYC Documents
* Dispute Evidence
* Reports
* Exports
* Merchant Assets

ولا يتم تخزين الملفات الكبيرة داخل MySQL.

---

# 93. Backup Strategy

يجب دعم:

```text
Automated DB Backups
Point-in-Time Recovery
Encrypted Backups
Object Storage Backup
Backup Validation
Restore Testing
```

Backup بدون Restore Test لا يعتبر كافيًا.

---

# 94. Disaster Recovery

قبل Production يجب تحديد:

```text
RPO
RTO
```

والاختبار:

```text
Database Failure
Application Failure
Queue Failure
Provider Failure
Region Failure
```

---

# 95. Testing Architecture

## Unit

```text
Domain
State Machines
Money
Ledger
Refund Rules
Payout Rules
Idempotency
Risk
```

## Integration

```text
MySQL
Redis
Provider
Webhook
Queue
```

## Contract

كل Provider Adapter.

## E2E

```text
Session
 |
Checkout
 |
Attempt
 |
Provider
 |
Webhook
 |
Payment
 |
Ledger
 |
Balance
 |
Settlement
 |
Payout
 |
Reconciliation
```

---

# 96. Financial Test Scenarios

يجب اختبار:

```text
Duplicate Payment Request
Duplicate Webhook
Out-of-order Webhook
Provider Timeout
Provider Retry
Partial Refund
Full Refund
Refund Over Limit
Failed Refund
Payout Over Balance
Negative Balance
Settlement Mismatch
Ledger Imbalance
Currency Mismatch
Provider Failure
Database Failure
Queue Failure
```

---

# 97. Contract Testing

كل Provider Adapter يجب أن يمر بـ:

```text
Provider Contract Suite
```

مثل:

```text
createPayment
getPayment
refund
getRefund
webhook
tokenization
payout
```

حتى لو اختلف Provider Implementation.

---

# 98. Domain Events

Core Events:

```text
payment.session.created
payment.attempt.created
payment.pending
payment.succeeded
payment.failed

refund.requested
refund.succeeded
refund.failed

payment_link.created
payment_link.paid
payment_link.expired

payout.initiated
payout.paid
payout.failed

settlement.created
settlement.completed

dispute.created
dispute.updated
dispute.resolved

kyc.submitted
kyc.approved
kyc.rejected

balance.changed

reconciliation.exception.created
reconciliation.exception.resolved
```

---

# 99. Event Naming

يستخدم:

```text
<aggregate>.<action>
```

مثال:

```text
payment.succeeded
refund.succeeded
payout.failed
```

Events immutable.

---

# 100. Command / Query Separation

Commands:

```text
CreatePaymentSession
CreatePaymentAttempt
ConfirmPayment
CreateRefund
CreatePayout
ResolveDispute
```

Queries:

```text
GetPayment
ListPayments
GetBalance
GetSettlement
GetPayout
GetReconciliationExceptions
```

---

# 101. Application Service Example

```text
CreatePaymentSessionHandler

1. Authenticate
2. Resolve Tenant
3. Authorize
4. Validate Input
5. Check Idempotency
6. Load Merchant
7. Validate Currency
8. Create Session
9. Persist
10. Create Outbox Event
11. Commit
12. Return Response
```

---

# 102. Payment Confirmation Example

```text
ConfirmPayment

1. Authenticate
2. Tenant Resolution
3. Authorization
4. Idempotency
5. Load Session
6. Validate Session
7. Create Attempt
8. Risk Evaluation
9. Select Provider
10. Check Capability
11. Call Provider
12. Store Provider Reference
13. Await Provider Result/Webhook
```

---

# 103. Provider Selection

Provider Selection لا يجب أن يكون:

```text
if country == X:
    use ProviderX
```

بل:

```text
Provider Routing Engine
 |
+-- Country
+-- Currency
+-- Payment Method
+-- Merchant
+-- Provider Capability
+-- Provider Health
+-- Cost
+-- Risk
```

Output:

```text
Provider + Routing Decision
```

---

# 104. Provider Health

يجب تتبع:

```text
Latency
Success Rate
Failure Rate
Timeout Rate
Webhook Delay
Availability
```

ويمكن لاحقًا استخدام Circuit Breaker.

---

# 105. Currency Architecture

كل Financial Entity يجب أن تحتوي Currency عند الحاجة.

يمنع:

```text
USD Payment
+
EUR Refund
```

بدون Currency Conversion workflow صريح.

Multi-currency يجب أن يكون Module/Rule مستقلًا وليس implicit.

---

# 106. Country Architecture

لا يتم hard-code لدولة واحدة.

يجب أن توجد:

```text
Country Configuration
Currency Configuration
Payment Method Configuration
Provider Configuration
KYC Configuration
Payout Configuration
Tax Configuration
```

---

# 107. Configuration Architecture

Configuration Layers:

```text
Global
 |
Country
 |
Provider
 |
Merchant
 |
Feature Flag
```

الأولوية تحدد بوضوح.

---

# 108. Feature Flag Architecture

```text
Feature
 |
Global
 |
Country
 |
Merchant
 |
Environment
```

ويجب تسجيل تغيير Feature Flags في Audit Log.

---

# 109. Integrations Architecture

```text
Integration
 |
Adapter
 |
External System
```

الفئات:

```text
Accounting
ERP
CRM
Billing
Ecommerce
Payroll
POS
Banks
Payment Providers
KYC
```

---

# 110. Integration Failure Policy

External Integration لا يجب أن تكسر Core Transaction.

مثال:

```text
Payment Success
 |
Ledger Success
 |
Outbox
 |
Accounting Integration FAILED
```

Payment يظل ناجحًا.

يتم Retry للـ Accounting Integration بشكل مستقل.

---

# 111. Data Consistency Model

Financial Core:

```text
Strong Consistency
```

External Notifications:

```text
Eventual Consistency
```

Reports:

```text
Eventual Consistency
```

Ledger:

```text
Transactional Consistency
```

---

# 112. Financial Transaction Boundary

أي عملية تغير المال:

```text
BEGIN
 |
Validate
 |
State Transition
 |
Ledger Posting
 |
Balance Projection / Event
 |
Outbox
 |
Audit
 |
COMMIT
```

---

# 113. No Destructive Financial Operations

ممنوع:

```text
DELETE Payment
DELETE Ledger Transaction
DELETE Payout
DELETE Refund
```

بدل ذلك:

```text
Cancel
Reverse
Compensate
Adjust
```

حسب الـ Domain.

---

# 114. Reconciliation as Safety Net

حتى مع:

```text
Idempotency
State Machines
Ledger
Webhooks
```

يجب وجود Reconciliation.

لأن Provider أو Bank قد يكون له State مختلف عن النظام.

```text
Our System
      |
      | Compare
      v
External Provider
      |
      v
Mismatch
      |
      v
Reconciliation Exception
```

---

# 115. Production Readiness Gates

لا يسمح بربط Real Money قبل اجتياز:

```text
Architecture
Database
Ledger
Balance
Settlement
Payout
Reconciliation
Security
Authentication
Webhook
Provider
KYC/AML
Audit
Observability
Backup
DR
Load Testing
Penetration Testing
Operational Runbooks
Compliance Review
```

---

# 116. Final Module Dependency Map

```text
Identity
   |
Merchant
   |
Compliance
   |
Customer
   |
Payment Methods
   |
Payments
   |
Checkout / Payment Links
   |
Provider Routing
   |
Provider
   |
Webhook / Inbox
   |
Payment State Machine
   |
Ledger
   |
Balance
   |
Settlement
   |
Payout
   |
Bank
   |
Reconciliation
```

Side systems:

```text
Risk
Notifications
Reporting
Audit
Developer Platform
Admin
Integrations
```

Advanced:

```text
Mandates
Virtual Accounts
Marketplace
Connected Accounts
POS
```

---

# 117. Final Repository Structure

البنية المقترحة للتنفيذ:

```text
payment-platform/
│
├── apps/
│   │
│   ├── api/
│   │   └── src/
│   │       ├── modules/
│   │       │
│   │       │   ├── identity/
│   │       │   ├── merchants/
│   │       │   ├── compliance/
│   │       │   ├── customers/
│   │       │   ├── payment-methods/
│   │       │   ├── payments/
│   │       │   ├── checkout/
│   │       │   ├── payment-links/
│   │       │   ├── refunds/
│   │       │   ├── disputes/
│   │       │   ├── risk/
│   │       │   ├── ledger/
│   │       │   ├── balances/
│   │       │   ├── settlements/
│   │       │   ├── payouts/
│   │       │   ├── reconciliation/
│   │       │   ├── developer/
│   │       │   ├── notifications/
│   │       │   ├── reporting/
│   │       │   ├── integrations/
│   │       │   ├── admin/
│   │       │   └── sandbox/
│   │       │
│   │       ├── shared/
│   │       │   ├── money/
│   │       │   ├── ids/
│   │       │   ├── events/
│   │       │   ├── errors/
│   │       │   ├── security/
│   │       │   ├── logging/
│   │       │   └── configuration/
│   │       │
│   │       └── infrastructure/
│   │           ├── database/
│   │           ├── redis/
│   │           ├── messaging/
│   │           ├── storage/
│   │           ├── providers/
│   │           ├── banks/
│   │           └── kyc/
│   │
│   ├── web/
│   │
│   ├── admin/
│   │
│   └── checkout/
│
├── packages/
│   ├── contracts/
│   ├── sdk/
│   ├── money/
│   ├── events/
│   └── config/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── fixtures/
│
├── workers/
│   ├── webhook-worker/
│   ├── notification-worker/
│   ├── report-worker/
│   ├── reconciliation-worker/
│   └── outbox-worker/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── e2e/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── ledger/
│   ├── providers/
│   ├── webhooks/
│   ├── security/
│   ├── operations/
│   └── testing/
│
├── docker/
├── scripts/
├── docker-compose.yml
├── package.json
└── README.md
```

---

# 118. Architecture Decision Records

يجب إنشاء ADR لكل قرار جوهري:

```text
ADR-001 Modular Monolith
ADR-002 MySQL Initial Database
ADR-003 Repository Abstraction
ADR-004 Double Entry Ledger
ADR-005 Transactional Outbox
ADR-006 Inbox Deduplication
ADR-007 Provider Adapter
ADR-008 Bank Adapter
ADR-009 Idempotency
ADR-010 State Machines
ADR-011 Immutable Financial Records
ADR-012 Sandbox Isolation
ADR-013 Redis Usage
ADR-014 Queue Architecture
ADR-015 API Versioning
ADR-016 Multi-Tenancy
ADR-017 Money Representation
ADR-018 Cursor Pagination
ADR-019 Object Storage
ADR-020 Future Service Extraction
```

---

# 119. Definition of Architecture Complete

Architecture v1.0 تعتبر معتمدة عندما تكون الوثائق التالية محددة:

```text
[✓] Bounded Contexts
[✓] Module Boundaries
[✓] Dependency Rules
[✓] Multi-tenancy Model
[✓] Provider Architecture
[✓] Bank Architecture
[✓] KYC Architecture
[✓] Ledger Architecture
[✓] Balance Architecture
[✓] Settlement Architecture
[✓] Payout Architecture
[✓] Reconciliation Architecture
[✓] Event Architecture
[✓] Outbox / Inbox
[✓] Webhook Architecture
[✓] Security Direction
[✓] Observability Direction
[✓] Testing Architecture
[✓] Deployment Direction
[✓] Scaling Strategy
[✓] Advanced Module Strategy
```

لكن **Architecture v1.0 لا تعني أن التنفيذ أصبح جاهزًا**.

الوثائق التالية هي التي ستقفل التفاصيل اللازمة قبل كتابة الـ Core implementation:

```text
Architecture v1.0
        |
        v
Database Schema v1.0
        |
        v
Complete Entity Relationship Model
        |
        v
State Machines Specification
        |
        v
Ledger Posting Specification
        |
        v
Domain Event Catalog
        |
        v
API Specification v1.0
        |
        v
Webhook Specification
        |
        v
Security Specification
        |
        v
UI/UX Specification
        |
        v
Implementation Roadmap
        |
        v
Implementation
```

---

# 120. أهم قرار هندسي

المشروع **ليس CRUD application**.

الـ Core الحقيقي هو:

```text
                 PAYMENT PLATFORM

                    Commands
                       |
                       v
                 Application Layer
                       |
                       v
                    Domain
                       |
        +--------------+--------------+
        |              |              |
      Payment         Risk         Provider
        |              |              |
        +--------------+--------------+
                       |
                       v
                 State Machine
                       |
                       v
                    Ledger
                       |
                       v
                    Balance
                       |
                       v
                  Settlement
                       |
                       v
                    Payout
                       |
                       v
                 Bank Provider
                       |
                       v
               Reconciliation
```

والـ:

```text
Webhooks
Outbox
Inbox
Idempotency
Audit
Retry
Reconciliation
```

ليست Features جانبية.

بل هي جزء من الـ Financial Core.

---

# 121. Architecture Baseline

من هذه النقطة، أي Implementation يجب أن يلتزم بالقواعد التالية:

1. لا Provider dependency داخل Domain.
2. لا Database dependency داخل Domain.
3. لا Financial mutation بدون Idempotency.
4. لا Financial Posting بدون Double Entry.
5. لا تعديل destructive على Financial Records.
6. لا Status mutation مباشر خارج State Machine.
7. لا Webhook Processing بدون Deduplication.
8. لا Event Publishing قبل Database Commit.
9. لا Payout بدون Balance Eligibility.
10. لا Production Money بدون Reconciliation.
11. لا Tenant access بدون Authorization.
12. لا Sensitive Payment Data داخل Logs.
13. لا Advanced Module يكسر Payment Core.
14. لا Country-specific behavior داخل Core Domain.
15. لا Provider-specific behavior داخل Payment Entity.
16. كل External Integration يجب أن تكون Adapter.
17. كل Financial Module يجب أن يملك Tests + Audit + Events + Failure Handling.
18. كل Module يجب أن يكون قابلًا للاستخراج إلى Service مستقبلًا.
19. Ledger هو Financial Source of Truth.
20. Reconciliation هو Safety Net النهائي للنظام المالي.

---

# 122. Next Document

الخطوة التالية بعد اعتماد Architecture v1.0 هي:

## Database Schema Specification v1.0

وليس البدء مباشرة في CRUD.

ويجب أن تتضمن الوثيقة التالية بالتفصيل:

```text
1. جميع Tables
2. جميع Columns
3. Data Types
4. Primary Keys
5. Foreign Keys
6. Unique Constraints
7. Check Constraints
8. Indexes
9. Composite Indexes
10. Tenant Isolation
11. Soft Delete Policy
12. Immutable Tables
13. Audit Tables
14. Idempotency Tables
15. Outbox Tables
16. Inbox Tables
17. Webhook Tables
18. Ledger Tables
19. Balance Tables
20. Settlement Tables
21. Payout Tables
22. Reconciliation Tables
23. KYC Tables
24. Risk Tables
25. Developer Tables
26. Reporting Tables
27. Advanced Module Tables
28. Entity Relationships
29. Cardinality
30. Migration Order
31. Seed Data
32. Data Retention
33. Partitioning Strategy
34. Archival Strategy
35. Future PostgreSQL Compatibility
```

بعدها ننتقل إلى:

**State Machines + Domain Events + Ledger Posting Rules**، ثم **API Specification**، ثم **UI/UX Specification**، وبعدها فقط يبدأ تنفيذ الـ Implementation الكامل.
