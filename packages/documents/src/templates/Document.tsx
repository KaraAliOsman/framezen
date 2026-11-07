/**
 * Documento con plantilla: arma los bloques de todas las secciones visibles, los pagina y dibuja cada
 * hoja con su cabecera corrida, pie y numeración. Dos modos:
 *
 * - `TemplateDocumentView` (sin hooks): paginación con altos estimados o medidos que se le pasen. Es lo
 *   que usa el servidor (y el render por tramos puede partirlo por hojas). En Chromium el servidor
 *   corre `flowDocumentPages` antes de imprimir para repaginar con los altos reales.
 * - `MeasuredTemplateDocument` (navegador): mide los bloques en el DOM con las fuentes cargadas y
 *   vuelve a paginar con esos altos (vista previa exacta, también con zoom).
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { applyTermsPlacement, withClosingLast, type DocSection } from '@dekopen/shared'
import { clsx } from '../base/clsx'
import { joinParts } from '../base/format'
import { markEdges, paginateFlow, type FlowBlock, type FlowPage, type FlowResult } from './flow'
import type { QuoteModel } from './model'
import { CHROME } from './page'
import { BrandLogos, DocText, DottedText, Label, OrgLogo, markHeight } from './parts'
import { QUOTE_SECTION_RENDERERS } from './registry'
import { lineH, textMetrics } from './sections/common'
import { itemsFillPages } from './sections/items'
import { DrawingDefsSvg } from '../textures'
import { templateThemeVars } from './theme'
import { TEMPLATE_CSS } from './css'

// ── Identidad (hoja inicial sin portada) ────────────────────────────────────

function contactLines(m: QuoteModel): string[] {
  const o = m.data.org
  const { t } = m.kit
  return [
    joinParts([o.legalName && o.legalName !== o.name ? o.legalName : undefined, o.rut ? t('doc.taxIdValue', { value: o.rut }) : undefined]),
    joinParts([o.address, o.city], ', '),
    joinParts([o.phone, o.email, o.website?.replace(/^https?:\/\//, '')]),
  ].filter(Boolean)
}

const LOGO_CLASS = { s: 'md', m: 'lg', l: 'xl', xl: 'xxl' } as const
const LOGO_HEIGHT = { s: 36, m: 56, l: 76, xl: 100 } as const

function letterhead(m: QuoteModel): FlowBlock {
  const { t, fmt } = m.kit
  const d = m.data
  const lines = contactLines(m)
  const tm = textMetrics(m)
  const layout = m.settings.letterhead
  const logo = m.settings.showLogo
  const logoH = logo ? LOGO_HEIGHT[m.settings.logoSize] : 0
  const node = (
    <header className={clsx('dkd-lh', `dkd-lh--${layout}`)}>
      <div className="dkd-lh__brand">
        {logo ? <OrgLogo org={d.org} size={LOGO_CLASS[m.settings.logoSize]} /> : null}
        <div className="dkd-lh__org">
          {lines.map((l) => (
            <div key={l} className="dkd-lh__line">
              {l}
            </div>
          ))}
        </div>
      </div>
      <div className="dkd-lh__doc">
        {m.canEdit('docTitle') ? <span className="dkd-label"><DocText m={m} field="docTitle" value={m.docTitle} as="span" inline /></span> : <Label>{m.docTitle}</Label>}
        <div className="dkd-lh__number dkd-num">{m.numberLabel}</div>
        <dl className="dkd-lh__dates">
          {d.quote.date ? (
            <div>
              <dt>{t('doc.issued')}</dt>
              <dd className="dkd-num">{fmt.date(d.quote.date)}</dd>
            </div>
          ) : null}
          {m.validUntil ? (
            <div>
              <dt>{t('doc.validUntil')}</dt>
              <dd className="dkd-num">{fmt.date(m.validUntil)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </header>
  )
  const left = Math.max(logoH, logo ? lineH(tm.h3) : 0) + lines.length * lineH(tm.small) + 8
  const right = lineH(tm.label) + lineH(tm.h2) + 3 * lineH(tm.small) + 6
  const height = layout === 'split' ? Math.max(left, right) : left + right + 12
  return { key: 'identity', sectionId: 'identity', sectionType: 'identity', node, height: Math.ceil(height + 18), space: 0 }
}

/** Marcas una sola vez, bajo la identidad. Sin logos subidos no hay franja. */
function brandStrip(m: QuoteModel): FlowBlock | null {
  if (m.settings.brandPlacement === 'items') return null
  const marks = [...m.brands.profile, ...m.brands.hardware]
  if (marks.length === 0) return null
  return {
    key: 'brands',
    sectionId: 'identity',
    sectionType: 'identity',
    node: <div className="dkd-brands"><BrandLogos marks={marks} size={m.settings.brandSize} /></div>,
    height: markHeight(m.settings.brandSize) + 4,
    space: m.tokens.density.gap,
  }
}

