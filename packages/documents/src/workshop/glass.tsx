import type { GlassLine } from '@dekopen/engine'
import { shapeName } from '@dekopen/shared'
import { Box, DocHeader, DocRoot, Sheet, Signatures, WriteField } from './common'
import { GlassTemplateSheets } from './glass-plan'
import { floorHalfMm, roundTenth } from './format'
import { glassInfo, otLabel } from './helpers'
import { resolveWorkshopLocale, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

const SHAPE_NAMES: Record<string, string> = {
  arch: 'Arco',
  trapezoid: 'Trapecio',
  triangle: 'Triángulo',
}

/** Nombre de la forma del vidrio (en español, el rótulo corto de siempre; si no, el glosario). */
function glassShapeName(shape: string | undefined, w: WorkshopI18n): string {
  if (!shape) return w.t('glass.specialShape')
  if (w.locale === 'es') return SHAPE_NAMES[shape] ?? shapeName(shape, 'es')
  const name = shapeName(shape, w.locale)
  return name && name !== shape ? name : w.t('glass.specialShape')
}

export interface GlassGroup {
  glassId: string
  name: string
  composition?: string
  thickness?: number
  lines: GlassLine[]
  pieces: number
  area: number
}

/** Agrupa las líneas de vidrio por tipo, ordenadas de la más grande a la más chica. */
export function groupGlassLines(data: WorkshopDocumentData): GlassGroup[] {
  const map = new Map<string, GlassGroup>()
  for (const line of data.glass) {
    const info = glassInfo(data.catalog, line.glassId)
    const key = line.glassId || line.name
    const group =
      map.get(key) ??
      ({
        glassId: line.glassId,
        name: info?.name ?? line.name,
        composition: info?.composition,
        thickness: info?.thickness,
        lines: [],
        pieces: 0,
        area: 0,
      } satisfies GlassGroup)
    group.lines.push(line)
    group.pieces += line.qty
    group.area += line.area * line.qty
    map.set(key, group)
  }
  for (const g of map.values()) {
    g.lines.sort((a, b) => b.width - a.width || b.height - a.height)
  }
  return [...map.values()]
}

/**
 * Pedido de vidrios al proveedor: agrupado por tipo, con medidas exactas al 0,5 mm
 * redondeadas hacia abajo (nunca hacia arriba), cantidades, m², referencias y casillas.
 */
export function GlassListDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const groups = groupGlassLines(data)
  const pieces = groups.reduce((s, g) => s + g.pieces, 0)
  const area = groups.reduce((s, g) => s + g.area, 0)
  const footer = t('glass.footer', { org: data.org.name, ot: otLabel(data, w) })
  const adjusted = data.glass.some((l) => floorHalfMm(l.width) !== roundTenth(l.width) || floorHalfMm(l.height) !== roundTenth(l.height))
  const shaped = data.glass.filter((l) => l.shape && l.shape !== 'rect')
  const sealsInMaterials = hasInsulatedGlassSupplies(data)

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="glass" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('glass.kicker')} audience="supplier" w={w} />

        <div className="fzw-grid-2" style={{ marginBottom: '4mm' }}>
          <div style={{ display: 'grid', gap: '3mm' }}>
            <WriteField label={t('glass.supplier')} />
            <WriteField label={t('glass.orderDate')} />
          </div>
          <div style={{ display: 'grid', gap: '3mm' }}>
            <WriteField label={t('glass.promised')} />
            <WriteField label={t('glass.contact')} />
          </div>
        </div>

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>{t('glass.pieces')}</span>
            <strong>{w.f.int(pieces)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>{t('glass.area')}</span>
            <strong>{w.f.m2(area)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>{t('glass.kinds')}</span>
            <strong>{w.f.int(groups.length)}</strong>
          </div>
        </div>

        <p className="fzw-small fzw-muted" style={{ marginBottom: '2mm' }}>
          {adjusted ? t('glass.noteAdjusted') : t('glass.note')}
        </p>

        {groups.map((group) => (
          <div key={group.glassId || group.name}>
            <h2 className="fzw-h" style={{ marginTop: '6mm' }}>
              <span>{group.name}</span>
              <small>
                {[group.composition, group.thickness ? t('glass.thickness', { mm: w.f.mm(group.thickness) }) : null].filter(Boolean).join(' · ')}
                {group.composition || group.thickness ? ' · ' : ''}
                {t('common.pieces', { count: group.pieces })} · {w.f.m2(group.area)}
              </small>
            </h2>
            <table className="fzw-table">
              <thead>
                <tr>
                  <th className="chk">{t('glass.ordered')}</th>
                  <th className="chk">{t('glass.received')}</th>
                  <th className="num">{t('glass.width')}</th>
                  <th className="num">{t('glass.height')}</th>
                  <th className="num">{t('glass.qty')}</th>
                  <th className="num">{t('glass.areaEach')}</th>
                  <th className="num">{t('glass.areaTotal')}</th>
                  <th>{t('glass.windowPane')}</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line, i) => (
                  <GlassRow key={`${line.glassId}-${i}`} line={line} w={w} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{t('glass.total', { name: group.name })}</td>
                  <td className="num">{w.f.int(group.pieces)}</td>
                  <td />
                  <td className="num">{w.f.number(group.area, 2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
        {groups.length === 0 ? <p className="fzw-muted">{t('glass.empty')}</p> : null}

        {shaped.length > 0 ? (
          <div className="fzw-callout fzw-callout-info" role="note">
            <div className="fzw-callout-title">{t('glass.shapedTitle')}</div>
            <ul>
              {shaped.map((l, i) => (
                <li key={i}>
                  {t('glass.shapedLine', { refs: l.refs.map((r) => w.ref(r)).join(', '), shape: glassShapeName(l.shape, w), width: w.f.glassMm(l.width), height: w.f.glassMm(l.height) })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="fzw-small fzw-muted" style={{ marginTop: '4mm' }}>
          {t('glass.checkNote')}
          {sealsInMaterials ? t('glass.sealsNote') : ''}
        </p>
        <Signatures labels={[t('glass.orderedBy'), t('glass.receivedBy')]} w={w} />
      </Sheet>
      <GlassTemplateSheets data={data} footer={footer} w={w} supplier />
    </DocRoot>
  )
}

/** Insumos para armar termopanel en el taller (separador, butilo, tamiz, sellante de DVH…). */
const INSULATED_GLASS_SUPPLY = /separador|espaciador|butil|tamiz|polisulfur|hot.?melt|(sell(o|ante)) (de |para )?(dvh|termopanel)/i

/** ¿La OT arma termopanel en el taller? Solo entonces la lista de materiales trae sellos y separadores. */
export function hasInsulatedGlassSupplies(data: Pick<WorkshopDocumentData, 'materials'>): boolean {
  return data.materials.some((l) => (l.group === 'accessory' || l.group === 'hardware') && INSULATED_GLASS_SUPPLY.test(`${l.name} ${l.code}`))
}

function GlassRow({ line, w }: { line: GlassLine; w: WorkshopI18n }) {
  const t = w.t
  const exactW = roundTenth(line.width)
  const exactH = roundTenth(line.height)
  const showW = floorHalfMm(line.width) !== exactW
  const showH = floorHalfMm(line.height) !== exactH
  const shape = line.shape && line.shape !== 'rect' ? glassShapeName(line.shape, w) : undefined
  return (
    <tr>
      <td className="chk">
        <Box label={t('glass.markOrdered')} w={w} />
      </td>
      <td className="chk">
        <Box label={t('glass.markReceived')} w={w} />
      </td>
      <td className="num">
        <span className="fzw-mid">{w.f.glassMm(line.width)}</span>
        {showW ? <div className="fzw-cell-sub">{t('glass.exact', { mm: w.f.mm(exactW) })}</div> : null}
      </td>
      <td className="num">
        <span className="fzw-mid">{w.f.glassMm(line.height)}</span>
        {showH ? <div className="fzw-cell-sub">{t('glass.exact', { mm: w.f.mm(exactH) })}</div> : null}
      </td>
      <td className="num">
        <span className="fzw-mid">{w.f.int(line.qty)}</span>
      </td>
      <td className="num">{w.f.number(line.area, 2)}</td>
      <td className="num">{w.f.number(line.area * line.qty, 2)}</td>
      <td>
        {line.refs.map((r) => w.ref(r)).join(' · ')}
        {shape ? (
          <div>
            <span className="fzw-tag">{t('glass.withTemplate', { shape })}</span>
          </div>
        ) : null}
      </td>
    </tr>
  )
}
