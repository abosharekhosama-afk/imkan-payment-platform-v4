import {afterEach, describe, expect, it, vi} from 'vitest';
import {handleEmailOutboxEvent, isDeliverableEmailEvent} from '../apps/api/src/platform/email-outbox-handlers.js';
import {getEmailTransport, isEmailDeliveryProduction, resetEmailTransportForTests} from '../apps/api/src/platform/email-transport.js';

describe('P16.1 email production readiness', () => {
  afterEach(() => {
    resetEmailTransportForTests();
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.NODE_ENV;
    delete process.env.SMTP_HOST;
    delete process.env.EMAIL_FROM;
  });

  it('identifies all deliverable email event types', () => {
    expect(isDeliverableEmailEvent('email.verification.requested')).toBe(true);
    expect(isDeliverableEmailEvent('email.password_reset.requested')).toBe(true);
    expect(isDeliverableEmailEvent('invitation.created')).toBe(true);
    expect(isDeliverableEmailEvent('kyb.case.decided')).toBe(true);
    expect(isDeliverableEmailEvent('payment.succeeded')).toBe(false);
  });

  it('reports production delivery when SMTP configured', () => {
    process.env.EMAIL_TRANSPORT = 'smtp';
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.EMAIL_FROM = 'noreply@example.test';
    resetEmailTransportForTests();
    expect(isEmailDeliveryProduction()).toBe(true);
    expect(getEmailTransport().mode).toBe('smtp');
  });

  it('stub transport logs in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_TRANSPORT = 'stub';
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await handleEmailOutboxEvent('email.verification.requested', {
      email: 'user@example.test',
      action_url: 'http://localhost:5173/verify-email?token=abc',
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('stub transport rejects in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_TRANSPORT = 'stub';
    resetEmailTransportForTests();
    await expect(
      handleEmailOutboxEvent('email.verification.requested', {
        email: 'user@example.test',
        action_url: 'http://localhost:5173/verify-email?token=abc',
      }),
    ).rejects.toThrow(/stub is not allowed in production/i);
  });

  it('requires action_url for verification emails', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_TRANSPORT = 'stub';
    await expect(
      handleEmailOutboxEvent('email.password_reset.requested', {email: 'user@example.test'}),
    ).rejects.toThrow(/action_url/i);
  });

  it('skips KYB submitted email when platform notify address unset', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_TRANSPORT = 'stub';
    delete process.env.PLATFORM_KYB_NOTIFY_EMAIL;
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await handleEmailOutboxEvent('kyb.case.submitted', {
      case_id: 'case-1',
      organization_id: 'org-1',
      notify_email: 'merchant@example.test',
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('sends KYB decision email to merchant contact', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_TRANSPORT = 'stub';
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await handleEmailOutboxEvent('kyb.case.decided', {
      notify_email: 'merchant@example.test',
      decision: 'APPROVED',
      reason: 'All checks passed',
      portal_url: 'http://localhost:5173/merchant/kyb',
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
