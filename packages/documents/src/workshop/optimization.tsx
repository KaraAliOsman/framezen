import { useId } from 'react'
import type { Bar, BarCut, CutSettings, OptimizationGroup } from '@framezen/engine'
import { Box, DocHeader, DocRoot, Meter, Sheet } from './common'
import { fmtAngle, fmtInt, fmtMm, fmtPct, plural } from './format'
import { barLabel, colorInfo, isOddAngle, otLabel, windowTint } from './helpers'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

// Unidades del SVG de barra: milímetros de papel (ancho útil ≈ 176 mm en Carta).
const VW = 176
const BAR_TOP = 1
const BAR_H = 12
const LABEL_Y = 17.6
const VH = 19.5

/** Ancho aproximado de un texto en unidades del SVG (cifras tabulares ≈ 0,56 em). */
function textWidth(text: string, size: number): number {
  let em = 0
  for (const ch of text) {
    if (/[0-9]/.test(ch)) em += 0.56
    else if (/[.,·:'\s]/.test(ch)) em += 0.28
    else if (/[A-ZÁÉÍÓÚÑ]/.test(ch)) em += 0.66
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

/**
 * Optimización de cortes: resumen por perfil y color, y cada barra dibujada a escala
 * con sus piezas coloreadas por ventana, la medida grande y debajo «V3 · arr».
 */
export function CutOptimizationDocument({ data, paper, summary = true, maxBars }: CutOptimizationDocumentProps) {
  const opt = data.optimization
  const footer = `${otLabel(data)} · Optimización de cortes · ${data.quote.title}`
  const offcutTotal = opt.offcuts.reduce((s, o) => s + o.length, 0)
  const refs = data.windows.map((w) => w.ref)
  const shown = barsPerGroup(opt.groups, maxBars)

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="cuts">
      <Sheet footer={footer}>
        <DocHeader data={data} kicker="Optimización de cortes" />

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>Barras a sacar de bodega</span>
            <strong>{fmtInt(opt.totalBars)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>Piezas a cortar</span>
            <strong>{fmtInt(opt.totalPieces)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>Aprovechamiento</span>
            <strong>{fmtPct(opt.yieldPct)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>Retazos para guardar</span>
            <strong>{fmtInt(opt.offcuts.length)}</strong>
            <em>{opt.offcuts.length > 0 ? `${fmtMm(offcutTotal)} mm en total` : 'Ninguno sobre el mínimo'}</em>
          </div>
        </div>
        <p className="fzw-small fzw-muted" style={{ marginBottom: '4mm' }}>
          {settingsLine(data.cut)}
        </p>

        {summary ? <SummaryTable data={data} /> : null}

        {refs.length > 0 ? (
          <>
            <h2 className="fzw-h">
              Colores por ventana <small>cada pieza lleva el color de su ventana</small>
            </h2>
            <div className="fzw-legend">
              {refs.map((ref) => (
                <span key={ref}>
                  <i style={{ background: windowTint(data, ref) }} />
                  {ref}
                </span>
              ))}
              <span>
                <svg width="15" height="11" viewBox="0 0 15 11" aria-hidden="true">
                  <rect x="0.5" y="0.5" width="14" height="10" fill="#FFFFFF" stroke="#1F1C18" strokeWidth="1" />
                  <path d="M1 8 L7 2 M5 10 L13 2 M10 10 L14 6" stroke="#9C9489" strokeWidth="1.2" />
                </svg>
                Sobrante y despunte
              </span>
            </div>
          </>
        ) : null}

        {opt.groups.map((group, i) =>
          maxBars === undefined || (shown[i] ?? 0) > 0 ? (
            <GroupBlock key={group.key} group={group} data={data} limit={shown[i] ?? 0} />
          ) : null,
        )}
        {opt.groups.length === 0 ? <p className="fzw-muted">No hay cortes para optimizar.</p> : null}
      </Sheet>
    </DocRoot>
  )
}

function settingsLine(cut: CutSettings): string {
  const trim =
    cut.trimStart || cut.trimEnd ? `despunte ${fmtMm(cut.trimStart)} + ${fmtMm(cut.trimEnd)} mm` : 'sin despunte'
  return `Barra de ${fmtMm(cut.barLength)} mm · disco de ${fmtMm(cut.kerf)} mm por corte · ${trim} · se guardan retazos desde ${fmtMm(cut.minReusable)} mm. Medidas de corte en mm.`
}

function groupColor(data: WorkshopDocumentData, group: OptimizationGroup) {
  return colorInfo(data.catalog, group.colorId)
}

function SummaryTable({ data }: { data: WorkshopDocumentData }) {
  const groups = data.optimization.groups
  if (groups.length === 0) return null
  const minReusable = data.cut.minReusable
  return (
    <>
      <h2 className="fzw-h">
        Sacar de bodega <small>por perfil y color</small>
      </h2>
      <table className="fzw-table fzw-table-dense">
        <thead>
          <tr>
            <th className="chk" aria-label="Retirado" />
            <th>Perfil</th>
            <th>Color</th>
            <th className="num">Barras</th>
            <th className="num">Piezas</th>
            <th>Aprovechamiento</th>
            <th className="num">Retazos</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const color = groupColor(data, g)
            const reusable = g.bars.filter((b) => b.remainder >= minReusable).length
            return (
              <tr key={g.key}>
                <td className="chk">
                  <Box label="Marcar retirado" />
                </td>
                <td>
                  <span className="fzw-cell-title">{g.name}</span> <span className="fzw-mono fzw-muted">{g.code}</span>
                </td>
                <td>
                  {color ? (
                    <span className="fzw-nowrap">
                      {color.hex ? <span className="fzw-swatch" style={{ background: color.hex }} /> : null}
                      {color.name}
                    </span>
                  ) : (
                    <span className="fzw-muted">Sin color</span>
                  )}
                </td>
                <td className="num">
                  <span className="fzw-big">{fmtInt(g.barsNeeded)}</span>
                </td>
                <td className="num">{fmtInt(g.pieces)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                    <div style={{ width: '22mm' }}>
                      <Meter pct={g.yieldPct} />
                    </div>
                    <span className="fzw-nowrap">{fmtPct(g.yieldPct)}</span>
                  </div>
                </td>
                <td className="num">{reusable > 0 ? fmtInt(reusable) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

function GroupBlock({ group, data, limit }: { group: OptimizationGroup; data: WorkshopDocumentData; limit: number }) {
  const color = groupColor(data, group)
  const bars = limit < group.bars.length ? group.bars.slice(0, limit) : group.bars
  return (
    <div className="fzw-bar-group" data-fit-flow="">
      <h2 className="fzw-h fzw-bar-group-title">
        <span>
          <span className="fzw-mono">{group.code}</span> {group.name}
          {color ? ` · ${color.name}` : ''}
        </span>
        <small>
          {plural(group.barsNeeded, 'barra')} · {plural(group.pieces, 'pieza')} · {fmtPct(group.yieldPct)} de aprovechamiento
        </small>
      </h2>
      {bars.map((bar, i) => (
        <BarRow key={i} bar={bar} index={i + 1} data={data} group={i > 0 ? `${group.code}${color ? ` · ${color.name}` : ''}` : undefined} />
      ))}
    </div>
  )
}

interface PlacedCut {
  cut: BarCut
  n: number
  x: number
  w: number
  measure: { size: number; vertical: boolean } | null
  label: string | null
}

function placeCuts(bar: Bar, scale: number): PlacedCut[] {
  return bar.cuts.map((cut, i) => {
    const x = cut.offset * scale
    const w = cut.length * scale
    const text = fmtMm(cut.length)
    let measure: PlacedCut['measure'] = null
    if (textWidth(text, 4.4) <= w - 1.2) measure = { size: 4.4, vertical: false }
    else if (textWidth(text, 3.3) <= w - 0.8) measure = { size: 3.3, vertical: false }
    else if (w >= 3.4 && textWidth(text, 2.9) <= BAR_H - 1.4) measure = { size: 2.9, vertical: true }
    const full = barLabel(cut.label, cut.ref)
    let label: string | null = null
    if (textWidth(full, 2.7) <= w + 0.6) label = full
    else if (cut.ref && textWidth(cut.ref, 2.7) <= w + 0.6) label = cut.ref
    return { cut, n: i + 1, x, w, measure, label }
  })
}

/** Desplazamiento visual del inglete (en mm de papel) para un ángulo de corte. */
function miter(angle: number | undefined, w: number): number {
  if (angle === undefined || angle >= 89.95 || angle <= 0.5) return 0
  return Math.min(1.5 / Math.tan((angle * Math.PI) / 180), w * 0.3)
}

function BarRow({ bar, index, data, group }: { bar: Bar; index: number; data: WorkshopDocumentData; group?: string }) {
  const rawId = useId()
  const hatchId = `fzw-hatch-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const scale = VW / bar.barLength
  const trimStart = data.cut.trimStart
  const trimEnd = data.cut.trimEnd
  const placed = placeCuts(bar, scale)
  const remStart = (bar.barLength - trimEnd - bar.remainder) * scale
  const remW = bar.remainder * scale
  const reusable = bar.remainder >= data.cut.minReusable
  const hidden = placed.filter((p) => !p.measure || p.label !== barLabel(p.cut.label, p.cut.ref))
  const odd = bar.cuts.filter((c) => (c.angleStart !== undefined && isOddAngle(c.angleStart)) || (c.angleEnd !== undefined && isOddAngle(c.angleEnd)))

  return (
    <div className="fzw-bar-row">
      <div className="fzw-bar-index">
        {index}
        <small>{bar.fromOffcut ? 'retazo' : 'barra'}</small>
      </div>
      <div>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          width="100%"
          role="img"
          aria-label={`Barra ${index}: ${bar.cuts.map((c) => `${fmtMm(c.length)} mm ${barLabel(c.label, c.ref)}`).join(', ')}; sobrante ${fmtMm(bar.remainder)} mm`}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <pattern id={hatchId} width={1.4} height={1.4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={1.4} height={1.4} fill="#FFFFFF" />
              <line x1={0} y1={0} x2={0} y2={1.4} stroke="#9C9489" strokeWidth={0.45} />
            </pattern>
          </defs>
          {/* Contorno de la barra completa */}
          <rect x={0} y={BAR_TOP} width={VW} height={BAR_H} fill="#FFFFFF" stroke="#9C9489" strokeWidth={0.25} />
          {trimStart > 0 ? (
            <rect x={0} y={BAR_TOP} width={trimStart * scale} height={BAR_H} fill={`url(#${hatchId})`} stroke="none" />
          ) : null}
          {trimEnd > 0 ? (
            <rect
              x={VW - trimEnd * scale}
              y={BAR_TOP}
              width={trimEnd * scale}
              height={BAR_H}
              fill={`url(#${hatchId})`}
              stroke="none"
            />
          ) : null}
          {remW > 0.05 ? (
            <g>
              <rect x={remStart} y={BAR_TOP} width={remW} height={BAR_H} fill={`url(#${hatchId})`} stroke="none" />
              {textWidth(fmtMm(bar.remainder), 3.2) + 1 < remW ? (
                <text
                  x={remStart + remW / 2}
                  y={BAR_TOP + BAR_H / 2 + 1.1}
                  textAnchor="middle"
                  fontSize={3.2}
                  fontWeight={600}
                  fill="#6F685E"
                  paintOrder="stroke"
                  stroke="#FFFFFF"
                  strokeWidth={0.9}
                >
                  {fmtMm(bar.remainder)}
                </text>
              ) : null}
              {remW > 14 ? (
                // Centrado bajo el sobrante, sin salirse por la derecha de la barra.
                <text
                  x={Math.min(remStart + remW / 2, VW - textWidth(reusable ? 'retazo para guardar' : 'sobrante', 2.6) / 2 - 0.4)}
                  y={LABEL_Y}
                  textAnchor="middle"
                  fontSize={2.6}
                  fill="#6F685E"
                >
                  {reusable ? 'retazo para guardar' : 'sobrante'}
                </text>
              ) : null}
            </g>
          ) : null}
          {placed.map((p) => {
            const a = miter(p.cut.angleStart, p.w)
            const b = miter(p.cut.angleEnd, p.w)
            const top = BAR_TOP
            const bottom = BAR_TOP + BAR_H
            const points = `${p.x + a},${top} ${p.x + p.w - b},${top} ${p.x + p.w},${bottom} ${p.x},${bottom}`
            const cx = p.x + p.w / 2
            const text = fmtMm(p.cut.length)
            return (
              <g key={p.n}>
                <polygon
                  points={points}
                  fill={windowTint(data, p.cut.ref)}
                  stroke="#1F1C18"
                  strokeWidth={0.3}
                  strokeLinejoin="round"
                />
                {p.measure && !p.measure.vertical ? (
                  <text
                    x={cx}
                    y={top + BAR_H / 2 + p.measure.size * 0.36}
                    textAnchor="middle"
                    fontSize={p.measure.size}
                    fontWeight={700}
                    fill="#1F1C18"
                  >
                    {text}
                  </text>
                ) : null}
                {p.measure && p.measure.vertical ? (
                  <text
                    transform={`translate(${cx + p.measure.size * 0.36} ${top + BAR_H / 2}) rotate(-90)`}
                    textAnchor="middle"
                    fontSize={p.measure.size}
                    fontWeight={700}
                    fill="#1F1C18"
                  >
                    {text}
                  </text>
                ) : null}
                {!p.measure ? (
                  <text x={cx} y={top + BAR_H / 2 + 1} textAnchor="middle" fontSize={2.6} fontWeight={700} fill="#1F1C18">
                    {p.n}
                  </text>
                ) : null}
                {p.label ? (
                  <text x={cx} y={LABEL_Y} textAnchor="middle" fontSize={2.7} fill="#1F1C18">
                    {p.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
        <div className="fzw-bar-meta">
          <span>
            {/* Solo se ve si el grupo puede seguir en otra hoja (ajuste más compacto): cada barra dice de qué perfil es. */}
            {group ? <span className="fzw-bar-cont">{group} · </span> : null}
            Piezas <strong>{fmtMm(bar.used)} mm</strong> · disco {fmtMm(bar.kerfLoss)} mm
          </span>
          <span>
            Sobrante <strong>{fmtMm(bar.remainder)} mm</strong>
            {reusable ? ' · guardar retazo' : ''} · {fmtPct(bar.yieldPct)}
          </span>
        </div>
        {hidden.length > 0 ? (
          <div className="fzw-bar-extra">
            <span className="fzw-muted">Piezas cortas: </span>
            {hidden.map((p, i) => (
              <span key={p.n}>
                {i > 0 ? ' · ' : ''}
                {!p.measure ? <strong>{`(${p.n}) `}</strong> : null}
                <strong>{fmtMm(p.cut.length)}</strong> {barLabel(p.cut.label, p.cut.ref)}
              </span>
            ))}
          </div>
        ) : null}
        {odd.length > 0 ? (
          <div className="fzw-bar-extra">
            <span className="fzw-tag">Ángulos especiales</span>{' '}
            {odd.map((c, i) => (
              <span key={i}>
                {i > 0 ? ' · ' : ''}
                {fmtMm(c.length)} {barLabel(c.label, c.ref)}: {fmtAngle(c.angleStart ?? 90)} / {fmtAngle(c.angleEnd ?? 90)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
