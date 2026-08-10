import React from 'react';
import {Link} from 'react-router-dom';

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
  return (
    <div>
      {crumbs && crumbs.length > 0 && (
        <nav className="v4-breadcrumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`}>
              {i > 0 && ' / '}
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
        {actions ? <div className="v4-toolbar">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: 'primary' | 'secondary' | 'danger' | 'ghost'},
) {
  const {variant = 'primary', className = '', ...rest} = props;
  const v = variant === 'primary' ? '' : variant;
  return <button className={`v4-btn ${v} ${className}`.trim()} {...rest} />;
}

export function Field({label, children, hint}: {label: string; children: React.ReactNode; hint?: string}) {
  const id = React.useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        id: (children as React.ReactElement<any>).props?.id || id,
      })
    : children;
  return (
    <div className="v4-field">
      <label htmlFor={(child as any)?.props?.id || id}>{label}</label>
      {child}
      {hint ? <small style={{color: 'var(--v4-text-muted)'}}>{hint}</small> : null}
    </div>
  );
}

export function StatusBadge({status}: {status?: string | null}) {
  const s = String(status || 'unknown').toLowerCase();
  return <span className={`v4-badge ${s}`}>{status || '—'}</span>;
}

export function Alert({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
}) {
  return <div className={`v4-alert ${tone === 'info' ? '' : tone}`}>{children}</div>;
}

export function EmptyState({title, description}: {title: string; description?: string}) {
  return (
    <div className="v4-empty v4-card">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function LoadingState({label = 'Loading…'}: {label?: string}) {
  return <div className="v4-loading v4-card">{label}</div>;
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
  if (!rows.length) return <>{empty || <EmptyState title="No records" />}</>;
  return (
    <div className="v4-table-wrap">
      <table className="v4-table">
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
                <td key={j}>{cell}</td>
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
  return (
    <div className="v4-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="v4-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v4-toolbar">
          <h3 style={{margin: 0}}>{title}</h3>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose} type="button">
            Close
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
  return (
    <div className="v4-drawer-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="v4-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="v4-toolbar">
          <h3 style={{margin: 0}}>{title}</h3>
          <div className="spacer" />
          <Button variant="ghost" onClick={onClose} type="button">
            Close
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
  confirmLabel = 'Confirm',
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
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="v4-toolbar">
        <div className="spacer" />
        <Button variant="secondary" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} type="button">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function ComingSoon({feature, reason}: {feature: string; reason: string}) {
  return (
    <div>
      <PageHeader title={feature} description="Not available in the current V4 phase." />
      <Alert tone="warning">
        <strong>{feature}</strong> is not implemented on the V4 PostgreSQL API yet. {reason} This screen does not call
        frozen Legacy MySQL APIs and does not invent financial data.
      </Alert>
      <EmptyState title="Coming later" description="Tracked for Financial Core / later phases — not Phase 6.5." />
    </div>
  );
}
