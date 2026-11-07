import { describe, expect, it } from 'vitest'
import { createDesign } from '@dekopen/engine'
import { SAMPLE_DEFAULTS } from '@dekopen/catalog'
import type { Quote } from '@dekopen/shared'
import {
  clipText,
  composeQuote,
  deepEqual,
  docFromQuote,
  isAutoSequence,
  mergeDocs,
  metaFromQuote,
  nextRef,
  normalizeDoc,
  QUOTE_LIMITS,
  removeItemOp,
  saveBody,
  setDocumentOverrideOp,
  updateItemOp,
} from './doc'

const design = createDesign('fixed', { ...SAMPLE_DEFAULTS, width: 1000, height: 1000 })

describe('documento de la cotización', () => {
  it('siguiente referencia libre y numeración automática', () => {
    expect(nextRef([])).toBe('V1')
    expect(nextRef([{ ref: 'V1' }, { ref: 'V2' }, { ref: 'V7' }])).toBe('V8')
    expect(nextRef([{ ref: 'P1' }, { ref: 'P2' }])).toBe('V3')
    expect(isAutoSequence([{ ref: 'V1' }, { ref: 'v2' }])).toBe(true)
    expect(isAutoSequence([{ ref: 'V2' }, { ref: 'V1' }])).toBe(false)
  })

  it('igualdad profunda ignora claves undefined y el orden', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(deepEqual({ a: [1, { x: 2 }] }, { a: [1, { x: 2 }] })).toBe(true)
    expect(deepEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false)
  })

  it('normaliza como el servidor (vacíos fuera, cantidades enteras)', () => {
    const doc = normalizeDoc({
      title: '  Casa  ',
      items: [{ id: 'a', ref: '', qty: 2.6, design, name: '  ', location: ' Living ', notes: '' }],
      extras: [{ id: 'x', label: ' Instalación ', amount: 1000.4 }],
      discountPct: 120,
      pricing: {},
      notes: '   ',
      documentOverrides: { v: 2 },
    })
    expect(doc).toEqual({
      title: 'Casa',
      items: [{ id: 'a', ref: 'V1', qty: 3, design, location: 'Living' }],
      extras: [{ id: 'x', label: 'Instalación', amount: 1000 }],
      discountPct: 100,
    })
  })

  it('el guardado manda null para borrar opcionales y conserva versión y estado', () => {
    const body = saveBody({ title: 'Obra', items: [], extras: [], discountPct: 0 }, { status: 'sent', version: 4 }) as unknown as Record<string, unknown>
    expect(body).toMatchObject({ title: 'Obra', clientId: null, pricing: null, notes: null, documentOverrides: null, validUntil: null, status: 'sent', version: 4 })
  })

  it('ida y vuelta Quote → documento → Quote', () => {
    const quote: Quote = {
      id: 'q',
      number: 3,
      title: 'Obra',
      status: 'draft',
      items: [{ id: 'a', ref: 'V1', qty: 1, design }],
      extras: [],
      discountPct: 5,
      documentOverrides: { v: 2, texts: { intro: 'Hola' } },
      revision: 0,
      version: 2,
      createdAt: '2026-10-31T00:00:00.000Z',
      updatedAt: '2026-10-31T00:00:00.000Z',
    }
    const back = composeQuote(metaFromQuote(quote), docFromQuote(quote))
    expect(back).toEqual(quote)
  })

  it('la meta guarda los totales del servidor (para notar precios cambiados desde el envío)', () => {
    const totals = { subtotal: 1, discountPct: 0, discount: 0, extras: 0, net: 1, iva: 0, total: 262_990, area: 1, units: 1, cost: 0, marginPct: 0 }
    const quote = { id: 'q', number: 1, title: '', status: 'sent', items: [], extras: [], discountPct: 0, revision: 1, version: 3, totals, createdAt: 'a', updatedAt: 'b', sentAt: 'b' } as Quote
    expect(metaFromQuote(quote).totals).toEqual(totals)
    expect(metaFromQuote({ ...quote, totals: undefined }).totals).toBeUndefined()
  })

  it('editar un ítem: vacío borra el campo y sin cambios devuelve el mismo documento', () => {
    const doc = docFromQuote({
      id: 'q',
      number: 1,
      title: '',
      status: 'draft',
      items: [{ id: 'a', ref: 'V1', qty: 1, design, location: 'Living' }],
      extras: [],
      discountPct: 0,
      revision: 0,
      version: 1,
      createdAt: '',
      updatedAt: '',
    })
    expect(updateItemOp(doc, 'a', { location: 'Living' })).toBe(doc)
    expect(updateItemOp(doc, 'a', { location: '' }).items[0].location).toBeUndefined()
    expect(updateItemOp(doc, 'a', { ref: '' }).items[0].ref).toBe('V1')
  })

  it('recorta a los topes del servidor: un texto largo nunca bloquea el autoguardado', () => {
    const long = (n: number) => 'x'.repeat(n)
    const body = saveBody(
      {
        title: `  ${long(216)}  `,
        items: [{ id: 'a', ref: 'REFERENCIA-MUY-LARGA-123', qty: 250_000, design, name: long(300), location: long(250), notes: long(5000), manualUnitPrice: 2e10 }],
        extras: [{ id: 'x', label: long(50_000), amount: -3e10 }],
        discountPct: 0,
        pricing: { marginPct: 800, marginMode: 'markup' },
        notes: long(25_000),
      },
      { status: 'draft', version: 1 },
    )
    expect(body.title).toHaveLength(QUOTE_LIMITS.title)
    const [item] = body.items!
    expect(item.ref).toBe('REFERENCIA-MUY-LARGA')
    expect(item.qty).toBe(QUOTE_LIMITS.qty)
    expect(item.name).toHaveLength(QUOTE_LIMITS.itemName)
    expect(item.location).toHaveLength(QUOTE_LIMITS.itemLocation)
    expect(item.notes).toHaveLength(QUOTE_LIMITS.itemNotes)
    expect(item.manualUnitPrice).toBe(QUOTE_LIMITS.money)
    expect(body.extras![0]).toMatchObject({ label: long(QUOTE_LIMITS.extraLabel), amount: -QUOTE_LIMITS.money })
    expect(body.pricing).toEqual({ marginPct: QUOTE_LIMITS.marginPct, marginMode: 'markup' })
    expect(body.notes).toHaveLength(QUOTE_LIMITS.notes)
  })

  it('recortar no parte un emoji por la mitad (el servidor rechazaría el carácter suelto)', () => {
    const text = `${'a'.repeat(199)}🙂🙂`
    expect(clipText(text, 200)).toBe('a'.repeat(199))
    expect(clipText('corto', 200)).toBe('corto')
    expect(normalizeDoc({ title: text, items: [], extras: [], discountPct: 0 }).title).toBe('a'.repeat(199))
  })

  it('textos del documento: null vuelve al de la plantilla; vacío es una decisión', () => {
    const doc = { title: '', items: [], extras: [], discountPct: 0 }
    const withIntro = setDocumentOverrideOp(doc, { texts: { intro: 'Hola' }, templateId: 'hogar', locale: 'en' })
    expect(withIntro.documentOverrides).toEqual({ v: 2, texts: { intro: 'Hola' }, templateId: 'hogar', locale: 'en' })
    // Sin cambios: el mismo documento (no entra al historial).
    expect(setDocumentOverrideOp(withIntro, { texts: { intro: 'Hola' } })).toBe(withIntro)
    // «Sin condiciones» se guarda tal cual (texto vacío).
    expect(setDocumentOverrideOp(withIntro, { texts: { conditions: '' } }).documentOverrides?.texts).toEqual({ intro: 'Hola', conditions: '' })
    const cleared = setDocumentOverrideOp(setDocumentOverrideOp(withIntro, { texts: { intro: null } }), { templateId: null, locale: null })
    expect(cleared.documentOverrides).toBeUndefined()
  })

  it('ajustes v1 (cotizaciones de antes) se leen como v2 sin perder nada', () => {
    const quote = {
      id: 'q',
      number: 1,
      title: '',
      status: 'draft',
      items: [],
      extras: [],
      discountPct: 0,
      revision: 0,
      version: 1,
      createdAt: '',
      updatedAt: '',
      documentOverrides: { intro: 'Estimado cliente', quoteTemplate: 'galeria', validityDays: 30, notes: 'Incluye sellado' },
    } as unknown as Quote
    expect(docFromQuote(quote).documentOverrides).toEqual({
      v: 2,
      templateId: 'hogar',
      validityDays: 30,
      texts: { intro: 'Estimado cliente', clientNote: 'Incluye sellado' },
    })
  })

  it('borrar una ventana se lleva su nota del documento (deshacer la trae de vuelta)', () => {
    const doc = {
      title: '',
      items: [
        { id: 'a', ref: 'V1', qty: 1, design },
        { id: 'b', ref: 'V2', qty: 1, design },
      ],
      extras: [],
      discountPct: 0,
      documentOverrides: { v: 2 as const, items: { a: { note: 'Con celosía' }, b: { note: 'Baño' } } },
    }
    expect(removeItemOp(doc, 'a').documentOverrides).toEqual({ v: 2, items: { b: { note: 'Baño' } } })
    expect(removeItemOp(removeItemOp(doc, 'a'), 'b').documentOverrides).toBeUndefined()
  })

  it('fusión ante un conflicto: los ajustes del documento se toman llave por llave', () => {
    const base = { title: 'Obra', items: [], extras: [], discountPct: 0, documentOverrides: { v: 2 as const, texts: { intro: 'Hola' } } }
    // Aquí cambiaste la plantilla; en otra pestaña cambiaron el saludo y el idioma.
    const local = { ...base, documentOverrides: { v: 2 as const, texts: { intro: 'Hola' }, templateId: 'memoria' } }
    const remote = { ...base, documentOverrides: { v: 2 as const, texts: { intro: 'Estimada Carolina' }, locale: 'pt' as const } }
    const merged = mergeDocs(base, local, remote)
    expect(merged.clean).toBe(true)
    expect(merged.remoteChanged).toBe(true)
    expect(merged.doc.documentOverrides).toEqual({ v: 2, texts: { intro: 'Estimada Carolina' }, templateId: 'memoria', locale: 'pt' })
    // El mismo texto cambiado distinto en ambos lados: la fusión no es limpia.
    const clash = mergeDocs(base, { ...base, documentOverrides: { v: 2, texts: { intro: 'A' } } }, { ...base, documentOverrides: { v: 2, texts: { intro: 'B' } } })
    expect(clash.clean).toBe(false)
  })
})
