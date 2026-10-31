import { describe, expect, it } from 'vitest'
import { createDesign } from '@framezen/engine'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { buildQuoteDocData, contrast } from '@framezen/documents'
import type { Quote } from '@framezen/shared'
import {
  acceptNameError,
  brandColors,
  conditionLines,
  contactLinks,
  isAccepted,
  pdfFileName,
  portalItems,
  validUntil,
  visibleExtras,
} from './portalModel'

function quote(partial: Partial<Quote> = {}): Quote {
  const design = createDesign('sliding_2', { lineId: 'serie-70-corredera', width: 1800, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
  return {
    id: 'q1',
    number: 412,
    title: 'Casa Soto',
    status: 'sent',
    items: [
      { id: 'a', ref: 'V1', name: 'Ventanal', location: 'Living', qty: 2, design },
      { id: 'b', ref: 'V2', qty: 1, design: { ...design, width: 900 }, manualUnitPrice: 150_000 },
    ],
    extras: [],
    discountPct: 0,
    revision: 1,
    version: 3,
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    ...partial,
  }
}

describe('portal del cliente', () => {
  it('arma cada ventana con dibujo, medidas, descripción y el precio enviado', () => {
    const items = portalItems({ quote: quote(), catalog: { ...SAMPLE_CATALOG, updatedAt: '' }, prices: { a: { unitNet: 300_000, totalNet: 600_000 } } })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ ref: 'V1', title: 'Corredera 2 hojas', size: '1.800 × 1.200 mm', qty: 2, unitNet: 300_000, totalNet: 600_000, area: 2.16 })
    expect(items[0].layout?.width).toBe(1800)
    expect(items[0].colorName).toBeTruthy()
    expect(items[0].lineName).toMatch(/^PVC /)
    // Sin precio guardado: usa el manual (nunca inventa).
    expect(items[1]).toMatchObject({ unitNet: 150_000, totalNet: 150_000 })
  })

  it('la línea dice lo mismo que el PDF: material, marca y nombre', () => {
    const line = SAMPLE_CATALOG.lines.find((l) => l.id === 'serie-70-corredera')!
    const catalog = {
      ...SAMPLE_CATALOG,
      updatedAt: '',
      brands: [...SAMPLE_CATALOG.brands, { id: 'proline', name: 'Proline' }] as typeof SAMPLE_CATALOG.brands,
      lines: SAMPLE_CATALOG.lines.map((l) => (l.id === line.id ? { ...l, brandId: 'proline', name: 'PROSLD70' } : l)),
    }
    expect(portalItems({ quote: quote(), catalog })[0]!.lineName).toBe('PVC Proline PROSLD70')
  })

  it('las ventanas en pausa (cantidad 0) quedan fuera, igual que en el PDF', () => {
    const base = quote()
    const paused = quote({
      items: [
        base.items[0]!,
        { ...base.items[1]!, id: 'p', ref: 'V2', name: 'Opción pausada', qty: 0 },
        { ...base.items[1]!, id: 'n', ref: 'V3', qty: Number.NaN },
      ],
    })
    const catalog = { ...SAMPLE_CATALOG, updatedAt: '' }
    const items = portalItems({ quote: paused, catalog, prices: { a: { unitNet: 131_800, totalNet: 263_600 }, p: { unitNet: 52_900, totalNet: 0 } } })
    expect(items.map((i) => i.ref)).toEqual(['V1'])
    expect(items.reduce((a, i) => a + i.qty, 0)).toBe(2)
    // Misma lista que el documento de la misma versión.
    const doc = buildQuoteDocData({ quote: paused, org: { name: 'Ventanas Sur' }, catalog, settings: {} })
    expect(items.map((i) => i.ref)).toEqual(doc.items.map((i) => i.ref))
  })

  it('un diseño roto no tumba el portal', () => {
    const broken = quote({ items: [{ id: 'x', ref: 'V1', qty: 1, design: { lineId: 'nada', width: 0, height: 0, colorId: '', glassId: '', version: 1, root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } } } }] })
    const items = portalItems({ quote: broken, catalog: { ...SAMPLE_CATALOG, updatedAt: '' } })
    expect(items).toHaveLength(1)
    expect(items[0].unitNet).toBe(0)
  })

  it('muestra los extras visibles y agrupa los ocultos', () => {
    expect(
      visibleExtras([
        { id: '1', label: 'Instalación', amount: 180_000 },
        { id: '2', label: 'Flete', amount: 20_000, hidden: true },
        { id: '3', label: 'Retiro', amount: 30_000, hidden: true },
        { id: '4', label: 'Nada', amount: 0 },
      ]),
    ).toEqual([
      { label: 'Instalación', amount: 180_000 },
      { label: 'Servicios adicionales', amount: 50_000 },
    ])
  })

  it('estados aceptados y vigencia', () => {
    expect(isAccepted('accepted')).toBe(true)
    expect(isAccepted('workshop')).toBe(true)
    expect(isAccepted('sent')).toBe(false)
    expect(validUntil({ validUntil: '2026-11-15', createdAt: '2026-10-01T00:00:00Z' }, 15)?.toISOString().slice(0, 10)).toBe('2026-11-15')
    expect(validUntil({ sentAt: '2026-10-01T12:00:00Z', createdAt: '2026-09-01T00:00:00Z' }, 15)?.toISOString().slice(0, 10)).toBe('2026-10-16')
    expect(validUntil({ createdAt: '' }, 0)).toBeNull()
  })

  it('contacto con WhatsApp primero, teléfono, correo y web', () => {
    const links = contactLinks({ name: 'Ventanas Sur', phone: '+56 9 1234 5678', email: 'ventas@sur.cl', website: 'sur.cl' }, 412)
    expect(links.map((l) => l.kind)).toEqual(['whatsapp', 'phone', 'email', 'web'])
    expect(links[0].href).toBe('https://wa.me/56912345678?text=Hola%2C%20te%20escribo%20por%20la%20cotizaci%C3%B3n%20N%C2%B0%20412.')
    expect(links[1].href).toBe('tel:+56912345678')
    expect(links[3].href).toBe('https://sur.cl')
    expect(contactLinks({ name: 'Sin datos' })).toEqual([])
  })

  it('colores de marca legibles aunque el taller elija un color claro', () => {
    const dark = brandColors('#8A2E3B')
    expect(dark.accent).toBe('#8A2E3B')
    expect(dark.onAccent).toBe('#FFFFFF')
    const light = brandColors('#F5D76E')
    expect(contrast(light.accent, light.onAccent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(light.ink, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(brandColors(undefined).accent).toBe('#2747C2')
    expect(brandColors('no-es-color').accent).toBe('#2747C2')
  })

  it('aceptar solo pide un nombre; condiciones con viñetas; nombre del PDF', () => {
    expect(acceptNameError('')).toMatch(/Escribe tu nombre/)
    expect(acceptNameError('P')).toBe('Escribe tu nombre completo.')
    expect(acceptNameError('Pedro Soto')).toBeNull()
    expect(conditionLines('- Precios netos\nTexto libre\n\n• Garantía')).toEqual([
      { bullet: true, text: 'Precios netos' },
      { bullet: false, text: 'Texto libre' },
      { bullet: true, text: 'Garantía' },
    ])
    expect(pdfFileName(412, 'B')).toBe('Cotizacion-412-B.pdf')
    expect(pdfFileName(7)).toBe('Cotizacion-7.pdf')
  })
})
