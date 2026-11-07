/**
 * Armado de páginas del catálogo. Cada sección de la plantilla se convierte en bloques de alto
 * conocido (mm) y el paginador los reparte en hojas físicas. Las tarjetas, tablas y tableros tienen
 * geometría fija (el renderizador les pone exactamente ese alto y recorta lo que sobre); los textos
 * libres se estiman con un ancho de carácter prudente y se parten por párrafo. Así la vista previa y
 * el PDF tienen las mismas páginas y nada se desborda con textos largos en alemán o turco.
 */
import type { DocSection, DocSectionOf, DocTemplate, RichBlock } from '@dekopen/shared'
import { richTextCharCount } from '@dekopen/shared'
import type { CatalogModel, FamilyModel, FinishModel, GlassModel, HardwareModel, ProductModel } from './model'
import { estimateLines, lineMm, type CatalogMetrics } from './theme'

export interface TocEntry {
  key: string
  label: string
  /** Sección o familia cuya primera página se indica. */
  target: string
  level: 0 | 1
  page?: number
}

export interface GalleryImage {
  src: string
  caption?: string
  alt?: string
}

export type BlockData =
  | { kind: 'cover'; section: DocSectionOf<'cover'> }
  | { kind: 'heading'; title: string; kicker?: string; lead?: string; titleLines: number; leadLines: number }
  | { kind: 'toc'; entries: TocEntry[] }
  | { kind: 'tocFamilies'; families: FamilyModel[] }
  | { kind: 'guideSteps'; stepHeight: number }
  | { kind: 'guideOpenings'; openings: string[] }
  | { kind: 'note'; text: string; lines: number }
  | { kind: 'rich'; block: RichBlock; index: number; columns: 1 | 2; callout: boolean; lines: number }
  | { kind: 'familyLifestyle'; family: FamilyModel; section: DocSectionOf<'families'> }
  | { kind: 'familySheet'; family: FamilyModel; section: DocSectionOf<'families'> }
  | { kind: 'familyTiles'; families: FamilyModel[]; section: DocSectionOf<'families'> }
  | { kind: 'chapter'; family: FamilyModel; continued: boolean; qr: boolean }
  | { kind: 'cards'; products: ProductModel[]; section: DocSectionOf<'product_cards'>; cardHeight: number }
  | { kind: 'productRow'; product: ProductModel; section: DocSectionOf<'product_cards'> }
  | { kind: 'lookbook'; products: { product: ProductModel; offset: number }[]; section: DocSectionOf<'product_cards'>; itemHeight: number }
  | { kind: 'matrix'; families: FamilyModel[]; section: DocSectionOf<'matrix'>; rowHeights: number[] }
  | { kind: 'swatches'; finishes: FinishModel[]; section: DocSectionOf<'finishes'>; perRow: number }
  | { kind: 'pairs'; finishes: FinishModel[]; section: DocSectionOf<'finishes'> }
  | { kind: 'glassList'; glass: GlassModel[]; section: DocSectionOf<'glass'>; rowHeight: number }
  | { kind: 'glassLayers'; glass: GlassModel[]; section: DocSectionOf<'glass'> }
  | { kind: 'hardware'; items: HardwareModel[]; section: DocSectionOf<'hardware'>; perRow: number; itemHeight: number }
  | { kind: 'contact'; section: DocSectionOf<'contact'>; large?: boolean }
  | { kind: 'aboutImage'; src: string; alt?: string }
  | { kind: 'gallery'; images: GalleryImage[]; section: DocSectionOf<'gallery'>; imageHeight: number }
  | { kind: 'priceNote' }

export interface Block {
  key: string
  /** Sección de la plantilla a la que pertenece. */
  sectionId: string
  /** Familia (para el índice y la cabecera de continuación). */
  familyId?: string
  height: number
  data: BlockData
  /** Ocupa una página completa (portada, fichas por familia). */
  full?: boolean
  /** Portada sin márgenes ni cromo. */
  bleed?: boolean
  breakBefore?: boolean
  keepWithNext?: boolean
  /** Aire (mm) antes del bloque cuando abre una sección a mitad de hoja (lo agrega el paginador). */
  gapBefore?: number
  tone: DocSection['tone']
}

