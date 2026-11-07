/**
 * Sección «items»: las ventanas de la cotización en cinco composiciones —planilla (`table`), tarjetas
 * (`cards`, 1 columna = panel horizontal), ficha técnica (`sheet`), galería (`gallery`) y una por
 * página (`per_page`)—, con agrupación por recinto y subtotales que vienen del armado de datos.
 */
import type { ReactNode } from 'react'
import { ITEM_DRAWING_SIZE_MM, type DocSectionOf, type ItemsOptions } from '@dekopen/shared'
import { clsx } from '../../base/clsx'
import { EditableText } from '../../base/editable'
import { quoteDocGroups, type QuoteDocGroup, type QuoteDocItemV5 } from '../../data/quote'
import { chunk } from '../../base/paginate'
import type { QuoteModel } from '../model'
import { mmToPx } from '../page'
import { AssemblyPlan } from '../../drawing/assembly'
import { BrandLogos, Dotted, DottedText, ItemDrawing, markHeight } from '../parts'
import { lineCount } from '../measure'
import { headingNode, lineH, sectionBlocks, textMetrics, type SectionCtx, type SectionRenderer } from './common'
import { Specs, isOff, itemNote, itemPlace, itemPrice, itemSpecRows, itemSubtitle, itemTag, itemTitle, lineAmount, type PriceTexts, type SpecRow } from './item-parts'

type Items = DocSectionOf<'items'>

const sizePx = (size: ItemsOptions['drawingSize']) => (size === 'none' ? 0 : mmToPx(ITEM_DRAWING_SIZE_MM[size] ?? 58))
/** ¿La sección dibuja las ventanas? */
const drawn = (o: Pick<ItemsOptions, 'drawingSize'>) => o.drawingSize !== 'none'

/** Caja del dibujo: ancho dado, alto según la proporción de la ventana dentro de un rango. */
function wellBox(item: QuoteDocItemV5, width: number, minRatio: number, maxH: number): { w: number; h: number } {
  const aspect = item.width > 0 && item.height > 0 ? item.height / item.width : 1
  const h = Math.round(Math.min(maxH, Math.max(width * minRatio, width * aspect * 0.92 + 16)))
  return { w: Math.round(width), h }
}

function specsHeight(m: QuoteModel, rows: SpecRow[], width: number, columns: number): number {
  const t = textMetrics(m)
  const colW = (width - (columns - 1) * 16) / columns
  const perRow = rows.map((r) => lineH(t.label) + Math.max(1, lineCount(r.text, colW - 18, t.small)) * lineH(t.small) + 6)
  let total = 0
  for (let i = 0; i < perRow.length; i += columns) total += Math.max(...perRow.slice(i, i + columns))
  return Math.ceil(total)
}

function titleHeight(m: QuoteModel, title: string, subtitle: string, width: number): number {
  const t = textMetrics(m)
  return Math.ceil(lineCount(title, width - 44, t.h3) * lineH(t.h3) + (subtitle ? lineCount(subtitle, width, t.small) * lineH(t.small) + 2 : 0))
}

function noteHeight(m: QuoteModel, note: string, width: number): number {
  if (!note) return 0
  const t = textMetrics(m)
  return Math.ceil(lineCount(note, width - 14, t.small) * lineH(t.small) + 10)
}

function specOptions(o: ItemsOptions, extra: { opening?: boolean } = {}) {
  return {
    showSystem: o.showSpecs && o.showSystem,
    showGlass: o.showSpecs && o.showGlass,
    showArea: o.showSpecs && o.showArea,
    finishes: o.showSpecs ? o.finishes : ('none' as const),
    showSwatches: o.showSwatches,
    showPerformance: o.showSpecs && o.showPerformance,
    size: o.showSize,
    accessories: o.showSpecs && o.showAccessories,
    hardware: o.showSpecs && o.showHardware,
    glassBuildup: o.showSpecs && o.showGlassBuildup,
    glassImage: o.showGlassImage,
    rough: o.showSpecs && o.showRoughOpening,
    opening: !!extra.opening && o.showSpecs && o.showOpening,
  }
}

const views = (o: Pick<ItemsOptions, 'drawingView'>) => ({ interior: o.drawingView !== 'exterior', exterior: o.drawingView !== 'interior' })

// ── Composiciones ───────────────────────────────────────────────────────────

/** Logos de marca junto a la ventana, si el taller los quiere en cada ítem. */
function itemMarks(m: QuoteModel, item: QuoteDocItemV5) {
  if (m.settings.brandPlacement === 'strip') return []
  return [...m.brands.profile.filter((b) => b.key === item.line?.brandId), ...m.brands.hardware]
}

/** Nombre de la ventana: en una cotización real se escribe ahí mismo. */
function ItemName({ m, item }: { m: QuoteModel; item: QuoteDocItemV5 }) {
  const title = itemTitle(m, item)
  const id = item.id
  if (!m.onItemEdit || !id) return <>{title}</>
  return <EditableText as="span" inline value={item.name?.trim() ?? ''} editable onChange={(v) => m.onItemEdit?.(id, 'name', v)} placeholder={title} display={title} />
}

