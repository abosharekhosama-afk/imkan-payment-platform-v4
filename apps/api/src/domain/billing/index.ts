export type ProductType = 'ONE_TIME' | 'SUBSCRIPTION';
export type PriceIntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELED'
  | 'UNPAID'
  | 'EXPIRED';
export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'PARTIALLY_PAID' | 'VOID' | 'OVERDUE' | 'UNCOLLECTIBLE';
export type BillingCycleStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED';

export type ProductInput = {
  name: string;
  description?: string;
  sku?: string;
  type?: ProductType;
  active?: boolean;
  metadata?: Record<string, unknown>;
};

export type PriceInput = {
  currency: string;
  unitAmountMinor: number | string;
  intervalUnit?: PriceIntervalUnit | string;
  intervalCount?: number;
  taxBehavior?: 'INCLUSIVE' | 'EXCLUSIVE';
  metadata?: Record<string, unknown>;
};

export type SubscriptionDraftInput = {
  customerId: string;
  merchantId: string;
  priceId: string;
  status?: SubscriptionStatus;
  trialDays?: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt: Date;
  cancelAtPeriodEnd?: boolean;
};

export function parseProductInput(input: ProductInput) {
  const name = input.name.trim();
  if (!name) throw new Error('PRODUCT_NAME_REQUIRED');

  return {
    name,
    description: input.description?.trim() || null,
    sku: input.sku?.trim() || null,
    type: input.type || 'SUBSCRIPTION',
    active: input.active !== false,
    metadata: input.metadata || {},
    status: 'ACTIVE' as const,
  };
}

export function normalizePriceInput(input: PriceInput) {
  const intervalUnit = (input.intervalUnit || 'MONTH').toUpperCase();
  const allowed = new Set<PriceIntervalUnit>(['DAY', 'WEEK', 'MONTH', 'YEAR']);

  if (!allowed.has(intervalUnit as PriceIntervalUnit)) {
    throw new Error('INTERVAL_UNIT_UNSUPPORTED');
  }

  const unitAmountMinor = Number(input.unitAmountMinor);
  if (!Number.isInteger(unitAmountMinor) || unitAmountMinor <= 0) {
    throw new Error('PRICE_AMOUNT_INVALID');
  }

  return {
    currency: input.currency.toUpperCase(),
    unit_amount_minor: String(unitAmountMinor),
    interval_unit: intervalUnit,
    interval_count: Math.max(1, Number(input.intervalCount || 1)),
    tax_behavior: input.taxBehavior || 'EXCLUSIVE',
    metadata: input.metadata || {},
  };
}

export function createSubscriptionDraft(input: SubscriptionDraftInput) {
  const status = input.status || (input.trialDays && input.trialDays > 0 ? 'TRIALING' : 'ACTIVE');

  return {
    customer_id: input.customerId,
    merchant_id: input.merchantId,
    price_id: input.priceId,
    status,
    trial_days: input.trialDays || 0,
    current_period_start: input.currentPeriodStart,
    current_period_end: input.currentPeriodEnd,
    next_billing_at: input.nextBillingAt,
    cancel_at_period_end: input.cancelAtPeriodEnd || false,
    trialDays: input.trialDays || 0,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd || false,
  };
}

export function nextBillingDate(start: Date, intervalUnit: string, intervalCount: number) {
  const current = new Date(start.getTime());
  const unit = (intervalUnit || 'MONTH').toUpperCase();

  if (unit === 'DAY') current.setUTCDate(current.getUTCDate() + intervalCount);
  else if (unit === 'WEEK') current.setUTCDate(current.getUTCDate() + intervalCount * 7);
  else if (unit === 'MONTH') current.setUTCMonth(current.getUTCMonth() + intervalCount);
  else if (unit === 'YEAR') current.setUTCFullYear(current.getUTCFullYear() + intervalCount);
  else throw new Error('INTERVAL_UNIT_UNSUPPORTED');

  return current;
}

export type InvoiceDraftInput = {
  tenantId: string;
  merchantId: string;
  customerId: string;
  subscriptionId?: string;
  number: string;
  currency: string;
  subtotalMinor: number | bigint | string;
  taxMinor?: number | bigint | string;
  dueAt?: Date;
};

export type InvoiceDraft = {
  tenantId: string;
  merchantId: string;
  customerId: string;
  subscriptionId?: string;
  number: string;
  currency: string;
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  status: InvoiceStatus;
  dueAt?: Date;
  paidAt?: Date;
};

export function createInvoiceDraft(input: InvoiceDraftInput): InvoiceDraft {
  const subtotal = BigInt(input.subtotalMinor);
  const tax = BigInt(input.taxMinor ?? 0);
  const total = subtotal + tax;

  if (BigInt(input.subtotalMinor) < 0n) {
    throw new Error('INVOICE_SUBTOTAL_INVALID');
  }

  return {
    tenantId: input.tenantId,
    merchantId: input.merchantId,
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    number: input.number,
    currency: input.currency.toUpperCase(),
    subtotalMinor: subtotal,
    taxMinor: tax,
    totalMinor: total,
    status: 'OPEN',
    dueAt: input.dueAt,
  };
}

