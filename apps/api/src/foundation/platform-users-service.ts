import crypto from 'node:crypto';
import {config} from '../config.js';
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {emitOutboxEvent, writeAuditEvent, writeSecurityEvent} from './audit.js';
import {hashPassword, hashToken, randomToken} from './crypto.js';
import {AppError, conflict, forbidden, notFound, unauthorized} from './errors.js';
import {provisionMfaAndEmail} from './mfa-provision.js';

const PLATFORM_ROLES = new Set(['PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_FINANCE']);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function emailActionUrl(path: string, token: string): string {
  return `${config.appPublicUrl}${path}?token=${encodeURIComponent(token)}`;
}

function maybeDevToken(token: string) {
  return config.exposeDevTokens ? {token} : {};
}

export const platformUsersService = {
  /** Users holding any PLATFORM_* role (organization_id IS NULL). */
  async listPlatformUsers() {
    const r = await pgQuery(
      `SELECT u.id, u.email, u.name, u.status, u.email_verified_at, u.mfa_enabled,
              COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id IS NULL
       JOIN roles r ON r.id = ur.role_id AND r.scope = 'PLATFORM'
       GROUP BY u.id, u.email, u.name, u.status, u.email_verified_at, u.mfa_enabled
       ORDER BY u.email`,
    );
    return r.rows;
  },

  async listInvitations() {
    const r = await pgQuery(
      `SELECT id, email, role_code, status, expires_at, accepted_at, created_at
       FROM platform_invitations
       ORDER BY created_at DESC
       LIMIT 100`,
    );
    return r.rows;
  },

  async createInvitation(input: {email: string; roleCode: string; actorUserId: string; requestId?: string}) {
    if (!PLATFORM_ROLES.has(input.roleCode)) {
      throw new AppError('INVALID_ROLE', 'Invitation role must be a platform role.', 400);
    }
    const emailNormalized = normalizeEmail(input.email);
    const token = randomToken(32);
    return withPgTransaction(async (client) => {
      const existingUser = await client.query(
        `SELECT 1 FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id IS NULL
         JOIN roles r ON r.id = ur.role_id AND r.scope = 'PLATFORM'
         WHERE u.email_normalized=$1`,
        [emailNormalized],
      );
      if (existingUser.rows[0]) throw conflict('User is already a platform member', 'ALREADY_PLATFORM_MEMBER');

      await client.query(
        `UPDATE platform_invitations SET status='REVOKED', updated_at=NOW()
         WHERE email_normalized=$1 AND status='PENDING'`,
        [emailNormalized],
      );

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO platform_invitations(
           id, email, email_normalized, role_code, token_hash, status, invited_by_user_id, expires_at
         ) VALUES ($1,$2,$3,$4,$5,'PENDING',$6, NOW() + ($7 || ' hours')::interval)`,
        [id, input.email.trim(), emailNormalized, input.roleCode, hashToken(token), input.actorUserId, String(config.invitationTtlHours)],
      );
      await emitOutboxEvent(
        {
          organizationId: null,
          eventType: 'platform.invitation.created',
          aggregateType: 'platform_invitation',
          aggregateId: id,
          payload: {
            invitation_id: id,
            email: emailNormalized,
            role_code: input.roleCode,
            action_url: emailActionUrl('/accept-invitation', token),
          },
          idempotencyKey: `platform.invitation.created:${id}`,
        },
        client,
      );
      await writeAuditEvent(
        {
          organizationId: null,
          actorUserId: input.actorUserId,
          action: 'platform.invitation.created',
          resourceType: 'platform_invitation',
          resourceId: id,
          requestId: input.requestId,
          after: {email: emailNormalized, role_code: input.roleCode},
        },
        client,
      );
      return {id, email: input.email.trim(), role_code: input.roleCode, status: 'PENDING', ...maybeDevToken(token)};
    });
  },

  async revokeInvitation(invitationId: string, actorUserId: string) {
    return withPgTransaction(async (client) => {
      const row = await client.query<{id: string; status: string}>(
        `SELECT id, status FROM platform_invitations WHERE id=$1`,
        [invitationId],
      );
      if (!row.rows[0]) throw notFound('Invitation not found', 'INVITATION_NOT_FOUND');
      if (row.rows[0].status !== 'PENDING') throw conflict('Invitation is not pending', 'INVITATION_NOT_PENDING');
      await client.query(`UPDATE platform_invitations SET status='REVOKED', updated_at=NOW() WHERE id=$1`, [invitationId]);
      await writeAuditEvent(
        {
          organizationId: null,
          actorUserId,
          action: 'platform.invitation.revoked',
          resourceType: 'platform_invitation',
          resourceId: invitationId,
        },
        client,
      );
      return {id: invitationId, status: 'REVOKED'};
    });
  },

  /** Accept a platform invitation. Returns null when the token is not a platform invitation. */
  async acceptInvitation(token: string, input: {password?: string; name?: string; existingUserId?: string}) {
    return withPgTransaction(async (client) => {
      const inv = await client.query<{
        id: string;
        email: string;
        email_normalized: string;
        role_code: string;
      }>(
        `SELECT id, email, email_normalized, role_code
         FROM platform_invitations
         WHERE token_hash=$1 AND status='PENDING' AND expires_at > NOW()`,
        [hashToken(token)],
      );
      const invitation = inv.rows[0];
      if (!invitation) return null;

      let userId = input.existingUserId || null;
      if (userId) {
        const u = await client.query<{email_normalized: string}>(`SELECT email_normalized FROM users WHERE id=$1`, [userId]);
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
          [userId, invitation.email, invitation.email_normalized, hashPassword(input.password), input.name || null],
        );
        await provisionMfaAndEmail(client, {
          userId,
          email: invitation.email,
          name: input.name || null,
          organizationId: null,
          reason: 'invitation_accepted',
          actorUserId: userId,
        });
      }

      const role = await client.query<{id: string}>(
        `SELECT id FROM roles WHERE code=$1 AND scope='PLATFORM' AND organization_id IS NULL`,
        [invitation.role_code],
      );
      if (!role.rows[0]) throw new AppError('ROLE_CATALOG_MISSING', 'Platform role missing', 500);
      await client.query(
        `INSERT INTO user_roles(user_id, role_id, organization_id)
         SELECT $1,$2,NULL
         WHERE NOT EXISTS (
           SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2 AND organization_id IS NULL
         )`,
        [userId, role.rows[0].id],
      );
      await client.query(
        `UPDATE platform_invitations
         SET status='ACCEPTED', accepted_at=NOW(), accepted_user_id=$2, updated_at=NOW()
         WHERE id=$1`,
        [invitation.id, userId],
      );
      await writeAuditEvent(
        {
          organizationId: null,
          actorUserId: userId,
          action: 'platform.invitation.accepted',
          resourceType: 'platform_invitation',
          resourceId: invitation.id,
        },
        client,
      );
      await writeSecurityEvent({userId, eventType: 'platform.invitation.accepted'}, client);
      return {user_id: userId, role_code: invitation.role_code, account_type: 'platform'};
    });
  },

  /**
   * Bootstrap the first platform owner (idempotent by email).
   * Creates a platform-only user (no merchant organization, no KYB).
   */
  async ensurePlatformOwner(email: string, password: string, name?: string) {
    const emailNormalized = normalizeEmail(email);
    if (password.length < 10) throw new AppError('WEAK_PASSWORD', 'Password must be at least 10 characters.', 400);
    return withPgTransaction(async (client) => {
      const role = await client.query<{id: string}>(
        `SELECT id FROM roles WHERE code='PLATFORM_OWNER' AND scope='PLATFORM' AND organization_id IS NULL`,
      );
      if (!role.rows[0]) throw new AppError('ROLE_CATALOG_MISSING', 'RBAC seed missing PLATFORM_OWNER', 500);

      let user = await client.query<{id: string}>(`SELECT id FROM users WHERE email_normalized=$1`, [emailNormalized]);
      let userId = user.rows[0]?.id;
      let created = false;
      if (!userId) {
        userId = crypto.randomUUID();
        await client.query(
          `INSERT INTO users(id, email, email_normalized, password_hash, name, status, email_verified_at)
           VALUES ($1,$2,$3,$4,$5,'ACTIVE',NOW())`,
          [userId, email.trim(), emailNormalized, hashPassword(password), name || 'Platform Owner'],
        );
        created = true;
      }
      await client.query(
        `INSERT INTO user_roles(user_id, role_id, organization_id)
         SELECT $1,$2,NULL
         WHERE NOT EXISTS (
           SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2 AND organization_id IS NULL
         )`,
        [userId, role.rows[0].id],
      );
      return {user_id: userId, email: email.trim(), role_code: 'PLATFORM_OWNER', created};
    });
  },

  async deactivatePlatformUser(targetUserId: string, actorUserId: string) {
    if (targetUserId === actorUserId) throw conflict('Cannot deactivate yourself', 'CANNOT_DEACTIVATE_SELF');
    return withPgTransaction(async (client) => {
      const membership = await client.query(
        `SELECT r.code FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.scope='PLATFORM'
         WHERE ur.user_id=$1 AND ur.organization_id IS NULL`,
        [targetUserId],
      );
      if (!membership.rows[0]) throw notFound('Platform member not found', 'PLATFORM_MEMBER_NOT_FOUND');
      if (membership.rows.some((r: {code: string}) => r.code === 'PLATFORM_OWNER')) {
        throw forbidden('Cannot deactivate the platform owner', 'CANNOT_DEACTIVATE_PLATFORM_OWNER');
      }
      await client.query(`UPDATE users SET status='DISABLED', updated_at=NOW() WHERE id=$1`, [targetUserId]);
      await client.query(`UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, [targetUserId]);
      await writeAuditEvent(
        {
          organizationId: null,
          actorUserId,
          action: 'platform.user.deactivated',
          resourceType: 'user',
          resourceId: targetUserId,
        },
        client,
      );
      await writeSecurityEvent(
        {userId: actorUserId, eventType: 'platform.user.deactivated', metadata: {target_user_id: targetUserId}},
        client,
      );
      const target = await client.query<{email: string; name: string | null}>(
        `SELECT email, name FROM users WHERE id=$1`,
        [targetUserId],
      );
      const tu = target.rows[0];
      if (tu?.email) {
        await emitOutboxEvent(
          {
            organizationId: null,
            eventType: 'membership.restricted',
            aggregateType: 'user',
            aggregateId: targetUserId,
            payload: {
              email: tu.email,
              name: tu.name,
              kind: 'restricted',
              organization_name: 'IMKAN Platform',
              support_email: process.env.PLATFORM_SUPPORT_EMAIL || '',
              support_phone: '',
              login_url: `${String(config.appPublicUrl || '').replace(/\/$/, '')}/login`,
            },
          },
          client,
        );
      }
      return {user_id: targetUserId, status: 'DISABLED'};
    });
  },
};
