/**
 * Registro CERRADO de secciones. Cada tipo tiene su esquema estricto de opciones, variantes propias,
 * valores por defecto y metadatos (documentos donde se permite, máximo por plantilla, fondos y slots
 * de texto). Una sección nueva es un tipo nuevo aquí + un componente de confianza en documents; no
 * existe una sección de HTML/código libre.
 */
import { z } from 'zod'
import { TEMPLATE_LIMITS as L } from './limits'
import { AssetIdSchema, SectionIdSchema, docText } from './fields'
import { RichTextSchema } from './richtext'
import { cloneJson } from './safety'
import { issue, type DocIssue, type DocIssuePath } from './issues'
import type { DocTemplateKind } from './kinds'

export const SECTION_TONES = ['paper', 'surface', 'accent', 'strong'] as const
export type SectionTone = (typeof SECTION_TONES)[number]
export const PAGE_BREAKS = ['auto', 'before'] as const
export type SectionPageBreak = (typeof PAGE_BREAKS)[number]

export const SECTION_VARIANTS = {
  cover: ['typographic', 'drawing', 'photo', 'split', 'elevation'],
  letter: ['letter', 'short_note'],
  client_strip: ['strip', 'grid', 'band'],
  project_summary: ['facts', 'key_figures', 'index', 'scope'],
  items: ['table', 'cards', 'sheet', 'gallery', 'per_page'],
  options_comparison: ['table', 'cards'],
  technical_specs: ['schedule', 'matrix', 'glass_layers'],
  finishes_board: ['swatches', 'material_board'],
  totals: ['stack', 'band', 'decision'],
  payment: ['timeline', 'table', 'text'],
  terms: ['columns', 'numbered', 'compact'],
  warranty: ['plain', 'matrix'],
  about_us: ['short', 'story'],
  gallery: ['grid', 'hero', 'before_after', 'material_board'],
  acceptance: ['full', 'inline', 'online_only'],
  custom_text: ['paragraphs', 'callout', 'two_columns'],
  page_break: [],
  intro: ['guide', 'letter', 'contents'],
  families: ['lifestyle', 'sheet', 'map'],
  product_cards: ['grid', 'rows', 'lookbook'],
  matrix: ['selection', 'comparison'],
  finishes: ['swatches', 'boards', 'paired'],
  glass: ['list', 'layers'],
  hardware: ['grid', 'list'],
  contact: ['card', 'band', 'qr'],
} as const

export type DocSectionType = keyof typeof SECTION_VARIANTS
export const SECTION_TYPES = Object.keys(SECTION_VARIANTS) as DocSectionType[]

/** Todas las variantes (sin repetir), para etiquetas y validación de diccionarios. */
export const ALL_SECTION_VARIANTS = [...new Set(Object.values(SECTION_VARIANTS).flat())] as string[]

export const ITEM_VARIANTS = SECTION_VARIANTS.items
export type ItemVariant = (typeof ITEM_VARIANTS)[number]
export const DRAWING_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const
export type DrawingSize = (typeof DRAWING_SIZES)[number]
/** Tamaños del dibujo en las ventanas de una cotización: `none` la deja sin dibujo. */
export const ITEM_DRAWING_SIZES = ['none', ...DRAWING_SIZES] as const
export type ItemDrawingSize = (typeof ITEM_DRAWING_SIZES)[number]
export const DRAWING_DIMENSIONS = ['none', 'total', 'all'] as const
export const DRAWING_VIEWS = ['interior', 'exterior', 'both'] as const
export const SECTION_DRAWING_STYLES = ['inherit', 'realistic', 'technical'] as const
export const FINISH_DISPLAYS = ['none', 'combined', 'inside_outside'] as const
export const ITEM_GROUPINGS = ['none', 'room', 'floor', 'line'] as const
/** Precio por ítem neto o con impuesto. */
export const PRICE_TAX_MODES = ['net', 'gross'] as const
export const SWATCH_SIZES = ['s', 'm', 'l'] as const
export const CLIENT_STRIP_FIELDS = ['client', 'project', 'site', 'reference', 'date', 'validity', 'adviser', 'contact', 'units', 'custom', 'scope'] as const
export const TERMS_BLOCKS = ['includes', 'excludes', 'conditions', 'lead_time', 'validity', 'notes'] as const
export const MATRIX_ROWS = ['openings', 'depth', 'glazing', 'performance', 'max_size', 'finishes', 'price_from'] as const

/**
 * Ancho máximo orientativo del dibujo por tamaño (mm, a escala de impresión). El renderizador puede
 * ajustarlo a su grilla; sirve para que "dibujos más grandes" signifique lo mismo en todos lados.
 */
export const ITEM_DRAWING_SIZE_MM: Readonly<Record<DrawingSize, number>> = { xs: 14, s: 34, m: 58, l: 92, xl: 150 }

