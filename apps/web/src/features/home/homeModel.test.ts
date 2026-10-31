import { describe, expect, it } from 'vitest'
import type { QuoteStatus, QuoteSummary } from '@framezen/shared'
import {
  activityTone,
  buildFunnel,
  callName,
  daysSince,
  followUpMessage,
  followUpText,
  greeting,
  hourIn,
  isEmptyAccount,
  looksLikeCompany,
  monthKey,
  monthName,
  monthSales,
  portalLink,
  previousMonthKey,
  quotesListLink,
  whatsappNumber,
  whatsappUrl,
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

describe('embudo', () => {
  it('arma las 4 etapas en orden con conteo, monto y enlace filtrado', () => {
    const byStatus = emptyByStatus()
    byStatus.draft = { count: 3, total: 1_200_000 }
    byStatus.sent = { count: 2, total: 2_674_538 }
    byStatus.accepted = { count: 1, total: 900_000 }
    byStatus.workshop = { count: 4, total: 5_000_000 }
    byStatus.rejected = { count: 9, total: 9_999_999 }
    const funnel = buildFunnel({ byStatus })
    expect(funnel.map((s) => s.label)).toEqual(['Borradores', 'Enviadas', 'Aceptadas', 'En taller'])
    expect(funnel.map((s) => s.count)).toEqual([3, 2, 1, 4])
    expect(funnel[1].total).toBe(2_674_538)
    expect(funnel[0].to).toBe('/cotizaciones?estado=draft')
    expect(quotesListLink('workshop')).toBe('/cotizaciones?estado=workshop')
  })

  it('sin datos devuelve ceros, nunca falla', () => {
    const funnel = buildFunnel(undefined)
    expect(funnel).toHaveLength(4)
    expect(funnel.every((s) => s.count === 0 && s.total === 0)).toBe(true)
  })

  it('reconoce una cuenta nueva (ninguna cotización en ningún estado)', () => {
    const byStatus = emptyByStatus()
    expect(isEmptyAccount({ byStatus })).toBe(true)
    byStatus.rejected = { count: 1, total: 100 }
    expect(isEmptyAccount({ byStatus })).toBe(false)
    expect(isEmptyAccount(undefined)).toBe(false)
  })
})

describe('vendido del mes', () => {
  const now = chile('2026-10-31T10:00:00')

  it('separa este mes del anterior por fecha de aceptación en Chile', () => {
    const won = [
      summary({ status: 'accepted', acceptedAt: '2026-10-05T15:00:00.000Z', total: 1_000_000 }),
      summary({ status: 'workshop', acceptedAt: '2026-10-20T15:00:00.000Z', total: 500_000 }),
      summary({ status: 'installed', acceptedAt: '2026-09-10T15:00:00.000Z', total: 1_000_000 }),
      // 1 de octubre 01:00 UTC = 30 de septiembre 22:00 en Chile → septiembre.
      summary({ status: 'accepted', acceptedAt: '2026-10-01T01:00:00.000Z', total: 200_000 }),
      // Rechazada o sin fecha: no cuenta.
      summary({ status: 'rejected', acceptedAt: '2026-10-05T15:00:00.000Z', total: 9_000_000 }),
      summary({ status: 'accepted', total: 9_000_000 }),
      // Agosto: fuera de ambos meses.
      summary({ status: 'closed', acceptedAt: '2026-08-10T15:00:00.000Z', total: 7_000_000 }),
    ]
    const sales = monthSales(won, now)
    expect(sales.thisMonth).toEqual({ count: 2, total: 1_500_000, key: '2026-10' })
    expect(sales.lastMonth).toEqual({ count: 2, total: 1_200_000, key: '2026-09' })
    expect(sales.delta).toBeCloseTo(25, 5)
  })

  it('el mes en curso del servidor manda; sin ventas el mes anterior no hay porcentaje', () => {
    const sales = monthSales([], now, { count: 3, total: 2_000_000 })
    expect(sales.thisMonth.total).toBe(2_000_000)
    expect(sales.lastMonth.total).toBe(0)
    expect(sales.delta).toBeNull()
  })

  it('claves y nombres de mes', () => {
    expect(monthKey(chile('2026-01-01T00:30:00'))).toBe('2026-01')
    expect(previousMonthKey('2026-01')).toBe('2025-12')
    expect(previousMonthKey('2026-10')).toBe('2026-09')
    expect(monthName('2026-09')).toBe('septiembre')
  })
})

describe('seguimientos sugeridos', () => {
  const now = chile('2026-10-31T10:00:00')

  it('arma la frase con los días y el primer nombre del cliente', () => {
    const q = { number: 412, sentAt: chile('2026-10-25T09:00:00').toISOString(), clientName: 'Pedro Soto' }
    expect(daysSince(q.sentAt, now)).toBe(6)
    expect(followUpText(q, now)).toBe('La N° 412 lleva 6 días enviada sin respuesta: escríbele a Pedro')
    expect(followUpText({ ...q, sentAt: chile('2026-10-30T09:00:00').toISOString(), clientName: undefined }, now)).toBe(
      'La N° 412 lleva 1 día enviada sin respuesta: escríbele a tu cliente',
    )
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
    expect(portalLink('https://framezen.cl/', 'tok')).toBe('https://framezen.cl/c/tok')
    expect(portalLink('https://framezen.cl', undefined)).toBeUndefined()
  })

  it('tono de la actividad', () => {
    expect(activityTone('quote.accepted')).toBe('ok')
    expect(activityTone('quote.changes_requested')).toBe('warn')
    expect(activityTone('quote.sent')).toBe('ink')
    expect(activityTone('client.created')).toBe('neutral')
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

  it('el seguimiento nombra a la empresa completa y el WhatsApp saluda sin partirla', () => {
    const now = new Date('2026-10-31T15:00:00Z')
    const q = { number: 2, sentAt: '2026-10-25T15:00:00Z', clientName: 'Constructora Los Aromos SpA' }
    expect(followUpText(q, now)).toBe('La N° 2 lleva 6 días enviada sin respuesta: escríbele a Constructora Los Aromos SpA')
    expect(followUpMessage({ clientName: 'Constructora Los Aromos SpA', number: 2 })).toMatch(/^Hola por la cotización N° 2\./)
  })
})
