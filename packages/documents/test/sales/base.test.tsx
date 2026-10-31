import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  DOCUMENT_FONT_FILES,
  EditableText,
  Money,
  Measure,
  SignatureBlock,
  TotalsBox,
  addDays,
  contrast,
  documentCss,
  documentFontFaces,
  ensureContrast,
  formatArea,
  formatClp,
  formatDateLong,
  formatDateShort,
  formatMeasure,
  formatMm,
  formatPct,
  initials,
  paginate,
  parseRichText,
  paymentSchedule,
  quoteLabel,
  revisionLetter,
  themeFromPrefs,
} from '../../src/base'
import { renderDocumentHtml } from '../../src/render'
import { SAMPLE_PREFS } from '../../src/sales'

const NB = ' '

describe('formato chileno', () => {
  it('pesos, milímetros, áreas y porcentajes', () => {
    expect(formatClp(1234567)).toBe('$1.234.567')
    expect(formatClp(-12000)).toBe('−$12.000')
    expect(formatClp(0)).toBe('$0')
    expect(formatMm(1200)).toBe('1.200')
    expect(formatMm(596.5)).toBe('596,5')
    expect(formatMm(603.46)).toBe('603,5')
    expect(formatMeasure(1200, 1500)).toBe(`1.200${NB}×${NB}1.500${NB}mm`)
    expect(formatArea(1.9174)).toBe(`1,92${NB}m²`)
    expect(formatPct(19)).toBe(`19${NB}%`)
    expect(formatPct(12.5)).toBe(`12,5${NB}%`)
  })

  it('fechas sin depender de la zona horaria', () => {
    expect(formatDateLong('2026-10-31')).toBe('31 de octubre de 2026')
    expect(formatDateLong('2026-01-05T23:59:00Z')).toBe('5 de enero de 2026')
    expect(formatDateShort('2026-10-31')).toBe('31-10-2026')
    expect(addDays('2026-10-31', 15)).toBe('2026-11-15')
    expect(formatDateLong(undefined)).toBe('')
  })

  it('revisiones y números humanos', () => {
    expect(revisionLetter(0)).toBe('')
    expect(revisionLetter(1)).toBe('A')
    expect(revisionLetter(2)).toBe('B')
    expect(revisionLetter(27)).toBe('AA')
    expect(quoteLabel(412, 1)).toBe(`Cotización N°${NB}412`)
    expect(quoteLabel(412, 3)).toBe(`Cotización N°${NB}412 · Revisión C`)
    expect(initials('Ventanas del Maule SpA')).toBe('VM')
  })
})

describe('textos del taller', () => {
  it('calcula las cuotas de la forma de pago y cuadra al peso', () => {
    const steps = paymentSchedule('50% al aceptar, 50% contra entrega', 2952123)
    expect(steps).toHaveLength(2)
    expect(steps?.[0]).toMatchObject({ pct: 50, label: 'Al aceptar' })
    expect(steps?.[1].label).toBe('Contra entrega')
    expect((steps?.[0].amount ?? 0) + (steps?.[1].amount ?? 0)).toBe(2952123)
    expect(paymentSchedule('60 % adelantado y 40 % contra entrega instalada', 1000)?.map((s) => s.amount)).toEqual([600, 400])
    expect(paymentSchedule('Contado', 1000)).toBeNull()
    expect(paymentSchedule('30% y 30%', 1000)).toBeNull()
  })

  it('markdown mínimo: listas, títulos, negrita y numeración propia', () => {
    const blocks = parseRichText('# Incluye\n- Medición\n- **Instalación**\n\n1. Uno\n2. Dos')
    expect(blocks[0]).toMatchObject({ type: 'h' })
    expect(blocks[1]).toMatchObject({ type: 'ul' })
    expect(blocks.filter((b) => b.type === 'p')).toHaveLength(2)
  })

  it('EditableText: texto plano en PDF, contentEditable en pantalla', () => {
    const plain = renderToStaticMarkup(<EditableText value="Hola" field="intro" />)
    expect(plain).not.toMatch(/contenteditable/i)
    expect(plain).toContain('data-field="intro"')
    const live = renderToStaticMarkup(<EditableText value="Hola" field="intro" editable onChange={() => undefined} placeholder="Saludo" />)
    expect(live).toMatch(/contenteditable="plaintext-only"/i)
    expect(live).toContain('data-placeholder="Saludo"')
    const rich = renderToStaticMarkup(<EditableText value={'- Uno\n- Dos'} rich />)
    expect(rich).toContain('<li>')
    // Sin HTML crudo del usuario.
    expect(renderToStaticMarkup(<EditableText value="<b>x</b>" rich />)).not.toContain('<b>')
  })
})

