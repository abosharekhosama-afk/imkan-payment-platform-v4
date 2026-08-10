import crypto from 'node:crypto';
import type {PaymentProvider, ProviderAuthorizationInput, ProviderAuthorizationResult, ProviderCaptureResult, ProviderPaymentMethodInput, ProviderPaymentMethodResult, ProviderRefundResult} from '../../domain/payments/provider.js';

/** PayTabs hosted-payment-page adapter. Card data never enters our API. */
export class PayTabsProvider implements PaymentProvider {
  readonly name='paytabs';
  constructor(private readonly baseUrl:string, private readonly profileId:string, private readonly serverKey:string, private readonly callbackUrl:string, private readonly returnUrl:string){}
  private async call(path:string, body:any){
    const response=await fetch(`${this.baseUrl.replace(/\/$/,'')}${path}`,{method:'POST',headers:{'Content-Type':'application/json','authorization':this.serverKey},body:JSON.stringify(body)});
    const text=await response.text(); let data:any={}; try{data=JSON.parse(text)}catch{}
    if(!response.ok || (data?.payment_result?.response_status && data.payment_result.response_status==='E')) throw Object.assign(new Error(data?.payment_result?.response_message||data?.message||`PAYTABS_HTTP_${response.status}`),{code:'PAYTABS_ERROR',statusCode:502});
    return data;
  }
  async createPaymentMethod(_i:ProviderPaymentMethodInput):Promise<ProviderPaymentMethodResult>{throw Object.assign(new Error('PAYTABS_HOSTED_CHECKOUT_ONLY'),{code:'PAYTABS_HOSTED_CHECKOUT_ONLY',statusCode:409});}
  async authorize(i:ProviderAuthorizationInput):Promise<ProviderAuthorizationResult>{
    const cartId=i.reference.slice(0,64) || crypto.randomUUID();
    const data=await this.call('/payment/request',{profile_id:this.profileId,tran_type:'sale',tran_class:'ecom',cart_id:cartId,cart_currency:i.currency,cart_amount:Number(i.amountMinor)/100,cart_description:i.reference,callback:this.callbackUrl,return:this.returnUrl});
    const tranRef=String(data.tran_ref||`pt_${cartId}`);
    const redirectUrl=data.redirect_url || data.payment_url || data.invoice_link;
    if(!redirectUrl) return {providerTransactionId:tranRef,status:'FAILED',failureCode:'PAYTABS_NO_REDIRECT',failureMessage:'PayTabs did not return a hosted checkout URL'};
    return {providerTransactionId:tranRef,status:'REQUIRES_ACTION',action:{type:'3DS',url:String(redirectUrl)}};
  }
  async capture(providerTransactionId:string,_amountMinor:bigint,_idempotencyKey:string):Promise<ProviderCaptureResult>{return {providerTransactionId,status:'SUCCEEDED'};}
  async refund(_providerTransactionId:string,_amountMinor:bigint,_idempotencyKey:string):Promise<ProviderRefundResult>{
    throw Object.assign(new Error('PAYTABS_REFUND_REQUIRES_PROVIDER_REFUND_ADAPTER'),{code:'PAYTABS_REFUND_UNCONFIGURED',statusCode:409});
  }
  verifySignature(payload:any):boolean{
    const signature=String(payload?.signature||''); if(!signature) return false;
    const copy={...payload}; delete copy.signature; const raw=Object.keys(copy).filter(k=>copy[k]!==''&&copy[k]!==null&&copy[k]!==undefined).sort().map(k=>`${k}=${encodeURIComponent(String(copy[k]))}`).join('&');
    const expected=crypto.createHmac('sha256',this.serverKey).update(raw).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
  }
}
