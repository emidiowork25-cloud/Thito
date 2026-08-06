import { nanoid } from 'nanoid';
import nodemailer, { type Transporter } from 'nodemailer';
import { db } from './db.js';
import { settingsRepo } from './presets.js';

export type MailKind = 'signup.received' | 'signup.approved' | 'signup.rejected';

export interface OutboxEntry {
  id: string;
  to: string;
  subject: string;
  kind: MailKind;
  status: 'queued' | 'sent' | 'failed';
  error: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

interface OutboxRow {
  id: string;
  to_address: string;
  subject: string;
  body_text: string;
  body_html: string;
  kind: string;
  status: string;
  error: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
}

function toEntry(row: OutboxRow): OutboxEntry {
  return {
    id: row.id,
    to: row.to_address,
    subject: row.subject,
    kind: row.kind as MailKind,
    status: row.status as OutboxEntry['status'],
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

let transporter: Transporter | null = null;
let transportError: string | null = null;

/** True when SMTP is configured; false means mail is queued but not delivered. */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function mailStatus(): { configured: boolean; from: string | null; error: string | null } {
  return {
    configured: mailConfigured(),
    from: process.env.SMTP_FROM ?? null,
    error: transportError,
  };
}

function getTransport(): Transporter | null {
  if (!mailConfigured()) return null;
  if (transporter) return transporter;

  const port = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 and 25 upgrade via STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
  });
  return transporter;
}

// --------------------------------------------------------------------- outbox

export const outboxRepo = {
  list(limit = 50): OutboxEntry[] {
    const rows = db
      .prepare('SELECT * FROM mail_outbox ORDER BY created_at DESC LIMIT ?')
      .all(limit) as OutboxRow[];
    return rows.map(toEntry);
  },

  pending(): OutboxRow[] {
    return db
      .prepare("SELECT * FROM mail_outbox WHERE status = 'queued' AND attempts < 6 ORDER BY created_at")
      .all() as OutboxRow[];
  },

  countQueued(): number {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM mail_outbox WHERE status = 'queued'")
      .get() as { n: number };
    return row.n;
  },

  get(id: string): OutboxRow | null {
    return (db.prepare('SELECT * FROM mail_outbox WHERE id = ?').get(id) as OutboxRow) ?? null;
  },
};

// ------------------------------------------------------------------ templates

const BRAND_DARK = '#08262C';
const BRAND_PANEL = '#0B323B';
const BRAND_SKY = '#90C2E7';
const BRAND_PAPER = '#FEF7F8';

function shell(siteName: string, heading: string, inner: string): string {
  // Inline styles and a table shell — every mail client strips <style> blocks
  // and most ignore flexbox entirely.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_DARK};padding:32px 0;margin:0">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;background:${BRAND_PANEL};border:1px solid #124A59;border-radius:12px">
      <tr><td style="padding:28px 32px 8px">
        <div style="font:700 20px/1.2 Arial,Helvetica,sans-serif;color:${BRAND_PAPER};letter-spacing:.5px;text-transform:uppercase">${siteName}</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0">
        <h1 style="margin:0 0 16px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:${BRAND_SKY}">${heading}</h1>
      </td></tr>
      <tr><td style="padding:0 32px 32px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${BRAND_PAPER}">
        ${inner}
      </td></tr>
    </table>
    <div style="font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#8CA8B3;padding:16px">
      Mensagem automática — não responda a este endereço.
    </div>
  </td></tr>
</table>`;
}

function box(inner: string): string {
  return `<div style="background:${BRAND_DARK};border:1px solid #124A59;border-radius:8px;padding:16px;margin:20px 0">${inner}</div>`;
}

function credentialRow(label: string, value: string): string {
  return `<div style="margin:6px 0">
    <span style="display:inline-block;min-width:96px;color:#8CA8B3;font-size:13px">${label}</span>
    <strong style="color:${BRAND_SKY};font-family:Consolas,Menlo,monospace;font-size:16px">${value}</strong>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface Composed {
  subject: string;
  text: string;
  html: string;
}

export function composeSignupReceived(firstName: string, siteName: string): Composed {
  const name = escapeHtml(firstName);
  return {
    subject: `${siteName} — solicitação de acesso recebida`,
    text:
      `Olá, ${firstName}.\n\n` +
      `Recebemos sua solicitação de acesso ao ${siteName}.\n\n` +
      `Um administrador vai analisar o pedido. Assim que for aprovado, você ` +
      `receberá outro e-mail com o link de acesso e suas credenciais.\n\n` +
      `Não é preciso fazer mais nada agora.\n`,
    html: shell(
      siteName,
      'Solicitação recebida',
      `<p style="margin:0 0 14px">Olá, <strong>${name}</strong>.</p>
       <p style="margin:0 0 14px">Recebemos sua solicitação de acesso ao ${escapeHtml(siteName)}.</p>
       <p style="margin:0 0 14px">Um administrador vai analisar o pedido. Assim que for aprovado,
       você receberá outro e-mail com o link de acesso e suas credenciais.</p>
       <p style="margin:0;color:#8CA8B3">Não é preciso fazer mais nada agora.</p>`,
    ),
  };
}

export function composeSignupApproved(
  firstName: string,
  username: string,
  password: string,
  loginUrl: string,
  siteName: string,
): Composed {
  return {
    subject: `${siteName} — acesso aprovado`,
    text:
      `Olá, ${firstName}.\n\n` +
      `Seu acesso ao ${siteName} foi aprovado.\n\n` +
      `Link de acesso: ${loginUrl}\n` +
      `Usuário: ${username}\n` +
      `Senha:   ${password}\n\n` +
      `Esta senha é provisória — no primeiro login você será obrigado a ` +
      `definir uma nova.\n`,
    html: shell(
      siteName,
      'Acesso aprovado',
      `<p style="margin:0 0 14px">Olá, <strong>${escapeHtml(firstName)}</strong>.</p>
       <p style="margin:0 0 14px">Seu acesso ao ${escapeHtml(siteName)} foi aprovado.</p>
       ${box(
         credentialRow('Usuário', escapeHtml(username)) +
           credentialRow('Senha', escapeHtml(password)),
       )}
       <p style="margin:0 0 20px">
         <a href="${escapeHtml(loginUrl)}"
            style="display:inline-block;background:${BRAND_SKY};color:#06181D;text-decoration:none;
                   font:700 15px Arial,Helvetica,sans-serif;padding:12px 22px;border-radius:8px">
           Acessar a plataforma
         </a>
       </p>
       <p style="margin:0;color:#8CA8B3;font-size:13px">
         Esta senha é provisória — no primeiro login você será obrigado a definir uma nova.
       </p>`,
    ),
  };
}

export function composeSignupRejected(
  firstName: string,
  note: string | null,
  siteName: string,
): Composed {
  const reason = note
    ? `<p style="margin:0 0 14px">Motivo informado: <em>${escapeHtml(note)}</em></p>`
    : '';
  return {
    subject: `${siteName} — solicitação de acesso não aprovada`,
    text:
      `Olá, ${firstName}.\n\n` +
      `Sua solicitação de acesso ao ${siteName} não foi aprovada.\n` +
      (note ? `Motivo informado: ${note}\n` : '') +
      `\nSe acredita que houve engano, procure o administrador da plataforma.\n`,
    html: shell(
      siteName,
      'Solicitação não aprovada',
      `<p style="margin:0 0 14px">Olá, <strong>${escapeHtml(firstName)}</strong>.</p>
       <p style="margin:0 0 14px">Sua solicitação de acesso não foi aprovada.</p>
       ${reason}
       <p style="margin:0;color:#8CA8B3">Se acredita que houve engano, procure o administrador da plataforma.</p>`,
    ),
  };
}

// -------------------------------------------------------------------- sending

/**
 * Persists the message, then tries to deliver it.
 *
 * Queue-then-send rather than send-then-record: if delivery throws, the message
 * is still on disk and visible to an administrator, who can read the
 * credentials out of the outbox and pass them on by hand. The alternative —
 * an approved account whose credentials vanished into a failed SMTP call — has
 * no recovery path at all.
 */
export function queueMail(to: string, kind: MailKind, composed: Composed): string {
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO mail_outbox (id, to_address, subject, body_text, body_html, kind)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, to, composed.subject, composed.text, composed.html, kind);

  void flushOutbox();
  return id;
}

let flushing = false;

export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  const transport = getTransport();
  if (!transport) return;

