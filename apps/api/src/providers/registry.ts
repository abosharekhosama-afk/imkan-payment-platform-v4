import type {ProviderAdapter} from './adapter.js';
import {sandboxAdapter} from './sandbox-adapter.js';
import {paytabsAdapter} from './paytabs/index.js';
import {stripeAdapter} from './stripe/index.js';
import {ProviderError} from './errors.js';

const adapters = new Map<string, ProviderAdapter>();

export function registerProviderAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.code, adapter);
}

export function getProviderAdapter(code: string): ProviderAdapter {
  const adapter = adapters.get(code);
  if (!adapter) {
    throw new ProviderError(
      'PROVIDER_ADAPTER_NOT_REGISTERED',
      `No adapter registered for provider code '${code}'`,
      'DISABLED',
      503,
      {providerCode: code},
    );
  }
  return adapter;
}

export function listRegisteredAdapterCodes(): string[] {
  return [...adapters.keys()].sort();
}

/** Built-in adapters. LIVE activation gated by credentials plane + STRIPE_ALLOW_LIVE / DEC-009 for PayTabs. */
registerProviderAdapter(sandboxAdapter);
registerProviderAdapter(paytabsAdapter);
registerProviderAdapter(stripeAdapter);
