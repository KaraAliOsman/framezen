/** Papeles de la carpeta de obra con datos del motor: lo que falta se marca, nada se rellena. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildWorkshopData, createAssembly, createDesign, type Catalog, type WindowDesign } from '@dekopen/engine'
import {
  AssemblyChecklistDocument,
  CouplersDocument,
  CutOrderDocument,
  GlassListDocument,
  GlassPlanDocument,
  HardwarePlanDocument,
  InstallationDocument,
  ReinforcementDocument,
  ScreensDocument,
  SurveyDocument,
  WORKSHOP_DOCUMENTS,
  WorkOrderDocument,
  WorkshopDocument,
  glassTemplates,
  hasCouplers,
  hasScreens,
  sampleWorkshopCatalog,
  unbackedLines,
  workshopLabels,
  type WorkshopDocumentData,
} from '../../src/workshop'

const catalog = sampleWorkshopCatalog()
const glassId = 'dvh-4124'
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

function build(designs: { ref: string; qty?: number; design: WindowDesign }[], cat: Catalog = catalog): WorkshopDocumentData {
  const quote = { items: designs.map((d, i) => ({ id: `i${i}`, ref: d.ref, qty: d.qty ?? 1, design: d.design })), extras: [], discountPct: 0 }
  return { ...buildWorkshopData(quote, cat, {}, { barLength: 5800, kerf: 4, trimStart: 10, trimEnd: 0, minReusable: 500 }), catalog: cat, org: { name: 'Taller' }, quote: { number: 1, title: 'Obra' }, workOrder: { number: 9, date: '2026-11-06' } }
}

const mk = (typology: string, width = 1200, height = 1200, extra: Partial<WindowDesign> = {}) => ({ ...createDesign(typology, { lineId: 'andino-60', width, height, colorId: 'blanco', glassId }), ...extra })

describe('Carpeta de obra', () => {
  const data = build([
    { ref: 'V1', design: mk('casement_double') },
    { ref: 'V2', qty: 2, design: mk('fixed_casement', 1500, 1200, { extras: { insectScreen: { type: 'hinged' } } }) },
    { ref: 'V3', design: mk('trapezoid', 1000, 1000) },
    { ref: 'V4', design: mk('arch', 1000, 1400) },
  ])

  it('cada documento del catálogo de hojas se dibuja sin huecos', () => {
    for (const doc of WORKSHOP_DOCUMENTS) {
      const html = renderToStaticMarkup(<WorkshopDocument kind={doc.kind} data={data} />)
      expect(html, doc.kind).toContain(`data-document="${doc.kind}"`)
      expect(html, doc.kind).not.toContain('NaN')
      expect(html, doc.kind).not.toContain('undefined')
    }
  })

  it('no trae tolerancias escritas por DEKOPEN', () => {
    for (const html of [renderToStaticMarkup(<AssemblyChecklistDocument data={data} />), renderToStaticMarkup(<WorkOrderDocument data={data} />)]) {
      expect(html).not.toContain('Tolerancia')
      expect(html).not.toContain('1,5 mm')
      expect(html).not.toContain('± 2')
    }
  })

  it('orden de corte: un paso por pieza y avisa si el tope no se mueve', () => {
    const html = renderToStaticMarkup(<CutOrderDocument data={data} />)
    expect(html.match(/aria-label="Marcar cortada"/g)).toHaveLength(data.optimization.totalPieces)
    expect(text(html)).toContain('no mover')
    expect(text(html)).toContain('despunta 10 mm')
  })

  it('plantillas a escala solo para vidrios con forma, también en el pedido al proveedor', () => {
    const templates = glassTemplates(data)
    expect(templates.map((t) => t.ref)).toEqual(['V3', 'V4'])
    const plan = text(renderToStaticMarkup(<GlassPlanDocument data={data} />))
    expect(plan).toContain('Plantillas de vidrio')
    expect(plan).toMatch(/Escala 1:\d+/)
    expect(plan).toContain('Radio')
    const supplier = text(renderToStaticMarkup(<GlassListDocument data={data} />))
    expect(supplier).toContain('Plantillas de vidrio')
    expect(glassTemplates(build([{ ref: 'V1', design: mk('fixed') }]))).toEqual([])
  })

  it('herrajes por hoja, con total y aviso si el catálogo no los trae', () => {
    const plain = text(renderToStaticMarkup(<HardwarePlanDocument data={data} />))
    expect(plain).toContain('Plan de herrajes')
    // El catálogo de ejemplo no tiene reglas de herrajes: se dice, no se rellena.
    expect(plain).toContain('El catálogo no trae herrajes para esta ventana.')
    expect(plain).toContain('Falta dato')
  })

  it('refuerzos: pieza, descuento y largo del acero', () => {
    const plain = text(renderToStaticMarkup(<ReinforcementDocument data={data} />))
    expect(plain).toContain('RA1')
    expect(plain).toContain('− 114')
  })

  it('mosquitero: tipo real y corte marcado sin dato, nunca una medida inventada', () => {
    expect(hasScreens(data)).toBe(true)
    expect(hasScreens(build([{ ref: 'V1', design: mk('fixed') }]))).toBe(false)
    const plain = text(renderToStaticMarkup(<ScreensDocument data={data} />))
    expect(plain).toContain('Abatible')
    expect(plain).toContain('sin dato')
    expect(plain).toContain('Ancho medido')
  })

  it('instalación con acta y levantamiento por ventana', () => {
    const install = text(renderToStaticMarkup(<InstallationDocument data={data} />))
    expect(install).toContain('Recepción de la obra')
    expect(install).toContain('Conforme')
    const survey = text(renderToStaticMarkup(<SurveyDocument data={data} />))
    expect(survey).toContain('Ancho del vano')
    expect(survey).toContain('Diagonales')
  })

  it('cada etiqueta dice de qué barra sale', () => {
    const labels = workshopLabels(data, { includeGlass: false })
    expect(labels.every((l) => /^B\d+-\d+$/.test(l.bar ?? ''))).toBe(true)
  })
})

describe('Acoples', () => {
  it('sin perfil de acople se marca la unión, sin largo ni pieza inventada', () => {
    const design = createAssembly('coupled_2', { lineId: 'andino-60', colorId: 'blanco', glassId }, catalog)
    const data = build([{ ref: 'V1', design }])
    expect(hasCouplers(data)).toBe(true)
    const plain = text(renderToStaticMarkup(<CouplersDocument data={data} />))
    expect(plain).toContain('Sin pieza en el catálogo')
    expect(plain).toContain('Uniones sin pieza')
  })

  it('con perfil de acople es una pieza propia con su largo y corte recto', () => {
    const cat: Catalog = {
      ...catalog,
      profiles: [...catalog.profiles, { id: 'acople', lineId: 'andino-60', code: 'AC1', name: 'Acople plano', role: 'coupler', face: 20, barLength: 5800, priceByColor: { blanco: 1000 } }],
    }
    const design = createAssembly('coupled_2', { lineId: 'andino-60', colorId: 'blanco', glassId }, cat)
    const plain = text(renderToStaticMarkup(<CouplersDocument data={build([{ ref: 'V1', design }], cat)} />))
    expect(plain).toContain('AC1')
    expect(plain).toContain('corte recto')
    expect(plain).not.toContain('Sin pieza en el catálogo')
  })
})

describe('Procedencia', () => {
  const withProvenance = (automatic: boolean, origin: string): Catalog => ({
    ...catalog,
    lines: catalog.lines.map((l) => (l.id === 'andino-60' ? ({ ...l, provenance: { automatic, fields: { 'pauta.weld': { origin }, 'pauta.frameDeduction': { origin: 'lista_taller' } } } } as typeof l) : l)),
  })

  it('una línea de taller sin procedencia no se marca', () => {
    expect(unbackedLines(catalog, [{ design: mk('fixed') }])).toEqual([])
  })

  it('una línea sin respaldo se dice en la OT y en la hoja de cortes', () => {
    const cat = withProvenance(false, 'sin_verificar')
    expect(unbackedLines(cat, [{ design: mk('fixed') }])).toEqual([{ name: 'Andino 60', origin: 'sin_verificar' }])
    const data = build([{ ref: 'V1', design: mk('fixed') }], cat)
    expect(text(renderToStaticMarkup(<WorkOrderDocument data={data} />))).toContain('Cortes sin respaldo del fabricante')
  })

  it('una línea respaldada no lleva aviso', () => {
    expect(unbackedLines(withProvenance(true, 'fabricante'), [{ design: mk('fixed') }])).toEqual([])
  })
})
