/** Turn Zod / AppError text into a message safe to show merchants and store in error reports. */

const FIELD_LABELS: Record<string, string> = {
  totp: 'Authenticator code',
  email: 'Email',
  password: 'Password',
  name: 'Name',
  amount_minor: 'Amount',
  currency_code: 'Currency',
  organization_id: 'Organization',
  organizationId: 'Organization',
  payment_intent_id: 'Payment',
  reason: 'Reason',
  role_code: 'Role',
};

function fieldLabel(path: string): string {
  if (!path || path === 'request') return '';
  const last = path.split('.').filter(Boolean).pop() || path;
  return FIELD_LABELS[last] || last.replace(/_/g, ' ');
}

export function humanizeZodIssues(issues: Array<{path?: (string | number)[]; message?: string; code?: string; validation?: string}>): string {
  if (!issues?.length) return 'Some fields are invalid. Please review and try again.';
  return issues
    .map((issue) => {
      const path = (issue.path || []).join('.');
      const label = fieldLabel(path);
      const msg = String(issue.message || '');
      if (path === 'totp' || /totp/i.test(path)) {
        return 'Authenticator code must be 6 digits.';
      }
      if (/uuid/i.test(msg) || issue.validation === 'uuid') {
        return label ? `${label} is not valid.` : 'A required identifier is not valid.';
      }
      if (issue.code === 'too_small' || /at least|too small/i.test(msg)) {
        return label ? `${label} is too short.` : 'A required field is too short.';
      }
      if (issue.code === 'invalid_type' || /required|expected/i.test(msg)) {
        return label ? `${label} is required.` : 'A required field is missing.';
      }
      if (/regex|pattern/i.test(msg) || issue.validation === 'regex') {
        return label ? `${label} is not in the correct format.` : 'A field is not in the correct format.';
      }
      if (/invalid email/i.test(msg) || issue.validation === 'email') {
        return 'Enter a valid email address.';
      }
      return label ? `${label}: ${msg}` : msg;
    })
    .filter(Boolean)
    .join(' ');
}

export function humanizeErrorCode(code: string | null | undefined): string {
  const c = String(code || '').trim();
  if (!c) return 'Error';
  const map: Record<string, string> = {
    INTERNAL_ERROR: 'Something went wrong. Please try again.',
    VALIDATION_ERROR: 'Some details are invalid. Please review and try again.',
    AUTHENTICATION_REQUIRED: 'Sign-in required',
    INVALID_CREDENTIALS: 'Incorrect email or password',
    INVALID_MFA_CODE: 'Incorrect authenticator code',
    INVALID_MFA_CHALLENGE: 'Authenticator step expired. Sign in again.',
    ACCOUNT_LOCKED: 'Account temporarily locked',
    ACCOUNT_DISABLED: 'Account access is restricted',
    MEMBERSHIP_RESTRICTED: 'Access to this company is restricted',
    MEMBERSHIP_CLOSED: 'This company membership is closed',
    CSRF_INVALID: 'Session expired. Refresh the page and try again.',
    FORBIDDEN: 'You do not have permission for this action',
    NOT_FOUND: 'The requested item was not found',
    CONFLICT: 'This change could not be completed',
    RATE_LIMITED: 'Too many attempts. Please wait and try again.',
    STEP_UP_REQUIRED: 'Confirm with your authenticator code',
    MFA_REQUIRED_FOR_STEP_UP: 'Turn on authenticator before this action',
    INVALID_SESSION: 'Your session expired. Please sign in again.',
  };
  return map[c] || c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}