/** Título de la obra bajo la identidad cuando ninguna sección inicial lo muestra. */
function titleBlock(m: QuoteModel): FlowBlock {
  const tm = textMetrics(m)
  const title = m.data.quote.title
  const node = (
    <div className="dkd-doctitle">
      {m.canEdit('title') ? <DocText m={m} field="title" value={title} as="h1" inline placeholder={m.kit.t('fields.project')} className="dkd-doctitle__text" /> : <h1 className="dkd-doctitle__text"><DottedText text={title} /></h1>}
    </div>
  )
  const lines = Math.max(1, Math.ceil((title.length * tm.h1.size * tm.h1.charWidth) / (m.page.contentWidth * 0.9)))
  return { key: 'doctitle', sectionId: 'identity', sectionType: 'identity', node, height: Math.ceil(lines * lineH(tm.h1) + 4), space: m.tokens.density.section * 0.8 }
}

// ── Bloques del documento ───────────────────────────────────────────────────

export function quoteBlocks(m: QuoteModel): FlowBlock[] {
  // El esquema ya lo exige; aquí se garantiza para cualquier plantilla que llegue a imprimirse.
  const placement = m.settings.termsPlacement
  const sections = applyTermsPlacement(withClosingLast(m.template.sections.filter((s) => s.enabled)), placement).map((s) => (placement === 'own_page' && s.type === 'terms' ? { ...s, pageBreak: 'before' as const } : s))
  const hasCover = sections.some((s) => s.type === 'cover')
  const blocks: FlowBlock[] = []
  if (!hasCover) {
    blocks.push(letterhead(m))
    // Sin portada ni franja con la obra, el título va bajo la identidad.
    const showsProject = sections.some((s) => s.type === 'client_strip' && s.options.fields.includes('project'))
    if (m.title && !showsProject) blocks.push(titleBlock(m))
  }
  let number = 0
  let firstBody = hasCover
  const brands = brandStrip(m)
  let brandsPlaced = !brands
  if (brands && !hasCover && !sections.some((s) => s.type === 'client_strip')) {
    blocks.push(brands)
    brandsPlaced = true
  }
  sections.forEach((section: DocSection, index) => {
    const render = QUOTE_SECTION_RENDERERS[section.type]
    if (!render) return
    const untitled = section.type === 'cover' || section.type === 'page_break' || (section.type === 'items' && itemsFillPages(section.options)) || (section.type === 'letter' && !section.title) || (section.type === 'client_strip' && !section.title)
    // Una sección que no imprime nada no gasta número: los capítulos no saltan del 6 al 8.
    const next = untitled ? number : number + 1
    const out = render(section, m, { index, number: next, first: firstBody && section.type !== 'cover' && blocks.every((b) => b.page === 'cover') })
    if (out.length) number = next
    if (out.length && section.type !== 'cover') firstBody = false
    blocks.push(...out)
    // Las marcas van una sola vez, tras los datos de la cotización (o tras la portada).
    if (brands && !brandsPlaced && ((section.type === 'client_strip' && out.length) || (section.type === 'cover' && !sections.some((s) => s.type === 'client_strip')))) {
      blocks.push(brands)
      brandsPlaced = true
    }
  })
  if (brands && !brandsPlaced) blocks.splice(hasCover ? 1 : 0, 0, brands)
  keepClosing(blocks)
  keepLegalTogether(blocks, m.page.bodyHeight)
  pullTextForward(blocks, hasCover ? m.page.bodyHeight : m.page.leadBodyHeight)
  // El cierre abre hoja salvo que quepa entero en lo que queda: así no queda una hoja a medias antes del total.
  const close = blocks.findIndex((b) => b.sectionType === 'totals')
  if (close > 0 && blocks[close].breakBefore && blocks[close - 1].page !== 'own') blocks[close].breakUnlessFits = true
  return markEdges(blocks, m.tokens.density.pad)
}

const LEGAL = new Set(['warranty', 'terms', 'technical_specs'])

/**
 * El total viaja con su forma de pago, y la aceptación con lo que la antecede: la firma nunca queda sola
 * en otra hoja. Las condiciones que van en medio fluyen por párrafos.
 */