describe('primitivas', () => {
  it('Money, Measure y firma', () => {
    expect(renderToStaticMarkup(<Money value={494400} />)).toContain('$494.400')
    expect(renderToStaticMarkup(<Measure width={900} height={2100} />)).toContain(`900${NB}×${NB}2.100${NB}mm`)
    expect(renderToStaticMarkup(<SignatureBlock />)).toContain('Firma del cliente')
    const accepted = renderToStaticMarkup(<SignatureBlock accepted={{ name: 'Carolina Muñoz', rut: '12.345.678-5', at: '2026-11-02T10:00:00Z' }} />)
    expect(accepted).toContain('Aceptada en línea')
    expect(accepted).toContain('2 de noviembre de 2026')
  })

  it('TotalsBox: descuento, extras visibles y ocultos agrupados, IVA y total', () => {
    const out = renderToStaticMarkup(
      <TotalsBox
        totals={{ subtotal: 1000000, discountPct: 10, discount: 100000, extras: 150000, net: 1050000, iva: 199500, total: 1249500, area: 4.2, units: 3, cost: 0, marginPct: 0 }}
        extras={[
          { id: 'a', label: 'Instalación', amount: 100000 },
          { id: 'b', label: 'Flete', amount: 50000, hidden: true },
        ]}
        showArea
      />,
    )
    expect(out).toContain('Instalación')
    expect(out).not.toContain('Flete')
    expect(out).toContain('Servicios adicionales')
    expect(out).toContain('$50.000')
    expect(out).toContain(`IVA 19${NB}%`)
    expect(out).toContain('$1.249.500')
    expect(out).toContain('−$100.000')
  })

  it('paginación determinista con títulos pegados al siguiente bloque', () => {
    const blocks = [
      { key: 'a', height: 500, data: 1 },
      { key: 'h', height: 50, data: 2, keepWithNext: true },
      { key: 'b', height: 400, data: 3 },
      { key: 'c', height: 100, data: 4, breakBefore: true },
    ]
    const pages = paginate(blocks, { first: 900, rest: 900 })
    expect(pages.map((p) => p.map((b) => b.key))).toEqual([['a'], ['h', 'b'], ['c']])
  })
})

describe('tema, CSS, fuentes y HTML', () => {
  it('tema desde preferencias: acento de la organización y contraste AA para textos', () => {
    expect(themeFromPrefs({ ...SAMPLE_PREFS, accent: undefined }, '#0f5e5a').accent).toBe('#0F5E5A')
    expect(themeFromPrefs({ ...SAMPLE_PREFS, accent: 'no' }, undefined).accent).toBe('#2747C2')
    const ink = ensureContrast('#FFD400')
    expect(contrast(ink, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('CSS con @page por papel, saltos de página y cifras tabulares', () => {
    const letter = documentCss({ accent: '#2747C2', font: 'instrument', paper: 'letter' })
    expect(letter).toContain('@page { size: letter; margin: 0; }')
    expect(letter).toContain('break-after: page')
    expect(letter).toContain('tabular-nums')
    expect(documentCss({ accent: '#2747C2', font: 'serif', paper: 'a4' })).toContain('@page { size: A4; margin: 0; }')
  })

  it('fuentes: @font-face de Instrument Sans, Fraunces e Inter Tight', () => {
    const css = documentFontFaces({ instrument: 'data:font/woff2;base64,AAAA', fraunces: '/f.woff2', interTight: [{ url: '/i.woff2', unicodeRange: 'U+0000-00FF' }] })
    expect(css).toContain("font-family: 'Instrument Sans Variable'")
    expect(css).toContain("font-family: 'Fraunces Variable'")
    expect(css).toContain("font-family: 'Inter Tight Variable'")
    expect(css).toContain('unicode-range: U+0000-00FF')
    expect(DOCUMENT_FONT_FILES.fraunces).toMatch(/fraunces.*\.woff2$/)
    expect(documentFontFaces({})).toBe('')
  })

  it('renderDocumentHtml: HTML completo, título escapado y CSS sin cierre prematuro', () => {
    const out = renderDocumentHtml(<div className="x">Hola</div>, { title: 'Cotización <412>', fontCss: '/* </style> */', theme: { accent: '#2747C2', font: 'grotesk', paper: 'a4' } })
    expect(out.startsWith('<!doctype html>')).toBe(true)
    expect(out).toContain('<html lang="es-CL">')
    expect(out).toContain('<title>Cotización &lt;412&gt;</title>')
    expect(out).toContain('@page { size: A4; margin: 0; }')
    expect(out).toContain('<div class="x">Hola</div>')
    expect(out.match(/<\/style>/g)).toHaveLength(1)
  })
})
