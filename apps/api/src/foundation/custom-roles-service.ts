import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, forbidden, notFound} from './errors.js';
import {writeAuditEvent} from './audit.js';
import {
  isPermissionSubset,
  MERCHANT_SYSTEM_ROLES,
  PERMISSIONS,
  PLATFORM_SYSTEM_ROLES,
} from './permissions-catalog.js';

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'custom'
  );
}

function isMerchantSystemRole(code: string): boolean {
  return (MERCHANT_SYSTEM_ROLES as readonly string[]).includes(code);
}

function isPlatformSystemRole(code: string): boolean {
  return (PLATFORM_SYSTEM_ROLES as readonly string[]).includes(code);
}

/** Permissions that must never appear on merchant custom roles. */
function assertMerchantAssignablePermissions(permissions: string[]) {
  for (const p of permissions) {
    if (
      p.startsWith('platform.') ||
      p === PERMISSIONS.KYB_REVIEW ||
      p === PERMISSIONS.BANK_REVIEW ||
      p === PERMISSIONS.MASTERDATA_MANAGE
    ) {
      throw forbidden('Platform permissions cannot be assigned to merchant custom roles', 'PLATFORM_PERM_DENIED');
    }
  }
}

async function rolePermissionCodes(
  roleId: string,
  queryFn: (sql: string, params?: unknown[]) => Promise<{rows: Array<{code: string}>}>,
): Promise<string[]> {
  const perms = await queryFn(
    `SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1`,
    [roleId],
  );
  return perms.rows.map((x) => x.code);
}

