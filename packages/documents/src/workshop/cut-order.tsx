import type { OptimizationGroup } from '@dekopen/engine'
import { barGeometry, barPieceIds, barPieceRows, groupSaw, groupWeld, type BarPieceId } from './bars'
import { AngleText, Box, CutShape, DocHeader, DocRoot, Sheet } from './common'
import { colorInfo, otLabel, quoteTitle, uniqueFooter, partsKicker } from './helpers'
import { resolveWorkshopLocale, type WorkshopI18n } from './locale'
import { filterCutParts, type CutPartKind } from './parts'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

export interface CutOrderDocumentProps extends WorkshopDocumentProps {
  /** Pasos a dibujar como máximo, para la vista previa en pantalla. Sin límite, todos. */
  maxSteps?: number
  /** Solo estos tipos de pieza (todos si falta). */
  parts?: readonly CutPartKind[]
}

/**
 * Orden de corte: la secuencia para el operador de la sierra, perfil por perfil y barra por barra,
 * en el mismo orden en que cada pieza sale de la barra. Si la medida se repite, el tope no se mueve
 * y la fila lo dice.
 */
export function CutOrderDocument({ data: full, paper, maxSteps, parts, locale, currency, taxLabel }: CutOrderDocumentProps) {
  const data = filterCutParts(full, parts)
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('order.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const ids = barPieceIds(data)
  let left = maxSteps === undefined ? Infinity : Math.max(0, Math.floor(maxSteps))
  const groups = data.optimization.groups
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="cut-order" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={partsKicker(t('order.kicker'), parts, w)} meta={t('order.meta', { bars: t('common.bars', { count: data.optimization.totalBars }), pieces: t('common.pieces', { count: data.optimization.totalPieces }) })} w={w} />
        <p className="fzw-small fzw-muted" style={{ marginBottom: '2mm' }}>
          {t('order.intro')}
        </p>
        {groups.map((group) => {
          if (left <= 0) return null
          const rows = group.bars.reduce((s, b) => s + b.cuts.length, 0)
          const limit = left
          left -= rows
          return <GroupTable key={group.key} group={group} ids={ids.get(group.key)} data={data} limit={limit} w={w} />
        })}
        {groups.length === 0 ? <p className="fzw-muted">{t('cuts.empty')}</p> : null}
      </Sheet>
    </DocRoot>
  )
}

function GroupTable({ group, ids, data, limit, w }: { group: OptimizationGroup; ids: (BarPieceId | undefined)[][] | undefined; data: WorkshopDocumentData; limit: number; w: WorkshopI18n }) {
  const t = w.t
  const color = colorInfo(data.catalog, group.colorId)
  const saw = groupSaw(group, data.cut)
  const weld = groupWeld(data.catalog, group)
  let step = 0
  let previous: number | null = null
  return (
    <table className="fzw-table fzw-table-order">
      <thead>
        <tr className="fzw-thead-title">
          <th colSpan={7}>
            <h2 className="fzw-h">
              <span>
                <span className="fzw-mono">{group.code}</span> {group.name}
                {color ? ` · ${color.name}` : ''}
              </span>
              <small>
                {t('cuts.groupSaw', { kerf: w.f.mm(saw.kerf), start: w.f.mm(saw.trimStart), end: w.f.mm(saw.trimEnd) })}
                {weld !== null ? ` · ${t('cuts.weldNote', { weld: w.f.mm(weld), total: w.f.mm(weld * 2) })}` : ''}
              </small>
            </h2>
          </th>
        </tr>
        <tr>
          <th className="chk" aria-label={t('order.done')} />
          <th className="num">{t('order.step')}</th>
          <th className="num">{t('order.measure')}</th>
          <th>{t('order.stop')}</th>
          <th>{t('order.cut')}</th>
          <th>{t('order.piece')}</th>
          <th>{t('order.side')}</th>
        </tr>
      </thead>
      <tbody>
        {group.bars.map((bar, b) => {
          if (step >= limit) return null
          const geo = barGeometry(bar, data.cut)
          const rows = barPieceRows(bar, ids?.[b]).slice(0, Math.max(0, limit - step))
          return [
            <tr key={`b${b}`} className="fzw-group">
              <td colSpan={7}>
                {t('cuts.barNo', { n: b + 1, total: group.bars.length })}
                <span className="fzw-order-bar">
                  {bar.fromOffcut ? t('cuts.fromOffcutOf', { mm: w.f.mm(bar.barLength) }) : t('cuts.barOf', { mm: w.f.mm(bar.barLength) })}
                  {geo.trimStart > 0 ? ` · ${t('order.trimFirst', { mm: w.f.mm(geo.trimStart) })}` : ''}
                  {' · '}
                  {geo.reusable ? t('order.endsOffcut', { mm: w.f.mm(geo.remainder) }) : t('order.endsWaste', { mm: w.f.mm(geo.remainder) })}
                </span>
              </td>
            </tr>,
            ...rows.map((row) => {
              step++
              const same = previous === row.cut.length
              previous = row.cut.length
              const start = row.cut.angleStart ?? 90
              const end = row.cut.angleEnd ?? 90
              return (
                <tr key={`${b}-${row.n}`}>
                  <td className="chk">
                    <Box label={t('cuts.markCut')} w={w} />
                  </td>
                  <td className="num">{w.f.int(step)}</td>
                  <td className="num">
                    <span className="fzw-big">{w.f.mm(row.cut.length)}</span>
                  </td>
                  <td className="fzw-small">{same ? t('order.sameStop') : t('order.moveStop')}</td>
                  <td>
                    <span className="fzw-bp-cut">
                      <CutShape start={start} end={end} width={34} height={12} w={w} />
                      <AngleText start={start} end={end} w={w} />
                    </span>
                  </td>
                  <td>
                    <span className="fzw-cell-title">{row.id?.code ?? row.cut.ref ?? ''}</span>
                    {row.id && row.id.units > 1 ? <span className="fzw-small fzw-muted">{` ${t('cuts.unitShort', { n: row.id.unit })}`}</span> : null}
                  </td>
                  <td>{row.id ? w.side(row.id.side) : row.cut.label}</td>
                </tr>
              )
            }),
          ]
        })}
      </tbody>
    </table>
  )
}
