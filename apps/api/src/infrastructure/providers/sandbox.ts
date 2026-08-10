import crypto from 'node:crypto';
import type {PaymentProvider, ProviderAuthorizationInput, ProviderAuthorizationResult, ProviderCaptureResult, ProviderPaymentMethodInput, ProviderPaymentMethodResult, ProviderRefundResult} from '../../domain/payments/provider.js';

export class SandboxProvider implements PaymentProvider {
  readonly name = 'sandbox';

  async createPaymentMethod(input: ProviderPaymentMethodInput): Promise<ProviderPaymentMethodResult> {
    const token = input.token.trim();
    if (!token) throw Object.assign(new Error('PAYMENT_METHOD_TOKEN_REQUIRED'), {code:'PAYMENT_METHOD_TOKEN_REQUIRED',statusCode:400});
    if (token.toUpperCase().includes('3DS')) return {providerToken:`pm_sbx_${crypto.randomUUID()}`,brand:'VISA',last4:'3000',expMonth:12,expYear:new Date().getFullYear()+3};
    return {providerToken:token.startsWith('pm_')?token:`pm_sbx_${crypto.createHash('sha256').update(token).digest('hex').slice(0,24)}`,brand:'VISA',last4:'4242',expMonth:12,expYear:new Date().getFullYear()+3};
  }

  async authorize(input: ProviderAuthorizationInput): Promise<ProviderAuthorizationResult> {
    const token=(input.paymentMethodToken||'').toUpperCase();
    const reference=input.reference.toUpperCase();
    if (token.includes('3DS') || reference.includes('3DS')) return {providerTransactionId:`sbx_${crypto.randomUUID()}`,status:'REQUIRES_ACTION',action:{type:'3DS',url:'/checkout/sandbox/3ds'}};
    if (reference.includes('FAIL') || token.includes('FAIL')) return {providerTransactionId:`sbx_${crypto.randomUUID()}`,status:'FAILED',failureCode:'sandbox_declined',failureMessage:'Sandbox decline requested'};
    return {providerTransactionId:`sbx_${crypto.randomUUID()}`,status:'SUCCEEDED'};
  }

  async capture(providerTransactionId:string, _amountMinor:bigint, _idempotencyKey:string):Promise<ProviderCaptureResult>{
    return {providerTransactionId,status:'SUCCEEDED'};
  }

  async refund(_paymentProviderId:string, _amountMinor:bigint, _idempotencyKey:string):Promise<ProviderRefundResult>{
    return {providerRefundId:`sbr_${crypto.randomUUID()}`, status:'SUCCESS'};
  }
}
