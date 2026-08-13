import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Select} from '../../design-system/Select';
import {FormSection} from '../../components/FormSection';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {useMasterOptions} from '../../hooks/useMasterOptions';
import {obtainStepUp} from '../../rbac/stepUp';
import {formatDate, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';

export function BankAccountsPage() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('bank.manage');
  const {push} = useToast();
  const payoutMethods = useMasterOptions(token, 'payout-methods');
  const countries = useMasterOptions(token, 'countries');
  const currencies = useMasterOptions(token, 'currencies');
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [totp, setTotp] = useState('');
  const [actionTotp, setActionTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);
  const [form, setForm] = useState({
    payout_method_code: 'BANK_TRANSFER',
    currency_code: 'SAR',
    country_code: 'SA',
    bank_name: '',
    account_holder_name: '',
    account_type: 'IBAN' as 'IBAN' | 'ACCOUNT_NUMBER',
    account_value: '',
    swift_bic: '',
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.bankAccounts(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const runAccountAction = async (fn: (stepUpToken?: string) => Promise<unknown>, okMsg: string) => {
    if (!token) return;
    setError('');
    try {
      const step = await obtainStepUp(token, actionTotp);
      if (step.enrolled && step.mfaSecret) {
        setMfaSecretOnce(step.mfaSecret);
        setError(t('merchant.bank.mfaEnrolled'));
        return;
      }
      if (!step.stepUpToken) throw new Error('Step-up token required');
      await fn(step.stepUpToken);
      push(okMsg);
      setActionTotp('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="v4-form-page">
      <PageHeader
        title={t('merchant.bank.title')}
        description={t('merchant.bank.description')}
        crumbs={[{label: t('section.merchant')}, {label: t('nav.bankAccounts')}]}
        actions={
          <Link to="/onboarding">
            <Button type="button" variant="secondary">
              {t('merchant.profile.backOnboarding')}
            </Button>
          </Link>
        }
      />
      <Alert tone="info">{t('merchant.bank.stripeMoneyPath')}</Alert>
      <Alert tone="warning">{t('merchant.bank.optionalAlert')}</Alert>
      <Alert tone="info">{t('merchant.bank.reviewHint')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mfaSecretOnce ? (
        <Alert tone="warning">
          {t('merchant.bank.mfaEnrolledSave')} <code>{mfaSecretOnce}</code>
        </Alert>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {canManage ? (
            <Field label={t('merchant.bank.actionsTotp')}>
              <input
                value={actionTotp}
                onChange={(e) => setActionTotp(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Field>
          ) : null}
          <DataTable
            columns={[
              t('merchant.bank.colAccount'),
              t('common.status'),
              t('merchant.bank.colDefault'),
              t('common.created'),
              '',
            ]}
            rows={rows.map((r) => [
              shortId(r.id),
              <StatusBadge status={r.status} />,
              r.is_default ? t('common.yes') : t('common.no'),
              formatDate(r.created_at),
              canManage ? (
                <span style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                  {r.status === 'VERIFIED' || r.status === 'DEACTIVATED' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void runAccountAction(
                          (step) => v4.activateBankAccount(token, r.id, step),
                          t('merchant.bank.activated'),
                        )
                      }
                    >
                      {t('merchant.bank.activate')}
                    </Button>
                  ) : null}
                  {r.status === 'ACTIVE' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void runAccountAction(
                          (step) => v4.deactivateBankAccount(token, r.id, undefined, step),
                          t('merchant.bank.deactivated'),
                        )
                      }
                    >
                      {t('merchant.bank.deactivate')}
                    </Button>
                  ) : null}
                  {r.status === 'ACTIVE' && !r.is_default ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void runAccountAction(
                          (step) => v4.setDefaultBankAccount(token, r.id, step),
                          t('merchant.bank.defaultSet'),
                        )
                      }
                    >
                      {t('merchant.bank.setDefault')}
                    </Button>
                  ) : null}
                </span>
              ) : (
                '—'
              ),
            ])}
            empty={<p style={{color: 'var(--v4-text-muted)'}}>{t('merchant.bank.empty')}</p>}
          />
        </>
      )}

      <form
        className="v4-form-section"
        style={{marginTop: 16}}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canManage || !token) return;
          setSaving(true);
          setError('');
          void (async () => {
            try {
              const step = await obtainStepUp(token, totp);
              if (step.enrolled && step.mfaSecret) {
                setMfaSecretOnce(step.mfaSecret);
                setError(t('merchant.bank.mfaEnrolled'));
                return;
              }
              if (!step.stepUpToken) throw new Error('Step-up token required');
              await v4.createBankAccount(
                token,
                {
                  payout_method_code: form.payout_method_code,
                  currency_code: form.currency_code,
                  country_code: form.country_code,
                  bank_name: form.bank_name.trim(),
                  account_holder_name: form.account_holder_name.trim(),
                  account_type: form.account_type,
                  account_value: form.account_value.trim(),
                  swift_bic: form.swift_bic.trim() || undefined,
                },
                step.stepUpToken,
              );
              push(t('toast.bankAccountCreated'));
              setTotp('');
              setMfaSecretOnce(null);
              load();
            } catch (err: any) {
              setError(err.message || 'Failed to create bank account');
            } finally {
              setSaving(false);
            }
          })();
        }}
      >
        <fieldset disabled={!canManage || saving} style={{border: 0, margin: 0, padding: 0}}>
          <FormSection title={t('merchant.bank.addAccount')} description={t('merchant.bank.formHint')}>
            <Field label={t('merchant.bank.payoutMethod')}>
              <Select
                value={form.payout_method_code}
                onChange={(payout_method_code) => setForm({...form, payout_method_code})}
                options={payoutMethods.options.map((o) => ({value: o.code, label: o.name}))}
              />
            </Field>
            <Field label={t('merchant.bank.currency')}>
              <Select
                value={form.currency_code}
                onChange={(currency_code) => setForm({...form, currency_code})}
                options={currencies.options.map((o) => ({value: o.code, label: `${o.code} — ${o.name}`}))}
              />
            </Field>
            <Field label={t('merchant.bank.country')}>
              <Select
                value={form.country_code}
                onChange={(country_code) => setForm({...form, country_code})}
                options={countries.options.map((o) => ({value: o.code, label: `${o.name} (${o.code})`}))}
              />
            </Field>
            <Field label={t('merchant.bank.bankName')}>
              <input
                required
                value={form.bank_name}
                onChange={(e) => setForm({...form, bank_name: e.target.value})}
              />
            </Field>
            <Field label={t('merchant.bank.holderName')}>
              <input
                required
                value={form.account_holder_name}
                onChange={(e) => setForm({...form, account_holder_name: e.target.value})}
              />
            </Field>
            <Field label={t('merchant.bank.accountType')}>
              <Select
                value={form.account_type}
                onChange={(account_type) =>
                  setForm({...form, account_type: account_type as 'IBAN' | 'ACCOUNT_NUMBER'})
                }
                options={[
                  {value: 'IBAN', label: 'IBAN'},
                  {value: 'ACCOUNT_NUMBER', label: t('merchant.bank.accountNumber')},
                ]}
              />
            </Field>
            <Field label={t('merchant.bank.iban')}>
              <input
                required
                value={form.account_value}
                onChange={(e) => setForm({...form, account_value: e.target.value})}
              />
            </Field>
            <Field label={t('merchant.bank.swift')}>
              <input
                value={form.swift_bic}
                onChange={(e) => setForm({...form, swift_bic: e.target.value})}
              />
            </Field>
            <Field label={t('merchant.bank.totp')} hint={t('merchant.bank.totpHint')}>
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
              />
            </Field>
          </FormSection>
          <Can anyOf={['bank.manage']}>
            <Button type="submit" disabled={saving}>
              {saving ? t('common.saving') : t('merchant.bank.create')}
            </Button>
          </Can>
        </fieldset>
      </form>
    </div>
  );
}