function Tag({ m, item }: { m: QuoteModel; item: QuoteDocItemV5 }) {
  const tag = itemTag(m, item)
  return tag ? <span className={clsx('dkd-tag', isOff(item) && 'dkd-tag--off')}>{tag}</span> : null
}

function ItemHead({ m, item, o, size = 'md', place }: { m: QuoteModel; item: QuoteDocItemV5; o: ItemsOptions; size?: 'md' | 'lg'; place?: string }) {
  const subtitle = itemSubtitle(m, item, place, o.showLocation)
  const marks = itemMarks(m, item)
  return (
    <div className={clsx('dkd-ihead', size === 'lg' && 'dkd-ihead--lg')}>
      {o.showRef ? <span className="dkd-ihead__ref dkd-num" data-dk-el="showRef">{item.ref}</span> : null}
      <div className="dkd-ihead__text">
        <h3 className="dkd-ihead__title"><ItemName m={m} item={item} /></h3>
        {subtitle ? <div className="dkd-ihead__sub" data-dk-el="showLocation"><DottedText text={subtitle} /></div> : null}
        <Tag m={m} item={item} />
        {marks.length ? <BrandLogos marks={marks} size="s" className="dkd-ihead__marks" /> : null}
      </div>
    </div>
  )
}

const PLAN_H = 116
const PLAN_W = 290

/** Alto extra de lo que puede acompañar al título: la etiqueta de opcional y los logos. */
function headExtra(m: QuoteModel, item: QuoteDocItemV5): number {
  const t = textMetrics(m)
  return (itemTag(m, item) ? lineH(t.small) + 2 : 0) + (itemMarks(m, item).length ? Math.max(0, markHeight('s') - lineH(t.small)) : 0)
}

function Note({ m, item, text }: { m: QuoteModel; item: QuoteDocItemV5; text: string }) {
  if (!text) return null
  const id = item.id
  return (
    <p className="dkd-note" data-dk-el="showNotes">
      {m.onItemEdit && id ? <EditableText as="span" inline value={text} editable onChange={(v) => m.onItemEdit?.(id, 'note', v)} /> : text}
    </p>
  )
}

function Well({ m, item, box, o, inset, plan }: { m: QuoteModel; item: QuoteDocItemV5; box: { w: number; h: number }; o: ItemsOptions; inset?: boolean; plan?: boolean }) {
  const v = views(o)
  const showInset = !!inset && v.interior && v.exterior && box.w >= 200
  const insetSize = Math.round(Math.min(64, box.w * 0.22))
  const pad = 12
  return (
    <div className={clsx('dkd-well', showInset && 'dkd-well--inset')} style={{ width: box.w, height: box.h }} data-dk-el="drawing">
      <ItemDrawing m={m} item={item} width={box.w - pad * 2 - (showInset ? insetSize : 0)} height={box.h - pad * 2} view={v.interior ? 'interior' : 'exterior'} dimensions={o.drawingDimensions} style={o.drawingStyle} {...(plan === false ? { plan } : {})} />
      {showInset ? (
        <span className="dkd-well__inset">
          <ItemDrawing m={m} item={item} width={insetSize} height={insetSize} view="exterior" dimensions="none" style={o.drawingStyle} />
          <span>{m.kit.t('view.exterior')}</span>
        </span>
      ) : null}
    </div>
  )
}

/** Panel horizontal (tarjeta a una columna): dibujo grande, datos y precio. */
function panel(m: QuoteModel, item: QuoteDocItemV5, o: ItemsOptions, place?: string): { node: ReactNode; height: number } {
  const W = m.page.contentWidth
  const drawing = drawn(o)
  const wellW = Math.min(sizePx(o.drawingSize), Math.round(W * (o.drawingSize === 'l' ? 0.38 : 0.34)))
  const box = drawing ? wellBox(item, wellW, 0.62, o.drawingSize === 'l' ? 300 : o.drawingSize === 'm' ? 220 : 150) : { w: 0, h: 0 }
  const priceW = o.showLineTotals || o.showUnitPrices ? 108 : 0
  const bodyW = W - wellW - priceW - 24 * ((priceW ? 1 : 0) + (drawing ? 1 : 0))
  const rows = itemSpecRows(m, item, specOptions(o, { opening: true }))
  const note = o.showNotes ? itemNote(m, item) : ''
  const textH = titleHeight(m, itemTitle(m, item), itemSubtitle(m, item, place, o.showLocation), bodyW) + headExtra(m, item) + 12 + specsHeight(m, rows, bodyW, 2) + noteHeight(m, note, bodyW) + (item.assembly?.plan ? PLAN_H + 8 : 0)
  const d = m.tokens.density
  return {
    node: (
      <article className={clsx('dkd-panel', isOff(item) && 'dkd-off')} style={{ gridTemplateColumns: `${drawing ? `${wellW}px ` : ''}minmax(0,1fr)${priceW ? ` ${priceW}px` : ''}` }}>
        {drawing ? <Well m={m} item={item} box={box} o={o} inset plan={false} /> : null}
        <div className="dkd-panel__body">
          <ItemHead m={m} item={item} o={o} place={place} />
          <Specs rows={rows} columns={2} />
          <Plan m={m} item={item} width={Math.min(bodyW, PLAN_W)} height={PLAN_H} />
          <Note m={m} item={item} text={note} />
        </div>
        {priceW ? <NetPrice m={m} price={itemPrice(m, item, o)} /> : null}
      </article>
    ),
    height: Math.max(box.h, textH) + d.row * 2 + 1,
  }
}

