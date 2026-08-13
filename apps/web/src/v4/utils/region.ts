export type RegionBadge = 'PS' | 'GCC' | 'INTL' | 'OTHER';

const GCC = new Set(['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR']);
const INTL = new Set(['USD', 'EUR', 'GBP']);

export function regionForPayment(currencyCode?: string | null, providerCode?: string | null): RegionBadge {
  const provider = String(providerCode || '').toLowerCase();
  if (provider === 'bop' || provider === 'jawwalpay' || provider === 'palpay') return 'PS';
  if (provider === 'paytabs') return 'GCC';
  if (provider === 'stripe') return 'INTL';
  const ccy = String(currencyCode || '').toUpperCase();
  if (ccy === 'ILS') return 'PS';
  if (GCC.has(ccy)) return 'GCC';
  if (INTL.has(ccy)) return 'INTL';
  return 'OTHER';
}

export function regionLabelKey(region: RegionBadge): string {
  if (region === 'PS') return 'region.ps';
  if (region === 'GCC') return 'region.gcc';
  if (region === 'INTL') return 'region.intl';
  return 'region.other';
}
