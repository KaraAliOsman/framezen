/**
 * Especificaciones y terminaciones: planilla técnica (`schedule`), matriz por configuración
 * (`matrix`), capas del vidrio (`glass_layers`) y tablero de terminaciones (`swatches`,
 * `material_board`). Solo datos verificados del catálogo (sistema, profundidad, cámaras, vidrio,
 * herrajes): nunca valores de desempeño inventados. `options_comparison` no imprime nada mientras la
 * cotización no traiga alternativas reales (no se fabrican opciones señuelo).
 */
import { glassKindName, type DocSectionOf } from '@dekopen/shared'
import { clsx } from '../../base/clsx'
import type { QuoteDocColor, QuoteDocGlass, QuoteDocItemV5 } from '../../data/quote'
import { accessoriesIn } from '../../i18n'
import { itemUnits, type QuoteModel } from '../model'
import { Ghost, Label, Swatch } from '../parts'
import { lineCount } from '../measure'
import { headingNode, lineH, sectionBlocks, textMetrics, type SectionRenderer } from './common'
import { itemColors, itemGlasses, itemLineName, itemTitle } from './item-parts'

// ── Vidrio en capas ─────────────────────────────────────────────────────────

export interface GlassLayer {
  kind: 'pane' | 'cavity' | 'interlayer'
  mm?: number
}

/** Capas de un vidrio desde su nombre o composición («DVH 4+12+4», «4 incoloro + 12 cámara + 4», «Laminado 3+3»). */
export function glassLayers(glass: QuoteDocGlass): GlassLayer[] {
  const num = (s: string) => Number(s.replace(',', '.'))
  const laminated = glass.kind === 'laminated' || /lamin/i.test(glass.name)
  if (laminated) {
    const lam = /(\d{1,2})\s*\+\s*(\d{1,2})(?!\s*[+\d])/.exec(glass.name)
    return lam ? [{ kind: 'pane', mm: num(lam[1]) }, { kind: 'interlayer' }, { kind: 'pane', mm: num(lam[2]) }] : [{ kind: 'pane' }, { kind: 'interlayer' }, { kind: 'pane' }]
  }
  const triple = /(\d{1,2}(?:[.,]\d)?)\s*[-–+x×]\s*(\d{1,2})\s*[-–+x×]\s*(\d{1,2}(?:[.,]\d)?)(?:\s*[-–+x×]\s*(\d{1,2})\s*[-–+x×]\s*(\d{1,2}(?:[.,]\d)?))?/
  const insulated = glass.kind === 'dvh' || /c[aá]mara|cavity|dvh|termopanel|insul|ısıcam|isolier|vetrocamera|vitrage/i.test(`${glass.name} ${glass.composition ?? ''}`)
  const fromName = insulated ? triple.exec(glass.name) : null
  if (fromName) {
    const layers: GlassLayer[] = [{ kind: 'pane', mm: num(fromName[1]) }, { kind: 'cavity', mm: num(fromName[2]) }, { kind: 'pane', mm: num(fromName[3]) }]
    if (fromName[4] && fromName[5]) layers.push({ kind: 'cavity', mm: num(fromName[4]) }, { kind: 'pane', mm: num(fromName[5]) })
    return layers
  }
  const comp = glass.composition?.match(/\d{1,2}(?:[.,]\d+)?/g)
  if (insulated && comp && comp.length >= 3 && comp.length % 2 === 1) return comp.map((n, i) => ({ kind: i % 2 ? 'cavity' : 'pane', mm: num(n) }))
  if (insulated) return [{ kind: 'pane' }, { kind: 'cavity' }, { kind: 'pane' }]
  return [{ kind: 'pane', ...(glass.thickness ? { mm: glass.thickness } : {}) }]
}

function LayerDiagram({ layers, labels }: { layers: GlassLayer[]; labels: { outside: string; inside: string } }) {
  const scale = (l: GlassLayer) => (l.kind === 'pane' ? Math.max(5, (l.mm ?? 4) * 2.2) : l.kind === 'interlayer' ? 2.5 : Math.max(14, (l.mm ?? 12) * 2.2))
  const total = layers.reduce((a, l) => a + scale(l), 0)
  let x = 22
  const w = total + 44
  return (
    <svg className="dkd-layers__svg" width={w} height={96} viewBox={`0 0 ${w} 96`} aria-hidden="true">
      <text x={2} y={92} className="dkd-layers__side">{labels.outside}</text>
      <text x={w - 2} y={92} textAnchor="end" className="dkd-layers__side">{labels.inside}</text>
      {layers.map((l, i) => {
        const lw = scale(l)
        const el =
          l.kind === 'pane' ? (
            <rect key={i} x={x} y={6} width={lw} height={70} rx={0.8} className="dkd-layers__pane" />
          ) : l.kind === 'interlayer' ? (
            <rect key={i} x={x} y={6} width={lw} height={70} className="dkd-layers__inter" />
          ) : (
            <g key={i}>
              <rect x={x} y={6} width={lw} height={70} className="dkd-layers__cavity" />
              <rect x={x} y={68} width={lw} height={8} className="dkd-layers__spacer" />
            </g>
          )
        x += lw
        return el
      })}
    </svg>
  )
}

