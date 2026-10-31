import { EditableText } from '../../base/editable'
import { formatClp, formatDateShort, formatMm, formatNumber, joinParts } from '../../base/format'
import { paginate, type FlowBlock } from '../../base/paginate'
import { DocHeader, DocPage, DocRoot } from '../../base/primitives'
import { pageContentHeight } from '../../base/theme'
import { WindowDrawing } from '../../drawing/WindowDrawing'
import type { QuoteDocItem } from '../types'
import {
  AcceptanceBlock,
  ColorValue,
  IntroText,
  PaymentBlock,
  QuoteTotals,
  TermsBlock,
  footerFor,
  introHeight,
  itemTitle,
  numberText,
  termsHeight,
  closeHeight,
  acceptInlineHeight,
  paymentHeight,
  type QuoteCtx,
} from './shared'

type Block = { kind: 'opening' } | { kind: 'rows'; items: QuoteDocItem[]; first: boolean } | { kind: 'close' } | { kind: 'terms' }

const ROW_H = 44

/** El ambiente va junto al nombre si cabe en la línea; si no, encabeza la línea de detalle. */
const locationBelow = (item: QuoteDocItem) => itemTitle(item).length + (item.location?.length ?? 0) > 40
const HEAD_H = 26

function ItemTable({ ctx, items }: { ctx: QuoteCtx; items: QuoteDocItem[] }) {
  const { prefs } = ctx
  const ext = prefs.showExteriorView
  return (
    <table className="fzd-table fzd-co-table">
      <colgroup>
        <col style={{ width: 34 }} />
        <col style={{ width: ext ? 96 : 52 }} />
        <col />
        <col style={{ width: 92 }} />
        {prefs.showArea ? <col style={{ width: 46 }} /> : null}
        <col style={{ width: 36 }} />
        {prefs.showUnitPrice ? <col style={{ width: 78 }} /> : null}
        <col style={{ width: 86 }} />
      </colgroup>
      <thead>
        <tr>
          <th>Ref.</th>
          <th>{ext ? 'Interior · exterior' : 'Dibujo'}</th>
          <th>Descripción</th>
          <th className="is-num">Ancho × alto</th>
          {prefs.showArea ? <th className="is-num">m²</th> : null}
          <th className="is-num">Cant.</th>
          {prefs.showUnitPrice ? <th className="is-num">Unitario</th> : null}
          <th className="is-num">Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.ref}>
            <td>
              <span className="fzd-co-ref">{item.ref}</span>
            </td>
            <td>
              <div className="fzd-co-thumbs">
                <WindowDrawing layout={item.layout} design={item.design} catalog={ctx.catalog} width={38} height={36} dimensions="none" title={`${item.ref}: vista interior`} />
                {ext ? <WindowDrawing layout={item.layout} design={item.design} catalog={ctx.catalog} view="exterior" width={38} height={36} dimensions="none" title={`${item.ref}: vista exterior`} /> : null}
              </div>
            </td>
            <td>
              <div className="fzd-co-name">
                {itemTitle(item)}
                {item.location && !locationBelow(item) ? <span className="fzd-co-loc"> · {item.location}</span> : null}
              </div>
              {/* Cada dato va entero; entre datos hay un espacio para que la línea pueda bajar ahí. */}
              <div className="fzd-co-meta">
                {[
                  item.location && locationBelow(item) ? <span key="loc">{item.location}</span> : null,
                  item.name?.trim() ? <span key="desc">{item.description}</span> : null,
                  prefs.showLine && item.lineName ? <span key="line">{item.lineName}</span> : null,
                  <span key="color" className="fzd-inline">
                    <ColorValue ctx={ctx} item={item} />
                  </span>,
                  prefs.showGlass && item.glassName ? <span key="glass">{item.glassName}</span> : null,
                ]
                  .filter(Boolean)
                  .flatMap((node, i) => (i === 0 ? [node] : [' ', node]))}
              </div>
            </td>
            <td className="is-num">
              {formatMm(item.width)} × {formatMm(item.height)}
            </td>
            {prefs.showArea ? <td className="is-num">{formatNumber(item.area * item.qty, 2)}</td> : null}
            <td className="is-num">{formatNumber(item.qty)}</td>
            {prefs.showUnitPrice ? <td className="is-num">{formatClp(item.unitPrice)}</td> : null}
            <td className="is-num fzd-strong">{formatClp(item.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** «Compacta»: tabla densa con miniaturas, pensada para obras de 20 ventanas o más. */
export function CompactaQuote({ ctx, className, withStyles }: { ctx: QuoteCtx; className?: string; withStyles?: boolean }) {
  const { data } = ctx
  const H = pageContentHeight(ctx.theme.paper)
  // Medido en Chromium: cabecera + franja 133 px y márgenes 48 (+ el saludo).
  const opening = 160 + introHeight(ctx, 118)
  // Filas agrupadas por hoja: se calcula cuántas caben y se arma una tabla por hoja.
  const firstRows = Math.max(1, Math.floor((H - opening - HEAD_H) / ROW_H))
  const restRows = Math.max(1, Math.floor((H - 57 - HEAD_H) / ROW_H))
  const groups: QuoteDocItem[][] = []
  let cursor = 0
  while (cursor < data.items.length) {
    const size = groups.length === 0 ? firstRows : restRows
    groups.push(data.items.slice(cursor, cursor + size))
    cursor += size
  }
  if (groups.length === 0) groups.push([])
  // La aceptación va junto a los totales, bajo la forma de pago (donde sobra espacio): así una
  // obra chica cabe en una hoja y la firma nunca queda sola en la última página.
  const payH = paymentHeight(ctx)
  const closeLeft = (ctx.prefs.showArea ? 0 : 34) + payH + (payH > 0 ? 14 : 0) + acceptInlineHeight(ctx) + 16
  const blocks: FlowBlock<Block>[] = [
    { key: 'opening', height: opening, data: { kind: 'opening' } },
    ...groups.map((items, i) => ({ key: `rows-${i}`, height: HEAD_H + items.length * ROW_H, data: { kind: 'rows' as const, items, first: i === 0 }, breakBefore: i > 0 })),
    { key: 'close', height: Math.max(closeHeight(ctx), closeLeft), data: { kind: 'close' } },
    { key: 'terms', height: termsHeight(ctx, 70, 34), data: { kind: 'terms' } },
  ]
  const pages = paginate(blocks, { first: H, rest: H - 57 })
  const c = data.client
  const contact = joinParts([c?.phone, c?.email])
  // Sin cliente (nada es obligatorio) no se muestran «Cliente —» ni «Contacto —»: la franja se reacomoda.
  const stripCols = 2 + (c?.name ? 1 : 0) + (contact ? 1 : 0)

  const render = (block: FlowBlock<Block>) => {
    const b = block.data
    switch (b.kind) {
      case 'opening':
        return (
          <div key={block.key} className="fzd-co-opening">
            <DocHeader
              org={data.org}
              kind="Cotización"
              number={numberText(ctx)}
              meta={[
                { label: 'Emitida el', value: formatDateShort(data.quote.date) },
                ...(ctx.validUntil ? [{ label: 'Válida hasta', value: formatDateShort(ctx.validUntil) }] : []),
              ]}
            />
            <dl className={`fzd-co-strip fzd-co-strip--${stripCols}`}>
              <div>
                <dt>Obra</dt>
                <dd>
                  <EditableText as="span" inline value={data.quote.title} {...ctx.ed('title')} className="fzd-strong" placeholder="Nombre de la obra" />
                </dd>
              </div>
              {c?.name ? (
                <div>
                  <dt>Cliente</dt>
                  <dd>
                    <span className="fzd-strong">{c.name}</span>
                    {c.rut ? <span className="fzd-muted"> · RUT {c.rut}</span> : null}
                  </dd>
                </div>
              ) : null}
              {contact ? (
                <div>
                  <dt>Contacto</dt>
                  <dd className="fzd-muted">{contact}</dd>
                </div>
              ) : null}
              <div>
                <dt>Total con IVA</dt>
                <dd className="fzd-strong fzd-money">{formatClp(data.totals.total)}</dd>
              </div>
            </dl>
            <IntroText ctx={ctx} className="fzd-co-intro" />
          </div>
        )
      case 'rows':
        return <ItemTable key={block.key} ctx={ctx} items={b.items} />
      case 'close':
        return (
          <div key={block.key} className="fzd-co-close">
            <div className="fzd-co-close__left">
              {/* Con superficie, el cuadro de totales ya dice unidades y m²: no se repite. */}
              {ctx.prefs.showArea ? null : (
                <div className="fzd-co-count">
                  {formatNumber(data.items.length)} {data.items.length === 1 ? 'ventana' : 'ventanas'} · {formatNumber(data.totals.units)} {data.totals.units === 1 ? 'unidad' : 'unidades'}
                </div>
              )}
              <PaymentBlock ctx={ctx} />
              <AcceptanceBlock ctx={ctx} className="fzd-accept--inline" />
            </div>
            <QuoteTotals ctx={ctx} />
          </div>
        )
      case 'terms':
        return <TermsBlock key={block.key} ctx={ctx} className="fzd-co-terms" />
    }
  }

  return (
    <DocRoot theme={ctx.theme} className={['fzd-quote', 'fzd-quote--compacta', className].filter(Boolean).join(' ')} withStyles={withStyles} label={ctx.label}>
      {pages.map((page, i) => (
        <DocPage key={i} footer={footerFor(ctx, i + 1, pages.length)} label={`Página ${i + 1}`}>
          {i > 0 ? <DocHeader org={data.org} kind="Cotización" number={numberText(ctx)} variant="compact" context={data.quote.title} className="fzd-running" /> : null}
          {page.map(render)}
        </DocPage>
      ))}
    </DocRoot>
  )
}
