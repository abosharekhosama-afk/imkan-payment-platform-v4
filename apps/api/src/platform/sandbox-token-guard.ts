import {AppError} from '../foundation/errors.js';
import {allowSandboxPaymentTokens, isSandboxPaymentToken} from './runtime-config.js';

/** Reject magic sandbox tokens when production UX disallows them (P16). */
export function assertProductionPaymentMethodAllowed(token: string | undefined | null): void {
  if (!token) return;
  if (!isSandboxPaymentToken(token)) return;
  if (allowSandboxPaymentTokens()) return;
  throw new AppError(
    'SANDBOX_TOKEN_FORBIDDEN',
    'Sandbox payment method tokens are not allowed in this deployment. Use a hosted payment method or provider token.',
    400,
    {production_mode: true},
  );
}