export function markInvoicePaid(invoice: InvoiceDraft, paidAt: Date): InvoiceDraft {
  if (invoice.status === 'VOID') {
    throw new Error('INVOICE_VOID_CANNOT_BE_PAID');
  }

  return {
    ...invoice,
    status: 'PAID',
    paidAt,
  };
}

export type BillingCycleInput = {
  tenantId: string;
  subscriptionId: string;
  invoiceNumber: string;
  amountMinor: number | bigint | string;
  currency: string;
  taxMinor?: number | bigint | string;
  periodStart: Date;
  periodEnd: Date;
};

export type BillingCycle = {
  tenantId: string;
  subscriptionId: string;
  invoiceNumber: string;
  amountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  currency: string;
  status: BillingCycleStatus;
  periodStart: Date;
  periodEnd: Date;
};

export function createBillingCycle(input: BillingCycleInput): BillingCycle {
  const amount = BigInt(input.amountMinor);
  const tax = BigInt(input.taxMinor ?? 0);

  return {
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    invoiceNumber: input.invoiceNumber,
    amountMinor: amount,
    taxMinor: tax,
    totalMinor: amount + tax,
    currency: input.currency.toUpperCase(),
    status: 'PENDING',
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  };
}

export type RenewalPaymentStatus = 'SUCCEEDED' | 'FAILED' | 'REQUIRES_ACTION';

export type RenewalPaymentResultInput = {
  invoice: InvoiceDraft;
  providerStatus: RenewalPaymentStatus;
  subscriptionStatus: SubscriptionStatus;
  paidAt?: Date;
};

export function applyRenewalPaymentResult(input: RenewalPaymentResultInput) {
  const invoice = input.providerStatus === 'SUCCEEDED'
    ? markInvoicePaid(input.invoice, input.paidAt || new Date())
    : input.invoice;

  const subscriptionStatus = input.providerStatus === 'SUCCEEDED'
    ? input.subscriptionStatus
    : 'PAST_DUE';

  return {
    providerStatus: input.providerStatus,
    invoice,
    subscriptionStatus,
  };
}

export function canRetryRenewal(currentAttempts: number, maxAttempts = 3) {
  return currentAttempts < maxAttempts;
}

export function getRetryBackoffSeconds(attempt: number) {
  return Math.min(3600, Math.pow(2, Math.max(0, attempt - 1)) * 300);
}

export function isSubscriptionInGracePeriod(now: Date, graceUntil: Date) {
  return new Date(now).getTime() <= new Date(graceUntil).getTime();
}

export type SubscriptionRenewalInput = {
  tenantId: string;
  merchantId: string;
  customerId: string;
  subscriptionId: string;
  priceId: string;
  currency: string;
  amountMinor: number | bigint | string;
  taxMinor?: number | bigint | string;
  invoiceNumber: string;
  subscriptionStart: Date;
  subscriptionEnd: Date;
  nextBillingAt: Date;
};

export function isSubscriptionRenewalDue(nextBillingAt: Date, now: Date = new Date()) {
  return new Date(nextBillingAt).getTime() <= new Date(now).getTime();
}

export function createRenewalInvoiceDraft(input: SubscriptionRenewalInput): InvoiceDraft {
  return createInvoiceDraft({
    tenantId: input.tenantId,
    merchantId: input.merchantId,
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    number: input.invoiceNumber,
    currency: input.currency,
    subtotalMinor: input.amountMinor,
    taxMinor: input.taxMinor ?? 0,
    dueAt: input.nextBillingAt,
  });
}

export function createRenewalBillingCycle(input: SubscriptionRenewalInput): BillingCycle {
  return createBillingCycle({
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    invoiceNumber: input.invoiceNumber,
    amountMinor: input.amountMinor,
    currency: input.currency,
    taxMinor: input.taxMinor ?? 0,
    periodStart: input.subscriptionStart,
    periodEnd: input.subscriptionEnd,
  });
}

export type AdvanceSubscriptionPeriodInput = {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt: Date;
  intervalUnit?: PriceIntervalUnit | string;
  intervalCount?: number;
};

export function advanceSubscriptionPeriod(input: AdvanceSubscriptionPeriodInput) {
  const intervalUnit = (input.intervalUnit || 'MONTH').toUpperCase();
  const intervalCount = Math.max(1, Number(input.intervalCount || 1));
  const nextPeriodStart = new Date(input.currentPeriodEnd.getTime());
  const nextPeriodEnd = nextBillingDate(input.currentPeriodEnd, intervalUnit, intervalCount);
  const nextBilling = nextBillingDate(input.currentPeriodEnd, intervalUnit, intervalCount);

  return {
    currentPeriodStart: nextPeriodStart,
    currentPeriodEnd: nextPeriodEnd,
    nextBillingAt: nextBilling,
  };
}
