import 'node:process';

function requiredInProduction(name: string, value: string | undefined, fallback: string): string {
  if (process.env.NODE_ENV === 'production' && (!value || value === fallback || value.includes('dev-only') || value.includes('dev-webhook'))) {
    throw new Error(`Missing or insecure production secret: ${name}`);
  }
  return value || fallback;
}

function assertProductionInfrastructure() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!process.env.REDIS_URL) {
    throw new Error('Production requires REDIS_URL for distributed rate limiting and readiness');
  }
  const rl = (process.env.RATE_LIMIT_STORE || 'redis').toLowerCase();
  if (rl !== 'redis') {
    throw new Error('Production requires RATE_LIMIT_STORE=redis (in-memory rate limiting forbidden)');
  }
  const provider = (process.env.PAYMENT_PROVIDER || '').toLowerCase();
  // Explicit opt-in only — never silently default to sandbox in production without PAYMENT_PROVIDER set.
  if (!provider) {
    throw new Error(
      'Production requires explicit PAYMENT_PROVIDER. Use PAYMENT_PROVIDER=sandbox only for explicitly labeled non-live deploys until a live adapter is registered (P15.3).',
    );
  }
  if (provider !== 'sandbox' && provider !== 'none') {
    // Live adapters are registered in P15.3+; refuse unknown providers rather than falling back.
    // Sandbox remains a valid explicit choice until DEC-009 closes.
  }
  const transport = (process.env.SESSION_TRANSPORT || 'cookie').toLowerCase();
  if (transport === 'bearer' && process.env.ALLOW_BEARER_ONLY_IN_PRODUCTION !== 'true') {
    throw new Error('Production SESSION_TRANSPORT must be cookie or dual (not bearer-only)');
  }
}

assertProductionInfrastructure();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  /** sandbox | production — credential/data isolation label (DEC-012 UI policy still open) */
  appEnv: (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase(),
  port: Number(process.env.PORT || 3000),
  /** Legacy MySQL URL — retained (DEC-014). Not used by /api/v1 foundation. */
  databaseUrl: process.env.DATABASE_URL || 'mysql://payment:payment@127.0.0.1:3306/payment_platform',
  /** V4 primary SoR */
  postgresUrl: process.env.DATABASE_URL_PG || process.env.POSTGRES_URL || 'postgres://imkan:imkan@127.0.0.1:5432/imkan_payments',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  webhookSigningSecret: requiredInProduction('WEBHOOK_SIGNING_SECRET', process.env.WEBHOOK_SIGNING_SECRET, 'dev-webhook-secret'),
  webhookWorkerIntervalMs: Number(process.env.WEBHOOK_WORKER_INTERVAL_MS || 2000),
  renewalWorkerIntervalMs: Number(process.env.SUBSCRIPTION_RENEWAL_WORKER_INTERVAL_MS || 5000),
  paymentTokenEncryptionKey: requiredInProduction(
    'PAYMENT_TOKEN_ENCRYPTION_KEY',
    process.env.PAYMENT_TOKEN_ENCRYPTION_KEY,
    'dev-only-change-me-32-byte-key-123456',
  ),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 24),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 8),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  /**
   * Explicit provider selection. Production requires PAYMENT_PROVIDER set (see assertProductionInfrastructure).
   * Non-production defaults to sandbox for local/dev. Sandbox is never an accidental production fallback.
   */
  paymentProvider: (
    process.env.PAYMENT_PROVIDER ||
    (process.env.NODE_ENV === 'production' ? '' : 'sandbox')
  ).toLowerCase(),
  /**
   * Sandbox webhook HMAC secret (env/secret-manager only — never persisted in PostgreSQL).
   * Referenced by provider_credentials_metadata.secret_ref = SANDBOX_WEBHOOK_SECRET.
   * Resolved via security/secrets when SECRET_BACKEND is configured.
   */
  sandboxWebhookSecret: requiredInProduction(
    'SANDBOX_WEBHOOK_SECRET',
    process.env.SANDBOX_WEBHOOK_SECRET,
    'dev-only-sandbox-webhook-secret',
  ),
  /** Default provider call timeout (ms) */
  providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS || 12_000),
  region: process.env.DEFAULT_REGION || 'SA',
  securityHeaders: process.env.SECURITY_HEADERS !== 'false',
  /** Feature flag: serve legacy MySQL /v1 routes. Production defaults OFF. */
  enableLegacyV1:
    process.env.NODE_ENV === 'production'
      ? process.env.ENABLE_LEGACY_V1 === 'true'
      : process.env.ENABLE_LEGACY_V1 !== 'false',
  /**
   * When true, payment link create / checkout session / billing collect require KYB
   * SUBMITTED|IN_REVIEW|APPROVED. Production defaults ON. Frontend skip cannot bypass.
   */
  requireKybForPayments:
    process.env.REQUIRE_KYB_FOR_PAYMENTS === 'true' || process.env.NODE_ENV === 'production',
  /** When true, login requires email_verified_at */
  requireEmailVerification:
    process.env.REQUIRE_EMAIL_VERIFICATION === 'true' || process.env.NODE_ENV === 'production',
  /** Expose one-time tokens in API responses outside production (never in production) */
  exposeDevTokens: process.env.NODE_ENV !== 'production' && process.env.EXPOSE_DEV_TOKENS !== 'false',
  outboxWorkerIntervalMs: Number(process.env.OUTBOX_WORKER_INTERVAL_MS || 2000),
  outboxWorkerEnabled: process.env.OUTBOX_WORKER_ENABLED !== 'false',
  emailVerificationTtlHours: Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 48),
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60),
  invitationTtlHours: Number(process.env.INVITATION_TTL_HOURS || 72),
  stepUpTtlMinutes: Number(process.env.STEP_UP_TTL_MINUTES || 5),
  /** Phase 3: AES-256-GCM key for bank/identification data at rest (env only, never DB). */
  bankDataEncryptionKey: requiredInProduction(
    'BANK_DATA_ENCRYPTION_KEY',
    process.env.BANK_DATA_ENCRYPTION_KEY,
    'dev-only-bank-data-key-change-me-0001',
  ),
  /** Phase 3: HMAC-SHA256 key for deterministic bank-account fingerprints (env only, never DB). */
  bankFingerprintHmacKey: requiredInProduction(
    'BANK_FINGERPRINT_HMAC_KEY',
    process.env.BANK_FINGERPRINT_HMAC_KEY,
    'dev-only-bank-fingerprint-key-0001',
  ),
  /** P15.2 Redis */
  redisUrl: process.env.REDIS_URL || '',
  rateLimitStore: (process.env.RATE_LIMIT_STORE || (process.env.NODE_ENV === 'production' ? 'redis' : 'memory')).toLowerCase(),
  /** P15.2 secrets backend: env | file | kms */
  secretBackend: (process.env.SECRET_BACKEND || 'env').toLowerCase(),
  /** P15.2 session transport: bearer | cookie | dual */
  sessionTransport: (process.env.SESSION_TRANSPORT || (process.env.NODE_ENV === 'production' ? 'cookie' : 'dual')).toLowerCase(),
};