const bool = z.boolean()
const columns = z.union([z.literal(1), z.literal(2), z.literal(3)])
const plainLine = (max: number) => docText({ max, multiline: false, placeholders: true })

function uniqueList<const T extends readonly [string, ...string[]]>(values: T, min: number, max: number) {
  return z
    .array(z.enum(values))
    .min(min)
    .max(max)
    .superRefine((list, ctx) => {
      if (new Set(list).size !== list.length) ctx.addIssue({ code: 'custom', message: 'invalid_value', params: { docCode: 'invalid_value', docParams: { reason: 'duplicate' } } })
    })
}

export const CoverOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.cover),
  /** Foto de portada (variantes `photo`/`split`); sin foto se usa el dibujo. */
  assetId: AssetIdSchema.optional(),
  showLogo: bool,
  /** Datos clave: cotización → cliente, proyecto y fecha; catálogo → edición y familias. Nunca precios. */
  showFacts: bool,
  /** Nombre del cliente. Sólo cotizaciones. */
  showClient: bool,
  /** Titular; por defecto el título de la cotización/catálogo. Admite marcadores. */
  title: plainLine(L.coverTitleMax).optional(),
  subtitle: plainLine(L.coverSubtitleMax).optional(),
})

export const LetterOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.letter),
  /** Firma (`signatureName`) al pie de la carta. */
  showSignature: bool,
  showDate: bool,
})

export const ClientStripOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.client_strip),
  fields: uniqueList(CLIENT_STRIP_FIELDS, 1, CLIENT_STRIP_FIELDS.length),
})

export const ProjectSummaryOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.project_summary),
  showUnits: bool,
  showArea: bool,
  showLeadTime: bool,
  showValidity: bool,
  /** Índice de recintos/pisos/aberturas con sus códigos. */
  showGroups: bool,
})

export const ItemsOptionsSchema = z.strictObject({
  /** table: planilla compacta · cards: tarjetas (1 columna = panel horizontal) · sheet: ficha técnica · gallery: visual · per_page: un ítem por página. */
  variant: z.enum(SECTION_VARIANTS.items),
  columns,
  /** `none`: sin dibujo de la ventana; las composiciones de hoja completa pasan a lista. */
  drawingSize: z.enum(ITEM_DRAWING_SIZES),
  drawingDimensions: z.enum(DRAWING_DIMENSIONS),
  drawingView: z.enum(DRAWING_VIEWS),
  /** `inherit` usa el estilo del tema. */
  drawingStyle: z.enum(SECTION_DRAWING_STYLES),
  showUnitPrices: bool,
  showLineTotals: bool,
  showSpecs: bool,
  /** Línea/serie del sistema. */
  showSystem: bool,
  showGlass: bool,
  showArea: bool,
  /** Colores: ninguno, combinados en una línea, o interior y exterior por separado. */
  finishes: z.enum(FINISH_DISPLAYS),
  showSwatches: bool,
  /** Uw/Ug y demás valores verificados cuando existan. */
  showPerformance: bool,
  /** Notas por ítem (de la cotización y de los ajustes por cotización). */
  showNotes: bool,
  groupBy: z.enum(ITEM_GROUPINGS),
  /** Subtotales por grupo: los entrega el motor/armado de datos, nunca se suman en la plantilla. */
  showGroupSubtotals: bool,
  /** Cada grupo empieza en hoja nueva. */
  groupPageBreak: bool.default(false),
  /** Precios por ítem netos o con impuesto. */
  priceTax: z.enum(PRICE_TAX_MODES).default('net'),
  showRef: bool.default(true),
  showSize: bool.default(true),
  showQty: bool.default(true),
  /** Recinto bajo el título. */
  showLocation: bool.default(true),
  showOpening: bool.default(true),
  showAccessories: bool.default(true),
  /** Herrajes del despiece (nombres del catálogo). */
  showHardware: bool.default(false),
  /** Composición del vidrio. */
  showGlassBuildup: bool.default(false),
  /** Imagen del vidrio junto a su nombre. */
  showGlassImage: bool.default(true),
  /** Medida de vano, solo si el taller la cargó. */
  showRoughOpening: bool.default(false),
  /** Descargo: el color impreso es referencial. */
  showColorNote: bool.default(false),
  /** Partidas de texto (ítems sin ventana) al final de la lista. */
  showOtherLines: bool.default(true),
})

export const OptionsComparisonOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.options_comparison),
  /** Alternativas que se comparan por grupo. */
  maxOptions: z.union([z.literal(2), z.literal(3)]),
  /** Marca lo que está incluido en el total. */
  highlightSelected: bool,
  /** Muestra la diferencia de precio en vez del valor completo. */
  showDifferencesOnly: bool,
})

