import type { ReactNode } from 'react'
import type { CutPiece, ItemLine, WorkshopWindow } from '@framezen/engine'
import {
  AngleText,
  Box,
  CutShape,
  DocHeader,
  DocRoot,
  Sheet,
  WarningsCallout,
  WindowBand,
  WindowSketch,
  WriteField,
} from './common'
import { fmtGlassMm, fmtMm, fmtQty, plural } from './format'
import { codesByCut, colorInfo, consolidateItems, formatCodeRange, orderedCuts, otLabel, sideWords, workshopPieceCodes } from './helpers'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

/** Estaciones de la OT (mismo orden que el tablero de producción). */
export const WORKSHOP_STATIONS = [
  { id: 'cut', label: 'Corte' },
  { id: 'weld', label: 'Soldadura' },
  { id: 'assembly', label: 'Armado' },
  { id: 'hardware', label: 'Herrajes' },
  { id: 'glazing', label: 'Vidriado' },
  { id: 'qc', label: 'Control' },
  { id: 'ready', label: 'Listo' },
] as const

export interface WorkOrderDocumentProps extends WorkshopDocumentProps {
  /** Sólo estas ventanas (por ref). Por defecto, todas. */
  refs?: string[]
}

/** Orden de trabajo: una hoja por ventana con dibujo, cortes, refuerzos, herrajes y vidrio. */
export function WorkOrderDocument({ data, paper, refs }: WorkOrderDocumentProps) {
  const windows = refs ? data.windows.filter((w) => refs.includes(w.ref)) : data.windows
  const footer = `${otLabel(data)} · Orden de trabajo · ${data.quote.title}`
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="work-order">
      {windows.map((window, i) => (
        <WorkOrderSheet key={window.ref} data={data} window={window} footer={footer} position={`${window.ref} · ventana ${i + 1} de ${windows.length}`} />
      ))}
    </DocRoot>
  )
}

function WorkOrderSheet(props: { data: WorkshopDocumentData; window: WorkshopWindow; footer: string; position: string }) {
  const { data, window } = props
  const units = workshopPieceCodes(window)
  const codes = codesByCut(units)
  const ordered = orderedCuts(window.bom.cuts)
  const profiles = ordered.filter((c) => c.piece.kind === 'profile')
  const beads = ordered.filter((c) => c.piece.kind === 'bead')
  const reinforcements = ordered.filter((c) => c.piece.kind === 'reinforcement')
  const piecesPerUnit = window.bom.cuts.reduce((s, c) => s + c.qty, 0)
  const items = consolidateItems(window.bom.items)
  const hardware = items.filter((i) => i.kind === 'hardware')
  const accessories = items.filter((i) => i.kind !== 'hardware')
  const notes = data.windowNotes?.[window.ref]

  return (
    <Sheet footer={props.footer} footRight={props.position}>
      <DocHeader data={data} kicker="Orden de trabajo" meta={<>Ventana <strong>{window.ref}</strong></>} />
      <WindowBand window={window} />
      {/* Los avisos de precio van en Costos y Materiales: en la hoja de fabricación solo distraen. */}
      <WarningsCallout warnings={window.bom.warnings.filter((w) => !w.code.startsWith('price_'))} />
      {/* Ruta de producción arriba: siempre en la primera hoja de la ventana (al pie quedaba sola en una hoja). */}
      <div className="fzw-avoid fzw-ot-route">
        <div className="fzw-stations" aria-label="Avance por estación">
          {WORKSHOP_STATIONS.map((s) => (
            <div key={s.id} className="fzw-station">
              <div className="fzw-station-top">
                <span>{s.label}</span>
                <Box large label={`Marcar ${s.label}`} />
              </div>
              <WriteField label="Iniciales" />
            </div>
          ))}
        </div>
      </div>

      <div className="fzw-grid-ot">
        <div>
          <figure className="fzw-drawing" style={{ margin: 0 }}>
            <WindowSketch window={window} catalog={data.catalog} width={290} height={220} />
            <figcaption className="fzw-drawing-caption">
              <span>Vista interior</span>
              <span>Cotas exteriores en mm</span>
            </figcaption>
          </figure>
          <div className="fzw-ot-side">
            <WriteField label="Diagonal 1" />
            <WriteField label="Diagonal 2" />
            <span className="fzw-small fzw-muted">Escuadra: diferencia máxima entre diagonales 1,5 mm.</span>
          </div>
          <div className="fzw-ot-side">
            <span className="fzw-small fzw-cell-title">Notas</span>
            {data.workOrder.notes ? <p className="fzw-notes-text">{data.workOrder.notes}</p> : null}
            {notes ? <p className="fzw-notes-text">{notes}</p> : null}
            <div className="fzw-lines">
              <div />
            </div>
          </div>
        </div>
        <div>
          <h2 className="fzw-h">
            Vidrios <small>medida de corte, ancho × alto</small>
          </h2>
          <GlassTable window={window} />
          <h2 className="fzw-h">
            Herrajes y accesorios <small>{window.qty > 1 ? `total para ${window.qty} unidades` : 'para esta ventana'}</small>
          </h2>
          <ItemsTable hardware={hardware} accessories={accessories} windowQty={window.qty} />
        </div>
      </div>

      <CutsTable
        caption={
          <>
            {window.ref} · Cortes <small>{plural(piecesPerUnit, 'pieza')} por unidad · largo de corte en mm, con soldadura incluida</small>
          </>
        }
        rows={[
          { title: 'Perfiles', items: profiles },
          { title: 'Junquillos', items: beads },
          { title: 'Refuerzos · acero, corte recto; el código indica la pieza que refuerza', items: reinforcements },
        ]}
        codes={codes}
        window={window}
        data={data}
      />

    </Sheet>
  )
}