function distinctGlasses(m: QuoteModel): { glass: QuoteDocGlass; refs: string[] }[] {
  const map = new Map<string, { glass: QuoteDocGlass; refs: string[] }>()
  for (const item of m.items) {
    for (const g of itemGlasses(m, item)) {
      const hit = map.get(g.id) ?? { glass: g, refs: [] }
      if (!hit.refs.includes(item.ref)) hit.refs.push(item.ref)
      map.set(g.id, hit)
    }
  }
  return [...map.values()]
}

function layerText(m: QuoteModel, layers: GlassLayer[]): string {
  const { t, fmt } = m.kit
  return layers
    .map((l) => (l.kind === 'pane' ? `${l.mm ? `${fmt.number(l.mm, { maxDecimals: 1 })} mm ` : ''}${t('specs.pane').toLocaleLowerCase(m.kit.lang)}` : l.kind === 'cavity' ? `${l.mm ? `${fmt.number(l.mm)} mm ` : ''}${t('specs.cavity').toLocaleLowerCase(m.kit.lang)}` : t('specs.interlayer').toLocaleLowerCase(m.kit.lang)))
    .join(' + ')
}

// ── Sección técnica ─────────────────────────────────────────────────────────

function systemText(m: QuoteModel, item: QuoteDocItemV5): string {
  const { t, fmt } = m.kit
  const name = itemLineName(item)
  const extra = [item.line?.depth ? t('items.depth', { mm: fmt.number(item.line.depth) }) : '', item.line?.chambers ? t('items.chambers', { count: item.line.chambers }) : ''].filter(Boolean)
  return [name, ...extra].filter(Boolean).join(' · ')
}

