import type { ReactNode } from 'react'
import type { Catalog } from '@framezen/engine'
import type { DocumentPrefs } from '@framezen/shared'
import { clsx } from '../../base/clsx'
import { EditableText } from '../../base/editable'
import { addDays, formatArea, formatClp, formatDateLong, formatDateShort, formatMeasure, formatNumber, joinParts, quoteLabel, revisionLetter } from '../../base/format'
import { DocFooter, GlassGlyph, PaymentPlan, SignatureBlock, Swatch, TotalsBox } from '../../base/primitives'
import { estimateLines } from '../../base/text'
import { themeFromPrefs, type DocTheme } from '../../base/theme'
import { colorHex } from '../../drawing/colors'
import { WindowDrawing } from '../../drawing/WindowDrawing'
import { describeOpening } from '../describe'
import type { QuoteDocData, QuoteDocField, QuoteDocItem } from '../types'

/** Todo lo que las cuatro plantillas necesitan derivar de los datos. */
export interface QuoteCtx {
  data: QuoteDocData
  prefs: DocumentPrefs
  theme: DocTheme
  catalog: Catalog
  editable: boolean
  /** Props para EditableText de un campo. */
  ed: (field: QuoteDocField) => { editable: boolean; onChange?: (value: string) => void; field: string }
  label: string
  validUntil: string
  clientName: string
}

export function quoteCtx(data: QuoteDocData, editable: boolean, onEdit?: (field: QuoteDocField, value: string) => void): QuoteCtx {
  const prefs = data.prefs
  const theme = themeFromPrefs(prefs, data.org.accent)
  const validUntil = data.quote.validUntil ?? (prefs.validityDays > 0 ? addDays(data.quote.date, prefs.validityDays) : '')
  return {
    data,
    prefs,
    theme,
    catalog: data.catalog,
    editable: editable && !!onEdit,
    ed: (field) => ({ editable: editable && !!onEdit, onChange: onEdit ? (value: string) => onEdit(field, value) : undefined, field }),
    label: quoteLabel(data.quote.number, data.quote.revision),
    validUntil,
    clientName: data.client?.name?.trim() ?? '',
  }
}

// ── Textos ────────────────────────────────────────────────────────────────────

export function itemTitle(item: QuoteDocItem): string {
  return item.name?.trim() || item.description || item.ref
}

/** Subtítulo: tipología (si hay nombre propio) y ambiente. */
export function itemSubtitle(item: QuoteDocItem): string {
  return joinParts([item.name?.trim() ? item.description : undefined, item.location])
}

export function unitsLabel(n: number): string {
  return `${formatNumber(n)} ${n === 1 ? 'unidad' : 'unidades'}`
}

export function windowsLabel(n: number): string {
  return `${formatNumber(n)} ${n === 1 ? 'ventana' : 'ventanas'}`
}