interface CutRow {
  piece: CutPiece
  qty: number
  codes: string[]
  key: string
}

/** Une cortes idénticos (mismo perfil, color, largo, ángulos y lado) en una sola fila. */
function mergeCutRows(items: { piece: CutPiece; index: number }[], codes: Map<number, string[]>): CutRow[] {
  const rows: CutRow[] = []
  const byKey = new Map<string, CutRow>()
  for (const { piece, index } of items) {
    const key = [piece.kind, piece.code, piece.colorId ?? '', piece.length.toFixed(1), piece.angleStart, piece.angleEnd, piece.label].join('|')
    const prev = byKey.get(key)
    if (prev) {
      prev.qty += piece.qty
      prev.codes.push(...(codes.get(index) ?? []))
    } else {
      const row: CutRow = { piece, qty: piece.qty, codes: [...(codes.get(index) ?? [])], key: `${index}` }
      byKey.set(key, row)
      rows.push(row)
    }
  }
  return rows
}

function CutsTable(props: {
  /** Título que se repite en cada página impresa (va dentro del encabezado de la tabla). */
  caption: ReactNode
  rows: { title: string; items: { piece: CutPiece; index: number }[] }[]
  codes: Map<number, string[]>
  window: WorkshopWindow
  data: WorkshopDocumentData
}) {
  const { window } = props
  const windowColors = new Set([window.design.colorId, window.design.colorInId ?? window.design.colorId])
  const groups = props.rows.filter((r) => r.items.length > 0)
  if (groups.length === 0) return <p className="fzw-muted">Esta ventana no tiene cortes calculados.</p>
  return (
    <table className="fzw-table fzw-table-cuts">
      <thead>
        <tr className="fzw-thead-title">
          <th colSpan={7}>
            <h2 className="fzw-h">{props.caption}</h2>
          </th>
        </tr>
        <tr>
          <th className="chk" aria-label="Cortado" />
          <th>Pieza</th>
          <th>Lado</th>
          <th>Corte</th>
          <th className="num">Cant.</th>
          <th className="num">Medida mm</th>
          <th>Código</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => [
          group.title ? (
            <tr key={`g-${group.title}`} className="fzw-group">
              <td colSpan={7}>{group.title}</td>
            </tr>
          ) : null,
          ...mergeCutRows(group.items, props.codes).map((row) => {
            const { piece } = row
            const color = colorInfo(props.data.catalog, piece.colorId)
            const total = row.qty * window.qty
            return (
              <tr key={row.key}>
                <td className="chk">
                  <Box label="Marcar cortado" />
                </td>
                <td>
                  <span className="fzw-cell-title">{piece.name}</span>{' '}
                  <span className="fzw-mono fzw-muted">{piece.code}</span>
                  {color && !windowColors.has(piece.colorId ?? '') ? <span className="fzw-muted"> · {color.name}</span> : null}
                </td>
                <td className={sideWords(piece.label).length <= 22 ? 'fzw-nowrap' : undefined}>{sideWords(piece.label)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                    <CutShape start={piece.angleStart} end={piece.angleEnd} />
                    <AngleText start={piece.angleStart} end={piece.angleEnd} />
                  </div>
                </td>
                <td className="num">
                  <span className="fzw-mid">{fmtQty(total)}</span>
                  {window.qty > 1 ? <div className="fzw-cell-sub">{`${fmtQty(row.qty)} × ${window.qty}`}</div> : null}
                </td>
                <td className="num">
                  <span className="fzw-big">{fmtMm(piece.length)}</span>
                </td>
                <td className="fzw-mono fzw-small">{formatCodeRange(row.codes)}</td>
              </tr>
            )
          }),
        ])}
      </tbody>
    </table>
  )
}

