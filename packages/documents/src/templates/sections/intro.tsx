/**
 * Secciones de apertura: carta (`letter`), datos del cliente (`client_strip`) y resumen del proyecto
 * (`project_summary`: datos, cifras destacadas, índice de aberturas o alcance).
 */
import type { ReactNode } from 'react'
import type { DocSectionOf } from '@dekopen/shared'
import { clsx } from '../../base/clsx'
import { itemsAndUnits, itemsLabel, type QuoteModel } from '../model'
import { DocText, ItemDrawing, Label, Ref, richOf, TextChunk } from '../parts'
import { chunkRichBlocks, lineCount, richTextHeight } from '../measure'
import { headingNode, lineH, sectionBlocks, textMetrics, type SectionRenderer } from './common'
import { itemTitle } from './item-parts'

// ── Datos del cliente ───────────────────────────────────────────────────────

type StripField = DocSectionOf<'client_strip'>['options']['fields'][number]

interface Fact {
  key: string
  label: string
  value: ReactNode
  text: string
  strong?: boolean
}

/** Alcance en una línea, armado solo con datos que existen: «4 ventanas de PVC, 5 unidades · Instalación». */
export function scopeLine(m: QuoteModel): string {
  const { t } = m.kit
  if (m.counted.length === 0) return ''
  const materials = new Set(m.counted.map((i) => i.line?.material).filter(Boolean))
  const windows = itemsLabel(m, m.counted)
  const material = materials.size === 1 ? t(materials.has('aluminum') ? 'summary.materialAluminum' : 'summary.materialPvc') : ''
  const head = itemsAndUnits(m, m.counted, material ? t('summary.windowsIn', { windows, material }) : windows)
  const services = m.data.extras.filter((e) => !e.hidden && m.included.has(e.id) && e.label && (e.amount !== 0 || e.line)).map((e) => e.label)
  return services.length ? `${head} · ${services.join(', ')}` : head
}

export function quoteFacts(m: QuoteModel, fields: readonly StripField[]): Fact[] {
  const { t, fmt } = m.kit
  const d = m.data
  const out: Fact[] = []
  for (const f of fields) {
    if (f === 'client' && d.client?.name) {
      const sub = d.client.rut ? t('doc.taxIdValue', { value: d.client.rut }) : ''
      out.push({ key: f, label: t('fields.client'), value: <><span className="dkd-strong">{d.client.name}</span>{sub ? <span className="dkd-muted">{sub}</span> : null}</>, text: `${d.client.name} ${sub}` })
    } else if (f === 'project' && m.title) {
      out.push({ key: f, label: t('fields.project'), value: m.canEdit('title') ? <DocText m={m} field="title" value={d.quote.title} as="span" inline placeholder={t('fields.project')} /> : m.title, text: m.title })
    } else if (f === 'site') {
      const site = d.quote.siteAddress?.trim() || [d.client?.address, d.client?.city].filter(Boolean).join(', ')
      if (site) out.push({ key: f, label: t('fields.site'), value: site, text: site })
    } else if (f === 'custom') {
      for (const c of m.customFields) out.push({ key: `custom-${c.id}`, label: c.label, value: c.value, text: c.value })
    } else if (f === 'reference') {
      out.push({ key: f, label: m.docTitle, value: <span className="dkd-code">{m.numberLabel}</span>, text: m.numberLabel })
    } else if (f === 'date' && d.quote.date) {
      const v = fmt.date(d.quote.date)
      out.push({ key: f, label: t('doc.issued'), value: <span className="dkd-num">{v}</span>, text: v })
    } else if (f === 'validity' && m.validUntil) {
      const v = fmt.date(m.validUntil)
      out.push({ key: f, label: t('doc.validUntil'), value: <span className="dkd-num">{v}</span>, text: v })
    } else if (f === 'adviser' && m.texts.signatureName) {
      out.push({ key: f, label: t('fields.adviser'), value: m.texts.signatureName, text: m.texts.signatureName })
    } else if (f === 'contact') {
      const c = [d.client?.phone, d.client?.email].filter(Boolean) as string[]
      if (c.length) out.push({ key: f, label: t('fields.contact'), value: c.map((line) => <span key={line}>{line}</span>), text: c.join(' · ') })
    } else if (f === 'units' && m.counted.length) {
      const v = itemsAndUnits(m, m.counted)
      out.push({ key: f, label: t('fields.windows'), value: v, text: v })
    }
  }
  return out
}

