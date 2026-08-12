import {config} from '../config.js';
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {emitOutboxEvent, writeAuditEvent, writeSecurityEvent} from './audit.js';
import {hashPassword, hashToken, randomToken, verifyPassword, verifyTotp} from './crypto.js';
import {AppError, conflict, forbidden, notFound, unauthorized} from './errors.js';
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function maybeDevToken(token: string) {
  return config.exposeDevTokens ? {token} : {};
}

function emailActionUrl(path: string, token: string): string {
  return `${config.appPublicUrl}${path}?token=${encodeURIComponent(token)}`;
}

export class IdentityPhase2Service {
  async issueEmailVerification(userId: string, email: string, client?: any) {
    const token = randomToken(32);
    const expires = new Date(Date.now() + config.emailVerificationTtlHours * 3600_000);
    const exec = client ? client.query.bind(client) : pgQuery;
    await exec(
      `INSERT INTO email_verification_tokens(user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
      [userId, hashToken(token), expires],
    );
    await emitOutboxEvent(
      {
        organizationId: null,
        eventType: 'email.verification.requested',
        aggregateType: 'user',
        aggregateId: userId,
        payload: {user_id: userId, email, action_url: emailActionUrl('/verify-email', token)},
        idempotencyKey: `email.verification:${userId}:${expires.toISOString()}`,
      },
      client,
    );
    return token;
  }

  async verifyEmail(token: string) {
    return withPgTransaction(async (client) => {
      const row = await client.query<{id: string; user_id: string}>(
        `SELECT id, user_id FROM email_verification_tokens
         WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > NOW()`,
        [hashToken(token)],
      );
      const t = row.rows[0];
      if (!t) throw unauthorized('Invalid or expired verification token', 'INVALID_VERIFICATION_TOKEN');
      await client.query(`UPDATE email_verification_tokens SET consumed_at=NOW() WHERE id=$1`, [t.id]);
      await client.query(`UPDATE users SET email_verified_at=NOW(), updated_at=NOW() WHERE id=$1`, [t.user_id]);
      await writeAuditEvent(
        {actorUserId: t.user_id, action: 'user.email_verified', resourceType: 'user', resourceId: t.user_id},
        client,
      );
      await writeSecurityEvent({userId: t.user_id, eventType: 'user.email_verified'}, client);
      return {user_id: t.user_id, email_verified: true};
    });
  }

  async resendVerification(email: string) {
    const emailNormalized = normalizeEmail(email);
    const user = await pgQuery<{id: string; email: string; email_verified_at: Date | null}>(
      `SELECT id, email, email_verified_at FROM users WHERE email_normalized=$1`,
      [emailNormalized],
    );
    const u = user.rows[0];
    // Anti-enumeration: always return accepted
    if (!u || u.email_verified_at) return {accepted: true, ...maybeDevToken('')};
    const token = await withPgTransaction(async (client) => {
      await client.query(
        `UPDATE email_verification_tokens SET consumed_at=NOW()
         WHERE user_id=$1 AND consumed_at IS NULL`,
        [u.id],
      );
      return this.issueEmailVerification(u.id, u.email, client);
    });
    return {accepted: true, ...maybeDevToken(token)};
  }

  async requestPasswordReset(email: string) {
    const emailNormalized = normalizeEmail(email);
    const user = await pgQuery<{id: string; email: string}>(
      `SELECT id, email FROM users WHERE email_normalized=$1 AND status='ACTIVE'`,
      [emailNormalized],
    );
    const u = user.rows[0];
    if (!u) return {accepted: true, ...maybeDevToken('')};
    const token = randomToken(32);
    await withPgTransaction(async (client) => {
      await client.query(
        `UPDATE password_reset_tokens SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL`,
        [u.id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
         VALUES ($1,$2, NOW() + ($3 || ' minutes')::interval)`,
        [u.id, hashToken(token), String(config.passwordResetTtlMinutes)],
      );
      await emitOutboxEvent(
        {
          organizationId: null,
          eventType: 'email.password_reset.requested',
          aggregateType: 'user',
          aggregateId: u.id,
          payload: {user_id: u.id, email: u.email, action_url: emailActionUrl('/reset-password', token)},
          idempotencyKey: `password.reset:${u.id}:${Date.now()}`,
        },
        client,
      );
      await writeSecurityEvent({userId: u.id, eventType: 'user.password_reset_requested'}, client);
    });
    return {accepted: true, ...maybeDevToken(token)};
  }

  async resetPassword(token: string, newPassword: string) {
    if (newPassword.length < 10) throw new AppError('WEAK_PASSWORD', 'Password must be at least 10 characters.', 400);
    return withPgTransaction(async (client) => {
      const row = await client.query<{id: string; user_id: string}>(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > NOW()`,
        [hashToken(token)],
      );
      const t = row.rows[0];
      if (!t) throw unauthorized('Invalid or expired reset token', 'INVALID_RESET_TOKEN');
      await client.query(`UPDATE password_reset_tokens SET consumed_at=NOW() WHERE id=$1`, [t.id]);
      await client.query(
        `UPDATE users SET password_hash=$2, failed_login_count=0, locked_until=NULL, updated_at=NOW() WHERE id=$1`,
        [t.user_id, hashPassword(newPassword)],
      );
      await client.query(`UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, [t.user_id]);
      await writeAuditEvent(
        {actorUserId: t.user_id, action: 'user.password_reset', resourceType: 'user', resourceId: t.user_id},
        client,
      );
      await writeSecurityEvent({userId: t.user_id, eventType: 'user.password_reset'}, client);
      return {reset: true};
    });
  }

  async changePassword(userId: string, organizationId: string | null, currentPassword: string, newPassword: string) {
    if (newPassword.length < 10) throw new AppError('WEAK_PASSWORD', 'Password must be at least 10 characters.', 400);
    return withPgTransaction(async (client) => {
      const user = await client.query<{password_hash: string | null}>(
        `SELECT password_hash FROM users WHERE id=$1 AND status='ACTIVE'`,
        [userId],
      );
      const u = user.rows[0];
      if (!u?.password_hash || !verifyPassword(currentPassword, u.password_hash)) {
        throw unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');
      }
      await client.query(`UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1`, [
        userId,
        hashPassword(newPassword),
      ]);
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: userId,
          action: 'user.password_changed',
          resourceType: 'user',
          resourceId: userId,
        },
        client,
      );
      await writeSecurityEvent(
        {organizationId, userId, eventType: 'user.password_changed'},
        client,
      );
      return {changed: true};
    });
  }

  async createInvitation(input: {
    organizationId: string;
    actorUserId: string;
    email: string;
    roleCode: string;
    requestId?: string;
  }) {
    const emailNormalized = normalizeEmail(input.email);
    const role = await pgQuery<{code: string; scope: string}>(
      `SELECT code, scope FROM roles WHERE code=$1`,
      [input.roleCode],
    );
    if (!role.rows[0] || role.rows[0].scope !== 'MERCHANT') {
      throw new AppError('INVALID_ROLE', 'Invitation role must be a merchant role.', 400);
    }
    const token = randomToken(32);
    return withPgTransaction(async (client) => {
      const existingMember = await client.query(
        `SELECT 1 FROM organization_users ou
         JOIN users u ON u.id = ou.user_id
         WHERE ou.organization_id=$1 AND u.email_normalized=$2 AND ou.status='ACTIVE'`,
        [input.organizationId, emailNormalized],
      );
      if (existingMember.rows[0]) throw conflict('User is already a member', 'ALREADY_MEMBER');

      await client.query(
        `UPDATE organization_invitations SET status='REVOKED', updated_at=NOW()
         WHERE organization_id=$1 AND email_normalized=$2 AND status='PENDING'`,
        [input.organizationId, emailNormalized],
      );

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO organization_invitations(
           id, organization_id, email, email_normalized, role_code, token_hash, status, invited_by_user_id, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7, NOW() + ($8 || ' hours')::interval)`,
        [
          id,
          input.organizationId,
          input.email.trim(),
          emailNormalized,
          input.roleCode,
          hashToken(token),
          input.actorUserId,
          String(config.invitationTtlHours),
        ],
      );
      await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: 'invitation.created',
          aggregateType: 'organization_invitation',
          aggregateId: id,
          payload: {
            invitation_id: id,
            email: emailNormalized,
            role_code: input.roleCode,
            action_url: emailActionUrl('/accept-invitation', token),
          },
          idempotencyKey: `invitation.created:${id}`,
        },
        client,
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'invitation.created',
          resourceType: 'organization_invitation',
          resourceId: id,
          requestId: input.requestId,
          after: {email: emailNormalized, role_code: input.roleCode},
        },
        client,
      );
      return {id, email: input.email.trim(), role_code: input.roleCode, status: 'PENDING', ...maybeDevToken(token)};
    });
  }

  async listInvitations(organizationId: string) {
    const r = await pgQuery(
      `SELECT id, email, role_code, status, expires_at, accepted_at, created_at
       FROM organization_invitations
       WHERE organization_id=$1
       ORDER BY created_at DESC
       LIMIT 100`,
      [organizationId],
    );
    return r.rows;
  }

  async revokeInvitation(organizationId: string, invitationId: string, actorUserId: string) {
    return withPgTransaction(async (client) => {
      const row = await client.query<{id: string; status: string}>(
        `SELECT id, status FROM organization_invitations WHERE id=$1 AND organization_id=$2`,
        [invitationId, organizationId],
      );
      if (!row.rows[0]) throw notFound('Invitation not found', 'INVITATION_NOT_FOUND');
      if (row.rows[0].status !== 'PENDING') throw conflict('Invitation is not pending', 'INVITATION_NOT_PENDING');
      await client.query(
        `UPDATE organization_invitations SET status='REVOKED', updated_at=NOW() WHERE id=$1`,
        [invitationId],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId,
          action: 'invitation.revoked',
          resourceType: 'organization_invitation',
          resourceId: invitationId,
        },
        client,
      );
      return {id: invitationId, status: 'REVOKED'};
    });
  }

  async acceptInvitation(token: string, input: {password?: string; name?: string; existingUserId?: string}) {
    // Platform team invitations (org-less) are handled by the platform users service.
    const platformInv = await pgQuery(
      `SELECT 1 FROM platform_invitations WHERE token_hash=$1 AND status='PENDING' AND expires_at > NOW()`,
      [hashToken(token)],
    );
    if (platformInv.rows[0]) {
      const {platformUsersService} = await import('./platform-users-service.js');
      const result = await platformUsersService.acceptInvitation(token, input);
      if (result) return result;
    }
    return withPgTransaction(async (client) => {
      const inv = await client.query<{
        id: string;
        organization_id: string;
        email: string;
        email_normalized: string;
        role_code: string;
        status: string;
      }>(
        `SELECT id, organization_id, email, email_normalized, role_code, status
         FROM organization_invitations
         WHERE token_hash=$1 AND status='PENDING' AND expires_at > NOW()`,
        [hashToken(token)],
      );
      const invitation = inv.rows[0];
      if (!invitation) throw unauthorized('Invalid or expired invitation', 'INVALID_INVITATION');

      let userId = input.existingUserId || null;
      if (userId) {
        const u = await client.query<{email_normalized: string}>(`SELECT email_normalized FROM users WHERE id=$1`, [
          userId,
        ]);
        if (!u.rows[0] || u.rows[0].email_normalized !== invitation.email_normalized) {
          throw forbidden('Invitation email does not match authenticated user', 'INVITATION_EMAIL_MISMATCH');
        }
      } else {
        const existing = await client.query<{id: string}>(`SELECT id FROM users WHERE email_normalized=$1`, [
          invitation.email_normalized,
        ]);
        if (existing.rows[0]) {
          throw conflict('Account exists — authenticate and accept while logged in', 'ACCOUNT_EXISTS');
        }
        if (!input.password || input.password.length < 10) {
          throw new AppError('WEAK_PASSWORD', 'Password must be at least 10 characters.', 400);
        }
        userId = crypto.randomUUID();
        await client.query(
          `INSERT INTO users(id, email, email_normalized, password_hash, name, status, email_verified_at)
           VALUES ($1,$2,$3,$4,$5,'ACTIVE',NOW())`,
          [
            userId,
            invitation.email,
            invitation.email_normalized,
            hashPassword(input.password),
            input.name || null,
          ],
        );
      }

      await client.query(
        `INSERT INTO organization_users(organization_id, user_id, status, joined_at)
         VALUES ($1,$2,'ACTIVE',NOW())
         ON CONFLICT (organization_id, user_id) DO UPDATE SET status='ACTIVE', updated_at=NOW()`,
        [invitation.organization_id, userId],
      );
      const role = await client.query<{id: string}>(`SELECT id FROM roles WHERE code=$1`, [invitation.role_code]);
      if (!role.rows[0]) throw new AppError('ROLE_CATALOG_MISSING', 'Role missing', 500);
      await client.query(
        `INSERT INTO user_roles(user_id, role_id, organization_id)
         SELECT $1,$2,$3
         WHERE NOT EXISTS (
           SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2 AND organization_id IS NOT DISTINCT FROM $3
         )`,
        [userId, role.rows[0].id, invitation.organization_id],
      );

      await client.query(
        `UPDATE organization_invitations
         SET status='ACCEPTED', accepted_at=NOW(), accepted_user_id=$2, updated_at=NOW()
         WHERE id=$1`,
        [invitation.id, userId],
      );
      await writeAuditEvent(
        {
          organizationId: invitation.organization_id,
          actorUserId: userId,
          action: 'invitation.accepted',
          resourceType: 'organization_invitation',
          resourceId: invitation.id,
        },
        client,
      );
      return {user_id: userId, organization_id: invitation.organization_id, role_code: invitation.role_code};
    });
  }

  async deactivateUser(organizationId: string, targetUserId: string, actorUserId: string) {
    if (targetUserId === actorUserId) throw conflict('Cannot deactivate yourself', 'CANNOT_DEACTIVATE_SELF');
    return withPgTransaction(async (client) => {
      const membership = await client.query(
        `SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2`,
        [organizationId, targetUserId],
      );
      if (!membership.rows[0]) throw notFound('Member not found', 'MEMBER_NOT_FOUND');
      await client.query(
        `UPDATE organization_users SET status='DISABLED', updated_at=NOW()
         WHERE organization_id=$1 AND user_id=$2`,
        [organizationId, targetUserId],
      );
      await client.query(
        `UPDATE sessions SET revoked_at=NOW()
         WHERE user_id=$1 AND organization_id=$2 AND revoked_at IS NULL`,
        [targetUserId, organizationId],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId,
          action: 'user.deactivated',
          resourceType: 'user',
          resourceId: targetUserId,
        },
        client,
      );
      await writeSecurityEvent(
        {organizationId, userId: actorUserId, eventType: 'user.deactivated', metadata: {target_user_id: targetUserId}},
        client,
      );
      return {user_id: targetUserId, status: 'DISABLED'};
    });
  }

  async beginStepUp(
    userId: string,
    organizationId: string | null,
    totp: string,
    purpose = 'SENSITIVE',
  ) {
    const user = await pgQuery<{mfa_enabled: boolean; mfa_secret_encrypted: string | null}>(
      `SELECT mfa_enabled, mfa_secret_encrypted FROM users WHERE id=$1 AND status='ACTIVE'`,
      [userId],
    );
    const u = user.rows[0];
    if (!u?.mfa_enabled || !u.mfa_secret_encrypted) {
      throw forbidden('MFA must be enabled for step-up authentication', 'MFA_REQUIRED_FOR_STEP_UP');
    }
    const {decryptSecret} = await import('./crypto.js');
    if (!verifyTotp(decryptSecret(u.mfa_secret_encrypted), totp)) {
      await writeSecurityEvent({
        organizationId,
        userId,
        eventType: 'step_up.failed',
        success: false,
      });
      throw unauthorized('Invalid MFA code', 'INVALID_MFA_CODE');
    }
    const safePurpose = String(purpose || 'SENSITIVE').slice(0, 120);
    const token = randomToken(32);
    await withPgTransaction(async (client) => {
      await client.query(
        `INSERT INTO step_up_tokens(user_id, organization_id, token_hash, purpose, expires_at)
         VALUES ($1,$2,$3,$4, NOW() + ($5 || ' minutes')::interval)`,
        [userId, organizationId, hashToken(token), safePurpose, String(config.stepUpTtlMinutes)],
      );
      await writeSecurityEvent({organizationId, userId, eventType: 'step_up.succeeded'}, client);
    });
    return {step_up_token: token, expires_in_seconds: config.stepUpTtlMinutes * 60, purpose: safePurpose};
  }

  async consumeStepUpToken(
    userId: string,
    token: string,
    requiredPurpose = 'SENSITIVE',
    organizationId: string | null = null,
  ) {
    return withPgTransaction(async (client) => {
      const row = await client.query<{id: string; purpose: string; organization_id: string | null}>(
        `SELECT id, purpose, organization_id FROM step_up_tokens
         WHERE token_hash=$1 AND user_id=$2 AND consumed_at IS NULL AND expires_at > NOW()
         FOR UPDATE`,
        [hashToken(token), userId],
      );
      if (!row.rows[0]) throw forbidden('Valid step-up token required', 'STEP_UP_REQUIRED');
      const stored = row.rows[0];
      const needed = requiredPurpose || 'SENSITIVE';
      // Exact purpose match, or legacy generic purpose 'SENSITIVE' (one-time wildcard).
      if (stored.purpose !== needed && stored.purpose !== 'SENSITIVE') {
        throw forbidden('Step-up token purpose mismatch', 'STEP_UP_PURPOSE_MISMATCH');
      }
      if (
        organizationId &&
        stored.organization_id &&
        stored.organization_id !== organizationId
      ) {
        throw forbidden('Step-up token organization mismatch', 'STEP_UP_ORG_MISMATCH');
      }
      await client.query(`UPDATE step_up_tokens SET consumed_at=NOW() WHERE id=$1`, [stored.id]);
      return true;
    });
  }

  async assertEmailVerifiedForLogin(userId: string, emailVerifiedAt: Date | null) {
    if (!config.requireEmailVerification) return;
    if (!emailVerifiedAt) {
      throw forbidden('Email verification is required before login', 'EMAIL_NOT_VERIFIED');
    }
    void userId;
  }
}

export const identityPhase2 = new IdentityPhase2Service();
