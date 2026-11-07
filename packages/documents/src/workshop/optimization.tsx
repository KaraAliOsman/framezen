import { useId } from 'react'
import type { Bar, OptimizationGroup, Warning } from '@dekopen/engine'
import { auditCutPlan, barGeometry, barPieceIds, barPieceRows, groupSaw, groupWeld, isSpecialBar, kerfAlongBar, unbackedLines, type BarPieceId, type BarPieceRow, type CutIssue } from './bars'
import { AngleText, Box, CutShape, DocHeader, DocRoot, Sheet, UnbackedNote, WarningsCallout } from './common'
import { colorInfo, otLabel, quoteTitle, uniqueFooter, partsKicker } from './helpers'
import { resolveWorkshopLocale, type WorkshopI18n } from './locale'
import { filterCutParts, type CutPartKind } from './parts'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

// Unidades del SVG de barra: milímetros de papel (ancho útil ≈ 190 mm en Carta).
const VW = 190
const BAR_TOP = 0.6
const BAR_H = 12.5
const CAPTION_Y = 17.2
const VH = 18.2
const INK = '#1D2426'
const MUTED = '#4A5457'
const HATCH = '#6C767A'

/** Ancho aproximado de un texto en unidades del SVG (cifras tabulares ≈ 0,56 em). */
function textWidth(text: string, size: number): number {
  let em = 0
  for (const ch of text) {
    if (/[0-9]/.test(ch)) em += 0.56
    else if (/[.,·:'\s]/.test(ch)) em += 0.28
    else if (/[A-ZÁÉÍÓÚÑÇÖÜĞİŞ]/.test(ch)) em += 0.66
    else em += 0.52
  }
  return em * size
}

export interface CutOptimizationDocumentProps extends WorkshopDocumentProps {
  /** Mostrar la tabla «Sacar de bodega» al inicio (por defecto sí). */
  summary?: boolean
  /**
   * Barras a dibujar como máximo (las primeras, en orden de perfil), para la vista previa en
   * pantalla: con cientos de unidades son miles de barras. Los totales, la tabla «Sacar de
   * bodega» y la cabecera de cada perfil siguen completos. Sin límite, todas.
   */
  maxBars?: number
  /** Solo estos tipos de pieza (todos si falta). */
  parts?: readonly CutPartKind[]
}

/** Barras a dibujar de cada perfil con un tope total (todas si no hay tope). */
function barsPerGroup(groups: readonly OptimizationGroup[], maxBars: number | undefined): number[] {
  let left = maxBars === undefined ? Infinity : Math.max(0, Math.floor(maxBars))
  return groups.map((g) => {
    const n = Math.min(g.bars.length, left)
    left -= n
    return n
  })
}

export function planWarnings(data: Pick<WorkshopDocumentData, 'optimization'>): Warning[] {
  return (data.optimization as { warnings?: Warning[] }).warnings ?? []
}

/**
 * Optimización de cortes para la sierra: lo que usa el plan (barra, disco, despuntes) arriba; cuánto
 * sacar de bodega; y cada barra a escala con sus piezas y, bajo ella, una a una, con casilla, medida,
 * ángulos y el código de pieza de la OT. Pensada para láser blanco y negro: nada depende del color.
 */
export function CutOptimizationDocument({ data: full, paper, summary = true, maxBars, parts, locale, currency, taxLabel }: CutOptimizationDocumentProps) {
  const data = filterCutParts(full, parts)
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const opt = data.optimization
  const footer = uniqueFooter(t('cuts.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const offcutTotal = opt.offcuts.reduce((s, o) => s + o.length, 0)
  const shown = barsPerGroup(opt.groups, maxBars)
  const ids = barPieceIds(data)
  const warnings = planWarnings(data)
  // La auditoría mira el plan completo: lo filtrado no falta, solo no se está mostrando.
  const issues = auditCutPlan(full)

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="cuts" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={partsKicker(t('cuts.kicker'), parts, w)} w={w} />

        <SawStrip data={data} w={w} />

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>{t('cuts.barsOut')}</span>
            <strong>{w.f.int(opt.totalBars)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>{t('cuts.piecesToCut')}</span>
            <strong>{w.f.int(opt.totalPieces)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>{t('cuts.yield')}</span>
            <strong>{w.f.pct(opt.yieldPct)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>{t('cuts.offcutsKeep')}</span>
            <strong>{w.f.int(opt.offcuts.length)}</strong>
            <em>{opt.offcuts.length > 0 ? t('cuts.offcutsTotal', { mm: w.f.mm(offcutTotal) }) : t('cuts.offcutsNone')}</em>
          </div>
        </div>

        <CutWarnings warnings={warnings} issues={issues} w={w} />
        <UnbackedNote lines={unbackedLines(data.catalog, data.windows)} w={w} />

        {summary ? <SummaryTable data={data} w={w} /> : null}

        {opt.groups.map((group, i) =>
          maxBars === undefined || (shown[i] ?? 0) > 0 ? <GroupBlock key={group.key} group={group} ids={ids.get(group.key)} data={data} limit={shown[i] ?? 0} w={w} /> : null,
        )}
        {opt.groups.length === 0 ? <p className="fzw-muted">{t('cuts.empty')}</p> : null}

        {maxBars === undefined ? <OffcutsTable data={data} w={w} /> : null}
      </Sheet>
    </DocRoot>
  )
}

/** Avisos del optimizador y de la auditoría: la barra imposible se dice antes de cortar. */
export function CutWarnings({ warnings, issues, w }: { warnings: Warning[]; issues: CutIssue[]; w: WorkshopI18n }) {
  // La barra especial ya la explica el aviso del optimizador (trae la medida que necesita).
  const own = issues.filter((i) => i.code !== 'special_bar' || warnings.length === 0)
  if (warnings.length === 0 && own.length === 0) return null
  return (
    <>
      <WarningsCallout warnings={warnings} title={w.t('cuts.reviewTitle')} w={w} />
      {own.length > 0 ? (
        <div className="fzw-callout fzw-callout-bad" role="note">
          <div className="fzw-callout-title">{w.t('cuts.reviewTitle')}</div>
          <ul>
            {own.slice(0, 12).map((issue, i) => (
              <li key={`${issue.code}-${i}`}>{cutIssueText(issue, w)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

/** Un problema del plan en lenguaje de taller. */
export function cutIssueText(issue: CutIssue, w: WorkshopI18n): string {
  return w.t(`cuts.issue.${issue.code}`, {
    profile: issue.profile,
    bar: issue.bar ?? 0,
    label: issue.label ?? '',
    length: w.f.mm(issue.length ?? 0),
    short: w.f.mm(issue.short ?? 0),
  })
}

/** Encabezado de sierra: los valores con que se calculó todo el plan, en grande. */
function SawStrip({ data, w }: { data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  const cut = data.cut
  const groups = data.optimization.groups
  const saws = groups.map((g) => groupSaw(g, cut))
  const same = (read: (s: (typeof saws)[number]) => number, fallback: number) => {
    const values = new Set(saws.map(read))
    if (values.size > 1) return null
    return saws.length ? read(saws[0]!) : fallback
  }
  const warnings = planWarnings(data)
  const bars = new Set(groups.flatMap((g) => g.bars.filter((b) => !b.fromOffcut && !isSpecialBar(b, warnings)).map((b) => b.barLength)))
  const kerf = same((s) => s.kerf, cut.kerf)
  const start = same((s) => s.trimStart, cut.trimStart)
  const end = same((s) => s.trimEnd, cut.trimEnd)
  const value = (n: number | null) => (n === null ? t('cuts.saw.varies') : `${w.f.mm(n)} mm`)
  const mitred = groups.some((g) => g.bars.some((b) => b.cuts.some((c) => Math.abs((c.angleEnd ?? 90) - 45) < 0.05)))
  return (
    <>
      <dl className="fzw-saw">
        <div>
          <dt>{t('cuts.saw.bar')}</dt>
          <dd>{bars.size > 1 ? t('cuts.saw.varies') : `${w.f.mm(bars.values().next().value ?? cut.barLength)} mm`}</dd>
        </div>
        <div>
          <dt>{t('cuts.saw.kerf')}</dt>
          <dd>{value(kerf)}</dd>
        </div>
        <div>
          <dt>{t('cuts.saw.trimStart')}</dt>
          <dd>{value(start)}</dd>
        </div>
        <div>
          <dt>{t('cuts.saw.trimEnd')}</dt>
          <dd>{value(end)}</dd>
        </div>
        <div>
          <dt>{t('cuts.saw.reuse')}</dt>
          <dd>{w.f.mm(cut.minReusable)} mm</dd>
        </div>
      </dl>
      <p className="fzw-small fzw-muted fzw-saw-note">
        {t('cuts.sawNote')}
        {mitred && kerf !== null && kerf > 0 ? ` ${t('cuts.sawMiter', { kerf: w.f.mm(kerf), along: w.f.number(kerfAlongBar(kerf, 45), 1) })}` : ''}
      </p>
    </>
  )
}

function groupColor(data: WorkshopDocumentData, group: OptimizationGroup) {
  return colorInfo(data.catalog, group.colorId)
}

function SummaryTable({ data, w }: { data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  const groups = data.optimization.groups
  if (groups.length === 0) return null
  const minReusable = data.cut.minReusable
  const warnings = planWarnings(data)
  return (
    <>
      <h2 className="fzw-h">
        {t('cuts.stockTitle')} <small>{t('cuts.stockHint')}</small>
      </h2>
      <table className="fzw-table fzw-table-dense">
        <thead>
          <tr>
            <th className="chk" aria-label={t('cuts.taken')} />
            <th>{t('cuts.profile')}</th>
            <th>{t('cuts.color')}</th>
            <th className="num">{t('cuts.barLength')}</th>
            <th className="num">{t('cuts.bars')}</th>
            <th className="num">{t('cuts.pieces')}</th>
            <th className="num">{t('cuts.yield')}</th>
            <th className="num">{t('cuts.offcuts')}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const color = groupColor(data, g)
            const reusable = g.bars.filter((b) => b.remainder > 0 && b.remainder >= minReusable).length
            const stock = g.bars.find((b) => !b.fromOffcut && !isSpecialBar(b, warnings))?.barLength
            return (
              <tr key={g.key}>
                <td className="chk">
                  <Box label={t('cuts.markTaken')} w={w} />
                </td>
                <td>
                  <span className="fzw-cell-title">{g.code}</span> <span className="fzw-muted">{g.name}</span>
                </td>
                <td>{color ? <span className="fzw-nowrap">{color.name}</span> : <span className="fzw-muted">{t('common.noColor')}</span>}</td>
                <td className="num">{stock ? w.f.mm(stock) : '—'}</td>
                <td className="num">
                  <span className="fzw-big">{w.f.int(g.barsNeeded)}</span>
                </td>
                <td className="num">{w.f.int(g.pieces)}</td>
                <td className="num fzw-nowrap">{w.f.pct(g.yieldPct)}</td>
                <td className="num">{reusable > 0 ? w.f.int(reusable) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

function GroupBlock({ group, ids, data, limit, w }: { group: OptimizationGroup; ids: (BarPieceId | undefined)[][] | undefined; data: WorkshopDocumentData; limit: number; w: WorkshopI18n }) {
  const t = w.t
  const color = groupColor(data, group)
  const bars = limit < group.bars.length ? group.bars.slice(0, limit) : group.bars
  const saw = groupSaw(group, data.cut)
  const weld = groupWeld(data.catalog, group)
  const heading = `${group.code}${color ? ` · ${color.name}` : ''}`
  return (
    <div className="fzw-bar-group" data-fit-flow="">
      <div className="fzw-bar-group-head">
        <h2 className="fzw-h fzw-bar-group-title">
          <span>
            <span className="fzw-mono">{group.code}</span> {group.name}
            {color ? ` · ${color.name}` : ''}
          </span>
          <small>{t('cuts.groupHint', { bars: t('common.bars', { count: group.barsNeeded }), pieces: t('common.pieces', { count: group.pieces }), pct: w.f.pct(group.yieldPct) })}</small>
        </h2>
        <p className="fzw-small">
          {t('cuts.groupSaw', { kerf: w.f.mm(saw.kerf), start: w.f.mm(saw.trimStart), end: w.f.mm(saw.trimEnd) })}
          {weld !== null ? ` · ${t('cuts.weldNote', { weld: w.f.mm(weld), total: w.f.mm(weld * 2) })}` : ''}
        </p>
      </div>
      {bars.map((bar, i) => (
        <BarRow key={i} bar={bar} index={i + 1} total={group.bars.length} ids={ids?.[i]} data={data} group={i > 0 ? heading : undefined} w={w} />
      ))}
    </div>
  )
}

/** Desplazamiento visual del inglete (en mm de papel) para un ángulo de corte. */
function miter(angle: number | undefined, width: number): number {
  if (angle === undefined || angle >= 89.95 || angle <= 0.5) return 0
  return Math.min((BAR_H * 0.42) / Math.tan((angle * Math.PI) / 180), width * 0.32)
}

interface Placed {
  row: BarPieceRow
  x: number
  w: number
  measure: { size: number; vertical: boolean } | null
  caption: string | null
}

function place(rows: BarPieceRow[], scale: number, ws: WorkshopI18n): Placed[] {
  return rows.map((row) => {
    const { cut } = row
    const x = cut.offset * scale
    const width = cut.length * scale
    const text = ws.f.mm(cut.length)
    let measure: Placed['measure'] = null
    if (textWidth(text, 5.2) <= width - 2.4) measure = { size: 5.2, vertical: false }
    else if (textWidth(text, 4) <= width - 1.6) measure = { size: 4, vertical: false }
    else if (width >= 3.6 && textWidth(text, 3.4) <= BAR_H - 1.4) measure = { size: 3.4, vertical: true }
    const side = row.id ? ws.side(row.id.side) : ''
    const ref = row.id?.ref ?? cut.ref ?? ''
    const full = [ref, side].filter(Boolean).join(' · ') || cut.label
    let caption: string | null = null
    if (textWidth(full, 3) <= width + 0.4) caption = full
    else if (ref && textWidth(ref, 3) <= width + 0.4) caption = ref
    return { row, x, w: width, measure, caption }
  })
}

function BarRow({ bar, index, total, ids, data, group, w }: { bar: Bar; index: number; total: number; ids: (BarPieceId | undefined)[] | undefined; data: WorkshopDocumentData; group?: string; w: WorkshopI18n }) {
  const t = w.t
  const rawId = useId()
  const hatchId = `fzw-hatch-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const geo = barGeometry(bar, data.cut)
  const rows = barPieceRows(bar, ids)
  const scale = VW / bar.barLength
  const placed = place(rows, scale, w)
  const special = isSpecialBar(bar, planWarnings(data))
  const remX = geo.remainderStart * scale
  const remW = geo.remainder * scale
  const trimStartW = geo.trimStart > 0 ? Math.max(0.5, geo.trimStart * scale) : 0
  const trimEndW = geo.trimEnd > 0 ? Math.max(0.5, geo.trimEnd * scale) : 0
  const rest = w.f.mm(geo.remainder)
  const source = bar.fromOffcut ? t('cuts.fromOffcutOf', { mm: w.f.mm(bar.barLength) }) : t('cuts.barOf', { mm: w.f.mm(bar.barLength) })

  return (
    <div className="fzw-bar-row">
      <div className="fzw-bar-head">
        <strong className="fzw-bar-no">{t('cuts.barNo', { n: index, total })}</strong>
        <span>
          {group ? <span className="fzw-bar-cont">{group} · </span> : null}
          {source} · {t('common.pieces', { count: bar.cuts.length })}
        </span>
        {special ? <span className="fzw-tag">{t('cuts.specialBar')}</span> : null}
        <span className="fzw-grow" />
        <span className="fzw-bar-rest">
          {geo.reusable ? (
            <>
              {t('cuts.keepOffcut')} <strong>{rest} mm</strong> <Box label={t('cuts.markKept')} w={w} />
            </>
          ) : (
            <>
              {t('cuts.leftover')} <strong>{rest} mm</strong>
            </>
          )}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        role="img"
        aria-label={t('cuts.barAria', { index, cuts: rows.map((r) => `${w.f.mm(r.cut.length)} mm ${r.id?.code ?? r.cut.label}`).join(', '), mm: rest })}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <pattern id={hatchId} width={1.5} height={1.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={1.5} height={1.5} fill="#FFFFFF" />
            <line x1={0} y1={0} x2={0} y2={1.5} stroke={HATCH} strokeWidth={0.5} />
          </pattern>
        </defs>
        {/* Contorno de la barra completa */}
        <rect x={0} y={BAR_TOP} width={VW} height={BAR_H} fill="#FFFFFF" stroke={INK} strokeWidth={0.2} />
        {trimStartW > 0 ? <rect x={0} y={BAR_TOP} width={trimStartW} height={BAR_H} fill={INK} /> : null}
        {trimEndW > 0 ? <rect x={VW - trimEndW} y={BAR_TOP} width={trimEndW} height={BAR_H} fill={INK} /> : null}
        {remW > 0.05 ? (
          <g>
            {geo.reusable ? (
              <rect x={remX + 0.2} y={BAR_TOP + 0.45} width={Math.max(0.2, remW - 0.4 - trimEndW)} height={BAR_H - 0.9} fill="#FFFFFF" stroke={INK} strokeWidth={0.4} strokeDasharray="1.6 1" />
            ) : (
              <rect x={remX} y={BAR_TOP} width={remW} height={BAR_H} fill={`url(#${hatchId})`} />
            )}
            {textWidth(rest, 4.2) + 1.2 < remW ? (
              <text x={remX + remW / 2} y={BAR_TOP + BAR_H / 2 + 1.5} textAnchor="middle" fontSize={4.2} fontWeight={geo.reusable ? 700 : 600} fill={geo.reusable ? INK : MUTED} paintOrder="stroke" stroke="#FFFFFF" strokeWidth={0.9}>
                {rest}
              </text>
            ) : null}
            {remW > 24 ? (
              <text x={remX + remW / 2} y={CAPTION_Y} textAnchor="middle" fontSize={3} fill={geo.reusable ? INK : MUTED}>
                {geo.reusable ? t('cuts.keepOffcut') : t('cuts.leftover')}
              </text>
            ) : null}
          </g>
        ) : null}
        {placed.map((p) => {
          const { cut, n } = p.row
          const a = miter(cut.angleStart, p.w)
          const b = miter(cut.angleEnd, p.w)
          const top = BAR_TOP
          const bottom = BAR_TOP + BAR_H
          const points = `${(p.x + a).toFixed(3)},${top} ${(p.x + p.w - b).toFixed(3)},${top} ${(p.x + p.w).toFixed(3)},${bottom} ${p.x.toFixed(3)},${bottom}`
          const cx = p.x + p.w / 2
          const text = w.f.mm(cut.length)
          return (
            <g key={n}>
              <polygon points={points} fill="#FFFFFF" stroke={INK} strokeWidth={0.42} strokeLinejoin="miter" />
              {p.w > 14 ? (
                <text x={p.x + a + 0.9} y={top + 3.1} fontSize={2.6} fontWeight={600} fill={MUTED}>
                  {n}
                </text>
              ) : null}
              {p.measure && !p.measure.vertical ? (
                <text x={cx} y={top + BAR_H / 2 + p.measure.size * 0.38} textAnchor="middle" fontSize={p.measure.size} fontWeight={700} fill={INK}>
                  {text}
                </text>
              ) : null}
              {p.measure && p.measure.vertical ? (
                <text transform={`translate(${cx + p.measure.size * 0.36} ${top + BAR_H / 2}) rotate(-90)`} textAnchor="middle" fontSize={p.measure.size} fontWeight={700} fill={INK}>
                  {text}
                </text>
              ) : null}
              {!p.measure ? (
                <text x={cx} y={top + BAR_H / 2 + 1} textAnchor="middle" fontSize={2.8} fontWeight={700} fill={INK}>
                  {n}
                </text>
              ) : null}
              {p.caption ? (
                <text x={cx} y={CAPTION_Y} textAnchor="middle" fontSize={3} fontWeight={600} fill={INK}>
                  {p.caption}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <ol className="fzw-bar-pieces">
        {rows.map((r) => (
          <PieceRow key={r.n} row={r} w={w} />
        ))}
      </ol>
    </div>
  )
}

function PieceRow({ row, w }: { row: BarPieceRow; w: WorkshopI18n }) {
  const t = w.t
  const { cut, id } = row
  const start = cut.angleStart ?? 90
  const end = cut.angleEnd ?? 90
  return (
    <li>
      <Box label={t('cuts.markCut')} w={w} />
      <span className="fzw-bp-n">{row.n}</span>
      <span className="fzw-bp-mm">{w.f.mm(cut.length)}</span>
      <span className="fzw-bp-cut">
        <CutShape start={start} end={end} width={30} height={11} w={w} />
        <AngleText start={start} end={end} w={w} />
      </span>
      <span className="fzw-bp-id">
        <strong>{id?.code ?? cut.ref ?? ''}</strong> {id ? w.side(id.side) : cut.label}
        {id && id.units > 1 ? <small>{` ${t('cuts.unitShort', { n: id.unit })}`}</small> : null}
      </span>
    </li>
  )
}

/** Lista final para guardar y rotular lo que sobró. */
function OffcutsTable({ data, w }: { data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  const rows = data.optimization.groups.flatMap((group) => {
    const color = groupColor(data, group)
    return group.bars.flatMap((bar, i) => {
      const geo = barGeometry(bar, data.cut)
      return geo.reusable ? [{ key: `${group.key}-${i}`, code: group.code, name: group.name, color: color?.name, length: geo.remainder, bar: i + 1 }] : []
    })
  })
  if (rows.length === 0) return null
  return (
    <div className="fzw-avoid">
      <h2 className="fzw-h">
        {t('cuts.offcutsTitle')} <small>{t('cuts.offcutsHint')}</small>
      </h2>
      <table className="fzw-table fzw-table-dense">
        <thead>
          <tr>
            <th className="chk" aria-label={t('cuts.kept')} />
            <th>{t('cuts.profile')}</th>
            <th>{t('cuts.color')}</th>
            <th className="num">{t('cuts.fromBar')}</th>
            <th className="num">{t('cuts.offcutLength')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="chk">
                <Box label={t('cuts.markKept')} w={w} />
              </td>
              <td>
                <span className="fzw-cell-title">{r.code}</span> <span className="fzw-muted">{r.name}</span>
              </td>
              <td>{r.color ?? '—'}</td>
              <td className="num">{w.f.int(r.bar)}</td>
              <td className="num">
                <span className="fzw-mid">{w.f.mm(r.length)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