function GlassTable(props: { window: WorkshopWindow }) {
  const glass = props.window.bom.glass
  if (glass.length === 0) return <p className="fzw-muted fzw-small">Sin vidrios.</p>
  return (
    <table className="fzw-table fzw-table-dense">
      <thead>
        <tr>
          <th>Paño</th>
          <th className="num">Medida mm</th>
          <th className="num">Cant.</th>
        </tr>
      </thead>
      <tbody>
        {glass.map((g, i) => (
          <tr key={`${g.nodeId}-${i}`}>
            <td>
              <span className="fzw-cell-title">{g.label}</span>{' '}
              <span className="fzw-small fzw-muted">
                {g.name}
                {g.shape && g.shape !== 'rect' ? ' · forma especial, usar plantilla' : ''}
              </span>
            </td>
            <td className="num">
              <span className="fzw-mid">
                {fmtGlassMm(g.width)} × {fmtGlassMm(g.height)}
              </span>
            </td>
            <td className="num">
              <span className="fzw-mid">{fmtQty(g.qty * props.window.qty)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ItemsTable(props: { hardware: ItemLine[]; accessories: ItemLine[]; windowQty: number }) {
  if (props.hardware.length + props.accessories.length === 0) return <p className="fzw-muted fzw-small">Sin herrajes.</p>
  const row = (item: ItemLine, i: number) => (
    <tr key={`${item.itemId}-${i}`}>
      <td className="chk">
        <Box label="Marcar entregado" />
      </td>
      <td className="num">
        <span className="fzw-mid">{fmtQty(item.qty * props.windowQty)}</span>
        <span className="fzw-unit">{item.unit}</span>
      </td>
      <td>
        {item.name} <span className="fzw-mono fzw-muted fzw-small">{item.code}</span>
      </td>
    </tr>
  )
  return (
    <table className="fzw-table fzw-table-dense">
      <thead>
        <tr>
          <th className="chk" aria-label="Entregado" />
          <th className="num">Cant.</th>
          <th>Descripción</th>
        </tr>
      </thead>
      <tbody>
        {props.hardware.length > 0 ? (
          <tr className="fzw-group">
            <td colSpan={3}>Herrajes</td>
          </tr>
        ) : null}
        {props.hardware.map(row)}
        {props.accessories.length > 0 ? (
          <tr className="fzw-group">
            <td colSpan={3}>Accesorios e insumos</td>
          </tr>
        ) : null}
        {props.accessories.map(row)}
      </tbody>
    </table>
  )
}
