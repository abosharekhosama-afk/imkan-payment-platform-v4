import crypto from 'node:crypto';
import {config} from '../config.js';
import type {
  ProviderAdapter,
  ProviderEnvironment,
  ProviderOperationResult,
  WebhookVerificationResult,
} from './adapter.js';
import {ProviderError} from './errors.js';

const REPLAY_WINDOW_SECONDS = 300;

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return String(v[0] || '');
  return String(v || '');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Internal Sandbox Provider — TEST/SANDBOX ONLY.
 * Magic tokens: FAIL → failed; TIMEOUT → timeout error; AMBIGUOUS → ambiguous outcome.
 */
export class SandboxAdapter implements ProviderAdapter {
  readonly code = 'sandbox';

  async authorize(input: {
    organizationId: string;
    paymentIntentId: string;
    paymentAttemptId: string;
    amountMinor: string;
    currencyCode: string;
    paymentMethodTypeCode?: string | null;
    paymentMethodToken?: string | null;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    const token = String(input.paymentMethodToken || '');
    if (/TIMEOUT/i.test(token)) {
      throw new ProviderError(
        'PROVIDER_TIMEOUT',
        'Sandbox simulated provider timeout',
        'TIMEOUT',
        504,
        {providerCode: this.code},
      );
    }
    if (/AMBIGUOUS/i.test(token)) {
      return {
        status: 'AMBIGUOUS',
        providerCode: this.code,
        providerReference: `sbx_att_${input.paymentAttemptId.replace(/-/g, '').slice(0, 16)}`,
        failureCode: 'SANDBOX_AMBIGUOUS',
        failureMessage: 'Sandbox ambiguous outcome — query before retry; do not re-charge',
      };
    }
    if (/FAIL/i.test(token)) {
      return {
        status: 'FAILED',
        providerCode: this.code,
        providerReference: `sbx_att_${input.paymentAttemptId.replace(/-/g, '').slice(0, 16)}`,
        failureCode: 'SANDBOX_FORCE_FAIL',
        failureMessage: 'Sandbox payment forced to fail',
      };
    }
    if (!token) {
      return {
        status: 'PENDING',
        providerCode: this.code,
        providerReference: `sbx_pi_${input.paymentIntentId.replace(/-/g, '').slice(0, 16)}`,
        details: {note: 'Sandbox intent registered; no external provider called.'},
      };
    }
    return {
      status: 'SUCCEEDED',
      providerCode: this.code,
      providerReference: `sbx_att_${input.paymentAttemptId.replace(/-/g, '').slice(0, 16)}`,
      providerTransactionId: `sbx_txn_${input.paymentAttemptId.replace(/-/g, '').slice(0, 20)}`,
      details: {sandbox: true, method: input.paymentMethodTypeCode || 'CARD'},
    };
  }

  async capture(input: {
    organizationId: string;
    paymentIntentId: string;
    providerReference: string;
    amountMinor: string;
    currencyCode: string;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    return {
      status: 'SUCCEEDED',
      providerCode: this.code,
      providerReference: input.providerReference,
      providerTransactionId: `sbx_cap_${input.paymentIntentId.replace(/-/g, '').slice(0, 16)}`,
      details: {sandbox: true, note: 'Sandbox capture coalesced (auth+capture).'},
    };
  }

  async voidPayment(input: {
    organizationId: string;
    paymentIntentId: string;
    providerReference?: string | null;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    return {
      status: 'SUCCEEDED',
      providerCode: this.code,
      providerReference: input.providerReference || `sbx_void_${input.paymentIntentId.replace(/-/g, '').slice(0, 12)}`,
      details: {sandbox: true, note: 'Sandbox local void — no remote cancel rail.'},
    };
  }

  async refund(input: {
    organizationId: string;
    paymentTransactionId: string;
    amountMinor: string;
    currencyCode: string;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    // Sandbox financial-phase refunds are supported. Live rails remain BLOCKED BY: DEC-009.
    const ref = `sbx_rf_${String(input.paymentTransactionId).replace(/-/g, '').slice(0, 12)}_${Date.now().toString(36)}`;
    return {
      status: 'SUCCEEDED',
      providerCode: this.code,
      providerReference: ref,
      providerTransactionId: ref,
      details: {
        amount_minor: input.amountMinor,
        currency_code: input.currencyCode,
        idempotency_key: input.idempotencyKey || null,
        environment: 'SANDBOX',
      },
    };
  }

  async getStatus(input: {
    organizationId: string;
    providerReference: string;
  }): Promise<ProviderOperationResult> {
    if (!input.providerReference) {
      return {
        status: 'FAILED',
        providerCode: this.code,
        failureCode: 'MISSING_REFERENCE',
        failureMessage: 'providerReference required',
      };
    }
    if (input.providerReference.startsWith('sbx_att_') || input.providerReference.startsWith('sbx_txn_')) {
      return {
        status: 'SUCCEEDED',
        providerCode: this.code,
        providerReference: input.providerReference,
        details: {sandbox: true, note: 'Sandbox status lookup (deterministic for known refs).'},
      };
    }
    return {
      status: 'PENDING',
      providerCode: this.code,
      providerReference: input.providerReference,
      details: {sandbox: true, note: 'Sandbox status probe — unknown reference treated as PENDING.'},
    };
  }

  async tokenize(input: {
    organizationId: string;
    paymentMethodToken?: string | null;
  }): Promise<ProviderOperationResult> {
    const token = String(input.paymentMethodToken || '').trim();
    if (!token) {
      return {
        status: 'FAILED',
        providerCode: this.code,
        failureCode: 'TOKEN_REQUIRED',
        failureMessage: 'paymentMethodToken required',
      };
    }
    return {
      status: 'SUCCEEDED',
      providerCode: this.code,
      providerReference: `sbx_pm_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)}`,
      details: {sandbox: true, note: 'Opaque token reference only — no real vault.'},
    };
  }

  async prepareCheckout(input: {
    organizationId: string;
    paymentSessionId: string;
    amountMinor: string;
    currencyCode: string;
  }): Promise<ProviderOperationResult> {
    return {
      status: 'PENDING',
      providerCode: this.code,
      providerReference: `sbx_chk_${input.paymentSessionId.replace(/-/g, '').slice(0, 16)}`,
      details: {note: 'Sandbox checkout preparation; hosted fields not used.'},
    };
  }

  async verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    environment: ProviderEnvironment;
    webhookSecret?: string;
  }): Promise<WebhookVerificationResult> {
    if (input.environment !== 'SANDBOX') {
      return {valid: false, error: 'Sandbox adapter rejects LIVE environment webhooks'};
    }

    const signatureHeader = header(input.headers, 'x-sandbox-signature');
    const timestampRaw = header(input.headers, 'x-sandbox-timestamp');
    const eventId = header(input.headers, 'x-sandbox-event-id');
    const nonce = header(input.headers, 'x-sandbox-nonce');

    if (!signatureHeader || !timestampRaw || !eventId || !nonce) {
      return {valid: false, error: 'Missing required sandbox webhook headers', providerEventId: eventId || undefined};
    }

    const timestamp = Number(timestampRaw);
    if (!Number.isFinite(timestamp)) {
      return {valid: false, error: 'Invalid timestamp', providerEventId: eventId};
    }
    const ageSec = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (ageSec > REPLAY_WINDOW_SECONDS) {
      return {valid: false, error: 'Webhook timestamp outside replay window', providerEventId: eventId};
    }

    let secret = input.webhookSecret || config.sandboxWebhookSecret;
    if (!input.webhookSecret) {
      try {
        const {resolveSecretRef} = await import('../security/secrets/index.js');
        const resolved = await resolveSecretRef('SANDBOX_WEBHOOK_SECRET', 'webhook_secret');
        if (resolved.value) secret = resolved.value;
      } catch {
        // Fall back to config env value — sandbox must keep working without KMS.
      }
    }
    if (!secret) {
      return {valid: false, error: 'SANDBOX_WEBHOOK_SECRET not configured', providerEventId: eventId};
    }

    const signedPayload = `${timestamp}.${eventId}.${nonce}.${input.rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    const provided = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;
    if (!timingSafeEqualHex(expected, provided)) {
      return {valid: false, error: 'Invalid webhook signature', providerEventId: eventId};
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(input.rawBody || '{}') as Record<string, unknown>;
    } catch {
      return {valid: false, error: 'Invalid JSON body', providerEventId: eventId};
    }

    const eventType = String(payload.type || payload.event_type || 'sandbox.payment.updated');
    return {
      valid: true,
      nonce,
      timestamp,
      event: {
        providerEventId: eventId,
        eventType,
        providerReference: payload.provider_reference ? String(payload.provider_reference) : undefined,
        paymentIntentId: payload.payment_intent_id ? String(payload.payment_intent_id) : undefined,
        // P15.0: NEVER trust payload organization_id — resolved from payment_intents in apply path.
        organizationId: undefined,
        environment: 'SANDBOX',
        payload,
      },
    };
  }
}

export const sandboxAdapter = new SandboxAdapter();

/** Helper for tests to sign sandbox webhook payloads. */
export function signSandboxWebhook(input: {
  rawBody: string;
  eventId: string;
  nonce: string;
  timestamp?: number;
  secret?: string;
}): {headers: Record<string, string>; timestamp: number} {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = input.secret ?? config.sandboxWebhookSecret;
  const signedPayload = `${timestamp}.${input.eventId}.${input.nonce}.${input.rawBody}`;
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return {
    timestamp,
    headers: {
      'x-sandbox-signature': `sha256=${sig}`,
      'x-sandbox-timestamp': String(timestamp),
      'x-sandbox-event-id': input.eventId,
      'x-sandbox-nonce': input.nonce,
      'content-type': 'application/json',
    },
  };
}
