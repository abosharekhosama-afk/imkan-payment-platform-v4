# Ledger Posting Specification v1.0

## Invariants
1. Sum(debits) == Sum(credits).
2. One currency per ledger transaction.
3. Posted entries are immutable.
4. Corrections use compensating transactions.
5. Every transaction has a source/reference/correlation id.

## Payment example
For a 100.00 USD payment with 3.00 USD fee:
- Debit Processor Receivable 100.00
- Credit Merchant Payable 97.00
- Credit Platform Fee Revenue 3.00

## Refund example
A 20.00 USD refund reverses the economic effect through a new transaction; it never edits the original posted entries.

## Eligibility
Available balance is a projection, not a source of truth. Ledger remains authoritative. Payout eligibility must consider settlement status, reserves, risk holds, disputes, negative balances and currency.
