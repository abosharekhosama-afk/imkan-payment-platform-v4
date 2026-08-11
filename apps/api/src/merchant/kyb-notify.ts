import {pgQuery} from '../infrastructure/db/postgres.js';
import {config} from '../config.js';

/** Primary merchant contact email for KYB notifications (P16.3). */
export async function resolveOrganizationNotifyEmail(organizationId: string): Promise<string | null> {
  const r = await pgQuery<{email: string}>(
    `SELECT u.email
     FROM organization_users ou
     JOIN users u ON u.id = ou.user_id
     WHERE ou.organization_id=$1 AND ou.status='ACTIVE' AND u.email IS NOT NULL
     ORDER BY ou.created_at ASC
     LIMIT 1`,
    [organizationId],
  );
  return r.rows[0]?.email || null;
}

export function kybMerchantPortalUrl(): string {
  return `${config.appPublicUrl}/merchant/kyb`;
}
