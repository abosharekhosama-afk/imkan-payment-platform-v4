import type {ProviderAdapter} from './adapter.js';
import {sandboxAdapter} from './sandbox-adapter.js';
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

/** Built-in adapters. Real providers register only after evidence + DEC-009. */
registerProviderAdapter(sandboxAdapter);