/** Tarjeta vertical (2 o 3 columnas). */
function card(m: QuoteModel, item: QuoteDocItemV5, o: ItemsOptions, width: number, wellH: number, place?: string): { node: ReactNode; height: number } {
  const rows = itemSpecRows(m, item, specOptions(o, { opening: true }))
  const note = o.showNotes ? itemNote(m, item) : ''
  const price = itemPrice(m, item, o)
  const bodyW = width - 24
  const t = textMetrics(m)
  const bodyH = titleHeight(m, itemTitle(m, item), itemSubtitle(m, item, place, o.showLocation), bodyW - (price.total ? 80 : 0)) + headExtra(m, item) + 8 + specsHeight(m, rows, bodyW, 1) + noteHeight(m, note, bodyW) + (price.unit ? lineH(t.small) + 10 : 0) + 24
  return {
    node: (
      <article className={clsx('dkd-card', isOff(item) && 'dkd-off')}>
        {wellH > 0 ? <Well m={m} item={item} box={{ w: width, h: wellH }} o={o} /> : null}
        <div className="dkd-card__body">
          <div className="dkd-card__top">
            <ItemHead m={m} item={item} o={o} place={place} />
            <NetPrice m={m} price={{ ...price, unit: undefined }} />
          </div>
          <Specs rows={rows} columns={1} />
          <Note m={m} item={item} text={note} />
          {price.unit && item.qty > 1 ? <div className="dkd-card__foot dkd-num" data-dk-el="showUnitPrices">{price.unit}</div> : null}
        </div>
      </article>
    ),
    height: wellH + bodyH + 2,
  }
}

/** Tarjeta de galería: dibujo protagonista, número grande y pocos datos. */
function galleryCard(m: QuoteModel, item: QuoteDocItemV5, o: ItemsOptions, width: number, wellH: number): { node: ReactNode; height: number } {
  const { fmt } = m.kit
  const price = itemPrice(m, item, o)
  const rows = itemSpecRows(m, item, { ...specOptions(o), size: false, showSystem: false, showArea: false, showPerformance: false })
  const t = textMetrics(m)
  const textH = lineH(t.h1) + 6 + titleHeight(m, itemTitle(m, item), '', width - 120) + lineH(t.small) + specsHeight(m, rows, width, 2) + 18
  return {
    node: (
      <article className={clsx('dkd-gal', isOff(item) && 'dkd-off')}>
        {wellH > 0 ? <Well m={m} item={item} box={{ w: width, h: wellH }} o={o} /> : null}
        <div className="dkd-gal__body">
          <div className="dkd-gal__top">
            {o.showRef ? <span className="dkd-gal__ref dkd-num" data-dk-el="showRef">{item.ref}</span> : <span />}
            <NetPrice m={m} price={{ ...price, unit: undefined }} />
          </div>
          <h3 className="dkd-gal__title"><ItemName m={m} item={item} /></h3>
          <Tag m={m} item={item} />
          <div className="dkd-gal__meta">
            {o.showSize ? <span className="dkd-dim" data-dk-el="showSize">{fmt.size(item.width, item.height)}</span> : null}
            {o.showLocation && item.location ? <span data-dk-el="showLocation">{item.location}</span> : null}
            {item.qty > 1 ? <span>{price.qty}</span> : null}
          </div>
          <Specs rows={rows} columns={2} />
        </div>
      </article>
    ),
    height: wellH + textH,
  }
}

/** Planta de un bay o un bow: lo que la elevación no dice. Un conjunto plano no la necesita. */
function Plan({ m, item, width, height }: { m: QuoteModel; item: QuoteDocItemV5; width: number; height: number }) {
  const plan = item.assembly?.plan
  return plan ? <AssemblyPlan plan={plan} width={width} height={height} locale={m.kit.locale} className="dkd-plan" /> : null
}

function NetPrice({ m, price }: { m: QuoteModel; price: PriceTexts }) {
  if (price.pending) return <p className="dkd-net dkd-net--pending">{price.pending}</p>
  if (!price.total) return null
  return (
    <dl className="dkd-net" data-dk-el="showLineTotals">
      <dt className="dkd-label">{price.label}</dt>
      <dd className="dkd-num">{price.total}</dd>
      {price.discount ? <dd className="dkd-net__unit dkd-num">{price.discount}</dd> : null}
      {price.unit && !price.repeatsTotal ? <dd className="dkd-net__unit dkd-num">{price.unit}</dd> : null}
    </dl>
  )
}

