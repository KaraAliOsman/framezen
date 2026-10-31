import { AngleText, CutShape, DocRoot, Sheet } from './common'
import { fmtGlassMm, fmtM2, fmtMm } from './format'
import { chunk, colorInfo, sideWords, workshopPieceCodes } from './helpers'
import { WorkshopQr } from './qr'
import { WORKSHOP_PAPER_SIZES } from './styles'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

export interface WorkshopLabel {
  kind: 'piece' | 'glass'
  /** «V2-M03», «V2-M03-R» o «V2-G1». */
  code: string
  ref: string
  /** Unidad de la ventana (1..units). */
  unit: number
  units: number
  /** «A601 · Marco 60 · Winchester». */
  title: string
  /** Medida grande: «1.481» (mm) o «603,5 × 917,0». */
  measure: string
  side?: string
  angles?: [number, number]
  extra?: string
  qr: string
}

export interface WorkshopLabelOptions {
  /** Incluir etiquetas de vidrio (por defecto sí). */
  includeGlass?: boolean
  /** Contenido del QR. Por defecto «FZ:OT38:V2-M03» (+ «:U2» si hay varias unidades). */
  qrValue?: (label: Omit<WorkshopLabel, 'qr'>, data: WorkshopDocumentData) => string
  /**
   * Máximo de etiquetas (las primeras, en el mismo orden). Para la vista previa en pantalla:
   * con cientos de unidades son miles de etiquetas y dibujarlas todas traba o bota la pestaña.
   * Sin límite, todas.
   */
  limit?: number
}

function defaultQr(label: Omit<WorkshopLabel, 'qr'>, data: WorkshopDocumentData): string {
  return `FZ:OT${data.workOrder.number}:${label.code}${label.units > 1 ? `:U${label.unit}` : ''}`
}

/** Unidades de la ventana que llevan etiqueta (al menos una). */
function labelUnits(qty: number): number {
  const units = Math.max(1, Math.round(qty))
  return Number.isFinite(units) ? units : 0
}

/** Vidrios de una línea del despiece (uno por etiqueta). */
function glassUnits(qty: number): number {
  return Number.isFinite(qty) && qty > 0 ? Math.ceil(qty) : 0
}

/** Cuántas etiquetas salen (las mismas de `workshopLabels`) sin armarlas: es instantáneo con miles de unidades. */
export function workshopLabelCount(data: WorkshopDocumentData, opts: Pick<WorkshopLabelOptions, 'includeGlass'> = {}): number {
  const withGlass = opts.includeGlass ?? true
  let total = 0
  for (const window of data.windows) {
    const glass = withGlass ? window.bom.glass.reduce((s, g) => s + glassUnits(g.qty), 0) : 0
    total += labelUnits(window.qty) * (workshopPieceCodes(window).length + glass)
  }
  return total
}

/** Todas las etiquetas de la OT: una por pieza física (y por vidrio), en orden de ventana. */
export function workshopLabels(data: WorkshopDocumentData, opts: WorkshopLabelOptions = {}): WorkshopLabel[] {
  const qrValue = opts.qrValue ?? defaultQr
  const max = opts.limit === undefined ? Infinity : Math.max(0, Math.floor(opts.limit))
  const labels: WorkshopLabel[] = []
  if (!(max > 0)) return labels
  /** Agrega la etiqueta y dice si ya se llegó al límite. */
  const push = (base: Omit<WorkshopLabel, 'qr'>): boolean => {
    labels.push({ ...base, qr: qrValue(base, data) })
    return labels.length >= max
  }
  for (const window of data.windows) {
    const pieces = workshopPieceCodes(window)
    const units = labelUnits(window.qty)
    for (let unit = 1; unit <= units; unit++) {
      for (const p of pieces) {
        const color = colorInfo(data.catalog, p.piece.colorId)
        const base: Omit<WorkshopLabel, 'qr'> = {
          kind: 'piece',
          code: p.code,
          ref: window.ref,
          unit,
          units,
          title: [p.piece.code, p.piece.name, color?.name ?? (p.piece.kind === 'reinforcement' ? 'acero' : undefined)]
            .filter(Boolean)
            .join(' · '),
          measure: fmtMm(p.piece.length),
          side: sideWords(p.side),
          angles: [p.piece.angleStart, p.piece.angleEnd],
        }
        if (push(base)) return labels
      }
      if (opts.includeGlass ?? true) {
        let g = 0
        for (const glass of window.bom.glass) {
          for (let k = 0; k < glassUnits(glass.qty); k++) {
            g++
            const base: Omit<WorkshopLabel, 'qr'> = {
              kind: 'glass',
              code: `${window.ref}-G${g}`,
              ref: window.ref,
              unit,
              units,
              title: glass.name,
              measure: `${fmtGlassMm(glass.width)} × ${fmtGlassMm(glass.height)}`,
              side: glass.label,
              extra: fmtM2(glass.area),
            }
            if (push(base)) return labels
          }
        }
      }
    }
  }
  return labels
}

