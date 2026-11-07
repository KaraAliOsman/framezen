/**
 * Plano de vidrios: asignación por ventana (qué vidrio va en cada paño) y plantillas a escala de los
 * vidrios con forma, desde el contorno real del motor. Las plantillas también van en el pedido al
 * proveedor (`GlassTemplateSheets`), sin datos del cliente.
 */
import type { GlassPiece, WorkshopWindow } from '@dekopen/engine'
import { outlinePolygon, pathSegments, type Segment } from '../drawing'
import { Box, DocHeader, DocRoot, Sheet, WindowBand, WindowSketch } from './common'
import { otLabel, quoteTitle, uniqueFooter } from './helpers'
import { resolveWorkshopLocale, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

/** Escalas de plano habituales: la mayor que cabe en la hoja. */
const SCALES = [5, 10, 15, 20, 25, 50]

const INK = '#1D2426'
const DIM = '#1D2426'

export interface GlassTemplate {
  ref: string
  piece: GlassPiece
  /** Veces que hay que cortarla en toda la OT. */
  qty: number
}

/** Vidrios con forma de la OT, uno por pieza distinta. */
export function glassTemplates(data: Pick<WorkshopDocumentData, 'windows'>): GlassTemplate[] {
  const out: GlassTemplate[] = []
  for (const window of data.windows) {
    for (const piece of window.bom.glass) {
      if (piece.outline && piece.shape && piece.shape !== 'rect') out.push({ ref: window.ref, piece, qty: piece.qty * window.qty })
    }
  }
  return out
}

function bounds(points: readonly (readonly [number, number])[]) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

const segmentLength = (s: Segment) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])

