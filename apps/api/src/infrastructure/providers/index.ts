import type {PaymentProvider} from '../../domain/payments/provider.js';
import {SandboxProvider} from './sandbox.js';
import {RemoteProcessorAdapter} from './remote.js';
import {PayTabsProvider} from './paytabs.js';
export function createPaymentProvider():PaymentProvider {
  const provider=(process.env.PAYMENT_PROVIDER||'sandbox').toLowerCase();
  if(provider==='paytabs') {
    if(!process.env.PAYTABS_BASE_URL||!process.env.PAYTABS_PROFILE_ID||!process.env.PAYTABS_SERVER_KEY||!process.env.PAYTABS_CALLBACK_URL||!process.env.PAYTABS_RETURN_URL) throw new Error('PayTabs requires PAYTABS_BASE_URL, PAYTABS_PROFILE_ID, PAYTABS_SERVER_KEY, PAYTABS_CALLBACK_URL and PAYTABS_RETURN_URL');
    return new PayTabsProvider(process.env.PAYTABS_BASE_URL,process.env.PAYTABS_PROFILE_ID,process.env.PAYTABS_SERVER_KEY,process.env.PAYTABS_CALLBACK_URL,process.env.PAYTABS_RETURN_URL);
  }
  if(provider==='remote' && process.env.PROCESSOR_BASE_URL && process.env.PROCESSOR_API_KEY) return new RemoteProcessorAdapter(process.env.PROCESSOR_BASE_URL,process.env.PROCESSOR_API_KEY,process.env.PROCESSOR_NAME||'remote');
  return new SandboxProvider();
}
