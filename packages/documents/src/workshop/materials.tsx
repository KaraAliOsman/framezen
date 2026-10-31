import type { MaterialLine } from '@framezen/engine'
import { Box, DocHeader, DocRoot, Sheet, Signatures } from './common'
import { fmtInt, fmtM2, fmtMeters, fmtMoney, fmtNumber, fmtQty } from './format'
import { colorInfo, itemByCode, otLabel, materialCode } from './helpers'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

export const WORKSHOP_MATERIAL_GROUPS: { id: MaterialLine['group']; title: string; hint: string }[] = [
  { id: 'profile', title: 'Perfiles', hint: 'barras completas según la optimización' },
  { id: 'reinforcement', title: 'Refuerzos', hint: 'barras de acero' },
  { id: 'hardware', title: 'Herrajes', hint: 'en unidad de compra' },
  { id: 'accessory', title: 'Accesorios e insumos', hint: 'en unidad de compra' },
  { id: 'glass', title: 'Vidrios', hint: 'superficie total por tipo' },
]

export interface MaterialsDocumentProps extends WorkshopDocumentProps {
  /** Mostrar precios unitarios, totales y subtotales (documento interno). */
  showCosts?: boolean
}

function lineMissingPrice(line: MaterialLine): boolean {
  return line.unitCost !== undefined ? line.unitCost <= 0 : line.total !== undefined && line.total <= 0
}

/** Unidad de compra en plural: caja → cajas, par → pares; «u», «m» y «m²» no cambian. */
export function unitPlural(unit: string, n: number): string {
  const u = unit.trim()
  if (n === 1 || !u || /^(u|m|m²|m2|ml|kg|mm|cm)$/i.test(u) || u.endsWith('s')) return u
  return /[aeiouáéíóú]$/i.test(u) ? `${u}s` : /^kit$/i.test(u) ? `${u}s` : `${u}es`
}

/**
 * Detalle de consumo o envase de una línea: «23,45 m en piezas» para barras y, si se compra
 * por envase, cuánto se usa de verdad: «278 u = 1 caja de 1.000».
 */
export function lineDetail(data: WorkshopDocumentData, line: MaterialLine & { consumption?: number; consumptionUnit?: string }): string {
  if (line.group === 'profile' || line.group === 'reinforcement') {
    return line.meters !== undefined ? `${fmtMeters(line.meters)} en piezas` : ''
  }
  if (line.group === 'glass') return ''
  const item = itemByCode(data.catalog, line.code)
  const pack = item?.packSize && item.packSize > 1 ? item.packSize : undefined
  const buy = `${fmtQty(line.qty)} ${unitPlural(line.unit, line.qty)}`
  const per = pack && !/^pares?$/i.test(line.unit.trim()) ? ` de ${fmtInt(pack)}` : ''
  const used = typeof line.consumption === 'number' && Number.isFinite(line.consumption) && line.consumption > 0 ? line.consumption : undefined
  if (used !== undefined && (pack || Math.abs(used - line.qty) > 0.005)) {
    const usedUnit = unitPlural(line.consumptionUnit?.trim() || 'u', used)
    return `${fmtQty(used)} ${usedUnit} = ${buy}${per}`
  }
  if (pack) return `envase de ${fmtInt(pack)} u`
  return ''
}

/**
 * Lista de materiales: barras por perfil y color, refuerzos, herrajes y accesorios en
 * unidad de compra, y vidrios. Con `showCosts` agrega precios y totales (interno).
 */
