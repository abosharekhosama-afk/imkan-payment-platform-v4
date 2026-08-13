/**
 * Bank of Palestine Gateway adapter (DISCOVERED).
 * Money operations stay NOT_AVAILABLE until private HPP docs + sandbox credentials.
 * Do not invent success. LIVE remains blocked until DEC-009.
 */
import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderOperationResult,
  WebhookVerificationResult,
} from '../adapter.js';

const CODE = 'bop';

function unavailable(op: string): ProviderOperationResult {
  return {
    status: 'NOT_AVAILABLE',
    providerCode: CODE,
    failureCode: 'BOP_DOCS_PENDING',
    failureMessage: `${op} is not enabled until Bank of Palestine private API/HPP docs and sandbox credentials are received`,
  };
}

export class BopAdapter implements ProviderAdapter {
  readonly code = CODE;

  async authorize(): Promise<ProviderOperationResult> {
    return unavailable('authorize');
  }

  async capture(): Promise<ProviderOperationResult> {
    return unavailable('capture');
  }

  async voidPayment(): Promise<ProviderOperationResult> {
    return unavailable('void');
  }

  async refund(): Promise<ProviderOperationResult> {
    return unavailable('refund');
  }

  async getStatus(): Promise<ProviderOperationResult> {
    return unavailable('status');
  }

  async verifyWebhook(): Promise<WebhookVerificationResult> {
    return {valid: false, error: 'BOP webhook verification not implemented — awaiting provider docs'};
  }
}

export const bopAdapter = new BopAdapter();
