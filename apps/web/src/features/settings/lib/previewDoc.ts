/**
 * Cotización de muestra con los datos del taller (empresa, logo, color, precios), calculada con
 * el motor. La usan Ajustes · Empresa y la puesta a punto para mostrar «así le llega a tu cliente».
 */
import { quoteTotals, type Catalog, type CutSettings, type PricingSettings } from '@dekopen/engine'
import type { DocClient, DocOrg, QuoteDocData, QuoteDocItem } from '@dekopen/documents'
import type { Defaults, DocumentPrefs, Locale } from '@dekopen/shared'
import { getGlossary, getLocale, translate } from '../../../lib/i18n'
import es from '../i18n/es'
import { priceExample, type ExampleSpec } from './pricingExample'

type SampleKey = 'living' | 'bedroom' | 'balcony'

/** Ventanas de la cotización de ejemplo (nombre y recinto se traducen al armarla). */
const ITEMS: (ExampleSpec & { key: SampleKey })[] = [
  { typology: 'sliding_2', width: 1800, height: 1200, kind: 'sliding', key: 'living', qty: 1 },
  { typology: 'tilt_turn', width: 800, height: 1200, kind: 'casement', key: 'bedroom', qty: 2 },
  { typology: 'casement_transom', width: 900, height: 2100, kind: 'casement', key: 'balcony', qty: 1 },
]

/** Textos por defecto (iguales a los del servidor) mientras cargan los ajustes. */
export const DEFAULT_PREFS: DocumentPrefs = {
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
  intro:
    'Gracias por confiar en nosotros. Te dejamos el detalle de las ventanas que conversamos: medidas, terminaciones y precio de cada una. Si quieres ajustar algo, escríbenos y lo vemos juntos.',
  conditions: [
    '- Precios en pesos chilenos, netos más IVA.',
    '- Antes de fabricar visitamos la obra y confirmamos las medidas finales.',
    '- Cada ventana incluye perfiles, vidrio y herrajes indicados en su detalle.',
  ].join('\n'),
  paymentTerms: '50 % al aceptar la cotización y 50 % contra entrega.',
  warranty: 'Garantía de 5 años en perfiles y termopaneles, y de 1 año en herrajes e instalación, por defectos de fabricación.',
  validityDays: 15,
  leadTimeText: 'Fabricación e instalación en 15 días hábiles desde la aceptación y el abono.',
}

export interface PreviewDocInput {
  org: DocOrg
  pricing: PricingSettings
  prefs: DocumentPrefs
  catalog?: Catalog | null
  defaults?: Defaults
  cut?: Partial<CutSettings>
  number?: number
  /** Cuántas ventanas mostrar (1–3). */
  items?: number
  today?: Date
  /** Idioma de los nombres de ejemplo (por defecto, el de la interfaz). */
  locale?: Locale
  /** Cliente y obra de la vista previa; sin ellos, textos neutros. */
  client?: DocClient
  title?: string
}

function isoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysIso(date: Date, days: number): string {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return isoDate(next)
}

export interface PreviewDoc {
  data: QuoteDocData
  /** Alguna ventana se calculó con el catálogo de ejemplo (el del taller no tenía precios). */
  sample: boolean
}

export function buildPreviewDoc(input: PreviewDocInput): PreviewDoc {
  const today = input.today ?? new Date()
  const locale = input.locale ?? getLocale()
  const g = getGlossary(locale)
  const specs = ITEMS.slice(0, Math.min(3, Math.max(1, input.items ?? 3)))
  let sample = false
  const priced = specs.map((spec) => {
    const example = priceExample(input.catalog, input.pricing, spec, { defaults: input.defaults, cut: input.cut })
    sample ||= example.sample
    return { spec, example }
  })
  const items: QuoteDocItem[] = priced.map(({ spec, example }, i) => {
    const { design, catalog, line, price } = example
    const color = catalog.colors.find((c) => c.id === design.colorId)?.name ?? translate(es, 'preview.fallbackColor', undefined, locale)
    const glass = catalog.glass.find((gl) => gl.id === design.glassId)?.name ?? g.glassKind('dvh')
    const material = g.term(line?.material === 'aluminum' ? 'material.aluminum' : 'material.pvc')
    return {
      ref: `V${i + 1}`,
      name: translate(es, `preview.sample.${spec.key}.name`, undefined, locale),
      location: translate(es, `preview.sample.${spec.key}.location`, undefined, locale),
      qty: spec.qty ?? 1,
      description: example.name,
      lineName: line ? `${material} ${line.name}` : material,
      colorName: color,
      glassName: glass,
      width: design.width,
      height: design.height,
      area: Math.round(((design.width * design.height) / 1_000_000) * 100) / 100,
      unitPrice: price.unitNet,
      total: price.totalNet,
      layout: example.layout,
      design,
    }
  })
  const totals = quoteTotals(
    priced.map(({ example }) => ({ price: example.price, area: example.price.area })),
    { discountPct: 0, extras: [], ivaPct: input.pricing.ivaPct },
  )
  const catalog = priced[0]?.example.catalog ?? input.catalog
  const data: QuoteDocData = {
    org: input.org,
    client: input.client,
    quote: {
      number: Math.max(1, input.number ?? 1),
      title: input.title ?? translate(es, 'preview.project', undefined, locale),
      revision: 1,
      date: isoDate(today),
      validUntil: addDaysIso(today, input.prefs.validityDays || 15),
    },
    items,
    totals,
    extras: [],
    prefs: input.prefs,
    catalog: catalog as Catalog,
  }
  return { data, sample }
}