export function MaterialsDocument({ data, paper, showCosts = false }: MaterialsDocumentProps) {
  const footer = `${otLabel(data)} · ${showCosts ? 'Materiales con costos' : 'Lista de materiales'} · ${data.quote.title}`
  const lines = data.materials
  const sum = (g: MaterialLine['group'], f: (l: MaterialLine) => number) =>
    lines.filter((l) => l.group === g).reduce((s, l) => s + f(l), 0)
  const profileBars = sum('profile', (l) => l.bars ?? l.qty)
  const steelBars = sum('reinforcement', (l) => l.bars ?? l.qty)
  const glassArea = sum('glass', (l) => l.qty)
  const itemsCount = lines.filter((l) => l.group === 'hardware' || l.group === 'accessory').length
  const total = lines.reduce((s, l) => s + (l.total ?? 0), 0)
  const missing = lines.filter(lineMissingPrice)
  // La marca (proveedor) solo aporta si hay más de una; va en la misma línea para no duplicar el alto de cada fila.
  const multiBrand = new Set(lines.map((l) => l.brandName ?? '')).size > 1

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind={showCosts ? 'materials-costs' : 'materials'}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={showCosts ? 'Materiales con costos' : 'Lista de materiales'} />

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>Barras de perfil</span>
            <strong>{fmtQty(profileBars)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>Barras de refuerzo</span>
            <strong>{fmtQty(steelBars)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>Herrajes y accesorios</span>
            <strong>{fmtInt(itemsCount)}</strong>
            <em>artículos distintos</em>
          </div>
          {showCosts ? (
            <div className="fzw-kpi">
              <span>Total materiales</span>
              <strong>{fmtMoney(total)}</strong>
              <em>neto, sin IVA</em>
            </div>
          ) : (
            <div className="fzw-kpi">
              <span>Vidrio</span>
              <strong>{fmtM2(glassArea)}</strong>
            </div>
          )}
        </div>

        {showCosts && missing.length > 0 ? (
          <div className="fzw-callout" role="note">
            <div className="fzw-callout-title">
              {missing.length === 1 ? 'Un artículo no tiene precio' : `${missing.length} artículos no tienen precio`}
            </div>
            <ul>
              <li>
                {missing.map((l) => l.name).join(', ')}. Se calcularon en $0, así que el costo real es mayor. Agrega su precio en
                el catálogo.
              </li>
            </ul>
          </div>
        ) : null}

        {WORKSHOP_MATERIAL_GROUPS.map((group) => {
          const groupLines = lines.filter((l) => l.group === group.id)
          if (groupLines.length === 0) return null
          const subtotal = groupLines.reduce((s, l) => s + (l.total ?? 0), 0)
          const cols = showCosts ? 8 : 6
          return (
            <div key={group.id}>
              <h2 className="fzw-h" style={{ marginTop: '6mm' }}>
                {group.title} <small>{group.hint}</small>
              </h2>
              <table className="fzw-table">
                <thead>
                  <tr>
                    <th className="chk" aria-label="Preparado" />
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Color</th>
                    <th className="num">Cantidad</th>
                    <th>Detalle</th>
                    {showCosts ? <th className="num">Precio unit.</th> : null}
                    {showCosts ? <th className="num">Total</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {groupLines.map((line, i) => {
                    const color = line.colorName ? { name: line.colorName, hex: colorInfo(data.catalog, line.colorId)?.hex } : colorInfo(data.catalog, line.colorId)
                    const noPrice = showCosts && lineMissingPrice(line)
                    return (
                      <tr key={`${line.code}-${line.colorId ?? ''}-${i}`} className={noPrice ? 'fzw-row-warn' : undefined}>
                        <td className="chk">
                          <Box label="Marcar preparado" />
                        </td>
                        <td className="fzw-mono fzw-nowrap">{materialCode(line)}</td>
                        <td>
                          {line.name}
                          {line.brandName && multiBrand ? <span className="fzw-small fzw-muted"> · {line.brandName}</span> : null}
                        </td>
                        <td>
                          {color ? (
                            <span className="fzw-nowrap">
                              {color.hex ? <span className="fzw-swatch" style={{ background: color.hex }} /> : null}
                              {color.name}
                            </span>
                          ) : (
                            <span className="fzw-muted">—</span>
                          )}
                        </td>
                        <td className="num">
                          <span className="fzw-mid">{line.group === 'glass' ? fmtNumber(line.qty, 2) : fmtQty(line.qty)}</span>
                          <span className="fzw-unit">{line.unit}</span>
                        </td>
                        <td className="fzw-small fzw-muted">{lineDetail(data, line)}</td>
                        {showCosts ? (
                          <td className="num">
                            {noPrice ? <span className="fzw-tag">Sin precio</span> : line.unitCost !== undefined ? fmtMoney(line.unitCost) : '—'}
                          </td>
                        ) : null}
                        {showCosts ? <td className="num">{line.total !== undefined ? fmtMoney(line.total) : '—'}</td> : null}
                      </tr>
                    )
                  })}
                </tbody>
                {showCosts ? (
                  <tfoot>
                    <tr>
                      <td colSpan={cols - 1}>Subtotal {group.title.toLowerCase()}</td>
                      <td className="num">{fmtMoney(subtotal)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )
        })}
        {lines.length === 0 ? <p className="fzw-muted">No hay materiales calculados.</p> : null}

        {showCosts && lines.length > 0 ? (
          <table className="fzw-table" style={{ marginTop: '6mm', width: '50%', marginLeft: 'auto' }}>
            <tbody>
              {WORKSHOP_MATERIAL_GROUPS.map((g) => {
                const v = lines.filter((l) => l.group === g.id).reduce((s, l) => s + (l.total ?? 0), 0)
                return v > 0 ? (
                  <tr key={g.id}>
                    <td>{g.title}</td>
                    <td className="num">{fmtMoney(v)}</td>
                  </tr>
                ) : null
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total materiales (neto)</td>
                <td className="num">
                  <span className="fzw-mid">{fmtMoney(total)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        ) : null}

        <Signatures labels={['Preparó', 'Entregó', 'Recibió en taller']} />
      </Sheet>
    </DocRoot>
  )
}