function keepClosing(blocks: FlowBlock[]): void {
  const start = blocks.findIndex((b) => b.sectionType === 'totals')
  if (start < 0) return
  for (let i = start; i < blocks.length - 1 && !LEGAL.has(blocks[i + 1].sectionType); i++) blocks[i].keepWithNext = true
  const accept = blocks.findIndex((b) => b.sectionType === 'acceptance')
  if (accept > start) {
    blocks[accept - 1].keepWithNext = true
    for (let i = accept; i < blocks.length - 1; i++) blocks[i].keepWithNext = true
  }
}

/**
 * Cuando las ventanas llenan hojas enteras, lo que va antes y lo que va después quedaban como dos hojas
 * a medias. Si la especificación, la garantía y las condiciones caben en la hoja inicial, suben a ella.
 * El alto estimado de estas hojas es holgado (medido: unos 10 % sobre el real); si aun así no cabe, solo vuelve a su propia hoja.
 */
function pullTextForward(blocks: FlowBlock[], sheet: number): void {
  const first = blocks.findIndex((b) => b.sectionType === 'items')
  if (first < 0 || blocks[first].page !== 'own') return
  let last = first
  while (last + 1 < blocks.length && blocks[last + 1].sectionType === 'items') last++
  let to = last
  while (to + 1 < blocks.length && LEGAL.has(blocks[to + 1].sectionType)) to++
  if (to === last) return
  const start = blocks.findIndex((b) => b.page !== 'cover')
  const size = (from: number, end: number) => blocks.slice(from, end).reduce((a, b) => a + b.height + b.space, 0)
  if (start >= first || size(start, first) + size(last + 1, to + 1) > sheet * 1.07) return
  const moved = blocks.splice(last + 1, to - last).map((b) => {
    const { breakBefore: _b, softBreak: _s, ...rest } = b
    return rest as FlowBlock
  })
  blocks.splice(first, 0, ...moved)
}

/**
 * Garantía y condiciones leen como una unidad: si caben en una hoja viajan juntas, para que las
 * condiciones no queden solas en una hoja casi vacía. Y si van antes del total y el cierre no abre hoja
 * propia, también van con él: la última hoja nunca es solo el total.
 */
function keepLegalTogether(blocks: FlowBlock[], sheet: number): void {
  const closing = blocks.findIndex((b) => b.sectionType === 'totals')
  const from = blocks.findIndex((b) => b.sectionType === 'warranty' || b.sectionType === 'terms')
  // Bajo el total las condiciones siguen donde quedó la hoja: no saltan a otra para ir juntas.
  if (from < 0 || (closing >= 0 && from > closing)) return
  let to = from
  while (to + 1 < blocks.length && (blocks[to + 1].sectionType === 'warranty' || blocks[to + 1].sectionType === 'terms')) to++
  const height = blocks.slice(from, to + 1).reduce((a, b) => a + b.height + b.space, 0)
  if (height > sheet) return
  for (let i = from; i < to; i++) if (!blocks[i + 1].breakBefore) blocks[i].keepWithNext = true
  if (closing === to + 1 && !blocks[closing].breakBefore) blocks[to].keepWithNext = true
}

export function paginateQuote(m: QuoteModel, blocks: FlowBlock[], measured?: Record<string, number> | null): FlowResult {
  return paginateFlow(blocks, { lead: m.page.leadBodyHeight, rest: m.page.bodyHeight, cover: m.page.coverBodyHeight }, measured ? (b) => measured[b.key] ?? b.height : undefined)
}

// ── Cabecera, pie y numeración ──────────────────────────────────────────────