export interface LabelsDocumentProps extends WorkshopDocumentProps, WorkshopLabelOptions {
  /** «sheet» = hoja Carta/A4 con 10 etiquetas de 100 × 50 mm; «roll» = rollo térmico 100 × 50 mm. */
  format?: 'sheet' | 'roll'
}

const PER_SHEET = 10

/** Etiquetas de 100 × 50 mm por pieza con QR, código, perfil, medida grande y ángulos. */
export function LabelsDocument({ data, paper = 'letter', format = 'sheet', includeGlass, qrValue, limit }: LabelsDocumentProps) {
  const labels = workshopLabels(data, { includeGlass, qrValue, limit })
  const size = WORKSHOP_PAPER_SIZES[paper]
  const padX = Math.max(0, (size.width - 200) / 2).toFixed(2)
  const padY = Math.max(0, (size.height - 250) / 2).toFixed(2)
  const pageRule =
    format === 'roll' ? '@page { size: 100mm 50mm; margin: 0; }' : `@page { size: ${size.css}; margin: 0; }`
  const extraCss =
    format === 'roll'
      ? `.fzw-sheet.fzw-sheet-roll { width: 100mm; min-height: 50mm; height: 50mm; padding: 0; margin: 0 auto 4mm; }
@media print { .fzw-sheet.fzw-sheet-roll { width: 100mm; height: 50mm; margin: 0; padding: 0; overflow: hidden; } }`
      : `.fzw-sheet.fzw-sheet-labels { padding: ${padY}mm ${padX}mm; }
@media print { .fzw-sheet.fzw-sheet-labels { padding: ${padY}mm ${padX}mm; height: ${(size.height - 0.5).toFixed(1)}mm; overflow: hidden; } }`
  const groups = format === 'roll' ? labels.map((l) => [l]) : chunk(labels, PER_SHEET)

  return (
    <DocRoot data={data} paper={paper} pageRule={pageRule} extraCss={extraCss} kind="labels">
      {groups.map((group, i) =>
        format === 'roll' ? (
          <Sheet key={i} className="fzw-sheet-roll">
            {group.map((label) => (
              <PieceLabel key={`${label.code}-${label.unit}`} label={label} data={data} />
            ))}
          </Sheet>
        ) : (
          <Sheet key={i} className="fzw-sheet-labels">
            <div className="fzw-labels-sheet">
              {group.map((label) => (
                <PieceLabel key={`${label.code}-${label.unit}`} label={label} data={data} />
              ))}
            </div>
          </Sheet>
        ),
      )}
      {labels.length === 0 ? (
        <Sheet>
          <p className="fzw-muted">No hay piezas para etiquetar.</p>
        </Sheet>
      ) : null}
    </DocRoot>
  )
}

function PieceLabel({ label, data }: { label: WorkshopLabel; data: WorkshopDocumentData }) {
  const glass = label.kind === 'glass'
  return (
    <div className="fzw-label" data-code={label.code}>
      <div className="fzw-label-qr">
        <WorkshopQr value={label.qr} size="27mm" title={`QR de la pieza ${label.code}`} />
        <small>
          OT N° {data.workOrder.number}
          <br />
          {data.quote.title}
        </small>
      </div>
      <div className="fzw-label-main">
        <div className="fzw-label-top">
          <span className="fzw-label-code">{label.code}</span>
          {label.units > 1 ? <span className="fzw-label-unit">{`unidad ${label.unit} de ${label.units}`}</span> : null}
        </div>
        <div className="fzw-label-name">{label.title}</div>
        <div className="fzw-label-measure" style={glass ? { fontSize: '19pt' } : undefined}>
          {label.measure}
          <small>mm</small>
        </div>
        <div className="fzw-label-bottom">
          {label.angles ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
              <CutShape start={label.angles[0]} end={label.angles[1]} width={46} height={12} />
              <AngleText start={label.angles[0]} end={label.angles[1]} />
            </span>
          ) : (
            <span className="fzw-small">{label.extra}</span>
          )}
          {label.side ? <strong>{label.side}</strong> : null}
        </div>
      </div>
    </div>
  )
}