  flushing = true;
  try {
    for (const row of outboxRepo.pending()) {
      db.prepare('UPDATE mail_outbox SET attempts = attempts + 1 WHERE id = ?').run(row.id);
      try {
        await transport.sendMail({
          from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'no-reply@localhost',
          to: row.to_address,
          subject: row.subject,
          text: row.body_text,
          html: row.body_html,
        });
        db.prepare(
          "UPDATE mail_outbox SET status = 'sent', sent_at = datetime('now'), error = NULL WHERE id = ?",
        ).run(row.id);
        transportError = null;
      } catch (err) {
        const message = (err as Error).message;
        transportError = message;
        // Six attempts then park it; a permanently bad address should not be
        // retried forever, but it stays readable in the outbox.
        const status = row.attempts + 1 >= 6 ? 'failed' : 'queued';
        db.prepare('UPDATE mail_outbox SET status = ?, error = ? WHERE id = ?').run(
          status,
          message,
          row.id,
        );
      }
    }
  } finally {
    flushing = false;
  }
}

/** Absolute URL an approved user should open. */
export function loginUrl(fallbackHost: string): string {
  const configured = process.env.THITO_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, '') + '/';
  const host = settingsRepo.read().publicHost ?? fallbackHost;
  return `https://${host}/`;
}