export const TechnicalSpecsOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.technical_specs),
  showThermal: bool,
  showAcoustic: bool,
  showSecurity: bool,
  showGlassBuildup: bool,
  showHardware: bool,
  /** Fuente/base de cada valor (ensayo, catálogo del sistema). */
  showSources: bool,
  /** Corte del vidrio en capas (composición `glass_layers`). */
  showGlassImage: bool.default(true),
})

export const FinishesBoardOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.finishes_board),
  insideOutside: bool,
  showHardwareFinish: bool,
  showCodes: bool,
  swatchSize: z.enum(SWATCH_SIZES),
})

export const TotalsOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.totals),
  showSubtotal: bool,
  showDiscount: bool,
  showTax: bool,
  showExtras: bool,
  showArea: bool,
  showUnits: bool,
})

export const PaymentOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.payment),
  /** Hitos con montos (calculados desde el total del motor). */
  showSchedule: bool,
  /** Datos de pago del taller (cuentas, enlaces, instrucciones), si eligió imprimirlos. */
  showDetails: bool.default(true),
})

export const TermsOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.terms),
  blocks: uniqueList(TERMS_BLOCKS, 1, TERMS_BLOCKS.length),
  columns: z.union([z.literal(1), z.literal(2)]),
})

export const WarrantyOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.warranty),
  showServiceContact: bool,
})

export const AboutUsOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.about_us),
  content: RichTextSchema.optional(),
  assetId: AssetIdSchema.optional(),
  showContact: bool,
})

export const GalleryImageSchema = z.strictObject({
  assetId: AssetIdSchema,
  caption: docText({ max: L.captionMax, multiline: false, placeholders: false }).optional(),
  alt: docText({ max: L.captionMax, multiline: false, placeholders: false }).optional(),
})

export const GalleryOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.gallery),
  columns,
  images: z.array(GalleryImageSchema).max(L.galleryImagesMax),
})

export const AcceptanceOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.acceptance),
  /** QR a la aceptación en línea de ESTA revisión (enlace generado por el servidor). */
  showQr: bool,
  showOnlineLink: bool,
  showSignatureLines: bool,
  showCompanySignature: bool,
  /** Declaración que nombra lo que el cliente revisó. */
  showStatement: bool.default(true),
  /** Imagen de la firma del taller (sobre su línea de firma). */
  assetId: AssetIdSchema.optional(),
})

export const CustomTextOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.custom_text),
  content: RichTextSchema,
})

export const PageBreakOptionsSchema = z.strictObject({})

export const IntroOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.intro),
  content: RichTextSchema.optional(),
  showContents: bool,
})

export const FamiliesOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.families),
  showOpeningDiagrams: bool,
  showPerformance: bool,
  showFromPrice: bool,
  newPagePerFamily: bool,
})

export const ProductCardsOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.product_cards),
  columns,
  drawingSize: z.enum(DRAWING_SIZES),
  drawingStyle: z.enum(SECTION_DRAWING_STYLES),
  showFromPrice: bool,
  showSizeRange: bool,
  showOpening: bool,
  /** QR de solicitud de cotización. */
  showQr: bool,
  /** Muestra cada producto en otro color disponible ("En la imagen: …"). */
  showColorVariants: bool,
})

export const MatrixOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.matrix),
  rows: uniqueList(MATRIX_ROWS, 1, MATRIX_ROWS.length),
})

export const FinishesOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.finishes),
  showCodes: bool,
  showTextures: bool,
  swatchSize: z.enum(SWATCH_SIZES),
})

export const GlassOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.glass),
  showPerformance: bool,
  showBuildup: bool,
  maxItems: z.number().int().min(1).max(12),
})

export const HardwareOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.hardware),
  showFinishes: bool,
  showCodes: bool,
})

export const ContactOptionsSchema = z.strictObject({
  variant: z.enum(SECTION_VARIANTS.contact),
  showQr: bool,
  showAddress: bool,
  showWebsite: bool,
})

export const SECTION_OPTION_SCHEMAS = {
  cover: CoverOptionsSchema,
  letter: LetterOptionsSchema,
  client_strip: ClientStripOptionsSchema,
  project_summary: ProjectSummaryOptionsSchema,
  items: ItemsOptionsSchema,
  options_comparison: OptionsComparisonOptionsSchema,
  technical_specs: TechnicalSpecsOptionsSchema,
  finishes_board: FinishesBoardOptionsSchema,
  totals: TotalsOptionsSchema,
  payment: PaymentOptionsSchema,
  terms: TermsOptionsSchema,
  warranty: WarrantyOptionsSchema,
  about_us: AboutUsOptionsSchema,
  gallery: GalleryOptionsSchema,
  acceptance: AcceptanceOptionsSchema,
  custom_text: CustomTextOptionsSchema,
  page_break: PageBreakOptionsSchema,
  intro: IntroOptionsSchema,
  families: FamiliesOptionsSchema,
  product_cards: ProductCardsOptionsSchema,
  matrix: MatrixOptionsSchema,
  finishes: FinishesOptionsSchema,
  glass: GlassOptionsSchema,
  hardware: HardwareOptionsSchema,
  contact: ContactOptionsSchema,
} as const satisfies Record<DocSectionType, z.ZodObject>

