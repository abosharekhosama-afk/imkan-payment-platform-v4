import type {PaymentProvider,ProviderAuthorizationInput,ProviderAuthorizationResult,ProviderCaptureResult,ProviderPaymentMethodInput,ProviderPaymentMethodResult,ProviderRefundResult} from '../../domain/payments/provider.js';
export class RemoteProcessorAdapter implements PaymentProvider {
  readonly name:string; constructor(private readonly baseUrl:string,private readonly apiKey:string,private readonly providerName='remote'){this.name=providerName;}
  private async call(path:string,body:any,idempotencyKey?:string){const r=await fetch(`${this.baseUrl.replace(/\/$/,'')}${path}`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${this.apiKey}`,...(idempotencyKey?{'idempotency-key':idempotencyKey}:{})},body:JSON.stringify(body)});const text=await r.text();let j:any={};try{j=JSON.parse(text)}catch{}if(!r.ok)throw Object.assign(new Error(j?.error?.message||`PROCESSOR_HTTP_${r.status}`),{code:'PROCESSOR_ERROR',statusCode:502});return j.data??j;}
  async createPaymentMethod(i:ProviderPaymentMethodInput):Promise<ProviderPaymentMethodResult>{return this.call('/payment-methods',i);}
  async authorize(i:ProviderAuthorizationInput):Promise<ProviderAuthorizationResult>{return this.call('/payments/authorize',{...i,amount_minor:i.amountMinor.toString()},i.idempotencyKey);}
  async capture(id:string,amountMinor:bigint,key:string):Promise<ProviderCaptureResult>{return this.call(`/payments/${encodeURIComponent(id)}/capture`,{amount_minor:amountMinor.toString()},key);}
  async refund(id:string,amountMinor:bigint,key:string):Promise<ProviderRefundResult>{return this.call(`/payments/${encodeURIComponent(id)}/refund`,{amount_minor:amountMinor.toString()},key);}
}