function PageNumber({ m, n, total }: { m: QuoteModel; n: number; total: number }) {
  const style = m.template.page.pageNumbers
  if (style === 'none') return null
  const { t } = m.kit
  const message = style === 'page_of_total' ? t('doc.pageOf', { page: '\u0001', pages: '\u0002' }) : t('doc.page', { page: '\u0001' })
  const parts = message.split(/(\u0001|\u0002)/)
  return (
    <span className="dkd-foot__pn">
      {parts.map((p, i) =>
        p === '\u0001' ? (
          <span key={i} data-dk-pn="">
            {n}
          </span>
        ) : p === '\u0002' ? (
          <span key={i} data-dk-pt="">
            {total}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}

function RunningHeader({ m }: { m: QuoteModel }) {
  const h = m.template.page.header
  if (h === 'none') return null
  const org = m.data.org
  const showLogo = m.settings.showLogo && (h === 'logo' || h === 'logo_reference')
  const showRef = h === 'reference' || h === 'logo_reference'
  return (
    <div className="dkd-page__head dkd-run" style={{ height: CHROME.headerHeight, marginBottom: CHROME.headerGap }} data-dk-chrome="head">
      {showLogo ? (
        <span className="dkd-run__brand">
          <OrgLogo org={org} size="sm" />
        </span>
      ) : (
        <span className="dkd-run__ref dkd-code">{m.reference}</span>
      )}
      <span className="dkd-run__context">{showRef ? joinParts([showLogo ? m.reference : undefined, m.title]) : m.title}</span>
    </div>
  )
}

function Footer({ m, n, total, first }: { m: QuoteModel; n: number; total: number; first: boolean }) {
  const p = m.template.page
  if (p.footer === 'none' && p.pageNumbers === 'none') return null
  const org = m.data.org
  const contact = joinParts([org.name, org.phone, org.email, org.website?.replace(/^https?:\/\//, '')])
  const reference = joinParts([m.reference, m.title])
  let left: ReactNode = null
  if (p.footer === 'contact') left = contact
  else if (p.footer === 'reference') left = reference
  else if (p.footer === 'contact_reference') left = joinParts([reference, org.name, org.phone])
  else if (p.footer === 'custom') left = first && m.canEdit('footer') ? <DocText m={m} field="footer" value={m.texts.footer} as="span" inline placeholder={m.kit.t('doc.madeWith')} /> : m.texts.footer || contact
  return (
    <div className={clsx('dkd-page__foot', 'dkd-foot', `dkd-foot--${p.pageNumberAlign}`)} style={{ height: CHROME.footerHeight, marginTop: CHROME.footerGap }} data-dk-chrome="foot">
      <span className="dkd-foot__text">{left}</span>
      <PageNumber m={m} n={n} total={total} />
    </div>
  )
}

function Block({ placed, m }: { placed: FlowPage['blocks'][number]; m: QuoteModel }) {
  const b = placed.block
  return (
    <div
      className={clsx('dkd-block', b.tone && b.tone !== 'paper' && b.page !== 'cover' && `dkd-tone dkd-tone--${b.tone}`, b.edge && `dkd-edge--${b.edge}`, `dkd-sec--${b.sectionType}`, placed.overflow && 'dkd-block--overflow')}
      style={b.space || b.innerSpace || b.page === 'own' ? ({ ...(b.space ? { '--sp': `${b.space}px` } : {}), ...(b.innerSpace ? { '--tsp': `${b.innerSpace}px` } : {}), ...(b.page === 'own' ? { height: '100%' } : {}) } as CSSProperties) : undefined}
      data-dk-block={placed.clone ? undefined : b.key}
      data-dk-clone={placed.clone ? '' : undefined}
      data-dk-space={b.space || undefined}
      data-dk-h={placed.clone ? undefined : Math.round(b.height)}
      data-dk-section={b.sectionId}
      data-dk-type={b.sectionType}
      data-dk-keep={b.keepWithNext ? '' : undefined}
      data-dk-break={b.breakBefore ? (b.softBreak ? 'soft' : '') : undefined}
      data-dk-fit={b.breakUnlessFits ? '' : undefined}
      data-dk-own={b.page === 'own' ? '1' : undefined}
      data-dk-group={b.group}
      data-dk-thead={b.thead ? '' : undefined}
    >
      {b.node}
    </div>
  )
}

export interface TemplateDocumentViewProps {
  model: QuoteModel
  blocks?: FlowBlock[]
  /** Altos medidos por clave de bloque (vista previa). */
  measured?: Record<string, number> | null
  withStyles?: boolean
  className?: string
  rootRef?: (el: HTMLDivElement | null) => void
}

/** Variables y clases de la raíz del documento. */
export function templateRootProps(m: QuoteModel): { className: string; style: CSSProperties } {
  const th = m.theme
  return {
    className: clsx('dkd', `dkd--c-${m.tokens.composition.id}`, `dkd--${m.template.page.size === 'A4' ? 'a4' : 'letter'}`, m.page.landscape && 'dkd--landscape', `dkd--accent-${th.accentUsage}`, `dkd--rules-${th.rules}`, `dkd--img-${th.imageTreatment}`, `dkd--radius-${th.radius}`, `dkd--density-${th.density}`, `dkd--scale-${th.typeScale}`, `dkd--labels-${th.labelCase}`),
    style: templateThemeVars(th, m.page),
  }
}

export function TemplateDocumentView({ model: m, blocks, measured, withStyles, className, rootRef }: TemplateDocumentViewProps) {
  const list = blocks ?? quoteBlocks(m)
  const { pages } = paginateQuote(m, list, measured)
  const root = templateRootProps(m)
  const total = pages.length
  const size = `${m.template.page.size === 'A4' ? 'A4' : 'letter'}${m.page.landscape ? ' landscape' : ''}`
  return (
    <div
      ref={rootRef}
      className={clsx(root.className, className)}
      style={root.style}
      role="document"
      aria-label={joinParts([m.reference, m.title])}
      lang={m.kit.lang}
      data-dk-flow=""
      data-template={m.template.id}
      data-preset={m.template.presetId}
      data-locale={m.kit.locale}
    >
      <style dangerouslySetInnerHTML={{ __html: `@page { size: ${size}; margin: 0; }${withStyles ? `\n${TEMPLATE_CSS}` : ''}` }} />
      <DrawingDefsSvg defs={m.drawingDefs} />
      {pages.map((page, i) => {
        const cover = page.kind === 'cover'
        const chrome = !cover || (m.template.page.chromeOnCover && !page.bleed)
        return (
          <section
            key={i}
            className={clsx('dkd-page', cover && 'dkd-page--cover', page.bleed && 'dkd-page--bleed', page.lead && 'dkd-page--lead', cover && !chrome && 'dkd-page--bare')}
            data-dk-page={cover ? 'cover' : 'flow'}
            data-dk-lead={page.lead ? '' : undefined}
            aria-label={m.kit.t('doc.page', { page: i + 1 })}
          >
            {chrome ? <RunningHeader m={m} /> : null}
            <div className="dkd-page__body" data-dk-body="">
              {page.blocks.map((placed, j) => (
                <Block key={`${placed.block.key}${placed.clone ? `~${j}` : ''}`} placed={placed} m={m} />
              ))}
            </div>
            {chrome ? <Footer m={m} n={i + 1} total={total} first={i === 0 || (i === 1 && pages[0].kind === 'cover')} /> : null}
          </section>
        )
      })}
    </div>
  )
}

// ── Medición en el navegador ────────────────────────────────────────────────

/** Mide el alto de cada bloque (el aire previo es su margen) y corrige el zoom de la vista. */
function measureBlocks(root: HTMLElement, pageHeight: number): Record<string, number> | null {
  const page = root.querySelector<HTMLElement>('.dkd-page')
  if (!page || page.offsetHeight <= 0) return null
  const factor = page.offsetHeight / pageHeight
  if (!(factor > 0.05 && factor < 20)) return null
  const out: Record<string, number> = {}
  let any = false
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-dk-block]'))) {
    const key = el.getAttribute('data-dk-block')
    if (!key) continue
    const h = Math.max(0, el.offsetHeight) / factor
    if (h > 0) any = true
    out[key] = Math.ceil(h * 10) / 10
  }
  return any ? out : null
}

function sameHeights(a: Record<string, number> | null, b: Record<string, number> | null): boolean {
  if (!a || !b) return a === b
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (Math.abs((a[k] ?? -99) - (b[k] ?? -99)) > 1) return false
  return true
}

/**
 * Vista previa exacta: primero con altos estimados, luego con los medidos en el DOM (y otra vez cuando
 * terminan de cargar las fuentes). Converge en uno o dos pasos; si el entorno no tiene diseño (jsdom),
 * se queda con la estimación.
 */
export function MeasuredTemplateDocument(props: TemplateDocumentViewProps) {
  const { model } = props
  const blocks = useMemo(() => props.blocks ?? quoteBlocks(model), [props.blocks, model])
  const signature = useMemo(() => blocks.map((b) => `${b.key}:${b.height}`).join('|'), [blocks])
  const ref = useRef<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState<Record<string, number> | null>(null)
  const passes = useRef({ signature: '', count: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (passes.current.signature !== signature) passes.current = { signature, count: 0 }
    const run = () => {
      if (!ref.current || passes.current.count > 4) return
      const next = measureBlocks(ref.current, model.page.height)
      if (!next) return
      setMeasured((prev) => {
        if (sameHeights(prev, next)) return prev
        passes.current.count++
        return next
      })
    }
    run()
    const fonts = (el.ownerDocument as Document & { fonts?: FontFaceSet }).fonts
    let alive = true
    fonts?.ready?.then(() => alive && run(), () => undefined)
    return () => {
      alive = false
    }
  })
  return <TemplateDocumentView {...props} blocks={blocks} measured={measured} rootRef={(el) => (ref.current = el)} />
}