const sectionBase = {
  /** Id estable (no cambia al reordenar ni al editar): lo usan el editor, la IA y los ajustes por cotización. */
  id: SectionIdSchema,
  /** Oculta sin borrar. */
  enabled: z.boolean(),
  /** `before`: empieza en página nueva. */
  pageBreak: z.enum(PAGE_BREAKS),
  /** Fondo de la sección (según lo permitido por tipo). */
  tone: z.enum(SECTION_TONES),
  /** Título propio de la sección; si falta, el renderizador usa el título traducido por defecto. */
  title: plainLine(L.sectionTitleMax).optional(),
}

function sectionSchema<const T extends DocSectionType, O extends z.ZodObject>(type: T, options: O) {
  return z.strictObject({ ...sectionBase, type: z.literal(type), options })
}

export const CoverSectionSchema = sectionSchema('cover', CoverOptionsSchema)
export const LetterSectionSchema = sectionSchema('letter', LetterOptionsSchema)
export const ClientStripSectionSchema = sectionSchema('client_strip', ClientStripOptionsSchema)
export const ProjectSummarySectionSchema = sectionSchema('project_summary', ProjectSummaryOptionsSchema)
export const ItemsSectionSchema = sectionSchema('items', ItemsOptionsSchema)
export const OptionsComparisonSectionSchema = sectionSchema('options_comparison', OptionsComparisonOptionsSchema)
export const TechnicalSpecsSectionSchema = sectionSchema('technical_specs', TechnicalSpecsOptionsSchema)
export const FinishesBoardSectionSchema = sectionSchema('finishes_board', FinishesBoardOptionsSchema)
export const TotalsSectionSchema = sectionSchema('totals', TotalsOptionsSchema)
export const PaymentSectionSchema = sectionSchema('payment', PaymentOptionsSchema)
export const TermsSectionSchema = sectionSchema('terms', TermsOptionsSchema)
export const WarrantySectionSchema = sectionSchema('warranty', WarrantyOptionsSchema)
export const AboutUsSectionSchema = sectionSchema('about_us', AboutUsOptionsSchema)
export const GallerySectionSchema = sectionSchema('gallery', GalleryOptionsSchema)
export const AcceptanceSectionSchema = sectionSchema('acceptance', AcceptanceOptionsSchema)
export const CustomTextSectionSchema = sectionSchema('custom_text', CustomTextOptionsSchema)
export const PageBreakSectionSchema = sectionSchema('page_break', PageBreakOptionsSchema)
export const IntroSectionSchema = sectionSchema('intro', IntroOptionsSchema)
export const FamiliesSectionSchema = sectionSchema('families', FamiliesOptionsSchema)
export const ProductCardsSectionSchema = sectionSchema('product_cards', ProductCardsOptionsSchema)
export const MatrixSectionSchema = sectionSchema('matrix', MatrixOptionsSchema)
export const FinishesSectionSchema = sectionSchema('finishes', FinishesOptionsSchema)
export const GlassSectionSchema = sectionSchema('glass', GlassOptionsSchema)
export const HardwareSectionSchema = sectionSchema('hardware', HardwareOptionsSchema)
export const ContactSectionSchema = sectionSchema('contact', ContactOptionsSchema)

export const DocSectionSchema = z.discriminatedUnion('type', [
  CoverSectionSchema,
  LetterSectionSchema,
  ClientStripSectionSchema,
  ProjectSummarySectionSchema,
  ItemsSectionSchema,
  OptionsComparisonSectionSchema,
  TechnicalSpecsSectionSchema,
  FinishesBoardSectionSchema,
  TotalsSectionSchema,
  PaymentSectionSchema,
  TermsSectionSchema,
  WarrantySectionSchema,
  AboutUsSectionSchema,
  GallerySectionSchema,
  AcceptanceSectionSchema,
  CustomTextSectionSchema,
  PageBreakSectionSchema,
  IntroSectionSchema,
  FamiliesSectionSchema,
  ProductCardsSectionSchema,
  MatrixSectionSchema,
  FinishesSectionSchema,
  GlassSectionSchema,
  HardwareSectionSchema,
  ContactSectionSchema,
])

export type DocSection = z.infer<typeof DocSectionSchema>
export type DocSectionOf<T extends DocSectionType> = Extract<DocSection, { type: T }>
export type SectionOptions<T extends DocSectionType> = DocSectionOf<T>['options']
export type ItemsOptions = SectionOptions<'items'>
export type CustomTextSection = DocSectionOf<'custom_text'>
export type PageBreakSection = DocSectionOf<'page_break'>

export type SectionTextSlot = 'title' | 'subtitle' | 'content'

