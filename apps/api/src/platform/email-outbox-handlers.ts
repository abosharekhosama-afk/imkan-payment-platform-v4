/**
 * P16.1 — Outbox handlers for identity/invitation email events.
 */
import {getEmailTransport} from './email-transport.js';

type Payload = Record<string, unknown>;

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function buildVerificationEmail(payload: Payload) {
  const email = str(payload.email);
  const actionUrl = str(payload.action_url);
  return {
    to: email,
    subject: 'Verify your IMKAN Payments email',
    text: `Verify your email address:\n\n${actionUrl}\n\nThis link expires soon.`,
    html: `<p>Verify your email address:</p><p><a href="${actionUrl}">${actionUrl}</a></p><p>This link expires soon.</p>`,
  };
}

function buildPasswordResetEmail(payload: Payload) {
  const email = str(payload.email);
  const actionUrl = str(payload.action_url);
  return {
    to: email,
    subject: 'Reset your IMKAN Payments password',
    text: `Reset your password:\n\n${actionUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<p>Reset your password:</p><p><a href="${actionUrl}">${actionUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
  };
}

function buildInvitationEmail(payload: Payload) {
  const email = str(payload.email);
  const actionUrl = str(payload.action_url);
  const role = str(payload.role_code);
  return {
    to: email,
    subject: 'You are invited to IMKAN Payments',
    text: `You have been invited${role ? ` as ${role}` : ''}.\n\nAccept invitation:\n${actionUrl}`,
    html: `<p>You have been invited${role ? ` as <strong>${role}</strong>` : ''}.</p><p><a href="${actionUrl}">Accept invitation</a></p>`,
  };
}

function buildMfaTotpEmail(payload: Payload) {
  const email = str(payload.email);
  const secret = str(payload.secret);
  const name = str(payload.name);
  const loginUrl = str(payload.login_url) || 'https://app.imkan.local/login';
  const reason = str(payload.reason);
  const greeting = name ? `Hello ${name}` : 'Hello';
  const reasonLine =
    reason === 'platform_approved_resend'
      ? 'Platform administration approved your request for a new authenticator secret.'
      : reason === 'invitation_accepted'
        ? 'Your invitation was accepted and your account is ready.'
        : 'Your IMKAN Payments account was created successfully.';

  const text = [
    `${greeting},`,
    '',
    reasonLine,
    '',
    'Your authenticator (TOTP) secret is below. Add it to Google Authenticator, Microsoft Authenticator, or Authy.',
    '',
    `TOTP Secret: ${secret}`,
    '',
    'Steps:',
    '1) Open your authenticator app',
    '2) Choose “Enter a setup key” / “Manual entry”',
    '3) Account name: IMKAN Payments',
    `4) Paste the secret: ${secret}`,
    '5) Save, then use the 6-digit code when signing in or confirming sensitive actions',
    '',
    `Sign in: ${loginUrl}`,
    '',
    'Keep this email private. Anyone with this secret can generate login codes for your account.',
    '',
    '— IMKAN Payments Security',
  ].join('\n');

  const html = `
    <div style="font-family:Segoe UI,Tahoma,Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">
      <h2 style="margin:0 0 12px">IMKAN Payments — Authenticator setup</h2>
      <p>${greeting},</p>
      <p>${reasonLine}</p>
      <p><strong>Your TOTP secret</strong></p>
      <p style="font-size:20px;letter-spacing:0.08em;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-family:ui-monospace,Consolas,monospace">
        ${secret}
      </p>
      <ol>
        <li>Open your authenticator app</li>
        <li>Choose manual entry / setup key</li>
        <li>Account: <strong>IMKAN Payments</strong></li>
        <li>Paste the secret above</li>
        <li>Use the 6-digit code at login and for sensitive actions</li>
      </ol>
      <p><a href="${loginUrl}">Sign in to IMKAN</a></p>
      <p style="color:#64748b;font-size:13px">Keep this email private. Do not forward it.</p>
    </div>
  `;

  return {
    to: email,
    subject: 'IMKAN Payments — Your authenticator (TOTP) secret',
    text,
    html,
  };
}

export async function handleEmailOutboxEvent(eventType: string, payload: unknown): Promise<void> {
  const p = (payload || {}) as Payload;
  const transport = getEmailTransport();

  switch (eventType) {
    case 'email.verification.requested': {
      const msg = buildVerificationEmail(p);
      if (!msg.to || !str(p.action_url)) throw new Error('email.verification.requested missing email or action_url');
      await transport.send(msg);
      return;
    }
    case 'email.password_reset.requested': {
      const msg = buildPasswordResetEmail(p);
      if (!msg.to || !str(p.action_url)) throw new Error('email.password_reset.requested missing email or action_url');
      await transport.send(msg);
      return;
    }
    case 'email.mfa_totp.issued': {
      const msg = buildMfaTotpEmail(p);
      if (!msg.to || !str(p.secret)) throw new Error('email.mfa_totp.issued missing email or secret');
      await transport.send(msg);
      return;
    }
    case 'invitation.created':
    case 'platform.invitation.created': {
      const msg = buildInvitationEmail({
        ...p,
        role_code: p.role_code || (eventType === 'platform.invitation.created' ? str(p.role_code) : ''),
      });
      if (!msg.to || !str(p.action_url)) {
        throw new Error(`${eventType} missing email or action_url`);
      }
      await transport.send(msg);
      return;
    }
    case 'kyb.case.submitted': {
      const to = str(process.env.PLATFORM_KYB_NOTIFY_EMAIL);
      if (!to) return;
      const adminUrl = `${str(process.env.APP_PUBLIC_URL || process.env.CHECKOUT_BASE_URL || '').replace(/\/$/, '')}/platform/kyb/${str(p.case_id)}`;
      await transport.send({
        to,
        subject: 'KYB case submitted for review',
        text: `A merchant submitted a KYB case.\n\nCase: ${str(p.case_id)}\nOrganization: ${str(p.organization_id)}\n\nReview: ${adminUrl}`,
        html: `<p>A merchant submitted a KYB case.</p><p>Case: ${str(p.case_id)}</p><p><a href="${adminUrl}">Open review queue</a></p>`,
      });
      return;
    }
    case 'kyb.case.needs_information': {
      const to = str(p.notify_email);
      if (!to) return;
      const portal = str(p.portal_url);
      await transport.send({
        to,
        subject: 'KYB: additional information required',
        text: `Your KYB case needs more information.\n\nReason: ${str(p.reason)}\n\nReview: ${portal}`,
        html: `<p>Your KYB case needs more information.</p><p>${str(p.reason)}</p><p><a href="${portal}">Open KYB portal</a></p>`,
      });
      return;
    }
    case 'kyb.case.decided': {
      const to = str(p.notify_email);
      if (!to) return;
      const portal = str(p.portal_url);
      await transport.send({
        to,
        subject: `KYB decision: ${str(p.decision)}`,
        text: `Your KYB case was ${str(p.decision)}.\n\nReason: ${str(p.reason)}\n\n${portal}`,
        html: `<p>Decision: <strong>${str(p.decision)}</strong></p><p>${str(p.reason)}</p><p><a href="${portal}">Open KYB portal</a></p>`,
      });
      return;
    }
    default:
      return;
  }
}

export function isDeliverableEmailEvent(eventType: string): boolean {
  return (
    eventType === 'email.verification.requested' ||
    eventType === 'email.password_reset.requested' ||
    eventType === 'email.mfa_totp.issued' ||
    eventType === 'invitation.created' ||
    eventType === 'platform.invitation.created' ||
    eventType === 'kyb.case.submitted' ||
    eventType === 'kyb.case.needs_information' ||
    eventType === 'kyb.case.decided'
  );
}
