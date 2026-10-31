import type { GlassLine } from '@framezen/engine'
import { Box, DocHeader, DocRoot, Sheet, Signatures, WriteField } from './common'
import { floorHalfMm, fmtGlassMm, fmtInt, fmtM2, fmtMm, fmtNumber, plural, roundTenth } from './format'
import { glassInfo, otLabel } from './helpers'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

const SHAPE_NAMES: Record<string, string> = {
  arch: 'Arco',
  trapezoid: 'Trapecio',
  triangle: 'Triángulo',
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
export function GlassListDocument({ data, paper }: WorkshopDocumentProps) {
  const groups = groupGlassLines(data)
  const pieces = groups.reduce((s, g) => s + g.pieces, 0)
  const area = groups.reduce((s, g) => s + g.area, 0)
  const footer = `${data.org.name} · ${otLabel(data)} · Pedido de vidrios`
  const adjusted = data.glass.some((l) => floorHalfMm(l.width) !== roundTenth(l.width) || floorHalfMm(l.height) !== roundTenth(l.height))
  const shaped = data.glass.filter((l) => l.shape && l.shape !== 'rect')
  const sealsInMaterials = hasInsulatedGlassSupplies(data)

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="glass">
      <Sheet footer={footer}>
        <DocHeader data={data} kicker="Pedido de vidrios" audience="supplier" />

        <div className="fzw-grid-2" style={{ marginBottom: '4mm' }}>
          <div style={{ display: 'grid', gap: '3mm' }}>
            <WriteField label="Proveedor" />
            <WriteField label="Fecha de pedido" />
          </div>
          <div style={{ display: 'grid', gap: '3mm' }}>
            <WriteField label="Entrega comprometida" />
            <WriteField label="Contacto" />
          </div>
        </div>

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>Piezas</span>
            <strong>{fmtInt(pieces)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>Superficie total</span>
            <strong>{fmtM2(area)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>Tipos de vidrio</span>
            <strong>{fmtInt(groups.length)}</strong>
          </div>
        </div>

        <p className="fzw-small fzw-muted" style={{ marginBottom: '2mm' }}>
          Medidas de corte en mm, ancho × alto. Se redondean hacia abajo al 0,5 mm, nunca hacia arriba
          {adjusted ? ': cuando la medida exacta tiene otro decimal, la indicamos debajo.' : '.'}
        </p>

        {groups.map((group) => (
          <div key={group.glassId || group.name}>
            <h2 className="fzw-h" style={{ marginTop: '6mm' }}>
              <span>{group.name}</span>
              <small>
                {[group.composition, group.thickness ? `${fmtMm(group.thickness)} mm de espesor` : null].filter(Boolean).join(' · ')}
                {group.composition || group.thickness ? ' · ' : ''}
                {plural(group.pieces, 'pieza')} · {fmtM2(group.area)}
              </small>
            </h2>
            <table className="fzw-table">
              <thead>
                <tr>
                  <th className="chk">Pedido</th>
                  <th className="chk">Recibido</th>
                  <th className="num">Ancho</th>
                  <th className="num">Alto</th>
                  <th className="num">Cant.</th>
                  <th className="num">m² c/u</th>
                  <th className="num">m² total</th>
                  <th>Ventana y paño</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line, i) => (
                  <GlassRow key={`${line.glassId}-${i}`} line={line} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total {group.name}</td>
                  <td className="num">{fmtInt(group.pieces)}</td>
                  <td />
                  <td className="num">{fmtNumber(group.area, 2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
        {groups.length === 0 ? <p className="fzw-muted">Esta OT no lleva vidrios.</p> : null}

        {shaped.length > 0 ? (
          <div className="fzw-callout fzw-callout-info" role="note">
            <div className="fzw-callout-title">Vidrios con forma</div>
            <ul>
              {shaped.map((l, i) => (
                <li key={i}>
                  {l.refs.join(', ')}: {SHAPE_NAMES[l.shape ?? ''] ?? 'Forma especial'} dentro de {fmtGlassMm(l.width)} ×{' '}
                  {fmtGlassMm(l.height)} mm. Envía la plantilla junto al pedido.
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="fzw-small fzw-muted" style={{ marginTop: '4mm' }}>
          Revisa las medidas contra la OT antes de cortar.
          {sealsInMaterials ? ' Los sellos y separadores del termopanel van en la lista de materiales, en metros.' : ''}
        </p>
        <Signatures labels={['Pedido por', 'Recibido por']} />
      </Sheet>
    </DocRoot>
  )
}

/** Insumos para armar termopanel en el taller (separador, butilo, tamiz, sellante de DVH…). */
const INSULATED_GLASS_SUPPLY = /separador|espaciador|butil|tamiz|polisulfur|hot.?melt|(sell(o|ante)) (de |para )?(dvh|termopanel)/i

/** ¿La OT arma termopanel en el taller? Solo entonces la lista de materiales trae sellos y separadores. */
export function hasInsulatedGlassSupplies(data: Pick<WorkshopDocumentData, 'materials'>): boolean {
  return data.materials.some((l) => (l.group === 'accessory' || l.group === 'hardware') && INSULATED_GLASS_SUPPLY.test(`${l.name} ${l.code}`))
}

function GlassRow({ line }: { line: GlassLine }) {
  const exactW = roundTenth(line.width)
  const exactH = roundTenth(line.height)
  const showW = floorHalfMm(line.width) !== exactW
  const showH = floorHalfMm(line.height) !== exactH
  const shape = line.shape && line.shape !== 'rect' ? SHAPE_NAMES[line.shape] : undefined
  return (
    <tr>
      <td className="chk">
        <Box label="Marcar pedido" />
      </td>
      <td className="chk">
        <Box label="Marcar recibido" />
      </td>
      <td className="num">
        <span className="fzw-mid">{fmtGlassMm(line.width)}</span>
        {showW ? <div className="fzw-cell-sub">exacto {fmtMm(exactW)}</div> : null}
      </td>
      <td className="num">
        <span className="fzw-mid">{fmtGlassMm(line.height)}</span>
        {showH ? <div className="fzw-cell-sub">exacto {fmtMm(exactH)}</div> : null}
      </td>
      <td className="num">
        <span className="fzw-mid">{fmtInt(line.qty)}</span>
      </td>
      <td className="num">{fmtNumber(line.area, 2)}</td>
      <td className="num">{fmtNumber(line.area * line.qty, 2)}</td>
      <td>
        {line.refs.join(' · ')}
        {shape ? (
          <div>
            <span className="fzw-tag">{shape} · con plantilla</span>
          </div>
        ) : null}
      </td>
    </tr>
  )
}
