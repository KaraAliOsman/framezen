/**
 * Decisión comercial: totales (`stack`, `band`, `decision`) y forma de pago (`text`, `table`,
 * `timeline`). Todas las cifras salen del motor (`data.totals`, extras de la cotización); las cuotas
 * se calculan desde el total con la forma de pago escrita por el taller.
 */
import type { ReactNode } from 'react'
import { paymentPlan, type DocSectionOf, type PaymentAccount, type PaymentPlanStep } from '@dekopen/shared'
import { clsx } from '../../base/clsx'
import { EditableText } from '../../base/editable'
import { paymentSchedule, type PaymentStep } from '../../base/text'
import { countUnits, itemsAndUnits, itemsLabel, type QuoteModel } from '../model'
import { DocText, Ghost, Label, richOf } from '../parts'
import { lineCount, richTextHeight } from '../measure'
import { headingNode, lineH, sectionBlocks, textMetrics, type SectionRenderer } from './common'

interface TotalRow {
  key: string
  label: string
  value: string
  muted?: boolean
  /** Opción de la sección que muestra esta fila. */
  el?: string
}

function totalRows(m: QuoteModel, o: DocSectionOf<'totals'>['options']): { rows: TotalRow[]; total: string; totalLabel: string } {
  const { t, fmt } = m.kit
  const d = m.data
  const tt = d.totals
  const rows: TotalRow[] = []
  if (o.showUnits && m.units > 0) {
    const units = t('summary.unitsCount', { count: m.units })
    rows.push({ key: 'units', label: o.showArea && tt.area > 0 ? t('totals.unitsArea', { units, area: fmt.area(tt.area) }) : units, value: '', muted: true, el: 'showUnits' })
  } else if (o.showArea && tt.area > 0) rows.push({ key: 'area', label: t('fields.area'), value: fmt.area(tt.area), muted: true, el: 'showArea' })
  // Sin descuento ni extras el subtotal es el neto: dos filas con la misma cifra no dicen nada.
  if (o.showSubtotal && tt.subtotal !== tt.net) rows.push({ key: 'subtotal', label: t('totals.subtotal'), value: fmt.money(tt.subtotal), el: 'showSubtotal' })
  if (o.showDiscount && tt.discount > 0) rows.push({ key: 'discount', label: tt.discountPct > 0 ? t('totals.discountPct', { pct: fmt.pct(tt.discountPct) }) : t('totals.discount'), value: fmt.money(-tt.discount), el: 'showDiscount' })
  if (o.showExtras) {
    // Las partidas de texto ya se detallaron con las ventanas: aquí van juntas.
    const counted = d.extras.filter((e) => m.included.has(e.id))
    const visible = counted.filter((e) => !e.hidden && !e.line && e.amount !== 0)
    for (const e of visible) rows.push({ key: `x-${e.id}`, label: e.label, value: fmt.money(e.amount), el: 'showExtras' })
    const lines = counted.filter((e) => !e.hidden && e.line).reduce((a, e) => a + e.amount, 0)
    if (lines !== 0) rows.push({ key: 'lines', label: t('items.otherLines'), value: fmt.money(lines), el: 'showExtras' })
    const others = Math.round(tt.extras - lines - visible.reduce((a, e) => a + e.amount, 0))
    if (others !== 0) rows.push({ key: 'others', label: t('totals.services'), value: fmt.money(others), el: 'showExtras' })
  }
  if (o.showSubtotal || o.showDiscount || o.showExtras || o.showTax) rows.push({ key: 'net', label: t('totals.net'), value: fmt.money(tt.net) })
  if (o.showTax) rows.push({ key: 'tax', label: t('totals.tax', { tax: m.kit.taxLabel, pct: fmt.pct(m.taxPct) }), value: fmt.money(tt.iva), el: 'showTax' })
  return { rows, total: fmt.money(tt.total), totalLabel: t('totals.totalWithTax', { tax: m.kit.taxLabel }) }
}

/** Aviso junto al total: lo que aún no tiene precio no está en la cifra. */
function pendingNote(m: QuoteModel): string {
  const count = m.data.totals.pendingItems ?? 0
  return count > 0 ? m.kit.t('pending.totalNote', { count }) : ''
}

function Stack({ rows, total, totalLabel }: { rows: TotalRow[]; total?: string; totalLabel?: string }) {
  return (
    <dl className="dkd-tot">
      {rows.map((r) => (
        <div key={r.key} className={clsx('dkd-tot__row', r.muted && 'dkd-tot__row--muted', r.key === 'net' && 'dkd-tot__row--net')} data-dk-el={r.el}>
          <dt>{r.label}</dt>
          <dd className="dkd-num">{r.value}</dd>
        </div>
      ))}
      {total ? (
        <div className="dkd-tot__grand">
          <dt>{totalLabel}</dt>
          <dd className="dkd-num">{total}</dd>
        </div>
      ) : null}
    </dl>
  )
}