/**
 * Ficha de especificación: dibujo con todas sus cotas y, al lado, vista exterior y datos. El dibujo
 * toma el espacio que sobra (lo decide el diseño, no una estimación).
 */
function fiche(m: QuoteModel, item: QuoteDocItemV5, o: ItemsOptions, height: number, narrow = false): ReactNode {
  const { t, fmt } = m.kit
  const W = m.page.contentWidth / (narrow ? 2 : 1)
  const v = views(o)
  const both = v.interior && v.exterior
  const sideW = narrow ? 170 : Math.round(W * 0.27)
  // La ficha también obedece: lo que se apagó no vuelve por ser ficha.
  const rows = itemSpecRows(m, item, { ...specOptions(o, { opening: true }), size: false })
  const note = o.showNotes ? itemNote(m, item) : ''
  const extW = sideW
  const extH = Math.round(Math.min(height * 0.24, sideW * 0.72))
  const subtitle = itemSubtitle(m, item, undefined, o.showLocation)
  return (
    <article className={clsx('dkd-fiche', narrow && 'dkd-fiche--narrow', isOff(item) && 'dkd-off')} style={{ height }}>
      <header className="dkd-fiche__head">
        {o.showRef ? <span className="dkd-fiche__ref dkd-num" data-dk-el="showRef">{item.ref}</span> : null}
        <div className="dkd-fiche__title">
          <h3><ItemName m={m} item={item} /></h3>
          {subtitle ? <span data-dk-el="showLocation"><DottedText text={subtitle} /></span> : null}
          <Tag m={m} item={item} />
        </div>
        {o.showSize ? <span className="dkd-fiche__size dkd-dim" data-dk-el="showSize">{fmt.size(item.width, item.height)}</span> : null}
      </header>
      <div className="dkd-fiche__body" style={narrow ? undefined : { gridTemplateColumns: `minmax(0, 1fr) ${sideW}px` }}>
        <figure className="dkd-fiche__main" data-dk-el="drawing">
          <ItemDrawing m={m} item={item} width={narrow ? W - 14 : W - sideW - 40} height={narrow ? Math.round(height * 0.56) : height - 110} view={v.interior ? 'interior' : 'exterior'} dimensions={o.drawingDimensions === 'none' ? 'total' : o.drawingDimensions} style={o.drawingStyle} fit detail="high" plan={false} />
          <figcaption>{v.interior ? t('view.interiorMm') : t('view.exterior')}</figcaption>
        </figure>
        <aside className="dkd-fiche__side">
          {both && !narrow ? (
            <figure className="dkd-fiche__ext">
              <ItemDrawing m={m} item={item} width={extW} height={extH} view="exterior" dimensions="none" style={o.drawingStyle} />
              <figcaption>{t('view.exterior')}</figcaption>
            </figure>
          ) : null}
          <Specs rows={rows} columns={narrow ? 2 : 1} />
          <Plan m={m} item={item} width={sideW} height={PLAN_H} />
          <Note m={m} item={item} text={note} />
          <NetPrice m={m} price={itemPrice(m, item, o)} />
        </aside>
      </div>
    </article>
  )
}

const PLATE_GAP = 24

/** Alto del bloque de datos bajo una lámina apaisada (columna del título y columna de datos). */
function plateDataHeight(m: QuoteModel, item: QuoteDocItemV5, rows: SpecRow[], note: string, W: number, price: PriceTexts): number {
  const t = textMetrics(m)
  const idW = W / 3 - 20
  const subtitle = itemSubtitle(m, item)
  const id = lineH(t.body) + 3 + lineCount(itemTitle(m, item), idW, t.h2) * lineH(t.h2) + (subtitle ? lineCount(subtitle, idW, t.small) * lineH(t.small) + 3 : 0) + headExtra(m, item)
  const net = price.total ? lineH(t.label) + lineH(t.body) + (price.unit && !price.repeatsTotal ? lineH(t.small) : 0) + 10 : 0
  const specs = specsHeight(m, rows, (W * 2) / 3, 3) + 12 * Math.max(0, Math.ceil(rows.length / 3) - 1)
  return Math.ceil(Math.max(id + net + 14, specs + noteHeight(m, note, (W * 2) / 3) + 12 + (item.assembly?.plan ? PLAN_H + 12 : 0)))
}

/**
 * Lámina: la ventana protagonista con sus datos en la columna del margen. Una por hoja; con muchas
 * ventanas, dos o tres por hoja (`compact`), para que 40 ítems no sean 40 páginas.
 */
