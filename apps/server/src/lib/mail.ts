import type { Logger } from './logger'

export interface MailAttachment {
  filename: string
  content: Buffer
}

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
  /** A quién le llega la respuesta (el taller, no DEKOPEN). */
  replyTo?: string
  attachments?: MailAttachment[]
}

export interface Mailer {
  send: (message: MailMessage) => Promise<void>
}

/** Tiempo máximo de una llamada a Resend: si no responde, nadie queda esperando minutos. */
export const MAIL_TIMEOUT_MS = 10_000
/** Con un PDF adjunto el envío tarda más. */
const MAIL_ATTACHMENT_TIMEOUT_MS = 30_000

/**
 * Con RESEND_API_KEY envía por la API de Resend (fetch); sin clave, deja el correo
 * en la consola para que en desarrollo se pueda copiar el enlace. En producción (solo con
 * MAIL_TO_CONSOLE=1) nunca escribe el contenido: los correos llevan enlaces secretos
 * (restablecer contraseña, invitaciones) y quien lee los logs no debe poder usarlos.
 */
export function createMailer(options: { resendApiKey?: string; from: string; logger: Logger; production?: boolean; timeoutMs?: number }): Mailer {
  const { resendApiKey, from, logger } = options
  const timeoutMs = options.timeoutMs ?? MAIL_TIMEOUT_MS
  if (!resendApiKey) {
    return {
      async send(message) {
        if (options.production) logger.info(`✉  Correo sin enviar (sin RESEND_API_KEY) · ${message.subject} · contenido omitido`)
        else logger.info(`✉  Correo para ${message.to} · ${message.subject}${message.attachments?.length ? ` · ${message.attachments.length} adjunto(s)` : ''}\n${indent(message.text)}`)
      },
    }
  }
  return {
    async send(message) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          ...(message.attachments?.length ? { attachments: message.attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) } : {}),
        }),
        signal: AbortSignal.timeout(message.attachments?.length ? Math.max(timeoutMs, MAIL_ATTACHMENT_TIMEOUT_MS) : timeoutMs),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        logger.error(`No se pudo enviar el correo a ${message.to} (Resend ${res.status})`, detail.slice(0, 300))
        throw new Error(`Resend respondió ${res.status}`)
      }
    },
  }
}

/**
 * Envía sin hacer esperar a quien pidió la acción (el portal del cliente, recuperar contraseña):
 * un error o una demora del proveedor quedan en el log y nunca cambian la respuesta.
 */
export function sendInBackground(mailer: Mailer, logger: Logger, message: MailMessage, what: string): void {
  void Promise.resolve()
    .then(() => mailer.send(message))
    .catch((error: unknown) => logger.warn(`No se pudo enviar ${what}`, error instanceof Error ? error.message : error))
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `      ${l}`)
    .join('\n')
}

/**
 * Correo simple en HTML con estilo sobrio (el texto plano va siempre aparte). Todo texto se
 * escapa. `fallbackText` es la línea «si el botón no funciona…» en el idioma del destinatario
 * (services/mail la traduce); `lang` va en el atributo lang del contenedor.
 */
export function simpleHtml(
  paragraphs: string[],
  action?: { label: string; url: string },
  options: { fallbackText?: string; lang?: string } = {},
): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${escapeHtml(p)}</p>`).join('')
  const fallback = options.fallbackText ?? 'Si el botón no funciona, copia este enlace:'
  const button = action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="background:#1f2328;color:#fff;padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p><p style="margin:0;color:#6b7280;font-size:13px">${escapeHtml(fallback)} ${escapeHtml(action.url)}</p>`
    : ''
  const lang = options.lang ? ` lang="${escapeHtml(options.lang)}"` : ''
  return `<div${lang} style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1f2328;max-width:520px">${body}${button}<p style="margin:28px 0 0;color:#9ca3af;font-size:12px">DEKOPEN</p></div>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}