export function footerFor(ctx: QuoteCtx, page: number, pages: number): ReactNode {
  const { data, prefs } = ctx
  const left = page === 1 && prefs.footer ? (
    <EditableText as="span" inline value={prefs.footer} {...ctx.ed('footer')} placeholder="Pie de página" />
  ) : (
    prefs.footer || joinParts([data.org.name, data.org.website?.replace(/^https?:\/\//, '')])
  )
  return <DocFooter page={page} pages={pages} left={left} right={`${ctx.label} · Página ${page} de ${pages}`} />
}

// ── Ítems ─────────────────────────────────────────────────────────────────────

export function Ref({ value, variant }: { value: string; variant?: 'accent' | 'solid' }) {
  return <span className={clsx('fzd-ref', variant === 'accent' && 'fzd-ref--accent', variant === 'solid' && 'fzd-ref--solid')}>{value}</span>
}

export function ColorValue({ ctx, item }: { ctx: QuoteCtx; item: QuoteDocItem }) {
  const ext = colorHex(item.design.colorId, ctx.catalog)
  const int = item.design.colorInId && item.design.colorInId !== item.design.colorId ? colorHex(item.design.colorInId, ctx.catalog) : null
  return (
    <>
      {ctx.prefs.showColorSwatch ? (
        <span style={{ display: 'inline-flex', gap: 2, verticalAlign: '-1px' }}>
          <Swatch color={ext} />
          {int ? <Swatch color={int} /> : null}
        </span>
      ) : null}
      <span>{item.colorName}</span>
    </>
  )
}

export function GlassValue({ ctx, item }: { ctx: QuoteCtx; item: QuoteDocItem }) {
  const glass = ctx.catalog.glass.find((g) => g.id === item.design.glassId)
  return (
    <>
      <GlassGlyph kind={glass?.kind ?? 'dvh'} size={11} />
      <span>{item.glassName}</span>
    </>
  )
}

export interface SpecRow {
  key: string
  label: string
  value: ReactNode
}

/** Filas de especificación según las preferencias del taller. */
export function specRows(ctx: QuoteCtx, item: QuoteDocItem, opts: { measure?: boolean; area?: boolean; opening?: boolean } = {}): SpecRow[] {
  const { prefs } = ctx
  const rows: SpecRow[] = []
  if (opts.measure !== false) rows.push({ key: 'measure', label: 'Medidas', value: <span className="fzd-measure">{formatMeasure(item.width, item.height)}</span> })
  if (opts.opening) rows.push({ key: 'opening', label: 'Apertura', value: describeOpening(item.design) })
  if (prefs.showLine && item.lineName) rows.push({ key: 'line', label: 'Línea', value: item.lineName })
  rows.push({ key: 'color', label: 'Color', value: <ColorValue ctx={ctx} item={item} /> })
  if (prefs.showGlass && item.glassName) rows.push({ key: 'glass', label: 'Vidrio', value: <GlassValue ctx={ctx} item={item} /> })
  if (prefs.showArea && opts.area !== false) rows.push({ key: 'area', label: 'Superficie', value: <span className="fzd-num">{formatArea(item.area)}{item.qty > 1 ? ' c/u' : ''}</span> })
  return rows
}

export function Specs({ rows, className }: { rows: SpecRow[]; className?: string }) {
  return (
    <dl className={clsx('fzd-specs', className)}>
      {rows.map((row) => (
        <div key={row.key} className="fzd-spec">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Línea compacta: «1.200 × 1.500 mm · PVC Serie 60 · ■ Blanco · Termopanel». */
export function SpecLine({ ctx, item, measure = true }: { ctx: QuoteCtx; item: QuoteDocItem; measure?: boolean }) {
  const parts: ReactNode[] = []
  if (measure) parts.push(<span key="m" className="fzd-measure">{formatMeasure(item.width, item.height)}</span>)
  if (ctx.prefs.showLine && item.lineName) parts.push(<span key="l">{item.lineName}</span>)
  parts.push(
    <span key="c" className="fzd-inline">
      <ColorValue ctx={ctx} item={item} />
    </span>,
  )
  if (ctx.prefs.showGlass && item.glassName) parts.push(<span key="g">{item.glassName}</span>)
  return (
    <span className="fzd-specline">
      {parts.map((p, i) => (
        <span key={i} className="fzd-specline__part">
          {p}
        </span>
      ))}
    </span>
  )
}

/** Cantidad × unitario (si se muestra) y total del ítem. */
export function PriceBlock({ ctx, item, align = 'right' }: { ctx: QuoteCtx; item: QuoteDocItem; align?: 'right' | 'left' }) {
  return (
    <div className={clsx('fzd-price', align === 'left' && 'fzd-price--left')}>
      {ctx.prefs.showUnitPrice ? (
        <div className="fzd-price__unit">
          {item.qty > 1 ? `${formatNumber(item.qty)} × ` : ''}
          {formatClp(item.unitPrice)}
          {item.qty === 1 ? ' c/u' : ''}
        </div>
      ) : (
        <div className="fzd-price__unit">{unitsLabel(item.qty)}</div>
      )}
      <div className="fzd-price__total">{formatClp(item.total)}</div>
      {ctx.prefs.showUnitPrice && item.qty > 1 ? <div className="fzd-price__qty">{unitsLabel(item.qty)}</div> : null}
    </div>
  )
}

export interface DrawingBoxProps {
  ctx: QuoteCtx
  item: QuoteDocItem
  width: number
  height: number
  dimensions?: 'none' | 'total' | 'all'
  /** Miniatura exterior en la esquina (si el taller la activó). */
  inset?: boolean
  className?: string
}

/** Dibujo dentro de un pozo de papel, con la vista exterior opcional abajo a la derecha (sin taparlo). */
export function DrawingBox({ ctx, item, width, height, dimensions = 'all', inset = true, className }: DrawingBoxProps) {
  const showInset = inset && ctx.prefs.showExteriorView && width >= 150
  const insetSize = Math.round(Math.min(58, width * 0.24))
  const mainW = width - (showInset ? insetSize + 18 : 12)
  return (
    <div className={clsx('fzd-well', 'fzd-drawbox', showInset && 'fzd-drawbox--inset', className)} style={{ width, height }}>
      <div className="fzd-drawbox__main" style={{ width: showInset ? mainW + 6 : undefined }}>
        <WindowDrawing
          layout={item.layout}
          design={item.design}
          catalog={ctx.catalog}
          width={mainW}
          height={height - 12}
          dimensions={dimensions}
          title={`${item.ref}: ${itemTitle(item)}, ${formatMeasure(item.width, item.height)}, vista interior`}
        />
      </div>
      {showInset ? (
        <div className="fzd-drawbox__inset">
          <WindowDrawing layout={item.layout} design={item.design} catalog={ctx.catalog} view="exterior" width={insetSize} height={insetSize} dimensions="none" title={`${item.ref}: vista exterior`} />
          <span>Exterior</span>
        </div>
      ) : null}
    </div>
  )
}

// ── Bloques de cierre ─────────────────────────────────────────────────────────

export function ClientLines({ ctx }: { ctx: QuoteCtx }) {
  const c = ctx.data.client
  if (!c?.name) return null
  return (
    <>
      <div className="fzd-strong">{c.name}</div>
      {c.rut ? <div className="fzd-muted">RUT {c.rut}</div> : null}
      {joinParts([c.address, c.city], ', ') ? <div className="fzd-muted">{joinParts([c.address, c.city], ', ')}</div> : null}
      {joinParts([c.phone, c.email]) ? <div className="fzd-muted">{joinParts([c.phone, c.email])}</div> : null}
    </>
  )
}

export function ValidityText({ ctx }: { ctx: QuoteCtx }) {
  const { prefs } = ctx
  return (
    <span>
      Válida por{' '}
      <EditableText as="span" inline value={String(prefs.validityDays || 15)} {...ctx.ed('validityDays')} className="fzd-num" placeholder="Días" /> días
      {ctx.validUntil ? <>, hasta el {formatDateLong(ctx.validUntil)}</> : null}.
    </span>
  )
}

export function IntroText({ ctx, className }: { ctx: QuoteCtx; className?: string }) {
  const value = ctx.prefs.intro ?? ''
  if (!value && !ctx.editable) return null
  return <EditableText as="div" rich value={value} {...ctx.ed('intro')} className={clsx('fzd-lead', className)} placeholder="Escribe un saludo para tu cliente" />
}

/** Condiciones en dos columnas: comerciales, plazo, garantía, vigencia y notas. */
export function TermsBlock({ ctx, className }: { ctx: QuoteCtx; className?: string }) {
  const { prefs, data } = ctx
  const blocks: { key: QuoteDocField | 'validity'; title: string; body: ReactNode }[] = []
  if (prefs.conditions || ctx.editable)
    blocks.push({ key: 'conditions', title: 'Condiciones', body: <EditableText rich value={prefs.conditions ?? ''} {...ctx.ed('conditions')} placeholder="Qué incluye y qué no" /> })
  if (prefs.leadTimeText || ctx.editable)
    blocks.push({ key: 'leadTimeText', title: 'Plazo', body: <EditableText value={prefs.leadTimeText ?? ''} {...ctx.ed('leadTimeText')} placeholder="Plazo de fabricación e instalación" /> })
  if (prefs.warranty || ctx.editable)
    blocks.push({ key: 'warranty', title: 'Garantía', body: <EditableText rich value={prefs.warranty ?? ''} {...ctx.ed('warranty')} placeholder="Garantía de perfiles, herrajes e instalación" /> })
  blocks.push({ key: 'validity', title: 'Vigencia', body: <ValidityText ctx={ctx} /> })
  if (data.quote.notes || ctx.editable)
    blocks.push({ key: 'notes', title: 'Notas', body: <EditableText rich value={data.quote.notes ?? ''} {...ctx.ed('notes')} placeholder="Notas para tu cliente" /> })
  return (
    <div className={clsx('fzd-terms', className)}>
      {blocks.map((b) => (
        <section key={b.key} className="fzd-term">
          <h3 className="fzd-term__title">{b.title}</h3>
          <div className="fzd-term__body">{b.body}</div>
        </section>
      ))}
    </div>
  )
}

export function PaymentBlock({ ctx }: { ctx: QuoteCtx }) {
  const { prefs, data } = ctx
  if (!prefs.paymentTerms && !ctx.editable) return null
  return (
    <section className="fzd-paybox">
      <h3 className="fzd-term__title">Forma de pago</h3>
      <EditableText value={prefs.paymentTerms ?? ''} {...ctx.ed('paymentTerms')} className="fzd-term__body" placeholder="Ej.: 50% al aceptar, 50% contra entrega" />
      <PaymentPlan text={prefs.paymentTerms} total={data.totals.total} className="fzd-paybox__plan" />
    </section>
  )
}

export function QuoteTotals({ ctx, variant }: { ctx: QuoteCtx; variant?: 'box' | 'flat' }) {
  const { data, prefs } = ctx
  return <TotalsBox totals={data.totals} extras={data.extras} showArea={prefs.showArea} variant={variant} />
}

export function AcceptanceBlock({ ctx, title = 'Aceptación', className }: { ctx: QuoteCtx; title?: string; className?: string }) {
  const { data, prefs } = ctx
  return (
    <section className={clsx('fzd-accept', className)}>
      <div className="fzd-accept__head">
        <h3 className="fzd-term__title">{title}</h3>
        {data.quote.portalUrl && !data.quote.acceptedBy ? (
          <span className="fzd-small">
            También puedes aceptarla en línea: <span className="fzd-link">{data.quote.portalUrl.replace(/^https?:\/\//, '')}</span>
          </span>
        ) : null}
      </div>
      {!data.quote.acceptedBy ? <p className="fzd-small fzd-accept__text">Acepto esta cotización, sus condiciones y la forma de pago indicada.</p> : null}
      <SignatureBlock accepted={data.quote.acceptedBy} />
      {prefs.signatureName || ctx.editable ? (
        <div className="fzd-small fzd-accept__by">
          Te atiende{' '}
          <EditableText as="span" inline value={prefs.signatureName ?? ''} {...ctx.ed('signatureName')} placeholder="Tu nombre" className="fzd-strong" />
          {data.org.phone || data.org.email ? <> · {joinParts([data.org.phone, data.org.email])}</> : null}
        </div>
      ) : null}
    </section>
  )
}

/** Fila de datos clave (portadas): total, unidades, superficie, vigencia. */
export function KeyFigures({ ctx, className }: { ctx: QuoteCtx; className?: string }) {
  const { data, prefs } = ctx
  const figs: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Total con IVA', value: formatClp(data.totals.total), strong: true },
    { label: 'Proyecto', value: data.totals.units !== data.items.length ? `${windowsLabel(data.items.length)}, ${unitsLabel(data.totals.units)}` : windowsLabel(data.items.length) },
  ]
  if (prefs.showArea) figs.push({ label: 'Superficie', value: formatArea(data.totals.area) })
  if (ctx.validUntil) figs.push({ label: 'Válida hasta', value: formatDateShort(ctx.validUntil) })
  return (
    <dl className={clsx('fzd-figures', className)}>
      {figs.map((f) => (
        <div key={f.label} className={clsx('fzd-figure', f.strong && 'fzd-figure--strong')}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** «N° 412», con la revisión si corresponde. */
export function numberText(ctx: QuoteCtx): string {
  const rev = ctx.data.quote.revision >= 2 ? ` · Rev. ${revisionLetter(ctx.data.quote.revision)}` : ''
  return `${ctx.data.quote.number}${rev}`
}

/** Alto estimado (px) de las condiciones en dos columnas. */
export function termsHeight(ctx: QuoteCtx, columnChars = 62, spacing = 42): number {
  const { prefs, data } = ctx
  const texts = [prefs.conditions, prefs.leadTimeText, prefs.warranty, 'Válida por 15 días, hasta el 15 de noviembre de 2026.', data.quote.notes]
  const blocks = texts.reduce((acc, t) => acc + (t || ctx.editable ? 28 + 15 * Math.max(1, estimateLines(t, columnChars)) : 0), 0)
  // Dos columnas: la mitad, más el desbalance de la última sección y el margen superior.
  return Math.ceil(blocks / 2) + 6 + spacing
}

/** Alto estimado del bloque forma de pago + totales. */
export function closeHeight(ctx: QuoteCtx): number {
  const { data, prefs } = ctx
  const visibleExtras = data.extras.filter((e) => !e.hidden && e.amount !== 0).length
  const hidden = data.extras.some((e) => e.hidden) ? 1 : 0
  const rows = visibleExtras + hidden + (data.totals.discount > 0 ? 1 : 0) + (prefs.showArea ? 1 : 0)
  return 174 + rows * 21
}

/** Alto estimado de aceptación y firma. */
export const ACCEPT_H = 172

/** Alto estimado de la aceptación en una columna angosta (junto a los totales, en «Compacta»). */
export function acceptInlineHeight(ctx: QuoteCtx): number {
  const { data, prefs } = ctx
  const link = data.quote.portalUrl && !data.quote.acceptedBy ? 26 : 0
  const by = prefs.signatureName || ctx.editable ? 16 : 0
  return data.quote.acceptedBy ? 88 + by : 114 + link + by
}

/** Alto estimado de la forma de pago (título, texto y cuotas). */
export function paymentHeight(ctx: QuoteCtx): number {
  const text = ctx.prefs.paymentTerms ?? ''
  if (!text && !ctx.editable) return 0
  const plan = (text.match(/\d+(?:[.,]\d+)?\s*%/g) ?? []).length
  return 20 + 15 * Math.max(1, estimateLines(text, 64)) + (plan > 1 ? 18 + plan * 19 : 0)
}

export function introHeight(ctx: QuoteCtx, chars = 96): number {
  const text = ctx.prefs.intro ?? ''
  if (!text) return ctx.editable ? 30 : 0
  return Math.ceil(text.length / chars) * 20 + (text.split('\n').length - 1) * 10 + 22
}