function plate(m: QuoteModel, item: QuoteDocItemV5, o: ItemsOptions, height: number, compact: boolean): ReactNode {
  const W = m.page.contentWidth
  const v = views(o)
  const sideW = Math.round(W / 3)
  const wide = !compact && item.width / Math.max(1, item.height) >= 1.25
  const rows = itemSpecRows(m, item, specOptions(o, { opening: true }))
  const note = o.showNotes ? itemNote(m, item) : ''
  const stageW = wide ? W : W - sideW
  // Ventana apaisada: los datos toman lo justo y el muro llena el resto de la hoja, sin aire muerto arriba.
  const dataH = wide ? plateDataHeight(m, item, rows, note, W, itemPrice(m, item, o)) : 0
  const stageH = wide ? height - dataH - PLATE_GAP : height
  // Una ventana por hoja, instalada en su muro: las medidas van en la columna de datos.
  const wall = !compact && m.drawingStyle === 'realistic' && o.drawingStyle !== 'technical'
  const subtitle = itemSubtitle(m, item, undefined, o.showLocation)
  const marks = itemMarks(m, item)
  return (
    <article className={clsx('dkd-plate', wide && 'dkd-plate--wide', compact && 'dkd-plate--compact', isOff(item) && 'dkd-off')} style={{ height, gridTemplateColumns: wide ? undefined : `${sideW}px minmax(0, 1fr)` }}>
      <aside className="dkd-plate__side">
        <div className="dkd-plate__id">
          {o.showRef ? <span className="dkd-plate__ref dkd-num" data-dk-el="showRef">{item.ref}</span> : null}
          <h3 className="dkd-plate__title"><ItemName m={m} item={item} /></h3>
          {subtitle ? <p className="dkd-plate__sub" data-dk-el="showLocation"><DottedText text={subtitle} /></p> : null}
          <Tag m={m} item={item} />
          {marks.length ? <BrandLogos marks={marks} size="s" /> : null}
        </div>
        <Specs rows={compact ? rows.filter((r) => r.key !== 'opening' && r.key !== 'acc') : rows} columns={wide ? 3 : compact ? 2 : 1} />
        {compact ? null : <Plan m={m} item={item} width={Math.min(sideW, PLAN_W)} height={PLAN_H} />}
        {compact ? null : <Note m={m} item={item} text={note} />}
        <NetPrice m={m} price={itemPrice(m, item, o)} />
      </aside>
      <figure className="dkd-plate__stage" style={wide ? { height: stageH } : undefined} data-dk-el="drawing">
        <ItemDrawing m={m} item={item} width={stageW} height={stageH} view={v.interior ? 'interior' : 'exterior'} dimensions={wall ? 'none' : o.drawingDimensions} style={o.drawingStyle} fit detail="high" plan={false} {...(wall ? { context: 'wall' as const } : {})} />
      </figure>
    </article>
  )
}

// ── Planilla ────────────────────────────────────────────────────────────────

/** Columna «Dcto.»: solo si alguna línea tiene descuento y se ven sus precios. */
const hasDiscounts = (m: QuoteModel, o: ItemsOptions) => o.showLineTotals && m.items.some((i) => i.lineDiscountPct)

function tableColumns(m: QuoteModel, o: ItemsOptions): { template: string; thumb: number; fixed: number; count: number } {
  const thumb = !drawn(o) ? 0 : o.drawingSize === 's' ? 84 : 46
  const widths = [o.showRef ? 30 : 0, thumb, 0, o.showSize ? 98 : 0, o.showQty ? 26 : 0, o.showUnitPrices ? 74 : 0, hasDiscounts(m, o) ? 40 : 0, o.showLineTotals ? 82 : 0].filter((w, i) => w > 0 || i === 2)
  return { template: widths.map((w) => (w ? `${w}px` : 'minmax(0,1fr)')).join(' '), thumb, fixed: widths.reduce((a, w) => a + w, 0), count: widths.length }
}

function TableHead({ m, o }: { m: QuoteModel; o: ItemsOptions }) {
  const { t } = m.kit
  const { template } = tableColumns(m, o)
  const label = o.priceTax === 'gross' ? t('items.withTax', { tax: m.kit.taxLabel }) : t('totals.net')
  return (
    <div className="dkd-tbl dkd-tbl--head" role="row" style={{ gridTemplateColumns: template }}>
      {o.showRef ? <span className="dkd-label" role="columnheader" data-dk-el="showRef">{t('items.colItem')}</span> : null}
      {drawn(o) ? <span /> : null}
      <span className="dkd-label" role="columnheader">{t('items.colDescription')}</span>
      {o.showSize ? <span className="dkd-label dkd-right" role="columnheader" data-dk-el="showSize">{t('items.colSize')}</span> : null}
      {o.showQty ? <span className="dkd-label dkd-right" role="columnheader" data-dk-el="showQty">{t('items.colQty')}</span> : null}
      {o.showUnitPrices ? <span className="dkd-label dkd-right" role="columnheader" data-dk-el="showUnitPrices">{t('items.colUnit')}</span> : null}
      {hasDiscounts(m, o) ? <span className="dkd-label dkd-right" role="columnheader">{t('items.colDiscount')}</span> : null}
      {o.showLineTotals ? <span className="dkd-label dkd-right" role="columnheader" data-dk-el="showLineTotals">{label}</span> : null}
    </div>
  )
}

