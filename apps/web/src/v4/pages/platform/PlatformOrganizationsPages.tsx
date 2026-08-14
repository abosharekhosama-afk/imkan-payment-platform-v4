import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {
  Alert,
  Button,
  DataTable,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, formatMoney, shortId} from '../../utils/money';
import {formatActor, formatErrorCode, formatErrorMessage, formatEventAction} from '../../i18n/humanize';
import {Can} from '../../rbac/Can';
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';

function exportCsv(token: string | null | undefined, fn: () => Promise<void>, setError: (m: string) => void) {
  if (!token) return;
  fn().catch((e) => setError(e.message));
}

export function PlatformOrganizationsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (search.trim()) q.set('search', search.trim());
    v4
      .platformOrganizations(token, q.toString() ? `?${q}` : '')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  return (
    <div>
      <PageHeader
        title={t('platform.orgs.title')}
        description={t('platform.orgs.description')}
        crumbs={[{label: t('section.platform')}, {label: t('nav.platformOrganizations')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar" style={{marginBottom: 12, flexWrap: 'wrap', gap: 8}}>
        <Field label={t('platform.orgs.statusFilter')}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PENDING">PENDING</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </Field>
        <Field label={t('common.search')}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('platform.orgs.searchPlaceholder')} />
        </Field>
        <Button type="button" variant="secondary" onClick={load} style={{alignSelf: 'end'}}>
          {t('common.refresh')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          style={{alignSelf: 'end'}}
          onClick={() => {
            const q = new URLSearchParams();
            if (status) q.set('status', status);
            if (search.trim()) q.set('search', search.trim());
            const qs = q.toString() ? `?${q}` : '';
            exportCsv(token, () => v4.downloadPlatformOrganizationsCsv(token, qs), setError);
          }}
        >
          {t('common.exportCsv')}
        </Button>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('platform.orgs.colName'),
            t('platform.orgs.colStatus'),
            t('platform.orgs.colKyb'),
            t('platform.orgs.colMembers'),
            t('platform.orgs.colPayments'),
            t('platform.orgs.colCreated'),
            '',
          ]}
          rows={rows.map((r) => [
            r.name,
            <StatusBadge status={r.status} />,
            r.kyb_status ? <StatusBadge status={r.kyb_status} /> : '—',
            r.member_count ?? '—',
            r.payment_count ?? '0',
            formatDate(r.created_at),
            <Link to={`/platform/organizations/${r.id}`}>{t('common.view')}</Link>,
          ])}
          empty={<p>{t('platform.orgs.empty')}</p>}
        />
      )}
    </div>
  );
}

function DetailRow({label, value}: {label: string; value: React.ReactNode}) {
  if (value == null || value === '') return null;
  return (
    <p>
      <strong>{label}</strong> {value}
    </p>
  );
}

