import React from 'react';
import {useI18n} from '../i18n/I18nProvider';

type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  overlay?: boolean;
};

export function ImkanLoader({label, size = 'md', overlay}: Props) {
  const {t} = useI18n();
  const text = label ?? t('common.loading');
  const inner = (
    <div className={`v4-imkan-loader v4-imkan-loader--${size}`} role="status" aria-live="polite">
      <div className="v4-imkan-loader-orbit" aria-hidden="true">
        <div className="v4-imkan-loader-mark">IMK</div>
      </div>
      <span className="v4-imkan-loader-label">{text}</span>
    </div>
  );
  if (overlay) {
    return <div className="v4-imkan-loader-overlay">{inner}</div>;
  }
  return inner;
}