export const customRolesService = {
  async list(organizationId: string) {
    const system = await pgQuery(
      `SELECT r.id, r.code, r.name, r.scope, r.is_system, r.description, r.organization_id,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.scope='MERCHANT' AND r.organization_id IS NULL AND r.is_system=TRUE
       GROUP BY r.id
       ORDER BY r.code`,
    );
    const custom = await pgQuery(
      `SELECT r.id, r.code, r.name, r.scope, r.is_system, r.description, r.organization_id,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.organization_id=$1 AND r.is_system=FALSE
       GROUP BY r.id
       ORDER BY r.name`,
      [organizationId],
    );
    return {system_roles: system.rows, custom_roles: custom.rows};
  },

  async create(input: {
    organizationId: string;
    actorUserId: string;
    actorPermissions: string[];
    name: string;
    description?: string;
    permissions: string[];
    requestId?: string;
  }) {
    if (!input.permissions.length) {
      throw new AppError('ROLE_PERMISSIONS_REQUIRED', 'At least one permission is required', 400);
    }
    if (!isPermissionSubset(input.actorPermissions, input.permissions)) {
      throw forbidden(
        'Cannot grant permissions you do not hold (permission escalation denied)',
        'PERMISSION_ESCALATION',
      );
    }
    assertMerchantAssignablePermissions(input.permissions);

    const code = `custom_${slugify(input.name)}`;
    return withPgTransaction(async (client) => {
      const exists = await client.query(`SELECT id FROM roles WHERE organization_id=$1 AND code=$2`, [
        input.organizationId,
        code,
      ]);
      if (exists.rows[0]) throw new AppError('ROLE_EXISTS', 'A custom role with this name already exists', 409);

      const role = await client.query(
        `INSERT INTO roles (code, name, scope, description, is_system, organization_id)
         VALUES ($1,$2,'MERCHANT',$3,FALSE,$4)
         RETURNING *`,
        [code, input.name.trim(), input.description || null, input.organizationId],
      );

      for (const perm of input.permissions) {
        const pr = await client.query(`SELECT id FROM permissions WHERE code=$1`, [perm]);
        if (!pr.rows[0]) throw new AppError('PERMISSION_UNKNOWN', `Unknown permission: ${perm}`, 400);
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [role.rows[0].id, pr.rows[0].id],
        );
      }

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'role.custom.created',
          resourceType: 'role',
          resourceId: role.rows[0].id,
          after: {code, name: input.name, permissions: input.permissions},
          requestId: input.requestId,
        },
        client,
      );

      return {id: role.rows[0].id, code, name: input.name.trim(), permissions: input.permissions};
    });
  },

  async updatePermissions(input: {
    organizationId: string;
    roleId: string;
    actorUserId: string;
    actorPermissions: string[];
    permissions: string[];
    requestId?: string;
  }) {
    if (!isPermissionSubset(input.actorPermissions, input.permissions)) {
      throw forbidden(
        'Cannot grant permissions you do not hold (permission escalation denied)',
        'PERMISSION_ESCALATION',
      );
    }
    return withPgTransaction(async (client) => {
      const role = await client.query(
        `SELECT * FROM roles WHERE id=$1 AND organization_id=$2 AND is_system=FALSE`,
        [input.roleId, input.organizationId],
      );
      if (!role.rows[0]) throw notFound('Custom role not found', 'ROLE_NOT_FOUND');

      assertMerchantAssignablePermissions(input.permissions);
      await client.query(`DELETE FROM role_permissions WHERE role_id=$1`, [input.roleId]);
      for (const perm of input.permissions) {
        const pr = await client.query(`SELECT id FROM permissions WHERE code=$1`, [perm]);
        if (!pr.rows[0]) throw new AppError('PERMISSION_UNKNOWN', `Unknown permission: ${perm}`, 400);
        await client.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)`, [
          input.roleId,
          pr.rows[0].id,
        ]);
      }

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'role.custom.updated',
          resourceType: 'role',
          resourceId: input.roleId,
          after: {permissions: input.permissions},
          requestId: input.requestId,
        },
        client,
      );
      return {id: input.roleId, permissions: input.permissions};
    });
  },

  async remove(input: {organizationId: string; roleId: string; actorUserId: string; requestId?: string}) {
    return withPgTransaction(async (client) => {
      const role = await client.query(
        `SELECT * FROM roles WHERE id=$1 AND organization_id=$2 AND is_system=FALSE`,
        [input.roleId, input.organizationId],
      );
      if (!role.rows[0]) throw notFound('Custom role not found', 'ROLE_NOT_FOUND');
      const assigned = await client.query(`SELECT 1 FROM user_roles WHERE role_id=$1 LIMIT 1`, [input.roleId]);
      if (assigned.rows[0]) {
        throw new AppError('ROLE_IN_USE', 'Cannot delete a role that is still assigned', 409);
      }
      await client.query(`DELETE FROM roles WHERE id=$1`, [input.roleId]);
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'role.custom.deleted',
          resourceType: 'role',
          resourceId: input.roleId,
          requestId: input.requestId,
        },
        client,
      );
      return {deleted: true};
    });
  },

  async assignUserRole(input: {
    organizationId: string;
    userId: string;
    roleCode: string;
    actorUserId: string;
    actorPermissions: string[];
    actorRoles?: string[];
    requestId?: string;
  }) {
    if (isPlatformSystemRole(input.roleCode)) {
      throw forbidden('Cannot assign platform roles via merchant API', 'PLATFORM_ROLE_ASSIGN_DENIED');
    }

    return withPgTransaction(async (client) => {
      const membership = await client.query(
        `SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
        [input.organizationId, input.userId],
      );
      if (!membership.rows[0]) throw notFound('User is not an active organization member', 'MEMBER_NOT_FOUND');

      let roleId: string;
      if (isMerchantSystemRole(input.roleCode)) {
        // Ownership transfer is not via assign-role; only existing owners (or platform.admin) may assign OWNER.
        if (input.roleCode === 'MERCHANT_OWNER') {
          const actorIsOwner = (input.actorRoles || []).includes('MERCHANT_OWNER');
          const actorIsPlatformAdmin = input.actorPermissions.includes(PERMISSIONS.PLATFORM_ADMIN);
          if (!actorIsOwner && !actorIsPlatformAdmin) {
            throw forbidden(
              'Only MERCHANT_OWNER can assign the owner role (use ownership transfer flow when available)',
              'OWNER_ASSIGN_DENIED',
            );
          }
        }
        const r = await client.query(
          `SELECT id FROM roles WHERE code=$1 AND organization_id IS NULL AND scope='MERCHANT'`,
          [input.roleCode],
        );
        if (!r.rows[0]) throw notFound('Role not found', 'ROLE_NOT_FOUND');
        roleId = r.rows[0].id;
        const codes = await rolePermissionCodes(roleId, (sql, params) => client.query(sql, params));
        if (!isPermissionSubset(input.actorPermissions, codes)) {
          throw forbidden('Cannot assign a role with permissions you do not hold', 'PERMISSION_ESCALATION');
        }
      } else {
        const r = await client.query(
          `SELECT id FROM roles WHERE code=$1 AND organization_id=$2 AND is_system=FALSE`,
          [input.roleCode, input.organizationId],
        );
        if (!r.rows[0]) throw notFound('Custom role not found', 'ROLE_NOT_FOUND');
        roleId = r.rows[0].id;
        const codes = await rolePermissionCodes(roleId, (sql, params) => client.query(sql, params));
        if (!isPermissionSubset(input.actorPermissions, codes)) {
          throw forbidden('Cannot assign a role with permissions you do not hold', 'PERMISSION_ESCALATION');
        }
      }

      await client.query(
        `DELETE FROM user_roles ur
         USING roles r
         WHERE ur.role_id=r.id AND ur.user_id=$1 AND ur.organization_id=$2 AND r.scope='MERCHANT'`,
        [input.userId, input.organizationId],
      );
      await client.query(`INSERT INTO user_roles (user_id, role_id, organization_id) VALUES ($1,$2,$3)`, [
        input.userId,
        roleId,
        input.organizationId,
      ]);

      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'role.assigned',
          resourceType: 'user',
          resourceId: input.userId,
          after: {role_code: input.roleCode},
          requestId: input.requestId,
        },
        client,
      );
      return {user_id: input.userId, role_code: input.roleCode};
    });
  },
};