export const renderTotals: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'totals'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const { t, fmt } = m.kit
  const tm = textMetrics(m)
  const { rows, total, totalLabel } = totalRows(m, o)
  const rowH = lineH(tm.body) + 6
  const grandH = lineH(tm.h1) + 18
  const W = m.page.contentWidth
  const pending = pendingNote(m)

  if (o.variant === 'band') {
    // En la columna del margen todo bloque del cierre lleva su título, también el de los valores.
    if (section.title || m.tokens.composition.sideHeadings) {
      const head = headingNode(section, m, ctx, { fallback: t('totals.title') })
      b.add('head', head.node, head.height, { keepWithNext: true })
    }
    const cells = rows.filter((r) => r.value)
    b.add(
      'band',
      <div className="dkd-totband">
        <dl className="dkd-totband__cells">
          {cells.map((r) => (
            <div key={r.key} data-dk-el={r.el}>
              <dt className="dkd-label">{r.label}</dt>
              <dd className="dkd-num">{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="dkd-totband__grand">
          <span className="dkd-label">{totalLabel}</span>
          <span className="dkd-num">{total}</span>
        </div>
      </div>,
      Math.max(lineH(tm.label) + lineH(tm.body) * (cells.length > 4 ? 2.4 : 1.2), lineH(tm.label) + lineH(tm.display) * 0.86) + m.tokens.density.pad * 2 + 8,
    )
    if (pending) b.add('pending', <p className="dkd-pendnote">{pending}</p>, lineH(tm.body) + 2, { space: 8 })
    return b.list
  }

  if (o.variant === 'decision') {
    const d = m.data
    const priced = m.counted.filter((i) => i.pending !== 'all')
    const unpriced = m.counted.filter((i) => i.pending).map((i) => i.ref).filter(Boolean)
    const includes = [
      ...(priced.length ? [t('totals.includesItems', { items: itemsAndUnits(m, priced) })] : []),
      ...d.extras.filter((e) => !e.hidden && e.amount !== 0 && m.included.has(e.id)).map((e) => e.label),
      // Lo que falta se nombra aquí: quien lee «Qué incluye» debe poder cuadrarlo con la lista de ventanas.
      ...(unpriced.length ? [t('pending.outside', { list: unpriced.join(', ') })] : []),
    ]
    const side = rows.filter((r) => r.value)
    const leftW = W * 0.55
    const height =
      m.tokens.density.pad * 2 +
      Math.max(
        lineH(tm.label) + lineH(tm.display) * 1.05 + lineH(tm.small) + (pending ? lineH(tm.body) + 4 : 0) + 24 + lineH(tm.label) + includes.reduce((a, l) => a + lineCount(l, leftW - 30, tm.body) * lineH(tm.body) + 5, 0) + lineH(tm.small) + 12,
        side.length * rowH + grandH + 10,
      )
    b.add(
      'decision',
      <div className="dkd-decision">
        <div className="dkd-decision__main">
          <span className="dkd-label">
            {m.onSectionEdit ? <EditableText as="span" inline value={sectionTitleOr(section, m, t('totals.decisionLead'))} editable onChange={(v) => m.onSectionEdit?.(section.id, 'title', v === t('totals.decisionLead') ? '' : v)} /> : sectionTitleOr(section, m, t('totals.decisionLead'))}
          </span>
          <div className="dkd-decision__figure dkd-num">{total}</div>
          <div className="dkd-decision__tax">{totalLabel}{m.validUntil ? ` · ${t('totals.validUntil', { date: fmt.date(m.validUntil, 'long') })}` : ''}</div>
          {pending ? <p className="dkd-pendnote">{pending}</p> : null}
          <span className="dkd-label dkd-decision__inc">{t('totals.decisionIncludes')}</span>
          <ul className="dkd-checks">
            {includes.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <Stack rows={side} />
      </div>,
      height,
    )
    return b.list
  }

  const head = headingNode(section, m, ctx, { fallback: t('totals.title') })
  b.add('head', head.node, head.height, { keepWithNext: true })
  const plan = paymentBesideTotals(m) ? steps(m) : null
  const summary: ReactNode[] = []
  if (pending) summary.push(<p key="p" className="dkd-pendnote">{pending}</p>)
  if (m.validUntil) summary.push(<p key="v">{t('totals.validUntil', { date: fmt.date(m.validUntil, 'long') })}</p>)
  if (m.kit.fmt.currency !== 'CLP' || m.kit.locale !== 'es') summary.push(<p key="c">{t('totals.currencyNote', { currency: m.kit.fmt.currency })}</p>)
  b.add(
    'stack',
    <div className="dkd-totwrap">
      <div className="dkd-totwrap__side">
        {plan ? (
          <div className="dkd-totpay" data-field={m.canEdit('paymentTerms') ? 'paymentTerms' : undefined} data-dk-text={m.canEdit('paymentTerms') ? '' : undefined}>
            <h3 className="dkd-totpay__title">{t('payment.title')}</h3>
            {plan.map((s, i) => (
              <div key={i} className="dkd-totpay__row">
                <span>{s.label}</span>
                <span className="dkd-num dkd-right">{fmt.pct(s.pct)}</span>
                <span className="dkd-num dkd-right">{fmt.money(s.amount)}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="dkd-totwrap__note">{summary}</div>
      </div>
      <Stack rows={rows} total={total} totalLabel={totalLabel} />
    </div>,
    rows.length * rowH + grandH + 6,
  )
  return b.list
}

function sectionTitleOr(section: DocSectionOf<'totals'>, m: QuoteModel, fallback: string): string {
  return section.title ? section.title : fallback
}

// ── Forma de pago ───────────────────────────────────────────────────────────

/** Las cuotas van junto a los valores: el diseño lo pide, son dos o más y no se está editando el texto. */
export function paymentBesideTotals(m: QuoteModel): boolean {
  if (!m.tokens.composition.payBesideTotals) return false
  const payment = m.template.sections.find((s): s is DocSectionOf<'payment'> => s.type === 'payment' && s.enabled)
  const totals = m.template.sections.find((s): s is DocSectionOf<'totals'> => s.type === 'totals' && s.enabled)
  if (!payment || !totals || totals.options.variant !== 'stack' || payment.options.variant !== 'table' || !payment.options.showSchedule) return false
  return (steps(m)?.length ?? 0) > 1
}

function steps(m: QuoteModel): PaymentStep[] | null {
  const list = paymentSchedule(m.texts.paymentTerms, m.data.totals.total)
  if (!list) return null
  return list.map((s, i) => (/^Cuota \d+$/.test(s.label) ? { ...s, label: m.kit.t('payment.step', { n: i + 1 }) } : s))
}

export const renderPayment: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'payment'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const { t, fmt } = m.kit
  const text = m.texts.paymentTerms
  const details = o.showDetails === false ? null : m.paymentDetails
  // Con cuotas el PDF imprime la tabla, no la frase: la frase se cambia desde la tabla (el lienzo la abre al hacer clic).
  const planText = m.canEdit('paymentTerms') ? ({ 'data-field': 'paymentTerms', 'data-dk-text': '' } as const) : {}
  const showTerms = Boolean(text || m.editable || m.ghost) && !paymentBesideTotals(m)
  if (!showTerms && !details) return b.list
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  // Un pago único repetiría el total: sólo se muestran cuotas cuando son dos o más.
  const schedule = o.showSchedule ? steps(m) : null
  const plan = schedule && schedule.length > 1 ? schedule : null
  const head = headingNode(section, m, ctx, { guide: !text && !details })
  b.add('head', head.node, head.height, { keepWithNext: true })
  const textH = Math.max(lineH(tm.body), richTextHeight(richOf(text || ' '), W, tm.body, m.placeholders))
  /** Después de la forma de pago escrita: cómo y a quién se paga. */
  const finish = () => {
    if (!details) return b.list
    const rowH = lineH(tm.small) + 4
    // Un plan escrito en el texto ya dijo los montos: no se dicen dos veces.
    const steps = paymentPlan(details.deposit, m.data.totals.total)
    const shown = schedule && schedule.length > 1 ? [] : steps.length > 1 || (steps[0] && steps[0].amount < m.data.totals.total) ? steps : []
    if (shown.length) {
      b.add(
        'pay-plan',
        <div className="dkd-paytbl dkd-bank__plan">
          {shown.map((s, i) => (
            <div key={i} className="dkd-paytbl__row">
              <span>{planLabel(m, s, i, shown.length)}</span>
              <span className="dkd-num dkd-right">{s.pct ? fmt.pct(s.pct) : ''}</span>
              <span className="dkd-num dkd-right">{fmt.money(s.amount)}</span>
            </div>
          ))}
        </div>,
        shown.length * (lineH(tm.body) + 12) + 8,
      )
    }
    const accounts = details.accounts
    const perRow = accounts.length > 1 ? 2 : 1
    for (let i = 0; i < accounts.length; i += perRow) {
      const row = accounts.slice(i, i + perRow)
      const tallest = Math.max(...row.map((a) => accountRows(m, a).length))
      b.add(
        `pay-account-${i}`,
        <div className="dkd-bank" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
          {row.map((a) => (
            <dl key={a.id} className="dkd-bank__acct">
              {accountRows(m, a).map(([label, value]) => (
                <div key={label} className="dkd-bank__row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>,
        tallest * rowH + 18,
      )
    }
    if (details.links.length) {
      b.add(
        'pay-links',
        <ul className="dkd-bank__links">
          {details.links.map((link) => (
            <li key={link.id}>
              <span>{link.label}</span> <a href={link.url}>{link.url}</a>
            </li>
          ))}
        </ul>,
        details.links.length * rowH * 2 + 8,
      )
    }
    if (details.instructions) {
      b.add('pay-note', <p className="dkd-bank__note">{details.instructions}</p>, lineCount(details.instructions, W, tm.small) * rowH + details.instructions.split('\n').length * rowH + 6)
    }
    return b.list
  }
  if (!showTerms) return finish()
  if (!text && m.ghost) {
    b.add('ghost', <Ghost>{t('ghost.payment')}</Ghost>, textH)
    return finish()
  }

  if (plan && o.variant === 'timeline') {
    b.add(
      'timeline',
      <div className="dkd-paytl" data-dk-el="showSchedule">
        <ol className="dkd-paytl__steps" style={{ gridTemplateColumns: `repeat(${plan.length}, minmax(0, 1fr))` }}>
          {plan.map((s, i) => (
            <li key={i} className="dkd-paytl__step">
              <span className="dkd-paytl__pct dkd-num">{fmt.pct(s.pct)}</span>
              <span className="dkd-paytl__label">{s.label}</span>
              <span className="dkd-paytl__amount dkd-num">{fmt.money(s.amount)}</span>
            </li>
          ))}
        </ol>
        <div className="dkd-paytl__text"><DocText m={m} field="paymentTerms" value={text} placeholder={t('payment.title')} /></div>
      </div>,
      10 + lineH(tm.h2) + Math.max(...plan.map((s) => lineCount(s.label, W / plan.length - 16, tm.small))) * lineH(tm.small) + lineH(tm.body) + 18 + textH,
    )
    return finish()
  }
  if (plan && o.variant === 'table') {
    b.add(
      'table',
      <div className="dkd-paytbl" data-dk-el="showSchedule" {...planText}>
        <div className="dkd-paytbl__row dkd-paytbl__row--head">
          <span className="dkd-label">{t('payment.milestone')}</span>
          <span className="dkd-label dkd-right">{t('payment.percent')}</span>
          <span className="dkd-label dkd-right">{t('payment.amount')}</span>
        </div>
        {plan.map((s, i) => (
          <div key={i} className="dkd-paytbl__row">
            <span>{s.label}</span>
            <span className="dkd-num dkd-right">{fmt.pct(s.pct)}</span>
            <span className="dkd-num dkd-right">{fmt.money(s.amount)}</span>
          </div>
        ))}
      </div>,
      (plan.length + 1) * (lineH(tm.body) + 12),
    )
    return finish()
  }
  b.add(
    'text',
    <div className={clsx('dkd-pay', !text && 'dkd-guide')} {...(plan ? planText : {})}>
      {plan ? <Label>{t('payment.title')}</Label> : <DocText m={m} field="paymentTerms" value={text} placeholder={t('payment.title')} />}
      {plan ? (
        <ul className="dkd-pay__plan" data-dk-el="showSchedule">
          {plan.map((s, i) => (
            <li key={i}>
              <span className="dkd-pay__pct dkd-num">{fmt.pct(s.pct)}</span>
              <span>{s.label}</span>
              <span className="dkd-num">{fmt.money(s.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>,
    textH + (plan ? 14 + plan.length * (lineH(tm.body) + 6) : 0),
  )
  return finish()
}

function planLabel(m: QuoteModel, step: PaymentPlanStep, index: number, count: number): string {
  if (step.label) return step.label
  return count > 1 ? m.kit.t('payment.step', { n: index + 1 }) : m.kit.t('payment.deposit')
}

function accountRows(m: QuoteModel, account: PaymentAccount): [string, string][] {
  const { t } = m.kit
  const rows: [string, string][] = [
    [t('payment.bank'), account.bank],
    [t('payment.accountType'), t(`payment.accountTypes.${account.type}`)],
    [t('payment.accountNumber'), account.number],
    [t('payment.holder'), account.holder],
    [t('payment.holderId'), account.rut],
    [t('payment.receiptEmail'), account.email],
    [t('payment.reference'), m.reference],
  ]
  return rows.filter(([, value]) => value.trim())
}

