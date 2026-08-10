import {config} from '../config.js';
import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {emitOutboxEvent, writeAuditEvent, writeLoginEvent, writeSecurityEvent} from './audit.js';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashPassword,
  hashToken,
  randomToken,
  verifyPassword,
  verifyTotp,
} from './crypto.js';
import {AppError, conflict, forbidden, unauthorized} from './errors.js';
import {identityPhase2} from './identity-phase2.js';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'org'
  );
}

async function loadPermissions(
  userId: string,
  organizationId: string | null,
  client?: PgClient,
): Promise<{permissions: string[]; roles: string[]}> {
  const q = client
    ? (text: string, params: unknown[]) => client.query(text, params)
    : (text: string, params: unknown[]) => pgQuery(text, params);
  const r = await q(
    `SELECT DISTINCT p.code, r.code AS role_code
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1
       AND (
         (r.scope = 'PLATFORM' AND ur.organization_id IS NULL)
         OR (r.scope = 'MERCHANT' AND ur.organization_id IS NOT DISTINCT FROM $2)
       )`,
    [userId, organizationId],
  );
  return {
    permissions: [...new Set(r.rows.map((x: {code: string}) => x.code))],
    roles: [...new Set(r.rows.map((x: {role_code: string}) => x.role_code))],
  };
}

