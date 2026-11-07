/**
 * Catálogo de productos del taller, armado desde una plantilla de catálogo (`DocTemplate`): los 4
 * diseños predefinidos (Habitar, Sistema, Colección Modular, Materia y Color) o una plantilla propia.
 *
 * Contrato (estable para la web, el servidor y el editor de plantillas):
 * - `template`: id de diseño (`habitar`…), id v4 (`vitrina`, `ficha`, `lookbook` → su diseño
 *   equivalente) o id de plantilla propia; `spec`: la plantilla propia ya cargada (se valida aquí).
 * - `locale`: idioma del documento (por defecto español); `currency`/`taxLabel`: moneda y rótulo del
 *   impuesto del taller.
 * - `textures`: teselas (`builtin:<id>` / `upload:<assetId>` → data URL) y `assets`: imágenes subidas
 *   (`assetId` → data URL). Solo data URLs de imagen: el PDF se imprime sin red.
 * - `requestUrl`: destino del QR de solicitud de cotización (por defecto el sitio web del taller).
 *
 * Sin hooks: el render por tramos del servidor dibuja cada página por separado.
 */
import type { CSSProperties, ReactNode } from 'react'
import { createFormatter, glossaryTerm, intlTag, isDocLocale, type DocLocale, type DocSection, type DocTemplate } from '@dekopen/shared'
import { joinParts } from '../../base/format'
import { DrawingDefsSvg, createDrawingDefs } from '../../textures'
import type { CatalogDocData } from '../types'
import { BlockView } from './blocks'
import { Cover } from './cover'
import { catalogText } from './i18n'
import { expandLoneContact, firstPages, geometry, paginateBlocks, sectionBlocks, type Block, type CatalogPage, type LayoutContext, type TocEntry } from './layout'
import { buildCatalogModel } from './model'
import { FinishDefs, OrgLogo, contactParts, safeImageSrc, safeWebUrl, type CatalogRenderContext } from './parts'
import { catalogCss } from './styles'
import { resolveCatalogTemplate, type ResolvedCatalogTemplate } from './templates'
import { catalogMetrics, catalogThemeVars } from './theme'

export interface CatalogDocumentProps {
  data: CatalogDocData
  /** Diseño: id predefinido, id v4 o id de plantilla propia (con `spec`). */
  template?: string
  /** Plantilla propia (DocTemplate de catálogo). Si no es válida se usa el diseño de respaldo. */
  spec?: unknown
  locale?: DocLocale
  /** Moneda ISO del taller (por defecto CLP). */
  currency?: string
  /** Rótulo del impuesto (por defecto el del idioma: IVA, VAT…). */
  taxLabel?: string
  textures?: Readonly<Record<string, string>>
  assets?: Readonly<Record<string, string>>
  requestUrl?: string
  /** Compatibilidad v4 (el catálogo siempre trae sus estilos). */
  withStyles?: boolean
  className?: string
  /** Prefijo de ids SVG (si un host dibuja varios catálogos iguales en la misma página). */
  idPrefix?: string
  /** Título de una sección escrito en la hoja (editor de plantillas). */
  onSectionEdit?: (sectionId: string, slot: 'title' | 'subtitle' | 'content', value: string) => void
}

