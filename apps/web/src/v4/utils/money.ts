function uiLang(locale?: string) {
  return (
    locale ||
    (typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en')
  );
}

/** Keep Latin digits/IDs as one LTR run inside Arabic (RTL) layouts. */
export function isolateLtr(value: string) {
  return `\u2068${value}\u2069`;
}

export function formatMoney(amountMinor: string | number | null | undefined, currency = 'USD', locale?: string) {
  if (amountMinor === null || amountMinor === undefined || amountMinor === '') return '—';
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return String(amountMinor);
  const tag = uiLang(locale) === 'ar' ? 'ar-u-nu-latn' : 'en-US';
  try {
    return isolateLtr(new Intl.NumberFormat(tag, {style: 'currency', currency}).format(n / 100));
  } catch {
    return isolateLtr(`${(n / 100).toFixed(2)} ${currency}`);
  }
}

export function formatDate(value: string | null | undefined, locale?: string) {
  if (!value) return '—';
  try {
    const tag = 'en-GB';
    return isolateLtr(
      new Intl.DateTimeFormat(tag, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value)),
    );
  } catch {
    return isolateLtr(String(value));
  }
}

export function shortId(value: string | null | undefined) {
  const s = String(value || '');
  if (!s) return '—';
  const compact = s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
  return isolateLtr(compact);
}
