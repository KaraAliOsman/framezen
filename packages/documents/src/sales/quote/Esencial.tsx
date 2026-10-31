import { EditableText } from '../../base/editable'
import { formatArea, formatClp, formatDateShort } from '../../base/format'
import { paginate, type FlowBlock } from '../../base/paginate'
import { estimateLines } from '../../base/text'
import { DocHeader, DocPage, DocRoot } from '../../base/primitives'
import { pageContentHeight } from '../../base/theme'
import type { QuoteDocItem } from '../types'
import {
  AcceptanceBlock,
  ClientLines,
  DrawingBox,
  IntroText,
  PaymentBlock,
  PriceBlock,
  QuoteTotals,
  Ref,
  Specs,
  TermsBlock,
  footerFor,
  introHeight,
  itemSubtitle,
  itemTitle,
  numberText,
  specRows,
  termsHeight,
  closeHeight,
  acceptInlineHeight,
  paymentHeight,
  ACCEPT_H,
  type QuoteCtx,
} from './shared'

type Block = { kind: 'opening' } | { kind: 'section' } | { kind: 'item'; item: QuoteDocItem } | { kind: 'totals' } | { kind: 'terms' } | { kind: 'accept' }

/** Alto de una fila (medido en Chromium: dibujo 172 + 2 × 14 de aire + borde). */
const ROW_H = 200
/** Fila densa: dibujo 150 y 10 de aire (el texto de la fila mide 150). */
const ROW_H_DENSE = 172

/**
 * Cómo se arma la hoja: lo normal es la fila amplia y la firma al final, a todo el ancho.
 * Si con filas densas o con la firma junto a los totales (bajo la forma de pago, como en
 * «Compacta») el documento ocupa menos hojas —típico: la última quedaba solo con condiciones y
 * firma—, se usa la primera opción que lo logre. Es determinista: la vista previa y el PDF
 * cortan igual.
 */
interface EsencialLayout {
  dense: boolean
  inlineAccept: boolean
}

const LAYOUTS: EsencialLayout[] = [
  { dense: false, inlineAccept: false },
  { dense: true, inlineAccept: false },
  { dense: false, inlineAccept: true },
  { dense: true, inlineAccept: true },
]

/** Alto de la fila: el dibujo o el texto (≈ 150 px + la nota, 15 px por línea de ~50 caracteres). */
function rowHeight(item: QuoteDocItem, dense: boolean): number {
  const note = item.notes ? 12 + 15 * Math.max(1, estimateLines(item.notes, 50)) : 0
  return dense ? ROW_H_DENSE + note : Math.max(ROW_H + (item.notes ? 20 : 0), 180 + note)
}

function esencialBlocks(ctx: QuoteCtx, layout: EsencialLayout): FlowBlock<Block>[] {
  const { data } = ctx
  const payH = paymentHeight(ctx)
  // Columna izquierda con la firma: aire 22 + forma de pago + separación + firma angosta.
  const closeLeft = 22 + payH + (payH > 0 ? 14 : 0) + acceptInlineHeight(ctx) + 8
  return [
    { key: 'opening', height: 300 + introHeight(ctx), data: { kind: 'opening' } },
    { key: 'section', height: 34, data: { kind: 'section' }, keepWithNext: true },
    ...data.items.map((item, i) => ({ key: `item-${i}`, height: rowHeight(item, layout.dense), data: { kind: 'item' as const, item } })),
    { key: 'totals', height: layout.inlineAccept ? Math.max(closeHeight(ctx), closeLeft) : closeHeight(ctx), data: { kind: 'totals' } },
    { key: 'terms', height: termsHeight(ctx), data: { kind: 'terms' } },
    ...(layout.inlineAccept ? [] : [{ key: 'accept', height: ACCEPT_H, data: { kind: 'accept' as const } }]),
  ]
}

/** El primer arreglo con el mínimo de hojas (a igualdad, el normal). */
function esencialPages(ctx: QuoteCtx): { layout: EsencialLayout; pages: FlowBlock<Block>[][] } {
  const H = pageContentHeight(ctx.theme.paper)
  let best: { layout: EsencialLayout; pages: FlowBlock<Block>[][] } | undefined
  for (const layout of LAYOUTS) {
    const pages = paginate(esencialBlocks(ctx, layout), { first: H, rest: H - 57 })
    if (!best || pages.length < best.pages.length) best = { layout, pages }
  }
  return best!
}

