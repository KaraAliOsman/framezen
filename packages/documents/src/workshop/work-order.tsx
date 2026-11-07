import type { ReactNode } from 'react'
import type { CutPiece, ItemLine, WorkshopWindow } from '@dekopen/engine'
import {
  AngleText,
  Box,
  CutShape,
  DocHeader,
  DocRoot,
  Sheet,
  UnbackedNote,
  WarningsCallout,
  WindowBand,
  WindowSketch,
  WriteField,
} from './common'
import { unbackedLines } from './bars'
import { codesByCut, colorInfo, consolidateItems, formatCodeRange, orderedCuts, otLabel, quoteTitle, uniqueFooter, workshopPieceCodes } from './helpers'
import { resolveWorkshopLocale, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

/** Estaciones de la OT (mismo orden que el tablero de producción). `label` en español; en otro idioma, el glosario. */
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
export function WorkOrderDocument({ data, paper, refs, locale, currency, taxLabel }: WorkOrderDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const windows = refs ? data.windows.filter((x) => refs.includes(x.ref)) : data.windows
  const footer = uniqueFooter(w.t('workOrder.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="work-order" w={w}>
      {windows.map((window, i) => (
        <WorkOrderSheet
          key={window.ref}
          data={data}
          window={window}
          footer={footer}
          position={w.t('workOrder.position', { ref: window.ref, index: i + 1, total: windows.length })}
          w={w}
        />
      ))}
    </DocRoot>
  )
}

function WorkOrderSheet(props: { data: WorkshopDocumentData; window: WorkshopWindow; footer: string; position: string; w: WorkshopI18n }) {
  const { data, window, w } = props
  const t = w.t
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
      <DocHeader data={data} kicker={t('workOrder.kicker')} meta={<>{t('workOrder.window')} <strong>{window.ref}</strong></>} w={w} />
      <WindowBand window={window} w={w} />
      {/* Los avisos de precio van en Costos y Materiales: en la hoja de fabricación solo distraen. */}
      <WarningsCallout warnings={window.bom.warnings.filter((x) => !x.code.startsWith('price_'))} w={w} />
      <UnbackedNote lines={unbackedLines(data.catalog, [window])} w={w} />
      {/* Ruta de producción arriba: siempre en la primera hoja de la ventana (al pie quedaba sola en una hoja). */}
      <div className="fzw-avoid fzw-ot-route">
        <div className="fzw-stations" aria-label={t('workOrder.stationsAria')}>
          {WORKSHOP_STATIONS.map((s) => {
            const label = w.locale === 'es' ? s.label : w.station(s.id)
            return (
              <div key={s.id} className="fzw-station">
                <div className="fzw-station-top">
                  <span>{label}</span>
                  <Box large label={t('workOrder.markStation', { station: label })} w={w} />
                </div>
                <WriteField label={t('workOrder.initials')} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="fzw-grid-ot">
        <div>
          <figure className="fzw-drawing" style={{ margin: 0 }}>
            <WindowSketch window={window} catalog={data.catalog} width={290} height={220} />
            <figcaption className="fzw-drawing-caption">
              <span>{t('common.interiorView')}</span>
              <span>{t('workOrder.dimsNote')}</span>
            </figcaption>
          </figure>
          <div className="fzw-ot-side">
            <WriteField label={t('workOrder.diagonal1')} />
            <WriteField label={t('workOrder.diagonal2')} />
          </div>
          <div className="fzw-ot-side">
            <span className="fzw-small fzw-cell-title">{t('workOrder.notes')}</span>
            {data.workOrder.notes ? <p className="fzw-notes-text">{data.workOrder.notes}</p> : null}
            {notes ? <p className="fzw-notes-text">{notes}</p> : null}
            <div className="fzw-lines">
              <div />
            </div>
          </div>
        </div>
        <div>
          <h2 className="fzw-h">
            {t('workOrder.glass')} <small>{t('workOrder.glassHint')}</small>
          </h2>
          <GlassTable window={window} w={w} />
          <h2 className="fzw-h">
            {t('workOrder.hardware')} <small>{window.qty > 1 ? t('workOrder.hardwareTotal', { count: window.qty }) : t('workOrder.hardwareOne')}</small>
          </h2>
          <ItemsTable hardware={hardware} accessories={accessories} windowQty={window.qty} w={w} />
        </div>
      </div>

      <CutsTable
        caption={
          <>
            {t('workOrder.cutsTitle', { ref: window.ref })} <small>{t('workOrder.cutsHint', { pieces: t('common.pieces', { count: piecesPerUnit }) })}</small>
          </>
        }
        rows={[
          { title: t('workOrder.profiles'), items: profiles },
          { title: t('workOrder.beads'), items: beads },
          { title: t('workOrder.reinforcements'), items: reinforcements },
        ]}
        codes={codes}
        window={window}
        data={data}
        w={w}
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
  w: WorkshopI18n
}) {
  const { window, w } = props
  const t = w.t
  const windowColors = new Set([window.design.colorId, window.design.colorInId ?? window.design.colorId])
  const groups = props.rows.filter((r) => r.items.length > 0)
  if (groups.length === 0) return <p className="fzw-muted">{t('workOrder.noCuts')}</p>
  return (
    <table className="fzw-table fzw-table-cuts">
      <thead>
        <tr className="fzw-thead-title">
          <th colSpan={7}>
            <h2 className="fzw-h">{props.caption}</h2>
          </th>
        </tr>
        <tr>
          <th className="chk" aria-label={t('workOrder.cut')} />
          <th>{t('workOrder.piece')}</th>
          <th>{t('workOrder.side')}</th>
          <th>{t('workOrder.cutShape')}</th>
          <th className="num">{t('workOrder.qty')}</th>
          <th className="num">{t('workOrder.length')}</th>
          <th>{t('workOrder.code')}</th>
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
            const side = w.side(piece.label)
            return (
              <tr key={row.key}>
                <td className="chk">
                  <Box label={t('workOrder.markCut')} w={w} />
                </td>
                <td>
                  <span className="fzw-cell-title">{piece.name}</span> <span className="fzw-mono fzw-muted">{piece.code}</span>
                  {color && !windowColors.has(piece.colorId ?? '') ? <span className="fzw-muted"> · {color.name}</span> : null}
                </td>
                <td className={side.length <= 22 ? 'fzw-nowrap' : undefined}>{side}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                    <CutShape start={piece.angleStart} end={piece.angleEnd} w={w} />
                    <AngleText start={piece.angleStart} end={piece.angleEnd} w={w} />
                  </div>
                </td>
                <td className="num">
                  <span className="fzw-mid">{w.f.qty(total)}</span>
                  {window.qty > 1 ? <div className="fzw-cell-sub">{`${w.f.qty(row.qty)} × ${window.qty}`}</div> : null}
                </td>
                <td className="num">
                  <span className="fzw-big">{w.f.mm(piece.length)}</span>
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

function GlassTable(props: { window: WorkshopWindow; w: WorkshopI18n }) {
  const { w } = props
  const t = w.t
  const glass = props.window.bom.glass
  if (glass.length === 0) return <p className="fzw-muted fzw-small">{t('workOrder.noGlass')}</p>
  return (
    <table className="fzw-table fzw-table-dense">
      <thead>
        <tr>
          <th>{t('workOrder.pane')}</th>
          <th className="num">{t('workOrder.length')}</th>
          <th className="num">{t('workOrder.qty')}</th>
        </tr>
      </thead>
      <tbody>
        {glass.map((g, i) => (
          <tr key={`${g.nodeId}-${i}`}>
            <td>
              <span className="fzw-cell-title">{w.cell(g.label)}</span>{' '}
              <span className="fzw-small fzw-muted">
                {g.name}
                {g.shape && g.shape !== 'rect' ? t('workOrder.shapedGlass') : ''}
              </span>
            </td>
            <td className="num">
              <span className="fzw-mid">
                {w.f.glassMm(g.width)} × {w.f.glassMm(g.height)}
              </span>
            </td>
            <td className="num">
              <span className="fzw-mid">{w.f.qty(g.qty * props.window.qty)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ItemsTable(props: { hardware: ItemLine[]; accessories: ItemLine[]; windowQty: number; w: WorkshopI18n }) {
  const { w } = props
  const t = w.t
  if (props.hardware.length + props.accessories.length === 0) return <p className="fzw-muted fzw-small">{t('workOrder.noHardware')}</p>
  const row = (item: ItemLine, i: number) => (
    <tr key={`${item.itemId}-${i}`}>
      <td className="chk">
        <Box label={t('workOrder.markDelivered')} w={w} />
      </td>
      <td className="num">
        <span className="fzw-mid">{w.f.qty(item.qty * props.windowQty)}</span>
        <span className="fzw-unit">{w.unit(item.unit)}</span>
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
          <th className="chk" aria-label={t('workOrder.delivered')} />
          <th className="num">{t('workOrder.qty')}</th>
          <th>{t('workOrder.description')}</th>
        </tr>
      </thead>
      <tbody>
        {props.hardware.length > 0 ? (
          <tr className="fzw-group">
            <td colSpan={3}>{t('workOrder.hardwareGroup')}</td>
          </tr>
        ) : null}
        {props.hardware.map(row)}
        {props.accessories.length > 0 ? (
          <tr className="fzw-group">
            <td colSpan={3}>{t('workOrder.accessoriesGroup')}</td>
          </tr>
        ) : null}
        {props.accessories.map(row)}
      </tbody>
    </table>
  )
}
