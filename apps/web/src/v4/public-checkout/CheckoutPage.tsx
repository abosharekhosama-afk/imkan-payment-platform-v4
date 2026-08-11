import React, {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {v4} from '../api/endpoints';
import {Alert, Button, Field} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';
import {formatMoney} from '../utils/money';
import {usePlatformRuntime} from '../hooks/usePlatformRuntime';

/**
 * Public V4 Checkout — /checkout/:token → /api/v1/checkout/:token
 * Sandbox tokens only (no PAN/CVV). Magic tokens: tok_ok, FAIL, TIMEOUT, AMBIGUOUS.
 */
export function CheckoutPage() {
  const {t} = useI18n();
  const {token: linkToken = ''} = useParams();
  const {runtime, allowSandboxTokens} = usePlatformRuntime();
  const [page, setPage] = useState<any>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState({name: '', email: ''});
  const [methodToken, setMethodToken] = useState('tok_ok');

  useEffect(() => {
    if (!linkToken) return;
    v4.checkoutPage(linkToken)
      .then(setPage)
      .catch((e) => setError(e.message));
  }, [linkToken]);

  const startSession = async () => {
    setBusy(true);
    setError('');
    try {
      const session = await v4.checkoutSession(linkToken, {
        customer_name: customer.name || undefined,
        customer_email: customer.email || undefined,
      });
      const st = session.session?.public_token || session.public_token || session.session_token;
      if (!st) throw new Error('Checkout session missing public_token');
      setSessionToken(st);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!sessionToken) return;
    setBusy(true);
    setError('');
    try {
      const paid = await v4.checkoutPay(linkToken, {
        session_token: sessionToken,
        payment_method_type_code: 'CARD',
        payment_method_token: methodToken,
      });
      if (paid.status === 'REQUIRES_ACTION') {
        const redirectUrl = paid.redirect_url || paid.action?.url;
        if (redirectUrl) {
          window.location.href = String(redirectUrl);
          return;
        }
        setError(t('checkout.requiresAction'));
        return;
      }
      const intentStatus = paid.intent?.status || paid.payment_intent?.status || paid.status;
      const successUrl = paid.success_url || page?.link?.success_url || page?.success_url;
      const cancelUrl = paid.cancel_url || page?.link?.cancel_url || page?.cancel_url;
      if (String(intentStatus).includes('SUCCEED') && successUrl) {
        window.location.href = String(successUrl);
        return;
      }
      if ((String(intentStatus).includes('FAIL') || paid.status === 'FAILED') && cancelUrl) {
        window.location.href = String(cancelUrl);
        return;
      }
      setResult(paid);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const branding = page?.branding || page?.config || {};
  const link = page?.link || page?.payment_link || page;
  const primary = branding.brand_primary_color || branding.primary_color || '#0b6e4f';
  const company = branding.company_display_name || link?.title || t('checkout.title');

  if (error && !page) {
    return (
      <div className="v4-checkout">
        <div className="v4-checkout-card">
          <Alert tone="danger">{error}</Alert>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="v4-checkout">
        <div className="v4-checkout-card">{t('checkout.loading')}</div>
      </div>
    );
  }

  const status = result?.intent?.status || result?.payment_intent?.status || result?.status;

  return (
    <div className="v4-checkout">
      <div className="v4-checkout-card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
          <div>
            <div style={{fontSize: 12, letterSpacing: '0.08em', color: '#6941c6', fontWeight: 700}}>
              {runtime.labels.checkout_banner}
            </div>
            <h1 style={{margin: '0.25rem 0 0', fontFamily: 'var(--v4-font-display)', color: primary}}>{company}</h1>
          </div>
          <span className={`v4-badge ${allowSandboxTokens ? 'sandbox' : ''}`}>
            {allowSandboxTokens ? t('env.sandbox') : t('checkout.secure')}
          </span>
        </div>
        <p style={{color: 'var(--v4-text-muted)'}}>
          {link?.description || branding.description || t('checkout.description')}
        </p>
        <div className="v4-stat" style={{marginBottom: 16}}>
          <span>{t('checkout.amountDue')}</span>
          <strong>{formatMoney(link?.amount_minor, link?.currency_code || 'SAR')}</strong>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {status ? (
          <Alert tone={String(status).includes('SUCCEED') ? 'success' : String(status).includes('FAIL') ? 'danger' : 'warning'}>
            {t('checkout.paymentStatus', {status})}
            <div style={{marginTop: 8, fontSize: 13}}>
              {t('checkout.processedViaProvider', {provider: result?.provider_code || 'provider'})}
            </div>
          </Alert>
        ) : null}
        {sessionToken && !status && result?.status === 'REQUIRES_ACTION' ? (
          <Alert tone="info">{t('checkout.redirecting')}</Alert>
        ) : null}
        {!sessionToken && !status ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void startSession();
            }}
          >
            <Field label={t('checkout.name')}>
              <input value={customer.name} onChange={(e) => setCustomer({...customer, name: e.target.value})} />
            </Field>
            <Field label={t('common.email')}>
              <input
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer({...customer, email: e.target.value})}
              />
            </Field>
            <Button type="submit" disabled={busy} style={{width: '100%', background: primary}}>
              {t('checkout.continue')}
            </Button>
          </form>
        ) : null}
        {sessionToken && !status ? (
          allowSandboxTokens ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void pay();
              }}
            >
              <Alert tone="info">{t('checkout.sandboxAlert')}</Alert>
              <Field label={t('checkout.sandboxToken')} hint={t('checkout.sandboxTokenHint')}>
                <select value={methodToken} onChange={(e) => setMethodToken(e.target.value)}>
                  <option value="tok_ok">tok_ok — succeed</option>
                  <option value="tok_FAIL">tok_FAIL — fail</option>
                  <option value="tok_TIMEOUT">tok_TIMEOUT — timeout</option>
                  <option value="tok_AMBIGUOUS">tok_AMBIGUOUS — ambiguous</option>
                </select>
              </Field>
              <Button type="submit" disabled={busy} style={{width: '100%', background: primary}}>
                {busy ? t('checkout.processing') : t('checkout.paySecurely')}
              </Button>
            </form>
          ) : (
            <Alert tone="warning">{t('checkout.productionAlertLong')}</Alert>
          )
        ) : null}
      </div>
    </div>
  );
}
