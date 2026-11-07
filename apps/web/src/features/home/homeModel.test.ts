import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import type { QuoteFollowUp, QuoteStatus, QuoteSummary } from '@dekopen/shared'
import {
  addressee,
  buildQueue,
  callName,
  changesReplyMessage,
  clientMessages,
  daysSince,
  followUpMessage,
  greeting,
  hourIn,
  isEmptyAccount,
  linesToReview,
  looksLikeCompany,
  monthKey,
  monthName,
  portalLink,
  previousMonthKey,
  queueReason,
  quotesListLink,
  reminderChoice,
  salesDelta,
  soldBreakdown,
  whatsappNumber,
  whatsappUrl,
  whoAnswered,
  type QuoteStats,
} from './homeModel'

/** Fecha a una hora de Chile (octubre 2026 = UTC−3, horario de verano). */
const chile = (iso: string) => new Date(`${iso}-03:00`)

function emptyByStatus(): QuoteStats['byStatus'] {
  const statuses: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'workshop', 'installed', 'closed']
  return Object.fromEntries(statuses.map((s) => [s, { count: 0, total: 0 }])) as QuoteStats['byStatus']
}

function summary(partial: Partial<QuoteSummary>): QuoteSummary {
  return {
    id: 'q',
    number: 1,
    title: 'Obra',
    status: 'accepted',
    revision: 1,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    total: 0,
    units: 1,
    ...partial,
  }
}

describe('saludo según la hora de Chile', () => {
  it('buenos días de 5 a 11, buenas tardes de 12 a 19 y buenas noches de 20 a 4', () => {
    expect(greeting(chile('2026-10-31T05:00:00'))).toBe('Buenos días')
    expect(greeting(chile('2026-10-31T11:59:00'))).toBe('Buenos días')
    expect(greeting(chile('2026-10-31T12:00:00'))).toBe('Buenas tardes')
    expect(greeting(chile('2026-10-31T19:59:00'))).toBe('Buenas tardes')
    expect(greeting(chile('2026-10-31T20:00:00'))).toBe('Buenas noches')
    expect(greeting(chile('2026-10-31T00:30:00'))).toBe('Buenas noches')
    expect(greeting(chile('2026-10-31T04:59:00'))).toBe('Buenas noches')
  })

  it('usa la hora de Chile aunque el navegador esté en otra zona', () => {
    // 14:00 UTC = 11:00 en Santiago (UTC−3).
    const at = new Date('2026-10-31T14:00:00.000Z')
    expect(hourIn(at)).toBe(11)
    expect(greeting(at)).toBe('Buenos días')
    expect(greeting(at, 'Europe/Madrid')).toBe('Buenas tardes')
  })
})

describe('cifras', () => {
  it('reconoce una cuenta nueva (ninguna cotización en ningún estado)', () => {
    const byStatus = emptyByStatus()
    expect(isEmptyAccount({ byStatus })).toBe(true)
    byStatus.rejected = { count: 1, total: 100 }
    expect(isEmptyAccount({ byStatus })).toBe(false)
    expect(isEmptyAccount(undefined)).toBe(false)
  })

  it('enlace filtrado por estado', () => {
    expect(quotesListLink('workshop')).toBe('/cotizaciones?estado=workshop')
  })

  it('la variación solo existe si el mes anterior tuvo ventas', () => {
    const soldThisMonth = { count: 1, total: 1_500_000, inProduction: 0 }
    expect(salesDelta({ soldThisMonth, soldLastMonth: { count: 1, total: 1_200_000 } })).toBeCloseTo(25, 5)
    expect(salesDelta({ soldThisMonth, soldLastMonth: { count: 0, total: 0 } })).toBeUndefined()
  })

  it('claves y nombres de mes', () => {
    expect(monthKey(chile('2026-01-01T00:30:00'))).toBe('2026-01')
    expect(previousMonthKey('2026-01')).toBe('2025-12')
    expect(previousMonthKey('2026-10')).toBe('2026-09')
    expect(monthName('2026-09')).toBe('septiembre')
  })
})

