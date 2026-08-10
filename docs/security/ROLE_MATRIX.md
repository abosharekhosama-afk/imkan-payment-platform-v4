# Role → Permission Matrix — V4 (Phase 6.6 Final)

**Authority:** PostgreSQL `role_permissions` after migrations `005`–`023`.  
**Legend:** `G` = GRANTED · `D` = DENIED · `DEF` = DEFERRED (permission exists; product API not live)

`PLATFORM_OWNER` / `PLATFORM_ADMIN` = **all** seeded permissions (`G` everywhere, including deferred codes for future modules).

---

## Merchant matrix (high-signal codes)

| Permission | OWNER | ADMIN | FINANCE | DEVELOPER | SUPPORT | VIEWER |
|---|---|---|---|---|---|---|
| org.read | G | G | G | G | G | G |
| org.manage | G | G | D | D | D | D |
| users.read | G | G | D | D | D | D |
| users.manage / users.invite / invites.manage | G | G | D | D | D | D |
| users.deactivate | G | G | D | D | D | D |
| roles.read | G | G | D | D | D | D |
| roles.manage | G | G | D | D | D | D |
| audit.read / security.read / errors.read | G | G | G* | G* | G* | G* |
| security.manage | G | G | D | D | D | D |
| settings.read | G | G | G | G | G | G |
| settings.manage | G | G | D | D | D | D |
| merchant.read / kyb.read / documents.read / bank.read | G | G | G | G | G | G |
| merchant.manage / kyb.submit / documents.manage | G | G | D | D | D | D |
| bank.manage | G | G | G | D | D | D |
| kyb.review / bank.review / masterdata.manage | D | D | D | D | D | D |
| payments.read | G | G | G | G | G | G |
| payments.create / payments.cancel / payments.manage | G | G | G | D | D | D |
| payments.capture / refund / partial_refund | DEF | DEF | DEF | DEF | DEF | DEF |
| payment_links.read | G | G | G | G | G | G |
| payment_links.manage | G | G | G | G | D | D |
| payment_config.read / manage | G | G | G | D | D | D |
| providers.read | G | G | G | G | G | G |
| providers.manage | G | G | D | G | D | D |
| api_keys.read / manage | G | G | D | G | D | D |
| webhooks.read / events.read | G | G | G | G | G | G |
| webhooks.manage / integrations.* | DEF | DEF | DEF | DEF | DEF | DEF |
| customers/products/prices/subscriptions/invoices .read | G | G | G | G | G | G |
| *.manage / subscriptions.create\|pause\|resume\|cancel / invoices.pay | G | G | G | D | D | D |
| billing.read / billing.manage | G | G | G | read† | read† | read† |
| developer.read / manage | G | G | D | G | D | D |
| balances / settlements / payouts / disputes / reports / books / notifications | DEF | DEF | DEF | DEF | DEF | DEF |
| transactions.read | G | G | G | G | G | G |
| provider_credentials.manage | DEF | DEF | DEF | DEF | DEF | DEF |
| platform.* | D | D | D | D | D | D |

\* Audit/security/errors grants follow prior seeds (`005`–`022`); VIEWER may have audit.read.  
† DEVELOPER/SUPPORT/VIEWER typically have `billing.read` without `billing.manage`.

No **implicit** grants: a permission not listed in `role_permissions` is **DENIED**.

---

## Platform matrix

| Permission | OWNER | ADMIN | SUPPORT | FINANCE |
|---|---|---|---|---|
| platform.admin (superuser short-circuit) | G | G | D | D |
| All permissions (CROSS JOIN seed) | G | G | D | D |
| platform.support / org.read / users.read / audit.read | G | G | G | partial |
| platform.finance | G | G | D | G |
| platform.organizations.read / users.read / payments.read / audit_logs.read | G | G | G | G |
| kyb.review / bank.review | G | G | D | D |
| kyb.read / merchant.read / bank.read | G | G | G | bank/merchant read |
| billing.manage (global renewals) | G | G | D | D |

---

## Custom roles

| Rule | Enforcement |
|---|---|
| Org-scoped | `roles.organization_id` set |
| System roles immutable | update/delete filtered `is_system=FALSE` |
| No platform perms | `platform.*`, `kyb.review`, `bank.review`, `masterdata.manage` blocked |
| No escalation | `isPermissionSubset(actor, requested)` |
| No OWNER assign by non-owner | `OWNER_ASSIGN_DENIED` |
| No platform role assign via merchant API | `PLATFORM_ROLE_ASSIGN_DENIED` |

---

## Aggregate `*.manage` (backward compatibility)

Existing seeds and API keys may hold `payments.manage` / `billing.manage`. Routes accept aggregate **OR** granular codes so sandboxes do not break. New custom roles should use granular codes. Revoking aggregates globally is a future migration — not performed in Phase 6.6.
