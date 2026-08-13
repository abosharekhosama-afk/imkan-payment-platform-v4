/**
 * P16.1 — Email transport (stub | Brevo HTTP API | legacy SMTP).
 * Default production: brevo (HTTPS :443) — works on Render Free (SMTP ports 587/465 blocked).
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailTransportMode = 'stub' | 'brevo' | 'smtp';

export interface EmailTransport {
  readonly mode: EmailTransportMode;
  send(message: EmailMessage): Promise<void>;
}

function normalizeTransportMode(raw: string): EmailTransportMode | null {
  const mode = raw.toLowerCase().trim();
  if (mode === 'stub') return 'stub';
  if (mode === 'brevo' || mode === 'brevo-api' || mode === 'sendinblue') return 'brevo';
  if (mode === 'smtp') return 'smtp';
  return null;
}

function transportMode(): EmailTransportMode {
  const explicit = (process.env.EMAIL_TRANSPORT || '').trim();
  const normalized = explicit ? normalizeTransportMode(explicit) : null;
  if (normalized) return normalized;
  return process.env.NODE_ENV === 'production' ? 'brevo' : 'stub';
}

function senderConfig() {
  return {
    from: process.env.EMAIL_FROM || '',
    fromName: process.env.EMAIL_FROM_NAME || 'IMKAN Payments',
  };
}

class StubEmailTransport implements EmailTransport {
  readonly mode = 'stub' as const;

  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'EMAIL_TRANSPORT=stub is not allowed in production when email delivery is required. Use EMAIL_TRANSPORT=brevo (see docs/ops/BREVO_EMAIL_API_MIGRATION.md).',
      );
    }
    console.info('[email:stub]', {to: message.to, subject: message.subject});
  }
}

/** Brevo transactional email over HTTPS (port 443) — compatible with Render Free tier. */
class BrevoHttpEmailTransport implements EmailTransport {
  readonly mode = 'brevo' as const;

