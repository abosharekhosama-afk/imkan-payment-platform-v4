/**
 * P16.1 — Vendor-neutral email transport (DEC-017: generic SMTP, no invented provider APIs).
 */
import net from 'node:net';
import tls from 'node:tls';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailTransport {
  readonly mode: 'stub' | 'smtp';
  send(message: EmailMessage): Promise<void>;
}

function transportMode(): 'stub' | 'smtp' {
  const mode = (process.env.EMAIL_TRANSPORT || (process.env.NODE_ENV === 'production' ? 'smtp' : 'stub')).toLowerCase();
  return mode === 'smtp' ? 'smtp' : 'stub';
}

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

class StubEmailTransport implements EmailTransport {
  readonly mode = 'stub' as const;

  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'EMAIL_TRANSPORT=stub is not allowed in production when email delivery is required. Configure SMTP (P16.1).',
      );
    }
    console.info('[email:stub]', {to: message.to, subject: message.subject});
  }
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

let transport: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (!transport) {
    transport = transportMode() === 'smtp' ? new SmtpEmailTransport() : new StubEmailTransport();
  }
  return transport;
}

export function isEmailDeliveryProduction(): boolean {
  const {host, from} = smtpConfig();
  return transportMode() === 'smtp' && !!host && !!from;
}

/** Reset for tests */
export function resetEmailTransportForTests(): void {
  transport = null;
}
