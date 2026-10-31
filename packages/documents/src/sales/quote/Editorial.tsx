import { clsx } from '../../base/clsx'
import { estimateLines } from '../../base/text'
import { EditableText } from '../../base/editable'
import { formatArea, formatClp, formatDateLong, formatMeasure, formatNumber, joinParts } from '../../base/format'
import { chunk, paginate, type FlowBlock } from '../../base/paginate'
import { DocHeader, DocPage, DocRoot, OrgMark, orgContactLines } from '../../base/primitives'
import { pageContentHeight, pageContentWidth } from '../../base/theme'
import { WindowDrawing } from '../../drawing/WindowDrawing'
import type { QuoteDocItem } from '../types'
import {
  AcceptanceBlock,
  IntroText,
  PaymentBlock,
  QuoteTotals,
  TermsBlock,
  footerFor,
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

type Closing = { kind: 'summaryHead' } | { kind: 'summary'; items: QuoteDocItem[] } | { kind: 'close' } | { kind: 'terms' } | { kind: 'accept' }

function heroItem(items: QuoteDocItem[]): QuoteDocItem | undefined {
  return [...items].sort((a, b) => b.width * b.height - a.width * a.height)[0]
}

function ItemPage({ ctx, item, W }: { ctx: QuoteCtx; item: QuoteDocItem; W: number }) {
  const ext = ctx.prefs.showExteriorView
  const mainW = ext ? Math.round(W * 0.62) : W
  const sideW = W - mainW - 28
  const subtitle = itemSubtitle(item)
  return (
    <div className="fzd-ed-item">
      <header className="fzd-ed-item__head">
        <div className="fzd-ed-item__ref">{item.ref}</div>
        <div className="fzd-ed-item__titles">
          <h2 className="fzd-h2">{itemTitle(item)}</h2>
          <div className="fzd-small">{joinParts([subtitle, formatMeasure(item.width, item.height)])}</div>
        </div>
        <div className="fzd-ed-item__price">
          <div className="fzd-ed-item__amount">{formatClp(item.total)}</div>
          <div className="fzd-small">
            {item.qty > 1 ? `${formatNumber(item.qty)} unidades` : '1 unidad'}
            {ctx.prefs.showUnitPrice && item.qty > 1 ? ` × ${formatClp(item.unitPrice)}` : ''}
          </div>
        </div>
      </header>
      <div className="fzd-ed-item__stage" style={{ gridTemplateColumns: ext ? `${mainW}px ${sideW}px` : '1fr' }}>
        <figure className="fzd-ed-figure">
          <div className="fzd-well fzd-ed-figure__well" style={{ height: ext ? 600 : 560 }}>
            <WindowDrawing
              layout={item.layout}
              design={item.design}
              catalog={ctx.catalog}
              width={mainW - 36}
              height={ext ? 570 : 530}
              dimensions="all"
              title={`${item.ref}: ${itemTitle(item)}, vista interior`}
            />
          </div>
          <figcaption className="fzd-view-label">Vista interior · medidas en milímetros</figcaption>
        </figure>
        {ext ? (
          <aside className="fzd-ed-side">
            <figure className="fzd-ed-figure">
              <div className="fzd-well fzd-ed-figure__well" style={{ height: 230 }}>
                <WindowDrawing layout={item.layout} design={item.design} catalog={ctx.catalog} view="exterior" width={sideW - 28} height={206} dimensions="none" title={`${item.ref}: vista exterior`} />
              </div>
              <figcaption className="fzd-view-label">Vista exterior</figcaption>
            </figure>
            <dl className="fzd-ed-specs">
              {specRows(ctx, item, { opening: true }).map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        ) : null}
      </div>
      {!ext ? (
        <dl className="fzd-ed-specs fzd-ed-specs--row">
          {specRows(ctx, item, { opening: true }).map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.notes ? <p className="fzd-ed-item__note">{item.notes}</p> : null}
    </div>
  )
}

/**
 * Portada editorial: con el título de una línea y un saludo de tres, sobran ~86 px (medido en
 * Chromium). Un título largo baja de tamaño y, si aun así crece, el dibujo protagonista cede lo
 * justo para que la portada siga en una sola hoja.
 */
function coverLayout(ctx: QuoteCtx): { titleClass?: string; heroHeight: number } {
  const title = ctx.data.quote.title ?? ''
  const size = title.length > 60 ? 30 : title.length > 30 ? 38 : 50
  const titleClass = size === 30 ? 'fzd-ed-cover__title--s' : size === 38 ? 'fzd-ed-cover__title--m' : undefined
  const titleLines = Math.max(1, Math.ceil(title.length / (640 / (size * 0.5))))
  const titleExtra = Math.max(0, titleLines * size * 1.04 - 51)
  const introExtra = Math.max(0, estimateLines(ctx.prefs.intro, 82) * 21 - 63)
  const heroHeight = Math.round(Math.max(160, Math.min(380, 380 + 66 - titleExtra - introExtra)))
  return { ...(titleClass ? { titleClass } : {}), heroHeight }
}

/** «Editorial»: portada, una ventana por página con el dibujo como protagonista y cierre con firma. */
export function EditorialQuote({ ctx, className, withStyles }: { ctx: QuoteCtx; className?: string; withStyles?: boolean }) {
  const { data } = ctx
  const H = pageContentHeight(ctx.theme.paper)
  const W = pageContentWidth(ctx.theme.paper)
  const hero = heroItem(data.items)
  // Cierre: resumen, totales, condiciones y firma. Si la firma quedaría sola en una hoja, va
  // junto a los totales (bajo la forma de pago) y el cierre ahorra esa hoja.
  const payH = paymentHeight(ctx)
  const closingFor = (inlineAccept: boolean): FlowBlock<Closing>[] => [
    { key: 'summaryHead', height: 58, data: { kind: 'summaryHead' }, keepWithNext: true },
    ...chunk(data.items, 12).map((items, i) => ({ key: `summary-${i}`, height: 28 + items.length * 30, data: { kind: 'summary' as const, items } })),
    {
      key: 'close',
      height: inlineAccept ? Math.max(closeHeight(ctx), 18 + payH + (payH > 0 ? 14 : 0) + acceptInlineHeight(ctx) + 8) : closeHeight(ctx),
      data: { kind: 'close' },
    },
    { key: 'terms', height: termsHeight(ctx), data: { kind: 'terms' } },
    ...(inlineAccept ? [] : [{ key: 'accept', height: ACCEPT_H, data: { kind: 'accept' as const } }]),
  ]
  const budgets = { first: H - 57, rest: H - 57 }
  const wide = paginate(closingFor(false), budgets)
  const inline = paginate(closingFor(true), budgets)
  const inlineAccept = inline.length < wide.length
  const closingPages = inlineAccept ? inline : wide
  const total = 1 + data.items.length + closingPages.length
  const contact = orgContactLines(data.org)

  const renderClosing = (block: FlowBlock<Closing>) => {
    const b = block.data
    switch (b.kind) {
      case 'summaryHead':
        return (
          <div key={block.key} className="fzd-ed-closing-head">
            <div className="fzd-label fzd-accent">Resumen</div>
            <h2 className="fzd-h2">Tu proyecto en una mirada</h2>
          </div>
        )
      case 'summary':
        return (
          <table key={block.key} className="fzd-table fzd-ed-summary">
            <thead>
              <tr>
                <th style={{ width: 44 }}>Ref.</th>
                <th>Ventana</th>
                <th className="is-num">Medidas</th>
                <th className="is-num" style={{ width: 44 }}>
                  Cant.
                </th>
                <th className="is-num" style={{ width: 96 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {b.items.map((item) => (
                <tr key={item.ref}>
                  <td className="fzd-strong">{item.ref}</td>
                  <td>
                    {itemTitle(item)}
                    {item.location ? <span className="fzd-muted"> · {item.location}</span> : null}
                  </td>
                  <td className="is-num">{formatMeasure(item.width, item.height)}</td>
                  <td className="is-num">{formatNumber(item.qty)}</td>
                  <td className="is-num">{formatClp(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      case 'close':
        return (
          <div key={block.key} className="fzd-ed-close">
            {inlineAccept ? (
              <div className="fzd-ed-close__left">
                <PaymentBlock ctx={ctx} />
                <AcceptanceBlock ctx={ctx} title="Aceptación y firma" className="fzd-accept--inline" />
              </div>
            ) : (
              <PaymentBlock ctx={ctx} />
            )}
            <QuoteTotals ctx={ctx} />
          </div>
        )
      case 'terms':
        return <TermsBlock key={block.key} ctx={ctx} className="fzd-ed-terms" />
      case 'accept':
        return <AcceptanceBlock key={block.key} ctx={ctx} title="Aceptación y firma" />
    }
  }

  const cover = coverLayout(ctx)
  return (
    <DocRoot theme={ctx.theme} className={['fzd-quote', 'fzd-quote--editorial', className].filter(Boolean).join(' ')} withStyles={withStyles} label={ctx.label}>
      <DocPage footer={footerFor(ctx, 1, total)} className="fzd-ed-cover" label="Portada">
        <div className="fzd-ed-cover__top">
          <div className="fzd-brand">
            <OrgMark org={data.org} />
            {data.org.logo ? null : <div className="fzd-brand__name">{data.org.name}</div>}
          </div>
          <div className="fzd-ed-cover__no">Cotización N° {numberText(ctx)}</div>
        </div>
        <div className="fzd-ed-cover__titles">
          <div className="fzd-label fzd-accent">Propuesta de ventanas</div>
          <EditableText as="h1" inline value={data.quote.title} {...ctx.ed('title')} className={clsx('fzd-ed-cover__title', cover.titleClass)} placeholder="Nombre de la obra" />
          <div className="fzd-ed-cover__meta">{joinParts([ctx.clientName ? `Para ${ctx.clientName}` : undefined, formatDateLong(data.quote.date)])}</div>
        </div>
        {hero ? (
          <div className="fzd-ed-cover__stage">
            <WindowDrawing layout={hero.layout} design={hero.design} catalog={ctx.catalog} width={W - 80} height={cover.heroHeight} dimensions="total" title={`${hero.ref}: ${itemTitle(hero)}`} />
            <div className="fzd-ed-cover__caption">
              {hero.ref} · {itemTitle(hero)}
            </div>
          </div>
        ) : null}
        <IntroText ctx={ctx} className="fzd-ed-cover__intro" />
        <div className="fzd-page__spacer" />
        <dl className="fzd-ed-cover__facts">
          <div>
            <dt>Preparado por</dt>
            <dd>
              <span className="fzd-strong">{data.org.name}</span>
              {contact.slice(1).map((line) => (
                <span key={line} className="fzd-muted">
                  {line}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt>Proyecto</dt>
            <dd>
              <span className="fzd-strong">
                {formatNumber(data.items.length)} {data.items.length === 1 ? 'ventana' : 'ventanas'}
              </span>
              <span className="fzd-muted">
                {formatNumber(data.totals.units)} {data.totals.units === 1 ? 'unidad' : 'unidades'}
                {ctx.prefs.showArea ? ` · ${formatArea(data.totals.area)}` : ''}
              </span>
            </dd>
          </div>
          <div className="fzd-ed-cover__total">
            <dt>Total con IVA</dt>
            <dd>{formatClp(data.totals.total)}</dd>
          </div>
        </dl>
      </DocPage>
      {data.items.map((item, i) => (
        <DocPage key={item.ref + i} footer={footerFor(ctx, i + 2, total)} label={`${item.ref}: ${itemTitle(item)}`}>
          <DocHeader org={data.org} kind="Cotización" number={numberText(ctx)} variant="compact" context={data.quote.title} className="fzd-running" />
          <ItemPage ctx={ctx} item={item} W={W} />
        </DocPage>
      ))}
      {closingPages.map((page, i) => (
        <DocPage key={`c${i}`} footer={footerFor(ctx, data.items.length + 2 + i, total)} label={`Cierre ${i + 1}`}>
          <DocHeader org={data.org} kind="Cotización" number={numberText(ctx)} variant="compact" context={data.quote.title} className="fzd-running" />
          {page.map(renderClosing)}
        </DocPage>
      ))}
    </DocRoot>
  )
}
