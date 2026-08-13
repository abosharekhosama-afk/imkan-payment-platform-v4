import React from 'react';

type Option = {value: string; label: string};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
};

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  required,
  id,
  'aria-label': ariaLabel,
  className = '',
}: Props) {
  return (
    <div className={`v4-select-wrap ${className}`.trim()}>
      <select
        id={id}
        className="v4-select"
        value={value}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
