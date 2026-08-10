export function formatMoney(amountMinor: string | number | null | undefined, currency = 'USD') {
  if (amountMinor === null || amountMinor === undefined || amountMinor === '') return '—';
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return String(amountMinor);
  try {
    return new Intl.NumberFormat(undefined, {style: 'currency', currency}).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function shortId(value: string | null | undefined) {
  const s = String(value || '');
  if (!s) return '—';
  return s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}
