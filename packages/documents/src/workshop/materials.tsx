import type { MaterialLine } from '@dekopen/engine'
import { Box, DocHeader, DocRoot, Sheet, Signatures } from './common'
import { colorInfo, itemByCode, otLabel, quoteTitle, uniqueFooter, materialCode } from './helpers'
import { resolveWorkshopLocale, workshopI18n, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

type GroupId = MaterialLine['group']

/** Grupos de la lista de materiales (rótulos en español; en otro idioma, `materialGroupTitle`). */
export const WORKSHOP_MATERIAL_GROUPS: { id: GroupId; title: string; hint: string }[] = [
  { id: 'profile', title: 'Perfiles', hint: 'barras completas según la optimización' },
  { id: 'reinforcement', title: 'Refuerzos', hint: 'barras de acero' },
  { id: 'hardware', title: 'Herrajes', hint: 'en unidad de compra' },
  { id: 'accessory', title: 'Accesorios e insumos', hint: 'en unidad de compra' },
  { id: 'glass', title: 'Vidrios', hint: 'superficie total por tipo' },
]

/** Título y ayuda de un grupo de materiales en el idioma del documento. */
export function materialGroupTitle(id: GroupId, w: WorkshopI18n = workshopI18n()): { title: string; hint: string } {
  const key = id as 'profile' | 'reinforcement' | 'hardware' | 'accessory' | 'glass'
  return { title: w.t(`materials.${key}`), hint: w.t(`materials.${key}Hint`) }
}

export interface MaterialsDocumentProps extends WorkshopDocumentProps {
  /** Mostrar precios unitarios, totales y subtotales (documento interno). */
  showCosts?: boolean
}

function lineMissingPrice(line: MaterialLine): boolean {
  return line.unitCost !== undefined ? line.unitCost <= 0 : line.total !== undefined && line.total <= 0
}

/** Unidad de compra en plural (español): caja → cajas, par → pares; «u», «m» y «m²» no cambian. */
export function unitPlural(unit: string, n: number): string {
  const u = unit.trim()
  if (n === 1 || !u || /^(u|m|m²|m2|ml|kg|mm|cm)$/i.test(u) || u.endsWith('s')) return u
  return /[aeiouáéíóú]$/i.test(u) ? `${u}s` : /^kit$/i.test(u) ? `${u}s` : `${u}es`
}

/** Unidad de compra para mostrar junto a una cantidad: plural en español, nombre del glosario en otros idiomas. */
function unitFor(unit: string, n: number, w: WorkshopI18n): string {
  return w.locale === 'es' ? unitPlural(unit, n) : w.unit(unit)
}

/**
 * Detalle de consumo o envase de una línea: «23,45 m en piezas» para barras y, si se compra
 * por envase, cuánto se usa de verdad: «278 u = 1 caja de 1.000».
 */
export function lineDetail(
  data: WorkshopDocumentData,
  line: MaterialLine & { consumption?: number; consumptionUnit?: string },
  w: WorkshopI18n = workshopI18n(),
): string {
  if (line.group === 'profile' || line.group === 'reinforcement') {
    return line.meters !== undefined ? w.t('materials.metersInPieces', { meters: w.f.meters(line.meters) }) : ''
  }
  if (line.group === 'glass') return ''
  const item = itemByCode(data.catalog, line.code)
  const pack = item?.packSize && item.packSize > 1 ? item.packSize : undefined
  const buy = `${w.f.qty(line.qty)} ${unitFor(line.unit, line.qty, w)}`
  const per = pack && !/^pares?$/i.test(line.unit.trim()) ? w.t('materials.packOf', { pack: w.f.int(pack) }) : ''
  const used = typeof line.consumption === 'number' && Number.isFinite(line.consumption) && line.consumption > 0 ? line.consumption : undefined
  if (used !== undefined && (pack || Math.abs(used - line.qty) > 0.005)) {
    const usedUnit = unitFor(line.consumptionUnit?.trim() || 'u', used, w)
    return `${w.t('materials.usedOfBuy', { used: `${w.f.qty(used)} ${usedUnit}`, buy })}${per}`
  }
  if (pack) return w.t('materials.packOnly', { pack: w.f.int(pack) })
  return ''
}

/**
 * Lista de materiales: barras por perfil y color, refuerzos, herrajes y accesorios en
 * unidad de compra, y vidrios. Con `showCosts` agrega precios y totales (interno).
 */
export function MaterialsDocument({ data, paper, showCosts = false, locale, currency, taxLabel }: MaterialsDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const kind = showCosts ? t('materials.kickerCosts') : t('materials.kicker')
  const footer = uniqueFooter(t('materials.footer', { ot: otLabel(data, w), kind, title: quoteTitle(data, w) }))
  const lines = data.materials
  const sum = (g: GroupId, f: (l: MaterialLine) => number) => lines.filter((l) => l.group === g).reduce((s, l) => s + f(l), 0)
  const profileBars = sum('profile', (l) => l.bars ?? l.qty)
  const steelBars = sum('reinforcement', (l) => l.bars ?? l.qty)
  const glassArea = sum('glass', (l) => l.qty)
  const itemsCount = lines.filter((l) => l.group === 'hardware' || l.group === 'accessory').length
  const total = lines.reduce((s, l) => s + (l.total ?? 0), 0)
  const missing = lines.filter(lineMissingPrice)
  // La marca (proveedor) solo aporta si hay más de una; va en la misma línea para no duplicar el alto de cada fila.
  const multiBrand = new Set(lines.map((l) => l.brandName ?? '')).size > 1

  return (
    <DocRoot data={data} paper={paper} footer={footer} kind={showCosts ? 'materials-costs' : 'materials'} w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={kind} w={w} />

        <div className="fzw-kpis">
          <div className="fzw-kpi">
            <span>{t('materials.profileBars')}</span>
            <strong>{w.f.qty(profileBars)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>{t('materials.steelBars')}</span>
            <strong>{w.f.qty(steelBars)}</strong>
          </div>
          <div className="fzw-kpi">
            <span>{t('materials.items')}</span>
            <strong>{w.f.int(itemsCount)}</strong>
            <em>{t('materials.itemsHint')}</em>
          </div>
          {showCosts ? (
            <div className="fzw-kpi">
              <span>{t('materials.total')}</span>
              <strong>{w.f.money(total)}</strong>
              <em>{t('materials.totalHint', { tax: w.tax })}</em>
            </div>
          ) : (
            <div className="fzw-kpi">
              <span>{t('materials.glassArea')}</span>
              <strong>{w.f.m2(glassArea)}</strong>
            </div>
          )}
        </div>

        {showCosts && missing.length > 0 ? (
          <div className="fzw-callout" role="note">
            <div className="fzw-callout-title">{t('materials.missingTitle', { count: missing.length })}</div>
            <ul>
              <li>{t('materials.missingText', { names: missing.map((l) => l.name).join(', ') })}</li>
            </ul>
          </div>
        ) : null}

        {WORKSHOP_MATERIAL_GROUPS.map((group) => {
          const groupLines = lines.filter((l) => l.group === group.id)
          if (groupLines.length === 0) return null
          const subtotal = groupLines.reduce((s, l) => s + (l.total ?? 0), 0)
          const cols = showCosts ? 8 : 6
          const label = materialGroupTitle(group.id, w)
          return (
            <div key={group.id}>
              <h2 className="fzw-h" style={{ marginTop: '6mm' }}>
                {label.title} <small>{label.hint}</small>
              </h2>
              <table className="fzw-table">
                <thead>
                  <tr>
                    <th className="chk" aria-label={t('materials.prepared')} />
                    <th>{t('materials.code')}</th>
                    <th>{t('materials.description')}</th>
                    <th>{t('materials.color')}</th>
                    <th className="num">{t('materials.quantity')}</th>
                    <th>{t('materials.detail')}</th>
                    {showCosts ? <th className="num">{t('materials.unitPrice')}</th> : null}
                    {showCosts ? <th className="num">{t('materials.lineTotal')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {groupLines.map((line, i) => {
                    const color = line.colorName ? { name: line.colorName, hex: colorInfo(data.catalog, line.colorId)?.hex } : colorInfo(data.catalog, line.colorId)
                    const noPrice = showCosts && lineMissingPrice(line)
                    return (
                      <tr key={`${line.code}-${line.colorId ?? ''}-${i}`} className={noPrice ? 'fzw-row-warn' : undefined}>
                        <td className="chk">
                          <Box label={t('materials.markPrepared')} w={w} />
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
                          <span className="fzw-mid">{line.group === 'glass' ? w.f.number(line.qty, 2) : w.f.qty(line.qty)}</span>
                          <span className="fzw-unit">{w.unit(line.unit)}</span>
                        </td>
                        <td className="fzw-small fzw-muted">{lineDetail(data, line, w)}</td>
                        {showCosts ? (
                          <td className="num">
                            {noPrice ? <span className="fzw-tag">{t('materials.noPrice')}</span> : line.unitCost !== undefined ? w.f.money(line.unitCost) : '—'}
                          </td>
                        ) : null}
                        {showCosts ? <td className="num">{line.total !== undefined ? w.f.money(line.total) : '—'}</td> : null}
                      </tr>
                    )
                  })}
                </tbody>
                {showCosts ? (
                  <tfoot>
                    <tr>
                      <td colSpan={cols - 1}>{t('materials.subtotal', { group: w.locale === 'de' ? label.title : label.title.toLocaleLowerCase(w.lang) })}</td>
                      <td className="num">{w.f.money(subtotal)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )
        })}
        {lines.length === 0 ? <p className="fzw-muted">{t('materials.empty')}</p> : null}

        {showCosts && lines.length > 0 ? (
          <table className="fzw-table" style={{ marginTop: '6mm', width: '50%', marginLeft: 'auto' }}>
            <tbody>
              {WORKSHOP_MATERIAL_GROUPS.map((g) => {
                const v = lines.filter((l) => l.group === g.id).reduce((s, l) => s + (l.total ?? 0), 0)
                return v > 0 ? (
                  <tr key={g.id}>
                    <td>{materialGroupTitle(g.id, w).title}</td>
                    <td className="num">{w.f.money(v)}</td>
                  </tr>
                ) : null
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('materials.totalNet')}</td>
                <td className="num">
                  <span className="fzw-mid">{w.f.money(total)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        ) : null}

        <Signatures labels={[t('materials.signPrepared'), t('materials.signDelivered'), t('materials.signReceived')]} w={w} />
      </Sheet>
    </DocRoot>
  )
}