function tableRow(m: QuoteModel, item: QuoteDocItemV5, o: ItemsOptions, place?: string): { node: ReactNode; height: number } {
  const { fmt } = m.kit
  const { template, thumb, fixed, count } = tableColumns(m, o)
  const rows = itemSpecRows(m, item, { ...specOptions(o, { opening: false }), size: false })
  const meta = rows.map((r) => r.text).join(' · ')
  const note = o.showNotes ? itemNote(m, item) : ''
  const tag = itemTag(m, item)
  const marks = itemMarks(m, item)
  const tm = textMetrics(m)
  const descW = m.page.contentWidth - fixed - (count - 1) * 12
  const textH = lineH(tm.body) + Math.min(3, lineCount(meta, descW, tm.small)) * lineH(tm.small) + (note ? Math.min(2, lineCount(note, descW, tm.small)) * lineH(tm.small) : 0) + (tag ? lineH(tm.small) : 0)
  const thumbH = Math.round(thumb * 0.8)
  const money = itemPrice(m, item, o)
  const location = o.showLocation ? itemPlace(item, place) : ''
  return {
    node: (
      <div className={clsx('dkd-tbl', 'dkd-tbl--row', isOff(item) && 'dkd-off')} role="row" style={{ gridTemplateColumns: template }}>
        {o.showRef ? <span className="dkd-tbl__ref dkd-num" role="cell" data-dk-el="showRef">{item.ref}</span> : null}
        {thumb ? (
          <span className="dkd-tbl__img" role="cell" style={{ width: thumb, height: thumbH }} data-dk-el="drawing">
            <ItemDrawing m={m} item={item} width={thumb} height={thumbH} dimensions="none" style={o.drawingStyle} />
          </span>
        ) : null}
        <span className="dkd-tbl__desc" role="cell">
          <span className="dkd-tbl__name">
            <Dotted parts={[<ItemName key="name" m={m} item={item} />, location ? <span className="dkd-tbl__loc" data-dk-el="showLocation">{location}</span> : null]} />
          </span>
          {tag ? <Tag m={m} item={item} /> : null}
          {meta ? <span className="dkd-tbl__meta" data-dk-el="showSpecs"><Dotted parts={rows.map((r) => r.value)} /></span> : null}
          {note ? <span className="dkd-tbl__note" data-dk-el="showNotes">{m.onItemEdit && item.id ? <EditableText as="span" inline value={note} editable onChange={(v) => m.onItemEdit?.(item.id as string, 'note', v)} /> : note}</span> : null}
          {marks.length ? <BrandLogos marks={marks} size="s" /> : null}
        </span>
        {o.showSize ? <span className="dkd-right dkd-dim" role="cell" data-dk-el="showSize">{fmt.size(item.width, item.height)}</span> : null}
        {o.showQty ? <span className="dkd-right dkd-num" role="cell" data-dk-el="showQty">{fmt.number(item.qty)}</span> : null}
        {o.showUnitPrices ? <span className="dkd-right dkd-num" role="cell" data-dk-el="showUnitPrices">{money.unit ? fmt.money(lineAmount(m, item.unitPrice, o)) : ''}</span> : null}
        {hasDiscounts(m, o) ? <span className="dkd-right dkd-num" role="cell">{money.discount ?? ''}</span> : null}
        {o.showLineTotals ? <span className={clsx('dkd-right', money.pending ? 'dkd-tbl__pending' : 'dkd-num dkd-strong')} role="cell" data-dk-el="showLineTotals">{money.pending ?? money.total ?? ''}</span> : null}
      </div>
    ),
    height: Math.max(thumbH, textH) + m.tokens.density.row * 2 + 1,
  }
}

// ── Grupos ──────────────────────────────────────────────────────────────────

function groupLabel(m: QuoteModel, g: QuoteDocGroup): string {
  return g.label || m.kit.t('summary.noRoom')
}

/**
 * Grupos de la sección. Las obras cargadas antes de existir el campo «piso» lo escribían en el recinto:
 * sin ningún piso cargado, agrupar por piso es agrupar por recinto.
 */
function sectionGroups(m: QuoteModel, by: ItemsOptions['groupBy']): QuoteDocGroup[] {
  if (by === 'none') return []
  const doc = m.data.document
  if (by === 'line') return doc?.groupsByLine ?? quoteDocGroups(m.items, 'line')
  if (by === 'floor' && m.items.some((i) => i.floor)) return doc?.groupsByFloor ?? quoteDocGroups(m.items, 'floor')
  return m.groups
}

function GroupHead({ m, g }: { m: QuoteModel; g: QuoteDocGroup }) {
  return (
    <div className="dkd-group">
      <span className="dkd-group__name">{groupLabel(m, g)}</span>
      <span className="dkd-group__count">{m.kit.t('items.groupCount', { count: g.refs.length })}</span>
    </div>
  )
}

/** Un recinto de una sola ventana ya muestra su neto en la fila: el subtotal lo repetiría. */
function showSubtotal(items: readonly QuoteDocItemV5[], o: ItemsOptions): boolean {
  // Sin ninguna cifra real, un subtotal diría $0: se omite.
  return (items.length > 1 || !o.showLineTotals) && items.some((i) => !isOff(i))
}

