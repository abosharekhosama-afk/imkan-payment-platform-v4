import {AppError} from '../foundation/errors.js';

/** Unified provider error taxonomy (Phase 5). */
export type ProviderErrorClass =
  | 'RETRYABLE'
  | 'NON_RETRYABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION'
  | 'AMBIGUOUS'
  | 'CAPABILITY'
  | 'ENVIRONMENT'
  | 'DISABLED';

export class ProviderError extends AppError {
  errorClass: ProviderErrorClass;
  retryable: boolean;
  providerCode?: string;

  constructor(
    code: string,
    message: string,
    errorClass: ProviderErrorClass,
    statusCode = 502,
    opts?: {providerCode?: string; details?: unknown},
  ) {
    super(code, message, statusCode, opts?.details);
    this.errorClass = errorClass;
    this.retryable = errorClass === 'RETRYABLE' || errorClass === 'TIMEOUT' || errorClass === 'RATE_LIMITED';
    this.providerCode = opts?.providerCode;
  }
}

export function mapProviderFailure(input: {
  providerCode: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  httpStatus?: number;
}): ProviderError {
  const code = String(input.failureCode || 'PROVIDER_ERROR');
  const msg = String(input.failureMessage || 'Provider operation failed');
  if (code.includes('TIMEOUT') || input.httpStatus === 408 || input.httpStatus === 504) {
    return new ProviderError(code, msg, 'TIMEOUT', 504, {providerCode: input.providerCode});
  }
  if (code.includes('RATE') || input.httpStatus === 429) {
    return new ProviderError(code, msg, 'RATE_LIMITED', 429, {providerCode: input.providerCode});
  }
  if (code.includes('AUTH') || input.httpStatus === 401 || input.httpStatus === 403) {
    return new ProviderError(code, msg, 'AUTHENTICATION', 502, {providerCode: input.providerCode});
  }
  if (code.includes('AMBIGUOUS')) {
    return new ProviderError(code, msg, 'AMBIGUOUS', 409, {providerCode: input.providerCode});
  }
  return new ProviderError(code, msg, 'NON_RETRYABLE', 502, {providerCode: input.providerCode});
}

/** Ambiguous outcomes must query-before-retry — never blind re-charge. */
export function shouldQueryBeforeRetry(error: ProviderError): boolean {
  return error.errorClass === 'AMBIGUOUS' || error.errorClass === 'TIMEOUT';
}