function Row({ ctx, item, dense }: { ctx: QuoteCtx; item: QuoteDocItem; dense?: boolean }) {
  const subtitle = itemSubtitle(item)
  return (
    <article className={dense ? 'fzd-es-row fzd-es-row--dense' : 'fzd-es-row'}>
      <DrawingBox ctx={ctx} item={item} width={236} height={dense ? 150 : 172} />
      <div className="fzd-es-row__body">
        <div className="fzd-es-row__title">
          <Ref value={item.ref} />
          <h3 className="fzd-h3">{itemTitle(item)}</h3>
        </div>
        {subtitle ? <div className="fzd-small fzd-es-row__sub">{subtitle}</div> : null}
        <Specs rows={specRows(ctx, item)} className="fzd-es-row__specs" />
        {item.notes ? <p className="fzd-small fzd-es-row__note">{item.notes}</p> : null}
      </div>
      <PriceBlock ctx={ctx} item={item} />
    </article>
  )
}

/** «Esencial»: limpia, una fila por ventana con el dibujo grande. */
export function EsencialQuote({ ctx, className, withStyles }: { ctx: QuoteCtx; className?: string; withStyles?: boolean }) {
  const { data } = ctx
  const { layout, pages } = esencialPages(ctx)

  const render = (block: FlowBlock<Block>) => {
    const b = block.data
    switch (b.kind) {
      case 'opening':
        return (
          <div key={block.key} className="fzd-es-opening">
            <DocHeader
              org={data.org}
              kind="Cotización"
              number={numberText(ctx)}
              meta={[
                { label: 'Emitida el', value: formatDateShort(data.quote.date) },
                ...(ctx.validUntil ? [{ label: 'Válida hasta', value: formatDateShort(ctx.validUntil) }] : []),
              ]}
            />
            <div className="fzd-es-title">
              <EditableText as="h1" inline value={data.quote.title} {...ctx.ed('title')} className="fzd-h1" placeholder="Nombre de la obra" />
            </div>
            {/* Sin cliente (nada es obligatorio) no hay bloque «Para»: la franja queda en dos columnas. */}
            <div className={data.client?.name ? 'fzd-es-strip' : 'fzd-es-strip fzd-es-strip--noclient'}>
              {data.client?.name ? (
                <div>
                  <div className="fzd-label">Para</div>
                  <ClientLines ctx={ctx} />
                </div>
              ) : null}
              <div>
                <div className="fzd-label">Resumen</div>
                <div className="fzd-strong">
                  {data.items.length} {data.items.length === 1 ? 'ventana' : 'ventanas'}, {data.totals.units} {data.totals.units === 1 ? 'unidad' : 'unidades'}
                </div>
                {ctx.prefs.showArea ? <div className="fzd-muted fzd-num">{formatArea(data.totals.area)} en total</div> : null}
              </div>
              <div className="fzd-es-strip__total">
                <div className="fzd-label">Total con IVA</div>
                <div className="fzd-es-strip__amount">{formatClp(data.totals.total)}</div>
              </div>
            </div>
            <IntroText ctx={ctx} className="fzd-es-intro" />
          </div>
        )
      case 'section':
        return (
          <div key={block.key} className="fzd-section-head">
            <h2 className="fzd-section-head__title">Detalle</h2>
            <span className="fzd-small">Medidas en milímetros · dibujos vistos desde el interior</span>
          </div>
        )
      case 'item':
        return <Row key={block.key} ctx={ctx} item={b.item} dense={layout.dense} />
      case 'totals':
        return (
          <div key={block.key} className="fzd-es-close">
            {layout.inlineAccept ? (
              <div className="fzd-es-close__left">
                <PaymentBlock ctx={ctx} />
                <AcceptanceBlock ctx={ctx} className="fzd-accept--inline" />
              </div>
            ) : (
              <PaymentBlock ctx={ctx} />
            )}
            <QuoteTotals ctx={ctx} />
          </div>
        )
      case 'terms':
        return <TermsBlock key={block.key} ctx={ctx} className="fzd-es-terms" />
      case 'accept':
        return <AcceptanceBlock key={block.key} ctx={ctx} />
    }
  }

  return (
    <DocRoot theme={ctx.theme} className={['fzd-quote', 'fzd-quote--esencial', className].filter(Boolean).join(' ')} withStyles={withStyles} label={ctx.label}>
      {pages.map((page, i) => (
        <DocPage key={i} footer={footerFor(ctx, i + 1, pages.length)} label={`Página ${i + 1}`}>
          {i > 0 ? <DocHeader org={data.org} kind="Cotización" number={numberText(ctx)} variant="compact" context={data.quote.title} className="fzd-running" /> : null}
          {page.map(render)}
        </DocPage>
      ))}
    </DocRoot>
  )
}
