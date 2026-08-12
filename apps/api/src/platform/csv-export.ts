export function csvEscape(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: {key: string; header: string}[]): string {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(row[c.key] != null ? String(row[c.key]) : '')).join(','),
  );
  return `\uFEFF${[header, ...lines].join('\r\n')}`;
}
