import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING, type Catalog } from '@framezen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import type { DocumentPrefs } from '@framezen/shared'
import { historyEntry, seatsLeft, withPendingChange } from './accountApi'
import { clampBox, contentBounds, dataUrlBytes, fitWithin, whiteToAlpha } from './image'
import { buildPreviewDoc } from './previewDoc'
import { pickLine, priceExample, PRICING_EXAMPLE } from './pricingExample'

const PREFS = {
  quoteTemplate: 'esencial',
  catalogTemplate: 'vitrina',
  font: 'instrument',
  showUnitPrice: true,
  showArea: true,
  showGlass: true,
  showLine: true,
  showColorSwatch: true,
  showExteriorView: false,
  paper: 'letter',
  intro: 'Hola',
  conditions: '- Precios netos',
  paymentTerms: '50 % al aceptar',
  warranty: '5 años',
  validityDays: 15,
  leadTimeText: '15 días hábiles',
} satisfies DocumentPrefs

describe('ejemplo de precio en vivo', () => {
  it('usa el catálogo del taller y responde a margen, recargo y mano de obra', () => {
    const base = priceExample(SAMPLE_CATALOG, DEFAULT_PRICING, PRICING_EXAMPLE, { defaults: SAMPLE_DEFAULTS })
    expect(base.sample).toBe(false)
    expect(base.name).toBe('Corredera 2 hojas')
    expect(base.line?.kind).toBe('sliding')
    expect(base.price.unitNet).toBeGreaterThan(0)
    // Margen 40 % sobre venta: precio ≈ costo / 0,6 (redondeado hacia arriba a $100).
    expect(base.price.unitNet).toBeGreaterThanOrEqual(base.price.cost / 0.6 - 1)
    expect(base.price.unitNet % 100).toBe(0)

    const more = priceExample(SAMPLE_CATALOG, { ...DEFAULT_PRICING, marginPct: 50 }, PRICING_EXAMPLE, { defaults: SAMPLE_DEFAULTS })
    expect(more.price.unitNet).toBeGreaterThan(base.price.unitNet)

    const markup = priceExample(SAMPLE_CATALOG, { ...DEFAULT_PRICING, marginMode: 'markup', marginPct: 40 }, PRICING_EXAMPLE, { defaults: SAMPLE_DEFAULTS })
    // Recargo 40 % sobre costo < margen 40 % sobre venta.
    expect(markup.price.unitNet).toBeLessThan(base.price.unitNet)

    const labor = priceExample(SAMPLE_CATALOG, { ...DEFAULT_PRICING, laborPerM2: 30000 }, PRICING_EXAMPLE, { defaults: SAMPLE_DEFAULTS })
    expect(labor.price.labor).toBeGreaterThan(base.price.labor)
    expect(labor.explanation.some((l) => l.label.startsWith('Mano de obra'))).toBe(true)
    expect(labor.explanation.some((l) => l.label.startsWith('Tu ganancia'))).toBe(true)
  })

  it('si el catálogo del taller no tiene precios, usa el de ejemplo y lo avisa', () => {
    const unpriced: Catalog = {
      ...SAMPLE_CATALOG,
      profiles: SAMPLE_CATALOG.profiles.map((p) => ({ ...p, priceByColor: {} })),
      items: SAMPLE_CATALOG.items.map((i) => ({ ...i, price: 0 })),
      glass: SAMPLE_CATALOG.glass.map((g) => ({ ...g, pricePerM2: 0 })),
    }
    const example = priceExample(unpriced, DEFAULT_PRICING, PRICING_EXAMPLE)
    expect(example.sample).toBe(true)
    expect(example.price.unitNet).toBeGreaterThan(0)
    expect(priceExample(null, DEFAULT_PRICING, PRICING_EXAMPLE).sample).toBe(true)
  })

  it('elige una línea del tipo pedido, prefiriendo la del taller', () => {
    expect(pickLine(SAMPLE_CATALOG, 'casement', { lineId: 'serie-60' })?.id).toBe('serie-60')
    expect(pickLine(SAMPLE_CATALOG, 'sliding', { lineId: 'serie-60' })?.kind).toBe('sliding')
  })
})