export function PlatformOrganizationDetailPage() {
  const {t, locale} = useI18n();
  const {organizationId = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    default_currency: '',
    locale: '',
    timezone: '',
  });

  const load = () => {
    if (!token || !organizationId) return;
    setLoading(true);
    v4
      .platformOrganization(token, organizationId)
      .then((data) => {
        setDetail(data);
        const o = data.organization;
        setSettingsForm({
          name: o.name || '',
          default_currency: o.default_currency || '',
          locale: o.locale || '',
          timezone: o.timezone || '',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    setPaymentsLoading(true);
    v4
      .platformOrganizationPayments(token, organizationId)
      .then(setPayments)
      .catch((e) => setError(e.message))
      .finally(() => setPaymentsLoading(false));
  };

  useEffect(load, [token, organizationId]);

  const setStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const step = await obtainStepUp(token, totp);
      if (step.enrolled) {
        setError(t('platform.team.mfaEnrolled'));
        return;
      }
      await v4.updatePlatformOrganizationStatus(token, organizationId, {status}, step.stepUpToken);
      push(status === 'SUSPENDED' ? t('platform.orgs.suspended') : t('platform.orgs.activated'));
      setTotp('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSettingsBusy(true);
    setError('');
    try {
      await v4.updatePlatformOrganizationSettings(token, organizationId, {
        name: settingsForm.name.trim(),
        default_currency: settingsForm.default_currency.trim() || null,
        locale: settingsForm.locale.trim() || null,
        timezone: settingsForm.timezone.trim() || null,
      });
      push(t('platform.orgs.settingsSaved'));
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSettingsBusy(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!detail) return <Alert tone="danger">{error || t('platform.orgs.notFound')}</Alert>;

  const org = detail.organization;
  const legal = detail.legal_profile;
  const business = detail.business_profile;
  const merchant = detail.merchant_profile;
  const kyb = detail.kyb_case;
  const paymentsSummary = detail.payments_summary;

  return (
    <div>
      <PageHeader
        title={org.name}
        description={org.slug}
        crumbs={[
          {label: t('section.platform')},
          {label: t('nav.platformOrganizations'), to: '/platform/organizations'},
          {label: org.name},
        ]}
        actions={
          <Link to="/platform/organizations">
            <Button type="button" variant="secondary">
              {t('platform.orgs.backList')}
            </Button>
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="v4-card" style={{marginBottom: 16}}>
        <h3 style={{marginTop: 0}}>{t('platform.orgs.sectionOverview')}</h3>
        <DetailRow label={t('platform.orgs.labelStatus')} value={<StatusBadge status={org.status} />} />
        <DetailRow label={t('platform.orgs.labelCountry')} value={org.country_code} />
        <DetailRow label={t('platform.orgs.labelCurrency')} value={org.default_currency} />
        <DetailRow label={t('platform.orgs.labelCreated')} value={formatDate(org.created_at)} />
        {kyb ? (
          <DetailRow
            label={t('platform.orgs.labelKyb')}
            value={
              <>
                <StatusBadge status={kyb.status} />{' '}
                {kyb.id ? (
                  <Link to={`/platform/kyb/${kyb.id}`}>{t('platform.orgs.openKyb')}</Link>
                ) : null}
              </>
            }
          />
        ) : null}
        {paymentsSummary ? (
          <DetailRow
            label={t('platform.orgs.labelPayments')}
            value={t('platform.orgs.paymentsSummary', {
              count: paymentsSummary.succeeded_count ?? 0,
              volume: paymentsSummary.succeeded_volume_minor ?? '0',
            })}
          />
        ) : null}
        <Can anyOf={['platform.organizations.manage', 'platform.admin']}>
          <div className="v4-toolbar" style={{marginTop: 12, flexWrap: 'wrap', gap: 8}}>
            <Field label={t('security.users.labelTotp')}>
              <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            </Field>
            {org.status !== 'SUSPENDED' ? (
              <Button type="button" variant="secondary" disabled={busy || !totp} onClick={() => void setStatus('SUSPENDED')}>
                {t('platform.orgs.suspend')}
              </Button>
            ) : (
              <Button type="button" disabled={busy || !totp} onClick={() => void setStatus('ACTIVE')}>
                {t('platform.orgs.activate')}
              </Button>
            )}
          </div>
        </Can>
      </div>

      <Can anyOf={['platform.organizations.manage', 'platform.admin']}>
        <div className="v4-card" style={{marginBottom: 16}}>
          <h3 style={{marginTop: 0}}>{t('platform.orgs.sectionSettings')}</h3>
          <form onSubmit={saveSettings} className="v4-toolbar" style={{flexWrap: 'wrap', gap: 8, alignItems: 'end'}}>
            <Field label={t('common.name')}>
              <input
                required
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({...settingsForm, name: e.target.value})}
              />
            </Field>
            <Field label={t('common.currency')}>
              <input
                maxLength={3}
                value={settingsForm.default_currency}
                onChange={(e) => setSettingsForm({...settingsForm, default_currency: e.target.value.toUpperCase()})}
                placeholder="USD"
              />
            </Field>
            <Field label={t('platform.orgs.labelLocale')}>
              <input
                value={settingsForm.locale}
                onChange={(e) => setSettingsForm({...settingsForm, locale: e.target.value})}
                placeholder="en"
              />
            </Field>
            <Field label={t('platform.orgs.labelTimezone')}>
              <input
                value={settingsForm.timezone}
                onChange={(e) => setSettingsForm({...settingsForm, timezone: e.target.value})}
                placeholder="UTC"
              />
            </Field>
            <Button type="submit" disabled={settingsBusy}>
              {settingsBusy ? t('common.saving') : t('common.save')}
            </Button>
          </form>
        </div>
      </Can>

      {(merchant || legal) && (
        <div className="v4-card" style={{marginBottom: 16}}>
          <h3 style={{marginTop: 0}}>{t('platform.orgs.sectionMerchant')}</h3>
          {merchant ? (
            <>
              <DetailRow label={t('platform.orgs.labelTradingName')} value={merchant.trading_name} />
              <DetailRow label={t('platform.orgs.labelWebsite')} value={merchant.website} />
              <DetailRow label={t('platform.orgs.labelSupportEmail')} value={merchant.support_email} />
            </>
          ) : null}
          {legal ? (
            <>
              <DetailRow label={t('platform.kyb.labelLegal')} value={`${legal.legal_name} — ${legal.registration_number || '—'}`} />
              <DetailRow label={t('platform.orgs.labelEntityType')} value={legal.legal_entity_type_code} />
              <DetailRow label={t('platform.orgs.labelTaxId')} value={legal.tax_id || legal.vat_number} />
            </>
          ) : null}
          {business ? (
            <DetailRow label={t('platform.orgs.labelBusiness')} value={`${business.business_type_code || '—'} / ${business.industry_code || '—'}`} />
          ) : null}
        </div>
      )}

      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24}}>
        <h3 style={{margin: 0}}>{t('platform.orgs.sectionPayments')}</h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() => exportCsv(token, () => v4.downloadPlatformOrganizationPaymentsCsv(token, organizationId), setError)}
        >
          {t('common.exportCsv')}
        </Button>
      </div>
      {paymentsLoading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('common.amount'),
            t('common.status'),
            t('platform.orgs.colProvider'),
            t('platform.orgs.colInvoiceRef'),
            t('common.date'),
          ]}
          rows={payments.map((p) => [
            formatMoney(p.amount_minor, p.currency_code),
            <StatusBadge status={p.status} />,
            p.provider_code || '—',
            p.external_invoice_ref || '—',
            formatDate(p.captured_at || p.created_at),
          ])}
          empty={<p>{t('platform.orgs.paymentsEmpty')}</p>}
        />
      )}

      <h3 style={{marginTop: 24}}>{t('platform.orgs.sectionMembers')}</h3>
      <DataTable
        columns={[t('common.email'), t('platform.team.name'), t('platform.team.role'), t('common.status')]}
        rows={(detail.members || []).map((m: any) => [
          m.email,
          m.name || '—',
          (m.roles || []).join(', ') || '—',
          <StatusBadge status={m.status} />,
        ])}
        empty={<p>{t('platform.orgs.membersEmpty')}</p>}
      />

      <h3 style={{marginTop: 24}}>{t('platform.kyb.documents')}</h3>
      <DataTable
        columns={[
          t('merchant.documents.colType'),
          t('merchant.documents.colDocument'),
          t('common.status'),
          t('platform.kyb.colFile'),
          t('platform.kyb.colActions'),
        ]}
        rows={(detail.documents || []).map((d: any) => [
          d.document_type_code,
          d.file_name || shortId(d.id),
          <StatusBadge status={d.status} />,
          d.has_file ? t('common.uploaded') : '—',
          d.has_file ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void v4.openAdminDocument(token, d.id).catch((e) => setError(e.message))}
            >
              {t('common.view')}
            </Button>
          ) : (
            '—'
          ),
        ])}
        empty={<p>{t('platform.orgs.documentsEmpty')}</p>}
      />

      <h3 style={{marginTop: 24}}>{t('platform.orgs.sectionRecentAudit')}</h3>
      <DataTable
        columns={[t('security.audit.colAction'), t('security.audit.colActor'), t('common.date')]}
        rows={(detail.recent_audit || []).map((e: any) => [
          formatEventAction(e.action, locale),
          formatActor(e),
          formatDate(e.created_at),
        ])}
        empty={<p>{t('platform.orgs.auditEmpty')}</p>}
      />
    </div>
  );
}

