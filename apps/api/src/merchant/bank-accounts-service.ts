import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError, conflict, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent, writeSecurityEvent} from '../foundation/audit.js';
import {
  bankAccountFingerprint,
  encryptBankSecret,
  maskTail,
  normalizeBankAccountValue,
  type BankAccountType,
} from '../foundation/crypto.js';
import {resolveMasterId} from './master-data.js';
import {bankVerificationProvider} from './verification-providers.js';

type Actor = {userId: string; requestId?: string};

type AccountStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'ACTIVE' | 'REJECTED' | 'DEACTIVATED';

/** Account lifecycle state machine (separate from verification case state). */
const ACCOUNT_TRANSITIONS: Record<AccountStatus, AccountStatus[]> = {
  PENDING_VERIFICATION: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['ACTIVE'],
  ACTIVE: ['DEACTIVATED'],
  DEACTIVATED: ['ACTIVE'],
  REJECTED: [],
};

/** Masked projection — encrypted/plaintext values and fingerprints NEVER leave the service. */
function maskAccount(row: any) {
  const {account_number_encrypted, account_fingerprint, ...rest} = row;
  return {
    ...rest,
    account_number_masked: maskTail(String(row.account_last4)),
  };
}

async function recordAccountTransition(
  client: PgClient,
  input: {
    payoutAccountId: string;
    organizationId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId?: string | null;
    actorType: 'MERCHANT' | 'PLATFORM' | 'SYSTEM';
    reason?: string | null;
  },
) {
  await client.query(
    `INSERT INTO payout_account_transitions (payout_account_id, organization_id, from_status, to_status, actor_user_id, actor_type, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [input.payoutAccountId, input.organizationId, input.fromStatus, input.toStatus, input.actorUserId || null, input.actorType, input.reason || null],
  );
}

async function transitionAccount(
  client: PgClient,
  account: {id: string; organization_id: string; status: AccountStatus; version: number},
  toStatus: AccountStatus,
  actor: {userId?: string | null; type: 'MERCHANT' | 'PLATFORM' | 'SYSTEM'},
  reason?: string,
) {
  if (!ACCOUNT_TRANSITIONS[account.status].includes(toStatus)) {
    throw conflict(`Invalid payout account transition ${account.status} → ${toStatus}`, 'BANK_INVALID_TRANSITION');
  }
  const r = await client.query(
    `UPDATE payout_accounts
     SET status=$4, version=version+1, updated_at=NOW()
     WHERE id=$1 AND status=$2 AND version=$3
     RETURNING *`,
    [account.id, account.status, account.version, toStatus],
  );
  if (!r.rows[0]) throw conflict('Payout account was modified concurrently', 'BANK_CONCURRENT_MODIFICATION');
  await recordAccountTransition(client, {
    payoutAccountId: account.id,
    organizationId: account.organization_id,
    fromStatus: account.status,
    toStatus,
    actorUserId: actor.userId,
    actorType: actor.type,
    reason: reason || null,
  });
  await emitOutboxEvent(
    {
      organizationId: account.organization_id,
      eventType: 'bank_account.status_changed',
      aggregateType: 'payout_account',
      aggregateId: account.id,
      payload: {from: account.status, to: toStatus},
    },
    client,
  );
  return r.rows[0];
}

async function lockAccount(client: PgClient, organizationId: string | null, accountId: string) {
  const r = organizationId
    ? await client.query(`SELECT * FROM payout_accounts WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [accountId, organizationId])
    : await client.query(`SELECT * FROM payout_accounts WHERE id=$1 FOR UPDATE`, [accountId]);
  if (!r.rows[0]) throw notFound('Payout account not found', 'BANK_ACCOUNT_NOT_FOUND');
  return r.rows[0];
}