export const renderTechnicalSpecs: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'technical_specs'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  if (m.items.length === 0) return b.list
  const { t } = m.kit
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const head = headingNode(section, m, ctx)
  b.add('head', head.node, head.height, { keepWithNext: true })
  const sources = o.showSources ? <p className="dkd-sources" data-dk-el="showSources">{t('specs.sources')}</p> : null
  const sourcesH = o.showSources ? lineCount(t('specs.sources'), W, tm.small) * lineH(tm.small) + 10 : 0

  if (o.variant === 'glass_layers') {
    const glasses = distinctGlasses(m)
    glasses.forEach(({ glass, refs }, i) => {
      const layers = glassLayers(glass)
      const facts = [
        glassKindName(glass.kind, m.kit.locale),
        o.showGlassBuildup ? layerText(m, layers) : '',
        glass.thickness ? `${t('specs.thickness')}: ${m.kit.fmt.number(glass.thickness, { maxDecimals: 1 })} mm` : '',
      ].filter(Boolean)
      b.add(
        `g-${glass.id}`,
        <div className={clsx('dkd-layers', o.showGlassImage === false && 'dkd-layers--plain')}>
          {o.showGlassImage === false ? null : <span data-dk-el="showGlassImage"><LayerDiagram layers={layers} labels={{ outside: t('specs.outside'), inside: t('specs.inside') }} /></span>}
          <div className="dkd-layers__text">
            <h3 className="dkd-layers__name">{glass.name}</h3>
            <ul className="dkd-layers__facts">
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="dkd-muted dkd-small">
              {t('specs.usedIn')} {refs.join(', ')}
            </p>
          </div>
        </div>,
        Math.max(o.showGlassImage === false ? 0 : 104, lineH(tm.h3) + facts.length * (lineH(tm.body) + 2) + lineH(tm.small) + 16),
        { space: i === 0 ? undefined : m.tokens.density.gap },
      )
    })
    if (o.showHardware) {
      const hw = [...new Set(m.items.flatMap((i) => i.hardware ?? []))].slice(0, 12)
      if (hw.length) b.add('hw', <p className="dkd-hwline" data-dk-el="showHardware"><Label>{t('specs.hardware')}</Label> {hw.join(' · ')}</p>, lineCount(hw.join(' · '), W - 90, tm.body) * lineH(tm.body) + 6)
    }
    if (sources) b.add('src', sources, sourcesH)
    return b.list
  }

  if (o.variant === 'matrix') {
    type Row = { key: string; system: string; glass: string; buildup: string; refs: string[]; units: number; acc: string }
    const rows = new Map<string, Row>()
    for (const item of m.items) {
      const glasses = itemGlasses(m, item)
      const key = `${item.line?.id ?? item.lineName}|${glasses.map((g) => g.id).join('+')}`
      const row = rows.get(key) ?? {
        key,
        system: systemText(m, item),
        glass: glasses.map((g) => g.name).join(' + '),
        buildup: o.showGlassBuildup && glasses[0] ? layerText(m, glassLayers(glasses[0])) : '',
        refs: [],
        units: 0,
        acc: '',
      }
      row.refs.push(item.ref)
      row.units += itemUnits(item)
      const acc = accessoriesIn(item.extras ?? item.design?.extras, m.kit.locale)
      if (acc.length && !row.acc) row.acc = acc.join(' · ')
      rows.set(key, row)
    }
    const group = `${section.id}-mx`
    const cols = 'minmax(0,1.3fr) minmax(0,1.4fr) minmax(0,1fr) 64px'
    b.add(
      'thead',
      <div className="dkd-mx dkd-mx--head" style={{ gridTemplateColumns: cols }}>
        <span className="dkd-label">{t('specs.system')}</span>
        <span className="dkd-label">{t('specs.glass')}</span>
        <span className="dkd-label">{t('specs.usedIn')}</span>
        <span className="dkd-label dkd-right">{t('fields.units')}</span>
      </div>,
      lineH(tm.label) + 12,
      { group, thead: true, keepWithNext: true, space: 8 },
    )
    for (const r of rows.values()) {
      const textH = Math.max(lineCount(r.system, W * 0.3, tm.body), lineCount(`${r.glass} ${r.buildup}`, W * 0.32, tm.body), lineCount(r.refs.join(', '), W * 0.22, tm.body)) * lineH(tm.body) + (r.acc ? lineH(tm.small) : 0)
      b.add(
        `r-${r.key}`,
        <div className="dkd-mx" style={{ gridTemplateColumns: cols }}>
          <span>{r.system || '—'}{r.acc ? <span className="dkd-mx__sub">{r.acc}</span> : null}</span>
          <span>{r.glass || '—'}{r.buildup ? <span className="dkd-mx__sub">{r.buildup}</span> : null}</span>
          <span className="dkd-code">{r.refs.join(', ')}</span>
          <span className="dkd-num dkd-right">{m.kit.fmt.number(r.units)}</span>
        </div>,
        textH + m.tokens.density.row * 2 + 2,
        { group, space: 0 },
      )
    }
    if (sources) b.add('src', sources, sourcesH)
    return b.list
  }

  // Planilla por abertura.
  const group = `${section.id}-sch`
  const showHw = o.showHardware
  const cols = showHw ? '52px minmax(0,1.15fr) minmax(0,1.2fr) minmax(0,1.25fr)' : '52px minmax(0,1.3fr) minmax(0,1.5fr) minmax(0,1fr)'
  b.add(
    'thead',
    <div className="dkd-mx dkd-mx--head" style={{ gridTemplateColumns: cols }}>
      <span className="dkd-label">{t('items.colItem')}</span>
      <span className="dkd-label">{t('specs.system')}</span>
      <span className="dkd-label">{t('specs.glass')}</span>
      <span className="dkd-label">{showHw ? t('specs.hardware') : t('specs.accessories')}</span>
    </div>,
    lineH(tm.label) + 12,
    { group, thead: true, keepWithNext: true, space: 8 },
  )
  for (const item of m.items) {
    const glasses = itemGlasses(m, item)
    const sys = systemText(m, item)
    const glass = glasses.map((g) => g.name).join(' + ')
    const buildup = o.showGlassBuildup && glasses[0] ? layerText(m, glassLayers(glasses[0])) : ''
    const acc = accessoriesIn(item.extras ?? item.design?.extras, m.kit.locale).join(' · ')
    const last = showHw ? [(item.hardware ?? []).slice(0, 5).join(' · '), acc].filter(Boolean).join(' · ') : acc
    const colW = (W - 52) / 3 - 12
    const textH = Math.max(lineCount(sys, colW, tm.body), lineCount(`${glass} ${buildup}`, colW, tm.body) + (buildup ? 0.6 : 0), lineCount(last, colW, tm.small) * 0.9) * lineH(tm.body)
    b.add(
      `r-${item.ref}`,
      <div className="dkd-mx" style={{ gridTemplateColumns: cols }}>
        <span className="dkd-code dkd-strong">{item.ref}</span>
        <span>{sys || '—'}</span>
        <span>
          {glass || '—'}
          {buildup ? <span className="dkd-mx__sub">{buildup}</span> : null}
        </span>
        <span className="dkd-small">{last || '—'}</span>
      </div>,
      textH + m.tokens.density.row * 2 + 2,
      { group, space: 0 },
    )
  }
  if (sources) b.add('src', sources, sourcesH)
  return b.list
}

