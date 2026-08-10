/** RBAC helpers — UX only; backend remains authoritative. */
export {Can} from '../rbac/Can';
export {RequirePermission} from '../rbac/RequirePermission';
export {P, hasAnyPermission} from './catalog';

export function can(permissions: string[], ...required: string[]) {
  return hasAnyPermission(permissions, ...required);
}
