/**
 * Regional provider preference: Palestine local MID, GCC PayTabs, Stripe international.
 */
export const GCC_CURRENCIES = new Set(['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR']);
export const INTL_CARD_CURRENCIES = new Set(['USD', 'EUR', 'GBP']);

export function preferredProviderCodes(currencyCode?: string | null): string[] {
  const ccy = String(currencyCode || '').toUpperCase();
  if (ccy === 'ILS') return ['bop', 'jawwalpay', 'palpay', 'paytabs', 'stripe'];
  if (GCC_CURRENCIES.has(ccy)) return ['paytabs', 'stripe'];
  if (INTL_CARD_CURRENCIES.has(ccy)) return ['stripe', 'paytabs'];
  return ['stripe', 'paytabs', 'sandbox'];
}