type ObsTab = 'audit' | 'security' | 'errors';

export function PlatformObservabilityPage() {
  const {t, locale} = useI18n();
  const {token} = useAuth();
  const [tab, setTab] = useState<ObsTab>('audit');
  const [rows, setRows] = useState<any[]>([]);
  const [orgFilter, setOrgFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    const q = orgFilter.trim() ? `?organization_id=${encodeURIComponent(orgFilter.trim())}` : '';
    const loader =
      tab === 'audit'
        ? v4.platformAuditEvents(token, q)
        : tab === 'security'
          ? v4.platformSecurityEvents(token, q)
          : v4.platformErrorReports(token, q);
    loader
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, tab]);

  const title =
    tab === 'audit'
      ? t('platform.obs.auditTitle')
      : tab === 'security'
        ? t('platform.obs.securityTitle')
        : t('platform.obs.errorsTitle');

  return (
    <div>
      <PageHeader
        title={t('platform.obs.title')}
        description={t('platform.obs.description')}
        crumbs={[{label: t('section.platform')}, {label: title}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar" style={{marginBottom: 12, flexWrap: 'wrap', gap: 8}}>
        <Field label={t('platform.obs.tab')}>
          <select value={tab} onChange={(e) => setTab(e.target.value as ObsTab)}>
            <option value="audit">{t('nav.audit')}</option>
            <option value="security">{t('nav.securityEvents')}</option>
            <option value="errors">{t('nav.errors')}</option>
          </select>
        </Field>
        <Field label={t('platform.obs.orgFilter')}>
          <input
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            placeholder={t('platform.obs.orgFilterHint')}
          />
        </Field>
        <Button type="button" variant="secondary" onClick={load} style={{alignSelf: 'end'}}>
          {t('common.refresh')}
        </Button>
        {tab === 'audit' ? (
          <Button
            type="button"
            variant="secondary"
            style={{alignSelf: 'end'}}
            onClick={() => {
              const q = orgFilter.trim() ? `?organization_id=${encodeURIComponent(orgFilter.trim())}` : '';
              exportCsv(token, () => v4.downloadPlatformAuditCsv(token, q), setError);
            }}
          >
            {t('common.exportCsv')}
          </Button>
        ) : null}
      </div>
      {loading ? (
        <LoadingState />
      ) : tab === 'audit' ? (
        <DataTable
          columns={[t('platform.obs.colOrg'), t('security.audit.colAction'), t('security.audit.colActor'), t('common.date')]}
          rows={rows.map((r) => [
            r.organization_name || shortId(r.organization_id),
            formatEventAction(r.action, locale),
            formatActor(r),
            formatDate(r.created_at),
          ])}
          empty={<p>{t('platform.obs.empty')}</p>}
        />
      ) : tab === 'security' ? (
        <DataTable
          columns={[
            t('platform.obs.colOrg'),
            t('security.events.colType'),
            t('security.audit.colActor'),
            t('common.status'),
            t('common.date'),
          ]}
          rows={rows.map((r) => [
            r.organization_name || shortId(r.organization_id),
            formatEventAction(r.event_type, locale),
            formatActor(r),
            r.success === false ? t('common.failed') : t('common.success'),
            formatDate(r.created_at),
          ])}
          empty={<p>{t('platform.obs.empty')}</p>}
        />
      ) : (
        <DataTable
          columns={[
            t('platform.obs.colOrg'),
            t('security.errors.colMessage'),
            t('security.audit.colActor'),
            t('security.errors.colRoute'),
            t('security.errors.colCode'),
            t('common.date'),
          ]}
          rows={rows.map((r) => [
            r.organization_name || shortId(r.organization_id),
            formatErrorMessage(r.message, r.error_code, locale),
            formatActor(r),
            `${r.method || ''} ${r.route || ''}`.trim() || '—',
            formatErrorCode(r.error_code, locale),
            formatDate(r.created_at),
          ])}
          empty={<p>{t('platform.obs.empty')}</p>}
        />
      )}
    </div>
  );
}
