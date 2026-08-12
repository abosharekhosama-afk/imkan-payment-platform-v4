import React from 'react';
import {useAuth} from '../auth/AuthProvider';
import {useMasterOptions} from '../hooks/useMasterOptions';

type Props = {
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
};

/** Currency picker backed by master-data `currencies`. */
export function CurrencySelect({value, onChange, required, disabled, id}: Props) {
  const {token} = useAuth();
  const {options, loading} = useMasterOptions(token, 'currencies');

  if (loading && !options.length) {
    return (
      <select id={id} required={required} disabled value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={value}>{value}</option>
      </select>
    );
  }

  const list = options.length ? options : [{code: value || 'SAR', name: value || 'SAR'}];

  return (
    <select
      id={id}
      required={required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {list.map((o) => (
        <option key={o.code} value={o.code}>
          {o.code} — {o.name}
        </option>
      ))}
    </select>
  );
}