export class IdentityService {
  async register(input: {
    email: string;
    password: string;
    name?: string;
    organizationName: string;
    countryCode?: string | null;
    requestId?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const email = input.email.trim();
    const emailNormalized = normalizeEmail(email);
    if (input.password.length < 10) {
      throw new AppError('WEAK_PASSWORD', 'Password must be at least 10 characters.', 400);
    }

    return withPgTransaction(async (client) => {
      const existing = await client.query('SELECT id FROM users WHERE email_normalized=$1', [emailNormalized]);
      if (existing.rows[0]) throw conflict('Email already registered', 'EMAIL_EXISTS');

      const userId = cryptoRandomUuid();
      const orgId = cryptoRandomUuid();
      const baseSlug = slugify(input.organizationName);
      let slug = baseSlug;
      for (let i = 0; i < 5; i++) {
        const taken = await client.query('SELECT 1 FROM organizations WHERE slug=$1', [slug]);
        if (!taken.rows[0]) break;
        slug = `${baseSlug}-${randomToken(3)}`;
      }

      await client.query(
        `INSERT INTO users(id, email, email_normalized, password_hash, name, status, email_verified_at)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE',NULL)`,
        [userId, email, emailNormalized, hashPassword(input.password), input.name || null],
      );
      await client.query(
        `INSERT INTO organizations(id, name, slug, status, country_code) VALUES ($1,$2,$3,'ACTIVE',$4)`,
        [orgId, input.organizationName.trim(), slug, input.countryCode ? input.countryCode.toUpperCase() : null],
      );
      await client.query(`INSERT INTO organization_settings(organization_id) VALUES ($1)`, [orgId]);
      await client.query(
        `INSERT INTO organization_users(organization_id, user_id, status, joined_at)
         VALUES ($1,$2,'ACTIVE',NOW())`,
        [orgId, userId],
      );

      const role = await client.query<{id: string}>(`SELECT id FROM roles WHERE code='MERCHANT_OWNER'`);
      if (!role.rows[0]) throw new AppError('ROLE_CATALOG_MISSING', 'RBAC seed missing MERCHANT_OWNER', 500);
      await client.query(`INSERT INTO user_roles(user_id, role_id, organization_id) VALUES ($1,$2,$3)`, [
        userId,
        role.rows[0].id,
        orgId,
      ]);

      await writeAuditEvent(
        {
          organizationId: orgId,
          actorUserId: userId,
          action: 'user.registered',
          resourceType: 'user',
          resourceId: userId,
          requestId: input.requestId,
          after: {email: emailNormalized, organization_id: orgId},
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId: orgId,
          eventType: 'user.registered',
          aggregateType: 'user',
          aggregateId: userId,
          payload: {user_id: userId, organization_id: orgId, email: emailNormalized},
          idempotencyKey: `user.registered:${userId}`,
        },
        client,
      );
      await writeSecurityEvent(
        {
          organizationId: orgId,
          userId,
          eventType: 'user.registered',
          ip: input.ip,
          userAgent: input.userAgent,
        },
        client,
      );

      const verificationToken = await identityPhase2.issueEmailVerification(userId, email, client);
      return {
        user_id: userId,
        organization_id: orgId,
        email,
        organization_slug: slug,
        email_verification_required: true,
        ...(config.exposeDevTokens ? {email_verification_token: verificationToken} : {}),
      };
    });
  }

  async login(input: {email: string; password: string; organizationId?: string; ip?: string; userAgent?: string}) {
    const emailNormalized = normalizeEmail(input.email);
    const userRes = await pgQuery<{
      id: string;
      email: string;
      password_hash: string | null;
      status: string;
      mfa_enabled: boolean;
      failed_login_count: number;
      locked_until: Date | null;
      email_verified_at: Date | null;
    }>(
      'SELECT id, email, password_hash, status, mfa_enabled, failed_login_count, locked_until, email_verified_at FROM users WHERE email_normalized=$1',
      [emailNormalized],
    );
    const user = userRes.rows[0];
    if (!user || !user.password_hash) {
      await writeLoginEvent({
        emailAttempted: emailNormalized,
        success: false,
        failureReason: 'INVALID_CREDENTIALS',
        ip: input.ip,
        userAgent: input.userAgent,
      });
      throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    await identityPhase2.assertEmailVerifiedForLogin(user.id, user.email_verified_at);
    if (user.status !== 'ACTIVE') {
      await writeLoginEvent({
        userId: user.id,
        emailAttempted: emailNormalized,
        success: false,
        failureReason: 'ACCOUNT_DISABLED',
        ip: input.ip,
        userAgent: input.userAgent,
      });
      throw forbidden('Account is disabled', 'ACCOUNT_DISABLED');
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await writeLoginEvent({
        userId: user.id,
        emailAttempted: emailNormalized,
        success: false,
        failureReason: 'ACCOUNT_LOCKED',
        ip: input.ip,
        userAgent: input.userAgent,
      });
      throw forbidden('Account temporarily locked', 'ACCOUNT_LOCKED');
    }
    if (!verifyPassword(input.password, user.password_hash)) {
      await withPgTransaction(async (client) => {
        const fails = user.failed_login_count + 1;
        const lock =
          fails >= config.loginMaxAttempts ? new Date(Date.now() + config.loginLockMinutes * 60_000) : null;
        await client.query('UPDATE users SET failed_login_count=$2, locked_until=$3, updated_at=NOW() WHERE id=$1', [
          user.id,
          fails,
          lock,
        ]);
        await writeLoginEvent(
          {
            userId: user.id,
            emailAttempted: emailNormalized,
            success: false,
            failureReason: 'INVALID_CREDENTIALS',
            ip: input.ip,
            userAgent: input.userAgent,
          },
          client,
        );
        await writeSecurityEvent(
          {userId: user.id, eventType: 'login.failed', success: false, ip: input.ip, userAgent: input.userAgent},
          client,
        );
      });
      throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (user.mfa_enabled) {
      const challengeToken = randomToken(24);
      await withPgTransaction(async (client) => {
        await client.query('UPDATE users SET failed_login_count=0, locked_until=NULL, updated_at=NOW() WHERE id=$1', [
          user.id,
        ]);
        await client.query(
          `INSERT INTO mfa_challenges(user_id, challenge_hash, purpose, expires_at)
           VALUES ($1,$2,'LOGIN', NOW() + INTERVAL '10 minutes')`,
          [user.id, hashToken(challengeToken)],
        );
        await writeLoginEvent(
          {
            userId: user.id,
            emailAttempted: emailNormalized,
            success: false,
            failureReason: 'MFA_REQUIRED',
            ip: input.ip,
            userAgent: input.userAgent,
          },
          client,
        );
      });
      return {mfa_required: true as const, mfa_token: challengeToken};
    }

    await pgQuery('UPDATE users SET failed_login_count=0, locked_until=NULL, updated_at=NOW() WHERE id=$1', [user.id]);
    return this.issueSession({
      userId: user.id,
      email: user.email,
      organizationId: input.organizationId || null,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }

  async verifyMfaLogin(input: {
    mfaToken: string;
    totp: string;
    organizationId?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const challenge = await pgQuery<{id: string; user_id: string}>(
      `SELECT id, user_id FROM mfa_challenges
       WHERE challenge_hash=$1 AND purpose='LOGIN' AND consumed_at IS NULL AND expires_at > NOW()`,
      [hashToken(input.mfaToken)],
    );
    const row = challenge.rows[0];
    if (!row) throw unauthorized('Invalid or expired MFA challenge', 'INVALID_MFA_CHALLENGE');

    const user = await pgQuery<{id: string; email: string; mfa_secret_encrypted: string | null}>(
      'SELECT id, email, mfa_secret_encrypted FROM users WHERE id=$1 AND status=$2',
      [row.user_id, 'ACTIVE'],
    );
    const u = user.rows[0];
    if (!u?.mfa_secret_encrypted) throw unauthorized('MFA is not configured', 'MFA_NOT_CONFIGURED');
    const secret = decryptSecret(u.mfa_secret_encrypted);
    if (!verifyTotp(secret, input.totp)) {
      await writeSecurityEvent({
        userId: u.id,
        eventType: 'mfa.failed',
        success: false,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      throw unauthorized('Invalid MFA code', 'INVALID_MFA_CODE');
    }

    await withPgTransaction(async (client) => {
      await client.query('UPDATE mfa_challenges SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL', [row.id]);
    });

    return this.issueSession({
      userId: u.id,
      email: u.email,
      organizationId: input.organizationId || null,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }

  async issueSession(input: {
    userId: string;
    email: string;
    organizationId: string | null;
    ip?: string;
    userAgent?: string;
  }) {
    return withPgTransaction(async (client) => {
      let organizationId = input.organizationId;
      if (organizationId) {
        const membership = await client.query(
          `SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
          [organizationId, input.userId],
        );
        if (!membership.rows[0]) throw forbidden('Not a member of this organization', 'ORG_MEMBERSHIP_REQUIRED');
      } else {
        const first = await client.query<{organization_id: string}>(
          `SELECT organization_id FROM organization_users WHERE user_id=$1 AND status='ACTIVE' ORDER BY joined_at NULLS LAST, created_at LIMIT 1`,
          [input.userId],
        );
        organizationId = first.rows[0]?.organization_id || null;
      }

      const token = randomToken(32);
      const sessionId = cryptoRandomUuid();
      const expires = new Date(Date.now() + config.sessionTtlHours * 3600_000);
      await client.query(
        `INSERT INTO sessions(id, user_id, organization_id, token_hash, expires_at, ip, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [sessionId, input.userId, organizationId, hashToken(token), expires, input.ip || null, input.userAgent || null],
      );
      const authz = await loadPermissions(input.userId, organizationId, client);
      await writeLoginEvent(
        {
          userId: input.userId,
          organizationId,
          emailAttempted: input.email,
          success: true,
          ip: input.ip,
          userAgent: input.userAgent,
        },
        client,
      );
      await writeSecurityEvent(
        {
          userId: input.userId,
          organizationId,
          eventType: 'login.succeeded',
          ip: input.ip,
          userAgent: input.userAgent,
        },
        client,
      );
      return {
        mfa_required: false as const,
        access_token: token,
        token_type: 'Bearer',
        expires_at: expires.toISOString(),
        user: {id: input.userId, email: input.email},
        organization_id: organizationId,
        roles: authz.roles,
        permissions: authz.permissions,
        session_id: sessionId,
      };
    });
  }

  async logout(token: string) {
    await pgQuery(`UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL`, [hashToken(token)]);
  }

  async resolveSession(token: string) {
    const r = await pgQuery<{
      id: string;
      user_id: string;
      email: string;
      organization_id: string | null;
      status: string;
    }>(
      `SELECT s.id, s.user_id, u.email, s.organization_id, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
      [hashToken(token)],
    );
    const row = r.rows[0];
    if (!row || row.status !== 'ACTIVE') throw unauthorized('Invalid session', 'INVALID_SESSION');
    if (row.organization_id) {
      const membership = await pgQuery(
        `SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
        [row.organization_id, row.user_id],
      );
      if (!membership.rows[0]) throw unauthorized('Organization membership revoked', 'ORG_MEMBERSHIP_REQUIRED');
    }
    const authz = await loadPermissions(row.user_id, row.organization_id);
    return {
      sessionId: row.id,
      userId: row.user_id,
      email: row.email,
      organizationId: row.organization_id,
      permissions: authz.permissions,
      roles: authz.roles,
    };
  }

  async enableMfa(userId: string, organizationId: string | null, requestId?: string) {
    const secret = generateTotpSecret();
    await withPgTransaction(async (client) => {
      await client.query(`UPDATE users SET mfa_enabled=TRUE, mfa_secret_encrypted=$2, updated_at=NOW() WHERE id=$1`, [
        userId,
        encryptSecret(secret),
      ]);
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: userId,
          action: 'user.mfa_enabled',
          resourceType: 'user',
          resourceId: userId,
          requestId,
        },
        client,
      );
      await writeSecurityEvent(
        {
          organizationId,
          userId,
          eventType: 'user.mfa_enabled',
          ip: undefined,
          userAgent: undefined,
        },
        client,
      );
    });
    const label = encodeURIComponent(`IMKAN:${userId}`);
    return {
      mfa_enabled: true,
      otpauth_uri: `otpauth://totp/${label}?secret=${secret}&issuer=IMKAN-Payments`,
      secret,
    };
  }

  async getOrganizationForUser(organizationId: string, userId: string) {
    const r = await pgQuery(
      `SELECT o.id, o.name, o.slug, o.status, o.created_at, os.default_currency, os.locale, os.timezone
       FROM organizations o
       JOIN organization_users ou ON ou.organization_id = o.id
       LEFT JOIN organization_settings os ON os.organization_id = o.id
       WHERE o.id=$1 AND ou.user_id=$2 AND ou.status='ACTIVE'`,
      [organizationId, userId],
    );
    if (!r.rows[0]) throw forbidden('Cross-tenant access denied', 'CROSS_TENANT_DENIED');
    return r.rows[0];
  }

  async listMembers(organizationId: string, userId: string) {
    await this.getOrganizationForUser(organizationId, userId);
    const r = await pgQuery(
      `SELECT u.id, u.email, u.name, u.status, ou.status AS membership_status, ou.joined_at,
              COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM organization_users ou
       JOIN users u ON u.id = ou.user_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id = ou.organization_id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ou.organization_id=$1
       GROUP BY u.id, u.email, u.name, u.status, ou.status, ou.joined_at
       ORDER BY ou.joined_at NULLS LAST`,
      [organizationId],
    );
    return r.rows;
  }
}

function cryptoRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}

export const identityService = new IdentityService();