export interface CatalogPage {
  index: number
  blocks: Block[]
  /** Portada (sin cromo salvo `chromeOnCover`). */
  cover: boolean
}

export interface LayoutContext {
  template: DocTemplate
  metrics: CatalogMetrics
  model: CatalogModel
  /** Título por defecto de cada sección (ya traducido). */
  heading: (section: DocSection) => { title?: string; kicker?: string; lead?: string }
  /** Imágenes subidas disponibles (id → data URL validada). */
  asset: (id: string | undefined) => string | undefined
  /** Texto de la nota de precios (para estimar su alto). */
  priceNote: string
  /** Nota de colores impresos. */
  printNote: string
  /** Rótulos de aperturas para la guía. */
  openingLabels: string[]
  /** Entradas del índice (sin páginas). */
  tocEntries: () => TocEntry[]
}

const MAX_PER_ROW = 6

// ── Medidas comunes (mm) ─────────────────────────────────────────────────────

export interface Geometry {
  headingHeight(titleLines: number, leadLines: number, kicker: boolean): number
  cardHeight(section: DocSectionOf<'product_cards'>): number
  rowHeight(section: DocSectionOf<'product_cards'>): number
  swatchRow(size: 's' | 'm' | 'l', variant: 'swatches' | 'boards'): { perRow: number; height: number }
  tileHeight: number
  chapterHeight: number
  noteHeight(lines: number): number
}

export function geometry(m: CatalogMetrics): Geometry {
  const t = m.type
  const u = m.u
  const W = m.content.width
  return {
    headingHeight(titleLines, leadLines, kicker) {
      const k = kicker ? lineMm(t.small, 1.3) + 1.6 : 0
      const title = titleLines * lineMm(t.h2, 1.12)
      const lead = leadLines ? 2 + leadLines * lineMm(t.base, m.leading) : 0
      return round1(k + title + lead + u * 1.6)
    },
    cardHeight(section) {
      const o = section.options
      const cols = Math.max(1, o.columns)
      const colW = (W - u * (cols - 1)) / cols
      const drawing = Math.min(colW * 0.72, o.drawingSize === 'xs' ? 26 : o.drawingSize === 's' ? 36 : o.drawingSize === 'm' ? 50 : 64)
      const lines = (o.showOpening ? 1 : 0) + (o.showSizeRange ? 1 : 0)
      const text = 2 * lineMm(t.h3, 1.15) + lines * lineMm(t.small, 1.35) + (o.showFromPrice ? lineMm(t.small, 1.35) + 1.6 : 0) + 2.4
      return round1(drawing + text + 1.5 * Math.min(u, 4))
    },
    rowHeight(section) {
      return section.options.drawingSize === 'm' ? 25 : section.options.drawingSize === 's' ? 20 : 16
    },
    swatchRow(size, variant) {
      if (variant === 'boards') {
        const perRow = size === 'l' ? 3 : size === 'm' ? 4 : 5
        const colW = (W - u * (perRow - 1)) / perRow
        return { perRow, height: round1(colW * 0.78 + 3 * lineMm(t.small, 1.35) + 4 + u) }
      }
      const perRow = size === 'l' ? 4 : size === 'm' ? 5 : MAX_PER_ROW
      const colW = (W - u * (perRow - 1)) / perRow
      return { perRow, height: round1(colW * 0.62 + 2 * lineMm(t.small, 1.35) + 3 + u) }
    },
    tileHeight: round1(52 + 3 * lineMm(t.small, 1.4) + 2 * lineMm(t.h3, 1.15)),
    chapterHeight: round1(lineMm(t.h3, 1.2) + lineMm(t.small, 1.3) + 7 + u),
    noteHeight(lines) {
      return round1(lines * lineMm(t.small, 1.4) + u)
    },
  }
}