/** Ángulo interior en el vértice `b` de a→b→c, en grados. */
function cornerAngle(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const ux = (a[0] ?? 0) - (b[0] ?? 0)
  const uy = (a[1] ?? 0) - (b[1] ?? 0)
  const vx = (c[0] ?? 0) - (b[0] ?? 0)
  const vy = (c[1] ?? 0) - (b[1] ?? 0)
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/** Plantilla a escala con largo de cada lado, ángulos de esquina y radios. Medidas en mm reales. */
export function GlassTemplateDrawing({ template, w }: { template: GlassTemplate; w: WorkshopI18n }) {
  const t = w.t
  const { piece } = template
  const segments = pathSegments(piece.outline)
  const polygon = outlinePolygon(piece.outline, 6)
  if (polygon.length < 3) return <p className="fzw-muted">{t('glassPlan.noOutline')}</p>
  const box = bounds(polygon)
  const spanX = box.x1 - box.x0
  const spanY = box.y1 - box.y0
  // Papel disponible: 165 × 120 mm.
  const scale = SCALES.find((s) => spanX / s <= 165 && spanY / s <= 120) ?? SCALES[SCALES.length - 1]!
  const pad = 26
  const W = spanX / scale + pad * 2
  const H = spanY / scale + pad * 2
  const X = (x: number) => (x - box.x0) / scale + pad
  const Y = (y: number) => (y - box.y0) / scale + pad
  const d = `${polygon.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(2)} ${Y(y).toFixed(2)}`).join(' ')} Z`
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const line = segments.filter((s) => s.kind === 'line' && segmentLength(s) > 1)
  return (
    <figure className="fzw-template">
      <figcaption className="fzw-template-head">
        <strong>
          {template.ref} · {w.cell(piece.label)}
        </strong>
        <span>{t('glassPlan.templateMeta', { qty: w.f.int(template.qty), name: piece.name })}</span>
        <span className="fzw-grow" />
        <span>{t('glassPlan.scale', { scale })}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W.toFixed(2)} ${H.toFixed(2)}`} width={`${W.toFixed(1)}mm`} style={{ maxWidth: '100%' }} role="img" aria-label={t('glassPlan.templateAria', { ref: template.ref, width: w.f.mm(piece.width), height: w.f.mm(piece.height) })}>
        <path d={d} fill="#FFFFFF" stroke={INK} strokeWidth={0.5} strokeLinejoin="miter" />
        {segments
          .filter((s) => s.kind === 'arc')
          .map((s, i) => (
            <text key={`a${i}`} x={X(cx)} y={Y(cy)} textAnchor="middle" fontSize={3.4} fontWeight={600} fill={INK}>
              {t('glassPlan.radius', { mm: w.f.mm(s.kind === 'arc' ? s.rx : 0) })}
            </text>
          ))}
        {line.map((s, i) => {
          // Cota de cada lado recto, por fuera del contorno.
          const ax = X(s.a[0])
          const ay = Y(s.a[1])
          const bx = X(s.b[0])
          const by = Y(s.b[1])
          const len = Math.hypot(bx - ax, by - ay) || 1
          let nx = (by - ay) / len
          let ny = -(bx - ax) / len
          const mx = (ax + bx) / 2
          const my = (ay + by) / 2
          if (Math.hypot(mx + nx - X(cx), my + ny - Y(cy)) < Math.hypot(mx - X(cx), my - Y(cy))) {
            nx = -nx
            ny = -ny
          }
          const off = 7
          const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
          const flip = angle > 90 || angle <= -90
          const tx = mx + nx * (off + 2.2)
          const ty = my + ny * (off + 2.2)
          return (
            <g key={`s${i}`} stroke={DIM} fill="none">
              <line x1={ax + nx} y1={ay + ny} x2={ax + nx * (off + 1)} y2={ay + ny * (off + 1)} strokeWidth={0.15} />
              <line x1={bx + nx} y1={by + ny} x2={bx + nx * (off + 1)} y2={by + ny * (off + 1)} strokeWidth={0.15} />
              <line x1={ax + nx * off} y1={ay + ny * off} x2={bx + nx * off} y2={by + ny * off} strokeWidth={0.2} />
              <text transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${(flip ? angle + 180 : angle).toFixed(2)})`} textAnchor="middle" dominantBaseline="middle" fontSize={3.6} fontWeight={700} fill={INK} stroke="none">
                {w.f.mm(Math.round(segmentLength(s) * 10) / 10)}
              </text>
            </g>
          )
        })}
        {line.map((s, i) => {
          const next = line[(i + 1) % line.length]
          if (!next || Math.hypot(s.b[0] - next.a[0], s.b[1] - next.a[1]) > 0.5) return null
          const corner = cornerAngle(s.a, s.b, next.b)
          if (Math.abs(corner - 90) < 0.05) return null
          const bx = X(s.b[0])
          const by = Y(s.b[1])
          const dx = X(cx) - bx
          const dy = Y(cy) - by
          const n = Math.hypot(dx, dy) || 1
          return (
            <text key={`c${i}`} x={bx + (dx / n) * 11} y={by + (dy / n) * 11} textAnchor="middle" dominantBaseline="middle" fontSize={3.2} fontWeight={600} fill={INK}>
              {w.f.angle(corner)}
            </text>
          )
        })}
      </svg>
      <p className="fzw-small fzw-muted">{t('glassPlan.templateNote', { width: w.f.mm(piece.width), height: w.f.mm(piece.height) })}</p>
    </figure>
  )
}

/** Hojas de plantillas, una o dos por página. Vacío si la OT no trae vidrios con forma. */
export function GlassTemplateSheets({ data, footer, w, supplier }: { data: WorkshopDocumentData; footer: string; w: WorkshopI18n; supplier?: boolean }) {
  const templates = glassTemplates(data)
  if (templates.length === 0) return null
  return (
    <Sheet footer={footer}>
      <DocHeader data={data} kicker={w.t('glassPlan.templatesKicker')} audience={supplier ? 'supplier' : 'internal'} w={w} />
      {templates.map((template, i) => (
        <GlassTemplateDrawing key={`${template.ref}-${i}`} template={template} w={w} />
      ))}
    </Sheet>
  )
}

/** Plano de vidrios por ventana con casillas de recibido y puesto. */
export function GlassPlanDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('glassPlan.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const windows = data.windows.filter((x) => x.bom.glass.length > 0)
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="glass-plan" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('glassPlan.kicker')} w={w} />
        {windows.length === 0 ? <p className="fzw-muted">{t('glass.empty')}</p> : null}
        {windows.map((window) => (
          <PlanCard key={window.ref} window={window} data={data} w={w} />
        ))}
      </Sheet>
      <GlassTemplateSheets data={data} footer={footer} w={w} />
    </DocRoot>
  )
}

function PlanCard({ window, data, w }: { window: WorkshopWindow; data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  return (
    <article className="fzw-card fzw-plan-card">
      <WindowBand window={window} small w={w} />
      <div className="fzw-card-grid">
        <div className="fzw-drawing">
          <WindowSketch window={window} catalog={data.catalog} width={180} height={140} dimensions="none" />
        </div>
        <table className="fzw-table fzw-table-dense">
          <thead>
            <tr>
              <th className="chk">{t('glass.received')}</th>
              <th className="chk">{t('glassPlan.fitted')}</th>
              <th>{t('workOrder.pane')}</th>
              <th className="num">{t('glassPlan.size')}</th>
              <th className="num">{t('workOrder.qty')}</th>
            </tr>
          </thead>
          <tbody>
            {window.bom.glass.map((g, i) => (
              <tr key={`${g.nodeId}-${i}`}>
                <td className="chk">
                  <Box label={t('glass.markReceived')} w={w} />
                </td>
                <td className="chk">
                  <Box label={t('glassPlan.fitted')} w={w} />
                </td>
                <td>
                  <span className="fzw-cell-title">{w.cell(g.label)}</span>
                  <div className="fzw-cell-sub">
                    {g.name}
                    {g.shape && g.shape !== 'rect' ? ` · ${t('glassPlan.withTemplate')}` : ''}
                  </div>
                </td>
                <td className="num">
                  <span className="fzw-mid">
                    {w.f.glassMm(g.width)} × {w.f.glassMm(g.height)}
                  </span>
                </td>
                <td className="num">
                  <span className="fzw-mid">{w.f.qty(g.qty * window.qty)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}
