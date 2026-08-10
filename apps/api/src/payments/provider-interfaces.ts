/**
 * Phase 4 compatibility surface.
 * Phase 5: Payment Core uses providers/router.ts → ProviderAdapter.
 * This module re-exports sandbox helpers for older imports/tests only.
 */

export type {ProviderOperationResult as ProviderPaymentResult} from '../providers/adapter.js';
export {sandboxAdapter as sandboxPaymentProvider, SandboxAdapter as SandboxPaymentProvider} from '../providers/sandbox-adapter.js';
export {getProviderAdapter} from '../providers/registry.js';

import {sandboxAdapter} from '../providers/sandbox-adapter.js';
import {providerRouter, resolvePaymentEnvironment} from '../providers/router.js';

/** @deprecated Prefer providerRouter.resolve — kept for narrow Phase 4 call sites. */
export function getPaymentProvider() {
  return {
    code: sandboxAdapter.code,
    async createPaymentIntent(input: {
      organizationId: string;
      paymentIntentId: string;
      amountMinor: string;
      currencyCode: string;
    }) {
      const resolved = await providerRouter.resolve({
        organizationId: input.organizationId,
        environment: resolvePaymentEnvironment(),
        currencyCode: input.currencyCode,
        requiredCapability: 'payment.authorize',
      });
      return providerRouter.run({
        resolved,
        operation: 'AUTHORIZE',
        paymentIntentId: input.paymentIntentId,
        idempotencyKey: `compat-create:${input.paymentIntentId}`,
        fn: () =>
          resolved.adapter.authorize({
            organizationId: input.organizationId,
            paymentIntentId: input.paymentIntentId,
            paymentAttemptId: input.paymentIntentId,
            amountMinor: input.amountMinor,
            currencyCode: input.currencyCode,
          }),
      });
    },
    async confirmPayment(input: {
      organizationId: string;
      paymentIntentId: string;
      paymentAttemptId: string;
      amountMinor: string;
      currencyCode: string;
      paymentMethodTypeCode?: string | null;
      paymentMethodToken?: string | null;
    }) {
      const resolved = await providerRouter.resolve({
        organizationId: input.organizationId,
        environment: resolvePaymentEnvironment(),
        currencyCode: input.currencyCode,
        paymentMethodTypeCode: input.paymentMethodTypeCode || undefined,
        requiredCapability: 'payment.authorize',
      });
      return providerRouter.run({
        resolved,
        operation: 'AUTHORIZE',
        paymentIntentId: input.paymentIntentId,
        paymentAttemptId: input.paymentAttemptId,
        idempotencyKey: `compat-confirm:${input.paymentAttemptId}`,
        fn: () =>
          resolved.adapter.authorize({
            organizationId: input.organizationId,
            paymentIntentId: input.paymentIntentId,
            paymentAttemptId: input.paymentAttemptId,
            amountMinor: input.amountMinor,
            currencyCode: input.currencyCode,
            paymentMethodTypeCode: input.paymentMethodTypeCode,
            paymentMethodToken: input.paymentMethodToken,
          }),
      });
    },
    async getPaymentStatus(input: {organizationId: string; providerReference: string}) {
      const resolved = await providerRouter.resolve({
        organizationId: input.organizationId,
        environment: resolvePaymentEnvironment(),
        requiredCapability: 'payment.status',
      });
      return providerRouter.run({
        resolved,
        operation: 'STATUS',
        fn: () =>
          resolved.adapter.getStatus({
            organizationId: input.organizationId,
            providerReference: input.providerReference,
          }),
      });
    },
    async prepareRefund() {
      return {status: 'NOT_AVAILABLE' as const, providerCode: 'sandbox'};
    },
    async prepareCheckout(input: {
      organizationId: string;
      paymentSessionId: string;
      amountMinor: string;
      currencyCode: string;
    }) {
      const resolved = await providerRouter.resolve({
        organizationId: input.organizationId,
        environment: resolvePaymentEnvironment(),
        currencyCode: input.currencyCode,
        requiredCapability: 'payment.authorize',
      });
      return providerRouter.run({
        resolved,
        operation: 'CHECKOUT_PREPARE',
        fn: () =>
          resolved.adapter.prepareCheckout!({
            organizationId: input.organizationId,
            paymentSessionId: input.paymentSessionId,
            amountMinor: input.amountMinor,
            currencyCode: input.currencyCode,
          }),
      });
    },
  };
}

export function getPaymentWebhookProvider() {
  return sandboxAdapter;
}
