import {ProviderError} from '../errors.js';
import type {PayTabsHttpClient} from './http-client.js';
import type {ProviderOperationResult} from '../adapter.js';

/**
 * Unknown outcome recovery: query PayTabs before any retry (P15.4).
 * PayTabs-side idempotency is NOT VERIFIED — IMKAN must not re-charge blindly.
 */
export async function resolveUnknownPayTabsOutcome(input: {
  client: PayTabsHttpClient;
  profileId: string;
  providerReference?: string | null;
  cartId?: string | null;
}): Promise<ProviderOperationResult & {recoveredViaQuery: boolean}> {
  const ref = input.providerReference || null;
  if (!ref) {
    return {
      status: 'AMBIGUOUS',
      providerCode: 'paytabs',
      failureCode: 'PAYTABS_UNKNOWN_OUTCOME',
      failureMessage: 'No provider reference to query after unknown outcome',
      recoveredViaQuery: false,
    };
  }

  try {
    const data = await input.client.paymentQuery({
      profile_id: input.profileId,
      tran_ref: ref,
    });
    const responseStatus = data.payment_result?.response_status;
    if (responseStatus === 'A') {
      return {
        status: 'SUCCEEDED',
        providerCode: 'paytabs',
        providerReference: ref,
        providerTransactionId: ref,
        recoveredViaQuery: true,
        details: {response_status: responseStatus, query_recovery: true},
      };
    }
    if (responseStatus === 'D' || responseStatus === 'E') {
      return {
        status: 'FAILED',
        providerCode: 'paytabs',
        providerReference: ref,
        failureCode: data.payment_result?.response_code || 'PAYTABS_DECLINED',
        failureMessage: data.payment_result?.response_message || 'PayTabs query reported failure',
        recoveredViaQuery: true,
        details: {response_status: responseStatus},
      };
    }
    if (responseStatus === 'P' || responseStatus === 'H') {
      return {
        status: 'PENDING',
        providerCode: 'paytabs',
        providerReference: ref,
        recoveredViaQuery: true,
        details: {response_status: responseStatus},
      };
    }
    return {
      status: 'AMBIGUOUS',
      providerCode: 'paytabs',
      providerReference: ref,
      failureCode: 'PAYTABS_QUERY_INCONCLUSIVE',
      failureMessage: 'PayTabs query returned inconclusive status',
      recoveredViaQuery: true,
      details: {response_status: responseStatus || null},
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    return {
      status: 'AMBIGUOUS',
      providerCode: 'paytabs',
      providerReference: ref,
      failureCode: 'PAYTABS_QUERY_FAILED',
      failureMessage: 'Query after unknown outcome failed',
      recoveredViaQuery: false,
    };
  }
}
