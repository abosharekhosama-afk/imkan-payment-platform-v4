/**
 * Copy this folder to apps/api/src/providers/<code>/ then implement each file.
 * Register the adapter in registry.ts. Do not invent SUCCESS for unimplemented ops.
 */
import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderOperationResult,
  WebhookVerificationResult,
} from '../adapter.js';

const CODE = 'template';

function unavailable(op: string): ProviderOperationResult {
  return {
    status: 'NOT_AVAILABLE',
    providerCode: CODE,
    failureCode: 'ADAPTER_TEMPLATE',
    failureMessage: `${op} is not implemented — copy this template and fill in provider docs`,
  };
}

export class TemplateAdapter implements ProviderAdapter {
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
  async verifyWebhook(_input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    environment: ProviderEnvironment;
    webhookSecret?: string;
  }): Promise<WebhookVerificationResult> {
    return {valid: false, error: 'Template adapter is not registered — copy to a real provider folder'};
  }
}
