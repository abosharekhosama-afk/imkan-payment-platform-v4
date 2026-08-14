import {config} from '../config.js';
import {pgQuery, type PgClient} from '../infrastructure/db/postgres.js';
import {emitOutboxEvent} from './audit.js';
import {AppError} from './errors.js';

export type OrgContact = {
  organization_id: string;
  organization_name: string;
  support_email: string | null;
  support_phone: string | null;
};

type Queryable = {query: PgClient['query']};

async function exec<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[],
  client?: Queryable,
) {
  if (client) return client.query(sql, params) as Promise<{rows: T[]}>;
  return pgQuery<T>(sql, params);
}

export async function loadOrgContact(organizationId: string, client?: Queryable): Promise<OrgContact | null> {
  const r = await exec<OrgContact>(
    `SELECT o.id AS organization_id,
            o.name AS organization_name,
            mp.support_email,
            mp.support_phone
     FROM organizations o
     LEFT JOIN merchant_profiles mp ON mp.organization_id = o.id
     WHERE o.id=$1`,
    [organizationId],
    client,
  );
  return r.rows[0] || null;
}

export function membershipAccessError(
  kind: 'restricted' | 'closed',
  contact: OrgContact | null,
): AppError {
  const code = kind === 'restricted' ? 'MEMBERSHIP_RESTRICTED' : 'MEMBERSHIP_CLOSED';
  const message =
    kind === 'restricted'
      ? 'This membership is currently restricted'
      : 'This membership has been closed';
  return new AppError(code, message, 403, {
    kind,
    organization_id: contact?.organization_id || null,
    organization_name: contact?.organization_name || null,
    support_email: contact?.support_email || null,
    support_phone: contact?.support_phone || null,
  });
}

/** If the user cannot enter an org session, return the access error; otherwise null. */
export async function membershipBlockForUser(userId: string, client?: Queryable): Promise<AppError | null> {
  const active = await exec<{organization_id: string}>(
    `SELECT organization_id FROM organization_users
     WHERE user_id=$1 AND status='ACTIVE'
     ORDER BY joined_at NULLS LAST, created_at LIMIT 1`,
    [userId],
    client,
  );
  if (active.rows[0]) return null;

  const platform = await exec<{id: string}>(
    `SELECT ur.id FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id AND r.scope='PLATFORM'
     WHERE ur.user_id=$1 AND ur.organization_id IS NULL
     LIMIT 1`,
    [userId],
    client,
  );
  if (platform.rows[0]) return null;

  const disabled = await exec<{organization_id: string}>(
    `SELECT organization_id FROM organization_users
     WHERE user_id=$1 AND status='DISABLED'
     ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    [userId],
    client,
  );
  if (disabled.rows[0]) {
    const contact = await loadOrgContact(disabled.rows[0].organization_id, client);
    return membershipAccessError('restricted', contact);
  }

  return membershipAccessError('closed', null);
}

export async function notifyMembershipChange(input: {
  organizationId: string;
  targetUserId: string;
  kind: 'restricted' | 'closed';
  client?: Queryable;
}) {
  const user = await exec<{email: string; name: string | null}>(
    `SELECT email, name FROM users WHERE id=$1`,
    [input.targetUserId],
    input.client,
  );
  const u = user.rows[0];
  if (!u?.email) return;
  const contact = await loadOrgContact(input.organizationId, input.client);
  const loginUrl = `${String(config.appPublicUrl || '').replace(/\/$/, '')}/login`;
  await emitOutboxEvent(
        {
          organizationId: input.organizationId,
          eventType: input.kind === 'restricted' ? 'membership.restricted' : 'membership.closed',
          aggregateType: 'user',
          aggregateId: input.targetUserId,
          payload: {
            email: u.email,
            name: u.name,
            kind: input.kind,
            organization_name: contact?.organization_name || '',
            support_email: contact?.support_email || '',
            support_phone: contact?.support_phone || '',
            login_url: loginUrl,
          },
        },
        input.client as PgClient | undefined,
      );
}
