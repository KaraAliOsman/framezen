import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMailer } from '../src/lib/mail'
import { quoteSentMail } from '../src/services/mail'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Resend', () => {
  it('envía reply_to y adjuntos con el formato de la API (filename y content en Base64)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const mailer = createMailer({ resendApiKey: 'prueba', from: 'DEKOPEN <hola@ejemplo.cl>', logger })
    await mailer.send({ to: 'a@ejemplo.cl', subject: 'Hola', text: 'Texto', replyTo: 'taller@ejemplo.cl', attachments: [{ filename: 'Cotizacion.pdf', content: Buffer.from('%PDF') }] })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(String(init.body))
    expect(body.reply_to).toBe('taller@ejemplo.cl')
    expect(body.replyTo).toBeUndefined()
    expect(body.to).toEqual(['a@ejemplo.cl'])
    expect(body.attachments).toEqual([{ filename: 'Cotizacion.pdf', content: Buffer.from('%PDF').toString('base64') }])
  })
})

describe('correo de cotización', () => {
  it('sin enlace no promete aceptar en línea', () => {
    const mail = quoteSentMail('es', { number: 12, orgName: 'Taller' })
    expect(mail.text).toContain('Va adjunta en PDF.')
    expect(mail.text).not.toContain('en línea')
  })

  it('con enlace sí lo ofrece', () => {
    const mail = quoteSentMail('es', { number: 12, orgName: 'Taller', url: 'https://ejemplo.cl/c/x' })
    expect(mail.text).toContain('aceptarla en línea')
  })
})