function hashText(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** «2026-10-31» → fecha a mediodía UTC (sin correrse de mes por zona horaria). */
function isoNoon(iso: string | undefined): Date | undefined {
  if (!iso) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return undefined
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return Number.isNaN(d.getTime()) ? undefined : d
}

function defaultHeading(section: DocSection, t: CatalogRenderContext['t']): { title?: string; kicker?: string; lead?: string } {
  switch (section.type) {
    case 'intro':
      return section.options.variant === 'contents' ? { title: t('heading.contents') } : section.options.variant === 'guide' ? { title: t('heading.guide'), lead: t('guide.lead') } : { title: t('heading.letter') }
    case 'families':
      return section.options.variant === 'sheet' ? { title: t('heading.familiesSheet') } : section.options.variant === 'map' ? { title: t('heading.familiesMap') } : { title: t('heading.familiesLifestyle') }
    case 'product_cards':
      return { title: t('heading.products') }
    case 'matrix':
      return { title: section.options.variant === 'comparison' ? t('heading.matrixComparison') : t('heading.matrixSelection') }
    case 'finishes':
      return { title: t('heading.finishes') }
    case 'glass':
      return { title: t('heading.glass') }
    case 'hardware':
      return { title: t('heading.hardware') }
    case 'contact':
      return { title: t('heading.contact') }
    case 'about_us':
      return { title: t('heading.about') }
    case 'gallery':
      return { title: t('heading.gallery') }
    default:
      return {}
  }
}

/** Entradas del índice: secciones con contenido después del índice, y las líneas una vez. */
function tocEntries(template: DocTemplate, ctx: CatalogRenderContext, headings: (s: DocSection) => { title?: string }, hasContent: (id: string) => boolean): TocEntry[] {
  const out: TocEntry[] = []
  let familiesListed = false
  let afterIntro = false
  for (const section of template.sections) {
    if (!section.enabled) continue
    if (section.type === 'intro') {
      afterIntro = true
      continue
    }
    if (!afterIntro || section.type === 'cover' || section.type === 'page_break' || !hasContent(section.id)) continue
    const label = section.title?.trim() || headings(section).title
    if (!label) continue
    out.push({ key: section.id, label, target: section.id, level: 0 })
    if (!familiesListed && (section.type === 'families' || section.type === 'product_cards') && ctx.model.families.length > 1) {
      familiesListed = true
      for (const f of ctx.model.families.slice(0, 16)) out.push({ key: `${section.id}#${f.id}`, label: ctx.t('contents.family', { name: f.name }), target: `${section.id}#${f.id}`, level: 1 })
    }
  }
  return out
}

interface Assembled {
  resolved: ResolvedCatalogTemplate
  ctx: CatalogRenderContext
  pages: CatalogPage[]
}

export interface PreparedCatalogDocument {
  template: DocTemplate
  /** `<html lang>` (`es-CL`, `de-DE`…). */
  lang: string
  /** Título del documento («Catálogo de ventanas y puertas · Ventanas del Sur»). */
  title: string
  locale: DocLocale
}

/**
 * Lo que el HTML del PDF necesita antes de dibujar: la plantilla resuelta (para elegir e incrustar sus
 * fuentes), el idioma y el título. Barato: no arma las páginas.
 */
export function prepareCatalogDocument(props: Pick<CatalogDocumentProps, 'data' | 'template' | 'spec' | 'locale'>): PreparedCatalogDocument {
  const locale: DocLocale = isDocLocale(props.locale) ? props.locale : 'es'
  const resolved = resolveCatalogTemplate({ template: props.template, spec: props.spec, prefs: props.data.prefs, brandAccent: props.data.org.accent })
  const t = catalogText(locale)
  const name = props.data.title?.trim() || t('document.title')
  return { template: resolved.template, lang: intlTag(locale), locale, title: [name, props.data.org.name].filter(Boolean).join(' · ') }
}

/** Arma el documento completo (plantilla, modelo, bloques y páginas). Puro: lo usan las pruebas. */
export function assembleCatalog(props: CatalogDocumentProps): Assembled {
  const { data } = props
  const locale: DocLocale = isDocLocale(props.locale) ? props.locale : 'es'
  const resolved = resolveCatalogTemplate({ template: props.template, spec: props.spec, prefs: data.prefs, brandAccent: data.org.accent })
  const template = resolved.template
  const metrics = catalogMetrics(template.theme, template.page)
  const model = buildCatalogModel(data, locale)
  const t = catalogText(locale)
  const fmt = createFormatter(locale, { currency: props.currency || 'CLP' })
  const noon = isoNoon(data.date)
  const edition = noon ? fmt.date(noon, 'monthYear') : undefined
  const assets = props.assets ?? {}
  const textures = props.textures ?? {}
  const requestUrl = safeWebUrl(props.requestUrl) ?? safeWebUrl(data.org.website)
  const title = data.title?.trim() || t('document.title')
  const idPrefix = props.idPrefix ?? `dkc${hashText(`${template.id}|${template.presetId ?? ''}|${title}|${model.finishes.map((f) => f.id).join(',')}`)}`
  // Patrones de foliados compartidos por todos los dibujos (cada producto en su color y en el de cada variante).
  const designs = model.families.flatMap((f) => f.products.map((p) => p.source.design))
  const colorVariants = model.finishes.map((f) => ({ colorId: f.id }))
  const drawingDefs = createDrawingDefs({ designs: [...designs, ...colorVariants], catalog: data.catalog ?? { colors: [] }, prefix: idPrefix })
  const ctx: CatalogRenderContext = {
    ...(props.onSectionEdit ? { onSectionEdit: props.onSectionEdit } : {}),
    drawingDefs,
    data,
    template,
    metrics,
    model,
    locale,
    t,
    fmt,
    tax: props.taxLabel?.trim() || glossaryTerm('business.vat', locale),
    title,
    idPrefix,
    textures,
    asset: (id) => (id && Object.hasOwn(assets, id) ? safeImageSrc(assets[id]) : undefined),
    ...(requestUrl ? { requestUrl } : {}),
    pages: 0,
    ...(edition ? { edition } : {}),
  }
  const headings = (s: DocSection) => defaultHeading(s, t)
  let toc: TocEntry[] | undefined
  // Primero las secciones que no son índice: el índice solo nombra lo que de verdad se imprime.
  const bySection = new Map<string, Block[]>()
  const layoutCtx: LayoutContext = {
    template,
    metrics,
    model,
    heading: headings,
    asset: ctx.asset,
    priceNote: t('price.note', { tax: ctx.tax }),
    printNote: t('finishes.printNote'),
    openingLabels: model.openings,
    tocEntries: () => (toc ??= tocEntries(template, ctx, headings, (id) => (bySection.get(id)?.length ?? 0) > 0)),
  }
  for (const section of template.sections) if (section.enabled && section.type !== 'intro') bySection.set(section.id, sectionBlocks(section, layoutCtx))
  for (const section of template.sections) if (section.enabled && section.type === 'intro') bySection.set(section.id, sectionBlocks(section, layoutCtx))
  const blocks: Block[] = []
  let pendingBreak = false
  for (const section of template.sections) {
    if (!section.enabled) continue
    if (section.type === 'page_break') {
      pendingBreak = true
      continue
    }
    const list = [...(bySection.get(section.id) ?? [])]
    if (!list.length) continue
    if (pendingBreak) list[0] = { ...list[0], breakBefore: true }
    pendingBreak = false
    blocks.push(...list)
  }
  const g = geometry(metrics)
  const pages = paginateBlocks(blocks, metrics.content.height, (block) =>
    (block.data.kind === 'cards' || block.data.kind === 'productRow') && block.familyId
      ? (() => {
          const family = model.families.find((f) => f.id === block.familyId)
          return family
            ? { key: `${block.key}:cont`, sectionId: block.sectionId, familyId: family.id, height: g.chapterHeight, data: { kind: 'chapter', family, continued: true, qr: false }, tone: block.tone }
            : null
        })()
      : null,
  )
  expandLoneContact(pages, metrics.content.height)
  if (toc) {
    const first = firstPages(pages)
    for (const entry of toc) entry.page = first.get(entry.target)
  }
  ctx.pages = pages.length
  return { resolved, ctx, pages }
}

function mmv(n: number): string {
  return `${Math.round(n * 100) / 100}mm`
}

function pageContext(ctx: CatalogRenderContext, page: CatalogPage): string {
  const familyId = page.blocks.find((b) => b.familyId)?.familyId
  if (familyId) return ctx.model.families.find((f) => f.id === familyId)?.name ?? ''
  const heading = page.blocks.find((b) => b.data.kind === 'heading')
  return heading && heading.data.kind === 'heading' ? heading.data.title : ''
}

function PageHeader({ ctx, page }: { ctx: CatalogRenderContext; page: CatalogPage }) {
  const kind = ctx.template.page.header
  if (kind === 'none') return null
  const org = ctx.data.org
  const left =
    kind === 'reference' ? (
      <span className="dkc-header__title">{ctx.title}</span>
    ) : (
      <span className="dkc-header__brand">
        <OrgLogo org={org} />
        {org.logo ? <span>{org.name}</span> : null}
      </span>
    )
  const right = kind === 'logo' ? null : kind === 'reference' ? pageContext(ctx, page) : joinParts([ctx.title, ctx.edition])
  return (
    <header className="dkc-header">
      {left}
      {right ? <span className="dkc-header__context">{right}</span> : null}
    </header>
  )
}

function PageFooter({ ctx, page }: { ctx: CatalogRenderContext; page: CatalogPage }) {
  const p = ctx.template.page
  if (p.footer === 'none' && p.pageNumbers === 'none') return null
  const org = ctx.data.org
  let text = ''
  switch (p.footer) {
    case 'contact':
      text = joinParts([org.name, ...contactParts(org)])
      break
    case 'reference':
      text = joinParts([ctx.title, ctx.edition])
      break
    case 'contact_reference':
      text = joinParts([ctx.title, ...contactParts(org)])
      break
    case 'custom':
      text = (ctx.data.prefs?.footer ?? '').trim() || joinParts([org.name, ...contactParts(org)])
      break
    default:
      text = ''
  }
  const n = page.index + 1
  const number = p.pageNumbers === 'page' ? ctx.t('document.page', { page: n }) : p.pageNumbers === 'page_of_total' ? ctx.t('document.pageOf', { page: n, pages: ctx.pages }) : ''
  const slots: Record<'left' | 'center' | 'right', ReactNode> = { left: null, center: null, right: null }
  if (number) slots[p.pageNumberAlign] = <span className="dkc-footer__num">{number}</span>
  if (text && number && p.pageNumberAlign === 'center') {
    // Folio al centro: el texto se reparte a ambos lados (nada se corta con «…»).
    const parts = text.split(' · ')
    const half = Math.ceil(parts.length / 2)
    slots.left = <span className="dkc-footer__text">{parts.slice(0, half).join(' · ')}</span>
    if (parts.length > 1) slots.right = <span className="dkc-footer__text">{parts.slice(half).join(' · ')}</span>
  } else if (text) slots[p.pageNumberAlign === 'left' ? 'right' : 'left'] = <span className="dkc-footer__text">{text}</span>
  return (
    <footer className="dkc-footer" style={{ left: mmv(ctx.metrics.margin.left), right: mmv(ctx.metrics.margin.right), bottom: mmv(ctx.metrics.margin.bottom) }}>
      <span className="dkc-footer__slot dkc-footer__slot--left">{slots.left}</span>
      <span className="dkc-footer__slot dkc-footer__slot--center">{slots.center}</span>
      <span className="dkc-footer__slot dkc-footer__slot--right">{slots.right}</span>
    </footer>
  )
}

function CatalogPageView({ ctx, page }: { ctx: CatalogRenderContext; page: CatalogPage }) {
  const m = ctx.metrics
  const label = page.cover ? ctx.t('document.coverLabel') : ctx.t('document.pageLabel', { page: page.index + 1 })
  const chrome = !page.cover || ctx.template.page.chromeOnCover
  const cover = page.cover ? page.blocks.find((b) => b.data.kind === 'cover') : undefined
  return (
    <section className={page.cover ? 'dkc-page dkc-page--cover' : 'dkc-page'} aria-label={label} data-page={page.index + 1}>
      {cover && cover.data.kind === 'cover' ? <Cover ctx={ctx} section={cover.data.section} /> : null}
      {!page.cover ? (
        <div className="dkc-page__inner" style={{ top: mmv(m.margin.top), left: mmv(m.margin.left), right: mmv(m.margin.right) }}>
          <PageHeader ctx={ctx} page={page} />
          <div className="dkc-page__content" style={{ height: mmv(m.content.height) }}>
            {page.blocks.map((block) => (
              <BlockView key={block.key} ctx={ctx} block={block} />
            ))}
          </div>
        </div>
      ) : null}
      {chrome ? <PageFooter ctx={ctx} page={page} /> : null}
    </section>
  )
}

/** Catálogo de productos del taller (diseño predefinido o plantilla propia). */
export function CatalogDocument(props: CatalogDocumentProps) {
  const { resolved, ctx, pages } = assembleCatalog(props)
  const template = resolved.template
  const vars = catalogThemeVars(template.theme, ctx.metrics)
  const classes = ['dkc', 'fzd-catalog', resolved.presetId ? `fzd-catalog--${resolved.presetId}` : 'fzd-catalog--custom', resolved.legacyId ? `fzd-catalog--${resolved.legacyId}` : '', props.className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={classes}
      data-paper={template.page.size === 'A4' ? 'a4' : 'letter'}
      data-template={resolved.presetId ?? 'custom'}
      data-pages={pages.length}
      lang={intlTag(ctx.locale)}
      role="document"
      aria-label={ctx.title}
      style={vars as CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: catalogCss(template.page) }} />
      <FinishDefs ctx={ctx} finishes={ctx.model.finishes} />
      <DrawingDefsSvg defs={ctx.drawingDefs} />
      {pages.map((page) => (
        <CatalogPageView key={page.index} ctx={ctx} page={page} />
      ))}
    </div>
  )
}
