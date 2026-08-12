import React, {useMemo, useState} from 'react';
import {loadStripe} from '@stripe/stripe-js';
import {Elements, PaymentElement, useElements, useStripe} from '@stripe/react-stripe-js';
import {Alert, Button} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';

function StripePayButton({
  returnUrl,
  accent,
  busy,
  setBusy,
  setError,
}: {
  returnUrl: string;
  accent: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (msg: string) => void;
}) {
  const {t} = useI18n();
  const stripe = useStripe();
  const elements = useElements();

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {return_url: returnUrl},
      });
      if (result.error) {
        setError(result.error.message || t('checkout.stripeFailed'));
      }
    } catch (err: any) {
      setError(err.message || t('checkout.stripeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={pay}>
      <PaymentElement options={{layout: 'tabs', wallets: {applePay: 'never', googlePay: 'never'}}} />
      <Button type="submit" disabled={busy || !stripe} style={{width: '100%', marginTop: 16, background: accent}}>
        {busy ? t('checkout.processing') : t('checkout.paySecurely')}
      </Button>
    </form>
  );
}

export function StripePaymentSection({
  publishableKey,
  clientSecret,
  returnUrl,
  accent,
}: {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  accent: string;
}) {
  const {t} = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);

  return (
    <div>
      <Alert tone="info">{t('checkout.stripeCardHint')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Elements stripe={stripePromise} options={{clientSecret, appearance: {theme: 'stripe'}}}>
        <StripePayButton returnUrl={returnUrl} accent={accent} busy={busy} setBusy={setBusy} setError={setError} />
      </Elements>
    </div>
  );
}
