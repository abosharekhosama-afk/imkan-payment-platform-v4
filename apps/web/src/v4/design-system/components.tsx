import React from 'react';
import {Link, NavLink} from 'react-router-dom';
import {useI18n} from '../i18n/I18nProvider';
import {formatErrorMessage, formatStatus} from '../i18n/humanize';

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  crumbs?: {label: string; to?: string}[];
}) {
  const {t, locale} = useI18n();
  const crumbSep = locale === 'ar' ? ' ‹ ' : ' / ';
  return (
    <div>
      {crumbs && crumbs.length > 0 && (
        <nav className="v4-breadcrumbs" aria-label={t('common.breadcrumb')}>
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`}>
              {i > 0 && crumbSep}
              {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
            </span>
          ))}
        </nav>
      )}
      <div className="v4-page-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="v4-page-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'md' | 'sm';
    /** Disables the button and swaps label while an async action runs */
    busy?: boolean;
    busyLabel?: string;
  },
) {
  const {t} = useI18n();
  const {variant = 'primary', size = 'md', className = '', busy, busyLabel, children, disabled, ...rest} = props;
  const v = variant === 'primary' ? '' : variant;
  return (
    <button
      className={`v4-btn zoho-btn-${variant === 'danger' ? 'primary' : variant === 'secondary' ? 'secondary' : variant === 'ghost' ? 'ghost' : 'primary'} ${v} ${size === 'sm' ? 'v4-btn--sm' : ''} ${className}`.trim()}
      disabled={Boolean(disabled || busy)}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? busyLabel || t('common.processing') : children}
    </button>
  );
}

export function Field({label, children, hint, fullWidth}: {label: string; children: React.ReactNode; hint?: string; fullWidth?: boolean}) {
  const id = React.useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        id: (children as React.ReactElement<any>).props?.id || id,
        className: [
          (children as React.ReactElement<any>).props?.className,
          (children as React.ReactElement<any>).type === 'select' ? 'v4-select input-ui' : '',
          (children as React.ReactElement<any>).type === 'textarea' ? 'v4-textarea input-ui' : '',
          (children as React.ReactElement<any>).type === 'input' ? 'input-ui' : '',
        ]
          .filter(Boolean)
          .join(' '),
      })
    : children;
  return (
    <div className={`v4-field${fullWidth ? ' v4-field--full' : ''}`}>
      <label htmlFor={(child as any)?.props?.id || id}>{label}</label>
      {child}
      {hint ? <small style={{color: 'var(--text-muted)'}}>{hint}</small> : null}
    </div>
  );
}

export function StatusBadge({status}: {status?: string | null}) {
  const {locale} = useI18n();
  const s = String(status || 'unknown').toLowerCase();
  return <span className={`v4-badge ${s}`}>{formatStatus(status, locale)}</span>;
}

export function Alert({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
}) {
  const {locale} = useI18n();
  const content =
    tone === 'danger' && typeof children === 'string'
      ? formatErrorMessage(children, undefined, locale)
      : children;
  return <div className={`v4-alert ${tone === 'info' ? '' : tone}`}>{content}</div>;
}

export function EmptyState({title, description}: {title: string; description?: string}) {
  return (
    <div className="v4-empty v4-card zoho-panel">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function LoadingState({
  label,
  overlay,
  variant = 'table',
}: {
  label?: string;
  overlay?: boolean;
  variant?: 'table' | 'form' | 'cards' | 'dashboard' | 'page';
}) {
  const {t} = useI18n();
  const text = label || t('common.loading');
  const skeleton =
    variant === 'form' ? (
      <div className="v4-shimmer v4-shimmer--form" role="status" aria-live="polite" aria-label={text}>
        <div className="v4-shimmer-line v4-shimmer-line--lg" />
        <div className="v4-shimmer-line" />
        <div className="v4-shimmer-form">
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line v4-shimmer-line--short" />
          <div className="v4-shimmer-line v4-shimmer-line--btn" />
        </div>
      </div>
    ) : variant === 'cards' || variant === 'dashboard' ? (
      <div className="v4-shimmer v4-shimmer--cards" role="status" aria-live="polite" aria-label={text}>
        {variant === 'dashboard' ? (
          <div className="v4-shimmer-hero" />
        ) : (
          <div className="v4-shimmer-line v4-shimmer-line--lg" />
        )}
        <div className="v4-shimmer-cards">
          <div className="v4-shimmer-card" />
          <div className="v4-shimmer-card" />
          <div className="v4-shimmer-card" />
        </div>
        <div className="v4-shimmer-table">
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line v4-shimmer-line--short" />
        </div>
      </div>
    ) : (
      <div className="v4-shimmer v4-shimmer--table" role="status" aria-live="polite" aria-label={text}>
        <div className="v4-shimmer-line v4-shimmer-line--lg" />
        <div className="v4-shimmer-line v4-shimmer-line--short" />
        <div className="v4-shimmer-table">
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line" />
          <div className="v4-shimmer-line v4-shimmer-line--short" />
        </div>
      </div>
    );
  if (overlay) {
    return <div className="v4-shimmer-overlay">{skeleton}</div>;
  }
  return skeleton;
}

export function ErrorState({message}: {message: string}) {
  return (
    <div className="v4-error v4-card">
      <Alert tone="danger">{message}</Alert>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: React.ReactNode[][];
  empty?: React.ReactNode;
}) {
  const {t} = useI18n();
  if (!rows.length) return <>{empty || <EmptyState title={t('common.noRecords')} />}</>;
  return (
    <div className="v4-table-wrap zoho-table-wrap">
      <table className="v4-table zoho-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
        <td key={j} dir={typeof cell === 'string' && /^\d/.test(cell) ? 'ltr' : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const {t} = useI18n();
  return (
    <div className="v4-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="v4-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v4-toolbar">
          <h3 style={{margin: 0}}>{title}</h3>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose} type="button">
            {t('common.close')}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const {t} = useI18n();
  return (
    <div className="v4-drawer-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="v4-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="v4-toolbar">
          <h3 style={{margin: 0}}>{title}</h3>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose} type="button">
            {t('common.close')}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  danger,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}) {
  const {t} = useI18n();
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="v4-toolbar">
        <div className="spacer" />
        <Button variant="secondary" onClick={onClose} type="button">
          {t('common.cancel')}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} type="button">
          {confirmLabel ?? t('common.confirm')}
        </Button>
      </div>
    </Modal>
  );
}

export function ComingSoon({feature, reason}: {feature: string; reason: string}) {
  const {t} = useI18n();
  return (
    <div>
      <PageHeader title={feature} description={t('comingSoon.description')} />
      <Alert tone="warning">{t('comingSoon.alert', {feature, reason})}</Alert>
      <EmptyState title={t('comingSoon.title')} description={t('comingSoon.subtitle')} />
    </div>
  );
}

export function ModuleTabs({
  items,
}: {
  items: {to: string; label: string; end?: boolean}[];
}) {
  return (
    <nav className="v4-module-tabs" aria-label="Module">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => (isActive ? 'active' : '')}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
