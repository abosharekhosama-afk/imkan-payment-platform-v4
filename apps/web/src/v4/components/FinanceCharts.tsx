import React from 'react';

export type ChartSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

export const BALANCE_CHART_COLORS = {
  available: '#0f766e',
  pending: '#0284c7',
  reserved: '#d97706',
  settled: '#475569',
  gross: '#0f766e',
  platform: '#7c3aed',
  provider: '#ea580c',
  net: '#0369a1',
};

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: ChartSlice[];
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const r = 28;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="v4-chart">
      <div className="v4-chart-donut-wrap">
        <svg viewBox="0 0 72 72" className="v4-chart-svg" role="img">
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--v4-border)" strokeWidth="8" />
          {total > 0
            ? slices.map((slice) => {
                const len = (Math.max(0, slice.value) / total) * c;
                const dash = `${len} ${c - len}`;
                const current = offset;
                offset += len;
                if (slice.value <= 0) return null;
                return (
                  <circle
                    key={slice.id}
                    cx="36"
                    cy="36"
                    r={r}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="8"
                    strokeDasharray={dash}
                    strokeDashoffset={-current}
                    strokeLinecap="butt"
                    transform="rotate(-90 36 36)"
                  />
                );
              })
            : null}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="v4-chart-donut-center">
            {centerValue ? <strong>{centerValue}</strong> : null}
            {centerLabel ? <span>{centerLabel}</span> : null}
          </div>
        )}
      </div>
      <ul className="v4-chart-legend">
        {slices.map((s) => (
          <li key={s.id}>
            <span className="v4-chart-swatch" style={{background: s.color}} />
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarMixChart({slices}: {slices: ChartSlice[]}) {
  const max = Math.max(...slices.map((s) => s.value), 1);
  return (
    <div className="v4-bar-mix">
      {slices.map((s) => (
        <div key={s.id} className="v4-bar-mix-row">
          <div className="v4-bar-mix-meta">
            <span>{s.label}</span>
          </div>
          <div className="v4-bar-mix-track">
            <div
              className="v4-bar-mix-fill"
              style={{width: `${Math.max(s.value > 0 ? 6 : 0, (s.value / max) * 100)}%`, background: s.color}}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