function GroupSubtotal({ m, g, items }: { m: QuoteModel; g: QuoteDocGroup; items: readonly QuoteDocItemV5[] }) {
  const missing = items.filter((i) => i.pending).length
  return (
    <div className="dkd-gsub">
      <span>{missing ? m.kit.t('pending.subtotal', { group: groupLabel(m, g), count: missing }) : m.kit.t('items.groupSubtotal', { group: groupLabel(m, g) })}</span>
      <span className="dkd-num">{m.kit.fmt.money(g.subtotal)}</span>
    </div>
  )
}

// ── Sección ─────────────────────────────────────────────────────────────────

/** La sección llena hojas enteras (sin título propio). */
export function itemsFillPages(o: ItemsOptions): boolean {
  return drawn(o) && (o.variant === 'per_page' || (o.variant === 'sheet' && o.drawingSize === 'xl'))
}

/** Sin dibujo no hay nada que llene una hoja: la ficha y la lámina pasan a lista. */
function composition(o: ItemsOptions): ItemsOptions {
  return drawn(o) || (o.variant !== 'sheet' && o.variant !== 'per_page') ? o : { ...o, variant: 'cards', columns: 1 }
}

export const renderItems: SectionRenderer = (raw, m, ctx: SectionCtx) => {
  const section = raw as Items
  const o = composition(section.options)
  const b = sectionBlocks(section, m, ctx)
  const items = m.items
  const v = views(o)
  const aside = o.variant === 'per_page' || !drawn(o) ? undefined : v.interior ? m.kit.t('view.convention') : m.kit.t('view.exterior')
  // Láminas y fichas a página completa no llevan título de sección: la hoja ya dice qué es.
  if (!itemsFillPages(o) || items.length === 0) {
    const head = headingNode(section, m, ctx, { aside })
    b.add('head', head.node, head.height, { keepWithNext: true })
  }
  if (items.length === 0) return b.list

  const byRef = new Map(items.map((it) => [it.ref, it]))
  const available = sectionGroups(m, o.groupBy)
  const grouped = available.length > 1
  const groups: { group?: QuoteDocGroup; items: QuoteDocItemV5[] }[] = grouped
    ? available.map((g) => ({ group: g, items: g.refs.map((r) => byRef.get(r)).filter((x): x is QuoteDocItemV5 => !!x) }))
    : [{ items }]
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const gap = m.tokens.density.gap
  const subtotalH = lineH(tm.body) + 14
  const groupBreak = (index: number) => (o.groupPageBreak && index > 0 ? { breakBefore: true } : {})
  const finish = () => {
    otherLines(section, m, b, o)
    if (o.showColorNote && o.finishes !== 'none') b.add('color-note', <p className="dkd-colornote">{m.kit.t('items.colorNote')}</p>, lineH(tm.small) + 4)
    return b.list
  }

  if (o.variant === 'table') {
    const group = `${section.id}-tbl`
    b.add('thead', <TableHead m={m} o={o} />, lineH(tm.label) + 12, { group, thead: true, keepWithNext: true, space: Math.round(gap * 0.6) })
    for (const [index, g] of groups.entries()) {
      if (g.group) b.add(`g-${g.group.key}`, <GroupHead m={m} g={g.group} />, lineH(tm.body) + 14, { group, keepWithNext: true, space: 0, ...groupBreak(index) })
      for (const item of g.items) {
        const row = tableRow(m, item, o, g.group?.label)
        b.add(`i-${item.ref}`, row.node, row.height, { group, space: 0 })
      }
      if (g.group && o.showGroupSubtotals && showSubtotal(g.items, o)) {
        // El subtotal viaja con la última ventana del recinto (nunca solo en la hoja siguiente).
        const last = b.list[b.list.length - 1]
        if (last) last.keepWithNext = true
        b.add(`s-${g.group.key}`, <GroupSubtotal m={m} g={g.group} items={g.items} />, subtotalH, { space: 0 })
      }
    }
    return finish()
  }

  for (const [index, g] of groups.entries()) {
    if (g.group) b.add(`g-${g.group.key}`, <GroupHead m={m} g={g.group} />, lineH(tm.h3) + 12, { keepWithNext: true, ...groupBreak(index) })
    if (o.variant === 'cards' && (o.columns === 1 || (g.group && g.items.length === 1 && o.columns === 2))) {
      for (const item of g.items) {
        const p = panel(m, item, o, g.group?.label)
        b.add(`i-${item.ref}`, p.node, p.height, { space: 0 })
      }
    } else if (o.variant === 'cards' || o.variant === 'gallery') {
      const cols = Math.max(1, Math.min(3, o.columns))
      const colGap = cols === 3 ? 14 : 20
      const cardW = Math.floor((W - colGap * (cols - 1)) / cols)
      const gallery = o.variant === 'gallery'
      const ratio = gallery ? 0.82 : cols === 3 ? 0.72 : 0.62
      const maxWell = gallery ? (o.drawingSize === 'xl' ? 420 : 300) : cols === 3 ? 150 : o.drawingSize === 'm' ? 210 : 160
      for (const [r, row] of chunk(g.items, cols).entries()) {
        // Una ventana sola en su fila no deja media hoja en blanco: va en panel, a todo el ancho.
        if (o.variant === 'cards' && row.length === 1 && cols > 1) {
          const p = panel(m, row[0], items.length <= 2 && drawn(o) ? { ...o, drawingSize: 'l' } : o, g.group?.label)
          b.add(`i-${row[0].ref}`, p.node, p.height, { space: r === 0 && !g.group ? undefined : gap })
          continue
        }
        const wellH = drawn(o) ? Math.round(Math.min(maxWell, cardW * ratio)) : 0
        const cards = row.map((item) => (gallery ? galleryCard(m, item, o, cardW, wellH) : card(m, item, o, cardW, wellH, g.group?.label)))
        b.add(
          `r-${g.group?.key ?? 'all'}-${r}`,
          <div className={clsx('dkd-cards', `dkd-cards--c${cols}`, gallery && 'dkd-cards--gallery')} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: colGap }}>
            {cards.map((c, i) => (
              <div key={row[i].ref} className="dkd-cards__cell">
                {c.node}
              </div>
            ))}
          </div>,
          Math.max(...cards.map((c) => c.height)),
          { space: r === 0 && !g.group ? undefined : gap },
        )
      }
    } else if (o.variant === 'sheet') {
      const body = m.page.bodyHeight - 4
      if (o.drawingSize === 'xl') {
        // Hoja por ficha; con muchas ventanas, dos fichas por hoja.
        const perPage = items.length > 12 ? 2 : 1
        for (const [i, row] of chunk(g.items, perPage).entries()) {
          b.add(
            `p-${g.group?.key ?? 'all'}-${i}`,
            // La última ficha suelta toma la hoja entera en vez de dejar media hoja en blanco.
            row.length === 1 ? fiche(m, row[0], o, body) : <div className="dkd-fiches">{row.map((item) => <div key={item.ref}>{fiche(m, item, o, body, true)}</div>)}</div>,
            body,
            { page: 'own' },
          )
        }
      } else {
        const h = Math.floor((body - gap * 2) / 2)
        for (const item of g.items) b.add(`i-${item.ref}`, fiche(m, item, o, h), h, { space: gap * 2 })
      }
    } else {
      const body = m.page.bodyHeight - 4
      const perSheet = items.length <= 8 ? 1 : items.length <= 20 ? 2 : 3
      const sheetH = (n: number) => (n === 1 ? body : Math.floor((body - gap * 2 * (n - 1)) / n))
      // Las láminas sueltas de la última hoja se reparten el alto: nunca una ventana y media hoja vacía.
      const tail = grouped ? 0 : g.items.length % perSheet
      g.items.forEach((item, i) => {
        const n = tail && i >= g.items.length - tail ? tail : perSheet
        const h = sheetH(n)
        if (n === 1) b.add(`i-${item.ref}`, plate(m, item, o, h, false), h, { page: 'own' })
        else b.add(`i-${item.ref}`, plate(m, item, o, h, true), h, { space: gap * 2, ...(i === g.items.length - tail ? { breakBefore: true } : {}) })
      })
    }
    if (g.group && o.showGroupSubtotals && showSubtotal(g.items, o)) {
      const last = b.list[b.list.length - 1]
      if (last) last.keepWithNext = true
      b.add(`s-${g.group.key}`, <GroupSubtotal m={m} g={g.group} items={g.items} />, subtotalH, { space: Math.round(gap / 2) })
    }
  }
  return finish()
}