export const renderClientStrip: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'client_strip'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const facts = quoteFacts(m, o.fields)
  const scope = o.fields.includes('scope') ? scopeLine(m) : ''
  if (facts.length === 0 && !scope) return b.list
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const d = m.tokens.density
  if (section.title) {
    const head = headingNode(section, m, ctx)
    b.add('head', head.node, head.height, { keepWithNext: true })
  }
  // Franja y banda: todo en una fila; grilla: 3 columnas.
  const cols = o.variant === 'grid' ? 3 : Math.min(Math.max(1, facts.length), 6)
  // En fila, cada dato toma lo que necesita: un correo no se parte para dejar aire en otra columna.
  const tracks = o.variant === 'grid' ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(${cols}, auto)`
  const colW = (W - (o.variant === 'band' ? d.pad * 2 : 0)) / cols - 16
  const cell = (f: Fact) => lineH(tm.label) + 3 + Math.max(1, Math.min(3, lineCount(f.text, colW, f.strong ? tm.h3 : tm.body))) * lineH(f.strong ? tm.h3 : tm.body)
  let height = 0
  for (let i = 0; i < facts.length; i += cols) height += Math.max(...facts.slice(i, i + cols).map(cell)) + (o.variant === 'grid' ? 16 : 0)
  height += o.variant === 'band' ? d.pad * 2 : o.variant === 'strip' ? 24 : 2
  if (facts.length) {
    b.add(
      'facts',
      <div className={clsx('dkd-cs', `dkd-cs--${o.variant}`)} style={{ gridTemplateColumns: tracks }}>
        {facts.map((f) => (
          <div key={f.key} className={clsx('dkd-cs__cell', o.variant === 'grid' && f.key === 'contact' && 'dkd-cs__cell--wide')} data-dk-el={`field:${f.key.startsWith('custom-') ? 'custom' : f.key}`}>
            <Label>{f.label}</Label>
            <div className="dkd-cs__value">{f.value}</div>
          </div>
        ))}
      </div>,
      height,
    )
  }
  if (scope) {
    b.add(
      'scope',
      <p className="dkd-scopeline" data-dk-el="field:scope">
        <Label>{m.kit.t('summary.scope')}</Label>
        <span>{scope}</span>
      </p>,
      lineCount(scope, W, tm.body) * lineH(tm.body) + lineH(tm.label) + 3,
      { space: facts.length ? 10 : undefined },
    )
  }
  return b.list
}

// ── Carta ───────────────────────────────────────────────────────────────────

export const renderLetter: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'letter'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const { t, fmt } = m.kit
  const intro = m.texts.intro
  // La carta es opcional: sin texto no se imprime ni deja un saludo huérfano.
  if (!intro && !m.editable) return b.list
  const tm = textMetrics(m)
  const W = Math.min(m.page.contentWidth, 600)
  const formal = o.variant === 'letter'
  if (section.title) {
    const head = headingNode(section, m, ctx)
    b.add('head', head.node, head.height, { keepWithNext: true })
  }
  const lead = formal ? tm.body : { ...tm.body, size: tm.body.size * 1.12 }
  if (formal && o.showDate && m.data.quote.date) {
    b.add('open', <div className="dkd-letter__open" data-dk-el="showDate"><div className="dkd-letter__date dkd-num">{[m.data.org.city, fmt.date(m.data.quote.date, 'long')].filter(Boolean).join(', ')}</div></div>, lineH(tm.small) + 4)
  }
  if (!intro) {
    b.add('body', <div className={clsx('dkd-letter', 'dkd-guide', !formal && 'dkd-letter--note')}><DocText m={m} field="intro" value={intro} placeholder={t('letter.intro')} /></div>, lineH(lead) * 2 + 8, { space: formal ? 10 : undefined })
  } else {
    const chunks = chunkRichBlocks(richOf(intro).blocks, W, lead, m.page.bodyHeight * 0.45, m.placeholders)
    chunks.forEach((blocks, i) => {
      b.add(
        `p${i}`,
        <div className={clsx('dkd-letter', !formal && 'dkd-letter--note')}>
          <TextChunk chunks={chunks} index={i} values={m.placeholders} editable={m.canEdit('intro')} onChange={(v) => m.onEdit?.('intro', v)} field="intro" />
        </div>,
        richTextHeight({ blocks }, W, lead, m.placeholders) + 4,
        { space: i === 0 && formal ? 10 : undefined },
      )
    })
  }
  if (o.showSignature && (m.texts.signatureName || m.editable)) {
    b.add(
      'sign',
      <div className="dkd-letter__sign" data-dk-el="showSignature">
        <DocText m={m} field="signatureName" value={m.texts.signatureName} as="span" inline placeholder={t('fields.adviser')} className="dkd-letter__name" />
        <span className="dkd-muted">{m.data.org.name}</span>
      </div>,
      lineH(tm.body) + lineH(tm.small) + 6,
      { space: 14 },
    )
  }
  return b.list
}

// ── Resumen del proyecto ────────────────────────────────────────────────────

/** Con una sola ventana, su índice o su resumen repiten lo que dice la hoja siguiente. */
export function summaryOmitted(variant: DocSectionOf<'project_summary'>['options']['variant'], m: QuoteModel): boolean {
  return m.items.length === 1 && (variant === 'index' || variant === 'facts')
}

export const renderProjectSummary: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'project_summary'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const { t, fmt } = m.kit
  const d = m.data
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const dens = m.tokens.density
  const windows = itemsLabel(m, m.counted)
  const units = t('summary.unitsCount', { count: m.units })
  if (m.items.length === 0 && o.variant !== 'scope') return b.list
  if (summaryOmitted(o.variant, m)) return b.list

  const figures: Fact[] = []
  if (o.showUnits) figures.push({ key: 'units', label: t('fields.windows'), value: m.units !== m.counted.length ? t('summary.windowsAndUnits', { windows, units }) : windows, text: windows })
  if (o.showArea && d.totals.area > 0) figures.push({ key: 'area', label: t('fields.area'), value: <span className="dkd-num">{fmt.area(d.totals.area)}</span>, text: fmt.area(d.totals.area) })
  if (o.showValidity && m.validUntil) figures.push({ key: 'validity', label: t('doc.validUntil'), value: <span className="dkd-num">{fmt.date(m.validUntil)}</span>, text: fmt.date(m.validUntil) })
  const leadTime = o.showLeadTime && m.texts.leadTimeText ? m.texts.leadTimeText : ''

  const head = headingNode(section, m, ctx, { fallback: o.variant === 'index' ? t('summary.index') : o.variant === 'scope' ? t('summary.scope') : undefined })
  b.add('head', head.node, head.height, { keepWithNext: true })

  if (o.variant === 'key_figures') {
    const cols = Math.max(1, Math.min(4, figures.length))
    b.add(
      'figs',
      <dl className="dkd-figs" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {figures.map((f) => (
          <div key={f.key} className={clsx('dkd-figs__cell', f.strong && 'dkd-figs__cell--strong')}>
            <dt className="dkd-label">{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>,
      lineH(tm.label) + lineH(tm.h1) * (figures.some((f) => f.text.length > 18) ? 1.6 : 1) + 22,
    )
    if (leadTime) b.add('lead', <p className="dkd-lead-time"><Label>{t('fields.leadTime')}</Label> <span>{leadTime}</span></p>, lineCount(leadTime, W - 80, tm.body) * lineH(tm.body) + 4)
    return b.list
  }

  if (o.variant === 'facts') {
    const rows = [...figures, ...(leadTime ? [{ key: 'lead', label: t('fields.leadTime'), value: leadTime, text: leadTime }] : [])]
    const cols = 2
    const colW = W / cols - 20
    let h = 0
    for (let i = 0; i < rows.length; i += cols) h += Math.max(...rows.slice(i, i + cols).map((r) => lineH(tm.label) + Math.max(1, lineCount(r.text, colW, r.strong ? tm.h3 : tm.body)) * lineH(r.strong ? tm.h3 : tm.body) + 12))
    b.add(
      'facts',
      <dl className="dkd-facts dkd-facts--c2">
        {rows.map((r) => (
          <div key={r.key} className={clsx('dkd-fact', r.strong && 'dkd-fact--strong')}>
            <dt className="dkd-label">{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>,
      h,
    )
    return b.list
  }

  if (o.variant === 'scope') {
    const visibleExtras = d.extras.filter((e) => !e.hidden && e.amount !== 0).map((e) => e.label)
    const lines = [t('summary.allItems') + (m.items.length ? ` (${windows}, ${units})` : ''), ...(visibleExtras.length ? [t('summary.services', { list: visibleExtras.join(', ') })] : [])]
    const factsH = figures.length ? lineH(tm.label) + lineH(tm.h3) + 18 : 0
    b.add(
      'scope',
      <div className="dkd-scope">
        <Label>{t('summary.includes')}</Label>
        <ul className="dkd-checks">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {leadTime ? <li>{leadTime}</li> : null}
        </ul>
        {figures.length ? (
          <dl className="dkd-facts dkd-facts--row" style={{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}>
            {figures.map((f) => (
              <div key={f.key} className={clsx('dkd-fact', f.strong && 'dkd-fact--strong')}>
                <dt className="dkd-label">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>,
      lineH(tm.label) + 6 + [...lines, leadTime].filter(Boolean).reduce((a, l) => a + lineCount(l, W - 24, tm.body) * lineH(tm.body) + 4, 0) + factsH + 8,
    )
    return b.list
  }

  // Índice de aberturas: código, miniatura, nombre, recinto y medida; agrupado si corresponde.
  const byRef = new Map(m.items.map((it) => [it.ref, it]))
  const groups = o.showGroups && m.groups.length > 1 ? m.groups : [{ key: 'all', label: '', refs: m.items.map((i) => i.ref), subtotal: 0, units: m.units }]
  const thumbs = m.tokens.composition.id === 'memoria'
  const rowH = Math.max(thumbs ? 30 : 0, lineH(tm.body) + lineH(tm.small)) + dens.row
  for (const g of groups) {
    if (groups.length > 1) {
      b.add(
        `g-${g.key}`,
        <div className="dkd-index__group">
          <span>{g.label || t('summary.noRoom')}</span>
          <span className="dkd-muted">{t('items.groupCount', { count: g.refs.length })}</span>
        </div>,
        lineH(tm.body) + 12,
        { keepWithNext: true, space: dens.gap },
      )
    }
    for (const ref of g.refs) {
      const item = byRef.get(ref)
      if (!item) continue
      b.add(
        `r-${ref}`,
        <div className="dkd-index">
          <Ref value={item.ref} />
          {thumbs ? (
            <span className="dkd-index__thumb">
              <ItemDrawing m={m} item={item} width={44} height={26} dimensions="none" />
            </span>
          ) : null}
          <span className="dkd-index__name">
            <span>{itemTitle(m, item)}</span>
            {item.location && groups.length === 1 ? <span className="dkd-muted">{item.location}</span> : null}
          </span>
          <span className="dkd-dim dkd-right">{fmt.size(item.width, item.height)}</span>
          <span className="dkd-num dkd-right dkd-index__qty">× {fmt.number(item.qty)}</span>
        </div>,
        rowH,
        { space: 0 },
      )
    }
  }
  if (figures.length) {
    b.add(
      'figs',
      <dl className="dkd-facts dkd-facts--row dkd-facts--foot" style={{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }}>
        {figures.map((f) => (
          <div key={f.key} className={clsx('dkd-fact', f.strong && 'dkd-fact--strong')}>
            <dt className="dkd-label">{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>,
      lineH(tm.label) + lineH(tm.h3) + 22,
    )
  }
  if (leadTime) b.add('lead', <p className="dkd-lead-time"><Label>{t('fields.leadTime')}</Label> <span>{leadTime}</span></p>, lineCount(leadTime, W - 80, tm.body) * lineH(tm.body) + 4)
  return b.list
}
