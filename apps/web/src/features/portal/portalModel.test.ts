import { describe, expect, it } from 'vitest'
import { defineDictionary, glossaryTerm, LOCALES, translate } from '@dekopen/shared'
import portalEs from './i18n/es'
import portalEn from './i18n/en'
import portalPt from './i18n/pt'
import portalFr from './i18n/fr'
import portalDe from './i18n/de'
import portalIt from './i18n/it'
import portalTr from './i18n/tr'
import { assemblyUnits, createAssembly, createDesign } from '@dekopen/engine'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { buildQuoteDocData, contrast, DEFAULT_ACCENT } from '@dekopen/documents'
import type { Quote } from '@dekopen/shared'
import {
  acceptNameError,
  brandColors,
  composeChangesMessage,
  conditionLines,
  contactLinks,
  customerStatus,
  documentLocale,
  isAccepted,
  pdfFileName,
  portalCurrency,
  portalItems,
  taxInSentence,
  portalTaxLabel,
  validUntil,
  hasChoices,
  includedIds,
  isExpired,
  portalTotals,
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

describe('conjuntos', () => {
  it('la superficie de un conjunto suma sus unidades y su precio pendiente queda marcado', () => {
    const line = SAMPLE_CATALOG.lines[0]!
    const design = createAssembly('coupled_2', { lineId: line.id, colorId: line.colorIds[0]!, glassId: SAMPLE_CATALOG.glass[0]!.id }, SAMPLE_CATALOG)
    const quote = { items: [{ id: 'j', ref: 'V1', qty: 1, design }] } as unknown as Quote
    const [item] = portalItems({ quote, catalog: SAMPLE_CATALOG as never, prices: { j: { unitNet: 0, totalNet: 0, pending: true } } })
    const expected = assemblyUnits(design).reduce((sum, unit) => sum + (unit.design.width * unit.design.height) / 1_000_000, 0)
    expect(item!.area).toBeCloseTo(expected, 1)
    expect(item!.pending).toBe(true)
    expect(item!.layout).toBeTruthy()
  })
})

describe('vigencia', () => {
  it('la fecha guardada es un día del calendario y vale hasta que termina', () => {
    const until = validUntil({ validUntil: '2026-11-15', createdAt: '2026-10-01T00:00:00Z' }, 15)!
    expect([until.getFullYear(), until.getMonth(), until.getDate()]).toEqual([2026, 10, 15])
    expect(isExpired(until, new Date(2026, 10, 15, 23, 0))).toBe(false)
    expect(isExpired(until, new Date(2026, 10, 16, 0, 1))).toBe(true)
  })
})

describe('opcionales y alternativas', () => {
  const design = createDesign('fixed', { lineId: 'l', colorId: 'c', glassId: 'g', width: 1000, height: 1000 })
  const line = (id: string, extra: object) => ({ id, ref: id, qty: 1, design, ...extra })
  const quote = {
    items: [line('b', {}), line('o', { role: 'optional' }), line('a1', { role: 'alternative', altGroup: 'Living' }), line('a2', { role: 'alternative', altGroup: 'Living' })],
    extras: [],
    discountPct: 0,
  } as unknown as Quote
  const prices = { b: { unitNet: 100, totalNet: 100 }, o: { unitNet: 10, totalNet: 10 }, a1: { unitNet: 50, totalNet: 50 }, a2: { unitNet: 80, totalNet: 80 } }

  it('el total parte con la primera alternativa y sin opcionales, y se recalcula con cada elección', () => {
    expect(hasChoices(quote)).toBe(true)
    expect(portalTotals({ quote, prices, ivaPct: 0 }, {}).net).toBe(150)
    expect(portalTotals({ quote, prices, ivaPct: 0 }, { optional: { o: true } }).net).toBe(160)
    expect(portalTotals({ quote, prices, ivaPct: 0 }, { alternatives: { Living: 'a2' } }).net).toBe(180)
    expect(portalTotals({ quote, prices, ivaPct: 19 }, { alternatives: { Living: 'a2' } }).total).toBe(214)
    expect([...includedIds(quote, { alternatives: { Living: 'a2' } })].sort()).toEqual(['a2', 'b'])
  })
})

describe('portal del cliente', () => {
  it('arma cada ventana con dibujo, medidas, descripción y el precio enviado', () => {
    const items = portalItems({ quote: quote(), catalog: { ...SAMPLE_CATALOG, updatedAt: '' }, prices: { a: { unitNet: 300_000, totalNet: 600_000 } } })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ ref: 'V1', title: 'Corredera 2 hojas', typologyId: 'sliding_2', size: '1.800 × 1.200 mm', width: 1800, height: 1200, qty: 2, unitNet: 300_000, totalNet: 600_000, area: 2.16 })
    expect(items[0].layout?.width).toBe(1800)
    expect(items[0].colorName).toBeTruthy()
    expect(items[0].lineName).not.toMatch(/PVC/)
    // Sin precio guardado: usa el manual (nunca inventa).
    expect(items[1]).toMatchObject({ unitNet: 150_000, totalNet: 150_000 })
  })

  it('los colores conocidos salen en el idioma del portal; los propios, tal cual', () => {
    const base = { ...SAMPLE_CATALOG, updatedAt: '' }
    expect(portalItems({ quote: quote(), catalog: base }, 'en')[0]!.colorName).toBe('White')
    expect(portalItems({ quote: quote(), catalog: base }, 'de')[0]!.colorName).toBe('Weiß')
    expect(portalItems({ quote: quote(), catalog: base })[0]!.colorName).toBe('Blanco')
    const custom = { ...base, colors: base.colors.map((c) => (c.id === 'blanco' ? { ...c, id: 'custom-blanco', name: 'Blanco' } : c)) }
    const own = quote({ items: [{ id: 'a', ref: 'V1', qty: 1, design: { ...quote().items[0]!.design, colorId: 'custom-blanco' } }] })
    expect(portalItems({ quote: own, catalog: custom }, 'en')[0]!.colorName).toBe('Blanco')
  })

  it('la línea dice solo la línea, igual que el PDF: sin material ni marca', () => {
    const line = SAMPLE_CATALOG.lines.find((l) => l.id === 'serie-70-corredera')!
    const catalog = {
      ...SAMPLE_CATALOG,
      updatedAt: '',
      brands: [...SAMPLE_CATALOG.brands, { id: 'proline', name: 'Proline' }] as typeof SAMPLE_CATALOG.brands,
      lines: SAMPLE_CATALOG.lines.map((l) => (l.id === line.id ? { ...l, brandId: 'proline', name: 'PROSLD70' } : l)),
    }
    expect(portalItems({ quote: quote(), catalog })[0]!.lineName).toBe('PROSLD70')
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
      { generic: 'hidden', amount: 50_000 },
    ])
    // Un extra sin nombre sale con el genérico (lo traduce la página en el idioma del documento).
    expect(visibleExtras([{ id: '1', label: '  ', amount: 10_000 }])).toEqual([{ generic: 'unnamed', amount: 10_000 }])
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
    const links = contactLinks(
      { name: 'Ventanas Sur', phone: '+56 9 1234 5678', email: 'ventas@sur.cl', website: 'sur.cl' },
      { whatsappText: 'Hola, te escribo por la cotización N° 412.', emailSubject: 'Cotización N° 412' },
    )
    expect(links.map((l) => l.kind)).toEqual(['whatsapp', 'phone', 'email', 'web'])
    expect(links[0].href).toBe('https://wa.me/56912345678?text=Hola%2C%20te%20escribo%20por%20la%20cotizaci%C3%B3n%20N%C2%B0%20412.')
    expect(links[1].href).toBe('tel:+56912345678')
    expect(links[2].href).toBe('mailto:ventas@sur.cl?subject=Cotizaci%C3%B3n%20N%C2%B0%20412')
    expect(links[3].href).toBe('https://sur.cl')
    expect(contactLinks({ name: 'Sur', phone: '+56 9 1234 5678' })[0].href).toBe('https://wa.me/56912345678')
    expect(contactLinks({ name: 'Sin datos' })).toEqual([])
  })

  it('colores de marca legibles aunque el taller elija un color claro', () => {
    const dark = brandColors('#8A2E3B')
    expect(dark.accent).toBe('#8A2E3B')
    expect(dark.onAccent).toBe('#FFFFFF')
    const light = brandColors('#F5D76E')
    expect(contrast(light.accent, light.onAccent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(light.ink, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    // Sin color del taller: el mismo acento por defecto de los documentos (el PDF y el portal calzan).
    expect(brandColors(undefined).accent).toBe(brandColors(DEFAULT_ACCENT).accent)
    expect(brandColors('no-es-color').accent).toBe(brandColors(DEFAULT_ACCENT).accent)
  })

  it('aceptar solo pide un nombre; condiciones con viñetas; nombre del PDF', () => {
    expect(acceptNameError('')).toBe('empty')
    expect(acceptNameError('  ')).toBe('empty')
    expect(acceptNameError('P')).toBe('short')
    expect(acceptNameError('Pedro Soto')).toBeNull()
    expect(conditionLines('- Precios netos\nTexto libre\n\n• Garantía')).toEqual([
      { bullet: true, text: 'Precios netos' },
      { bullet: false, text: 'Texto libre' },
      { bullet: true, text: 'Garantía' },
    ])
    expect(pdfFileName(412, 'B')).toBe('Cotizacion-412-B.pdf')
    expect(pdfFileName(7)).toBe('Cotizacion-7.pdf')
    // La palabra traducida queda en ASCII seguro para el nombre del archivo.
    expect(pdfFileName(412, 'B', 'Orçamento-412')).toBe('Orcamento-412-B.pdf')
    expect(pdfFileName(9, undefined, 'Teklif 9 / ö')).toBe('Teklif-9-o.pdf')
  })

  it('estado para el cliente: esperando, aceptada o vencida (nunca el estado interno del taller)', () => {
    expect(customerStatus('sent', false, false)).toBe('awaiting')
    expect(customerStatus('sent', false, true)).toBe('expired')
    expect(customerStatus('workshop', true, false)).toBe('accepted')
    expect(customerStatus('draft', false, false)).toBeNull()
  })

  it('idioma del documento: servidor → cotización → empresa → español', () => {
    const base = { quote: quote(), org: { name: 'Sur' } }
    expect(documentLocale(base)).toBe('es')
    expect(documentLocale({ ...base, org: { name: 'Sur', locale: 'pt' } as never })).toBe('pt')
    expect(documentLocale({ ...base, quote: quote({ documentOverrides: { locale: 'de' } as never }), org: { name: 'Sur', locale: 'pt' } as never })).toBe('de')
    expect(documentLocale({ ...base, locale: 'en', quote: quote({ documentOverrides: { locale: 'de' } as never }) })).toBe('en')
    expect(documentLocale({ ...base, locale: 'xx' })).toBe('es')
  })

  it('moneda y nombre del impuesto: los de la empresa si llegan, si no CLP y el glosario', () => {
    expect(portalCurrency({ org: { name: 'Sur' } })).toBe('CLP')
    expect(portalCurrency({ org: { name: 'Sur' }, currency: 'eur' })).toBe('EUR')
    expect(portalCurrency({ org: { name: 'Sur', currency: 'USD' } as never })).toBe('USD')
    expect(portalCurrency({ org: { name: 'Sur' }, currency: 'pesos' })).toBe('CLP')
    expect(portalTaxLabel({})).toBeUndefined()
    expect(portalTaxLabel({ taxLabel: ' MwSt. ' })).toBe('MwSt.')
  })

  it('pedir cambios: texto general y una línea por ventana con nota, dentro del máximo del servidor', () => {
    expect(composeChangesMessage('La V1 en nogal.', [])).toBe('La V1 en nogal.')
    expect(
      composeChangesMessage('', [
        { label: 'V1 · Corredera 2 hojas', text: ' en nogal ' },
        { label: 'V2 · Oscilobatiente', text: '' },
      ]),
    ).toBe('V1 · Corredera 2 hojas: en nogal')
    expect(composeChangesMessage('General', [{ label: 'V2', text: 'más ancha' }])).toBe(['General', 'V2: más ancha'].join('\n'))
    const long = composeChangesMessage('x'.repeat(5000), [], 4000)
    expect(long).toHaveLength(4000)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('aceptar: total con impuesto, bien escrito en los 7 idiomas', () => {
  const dict = defineDictionary({ es: portalEs, en: portalEn, pt: portalPt, fr: portalFr, de: portalDe, it: portalIt, tr: portalTr })

  it('el nombre del impuesto va en minúscula a mitad de frase; siglas y alemán intactos', () => {
    expect(taxInSentence('Tax', 'en')).toBe('tax')
    expect(taxInSentence('Impostos', 'pt')).toBe('impostos')
    expect(taxInSentence('IVA', 'es')).toBe('IVA')
    expect(taxInSentence('VAT', 'en')).toBe('VAT')
    expect(taxInSentence('KDV', 'tr')).toBe('KDV')
    expect(taxInSentence('MwSt.', 'de')).toBe('MwSt.')
    expect(taxInSentence('Steuer', 'de')).toBe('Steuer')
  })

  it('«CLP 1,961,358, tax included»: sin mayúscula a mitad de frase ni número pegado al impuesto', () => {
    for (const locale of LOCALES) {
      const tax = taxInSentence(glossaryTerm('business.vat', locale), locale)
      const text = translate(dict, 'accept.description', { label: 'N° 412', total: 'CLP 1,961,358', tax }, locale)
      expect(text, locale).toContain('CLP 1,961,358')
      expect(text, locale).not.toMatch(/\d (Tax|Impostos)/)
      if (locale !== 'de') expect(text, locale).toMatch(/CLP 1,961,358, /)
    }
    expect(translate(dict, 'accept.description', { label: 'No. 412', total: 'CLP 1,961,358', tax: taxInSentence('Tax', 'en') }, 'en')).toBe('No. 412 · CLP 1,961,358, tax included')
  })
})
