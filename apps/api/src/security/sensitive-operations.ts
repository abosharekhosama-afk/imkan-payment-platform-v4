/**
 * P15.0 — sensitive operations registry (canonical import path).
 * Re-exports foundation catalog so routes share one SoT.
 */
export {
  SENSITIVE_OPERATIONS,
  sensitiveOpRequiresStepUp,
  type SensitiveOp,
} from '../foundation/sensitive-operations.js';