describe('«1 aceptada» y «Aceptadas 0» no se contradicen', () => {
  it('la venta que pasó a taller se cuenta como en taller y su enlace lleva a Taller', () => {
    expect(soldBreakdown({ count: 1, total: 900_000, inProduction: 1 })).toEqual({ waiting: 0, inProduction: 1, to: '/taller' })
  })

  it('lo que sigue aceptado enlaza a Aceptadas, y el reparto siempre suma lo vendido', () => {
    expect(soldBreakdown({ count: 3, total: 1, inProduction: 1 })).toEqual({ waiting: 2, inProduction: 1, to: '/cotizaciones?estado=accepted' })
    expect(soldBreakdown({ count: 2, total: 1, inProduction: 0 })).toMatchObject({ waiting: 2, inProduction: 0 })
    expect(soldBreakdown({ count: 1, total: 1, inProduction: 9 })).toMatchObject({ waiting: 0, inProduction: 1 })
  })
})

describe('cola de seguimiento', () => {
  const q = (id: string, extra: Partial<QuoteFollowUp> = {}): QuoteFollowUp => ({ ...summary({ id, status: 'sent' }), ...extra })
  const changes = { id: 'a1', kind: 'changes' as const, at: '2026-10-30T12:00:00.000Z', who: 'Marcela Fuentes', message: 'x'.repeat(900) }
  const accepted = { id: 'a2', kind: 'accepted' as const, at: '2026-10-30T12:00:00.000Z', who: 'Pedro Soto' }

  it('ordena: pidió cambios, aceptó, abrió sin responder, sin abrir', () => {
    const queue = buildQueue([
      q('sin-abrir-1'),
      q('abrio', { viewedAt: '2026-10-29T12:00:00.000Z' }),
      q('sin-abrir-2'),
      q('acepto', { notices: [accepted] }),
      q('cambios', { notices: [changes] }),
    ])
    expect(queue.map((x) => x.id)).toEqual(['cambios', 'acepto', 'abrio', 'sin-abrir-1', 'sin-abrir-2'])
  })

  it('pedir cambios manda aunque el cliente la haya abierto', () => {
    expect(queueReason(q('x', { viewedAt: '2026-10-29T12:00:00.000Z', notices: [changes] }))).toBe('changes')
  })

  it('el mensaje del cliente llega entero, sin cortar', () => {
    expect(clientMessages(q('x', { notices: [changes] }))).toEqual(['x'.repeat(900)])
    expect(clientMessages(q('x', { notices: [accepted] }))).toEqual([])
  })

  it('quién respondió: lo que escribió en el portal o el cliente de la cotización', () => {
    expect(whoAnswered(q('x', { clientName: 'Otro', notices: [changes] }))).toBe('Marcela Fuentes')
    expect(whoAnswered(q('x', { clientName: 'Pedro Soto' }))).toBe('Pedro Soto')
    expect(addressee('Pedro Soto')).toBe('Pedro')
    expect(addressee('Constructora Los Aromos SpA')).toBe('Constructora Los Aromos SpA')
  })

  it('«Recordarme en» marca la opción más cercana y ninguna si no se sabe la fecha', () => {
    const now = new Date('2026-11-05T12:00:00.000Z')
    expect(reminderChoice('2026-11-08T12:00:00.000Z', now)).toBe('3')
    expect(reminderChoice('2026-11-06T11:00:00.000Z', now)).toBe('1')
    expect(reminderChoice('2026-11-12T12:00:00.000Z', now)).toBe('7')
    expect(reminderChoice(undefined, now)).toBe('')
    expect(reminderChoice('sin fecha', now)).toBe('')
  })
})

describe('aviso del catálogo', () => {
  const incomplete = { ...SAMPLE_CATALOG, profiles: [], items: [] }
  const lineId = SAMPLE_CATALOG.lines[0]!.id
  const quote = (status: QuoteStatus) => summary({ id: 'q1', title: 'Casa Soto', status, firstItem: { id: 'i', qty: 1, design: { lineId } } as unknown as QuoteSummary['firstItem'] })

  it('una cuenta sin cotizaciones en curso no recibe avisos, aunque el catálogo esté incompleto', () => {
    expect(linesToReview(incomplete, [])).toEqual([])
    expect(linesToReview(incomplete, [quote('workshop'), quote('rejected')])).toEqual([])
    expect(linesToReview(incomplete, [summary({ status: 'draft' })])).toEqual([])
  })

  it('avisa solo la línea que usa una cotización en curso, una vez, y dice cuál', () => {
    const found = linesToReview(incomplete, [quote('draft'), quote('sent')])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lineName: SAMPLE_CATALOG.lines[0]!.name, quoteId: 'q1', quoteLabel: 'Casa Soto' })
  })

  it('una línea lista no avisa', () => {
    expect(linesToReview(undefined, [quote('draft')])).toEqual([])
  })
})

