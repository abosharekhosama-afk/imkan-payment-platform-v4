import React from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Button} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';
import {clearAccessBlock, readAccessBlock} from '../auth/accessBlock';

export function AccountAccessPage() {
  const {t, dir} = useI18n();
  const [params] = useSearchParams();
  const stored = readAccessBlock();
  const kind = params.get('kind') === 'closed' || stored?.kind === 'closed' ? 'closed' : 'restricted';
  const org = stored?.organization_name;
  const email = stored?.support_email;
  const phone = stored?.support_phone;

  const title = kind === 'closed' ? t('access.closedTitle') : t('access.restrictedTitle');
  const body = kind === 'closed' ? t('access.closedBody') : t('access.restrictedBody');

  return (
    <div className="v4-auth-split" dir={dir}>
      <section className="v4-auth-hero" aria-hidden="true">
        <div className="v4-auth-hero-brand">
          <div className="v4-brand-mark">IMK</div>
          <div>
            <h1 style={{margin: 0, fontSize: '1.1rem', fontWeight: 800}}>{t('app.name')}</h1>
            <p style={{margin: '2px 0 0', color: '#9eb0c5', fontSize: '0.78rem'}}>{t('app.console')}</p>
          </div>
        </div>
        <div>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
      </section>
      <section className="v4-auth-panel">
        <div className="v4-card v4-login-card v4-access-card">
          <h1 style={{margin: '0 0 0.5rem', fontSize: '1.35rem'}}>{title}</h1>
          <p style={{color: 'var(--v4-text-muted)', marginTop: 0}}>{body}</p>
          {org ? (
            <p>
              <strong>{t('access.company')}</strong> {org}
            </p>
          ) : null}
          <div className="v4-access-contact">
            <strong>{t('access.contactTitle')}</strong>
            {email ? (
              <p>
                {t('common.email')}: <a href={`mailto:${email}`}>{email}</a>
              </p>
            ) : null}
            {phone ? (
              <p>
                {t('access.phone')}: <a href={`tel:${phone}`}>{phone}</a>
              </p>
            ) : null}
            {!email && !phone ? <p>{t('access.contactFallback')}</p> : null}
          </div>
          <Link to="/login" onClick={() => clearAccessBlock()} style={{display: 'block', marginTop: 16}}>
            <Button type="button" style={{width: '100%'}}>
              {t('access.backToLogin')}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