  async send(message: EmailMessage): Promise<void> {
    const apiKey = (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim();
    const {from, fromName} = senderConfig();
    if (!apiKey) {
      throw new Error('BREVO_API_KEY is required when EMAIL_TRANSPORT=brevo');
    }
    if (!from) {
      throw new Error('EMAIL_FROM is required when EMAIL_TRANSPORT=brevo');
    }

    const url = (process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email').replace(/\/$/, '');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {name: fromName, email: from},
        to: [{email: message.to}],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? {htmlContent: message.html} : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo API ${res.status}: ${body.slice(0, 500) || res.statusText}`);
    }
  }
}

/*
 * LEGACY SMTP transport (P16.1) — commented out while deploying on Render Free tier.
 * Render blocks outbound SMTP on ports 25, 465, and 587 → ETIMEDOUT to Brevo SMTP.
 * To re-enable: uncomment this block and set EMAIL_TRANSPORT=smtp (paid Render or non-blocked host).
 * See docs/ops/BREVO_EMAIL_API_MIGRATION.md
 *
import net from 'node:net';
import tls from 'node:tls';

function smtpConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '',
    fromName: process.env.EMAIL_FROM_NAME || 'IMKAN Payments',
  };
}

function formatFrom(): string {
  const {from, fromName} = smtpConfig();
  return fromName ? `${fromName} <${from}>` : from;
}

class SmtpEmailTransport implements EmailTransport {
  readonly mode = 'smtp' as const;

  async send(message: EmailMessage): Promise<void> {
    const {host, port, user, pass, from} = smtpConfig();
    if (!host || !from) {
      throw new Error('SMTP host and EMAIL_FROM are required when EMAIL_TRANSPORT=smtp');
    }

    const fromHeader = formatFrom();
    const body = message.html
      ? `From: ${fromHeader}\r\nTo: ${message.to}\r\nSubject: ${message.subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${message.html}`
      : `From: ${fromHeader}\r\nTo: ${message.to}\r\nSubject: ${message.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message.text}`;

    await smtpSend({host, port, user, pass, from, to: message.to, data: body});
  }
}

function readLine(socket: net.Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf('\r\n');
      if (idx >= 0) {
        socket.off('data', onData);
        socket.off('error', onError);
        resolve(buf.slice(0, idx));
      }
    };
    const onError = (err: Error) => {
      socket.off('data', onData);
      reject(err);
    };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function readSmtpResponse(socket: net.Socket, expectPrefix?: string): Promise<string> {
  const lines: string[] = [];
  while (true) {
    const line = await readLine(socket);
    lines.push(line);
    if (line.length >= 4 && line[3] === ' ') break;
  }
  const first = lines[0] || '';
  if (expectPrefix && !first.startsWith(expectPrefix)) {
    throw new Error(`SMTP unexpected response: ${lines.join(' | ')}`);
  }
  return first;
}

async function smtpSend(opts: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  data: string;
}): Promise<void> {
  const secure = opts.port === 465;
  const socket: net.Socket = secure
    ? tls.connect({host: opts.host, port: opts.port, rejectUnauthorized: true})
    : net.connect({host: opts.host, port: opts.port});

  const write = (line: string) => {
    socket.write(`${line}\r\n`);
  };

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.once(secure ? 'secureConnect' : 'connect', () => resolve());
  });

  await readSmtpResponse(socket, '220');
  write(`EHLO ${opts.host}`);
  await readSmtpResponse(socket, '250');

  if (!secure) {
    write('STARTTLS');
    await readSmtpResponse(socket, '220');
    await new Promise<void>((resolve, reject) => {
      const tlsSocket = tls.connect({socket, rejectUnauthorized: true}, () => resolve());
      tlsSocket.once('error', reject);
    });
    write(`EHLO ${opts.host}`);
    await readSmtpResponse(socket, '250');
  }

  if (opts.user && opts.pass) {
    write('AUTH LOGIN');
    await readSmtpResponse(socket, '334');
    write(Buffer.from(opts.user).toString('base64'));
    await readSmtpResponse(socket, '334');
    write(Buffer.from(opts.pass).toString('base64'));
    await readSmtpResponse(socket, '235');
  }

  write(`MAIL FROM:<${opts.from}>`);
  await readSmtpResponse(socket, '250');
  write(`RCPT TO:<${opts.to}>`);
  await readSmtpResponse(socket, '250');
  write('DATA');
  await readSmtpResponse(socket, '354');
  socket.write(`${opts.data}\r\n.\r\n`);
  await readSmtpResponse(socket, '250');
  write('QUIT');
  socket.end();
}
*/

/** Placeholder until legacy SMTP block is uncommented (see BREVO_EMAIL_API_MIGRATION.md). */
class SmtpEmailTransportDisabled implements EmailTransport {
  readonly mode = 'smtp' as const;

  async send(_message: EmailMessage): Promise<void> {
    throw new Error(
      'EMAIL_TRANSPORT=smtp is disabled (legacy SMTP code is commented out). Use EMAIL_TRANSPORT=brevo on Render Free, or uncomment SMTP in email-transport.ts — see docs/ops/BREVO_EMAIL_API_MIGRATION.md',
    );
  }
}

let transport: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (!transport) {
    const mode = transportMode();
    if (mode === 'brevo') transport = new BrevoHttpEmailTransport();
    else if (mode === 'smtp') transport = new SmtpEmailTransportDisabled();
    else transport = new StubEmailTransport();
  }
  return transport;
}

export function isEmailDeliveryProduction(): boolean {
  const mode = transportMode();
  const {from} = senderConfig();
  if (mode === 'brevo') {
    return Boolean((process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim() && from);
  }
  if (mode === 'smtp') {
    return Boolean(process.env.SMTP_HOST?.trim() && from);
  }
  return false;
}

/** Reset for tests */
export function resetEmailTransportForTests(): void {
  transport = null;
}