describe('seguimientos sugeridos', () => {
  const now = chile('2026-10-31T10:00:00')

  it('cuenta los días completos desde el envío', () => {
    expect(daysSince(chile('2026-10-25T09:00:00').toISOString(), now)).toBe(6)
    expect(daysSince(undefined, now)).toBe(0)
  })

  it('responder a un pedido de cambios: sin enlace, porque la versión nueva aún no sale', () => {
    expect(changesReplyMessage({ clientName: 'Marcela Fuentes', number: 412 })).toBe('Hola Marcela, recibí los cambios que pediste en la cotización N° 412. Te envío la versión ajustada apenas la tenga lista.')
    expect(changesReplyMessage({ clientName: 'Constructora Los Aromos SpA', number: 2 })).toMatch(/^Hola, recibí/)
  })

  it('mensaje de WhatsApp cálido con el enlace del portal', () => {
    const text = followUpMessage({ clientName: 'Pedro Soto', number: 412, orgName: 'Ventanas Sur', link: 'https://app/c/abc' })
    expect(text).toContain('Hola Pedro, te escribo de Ventanas Sur por la cotización N° 412.')
    expect(text).toContain('https://app/c/abc')
    expect(followUpMessage({ number: 7 })).toMatch(/^Hola por la cotización N° 7\./)
  })

  it('entiende los teléfonos chilenos para wa.me', () => {
    expect(whatsappNumber('+56 9 1234 5678')).toBe('56912345678')
    expect(whatsappNumber('9 1234 5678')).toBe('56912345678')
    expect(whatsappNumber('912345678')).toBe('56912345678')
    expect(whatsappNumber('1234 5678')).toBe('56912345678')
    expect(whatsappNumber('(2) 2123 4567')).toBe('56221234567')
    expect(whatsappNumber('0056 9 8765 4321')).toBe('56987654321')
    expect(whatsappNumber('123')).toBeNull()
    expect(whatsappNumber('')).toBeNull()
    expect(whatsappUrl('9 1234 5678', 'Hola, ¿cómo va?')).toBe('https://wa.me/56912345678?text=Hola%2C%20%C2%BFc%C3%B3mo%20va%3F')
    expect(whatsappUrl(undefined, 'Hola')).toBe('https://wa.me/?text=Hola')
  })

  it('enlace del portal solo si la cotización tiene token', () => {
    expect(portalLink('https://dekopen.cl/', 'tok')).toBe('https://dekopen.cl/c/tok')
    expect(portalLink('https://dekopen.cl', undefined)).toBeUndefined()
  })
})

describe('nombres de empresa', () => {
  it('reconoce empresas chilenas y no las parte en saludos', () => {
    for (const name of ['Constructora Los Aromos SpA', 'Inversiones Soto Ltda.', 'Ventanas del Sur S.A.', 'Inmobiliaria Pocuro', 'Ingeniería y Montajes EIRL']) {
      expect(looksLikeCompany(name)).toBe(true)
      expect(callName(name)).toBe('')
    }
    for (const name of ['Pedro Soto', 'María José Fuentes', 'Sara Spano', 'Salvador Sáez']) expect(looksLikeCompany(name)).toBe(false)
    expect(callName('María José Fuentes')).toBe('María')
    expect(callName(undefined)).toBe('')
  })

  it('el WhatsApp saluda sin partir a la empresa', () => {
    expect(followUpMessage({ clientName: 'Constructora Los Aromos SpA', number: 2 })).toMatch(/^Hola por la cotización N° 2\./)
  })
})

describe('seguimiento de envíos solo PDF', () => {
  it('no dice «sin abrir»: un PDF no avisa; si entró al enlace, sí se sabe', () => {
    expect(queueReason({ sentFormat: 'pdf' })).toBe('sentPdf')
    expect(queueReason({ sentFormat: 'pdf', viewedAt: '2026-11-06T10:00:00Z' })).toBe('viewed')
    expect(queueReason({ sentFormat: 'link' })).toBe('unopened')
    expect(queueReason({})).toBe('unopened')
  })
})