// ── Terminaciones ───────────────────────────────────────────────────────────

interface FinishUse {
  color: QuoteDocColor
  sides: Set<'out' | 'in'>
  refs: string[]
}

function finishesOf(m: QuoteModel): FinishUse[] {
  const map = new Map<string, FinishUse>()
  for (const item of m.items) {
    const c = itemColors(m, item)
    for (const [side, color] of [['out', c.out], ['in', c.in]] as const) {
      if (!color) continue
      const hit = map.get(color.id) ?? { color, sides: new Set(), refs: [] }
      hit.sides.add(side)
      if (!hit.refs.includes(item.ref)) hit.refs.push(item.ref)
      map.set(color.id, hit)
    }
  }
  return [...map.values()]
}

export const renderFinishesBoard: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'finishes_board'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const finishes = finishesOf(m)
  if (finishes.length === 0) return b.list
  const { t } = m.kit
  const tm = textMetrics(m)
  const W = m.page.contentWidth
  const head = headingNode(section, m, ctx)
  b.add('head', head.node, head.height, { keepWithNext: true })
  const board = o.variant === 'material_board'
  const sw = board ? (o.swatchSize === 'l' ? 150 : o.swatchSize === 'm' ? 120 : 90) : o.swatchSize === 'l' ? 64 : o.swatchSize === 'm' ? 44 : 30
  const cols = board ? Math.max(2, Math.min(4, Math.floor((W + 20) / (sw + 40)))) : 2
  const cellH = board ? sw + lineH(tm.h3) + lineH(tm.small) * 2 + 18 : Math.max(sw, lineH(tm.body) + lineH(tm.small) * 2) + 14
  const sideText = (f: FinishUse) => (o.insideOutside ? [...f.sides].map((s) => (s === 'out' ? t('finishes.outside') : t('finishes.inside'))).join(' · ') : '')
  for (let i = 0; i < finishes.length; i += cols) {
    const row = finishes.slice(i, i + cols)
    b.add(
      `r${i}`,
      <div className={clsx('dkd-fin', board ? 'dkd-fin--board' : 'dkd-fin--list')} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {row.map((f) => (
          <figure key={f.color.id} className="dkd-fin__cell">
            <Swatch color={f.color} size={sw} m={m} className="dkd-fin__swatch" />
            <figcaption>
              <span className="dkd-fin__name">{f.color.name}</span>
              {o.showCodes && f.color.code ? <span className="dkd-fin__code" data-dk-el="showCodes">{t('finishes.code', { code: f.color.code })}</span> : null}
              <span className="dkd-fin__use">{[sideText(f), t('finishes.usedIn', { refs: f.refs.join(', ') })].filter(Boolean).join(' · ')}</span>
            </figcaption>
          </figure>
        ))}
      </div>,
      cellH,
      { space: i === 0 ? undefined : 14 },
    )
  }
  b.add('disclaimer', <p className="dkd-sources">{t('finishes.disclaimer')}</p>, lineCount(t('finishes.disclaimer'), W, tm.small) * lineH(tm.small) + 6)
  return b.list
}

interface ChoiceRow {
  key: string
  label: string
  detail: string
  /** Neto de la línea. */
  net: number
  included: boolean
  /** Sin precio: nunca se compara como si valiera $0. */
  pending?: boolean
}

/**
 * Opcionales y alternativas de la cotización, con lo que cada uno sumaría o restaría al neto. Lo que no
 * cuenta nunca se suma al total; sin opciones reales no se imprime nada (no se fabrican señuelos).
 */