describe('cotización de muestra con los datos del taller', () => {
  it('arma ventanas con precio del motor, totales con IVA y los datos de la empresa', () => {
    const { data, sample } = buildPreviewDoc({
      org: { name: 'Ventanas Sur', accent: '#8A2E3B' },
      pricing: DEFAULT_PRICING,
      prefs: PREFS,
      catalog: SAMPLE_CATALOG,
      defaults: SAMPLE_DEFAULTS,
      number: 412,
    })
    expect(sample).toBe(false)
    expect(data.org.name).toBe('Ventanas Sur')
    expect(data.quote.number).toBe(412)
    expect(data.items).toHaveLength(3)
    expect(data.items.every((i) => i.unitPrice > 0 && i.total === i.unitPrice * i.qty)).toBe(true)
    expect(data.totals.subtotal).toBe(data.items.reduce((a, i) => a + i.total, 0))
    expect(data.totals.iva).toBe(Math.round(data.totals.net * 0.19))
    expect(data.items[0].description).toBe('Corredera 2 hojas')
  })

  it('más margen sube el total', () => {
    const a = buildPreviewDoc({ org: { name: 'X' }, pricing: DEFAULT_PRICING, prefs: PREFS, catalog: SAMPLE_CATALOG, items: 1 })
    const b = buildPreviewDoc({ org: { name: 'X' }, pricing: { ...DEFAULT_PRICING, marginPct: 55 }, prefs: PREFS, catalog: SAMPLE_CATALOG, items: 1 })
    expect(b.data.totals.total).toBeGreaterThan(a.data.totals.total)
  })
})

describe('logo', () => {
  /** Imagen w×h blanca con un rectángulo oscuro en (x, y, rw, rh). */
  function image(w: number, h: number, rect?: { x: number; y: number; w: number; h: number }, background = 255): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const inside = rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
        const v = inside ? 30 : background
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
        data[i + 3] = 255
      }
    return data
  }

  it('encuentra el dibujo dentro de márgenes blancos', () => {
    expect(contentBounds(image(20, 10, { x: 5, y: 2, w: 8, h: 4 }), 20, 10)).toEqual({ x: 5, y: 2, w: 8, h: 4 })
    expect(contentBounds(image(20, 10, { x: 5, y: 2, w: 8, h: 4 }), 20, 10, { pad: 3 })).toEqual({ x: 2, y: 0, w: 14, h: 9 })
    expect(contentBounds(image(6, 6), 6, 6)).toBeNull()
  })

  it('trata lo transparente como fondo', () => {
    const data = image(4, 4, { x: 1, y: 1, w: 2, h: 2 }, 30)
    for (let i = 0; i < data.length; i += 4) {
      const p = i / 4
      const x = p % 4
      const y = Math.floor(p / 4)
      if (!(x >= 1 && x < 3 && y >= 1 && y < 3)) data[i + 3] = 0
    }
    expect(contentBounds(data, 4, 4)).toEqual({ x: 1, y: 1, w: 2, h: 2 })
  })

  it('vuelve transparente el blanco con borde suave y deja intacto lo oscuro', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 30, 30, 30, 255, 243, 243, 243, 255])
    whiteToAlpha(data)
    expect(data[3]).toBe(0)
    expect(data[7]).toBe(255)
    expect(data[11]).toBeGreaterThan(0)
    expect(data[11]).toBeLessThan(255)
  })

  it('ajusta tamaños, cajas y mide data URLs', () => {
    expect(fitWithin(1800, 600, 900)).toEqual({ w: 900, h: 300 })
    expect(fitWithin(300, 100, 900)).toEqual({ w: 300, h: 100 })
    expect(clampBox({ x: -5, y: 90, w: 50, h: 50 }, 100, 100)).toEqual({ x: 0, y: 50, w: 50, h: 50 })
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3)
    expect(dataUrlBytes('data:image/svg+xml,%3Csvg%3E')).toBe(5)
  })
})