export interface SectionMeta {
  kinds: readonly DocTemplateKind[]
  /** Máximo de secciones de este tipo por plantilla. */
  max: number
  tones: readonly SectionTone[]
  /** Admite título propio (`section.title`). */
  allowsTitle: boolean
  /** Slots de texto editables con `setSectionText` (cover: título/subtítulo de portada). */
  textSlots: readonly SectionTextSlot[]
}

const Q = ['quote'] as const
const C = ['catalog'] as const
const QC = ['quote', 'catalog'] as const
const P = ['paper'] as const
const PS = ['paper', 'surface'] as const
const ALL = SECTION_TONES

export const SECTION_META: Readonly<Record<DocSectionType, SectionMeta>> = {
  cover: { kinds: QC, max: 1, tones: ALL, allowsTitle: false, textSlots: ['title', 'subtitle'] },
  letter: { kinds: Q, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  client_strip: { kinds: Q, max: 1, tones: ALL, allowsTitle: true, textSlots: ['title'] },
  project_summary: { kinds: Q, max: 2, tones: ALL, allowsTitle: true, textSlots: ['title'] },
  items: { kinds: Q, max: 3, tones: PS, allowsTitle: true, textSlots: ['title'] },
  options_comparison: { kinds: Q, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  technical_specs: { kinds: Q, max: 2, tones: PS, allowsTitle: true, textSlots: ['title'] },
  finishes_board: { kinds: Q, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  totals: { kinds: Q, max: 1, tones: ALL, allowsTitle: true, textSlots: ['title'] },
  payment: { kinds: Q, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  terms: { kinds: Q, max: 1, tones: P, allowsTitle: true, textSlots: ['title'] },
  warranty: { kinds: Q, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  about_us: { kinds: QC, max: 1, tones: ['paper', 'surface', 'strong'], allowsTitle: true, textSlots: ['title', 'content'] },
  gallery: { kinds: QC, max: 4, tones: ['paper', 'surface', 'strong'], allowsTitle: true, textSlots: ['title'] },
  acceptance: { kinds: Q, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  custom_text: { kinds: QC, max: 12, tones: ALL, allowsTitle: true, textSlots: ['title', 'content'] },
  page_break: { kinds: QC, max: 20, tones: P, allowsTitle: false, textSlots: [] },
  intro: { kinds: C, max: 1, tones: ['paper', 'surface', 'strong'], allowsTitle: true, textSlots: ['title', 'content'] },
  families: { kinds: C, max: 2, tones: ['paper', 'surface', 'strong'], allowsTitle: true, textSlots: ['title'] },
  product_cards: { kinds: C, max: 3, tones: PS, allowsTitle: true, textSlots: ['title'] },
  matrix: { kinds: C, max: 2, tones: P, allowsTitle: true, textSlots: ['title'] },
  finishes: { kinds: C, max: 2, tones: PS, allowsTitle: true, textSlots: ['title'] },
  glass: { kinds: C, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  hardware: { kinds: C, max: 1, tones: PS, allowsTitle: true, textSlots: ['title'] },
  contact: { kinds: C, max: 1, tones: ALL, allowsTitle: true, textSlots: ['title'] },
}

export function sectionTypesFor(kind: DocTemplateKind): DocSectionType[] {
  return SECTION_TYPES.filter((t) => SECTION_META[t].kinds.includes(kind))
}

export function isSectionType(value: unknown): value is DocSectionType {
  return typeof value === 'string' && Object.hasOwn(SECTION_VARIANTS, value)
}

/** Secciones obligatorias (visibles) por tipo de documento. */
export const REQUIRED_SECTIONS: Readonly<Record<DocTemplateKind, { all: readonly DocSectionType[]; any: readonly DocSectionType[] }>> = {
  quote: { all: ['items', 'totals'], any: [] },
  catalog: { all: [], any: ['families', 'product_cards', 'matrix'] },
}

/** Secciones recomendadas (aviso si faltan). */
export const RECOMMENDED_SECTIONS: Readonly<Record<DocTemplateKind, readonly DocSectionType[]>> = {
  quote: ['terms', 'acceptance'],
  catalog: ['contact'],
}

/** Secciones de cierre: lo nuevo se inserta antes de ellas por defecto. */
export const CLOSING_SECTIONS: readonly DocSectionType[] = ['totals', 'payment', 'acceptance', 'contact']

/**
 * REGLA DURA: el total aparece una sola vez y nunca antes de su cierre, después de todas las ventanas.
 * Lo que puede seguirlo es lo que se lee con la cifra a la vista: opcionales, forma de pago (sus cuotas
 * revelarían el total si fueran antes), garantía, condiciones y aceptación; ese es el orden por defecto
 * (`termsPlacement`). Portada, carta, resumen, franja de datos, cabecera, pie e índice no tienen ninguna
 * opción para mostrarlo: la opción no existe en el esquema.
 */
export const AFTER_TOTALS_SECTIONS: readonly DocSectionType[] = ['options_comparison', 'payment', 'warranty', 'terms', 'acceptance', 'page_break']

/** Índice de la primera sección que rompe la regla (-1 si cumple): ver `AFTER_TOTALS_SECTIONS`. */
export function closingOrderViolation(sections: readonly { type: DocSectionType }[]): number {
  const at = sections.findIndex((s) => s.type === 'totals')
  if (at < 0) return -1
  const payment = sections.findIndex((s) => s.type === 'payment')
  if (payment >= 0 && payment < at) return payment
  for (let i = at + 1; i < sections.length; i++) if (!AFTER_TOTALS_SECTIONS.includes(sections[i].type)) return i
  return -1
}

/**
 * Deja el cierre al final: lo que no pueda seguir al total queda antes y, dentro del cierre, el orden es
 * total → opcionales → forma de pago → garantía → condiciones → aceptación. Garantía y condiciones que
 * ya estaban antes del total se quedan donde están (`before_total`). Es idempotente.
 */
export function withClosingLast<T extends { type: DocSectionType }>(sections: readonly T[]): T[] {
  const rank: Partial<Record<DocSectionType, number>> = { totals: 1, options_comparison: 2, payment: 3, warranty: 4, terms: 5, acceptance: 6 }
  const at = sections.findIndex((s) => s.type === 'totals')
  const movable = (s: T, i: number) => (s.type === 'warranty' || s.type === 'terms' ? at >= 0 && i > at : rank[s.type] !== undefined)
  const body = sections.filter((s, i) => !movable(s, i))
  const closing = sections.filter(movable).sort((a, b) => (rank[a.type] ?? 0) - (rank[b.type] ?? 0))
  return [...body, ...closing]
}

/** Quita de datos guardados las opciones que mostraban el total antes del cierre. */
export function dropTotalOptions(type: string, options: unknown): unknown {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return options
  const o = { ...(options as Record<string, unknown>) }
  if (type === 'cover' || type === 'project_summary') delete o.showTotal
  if (type === 'client_strip' && Array.isArray(o.fields)) {
    const fields = o.fields.filter((f) => f !== 'total')
    o.fields = fields.length ? fields : ['client']
  }
  return o
}

const emptyText = { blocks: [] }

export const SECTION_DEFAULT_OPTIONS: { readonly [T in DocSectionType]: SectionOptions<T> } = {
  cover: { variant: 'typographic', showLogo: true, showFacts: true, showClient: true },
  letter: { variant: 'letter', showSignature: true, showDate: false },
  client_strip: { variant: 'strip', fields: ['client', 'site', 'adviser', 'custom', 'scope'] },
  project_summary: { variant: 'facts', showUnits: true, showArea: false, showLeadTime: true, showValidity: true, showGroups: false },
  items: {
    variant: 'cards',
    columns: 1,
    drawingSize: 'l',
    drawingDimensions: 'total',
    drawingView: 'interior',
    drawingStyle: 'inherit',
    showUnitPrices: true,
    showLineTotals: true,
    showSpecs: true,
    showSystem: true,
    showGlass: true,
    showArea: false,
    finishes: 'inside_outside',
    showSwatches: true,
    showPerformance: false,
    showNotes: true,
    groupBy: 'none',
    showGroupSubtotals: false,
    groupPageBreak: false,
    priceTax: 'net',
    showRef: true,
    showSize: true,
    showQty: true,
    showLocation: true,
    showOpening: true,
    showAccessories: true,
    showHardware: false,
    showGlassBuildup: false,
    showGlassImage: true,
    showRoughOpening: false,
    showColorNote: false,
    showOtherLines: true,
  },
  options_comparison: { variant: 'table', maxOptions: 3, highlightSelected: true, showDifferencesOnly: true },
  technical_specs: { variant: 'schedule', showThermal: true, showAcoustic: false, showSecurity: false, showGlassBuildup: true, showHardware: true, showSources: true, showGlassImage: true },
  finishes_board: { variant: 'swatches', insideOutside: true, showHardwareFinish: true, showCodes: true, swatchSize: 'm' },
  totals: { variant: 'stack', showSubtotal: true, showDiscount: true, showTax: true, showExtras: true, showArea: false, showUnits: true },
  payment: { variant: 'text', showSchedule: true, showDetails: true },
  terms: { variant: 'columns', blocks: ['includes', 'excludes', 'conditions', 'lead_time', 'validity', 'notes'], columns: 2 },
  warranty: { variant: 'plain', showServiceContact: true },
  about_us: { variant: 'short', showContact: true },
  gallery: { variant: 'grid', columns: 2, images: [] },
  acceptance: { variant: 'full', showQr: true, showOnlineLink: true, showSignatureLines: true, showCompanySignature: false, showStatement: true },
  custom_text: { variant: 'paragraphs', content: emptyText },
  page_break: {},
  intro: { variant: 'guide', showContents: true },
  families: { variant: 'sheet', showOpeningDiagrams: true, showPerformance: true, showFromPrice: true, newPagePerFamily: false },
  product_cards: { variant: 'grid', columns: 2, drawingSize: 'm', drawingStyle: 'inherit', showFromPrice: true, showSizeRange: true, showOpening: true, showQr: false, showColorVariants: false },
  matrix: { variant: 'selection', rows: ['openings', 'depth', 'glazing', 'performance', 'max_size'] },
  finishes: { variant: 'swatches', showCodes: true, showTextures: true, swatchSize: 'm' },
  glass: { variant: 'list', showPerformance: true, showBuildup: true, maxItems: 6 },
  hardware: { variant: 'grid', showFinishes: true, showCodes: false },
  contact: { variant: 'card', showQr: true, showAddress: true, showWebsite: true },
}

// ── Compatibilidad de variantes ─────────────────────────────────────────────────────────────────

interface LayoutRule {
  columns: readonly (1 | 2 | 3)[]
  sizes?: Readonly<Partial<Record<1 | 2 | 3, readonly DrawingSize[]>>>
}

/** Columnas y tamaños de dibujo que cada variante sabe componer sin desbordar la página. */
export const LAYOUT_RULES: {
  items: Readonly<Record<ItemVariant, LayoutRule>>
  product_cards: Readonly<Record<SectionOptions<'product_cards'>['variant'], LayoutRule>>
  gallery: Readonly<Record<SectionOptions<'gallery'>['variant'], LayoutRule>>
} = {
  items: {
    table: { columns: [1], sizes: { 1: ['xs', 's'] } },
    cards: { columns: [1, 2, 3], sizes: { 1: ['s', 'm', 'l'], 2: ['s', 'm'], 3: ['xs', 's'] } },
    sheet: { columns: [1], sizes: { 1: ['l', 'xl'] } },
    gallery: { columns: [1, 2, 3], sizes: { 1: ['l', 'xl'], 2: ['m', 'l'], 3: ['s', 'm'] } },
    per_page: { columns: [1], sizes: { 1: ['l', 'xl'] } },
  },
  product_cards: {
    grid: { columns: [2, 3], sizes: { 2: ['s', 'm'], 3: ['xs', 's'] } },
    rows: { columns: [1], sizes: { 1: ['s', 'm'] } },
    lookbook: { columns: [1, 2], sizes: { 1: ['l', 'xl'], 2: ['m', 'l'] } },
  },
  gallery: {
    grid: { columns: [2, 3] },
    hero: { columns: [1] },
    before_after: { columns: [2] },
    material_board: { columns: [2, 3] },
  },
}

function layoutRuleFor(type: DocSectionType, options: Record<string, unknown>): LayoutRule | undefined {
  if (type !== 'items' && type !== 'product_cards' && type !== 'gallery') return undefined
  const rules = LAYOUT_RULES[type] as Record<string, LayoutRule>
  return typeof options.variant === 'string' ? rules[options.variant] : undefined
}

const nearest = <T>(allowed: readonly T[], current: T, order: readonly T[]): T => {
  if (allowed.includes(current)) return current
  const idx = order.indexOf(current)
  return [...allowed].sort((a, b) => Math.abs(order.indexOf(a) - idx) - Math.abs(order.indexOf(b) - idx))[0]
}

/** Combinaciones de opciones que la variante no admite (errores de validación). */
export function sectionOptionIssues(type: DocSectionType, options: Record<string, unknown>, path: DocIssuePath = []): DocIssue[] {
  const rule = layoutRuleFor(type, options)
  if (!rule) return []
  const out: DocIssue[] = []
  const cols = options.columns as 1 | 2 | 3
  if (!rule.columns.includes(cols)) out.push(issue('error', 'variant_incompatible', [...path, 'columns'], { option: 'columns', variant: String(options.variant) }))
  // Con columnas inválidas, el tamaño se valida contra lo que admite cualquier columna válida.
  const sizes = rule.columns.includes(cols) ? rule.sizes?.[cols] : rule.sizes ? rule.columns.flatMap((c) => rule.sizes?.[c] ?? []) : undefined
  if (sizes && typeof options.drawingSize === 'string' && options.drawingSize !== 'none' && !sizes.includes(options.drawingSize as DrawingSize)) {
    out.push(issue('error', 'variant_incompatible', [...path, 'drawingSize'], { option: 'drawingSize', variant: String(options.variant) }))
  }
  return out
}

/**
 * Ajusta columnas/tamaño de dibujo al rango de la variante (la variante manda). Devuelve las
 * opciones corregidas y las llaves que cambiaron.
 */
export function normalizeSectionOptions<T extends DocSectionType>(type: T, options: SectionOptions<T>): { options: SectionOptions<T>; adjusted: string[] } {
  const raw = options as Record<string, unknown>
  const rule = layoutRuleFor(type, raw)
  const adjusted: string[] = []
  if (!rule) return { options, adjusted }
  const next = { ...raw }
  const cols = nearest(rule.columns, next.columns as 1 | 2 | 3, [1, 2, 3] as const)
  if (cols !== next.columns) {
    next.columns = cols
    adjusted.push('columns')
  }
  const sizes = rule.sizes?.[cols]
  if (sizes && typeof next.drawingSize === 'string' && next.drawingSize !== 'none') {
    const size = nearest(sizes, next.drawingSize as DrawingSize, DRAWING_SIZES)
    if (size !== next.drawingSize) {
      next.drawingSize = size
      adjusted.push('drawingSize')
    }
  }
  if (type === 'items' && next.groupBy === 'none') {
    for (const key of ['showGroupSubtotals', 'groupPageBreak']) {
      if (next[key] === true) {
        next[key] = false
        adjusted.push(key)
      }
    }
  }
  return { options: next as SectionOptions<T>, adjusted }
}

// ── Creación ────────────────────────────────────────────────────────────────────────────────────

/** Id libre para una sección nueva: el tipo (`terms`), luego `terms-2`, `terms-3`… */
export function newSectionId(type: DocSectionType, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = type.replace(/_/g, '-')
  if (!used.has(base)) return base
  for (let n = 2; n < 1000; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${Date.now().toString(36)}`
}

export interface CreateSectionInput<T extends DocSectionType = DocSectionType> {
  type: T
  id?: string
  enabled?: boolean
  pageBreak?: SectionPageBreak
  tone?: SectionTone
  title?: string
  options?: Partial<SectionOptions<T>>
}

/** Sección completa con valores por defecto (opciones normalizadas; validar después con el esquema). */
export function createSection<T extends DocSectionType>(input: CreateSectionInput<T>, taken: Iterable<string> = []): DocSectionOf<T> {
  const defaults = cloneJson(SECTION_DEFAULT_OPTIONS[input.type]) as unknown as SectionOptions<T>
  const merged = { ...defaults, ...(input.options ?? {}) } as unknown as SectionOptions<T>
  const { options } = normalizeSectionOptions(input.type, merged)
  const section: Record<string, unknown> = {
    id: input.id ?? newSectionId(input.type, taken),
    type: input.type,
    enabled: input.enabled ?? true,
    pageBreak: input.pageBreak ?? 'auto',
    tone: input.tone ?? 'paper',
    options,
  }
  if (input.title !== undefined && SECTION_META[input.type].allowsTitle) section.title = input.title
  return section as DocSectionOf<T>
}

/** Esquema parcial de opciones de un tipo (para parches): opcionales aceptan `null` = quitar. */
const patchSchemaCache = new Map<DocSectionType, z.ZodObject>()
export function sectionOptionsPatchSchema(type: DocSectionType): z.ZodObject {
  const cached = patchSchemaCache.get(type)
  if (cached) return cached
  const shape = SECTION_OPTION_SCHEMAS[type].shape as Record<string, z.ZodType>
  const patch: Record<string, z.ZodType> = {}
  for (const [key, schema] of Object.entries(shape)) {
    // Un parche nunca lleva valores por defecto: si no los quita, cada parche pisaría esas opciones.
    const plain = schema instanceof z.ZodDefault ? (schema.unwrap() as z.ZodType) : schema
    patch[key] = plain instanceof z.ZodOptional ? (plain.unwrap() as z.ZodType).nullable().optional() : plain.optional()
  }
  const out = z.strictObject(patch)
  patchSchemaCache.set(type, out)
  return out
}

/** Aplica un parche de opciones ya validado (`null` borra llaves opcionales). */
export function applyOptionsPatch<T extends DocSectionType>(options: SectionOptions<T>, patch: Record<string, unknown>): SectionOptions<T> {
  const next: Record<string, unknown> = { ...(options as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next as SectionOptions<T>
}

/** Strings editables de una sección (para revisar marcadores y textos). */
export function sectionTexts(section: DocSection): { path: DocIssuePath; text: string }[] {
  const out: { path: DocIssuePath; text: string }[] = []
  if (section.title) out.push({ path: ['title'], text: section.title })
  if (section.type === 'cover') {
    if (section.options.title) out.push({ path: ['options', 'title'], text: section.options.title })
    if (section.options.subtitle) out.push({ path: ['options', 'subtitle'], text: section.options.subtitle })
  }
  return out
}

/** Contenido enriquecido de una sección, si lo tiene. */
export function sectionRichText(section: DocSection) {
  if (section.type === 'custom_text') return section.options.content
  if (section.type === 'about_us' || section.type === 'intro') return section.options.content
  return undefined
}
