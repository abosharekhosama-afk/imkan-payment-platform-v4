import '../apps/api/src/load-env.js';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {currentTotp} from '../apps/api/src/foundation/crypto.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const required = process.env.FOUNDATION_PG_REQUIRED === 'true';
const PASSWORD = 'SecurePass!123';

async function ensureMigrations() {
  const migrate = spawnSync('npm', ['run', 'db:migrate:pg'], {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    encoding: 'utf8',
    shell: true,
  });
  if (migrate.status !== 0) throw new Error(migrate.stderr || migrate.stdout || 'migrate failed');
}

describe('phase 3 merchant/KYB /api/v1', () => {
  const app = Fastify({logger: false});
  let ready = false;

  // merchant A (subject of onboarding)
  let ownerToken = '';
  let ownerOrg = '';
  let ownerSecret = '';
  // merchant B (tenant isolation)
  let otherToken = '';
  // platform admin
  let adminToken = '';
  let adminSecret = '';

  let kybCaseId = '';
  let bankAccountId = '';

  async function register(email: string, orgName: string) {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password: PASSWORD, organization_name: orgName, name: 'User'},
    });
    expect(reg.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: {token: reg.json().data.email_verification_token},
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password: PASSWORD},
    });
    expect(login.statusCode).toBe(200);
    return {token: login.json().data.access_token as string, orgId: reg.json().data.organization_id as string, userId: reg.json().data.user_id || login.json().data.user?.id};
  }

  async function stepUp(token: string, secret: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/step-up',
      headers: {authorization: `Bearer ${token}`},
      payload: {totp: currentTotp(secret)},
    });
    expect(res.statusCode).toBe(200);
    return res.json().data.step_up_token;
  }

  beforeAll(async () => {
    try {
      ready = await pgPing();
    } catch {
      ready = false;
    }
    if (!ready) {
      if (required) throw new Error('PostgreSQL required');
      return;
    }
    await ensureMigrations();
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();

    const ts = Date.now();
    const owner = await register(`p3-owner-${ts}@example.test`, 'Phase3 Merchant');
    ownerToken = owner.token;
    ownerOrg = owner.orgId;

    const other = await register(`p3-other-${ts}@example.test`, 'Phase3 Other Org');
    otherToken = other.token;

    const admin = await register(`p3-admin-${ts}@example.test`, 'Phase3 Admin Home');
    adminToken = admin.token;
    const adminUser = await pgQuery<{id: string}>(`SELECT id FROM users WHERE email_normalized=$1`, [
      `p3-admin-${ts}@example.test`,
    ]);
    await pgQuery(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE code='PLATFORM_ADMIN'
       ON CONFLICT DO NOTHING`,
      [adminUser.rows[0].id],
    );

    // MFA for step-up flows
    const ownerMfa = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enable',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(ownerMfa.statusCode).toBe(200);
    ownerSecret = ownerMfa.json().data.secret;
    const adminMfa = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enable',
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(adminMfa.statusCode).toBe(200);
    adminSecret = adminMfa.json().data.secret;
  }, 240_000);

  afterAll(async () => {
    outboxWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('serves master data to authenticated users and restricts admin CRUD', async () => {
    if (!ready) return;
    const types = await app.inject({
      method: 'GET',
      url: '/api/v1/master-data/types',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(types.statusCode).toBe(200);
    expect(types.json().data).toContain('countries');
    expect(types.json().data).toContain('legal-entity-types');

    const countries = await app.inject({
      method: 'GET',
      url: '/api/v1/master-data/countries',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(countries.statusCode).toBe(200);
    const sa = countries.json().data.find((c: any) => c.code === 'SA');
    expect(sa).toBeTruthy();
    expect(sa.iso3).toBe('SAU');

    const currencies = await app.inject({
      method: 'GET',
      url: '/api/v1/master-data/currencies',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    const kwd = currencies.json().data.find((c: any) => c.code === 'KWD');
    expect(kwd.minor_units).toBe(3); // typed financial attribute, not metadata

    // Merchant cannot mutate global master data
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/master-data/countries',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {code: 'ZZ', name: 'Denied Land'},
    });
    expect(denied.statusCode).toBe(403);

    // Platform admin can create + deactivate (soft-disable)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/master-data/countries',
      headers: {authorization: `Bearer ${adminToken}`},
      payload: {code: 'ZZ', name: 'Testland', extra: {iso3: 'ZZZ'}},
    });
    expect(createRes.statusCode).toBe(201);
    const deact = await app.inject({
      method: 'POST',
      url: '/api/v1/master-data/countries/ZZ/deactivate',
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(deact.statusCode).toBe(200);
    expect(deact.json().data.is_active).toBe(false);

    const activeList = await app.inject({
      method: 'GET',
      url: '/api/v1/master-data/countries',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(activeList.json().data.find((c: any) => c.code === 'ZZ')).toBeUndefined();

    // Inactive codes are rejected for new business data
    const useInactive = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/legal-profile',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {legal_name: 'Bad Country Co', incorporation_country_code: 'ZZ'},
    });
    expect(useInactive.statusCode).toBe(400);
    expect(useInactive.json().error.code).toBe('MASTER_CODE_INACTIVE');
  });

  it('tracks onboarding completeness through the requirement checklist', async () => {
    if (!ready) return;
    const initial = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/kyb',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().data.case.status).toBe('DRAFT');
    expect(initial.json().data.onboarding_status).toBe('incomplete');
    expect(initial.json().data.missing.length).toBeGreaterThan(0);
    kybCaseId = initial.json().data.case.id;

    const legal = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/legal-profile',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {
        legal_name: 'Phase3 Trading LLC',
        registration_number: `CR-${Date.now()}`,
        legal_entity_type_code: 'LLC',
        incorporation_country_code: 'SA',
        incorporation_date: '2020-01-15',
        tax_type_code: 'VAT',
        tax_id: 'TAX-SECRET-9876',
        addresses: [
          {address_type_code: 'REGISTERED', line1: '123 King Fahd Rd', city: 'Riyadh', country_code: 'SA'},
        ],
      },
    });
    expect(legal.statusCode).toBe(200);

    const business = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/business-profile',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {
        business_type_code: 'RETAIL',
        industry_code: 'ECOMMERCE',
        description: 'Online retail of goods',
        expected_monthly_volume_minor: '100000000',
        average_transaction_minor: '50000',
        volume_currency_code: 'SAR',
        countries_served: ['SA', 'AE'],
        currencies_accepted: ['SAR', 'USD'],
      },
    });
    expect(business.statusCode).toBe(200);

    // Normalized relations (no arrays in the relational model)
    const rel = await pgQuery<{c: number}>(
      `SELECT (SELECT COUNT(*) FROM business_profile_countries bpc JOIN business_profiles bp ON bp.id=bpc.business_profile_id WHERE bp.organization_id=$1)::int AS c`,
      [ownerOrg],
    );
    expect(rel.rows[0].c).toBe(2);

    // Ownership > 100% rejected
    const badOwner = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/owners',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {full_name: 'Too Much', ownership_percent: '150'},
    });
    expect(badOwner.statusCode).toBe(400);

    const ownerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/owners',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {
        full_name: 'Aisha Founder',
        ownership_percent: '60',
        nationality_country_code: 'SA',
        identification_type_code: 'NATIONAL_ID',
        identification_number: '1098765432',
      },
    });
    expect(ownerRes.statusCode).toBe(201);
    // Masked in responses; encrypted at rest
    expect(ownerRes.json().data.identification_number_masked).toBe('****5432');
    expect(ownerRes.json().data.identification_number_encrypted).toBeUndefined();
    const dbOwner = await pgQuery<{enc: string}>(
      `SELECT identification_number_encrypted AS enc FROM beneficial_owners WHERE organization_id=$1`,
      [ownerOrg],
    );
    expect(dbOwner.rows[0].enc.startsWith('v1$')).toBe(true);
    expect(dbOwner.rows[0].enc).not.toContain('1098765432');

    const doc = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/documents',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {
        document_type_code: 'COMPANY_REGISTRATION',
        file_name: 'cr-certificate.pdf',
        mime_type: 'application/pdf',
        size_bytes: 123456,
      },
    });
    expect(doc.statusCode).toBe(201);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/kyb',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(after.json().data.missing).toEqual([]);
    expect(after.json().data.onboarding_status).toBe('pending');
  });

  it('submits KYB with idempotency, freezes data, and records results + transitions', async () => {
    if (!ready) return;
    const noKey = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/kyb/submit',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {},
    });
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const key = `kyb-submit-${Date.now()}`;
    const submit = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/kyb/submit',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': key},
      payload: {},
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().data.status).toBe('SUBMITTED');

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/kyb/submit',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': key},
      payload: {},
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.status).toBe('SUBMITTED');

    const results = await pgQuery<{c: number}>(
      `SELECT COUNT(*)::int AS c FROM verification_results WHERE case_id=$1`,
      [kybCaseId],
    );
    expect(results.rows[0].c).toBeGreaterThan(0);
    const transitions = await pgQuery<{to_status: string}>(
      `SELECT to_status FROM verification_case_transitions WHERE case_id=$1 ORDER BY created_at`,
      [kybCaseId],
    );
    expect(transitions.rows.map((r) => r.to_status)).toContain('SUBMITTED');

    // Data frozen while SUBMITTED
    const frozen = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/legal-profile',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {legal_name: 'Should Not Change'},
    });
    expect(frozen.statusCode).toBe(409);
    expect(frozen.json().error.code).toBe('KYB_CASE_LOCKED');

    // Append-only protection at the database level
    await expect(pgQuery(`UPDATE verification_results SET result='PASS' WHERE case_id=$1`, [kybCaseId])).rejects.toThrow(
      /APPEND_ONLY/,
    );
  });

  it('runs the platform review workflow: review → needs info → resubmit → approve', async () => {
    if (!ready) return;
    // Merchant lacks kyb.review
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/kyb/cases',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(denied.statusCode).toBe(403);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/kyb/cases?status=SUBMITTED',
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.some((c: any) => c.id === kybCaseId)).toBe(true);

    const start = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}/start-review`,
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().data.status).toBe('UNDER_REVIEW');

    const needsInfo = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}/request-information`,
      headers: {authorization: `Bearer ${adminToken}`},
      payload: {reason: 'Please add the VAT number'},
    });
    expect(needsInfo.statusCode).toBe(200);
    expect(needsInfo.json().data.status).toBe('NEEDS_INFORMATION');

    const merchantView = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/kyb',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(merchantView.json().data.onboarding_status).toBe('verification_required');

    // Merchant can edit again, then resubmits
    const edit = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/legal-profile',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {
        legal_name: 'Phase3 Trading LLC',
        registration_number: merchantView.json().data ? `CR-KEEP-${Date.now()}` : 'CR-KEEP',
        legal_entity_type_code: 'LLC',
        incorporation_country_code: 'SA',
        vat_number: 'VAT-30012345',
      },
    });
    expect(edit.statusCode).toBe(200);

    const resubmit = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/kyb/submit',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `kyb-resubmit-${Date.now()}`},
      payload: {},
    });
    expect(resubmit.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}/start-review`,
      headers: {authorization: `Bearer ${adminToken}`},
    });

    // Decision requires step-up
    const noStepUp = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}/decision`,
      headers: {authorization: `Bearer ${adminToken}`, 'idempotency-key': `kyb-dec-${Date.now()}`},
      payload: {decision: 'APPROVED', reason: 'All checks passed'},
    });
    expect(noStepUp.statusCode).toBe(403);

    const stepUpToken = await stepUp(adminToken, adminSecret);
    const decide = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}/decision`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-step-up-token': stepUpToken,
        'idempotency-key': `kyb-dec-${Date.now()}`,
      },
      payload: {decision: 'APPROVED', reason: 'All checks passed', risk_category_code: 'LOW'},
    });
    expect(decide.statusCode).toBe(200);
    expect(decide.json().data.status).toBe('APPROVED');

    // Double decision is blocked by the state machine
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}/decision`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-step-up-token': await stepUp(adminToken, adminSecret),
        'idempotency-key': `kyb-dec2-${Date.now()}`,
      },
      payload: {decision: 'REJECTED', reason: 'Changed my mind'},
    });
    expect(again.statusCode).toBe(409);

    const approvedView = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/kyb',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(approvedView.json().data.onboarding_status).toBe('approved');
  });

  it('re-opens review when merchant data changes after approval', async () => {
    if (!ready) return;
    const edit = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/profile',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {trading_name: 'Phase3 New Trade Name'},
    });
    // profile (non-KYB contact data) does not trigger re-review
    expect(edit.statusCode).toBe(200);

    const legalEdit = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/legal-profile',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {
        legal_name: 'Phase3 Trading LLC Renamed',
        registration_number: `CR-NEW-${Date.now()}`,
        legal_entity_type_code: 'LLC',
        incorporation_country_code: 'SA',
      },
    });
    expect(legalEdit.statusCode).toBe(200);

    const view = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/kyb',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(view.json().data.case.status).toBe('UNDER_REVIEW');
    expect(view.json().data.onboarding_status).toBe('under_review');

    // Restore approval for subsequent tests
    const decide = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}/decision`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-step-up-token': await stepUp(adminToken, adminSecret),
        'idempotency-key': `kyb-reapprove-${Date.now()}`,
      },
      payload: {decision: 'APPROVED', reason: 'Re-verified after data change'},
    });
    expect(decide.statusCode).toBe(200);
  });

  it('reviews documents on the platform side', async () => {
    if (!ready) return;
    const docs = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/documents',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    const docId = docs.json().data[0].id;

    const review = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/documents/${docId}/review`,
      headers: {authorization: `Bearer ${adminToken}`},
      payload: {decision: 'ACCEPTED'},
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().data.status).toBe('ACCEPTED');

    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/documents/${docId}/review`,
      headers: {authorization: `Bearer ${adminToken}`},
      payload: {decision: 'REJECTED', reason: 'dup'},
    });
    expect(again.statusCode).toBe(409);
  });

  it('creates bank accounts with step-up, idempotency, masking and encryption', async () => {
    if (!ready) return;
    const iban = 'SA03 8000 0000 6080 1016 7519';

    const noStepUp = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/bank-accounts',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `bank-${Date.now()}`},
      payload: {
        payout_method_code: 'BANK_TRANSFER',
        currency_code: 'SAR',
        country_code: 'SA',
        bank_name: 'Saudi National Bank',
        account_holder_name: 'Phase3 Trading LLC',
        account_type: 'IBAN',
        account_value: iban,
      },
    });
    expect(noStepUp.statusCode).toBe(403);
    expect(noStepUp.json().error.code).toBe('STEP_UP_REQUIRED');

    const key = `bank-create-${Date.now()}`;
    const createBody = {
      payout_method_code: 'BANK_TRANSFER',
      currency_code: 'SAR',
      country_code: 'SA',
      bank_name: 'Saudi National Bank',
      account_holder_name: 'Phase3 Trading LLC',
      account_type: 'IBAN',
      account_value: iban,
      swift_bic: 'SNBKSARI',
    };
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/bank-accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
        'idempotency-key': key,
      },
      payload: createBody,
    });
    expect(createRes.statusCode).toBe(201);
    const account = createRes.json().data;
    bankAccountId = account.id;
    expect(account.status).toBe('PENDING_VERIFICATION');
    expect(account.account_number_masked).toBe('****7519');
    expect(account.account_number_encrypted).toBeUndefined();
    expect(account.account_fingerprint).toBeUndefined();

    // Idempotent replay returns the cached response without a second row
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/bank-accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
        'idempotency-key': key,
      },
      payload: createBody,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.id).toBe(bankAccountId);

    // Equivalent representation (different formatting) is detected as duplicate
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/bank-accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
        'idempotency-key': `bank-dup-${Date.now()}`,
      },
      payload: {...createBody, account_value: 'sa0380000000608010167519'},
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('BANK_ACCOUNT_DUPLICATE');

    const rows = await pgQuery<{enc: string; fp: string; c: number}>(
      `SELECT account_number_encrypted AS enc, account_fingerprint AS fp FROM payout_accounts WHERE organization_id=$1`,
      [ownerOrg],
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].enc.startsWith('v1$')).toBe(true);
    expect(rows.rows[0].enc).not.toContain('6080');
    expect(rows.rows[0].fp).toMatch(/^[a-f0-9]{64}$/);

    // Security events for sensitive banking operations
    const secEvents = await pgQuery<{c: number}>(
      `SELECT COUNT(*)::int AS c FROM security_events WHERE organization_id=$1 AND event_type='bank_account.created'`,
      [ownerOrg],
    );
    expect(secEvents.rows[0].c).toBe(1);
  });

  it('enforces the bank account lifecycle and verification state machines', async () => {
    if (!ready) return;
    // Cannot activate before verification
    const early = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/bank-accounts/${bankAccountId}/activate`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
        'idempotency-key': `bank-early-act-${Date.now()}`,
      },
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('BANK_INVALID_TRANSITION');

    const pendingList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/bank-accounts?status=PENDING_VERIFICATION',
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(pendingList.statusCode).toBe(200);
    expect(pendingList.json().data.some((a: any) => a.id === bankAccountId)).toBe(true);
    // Admin list is masked too
    expect(pendingList.json().data[0].account_number_encrypted).toBeUndefined();

    const start = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/bank-accounts/${bankAccountId}/verification/start`,
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().data.status).toBe('IN_PROGRESS');

    const pass = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/bank-accounts/${bankAccountId}/verification/decision`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-step-up-token': await stepUp(adminToken, adminSecret),
        'idempotency-key': `bank-verify-${Date.now()}`,
      },
      payload: {result: 'PASSED', reason: 'Bank letter matches account holder'},
    });
    expect(pass.statusCode).toBe(200);
    expect(pass.json().data.status).toBe('VERIFIED');

    const adminDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/bank-accounts/${bankAccountId}`,
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(adminDetail.statusCode).toBe(200);
    expect(adminDetail.json().data.status).toBe('VERIFIED');
    expect(adminDetail.json().data.account_number_encrypted).toBeUndefined();
    expect(adminDetail.json().data.organization_name).toBeTruthy();
    expect(adminDetail.json().data.verifications.length).toBeGreaterThan(0);

    // Second decision on the same account is rejected (no open verification)
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/bank-accounts/${bankAccountId}/verification/decision`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-step-up-token': await stepUp(adminToken, adminSecret),
        'idempotency-key': `bank-verify2-${Date.now()}`,
      },
      payload: {result: 'FAILED', reason: 'duplicate decision'},
    });
    expect(second.statusCode).toBe(409);

    const activate = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/bank-accounts/${bankAccountId}/activate`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
        'idempotency-key': `bank-act-${Date.now()}`,
      },
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().data.status).toBe('ACTIVE');

    const setDefault = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/bank-accounts/${bankAccountId}/set-default`,
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
      },
    });
    expect(setDefault.statusCode).toBe(200);
    expect(setDefault.json().data.is_default).toBe(true);

    // Full lifecycle history exists (append-only)
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/bank-accounts/${bankAccountId}`,
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    const history = detail.json().data.history.map((h: any) => h.to_status);
    expect(history).toEqual(['PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE']);
    await expect(
      pgQuery(`DELETE FROM payout_account_transitions WHERE payout_account_id=$1`, [bankAccountId]),
    ).rejects.toThrow(/APPEND_ONLY/);
  });

  it('allows platform admin to activate a verified payout account', async () => {
    if (!ready) return;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/bank-accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
        'idempotency-key': `bank-admin-create-${Date.now()}`,
      },
      payload: {
        payout_method_code: 'BANK_TRANSFER',
        currency_code: 'SAR',
        country_code: 'SA',
        bank_name: 'Riyad Bank',
        account_holder_name: 'Phase3 Trading LLC',
        account_type: 'IBAN',
        account_value: 'SA0380000000608010168888',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const accountId = createRes.json().data.id as string;

    const start = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/bank-accounts/${accountId}/verification/start`,
      headers: {authorization: `Bearer ${adminToken}`},
    });
    expect(start.statusCode).toBe(200);

    const pass = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/bank-accounts/${accountId}/verification/decision`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-step-up-token': await stepUp(adminToken, adminSecret),
        'idempotency-key': `bank-admin-verify-${Date.now()}`,
      },
      payload: {result: 'PASSED', reason: 'IBAN matches company documents'},
    });
    expect(pass.statusCode).toBe(200);
    expect(pass.json().data.status).toBe('VERIFIED');

    const activate = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/bank-accounts/${accountId}/activate`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-step-up-token': await stepUp(adminToken, adminSecret),
        'idempotency-key': `bank-admin-act-${Date.now()}`,
      },
      payload: {},
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().data.status).toBe('ACTIVE');
    expect(activate.json().data.account_number_encrypted).toBeUndefined();
  });

  it('blocks cross-tenant access to merchant and banking data', async () => {
    if (!ready) return;
    // Org B sees only its own (empty) data
    const otherAccounts = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/bank-accounts',
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(otherAccounts.statusCode).toBe(200);
    expect(otherAccounts.json().data).toEqual([]);

    // Direct ID access across tenants → 404 (no existence leak)
    const cross = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/bank-accounts/${bankAccountId}`,
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(cross.statusCode).toBe(404);

    // Org B cannot use platform review endpoints
    const adminDenied = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/bank-accounts/${bankAccountId}/verification/start`,
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(adminDenied.statusCode).toBe(403);

    const kybDenied = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/kyb/cases/${kybCaseId}`,
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(kybDenied.statusCode).toBe(403);
  });

  it('redacts sensitive banking fields in persisted error reports', async () => {
    if (!ready) return;
    // Invalid payload → validation error captured in error_reports with redacted body
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/bank-accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'x-step-up-token': await stepUp(ownerToken, ownerSecret),
        'idempotency-key': `bank-bad-${Date.now()}`,
      },
      payload: {
        payout_method_code: 'BANK_TRANSFER',
        currency_code: 'SAR',
        country_code: 'SA',
        bank_name: 'X', // too short → validation error
        account_holder_name: 'Phase3 Trading LLC',
        account_type: 'IBAN',
        account_value: 'SA0380000000608010167519',
      },
    });
    expect(res.statusCode).toBe(400);

    const report = await pgQuery<{body_json: any}>(
      `SELECT body_json FROM error_reports
       WHERE organization_id=$1 AND route LIKE '%bank-accounts%'
       ORDER BY created_at DESC LIMIT 1`,
      [ownerOrg],
    );
    expect(report.rows[0].body_json.account_value).toBe('[REDACTED]');
  });

  it('regression (012): allows unlimited keyless outbox events per org while keyed events dedupe', async () => {
    if (!ready) return;
    // Root cause of previous 500s: 006's NULLS NOT DISTINCT unique index allowed only
    // ONE keyless outbox event per organization. The KYB/bank flows above emit several
    // keyless events (kyb.case.needs_information, kyb.case.reopened,
    // bank_account.status_changed) — all must persist.
    const keyless = await pgQuery<{c: number}>(
      `SELECT COUNT(*)::int AS c FROM outbox_events WHERE organization_id=$1 AND idempotency_key IS NULL`,
      [ownerOrg],
    );
    expect(keyless.rows[0].c).toBeGreaterThanOrEqual(2);

    // Keyed deduplication is still enforced by the partial unique index.
    const insertKeyed = `
      INSERT INTO outbox_events(organization_id, event_type, aggregate_type, aggregate_id, payload_json, idempotency_key)
      VALUES ($1::uuid,'test.regression','test',$1::text,'{}','regression-dup-key')
      ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`;
    await pgQuery(insertKeyed, [ownerOrg]);
    await pgQuery(insertKeyed, [ownerOrg]);
    const keyed = await pgQuery<{c: number}>(
      `SELECT COUNT(*)::int AS c FROM outbox_events WHERE organization_id=$1 AND idempotency_key='regression-dup-key'`,
      [ownerOrg],
    );
    expect(keyed.rows[0].c).toBe(1);
  });
});
