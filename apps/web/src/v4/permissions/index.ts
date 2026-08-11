/** RBAC helpers — UX only; backend remains authoritative. */
export {Can} from '../rbac/Can';
export {RequirePermission} from '../rbac/RequirePermission';
import {P, hasAnyPermission} from './catalog';
export {P, hasAnyPermission};

export function can(permissions: string[], ...required: string[]) {
  return hasAnyPermission(permissions, ...required);
}