export const renderOptionsComparison: SectionRenderer = (raw, m, ctx) => {
  const section = raw as DocSectionOf<'options_comparison'>
  const o = section.options
  const b = sectionBlocks(section, m, ctx)
  const { t, fmt } = m.kit
  const tm = textMetrics(m)
  const row = (item: QuoteDocItemV5): ChoiceRow => ({
    key: item.ref,
    label: `${item.ref ? `${item.ref} · ` : ''}${itemTitle(m, item)}`,
    detail: [fmt.size(item.width, item.height), item.qty > 1 ? t('summary.unitsCount', { count: item.qty }) : '', itemLineName(item)].filter(Boolean).join(' · '),
    net: item.total,
    included: item.included !== false,
    ...(item.pending === 'all' ? { pending: true } : {}),
  })
  const optional: ChoiceRow[] = m.items.filter((i) => i.role === 'optional').map(row)
  const extras = m.data.extras.filter((e) => e.role && e.role !== 'base')
  for (const e of extras.filter((x) => x.role === 'optional')) optional.push({ key: e.id, label: e.label, detail: e.description ?? '', net: e.amount, included: m.included.has(e.id) })
  const groups = new Map<string, ChoiceRow[]>()
  const push = (group: string, r: ChoiceRow) => groups.set(group, [...(groups.get(group) ?? []), r])
  for (const i of m.items) if (i.role === 'alternative') push(i.altGroup ?? i.ref, row(i))
  for (const e of extras) if (e.role === 'alternative') push(e.altGroup ?? e.id, { key: e.id, label: e.label, detail: e.description ?? '', net: e.amount, included: m.included.has(e.id) })
  if (optional.length === 0 && groups.size === 0) {
    if (m.ghost) {
      const head = headingNode(section, m, ctx, { fallback: t('choices.title') })
      b.add('head', head.node, head.height, { keepWithNext: true })
      b.add('ghost', <Ghost>{t('ghost.options')}</Ghost>, lineH(tm.body))
    }
    return b.list
  }

  const money = (r: ChoiceRow, base: number | null) => {
    if (r.pending) return t('pending.value')
    // La elegida dice su valor: «mismo valor» no significa nada frente a sí misma.
    if (base === null || !o.showDifferencesOnly || r.included) return fmt.money(r.net)
    const delta = r.net - base
    return delta === 0 ? t('choices.sameValue') : `${delta > 0 ? '+' : '−'}${fmt.money(Math.abs(delta))}`
  }
  const rowH = lineH(tm.body) + lineH(tm.small) + 10
  const line = (r: ChoiceRow, base: number | null) => (
    <div key={r.key} className={clsx('dkd-opt', r.included && o.highlightSelected && 'dkd-opt--on')} role="row">
      <span className="dkd-opt__mark" aria-hidden="true" />
      <div className="dkd-opt__text">
        <span>{r.label}</span>
        {r.detail ? <span className="dkd-opt__detail">{r.detail}</span> : null}
      </div>
      <span className="dkd-opt__state">{r.included ? t('choices.included') : t('choices.notIncluded')}</span>
      <span className="dkd-opt__price dkd-num">{money(r, base)}</span>
    </div>
  )
  const head = headingNode(section, m, ctx, { fallback: t('choices.title') })
  b.add('head', head.node, head.height, { keepWithNext: true })
  if (optional.length) {
    b.add('opt-title', <h3 className="dkd-lines__title">{t('choices.optionals')}</h3>, lineH(tm.h3) + 4, { keepWithNext: true })
    optional.forEach((r, i) => b.add(`o-${r.key}`, line(r, null), rowH, { space: 0, ...(i === 0 ? { keepWithNext: true } : {}) }))
  }
  let g = 0
  for (const [name, rows] of groups) {
    const included = rows.find((r) => r.included) ?? rows[0]
    // Sin precio en la elegida no hay contra qué restar: cada alternativa dice su valor.
    const chosen = included.pending ? null : included
    b.add(`alt-title-${g}`, <h3 className="dkd-lines__title">{t('choices.alternativeOf', { group: name })}</h3>, lineH(tm.h3) + 4, { keepWithNext: true })
    rows.slice(0, Math.max(o.maxOptions, rows.findIndex((r) => r.included) + 1)).forEach((r, i) => b.add(`a-${g}-${r.key}`, line(r, chosen ? chosen.net : null), rowH, { space: 0, ...(i === 0 ? { keepWithNext: true } : {}) }))
    g++
  }
  b.add('opt-note', <p className="dkd-colornote">{t('choices.note')}</p>, lineH(tm.small) + 6, { space: 8 })
  return b.list
}