export const bankAccountsService = {
  /**
   * Add payout account (spec §7 sensitive chain; step-up + idempotency enforced at route).
   * Details are immutable after creation: a change means creating a new account
   * and deactivating the old one (documented decision — safer than in-place edits).
   */
  async create(
    organizationId: string,
    input: {
      payoutMethodCode: string;
      currencyCode: string;
      countryCode: string;
      bankName: string;
      accountHolderName: string;
      holderRelationship?: 'COMPANY' | 'OWNER' | 'OTHER';
      accountType: BankAccountType;
      accountValue: string;
      swiftBic?: string;
    },
    actor: Actor,
  ) {
    const normalized = normalizeBankAccountValue(input.accountType, input.accountValue);
    const fingerprint = bankAccountFingerprint(input.accountType, input.countryCode, normalized);

    return withPgTransaction(async (client) => {
      const payoutMethodId = await resolveMasterId('master_payout_methods', input.payoutMethodCode, client);
      const countryId = await resolveMasterId('master_countries', input.countryCode, client);
      await resolveMasterId('master_currencies', input.currencyCode, client);

      let row;
      try {
        const r = await client.query(
          `INSERT INTO payout_accounts (
             organization_id, payout_method_id, currency_code, country_id, bank_name, account_holder_name,
             holder_relationship, account_type, account_number_encrypted, account_last4, account_fingerprint,
             swift_bic, status, created_by_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDING_VERIFICATION',$13)
           RETURNING *`,
          [
            organizationId,
            payoutMethodId,
            input.currencyCode,
            countryId,
            input.bankName,
            input.accountHolderName,
            input.holderRelationship || 'COMPANY',
            input.accountType,
            encryptBankSecret(normalized),
            normalized.slice(-4),
            fingerprint,
            input.swiftBic || null,
            actor.userId,
          ],
        );
        row = r.rows[0];
      } catch (error: any) {
        if (error?.code === '23505') {
          throw new AppError('BANK_ACCOUNT_DUPLICATE', 'An equivalent payout account already exists for this organization', 409);
        }
        throw error;
      }

      await recordAccountTransition(client, {
        payoutAccountId: row.id,
        organizationId,
        fromStatus: null,
        toStatus: 'PENDING_VERIFICATION',
        actorUserId: actor.userId,
        actorType: 'MERCHANT',
        reason: 'Account created',
      });

      // Open the verification case (manual review; provider adapter is a stub).
      const verification = await client.query(
        `INSERT INTO payout_account_verifications (payout_account_id, organization_id, method, status, initiated_by_user_id)
         VALUES ($1,$2,'MANUAL_REVIEW','PENDING',$3)
         RETURNING *`,
        [row.id, organizationId, actor.userId],
      );

      const providerCheck = await bankVerificationProvider.verifyAccount({
        organizationId,
        payoutAccountId: row.id,
        accountHolderName: input.accountHolderName,
        accountLast4: row.account_last4,
        countryCode: input.countryCode,
        currencyCode: input.currencyCode,
      });
      await client.query(
        `INSERT INTO payout_account_verification_results (verification_id, organization_id, check_type, result, provider, details_json)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [verification.rows[0].id, organizationId, providerCheck.checkType, providerCheck.result, providerCheck.provider, providerCheck.details ?? null],
      );

      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'bank_account.create',
          resourceType: 'payout_accounts',
          resourceId: row.id,
          requestId: actor.requestId,
          after: {bank_name: row.bank_name, account_last4: row.account_last4, currency: row.currency_code, status: row.status},
        },
        client,
      );
      await writeSecurityEvent(
        {organizationId, userId: actor.userId, eventType: 'bank_account.created', metadata: {payout_account_id: row.id, last4: row.account_last4}},
        client,
      );
      await emitOutboxEvent(
        {organizationId, eventType: 'bank_account.created', aggregateType: 'payout_account', aggregateId: row.id, payload: {last4: row.account_last4}, idempotencyKey: `bank-create-${row.id}`},
        client,
      );
      return maskAccount(row);
    });
  },

  async withHistory(row: any) {
    const accountId = row.id as string;
    const verifications = await pgQuery(
      `SELECT id, method, status, reason, created_at, decided_at FROM payout_account_verifications
       WHERE payout_account_id=$1 ORDER BY created_at DESC`,
      [accountId],
    );
    const transitions = await pgQuery(
      `SELECT from_status, to_status, actor_type, reason, created_at FROM payout_account_transitions
       WHERE payout_account_id=$1 ORDER BY created_at`,
      [accountId],
    );
    const results = await pgQuery(
      `SELECT r.check_type, r.result, r.provider, r.created_at, r.details_json
       FROM payout_account_verification_results r
       JOIN payout_account_verifications v ON v.id = r.verification_id
       WHERE v.payout_account_id=$1
       ORDER BY r.created_at DESC`,
      [accountId],
    );
    return {
      ...maskAccount(row),
      verifications: verifications.rows,
      history: transitions.rows,
      results: results.rows,
    };
  },

  async list(organizationId: string) {
    const r = await pgQuery(
      `SELECT pa.*, pm.code AS payout_method_code, c.code AS country_code
       FROM payout_accounts pa
       JOIN master_payout_methods pm ON pm.id = pa.payout_method_id
       JOIN master_countries c ON c.id = pa.country_id
       WHERE pa.organization_id=$1
       ORDER BY pa.created_at DESC`,
      [organizationId],
    );
    return r.rows.map(maskAccount);
  },

  async get(organizationId: string, accountId: string) {
    const r = await pgQuery(
      `SELECT pa.*, pm.code AS payout_method_code, c.code AS country_code
       FROM payout_accounts pa
       JOIN master_payout_methods pm ON pm.id = pa.payout_method_id
       JOIN master_countries c ON c.id = pa.country_id
       WHERE pa.id=$1 AND pa.organization_id=$2`,
      [accountId, organizationId],
    );
    if (!r.rows[0]) throw notFound('Payout account not found', 'BANK_ACCOUNT_NOT_FOUND');
    return this.withHistory(r.rows[0]);
  },

  async activate(organizationId: string, accountId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const account = await lockAccount(client, organizationId, accountId);
      const updated = await transitionAccount(client, account, 'ACTIVE', {userId: actor.userId, type: 'MERCHANT'}, 'Activated by merchant');
      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: 'bank_account.activate', resourceType: 'payout_accounts', resourceId: accountId, requestId: actor.requestId},
        client,
      );
      await writeSecurityEvent(
        {organizationId, userId: actor.userId, eventType: 'bank_account.activated', metadata: {payout_account_id: accountId}},
        client,
      );
      return maskAccount(updated);
    });
  },

  async deactivate(organizationId: string, accountId: string, reason: string | null, actor: Actor) {
    return withPgTransaction(async (client) => {
      const account = await lockAccount(client, organizationId, accountId);
      const updated = await transitionAccount(client, account, 'DEACTIVATED', {userId: actor.userId, type: 'MERCHANT'}, reason || 'Deactivated by merchant');
      if (account.is_default) {
        await client.query(`UPDATE payout_accounts SET is_default=FALSE, updated_at=NOW() WHERE id=$1`, [accountId]);
      }
      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: 'bank_account.deactivate', resourceType: 'payout_accounts', resourceId: accountId, requestId: actor.requestId, metadata: {reason}},
        client,
      );
      await writeSecurityEvent(
        {organizationId, userId: actor.userId, eventType: 'bank_account.deactivated', metadata: {payout_account_id: accountId}},
        client,
      );
      return maskAccount(updated);
    });
  },

  async setDefault(organizationId: string, accountId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const account = await lockAccount(client, organizationId, accountId);
      if (account.status !== 'ACTIVE') {
        throw conflict('Only ACTIVE payout accounts can be default', 'BANK_ACCOUNT_NOT_ACTIVE');
      }
      await client.query(`UPDATE payout_accounts SET is_default=FALSE, updated_at=NOW() WHERE organization_id=$1 AND is_default`, [organizationId]);
      const r = await client.query(
        `UPDATE payout_accounts SET is_default=TRUE, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [accountId],
      );
      await writeAuditEvent(
        {organizationId, actorUserId: actor.userId, action: 'bank_account.set_default', resourceType: 'payout_accounts', resourceId: accountId, requestId: actor.requestId},
        client,
      );
      return maskAccount(r.rows[0]);
    });
  },

  // ------------------------------------------------------------ platform side

  async listForReview(filter: {status?: string; limit: number; offset: number}) {
    const params: unknown[] = [];
    let where = '';
    if (filter.status) {
      params.push(filter.status);
      where = `WHERE pa.status=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT pa.id, pa.organization_id, o.name AS organization_name, pa.bank_name, pa.account_last4,
              pa.account_holder_name, pa.currency_code, pa.status, pa.is_default, pa.created_at
       FROM payout_accounts pa
       JOIN organizations o ON o.id = pa.organization_id
       ${where}
       ORDER BY pa.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows.map((row: any) => ({...row, account_number_masked: maskTail(String(row.account_last4))}));
  },

  async getForReview(accountId: string) {
    const r = await pgQuery(
      `SELECT pa.*, pm.code AS payout_method_code, c.code AS country_code, o.name AS organization_name
       FROM payout_accounts pa
       JOIN master_payout_methods pm ON pm.id = pa.payout_method_id
       JOIN master_countries c ON c.id = pa.country_id
       JOIN organizations o ON o.id = pa.organization_id
       WHERE pa.id=$1`,
      [accountId],
    );
    if (!r.rows[0]) throw notFound('Payout account not found', 'BANK_ACCOUNT_NOT_FOUND');
    return this.withHistory(r.rows[0]);
  },

  async adminActivate(accountId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const account = await lockAccount(client, null, accountId);
      const updated = await transitionAccount(
        client,
        account,
        'ACTIVE',
        {userId: actor.userId, type: 'PLATFORM'},
        'Activated by platform',
      );
      await writeAuditEvent(
        {
          organizationId: account.organization_id,
          actorUserId: actor.userId,
          action: 'bank_account.activate',
          resourceType: 'payout_accounts',
          resourceId: accountId,
          requestId: actor.requestId,
        },
        client,
      );
      await writeSecurityEvent(
        {
          organizationId: account.organization_id,
          userId: actor.userId,
          eventType: 'bank_account.activated',
          metadata: {payout_account_id: accountId, actor: 'platform'},
        },
        client,
      );
      return maskAccount(updated);
    });
  },

  async startVerification(accountId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const account = await lockAccount(client, null, accountId);
      const r = await client.query(
        `UPDATE payout_account_verifications
         SET status='IN_PROGRESS', version=version+1
         WHERE payout_account_id=$1 AND status='PENDING'
         RETURNING *`,
        [accountId],
      );
      if (!r.rows[0]) throw conflict('No PENDING verification for this account', 'BANK_VERIFICATION_NOT_PENDING');
      await writeAuditEvent(
        {organizationId: account.organization_id, actorUserId: actor.userId, action: 'bank_account.verification.start', resourceType: 'payout_account_verifications', resourceId: r.rows[0].id, requestId: actor.requestId},
        client,
      );
      return r.rows[0];
    });
  },

  /** Platform decision on the verification case; drives the account lifecycle. */
  async decideVerification(accountId: string, result: 'PASSED' | 'FAILED', reason: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      const account = await lockAccount(client, null, accountId);
      const v = await client.query(
        `UPDATE payout_account_verifications
         SET status=$2, reason=$3, decided_by_user_id=$4, decided_at=NOW(), version=version+1
         WHERE payout_account_id=$1 AND status IN ('PENDING','IN_PROGRESS')
         RETURNING *`,
        [accountId, result, reason, actor.userId],
      );
      if (!v.rows[0]) throw conflict('No open verification for this account', 'BANK_VERIFICATION_NOT_OPEN');

      await client.query(
        `INSERT INTO payout_account_verification_results (verification_id, organization_id, check_type, result, provider, reviewer_user_id, details_json)
         VALUES ($1,$2,'MANUAL_REVIEW',$3,'internal',$4,$5)`,
        [v.rows[0].id, account.organization_id, result === 'PASSED' ? 'PASS' : 'FAIL', actor.userId, JSON.stringify({reason})],
      );

      const updated = await transitionAccount(
        client,
        account,
        result === 'PASSED' ? 'VERIFIED' : 'REJECTED',
        {userId: actor.userId, type: 'PLATFORM'},
        reason,
      );

      await writeAuditEvent(
        {organizationId: account.organization_id, actorUserId: actor.userId, action: 'bank_account.verification.decide', resourceType: 'payout_accounts', resourceId: accountId, requestId: actor.requestId, metadata: {result, reason}},
        client,
      );
      await writeSecurityEvent(
        {organizationId: account.organization_id, userId: actor.userId, eventType: 'bank_account.verification.decided', metadata: {payout_account_id: accountId, result}},
        client,
      );
      if (result === 'PASSED') {
        await emitOutboxEvent(
          {organizationId: account.organization_id, eventType: 'bank_account.verified', aggregateType: 'payout_account', aggregateId: accountId, payload: {last4: account.account_last4}, idempotencyKey: `bank-verified-${accountId}`},
          client,
        );
      }
      return maskAccount(updated);
    });
  },
};