describe('equipo', () => {
  it('cupos libres cuentan invitaciones pendientes; sin límite es null', () => {
    const member = { userId: 'u', name: 'A', email: 'a@x', role: 'owner' as const, joinedAt: '', isYou: true }
    const invite = { id: 'i', role: 'estimator' as const, createdAt: '', expiresAt: '' }
    expect(seatsLeft({ seats: 3, members: [member], invitations: [invite] })).toBe(1)
    expect(seatsLeft({ seats: 1, members: [member], invitations: [invite] })).toBe(0)
    expect(seatsLeft({ seats: null, members: [member], invitations: [] })).toBeNull()
    expect(seatsLeft(undefined)).toBeNull()
  })
})

describe('historial de facturación', () => {
  it('traduce cada fila del servidor a una línea legible con monto y estado', () => {
    const base = { id: 'h', plan: 'pro' as const, period: 'yearly' as const, amount: 856_681, provider: 'dev', createdAt: '2026-10-31T10:00:00Z' }
    expect(historyEntry({ ...base, kind: 'subscribe', status: 'applied', appliedAt: '2026-10-31T10:00:05Z' })).toEqual({
      id: 'h',
      at: '2026-10-31T10:00:05Z',
      text: 'Plan Pro anual',
      amount: 856_681,
      status: 'paid',
    })
    expect(historyEntry({ ...base, kind: 'change', plan: 'empresa', period: 'monthly', status: 'failed' }).text).toBe('Cambio al plan Empresa mensual · no se pudo cobrar')
    expect(historyEntry({ ...base, kind: 'subscribe', status: 'pending' }).status).toBe('pending')
  })
})

describe('baja programada en el historial', () => {
  const base = { plan: 'taller' as const, period: 'monthly' as const, provider: 'dev', credit: 0 }
  const scheduledRow = { ...base, id: 's', kind: 'change', amount: 0, status: 'applied', createdAt: '2026-10-31T12:00:00Z', appliedAt: '2026-10-31T12:00:00Z' }

  it('reconoce el cambio sin cobro ni saldo como programado y no muestra $0', () => {
    const entry = historyEntry(scheduledRow)
    expect(entry.status).toBe('scheduled')
    expect(entry.amount).toBeUndefined()
    expect(entry.scheduled).toEqual({ plan: 'taller', period: 'monthly' })
    // Una subida pagada con saldo a favor (cobro $0, saldo usado) no es una baja.
    expect(historyEntry({ ...scheduledRow, plan: 'empresa', credit: 50_000 }).status).toBe('paid')
    // Si el servidor manda meta.scheduled, manda ese dato.
    expect(historyEntry({ ...scheduledRow, amount: 10, meta: { scheduled: true, at: '2026-11-30T03:00:00Z' } }).scheduled?.at).toBe('2026-11-30T03:00:00Z')
    expect(historyEntry({ ...scheduledRow, kind: 'resume', plan: 'pro' }).text).toBe('Reactivaste el plan Pro mensual')
  })

  it('marca la baja vigente con su fecha y deja las antiguas como registro', () => {
    const entries = [historyEntry({ ...scheduledRow, id: 'nueva' }), historyEntry({ ...scheduledRow, id: 'vieja', createdAt: '2026-10-01T12:00:00Z' })]
    const pending = { plan: 'taller' as const, period: 'monthly' as const, at: '2026-11-30T15:00:00Z' }
    const [current, old] = withPendingChange(entries, pending)
    expect(current!.text).toBe('Cambio al plan Taller mensual · programado para el 30-11-2026')
    expect(current!.status).toBe('scheduled')
    expect(old!.text).toBe('Programaste el cambio al plan Taller mensual')
    expect(old!.status).toBe('info')
    // Sin baja vigente (se mantuvo el plan o ya rigió): ninguna dice «programado para».
    expect(withPendingChange(entries, undefined).every((e) => !e.text.includes('programado para'))).toBe(true)
  })
})