/** Partidas de texto: lo que no es una ventana pero el taller cotiza con su detalle. */
function otherLines(section: Items, m: QuoteModel, b: ReturnType<typeof sectionBlocks>, o: ItemsOptions): void {
  if (!o.showOtherLines) return
  const lines = m.data.extras.filter((e) => e.line && m.included.has(e.id) && (e.label || e.description))
  if (lines.length === 0) return
  const { t, fmt } = m.kit
  const tm = textMetrics(m)
  const priced = o.showLineTotals || o.showUnitPrices
  const textW = m.page.contentWidth - (priced ? 110 : 0)
  b.add('other-head', <h3 className="dkd-lines__title">{t('items.otherLines')}</h3>, lineH(tm.h3) + 6, { keepWithNext: true })
  lines.forEach((e, i) => {
    b.add(
      `other-${e.id}`,
      <div className={clsx('dkd-lines', priced && 'dkd-lines--priced')} role="row">
        <div className="dkd-lines__text">
          <span className="dkd-strong">{e.label}</span>
          {e.description ? <span className="dkd-lines__desc">{e.description}</span> : null}
        </div>
        {priced ? <span className="dkd-num dkd-right">{e.amount !== 0 ? fmt.money(lineAmount(m, e.amount, o)) : ''}</span> : null}
      </div>,
      lineCount(e.label, textW, tm.body) * lineH(tm.body) + (e.description ? lineCount(e.description, textW, tm.small) * lineH(tm.small) : 0) + m.tokens.density.row * 2 + 1,
      { space: 0, ...(i < lines.length - 1 ? {} : {}) },
    )
  })
}

