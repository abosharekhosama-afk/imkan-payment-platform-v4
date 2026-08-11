import {useEffect, useState} from 'react';
import {v4} from '../api/endpoints';

export type PlatformRuntime = {
  deployment_mode: 'development' | 'production';
  allow_sandbox_payment_tokens: boolean;
  labels: {console_rail: string; checkout_banner: string};
  features: {checkout_sandbox_tokens: 'allowed' | 'blocked'};
};

const DEFAULT_RUNTIME: PlatformRuntime = {
  deployment_mode: 'development',
  allow_sandbox_payment_tokens: true,
  labels: {console_rail: 'SANDBOX RAIL', checkout_banner: 'SANDBOX CHECKOUT'},
  features: {checkout_sandbox_tokens: 'allowed'},
};

let cached: PlatformRuntime | null = null;

export function usePlatformRuntime() {
  const [runtime, setRuntime] = useState<PlatformRuntime>(cached || DEFAULT_RUNTIME);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return;
    v4.platformRuntime()
      .then((r) => {
        cached = {
          deployment_mode: r.deployment_mode,
          allow_sandbox_payment_tokens: r.allow_sandbox_payment_tokens,
          labels: r.labels,
          features: r.features,
        };
        setRuntime(cached);
      })
      .catch(() => setRuntime(DEFAULT_RUNTIME))
      .finally(() => setLoading(false));
  }, []);

  return {runtime, loading, allowSandboxTokens: runtime.allow_sandbox_payment_tokens};
}
