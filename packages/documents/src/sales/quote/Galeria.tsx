import { EditableText } from '../../base/editable'
import { formatArea, formatClp, formatDateShort, formatNumber } from '../../base/format'
import { chunk, paginate, type FlowBlock } from '../../base/paginate'
import { DocHeader, DocPage, DocRoot, OrgMark, orgContactLines } from '../../base/primitives'
import { pageContentHeight, pageContentWidth } from '../../base/theme'
import { WindowDrawing } from '../../drawing/WindowDrawing'
import type { QuoteDocItem } from '../types'
import {
  AcceptanceBlock,
  DrawingBox,
  IntroText,
  KeyFigures,
  PaymentBlock,
  QuoteTotals,
  Ref,
  SpecLine,
  TermsBlock,
  footerFor,
  itemSubtitle,
  itemTitle,
  numberText,
  termsHeight,
  closeHeight,
  ACCEPT_H,
  type QuoteCtx,
} from './shared'

/** Fachada: las ventanas a una misma escala, alineadas abajo, como en un plano de elevación. */
export function Elevation({ ctx, items, width, height }: { ctx: QuoteCtx; items: QuoteDocItem[]; width: number; height: number }) {
  const gap = 26
  const labelH = 26
  let list = items.slice(0, 6)
  let scale = 0
  for (;;) {
    const sumW = list.reduce((acc, it) => acc + it.width, 0)
    const maxH = list.reduce((acc, it) => Math.max(acc, it.height), 1)
    scale = Math.min((width - gap * (list.length - 1)) / Math.max(1, sumW), (height - labelH) / maxH)
    const narrowest = list.reduce((acc, it) => Math.min(acc, it.width), Infinity)
    if (list.length <= 2 || narrowest * scale >= 34) break
    list = list.slice(0, list.length - 1)
  }
  return (
    <div className="fzd-elevation" style={{ height: Math.min(height, Math.ceil(list.reduce((acc, it) => Math.max(acc, it.height), 1) * scale + labelH + 8)) }}>
      {list.map((item) => (
        <figure key={item.ref} className="fzd-elevation__item">
          <WindowDrawing
            layout={item.layout}
            design={item.design}
            catalog={ctx.catalog}
            width={Math.max(8, item.width * scale + 4)}
            height={Math.max(8, item.height * scale + 4)}
            dimensions="none"
            title={`${item.ref}: ${itemTitle(item)}`}
          />
          <figcaption>
            <Ref value={item.ref} />
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

// Alto medido en Chromium: fila de tarjetas 271 px (+14 si un título baja a dos líneas, +20 con nota).
const CARD_ROW_H = 274

type Block = { kind: 'cards'; items: QuoteDocItem[] } | { kind: 'totals' } | { kind: 'terms' } | { kind: 'accept' }

function Card({ ctx, item, width }: { ctx: QuoteCtx; item: QuoteDocItem; width: number }) {
  const subtitle = itemSubtitle(item)
  return (
    <article className="fzd-ga-card">
      <DrawingBox ctx={ctx} item={item} width={width} height={128} dimensions="total" className="fzd-ga-card__well" />
      <div className="fzd-ga-card__body">
        <div className="fzd-ga-card__head">
          <Ref value={item.ref} />
          <h3 className="fzd-h3 fzd-ga-card__title">{itemTitle(item)}</h3>
          <span className="fzd-ga-card__total fzd-money">{formatClp(item.total)}</span>
        </div>
        {subtitle ? <div className="fzd-small">{subtitle}</div> : null}
        <div className="fzd-ga-card__specs">
          <SpecLine ctx={ctx} item={item} />
        </div>
        <div className="fzd-ga-card__foot">
          <span>
            {formatNumber(item.qty)} {item.qty === 1 ? 'unidad' : 'unidades'}
            {ctx.prefs.showUnitPrice && item.qty > 1 ? ` × ${formatClp(item.unitPrice)}` : ''}
          </span>
          {ctx.prefs.showArea ? <span className="fzd-num">{formatArea(item.area)}{item.qty > 1 ? ' c/u' : ''}</span> : null}
        </div>
        {item.notes ? <p className="fzd-small fzd-ga-card__note">{item.notes}</p> : null}
      </div>
    </article>
  )
}

/** «Galería»: portada con la fachada y tarjetas visuales de a dos por fila. */
export function GaleriaQuote({ ctx, className, withStyles }: { ctx: QuoteCtx; className?: string; withStyles?: boolean }) {
  const { data } = ctx
  const H = pageContentHeight(ctx.theme.paper)
  const W = pageContentWidth(ctx.theme.paper)
  const cardW = Math.floor((W - 18) / 2)
  const rows = chunk(data.items, 2)
  const blocks: FlowBlock<Block>[] = [
    ...rows.map((items, i) => ({
      key: `row-${i}`,
      height: CARD_ROW_H + (items.some((it) => it.notes) ? 20 : 0) + (items.some((it) => itemTitle(it).length > 26) ? 14 : 0),
      data: { kind: 'cards' as const, items },
    })),
    { key: 'totals', height: closeHeight(ctx) + 14, data: { kind: 'totals' } },
    { key: 'terms', height: termsHeight(ctx, 62, 24), data: { kind: 'terms' } },
    { key: 'accept', height: ACCEPT_H, data: { kind: 'accept' } },
  ]
  const pages = paginate(blocks, { first: H - 57, rest: H - 57 })
  const total = pages.length + 1
  const titleIsClient = !!ctx.clientName

  const render = (block: FlowBlock<Block>) => {
    const b = block.data
    switch (b.kind) {
      case 'cards':
        return (
          <div key={block.key} className="fzd-ga-row">
            {b.items.map((item) => (
              <Card key={item.ref} ctx={ctx} item={item} width={cardW} />
            ))}
          </div>
        )
      case 'totals':
        return (
          <div key={block.key} className="fzd-ga-close">
            <PaymentBlock ctx={ctx} />
            <QuoteTotals ctx={ctx} />
          </div>
        )
      case 'terms':
        return <TermsBlock key={block.key} ctx={ctx} className="fzd-ga-terms" />
      case 'accept':
        return <AcceptanceBlock key={block.key} ctx={ctx} />
    }
  }

  return (
    <DocRoot theme={ctx.theme} className={['fzd-quote', 'fzd-quote--galeria', className].filter(Boolean).join(' ')} withStyles={withStyles} label={ctx.label}>
      <DocPage footer={footerFor(ctx, 1, total)} className="fzd-ga-cover" label="Portada">
        <div className="fzd-ga-cover__top">
          <div className="fzd-brand">
            <OrgMark org={data.org} />
            <div className="fzd-brand__text">
              <div className="fzd-brand__name">{data.org.name}</div>
              <div className="fzd-brand__meta">{orgContactLines(data.org)[1] ?? ''}</div>
            </div>
          </div>
          <div className="fzd-docid">
            <div className="fzd-docid__kind">Cotización N° {numberText(ctx)}</div>
            <div className="fzd-docid__meta">{formatDateShort(data.quote.date)}</div>
          </div>
        </div>
        <div className="fzd-ga-cover__head">
          <div className="fzd-label fzd-accent">{titleIsClient ? 'Propuesta para' : 'Propuesta de ventanas'}</div>
          {titleIsClient ? (
            <>
              <h1 className="fzd-ga-cover__title">{ctx.clientName}</h1>
              <EditableText as="div" inline value={data.quote.title} {...ctx.ed('title')} className="fzd-ga-cover__sub" placeholder="Nombre de la obra" />
            </>
          ) : (
            <EditableText as="h1" inline value={data.quote.title} {...ctx.ed('title')} className="fzd-ga-cover__title" placeholder="Nombre de la obra" />
          )}
        </div>
        <div className="fzd-page__spacer" />
        <div className="fzd-ga-cover__stage">
          <Elevation ctx={ctx} items={data.items} width={W - 64} height={360} />
        </div>
        <div className="fzd-page__spacer" />
        <KeyFigures ctx={ctx} className="fzd-ga-cover__figures" />
        <IntroText ctx={ctx} className="fzd-ga-cover__intro" />
      </DocPage>
      {pages.map((page, i) => (
        <DocPage key={i} footer={footerFor(ctx, i + 2, total)} label={`Página ${i + 2}`}>
          <DocHeader org={data.org} kind="Cotización" number={numberText(ctx)} variant="compact" context={data.quote.title} className="fzd-running" />
          {page.map(render)}
        </DocPage>
      ))}
    </DocRoot>
  )
}
