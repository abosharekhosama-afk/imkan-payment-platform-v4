import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';

type PersonKind = 'owner' | 'director' | 'representative';

export function PeoplePage() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('merchant.manage');
  const {push} = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [owners, setOwners] = useState<any[]>([]);
  const [directors, setDirectors] = useState<any[]>([]);
  const [reps, setReps] = useState<any[]>([]);
  const [kind, setKind] = useState<PersonKind>('director');
  const [form, setForm] = useState({
    full_name: '',
    ownership_percent: '100',
    role_title: '',
    title: '',
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.merchantProfile(token)
      .then((p) => {
        setOwners(p?.beneficial_owners || []);
        setDirectors(p?.directors || []);
        setReps(p?.authorized_representatives || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  if (loading) return <LoadingState />;

  const totalPeople = owners.length + directors.length + reps.length;

  return (
    <div>
      <PageHeader
        title={t('merchant.people.title')}
        description={t('merchant.people.description')}
        crumbs={[{label: t('section.merchant')}, {label: t('nav.people')}]}
        actions={
          <Link to="/onboarding">
            <Button type="button" variant="secondary">
              {t('merchant.profile.backOnboarding')}
            </Button>
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Alert tone={totalPeople > 0 ? 'success' : 'warning'}>
        {t('merchant.people.recorded', {count: totalPeople})}
      </Alert>

      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>{t('merchant.people.owners')}</h3>
        <DataTable
          columns={[t('merchant.people.colName'), t('merchant.people.ownership')]}
          rows={owners.map((p) => [p.full_name, p.ownership_percent != null ? `${p.ownership_percent}%` : '—'])}
          empty={<p style={{color: 'var(--v4-text-muted)'}}>{t('merchant.people.noOwners')}</p>}
        />
      </div>
      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>{t('merchant.people.directors')}</h3>
        <DataTable
          columns={[t('merchant.people.colName'), t('merchant.people.titleField')]}
          rows={directors.map((p) => [p.full_name, p.title || '—'])}
          empty={<p style={{color: 'var(--v4-text-muted)'}}>{t('merchant.people.noDirectors')}</p>}
        />
      </div>
      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>{t('merchant.people.representatives')}</h3>
        <DataTable
          columns={[t('merchant.people.colName'), t('merchant.people.roleTitle')]}
          rows={reps.map((p) => [p.full_name, p.role_title || '—'])}
          empty={<p style={{color: 'var(--v4-text-muted)'}}>{t('merchant.people.noReps')}</p>}
        />
      </div>

      <form
        className="v4-card"
        style={{maxWidth: 560}}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canManage || !token) return;
          setSaving(true);
          setError('');
          const body: Record<string, unknown> = {
            full_name: form.full_name.trim(),
          };
          let request: Promise<unknown>;
          if (kind === 'owner') {
            body.ownership_percent = form.ownership_percent.trim();
            request = v4.addOwner(token, body);
          } else if (kind === 'director') {
            if (form.title.trim()) body.title = form.title.trim();
            request = v4.addDirector(token, body);
          } else {
            if (form.role_title.trim()) body.role_title = form.role_title.trim();
            request = v4.addRepresentative(token, body);
          }
          void request
            .then(() => {
              push(t('toast.personAdded'));
              setForm({full_name: '', ownership_percent: '100', role_title: '', title: ''});
              load();
            })
            .catch((err) => setError(err.message))
            .finally(() => setSaving(false));
        }}
      >
        <h3>{t('merchant.people.add')}</h3>
        <fieldset disabled={!canManage || saving} style={{border: 0, margin: 0, padding: 0}}>
          <Field label={t('merchant.people.type')}>
            <select value={kind} onChange={(e) => setKind(e.target.value as PersonKind)}>
              <option value="director">{t('merchant.people.typeDirector')}</option>
              <option value="owner">{t('merchant.people.typeOwner')}</option>
              <option value="representative">{t('merchant.people.typeRep')}</option>
            </select>
          </Field>
          <Field label={t('merchant.people.fullName')}>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({...form, full_name: e.target.value})}
            />
          </Field>
          {kind === 'owner' ? (
            <Field label={t('merchant.people.ownership')} hint={t('merchant.people.ownershipHint')}>
              <input
                required
                value={form.ownership_percent}
                onChange={(e) => setForm({...form, ownership_percent: e.target.value})}
              />
            </Field>
          ) : null}
          {kind === 'director' ? (
            <Field label={t('merchant.people.titleField')}>
              <input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} />
            </Field>
          ) : null}
          {kind === 'representative' ? (
            <Field label={t('merchant.people.roleTitle')}>
              <input
                value={form.role_title}
                onChange={(e) => setForm({...form, role_title: e.target.value})}
              />
            </Field>
          ) : null}
        </fieldset>
        <Can anyOf={['merchant.manage']}>
          <Button type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('merchant.people.add')}
          </Button>
        </Can>
      </form>
    </div>
  );
}
