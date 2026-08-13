import crypto from 'node:crypto';
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {writeAuditEvent, writeSecurityEvent} from './audit.js';
import {conflict, forbidden, notFound} from './errors.js';
import {provisionMfaAndEmail} from './mfa-provision.js';

export const mfaTotpRequestService = {
  async createRequest(input: {
    userId: string;
    organizationId?: string | null;
    reason?: string;
  }) {
    const pending = await pgQuery(
      `SELECT id FROM mfa_totp_requests WHERE user_id=$1 AND status='PENDING' LIMIT 1`,
      [input.userId],
    );
    if (pending.rows[0]) {
      throw conflict('A TOTP request is already pending platform approval', 'MFA_REQUEST_PENDING');
    }

    const user = await pgQuery<{email: string; name: string | null}>(
      `SELECT email, name FROM users WHERE id=$1`,
      [input.userId],
    );
    if (!user.rows[0]) throw notFound('User not found', 'USER_NOT_FOUND');

    return withPgTransaction(async (client) => {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO mfa_totp_requests(id, user_id, organization_id, reason, status)
         VALUES ($1,$2,$3,$4,'PENDING')`,
        [id, input.userId, input.organizationId || null, input.reason?.trim() || null],
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId || null,
          actorUserId: input.userId,
          action: 'mfa.totp_request.created',
          resourceType: 'mfa_totp_request',
          resourceId: id,
        },
        client,
      );
      await writeSecurityEvent(
        {
          organizationId: input.organizationId || null,
          userId: input.userId,
          eventType: 'mfa.totp_request.created',
          metadata: {request_id: id},
        },
        client,
      );
      return {id, status: 'PENDING' as const};
    });
  },

  async listRequests(filter: {status?: string; limit: number; offset: number}) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (filter.status) {
      params.push(filter.status);
      where.push(`r.status=$${params.length}`);
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT r.id, r.user_id, r.organization_id, r.reason, r.status, r.requested_at,
              r.reviewed_by_user_id, r.reviewed_at, r.review_note,
              u.email AS user_email, u.name AS user_name,
              o.name AS organization_name,
              ru.email AS reviewer_email, ru.name AS reviewer_name
       FROM mfa_totp_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN organizations o ON o.id = r.organization_id
       LEFT JOIN users ru ON ru.id = r.reviewed_by_user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.requested_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows;
  },

  async approve(requestId: string, actorUserId: string, note?: string) {
    return withPgTransaction(async (client) => {
      const row = await client.query<{
        id: string;
        user_id: string;
        organization_id: string | null;
        status: string;
      }>(`SELECT id, user_id, organization_id, status FROM mfa_totp_requests WHERE id=$1 FOR UPDATE`, [requestId]);
      const req = row.rows[0];
      if (!req) throw notFound('TOTP request not found', 'MFA_REQUEST_NOT_FOUND');
      if (req.status !== 'PENDING') throw conflict('Request is not pending', 'MFA_REQUEST_NOT_PENDING');

      const user = await client.query<{email: string; name: string | null}>(
        `SELECT email, name FROM users WHERE id=$1`,
        [req.user_id],
      );
      if (!user.rows[0]) throw notFound('User not found', 'USER_NOT_FOUND');

      await provisionMfaAndEmail(client, {
        userId: req.user_id,
        email: user.rows[0].email,
        name: user.rows[0].name,
        organizationId: req.organization_id,
        reason: 'platform_approved_resend',
        actorUserId,
        idempotencySuffix: requestId,
      });

      await client.query(
        `UPDATE mfa_totp_requests
         SET status='APPROVED', reviewed_by_user_id=$2, reviewed_at=NOW(),
             review_note=$3, updated_at=NOW()
         WHERE id=$1`,
        [requestId, actorUserId, note?.trim() || null],
      );
      await writeAuditEvent(
        {
          organizationId: req.organization_id,
          actorUserId,
          action: 'mfa.totp_request.approved',
          resourceType: 'mfa_totp_request',
          resourceId: requestId,
          metadata: {target_user_id: req.user_id},
        },
        client,
      );
      return {id: requestId, status: 'APPROVED' as const};
    });
  },

  async deny(requestId: string, actorUserId: string, note?: string) {
    return withPgTransaction(async (client) => {
      const row = await client.query<{id: string; user_id: string; organization_id: string | null; status: string}>(
        `SELECT id, user_id, organization_id, status FROM mfa_totp_requests WHERE id=$1 FOR UPDATE`,
        [requestId],
      );
      const req = row.rows[0];
      if (!req) throw notFound('TOTP request not found', 'MFA_REQUEST_NOT_FOUND');
      if (req.status !== 'PENDING') throw conflict('Request is not pending', 'MFA_REQUEST_NOT_PENDING');

      await client.query(
        `UPDATE mfa_totp_requests
         SET status='DENIED', reviewed_by_user_id=$2, reviewed_at=NOW(),
             review_note=$3, updated_at=NOW()
         WHERE id=$1`,
        [requestId, actorUserId, note?.trim() || null],
      );
      await writeAuditEvent(
        {
          organizationId: req.organization_id,
          actorUserId,
          action: 'mfa.totp_request.denied',
          resourceType: 'mfa_totp_request',
          resourceId: requestId,
          metadata: {target_user_id: req.user_id},
        },
        client,
      );
      await writeSecurityEvent(
        {
          organizationId: req.organization_id,
          userId: actorUserId,
          eventType: 'mfa.totp_request.denied',
          metadata: {request_id: requestId, target_user_id: req.user_id},
        },
        client,
      );
      return {id: requestId, status: 'DENIED' as const};
    });
  },
};
