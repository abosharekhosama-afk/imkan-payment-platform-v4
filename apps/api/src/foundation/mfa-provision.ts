import {config} from '../config.js';
import type {PgClient} from '../infrastructure/db/postgres.js';
import {emitOutboxEvent, writeAuditEvent, writeSecurityEvent} from './audit.js';
import {encryptSecret, generateTotpSecret} from './crypto.js';

export type MfaIssueReason = 'account_created' | 'invitation_accepted' | 'platform_approved_resend';

/**
 * Enables MFA for a user, stores encrypted secret, and queues a clear email with the TOTP secret.
 * Must run inside an open transaction client.
 */
export async function provisionMfaAndEmail(
  client: PgClient,
  input: {
    userId: string;
    email: string;
    name?: string | null;
    organizationId?: string | null;
    reason: MfaIssueReason;
    actorUserId?: string | null;
    requestId?: string;
    /** Extra uniqueness for repeatable platform resends */
    idempotencySuffix?: string;
  },
): Promise<string> {
  const secret = generateTotpSecret();
  await client.query(
    `UPDATE users SET mfa_enabled=TRUE, mfa_secret_encrypted=$2, updated_at=NOW() WHERE id=$1`,
    [input.userId, encryptSecret(secret)],
  );

  const idem =
    input.idempotencySuffix != null
      ? `mfa.totp.issued:${input.userId}:${input.reason}:${input.idempotencySuffix}`
      : `mfa.totp.issued:${input.userId}:${input.reason}`;

  await emitOutboxEvent(
    {
      organizationId: input.organizationId ?? null,
      eventType: 'email.mfa_totp.issued',
      aggregateType: 'user',
      aggregateId: input.userId,
      payload: {
        user_id: input.userId,
        email: input.email,
        name: input.name || null,
        secret,
        reason: input.reason,
        login_url: `${config.appPublicUrl}/login`,
        issuer: 'IMKAN Payments',
      },
      idempotencyKey: idem,
    },
    client,
  );

  await writeAuditEvent(
    {
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId || input.userId,
      action: 'user.mfa_secret_issued',
      resourceType: 'user',
      resourceId: input.userId,
      requestId: input.requestId,
      metadata: {reason: input.reason},
    },
    client,
  );
  await writeSecurityEvent(
    {
      organizationId: input.organizationId ?? null,
      userId: input.userId,
      eventType: 'user.mfa_secret_issued',
      metadata: {reason: input.reason},
    },
    client,
  );

  return secret;
}
