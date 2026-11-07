import { describe, expect, it } from 'vitest'
import { applyLink, canCopyCurrentLink, defaultSendTemplate, docChangedSinceSent, editedSinceSent, greeting, isCompanyClient, mailtoUrl, pdfFileName, portalUrl, renderSendTemplate, replyMessage, sendTemplate, sentPriceDrift, shareMessage, unknownSendVariables, whatsappPhone, whatsappUrl } from './share'

describe('respuesta a un pedido de cambios', () => {
  it('saluda por el nombre, nombra la cotización y firma con la empresa', () => {
    const text = replyMessage({ number: 12, title: 'Casa Soto', orgName: 'Ventanas Martínez', clientName: 'Pedro Soto', locale: 'es' })
    expect(text).toBe('Hola Pedro, recibí tu mensaje sobre la cotización N° 12 (Casa Soto). Estoy preparando los cambios y te mando la versión nueva apenas esté lista.\n\nSaludos,\nVentanas Martínez')
  })
  it('sin título ni cliente sigue siendo un mensaje correcto', () => {
    expect(replyMessage({ number: 12, title: ' ', orgName: 'Taller', locale: 'es' })).toMatch(/^Hola, recibí tu mensaje sobre la cotización N° 12\. /)
  })
})

describe('compartir la cotización', () => {
  it('mensaje con saludo, enlace y versión, y sin el total', () => {
    const text = shareMessage({ number: 412, title: 'Casa Pérez', url: 'https://x/c/abc', orgName: 'Ventanas del Sur', sellerName: 'Ana Rojas', clientName: 'Carolina Muñoz', revisionLetter: 'B' })
    expect(text).toContain('Hola Carolina')
    expect(text).toContain('N° 412 (Casa Pérez), versión B.')
    expect(text).toContain('https://x/c/abc')
    expect(text).not.toMatch(/\$|IVA/)
    expect(text.trim().endsWith('Ana Rojas\nVentanas del Sur')).toBe(true)
    // La primera versión no se anuncia y sin cliente saluda igual.
    const plain = shareMessage({ number: 7, title: '', url: 'u', orgName: 'T', revisionLetter: 'A' })
    expect(plain.startsWith('Hola, te envío la cotización N° 7.')).toBe(true)
  })

  it('plantilla: sin dato no quedan huecos, y solo PDF saca la línea del enlace', () => {
    const vars = { saludo: 'Hola Ana', referencia: 'N° 3', numero: '3', obra: '', taller: 'T', vendedor: '', cliente: 'Ana', enlace: '' }
    expect(renderSendTemplate('{saludo}, la {numero} ({obra}).\nVer: {enlace}\n\nFirma {vendedor}\n{taller}', vars)).toBe('Hola Ana, la 3.\n\nT')
    expect(applyLink('Hola\nVer: {enlace}\n\nChao', false)).toBe('Hola\n\nChao')
    expect(applyLink('Hola', true)).toBe('Hola\n\n{enlace}')
    expect(unknownSendVariables('{saludo} {total} {enlace} {precio}')).toEqual(['{total}', '{precio}'])
    // {total} no existe como variable: queda a la vista para que se note, nunca se reemplaza por una cifra.
    expect(renderSendTemplate('Son {total}', vars)).toBe('Son {total}')
  })

  it('la plantilla del taller manda sobre la que trae DEKOPEN, por canal e idioma', () => {
    expect(sendTemplate({ whatsapp: { es: 'Propia {saludo}' } }, 'whatsapp', 'es')).toBe('Propia {saludo}')
    expect(sendTemplate({ whatsapp: { es: '  ' } }, 'whatsapp', 'es')).toBe(defaultSendTemplate('whatsapp', 'es'))
    expect(sendTemplate({ whatsapp: { es: 'Propia' } }, 'email', 'es')).toBe(defaultSendTemplate('email', 'es'))
  })

  it('teléfonos chilenos para WhatsApp', () => {
    expect(whatsappPhone('+56 9 5555 1234')).toBe('56955551234')
    expect(whatsappPhone('9 5555 1234')).toBe('56955551234')
    expect(whatsappPhone('5555 1234')).toBe('56955551234')
    expect(whatsappPhone('')).toBe('')
    expect(whatsappUrl('hola y chao', '955551234')).toBe('https://wa.me/56955551234?text=hola%20y%20chao')
    expect(whatsappUrl('hola')).toBe('https://wa.me/?text=hola')
  })

  it('correo con asunto y cuerpo codificados', () => {
    expect(mailtoUrl({ to: 'ana@example.cl', subject: 'Cotización N° 1', body: 'a&b' })).toBe('mailto:ana@example.cl?subject=Cotizaci%C3%B3n%20N%C2%B0%201&body=a%26b')
    expect(mailtoUrl({ subject: 's', body: 'b' })).toBe('mailto:?subject=s&body=b')
  })

  it('nombre de archivo sin tildes ni símbolos', () => {
    expect(pdfFileName(412, 'Casa Pérez · Concepción')).toBe('Cotizacion-412-Casa-Perez-Concepcion.pdf')
    expect(pdfFileName(412, 'Casa', 'B')).toBe('Cotizacion-412-B-Casa.pdf')
    expect(pdfFileName(5, '')).toBe('Cotizacion-5.pdf')
  })

  it('enlace del portal y cambios desde el último envío', () => {
    expect(portalUrl('tok', 'https://app.dekopen.cl')).toBe('https://app.dekopen.cl/c/tok')
    expect(portalUrl(undefined, 'https://a')).toBe('')
    const sent = '2026-10-31T12:00:00.000Z'
    expect(editedSinceSent({ revision: 0, updatedAt: sent }, false)).toBe(true)
    expect(editedSinceSent({ revision: 1, sentAt: sent, updatedAt: sent }, false)).toBe(false)
    expect(editedSinceSent({ revision: 1, sentAt: sent, updatedAt: sent }, true)).toBe(true)
    expect(editedSinceSent({ revision: 1, sentAt: sent, updatedAt: '2026-10-31T12:05:00.000Z' }, false)).toBe(true)
  })

  it('a una empresa se le saluda sin su nombre; a una persona, por su nombre de pila', () => {
    const company = shareMessage({ number: 2, title: 'Edificio', url: 'u', orgName: 'T', clientName: 'Constructora Los Aromos SpA' })
    expect(company.startsWith('Hola, te envío la cotización N° 2')).toBe(true)
    expect(greeting('Inmobiliaria del Valle')).toBe('Hola')
    expect(greeting('Vidrios Pérez Ltda.')).toBe('Hola')
    expect(greeting('Comercial Sur Limitada')).toBe('Hola')
    expect(greeting('Ventanas del Norte S.A.')).toBe('Hola')
    expect(greeting('Arquitectos Asociados SPA')).toBe('Hola')
    expect(greeting('Juan Soto E.I.R.L.')).toBe('Hola')
    // RUT de persona jurídica (≥ 50.000.000) aunque el nombre no lo diga.
    expect(greeting('Los Aromos', '76.543.210-3')).toBe('Hola')
    expect(isCompanyClient('María José Fuentes', '12.345.678-5')).toBe(false)
    expect(greeting('María José Fuentes', '12.345.678-5')).toBe('Hola María')
    expect(greeting('Isabel Sanhueza')).toBe('Hola Isabel')
    expect(greeting('  ')).toBe('Hola')
    expect(greeting(undefined)).toBe('Hola')
  })

  it('precios que cambiaron desde el envío: el editor lo nota y reenviar crea la versión siguiente', () => {
    const sentAt = '2026-10-31T12:00:00.000Z'
    // Enviada (versión A) por $262.990 y sin guardar nada después; hoy el motor suma $213.248.
    const meta = { revision: 1, sentAt, updatedAt: sentAt, totals: { total: 262_990 } }
    expect(sentPriceDrift(meta, 213_248)).toEqual({ sent: 262_990, now: 213_248, exact: true })
    expect(editedSinceSent(meta, false, 213_248)).toBe(true)
    // Mismo total (redondeo incluido): no hay nada que avisar ni reenviar.
    expect(sentPriceDrift(meta, 262_990.4)).toBeNull()
    expect(editedSinceSent(meta, false, 262_990)).toBe(false)
    // Sin total vivo se comporta como antes (solo cambios del documento).
    expect(editedSinceSent(meta, false)).toBe(false)
    // Sin enviar o sin totales guardados no hay comparación posible.
    expect(sentPriceDrift({ revision: 0, updatedAt: sentAt, totals: { total: 1 } }, 2)).toBeNull()
    expect(sentPriceDrift({ revision: 1, sentAt, updatedAt: sentAt }, 2)).toBeNull()
    // Con algo guardado después del envío (otro estado, aceptación) la cifra ya no es exacta.
    const later = { ...meta, updatedAt: '2026-10-31T13:00:00.000Z' }
    expect(sentPriceDrift(later, 213_248)).toEqual({ sent: 262_990, now: 213_248, exact: false })
  })

  it('copiar el enlace vigente no depende de tus precios: solo de si el documento cambió', () => {
    const sentAt = '2026-10-31T12:00:00.000Z'
    // Aceptada por $622.846; tus precios cambiaron y hoy suma $679.252.
    const meta = { revision: 1, sentAt, updatedAt: sentAt, totals: { total: 622_846 }, status: 'accepted', shareToken: 'tok' }
    expect(editedSinceSent(meta, false, 679_252)).toBe(true)
    expect(docChangedSinceSent(meta, false)).toBe(false)
    expect(canCopyCurrentLink(meta, false)).toBe(true)
    // Con cambios del documento (pendientes o guardados después del envío) el enlace muestra otra cosa.
    expect(canCopyCurrentLink(meta, true)).toBe(false)
    expect(canCopyCurrentLink({ ...meta, updatedAt: '2026-10-31T12:10:00.000Z' }, false)).toBe(false)
    // Sin enlace, en borrador o nunca enviada: no hay nada vigente que copiar.
    expect(canCopyCurrentLink({ ...meta, shareToken: undefined }, false)).toBe(false)
    expect(canCopyCurrentLink({ ...meta, status: 'draft' }, false)).toBe(false)
    expect(canCopyCurrentLink({ ...meta, revision: 0, sentAt: undefined }, false)).toBe(false)
  })
})
