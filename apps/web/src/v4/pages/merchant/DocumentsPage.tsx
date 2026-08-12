import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {useMasterOptions} from '../../hooks/useMasterOptions';
import {formatDate, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';

export function DocumentsPage() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('documents.manage');
  const {push} = useToast();
  const docTypes = useMasterOptions(token, 'document-types');
  const [rows, setRows] = useState<any[]>([]);
  const [loadError, setLoadError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({document_type_code: 'COMPANY_REGISTRATION'});

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.documents(token)
      .then((docs) => {
        setRows(docs);
        setLoadError('');
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !token || !file) return;
    setSaving(true);
    setUploadError('');
    try {
      const intent = await v4.documentUploadIntent(token, {
        document_type_code: form.document_type_code,
        subject_type: 'ORGANIZATION',
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
      });
      const docId = intent.document?.id || intent.document_id;
      if (!docId) throw new Error(t('merchant.documents.uploadIntentMissingId'));
      await v4.uploadDocumentContent(token, docId, file);
      push(t('toast.documentUploaded'));
      setFile(null);
      setUploadError('');
      try {
        const docs = await v4.documents(token);
        setRows(docs);
        setLoadError('');
      } catch (reloadErr: any) {
        setLoadError(reloadErr.message);
      }
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('merchant.documents.title')}
        description={t('merchant.documents.description')}
        crumbs={[{label: t('section.merchant')}, {label: t('nav.documents')}]}
        actions={
          <Link to="/onboarding">
            <Button type="button" variant="secondary">
              {t('merchant.profile.backOnboarding')}
            </Button>
          </Link>
        }
      />
      <Alert tone="info">{t('merchant.documents.uploadAlertLong')}</Alert>
      {loadError ? <Alert tone="danger">{loadError}</Alert> : null}
      {uploadError ? <Alert tone="danger">{uploadError}</Alert> : null}

      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('merchant.documents.colDocument'),
            t('merchant.documents.colType'),
            t('common.status'),
            t('merchant.documents.colFile'),
            t('common.created'),
          ]}
          rows={rows.map((d) => [
            shortId(d.id),
            d.document_type_code || d.type || '—',
            <StatusBadge status={d.status} />,
            d.has_file ? t('common.yes') : t('common.pending'),
            formatDate(d.created_at),
          ])}
          empty={<p style={{color: 'var(--v4-text-muted)'}}>{t('merchant.documents.empty')}</p>}
        />
      )}

      <form className="v4-card" style={{maxWidth: 560, marginTop: 16}} onSubmit={upload}>
        <h3>{t('merchant.documents.upload')}</h3>
        <fieldset disabled={!canManage || saving} style={{border: 0, margin: 0, padding: 0}}>
          <Field label={t('merchant.documents.docType')}>
            <select
              required
              value={form.document_type_code}
              onChange={(e) => setForm({...form, document_type_code: e.target.value})}
            >
              {docTypes.options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('merchant.documents.file')} hint={t('merchant.documents.fileHint')}>
            <input
              type="file"
              required
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Field>
        </fieldset>
        <Can anyOf={['documents.manage']}>
          <Button type="submit" disabled={saving || !file}>
            {saving ? t('merchant.documents.uploading') : t('merchant.documents.upload')}
          </Button>
        </Can>
      </form>
    </div>
  );
}