function round1(n: number): number {
  return Math.ceil(n * 10) / 10
}

function floor1(n: number): number {
  return Math.floor(n * 10) / 10
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// ── Bloques por sección ──────────────────────────────────────────────────────

function headingBlock(section: DocSection, ctx: LayoutContext, override?: { title?: string; kicker?: string; lead?: string }): Block | null {
  const h = { ...ctx.heading(section), ...(override ?? {}) }
  const title = section.title?.trim() || h.title
  if (!title) return null
  const m = ctx.metrics
  const W = m.content.width
  const titleLines = Math.min(3, estimateLines(title.length, W, m.type.h2 * 1.05))
  const leadLines = h.lead ? estimateLines(h.lead.length, Math.min(W, 150), m.type.base) : 0
  return {
    key: `${section.id}:heading`,
    sectionId: section.id,
    height: geometry(m).headingHeight(titleLines, leadLines, !!h.kicker),
    data: { kind: 'heading', title, kicker: h.kicker, lead: h.lead, titleLines, leadLines },
    keepWithNext: true,
    tone: section.tone,
  }
}

function richBlocks(section: DocSection, blocks: readonly RichBlock[], ctx: LayoutContext, opts: { columns?: 1 | 2; callout?: boolean } = {}): Block[] {
  const m = ctx.metrics
  const columns = opts.columns ?? 1
  const width = (columns === 2 ? (m.content.width - m.u) / 2 : Math.min(m.content.width, 160)) - (opts.callout ? 10 : 0)
  return blocks.map((block, index) => {
    const chars = richTextCharCount({ blocks: [block] })
    let lines: number
    let height: number
    if (block.type === 'heading') {
      const pt = block.level === 2 ? m.type.h3 * 1.2 : m.type.h3
      lines = estimateLines(chars, width, pt)
      height = lines * lineMm(pt, 1.2) + m.u
    } else if (block.type === 'paragraph') {
      const breaks = block.children.filter((c) => c.type === 'line_break').length
      lines = estimateLines(chars, width * columns, m.type.base) + breaks + (columns === 2 ? 1 : 0)
      const perColumn = columns === 2 ? Math.ceil(lines / 2) + 1 : lines
      height = perColumn * lineMm(m.type.base, m.leading) + m.u * 0.8
    } else {
      lines = block.items.reduce((s, item) => s + estimateLines(item.children.reduce((n, c) => n + (c.type === 'text' ? c.text.length : 8), 0), width - 6, m.type.base), 0)
      height = lines * lineMm(m.type.base, m.leading) + block.items.length * 1 + m.u * 0.8
    }
    return {
      key: `${section.id}:rich:${index}`,
      sectionId: section.id,
      height: round1(height + (opts.callout ? 8 : 0)),
      data: { kind: 'rich', block, index, columns, callout: !!opts.callout, lines },
      tone: section.tone,
    } satisfies Block
  })
}

function noteBlock(section: DocSection, key: string, text: string, ctx: LayoutContext): Block {
  const lines = estimateLines(text.length, Math.min(ctx.metrics.content.width, 170), ctx.metrics.type.small)
  return { key: `${section.id}:${key}`, sectionId: section.id, height: geometry(ctx.metrics).noteHeight(lines), data: { kind: 'note', text, lines }, tone: section.tone }
}

function familiesBlocks(section: DocSectionOf<'families'>, ctx: LayoutContext): Block[] {
  const { families } = ctx.model
  if (!families.length) return []
  const variant = section.options.variant
  if (variant === 'map') {
    const g = geometry(ctx.metrics)
    const head = headingBlock(section, ctx)
    const rows = chunk(families, 2).map((pair, i) => ({
      key: `${section.id}:tiles:${i}`,
      sectionId: section.id,
      height: round1(g.tileHeight + ctx.metrics.u),
      data: { kind: 'familyTiles', families: pair, section },
      tone: section.tone,
    }) satisfies Block)
    return [...(head ? [head] : []), ...rows]
  }
  // lifestyle y sheet: una página por familia (siempre; es lo que las hace legibles por separado).
  return families.map((family, i) => ({
    key: `${section.id}:${variant}:${family.id}:${i}`,
    sectionId: section.id,
    familyId: family.id,
    height: ctx.metrics.content.height,
    full: true,
    breakBefore: true,
    data: variant === 'lifestyle' ? { kind: 'familyLifestyle', family, section } : { kind: 'familySheet', family, section },
    tone: section.tone,
  }) satisfies Block)
}

function productBlocks(section: DocSectionOf<'product_cards'>, ctx: LayoutContext): Block[] {
  const m = ctx.metrics
  const g = geometry(m)
  const o = section.options
  const out: Block[] = []
  const head = headingBlock(section, ctx)
  if (head) out.push(head)
  const families = ctx.model.families.filter((f) => f.products.length)
  if (!families.length) return []
  if (o.variant === 'lookbook') {
    const cols = o.columns === 2 ? 2 : 1
    // Dos filas por hoja, también en la primera (la del título).
    const itemHeight = floor1((m.content.height - (head?.height ?? 0) - 2 * m.u) / 2 - 0.2)
    let offset = 0
    const all = families.flatMap((f) => f.products.map((product) => ({ product, offset: offset++ })))
    chunk(all, cols).forEach((row, i) => {
      out.push({
        key: `${section.id}:look:${i}`,
        sectionId: section.id,
        familyId: row[0]?.product.family.id,
        height: round1(itemHeight + m.u),
        data: { kind: 'lookbook', products: row, section, itemHeight },
        tone: section.tone,
      })
    })
  } else {
    for (const family of families) {
      out.push({
        key: `${section.id}:chapter:${family.id}`,
        sectionId: section.id,
        familyId: family.id,
        height: g.chapterHeight,
        data: { kind: 'chapter', family, continued: false, qr: o.showQr },
        keepWithNext: true,
        tone: section.tone,
      })
      if (o.variant === 'rows') {
        for (const product of family.products) {
          out.push({ key: `${section.id}:row:${product.key}`, sectionId: section.id, familyId: family.id, height: g.rowHeight(section), data: { kind: 'productRow', product, section }, tone: section.tone })
        }
      } else {
        const cols = Math.max(2, o.columns)
        const cardHeight = g.cardHeight(section)
        chunk(family.products, cols).forEach((row, i) => {
          out.push({
            key: `${section.id}:cards:${family.id}:${i}`,
            sectionId: section.id,
            familyId: family.id,
            height: round1(cardHeight + m.u),
            data: { kind: 'cards', products: row, section, cardHeight },
            tone: section.tone,
          })
        })
      }
    }
  }
  if (o.showFromPrice && ctx.model.hasPrices) out.push({ ...noteBlock(section, 'price-note', ctx.priceNote, ctx), data: { kind: 'priceNote' } })
  return out
}

/** Filas visibles de la matriz (las que tienen dato en al menos una línea). */
export function matrixRows(section: DocSectionOf<'matrix'>, families: FamilyModel[], hasPrices: boolean): DocSectionOf<'matrix'>['options']['rows'] {
  return section.options.rows.filter((row) => {
    switch (row) {
      case 'depth':
        return families.some((f) => f.depth)
      case 'glazing':
        return families.some((f) => f.maxGlass)
      case 'max_size':
        return families.some((f) => f.maxSash)
      case 'finishes':
        return families.some((f) => f.colors.length)
      case 'price_from':
        return hasPrices
      case 'performance':
        // No hay valores de desempeño verificados en el catálogo: no se publica una fila vacía.
        return false
      default:
        return true
    }
  })
}

function matrixBlocks(section: DocSectionOf<'matrix'>, ctx: LayoutContext): Block[] {
  const families = ctx.model.families
  if (!families.length) return []
  const m = ctx.metrics
  const rows = matrixRows(section, families, ctx.model.hasPrices)
  if (!rows.length) return []
  const perTable = m.content.width >= 180 ? 5 : 4
  const head = headingBlock(section, ctx)
  const line = lineMm(m.type.small, 1.35)
  const tables = chunk(families, perTable).map((group, i) => {
    const rowHeights = rows.map((row) => {
      if (row === 'openings') return round1(Math.max(...group.map((f) => Math.min(6, f.openings.length))) * line + 4)
      if (row === 'finishes') return round1(Math.max(...group.map((f) => Math.ceil(Math.min(f.colors.length, 12) / 6))) * 5.2 + 4)
      return round1(line + 4.6)
    })
    const header = round1(2 * lineMm(m.type.base, 1.25) + lineMm(m.type.micro, 1.3) + 5)
    return {
      key: `${section.id}:matrix:${i}`,
      sectionId: section.id,
      height: round1(header + rowHeights.reduce((s, h) => s + h, 0) + m.u * 1.4),
      data: { kind: 'matrix', families: group, section, rowHeights },
      tone: section.tone,
    } satisfies Block
  })
  return [...(head ? [head] : []), ...tables]
}

function finishesBlocks(section: DocSectionOf<'finishes'>, ctx: LayoutContext): Block[] {
  const finishes = ctx.model.finishes
  if (!finishes.length) return []
  const m = ctx.metrics
  const g = geometry(m)
  const o = section.options
  const out: Block[] = []
  const head = headingBlock(section, ctx)
  if (head) out.push(head)
  if (o.variant === 'paired') {
    const pairH = round1(((m.content.width - m.u) / 2) * 0.46 + lineMm(m.type.small, 1.35) + lineMm(m.type.h3, 1.2) + 4 + m.u)
    chunk(finishes, 2).forEach((pair, i) => out.push({ key: `${section.id}:pairs:${i}`, sectionId: section.id, height: pairH, data: { kind: 'pairs', finishes: pair, section }, tone: section.tone }))
  } else {
    // Cuatro tableros van en una fila: tres y uno suelto dejaban un hueco y empujaban el contacto a otra hoja.
    const { perRow, height } = g.swatchRow(o.variant === 'boards' && o.swatchSize === 'l' && finishes.length === 4 ? 'm' : o.swatchSize, o.variant === 'boards' ? 'boards' : 'swatches')
    chunk(finishes, perRow).forEach((row, i) => out.push({ key: `${section.id}:sw:${i}`, sectionId: section.id, height, data: { kind: 'swatches', finishes: row, section, perRow }, tone: section.tone }))
  }
  out.push(noteBlock(section, 'print-note', o.variant === 'paired' ? `${ctx.printNote}` : ctx.printNote, ctx))
  return out
}

function glassBlocks(section: DocSectionOf<'glass'>, ctx: LayoutContext): Block[] {
  const glass = ctx.model.glass.slice(0, section.options.maxItems)
  if (!glass.length) return []
  const m = ctx.metrics
  const out: Block[] = []
  const head = headingBlock(section, ctx)
  if (head) out.push(head)
  if (section.options.variant === 'layers' && section.options.showBuildup) {
    chunk(glass, 2).forEach((pair, i) => out.push({ key: `${section.id}:layers:${i}`, sectionId: section.id, height: round1(40 + m.u), data: { kind: 'glassLayers', glass: pair, section }, tone: section.tone }))
  } else {
    const rowH = round1(Math.max(11, lineMm(m.type.base, 1.3) + lineMm(m.type.small, 1.35) + 4.5))
    chunk(glass, 4).forEach((rows, i) => out.push({ key: `${section.id}:list:${i}`, sectionId: section.id, height: round1(rows.length * rowH), data: { kind: 'glassList', glass: rows, section, rowHeight: rowH }, tone: section.tone }))
  }
  return out
}

function hardwareBlocks(section: DocSectionOf<'hardware'>, ctx: LayoutContext): Block[] {
  const items = ctx.model.hardware.slice(0, 24)
  if (!items.length) return []
  const m = ctx.metrics
  const out: Block[] = []
  const head = headingBlock(section, ctx)
  if (head) out.push(head)
  if (section.options.variant === 'list') {
    const rowH = round1(lineMm(m.type.small, 1.3) + lineMm(m.type.micro, 1.3) * (section.options.showFinishes ? 2 : 1) + 3.6)
    chunk(items, 6).forEach((rows, i) => out.push({ key: `${section.id}:hw:${i}`, sectionId: section.id, height: round1(rows.length * rowH), data: { kind: 'hardware', items: rows, section, perRow: 1, itemHeight: rowH }, tone: section.tone }))
  } else {
    const perRow = 3
    const tileH = round1(lineMm(m.type.small, 1.3) * 2 + lineMm(m.type.micro, 1.3) * 2 + 6.2)
    chunk(items, perRow).forEach((row, i) => out.push({ key: `${section.id}:hw:${i}`, sectionId: section.id, height: round1(tileH + m.u * 0.8), data: { kind: 'hardware', items: row, section, perRow, itemHeight: tileH }, tone: section.tone }))
  }
  return out
}

function galleryBlocks(section: DocSectionOf<'gallery'>, ctx: LayoutContext): Block[] {
  const images: GalleryImage[] = []
  for (const img of section.options.images) {
    const src = ctx.asset(img.assetId)
    if (src) images.push({ src, ...(img.caption ? { caption: img.caption } : {}), ...(img.alt ? { alt: img.alt } : {}) })
  }
  // Una galería sin imágenes no imprime nada (ni siquiera su título).
  if (!images.length) return []
  const m = ctx.metrics
  const out: Block[] = []
  const head = headingBlock(section, ctx)
  if (head) out.push(head)
  const variant = section.options.variant
  const cols = variant === 'hero' ? 1 : variant === 'before_after' ? 2 : Math.max(2, section.options.columns)
  const colW = (m.content.width - m.u * (cols - 1)) / cols
  const imageHeight = round1(variant === 'hero' ? Math.min(m.content.height * 0.55, colW * 0.62) : variant === 'material_board' ? colW : colW * 0.68)
  const caption = images.some((i) => i.caption) ? lineMm(m.type.small, 1.35) * 2 + 2 : 0
  chunk(images, cols).forEach((row, i) =>
    out.push({ key: `${section.id}:gal:${i}`, sectionId: section.id, height: round1(imageHeight + caption + m.u), data: { kind: 'gallery', images: row, section, imageHeight }, tone: section.tone }),
  )
  return out
}

function introBlocks(section: DocSectionOf<'intro'>, ctx: LayoutContext): Block[] {
  const m = ctx.metrics
  const out: Block[] = []
  const variant = section.options.variant
  const head = headingBlock(section, ctx)
  if (head) out.push(head)
  if (variant === 'contents' || (section.options.showContents && variant !== 'guide')) {
    const entries = ctx.tocEntries()
    const rowH = lineMm(m.type.base * 1.1, 1.3) + 4.4
    chunk(entries, Math.max(4, Math.floor((m.content.height - 40) / rowH))).forEach((rows, i) =>
      out.push({ key: `${section.id}:toc:${i}`, sectionId: section.id, height: round1(rows.length * rowH + m.u), data: { kind: 'toc', entries: rows }, tone: section.tone }),
    )
    // Un índice corto deja media hoja: ahí van las líneas del catálogo, con su ventana a gran tamaño.
    const families = ctx.model.families.filter((f) => f.hero).slice(0, 3)
    const free = m.content.height - out.reduce((a, b) => a + b.height, 0) - m.u
    if (families.length && out.filter((b) => b.data.kind === 'toc').length === 1 && free >= 70) {
      out.push({ key: `${section.id}:families`, sectionId: section.id, height: round1(free), data: { kind: 'tocFamilies', families }, tone: section.tone })
    }
  }
  if (section.options.content?.blocks.length) out.push(...richBlocks(section, section.options.content.blocks, ctx))
  if (variant === 'guide') {
    const stepH = round1(lineMm(m.type.h2, 1) + lineMm(m.type.h3, 1.2) + 3 * lineMm(m.type.small, 1.4) + 11)
    out.push({ key: `${section.id}:steps`, sectionId: section.id, height: round1(2 * stepH + 2 * m.u), data: { kind: 'guideSteps', stepHeight: stepH }, tone: section.tone })
    if (ctx.openingLabels.length) {
      const rows = Math.ceil(ctx.openingLabels.length / 3)
      const rowH = round1(16 + 2 * lineMm(m.type.small, 1.4))
      out.push({
        key: `${section.id}:openings`,
        sectionId: section.id,
        height: round1(lineMm(m.type.h3, 1.2) + 4 + rows * (rowH + 2) + m.u),
        data: { kind: 'guideOpenings', openings: ctx.openingLabels },
        tone: section.tone,
      })
    }
  }
  return out
}

function contactBlocks(section: DocSectionOf<'contact'>, ctx: LayoutContext): Block[] {
  const m = ctx.metrics
  const height = section.options.variant === 'band' ? 46 : section.options.variant === 'qr' ? 70 : 62
  const head = section.options.variant === 'card' || section.title ? headingBlock(section, ctx) : null
  return [...(head ? [head] : []), { key: `${section.id}:contact`, sectionId: section.id, height: round1(Math.min(height, m.content.height)), data: { kind: 'contact', section }, tone: section.tone }]
}

function aboutBlocks(section: DocSectionOf<'about_us'>, ctx: LayoutContext): Block[] {
  const content = section.options.content?.blocks ?? []
  const src = ctx.asset(section.options.assetId)
  if (!content.length && !src) return []
  const m = ctx.metrics
  const out: Block[] = []
  const head = headingBlock(section, ctx)
  if (head) out.push(head)
  if (src) out.push({ key: `${section.id}:img`, sectionId: section.id, height: round1(Math.min(80, m.content.width * 0.42) + m.u), data: { kind: 'aboutImage', src }, tone: section.tone })
  out.push(...richBlocks(section, content, ctx, { columns: section.options.variant === 'story' ? 2 : 1 }))
  return out
}

function customBlocks(section: DocSectionOf<'custom_text'>, ctx: LayoutContext): Block[] {
  const blocks = section.options.content.blocks
  if (!blocks.length && !section.title) return []
  const head = headingBlock(section, ctx)
  const variant = section.options.variant
  return [...(head ? [head] : []), ...richBlocks(section, blocks, ctx, { columns: variant === 'two_columns' ? 2 : 1, callout: variant === 'callout' })]
}

/** Bloques de una sección (vacío = la sección no imprime nada). */
export function sectionBlocks(section: DocSection, ctx: LayoutContext): Block[] {
  if (!section.enabled) return []
  let blocks: Block[]
  switch (section.type) {
    case 'cover':
      blocks = [{ key: `${section.id}:cover`, sectionId: section.id, height: ctx.metrics.page.height, full: true, bleed: true, data: { kind: 'cover', section }, tone: section.tone }]
      break
    case 'intro':
      blocks = introBlocks(section, ctx)
      break
    case 'families':
      blocks = familiesBlocks(section, ctx)
      break
    case 'product_cards':
      blocks = productBlocks(section, ctx)
      break
    case 'matrix':
      blocks = matrixBlocks(section, ctx)
      break
    case 'finishes':
      blocks = finishesBlocks(section, ctx)
      break
    case 'glass':
      blocks = glassBlocks(section, ctx)
      break
    case 'hardware':
      blocks = hardwareBlocks(section, ctx)
      break
    case 'contact':
      blocks = contactBlocks(section, ctx)
      break
    case 'about_us':
      blocks = aboutBlocks(section, ctx)
      break
    case 'gallery':
      blocks = galleryBlocks(section, ctx)
      break
    case 'custom_text':
      blocks = customBlocks(section, ctx)
      break
    default:
      // page_break se resuelve en el paginador; secciones de cotización no se dibujan en un catálogo.
      blocks = []
  }
  if (blocks.length && section.pageBreak === 'before') blocks[0] = { ...blocks[0], breakBefore: true }
  return blocks
}

// ── Paginador ────────────────────────────────────────────────────────────────

/**
 * Reparte los bloques en páginas. Reglas: la portada va sola; un bloque `full` ocupa su página; un
 * `breakBefore` abre página; un título (`keepWithNext`) nunca queda solo al pie; un bloque más alto
 * que la página se coloca solo (se recorta en su caja, nunca empuja a otros fuera de la hoja).
 */
const SECTION_GAP_MM = 5

export function paginateBlocks(blocks: readonly Block[], contentHeight: number, continuation?: (block: Block) => Block | null): CatalogPage[] {
  const pages: CatalogPage[] = []
  let current: Block[] = []
  let used = 0
  const flush = () => {
    if (current.length) pages.push({ index: pages.length, blocks: current, cover: current.some((b) => b.data.kind === 'cover') })
    current = []
    used = 0
  }
  const push = (block: Block) => {
    // Una página que empieza a mitad de una línea repite su cabecera («… · continuación»).
    if (!current.length && continuation) {
      const head = continuation(block)
      if (head) {
        current.push(head)
        used += head.height
      }
    }
    current.push(block)
    used += block.height
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.full) {
      flush()
      current = [block]
      flush()
      continue
    }
    if (block.breakBefore && current.length) flush()
    // Una sección que abre a mitad de hoja lleva aire antes (los bloques de la anterior no lo traen).
    const previous = current[current.length - 1]
    const gap = previous && block.data.kind === 'heading' && previous.sectionId !== block.sectionId ? SECTION_GAP_MM : 0
    // Título + lo que sigue deben caber juntos.
    let need = block.height + gap
    if (block.keepWithNext) {
      let j = i + 1
      while (j < blocks.length && blocks[j].keepWithNext && !blocks[j].full) need += blocks[j++].height
      const next = blocks[j]
      if (next && !next.full && !next.breakBefore) need += next.height
    }
    if (current.length && used + Math.min(need, contentHeight) > contentHeight + 0.01) flush()
    if (current.length && gap) {
      current.push({ ...block, gapBefore: gap })
      used += gap + block.height
      continue
    }
    push(block)
  }
  flush()
  return pages
}

/** Si el contacto quedó solo en la última hoja, la cierra entera: es la contraportada, no una ficha perdida. */
export function expandLoneContact(pages: CatalogPage[], contentHeight: number): void {
  const last = pages[pages.length - 1]
  if (!last || last.blocks.length > 2) return
  const contact = last.blocks[last.blocks.length - 1]
  if (contact.data.kind !== 'contact' || last.blocks.some((b) => b !== contact && b.data.kind !== 'heading')) return
  const others = last.blocks.reduce((a, b) => (b === contact ? a : a + b.height), 0)
  last.blocks[last.blocks.length - 1] = { ...contact, height: round1(contentHeight - others), data: { ...contact.data, large: true } }
}

/** Página (1-based) donde empieza cada sección y familia, para el índice. */
export function firstPages(pages: readonly CatalogPage[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const page of pages) {
    for (const block of page.blocks) {
      if (!out.has(block.sectionId)) out.set(block.sectionId, page.index + 1)
      if (block.familyId && !out.has(`${block.sectionId}#${block.familyId}`)) out.set(`${block.sectionId}#${block.familyId}`, page.index + 1)
    }
  }
  return out
}
