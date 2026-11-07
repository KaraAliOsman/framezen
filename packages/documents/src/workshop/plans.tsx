/**
 * Planes por ventana: herrajes, refuerzos, mosquiteros y acoples. Cada hoja imprime solo lo que
 * existe en el despiece; lo que el catálogo no trae se marca «sin dato», no se rellena.
 */
import { glossaryTerm } from '@dekopen/shared'
import { assemblyUnits, type CutPiece, type ItemLine, type WorkshopWindow } from '@dekopen/engine'
import { Box, DocHeader, DocRoot, Sheet, WarningsCallout, WindowBand, WindowSketch, WriteField } from './common'
import { itemsByPane, otLabel, quoteTitle, uniqueFooter, windowScreens, workshopPieceCodes, type WorkshopPieceUnit } from './helpers'
import { resolveWorkshopLocale, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Herrajes
// ─────────────────────────────────────────────────────────────────────────────

/** Plan de herrajes: por ventana y por hoja, con casillas de entregado y puesto, y el total para bodega. */
export function HardwarePlanDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('hardware.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const windows = data.windows.filter((x) => x.bom.items.some((i) => i.kind === 'hardware') || x.bom.warnings.some((i) => i.code.startsWith('hardware_')))
  const totals = new Map<string, { item: ItemLine; qty: number; refs: Set<string> }>()
  for (const window of windows) {
    for (const item of window.bom.items) {
      if (item.kind !== 'hardware') continue
      const key = `${item.itemId}|${item.unit}`
      const hit = totals.get(key) ?? { item, qty: 0, refs: new Set<string>() }
      hit.qty += item.qty * window.qty
      hit.refs.add(window.ref)
      totals.set(key, hit)
    }
  }
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="hardware" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('hardware.kicker')} meta={t('common.windows', { count: windows.length })} w={w} />
        {windows.length === 0 ? <p className="fzw-muted">{t('hardware.empty')}</p> : null}
        {totals.size > 0 ? (
          <div>
            <h2 className="fzw-h">
              {t('hardware.totalTitle')} <small>{t('hardware.totalHint')}</small>
            </h2>
            <table className="fzw-table fzw-table-dense">
              <thead>
                <tr>
                  <th className="chk" aria-label={t('hardware.delivered')} />
                  <th className="num">{t('hardware.qty')}</th>
                  <th>{t('hardware.item')}</th>
                  <th>{t('hardware.windows')}</th>
                </tr>
              </thead>
              <tbody>
                {[...totals.values()].map(({ item, qty, refs }) => (
                  <tr key={`${item.itemId}|${item.unit}`}>
                    <td className="chk">
                      <Box label={t('hardware.markDelivered')} w={w} />
                    </td>
                    <td className="num">
                      <span className="fzw-mid">{w.f.qty(qty)}</span>
                      <span className="fzw-unit">{w.unit(item.unit)}</span>
                    </td>
                    <td>
                      {item.name} <span className="fzw-mono fzw-muted fzw-small">{item.code}</span>
                    </td>
                    <td className="fzw-small">{[...refs].join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {windows.map((window) => (
          <HardwareCard key={window.ref} window={window} data={data} w={w} />
        ))}
      </Sheet>
    </DocRoot>
  )
}

function HardwareCard({ window, data, w }: { window: WorkshopWindow; data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  const panes = itemsByPane(window)
  const warnings = window.bom.warnings.filter((x) => x.code.startsWith('hardware_'))
  return (
    <article className="fzw-card fzw-plan-card">
      <WindowBand window={window} small w={w} />
      <WarningsCallout warnings={warnings} title={t('common.missingData')} w={w} />
      <div className="fzw-card-grid">
        <div className="fzw-drawing">
          <WindowSketch window={window} catalog={data.catalog} width={180} height={150} dimensions="none" />
        </div>
        <div>
          {panes.length > 0 ? (
            <table className="fzw-table fzw-table-dense">
              <thead>
                <tr>
                  <th className="chk">{t('hardware.deliveredShort')}</th>
                  <th className="chk">{t('hardware.fittedShort')}</th>
                  <th className="num">{t('hardware.qty')}</th>
                  <th>{t('hardware.item')}</th>
                </tr>
              </thead>
              <tbody>
                {panes.map((pane) => [
                  pane.label ? (
                    <tr key={`p-${pane.label}`} className="fzw-group">
                      <td colSpan={4}>{w.cell(pane.label)}</td>
                    </tr>
                  ) : null,
                  ...pane.items.map((item, i) => (
                    <tr key={`${pane.label}-${item.itemId}-${i}`}>
                      <td className="chk">
                        <Box label={t('hardware.markDelivered')} w={w} />
                      </td>
                      <td className="chk">
                        <Box label={t('hardware.markFitted')} w={w} />
                      </td>
                      <td className="num">
                        <span className="fzw-mid">{w.f.qty(item.qty * window.qty)}</span>
                        <span className="fzw-unit">{w.unit(item.unit)}</span>
                        {window.qty > 1 ? <div className="fzw-cell-sub">{`${w.f.qty(item.qty)} × ${window.qty}`}</div> : null}
                      </td>
                      <td>
                        {item.name} <span className="fzw-mono fzw-muted fzw-small">{item.code}</span>
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          ) : (
            <p className="fzw-muted">{t('hardware.none')}</p>
          )}
        </div>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Refuerzos
// ─────────────────────────────────────────────────────────────────────────────

interface SteelRow {
  key: string
  steel: CutPiece
  codes: string[]
  parent?: WorkshopPieceUnit
  side: string
  qty: number
}

function steelRows(window: WorkshopWindow): SteelRow[] {
  const units = workshopPieceCodes(window)
  const byCode = new Map(units.map((u) => [u.code, u]))
  const rows = new Map<string, SteelRow>()
  for (const unit of units) {
    if (unit.piece.kind !== 'reinforcement') continue
    const parent = unit.code.endsWith('-R') ? byCode.get(unit.code.slice(0, -2)) : undefined
    const key = [unit.piece.code, unit.piece.length, parent?.piece.code ?? '', parent?.piece.length ?? '', unit.side].join('|')
    const hit = rows.get(key)
    if (hit) {
      hit.qty += 1
      hit.codes.push(unit.member)
    } else rows.set(key, { key, steel: unit.piece, codes: [unit.member], parent, side: unit.side, qty: 1 })
  }
  return [...rows.values()]
}

/** Refuerzos: qué acero va dentro de qué pieza, a qué largo y con qué descuento. */
export function ReinforcementDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('steel.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const windows = data.windows.filter((x) => x.bom.cuts.some((c) => c.kind === 'reinforcement') || x.bom.warnings.some((i) => i.code.startsWith('reinforcement_')))
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="reinforcement" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('steel.kicker')} meta={t('common.windows', { count: windows.length })} w={w} />
        <p className="fzw-small fzw-muted" style={{ marginBottom: '2mm' }}>
          {t('steel.intro')}
        </p>
        {windows.length === 0 ? <p className="fzw-muted">{t('steel.empty')}</p> : null}
        {windows.map((window) => {
          const rows = steelRows(window)
          const missing = window.bom.warnings.filter((x) => x.code.startsWith('reinforcement_'))
          return (
            <div key={window.ref} className="fzw-plan-block">
              <WindowBand window={window} small w={w} />
              <WarningsCallout warnings={missing} title={t('common.missingData')} w={w} />
              {rows.length > 0 ? (
                <table className="fzw-table fzw-table-cuts">
                  <thead>
                    <tr>
                      <th className="chk" aria-label={t('workOrder.cut')} />
                      <th>{t('steel.steel')}</th>
                      <th>{t('steel.goesIn')}</th>
                      <th className="num">{t('steel.pieceLength')}</th>
                      <th className="num">{t('steel.deduction')}</th>
                      <th className="num">{t('workOrder.qty')}</th>
                      <th className="num">{t('steel.length')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <td className="chk">
                          <Box label={t('workOrder.markCut')} w={w} />
                        </td>
                        <td>
                          <span className="fzw-cell-title">{row.steel.code}</span> <span className="fzw-small fzw-muted">{row.steel.name}</span>
                        </td>
                        <td>
                          {row.parent ? (
                            <>
                              <span className="fzw-cell-title">{row.codes.map((c) => c.replace(/-R$/, '')).join(' · ')}</span> {row.parent.piece.code} · {w.side(row.parent.side)}
                            </>
                          ) : (
                            <>
                              {w.side(row.side)} <span className="fzw-tag fzw-tag-muted">{t('common.noData')}</span>
                            </>
                          )}
                        </td>
                        <td className="num">{row.parent ? w.f.mm(row.parent.piece.length) : '—'}</td>
                        <td className="num">{row.parent ? `− ${w.f.mm(Math.round((row.parent.piece.length - row.steel.length) * 10) / 10)}` : '—'}</td>
                        <td className="num">
                          <span className="fzw-mid">{w.f.qty(row.qty * window.qty)}</span>
                        </td>
                        <td className="num">
                          <span className="fzw-big">{w.f.mm(row.steel.length)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          )
        })}
      </Sheet>
    </DocRoot>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mosquiteros
// ─────────────────────────────────────────────────────────────────────────────

/** ¿La OT lleva algún mosquitero? (para mostrar el documento solo cuando corresponde). */
export function hasScreens(data: Pick<WorkshopDocumentData, 'windows'>): boolean {
  return data.windows.some((x) => windowScreens(x).length > 0)
}

/** Mosquiteros: tipo, ventana y el artículo del catálogo. El corte se mide: el catálogo no trae regla. */
export function ScreensDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('screens.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const windows = data.windows.filter((x) => windowScreens(x).length > 0)
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="screens" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('screens.kicker')} meta={t('common.windows', { count: windows.length })} w={w} />
        {windows.length === 0 ? <p className="fzw-muted">{t('screens.empty')}</p> : <p className="fzw-small fzw-muted">{t('screens.intro')}</p>}
        {windows.map((window) => (
          <article key={window.ref} className="fzw-card fzw-plan-card">
            <WindowBand window={window} small w={w} />
            <div className="fzw-card-grid">
              <div className="fzw-drawing">
                <WindowSketch window={window} catalog={data.catalog} width={180} height={140} dimensions="none" />
              </div>
              <div>
                <table className="fzw-table fzw-table-dense">
                  <thead>
                    <tr>
                      <th className="chk" aria-label={t('screens.done')} />
                      <th>{t('screens.type')}</th>
                      <th className="num">{t('workOrder.qty')}</th>
                      <th>{t('screens.cut')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {windowScreens(window).map((screen) => (
                      <tr key={screen.type}>
                        <td className="chk">
                          <Box label={t('screens.done')} w={w} />
                        </td>
                        <td>
                          <span className="fzw-cell-title">{glossaryTerm(`accessory.insectScreenType.${screen.type}` as never, w.locale)}</span>
                          {screen.unit ? <span className="fzw-small fzw-muted">{` · ${screen.unit}`}</span> : null}
                        </td>
                        <td className="num">
                          <span className="fzw-mid">{w.f.int(window.qty)}</span>
                        </td>
                        <td>
                          <span className="fzw-tag">{t('common.noData')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="fzw-grid-2" style={{ marginTop: '3mm' }}>
                  <WriteField label={t('screens.width')} />
                  <WriteField label={t('screens.height')} />
                </div>
              </div>
            </div>
          </article>
        ))}
      </Sheet>
    </DocRoot>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Acoples y uniones
// ─────────────────────────────────────────────────────────────────────────────

/** ¿La OT lleva conjuntos de ventanas unidas? */
export function hasCouplers(data: Pick<WorkshopDocumentData, 'windows'>): boolean {
  return data.windows.some((x) => Boolean(x.design.assembly))
}

/**
 * Acoples y uniones: cada acople o poste es una pieza propia con su perfil, largo, corte y refuerzo,
 * y la suma de los módulos. Lo que el sistema no declara (cara vista, ángulo, pieza) se marca.
 */
export function CouplersDocument({ data, paper, locale, currency, taxLabel }: WorkshopDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('couplers.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const windows = data.windows.filter((x) => Boolean(x.design.assembly))
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="couplers" w={w}>
      <Sheet footer={footer}>
        <DocHeader data={data} kicker={t('couplers.kicker')} meta={t('common.windows', { count: windows.length })} w={w} />
        {windows.length === 0 ? <p className="fzw-muted">{t('couplers.empty')}</p> : null}
        {windows.map((window) => (
          <CouplerCard key={window.ref} window={window} data={data} w={w} />
        ))}
      </Sheet>
    </DocRoot>
  )
}

function CouplerCard({ window, data, w }: { window: WorkshopWindow; data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  const layout = window.layout.assembly
  const joints = layout?.joints ?? []
  const cuts = window.bom.assembly?.joints.cuts ?? []
  const missing = window.bom.assembly?.missingJoints ?? []
  const warnings = (window.bom.assembly?.joints.warnings ?? []).filter((x) => !x.code.startsWith('price_'))
  const plan = layout?.plan
  const units = assemblyUnits(window.design)
  const steelOf = (id: string) => cuts.find((c) => c.kind === 'reinforcement' && c.nodeId === id)
  const adapterOf = (id: string) => cuts.find((c) => c.kind === 'profile' && c.nodeId === id && /^adaptador/.test(c.label))
  return (
    <article className="fzw-card fzw-plan-card">
      <WindowBand window={window} small w={w} />
      <WarningsCallout warnings={warnings} title={t('common.missingData')} w={w} />
      <div className="fzw-drawing">
        <WindowSketch window={window} catalog={data.catalog} width={520} height={180} />
      </div>
      <h2 className="fzw-h">
        {t('couplers.joints')} <small>{t('couplers.jointsHint', { count: joints.length })}</small>
      </h2>
      <table className="fzw-table fzw-table-cuts">
        <thead>
          <tr>
            <th className="chk" aria-label={t('workOrder.cut')} />
            <th>{t('couplers.joint')}</th>
            <th>{t('couplers.piece')}</th>
            <th className="num">{t('couplers.angle')}</th>
            <th className="num">{t('couplers.face')}</th>
            <th>{t('couplers.steel')}</th>
            <th className="num">{t('workOrder.qty')}</th>
            <th className="num">{t('couplers.length')}</th>
          </tr>
        </thead>
        <tbody>
          {joints.map((j) => {
            const profile = data.catalog?.profiles.find((p) => p.id === j.profileId)
            const steel = steelOf(j.id)
            const adapter = adapterOf(j.id)
            const lost = j.status === 'missing'
            return (
              <tr key={j.id}>
                <td className="chk">
                  <Box na={lost} label={t('workOrder.markCut')} w={w} />
                </td>
                <td>
                  <span className="fzw-cell-title">{j.label}</span>
                  <div className="fzw-cell-sub">{t(`couplers.kind.${j.kind}`)}</div>
                </td>
                <td>
                  {lost ? (
                    <span className="fzw-tag">{t('couplers.noPiece')}</span>
                  ) : (
                    <>
                      <span className="fzw-cell-title">{j.code}</span> <span className="fzw-small fzw-muted">{j.name}</span>
                      {j.status === 'unverified' ? <div><span className="fzw-tag">{t('couplers.unverified')}</span></div> : null}
                      {adapter ? <div className="fzw-cell-sub">{t('couplers.adapter', { code: adapter.code, qty: adapter.qty })}</div> : null}
                    </>
                  )}
                </td>
                <td className="num">{w.f.angle(j.angle)}</td>
                <td className="num">{profile?.face ? `${w.f.mm(profile.face)}` : <span className="fzw-tag fzw-tag-muted">{t('common.noData')}</span>}</td>
                <td>{steel ? `${steel.code} · ${w.f.mm(steel.length)}` : <span className="fzw-muted">—</span>}</td>
                <td className="num">
                  <span className="fzw-mid">{lost ? '—' : w.f.int(window.qty)}</span>
                </td>
                <td className="num">
                  <span className="fzw-big">{lost ? '—' : w.f.mm(j.length)}</span>
                  {lost ? null : <div className="fzw-cell-sub">{t('couplers.straight')}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="fzw-small fzw-muted" style={{ marginTop: '1.5mm' }}>
        {t('couplers.allowance')}
      </p>
      <h2 className="fzw-h">{t('couplers.modules')}</h2>
      <table className="fzw-table fzw-table-dense">
        <thead>
          <tr>
            <th>{t('couplers.module')}</th>
            <th className="num">{t('couplers.width')}</th>
            <th className="num">{t('couplers.height')}</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.id}>
              <td className="fzw-cell-title">{unit.id}</td>
              <td className="num">
                <span className="fzw-mid">{w.f.mm(unit.design.width)}</span>
              </td>
              <td className="num">
                <span className="fzw-mid">{w.f.mm(unit.design.height)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{t('couplers.total')}</td>
            <td className="num">{w.f.mm(window.design.width)}</td>
            <td className="num">{w.f.mm(window.design.height)}</td>
          </tr>
        </tfoot>
      </table>
      {plan ? <p className="fzw-small" style={{ marginTop: '1.5mm' }}>{t('couplers.plan', { span: w.f.mm(plan.span), projection: w.f.mm(plan.projection), developed: w.f.mm(plan.developed) })}</p> : null}
      {missing.length > 0 ? (
        <p className="fzw-small" style={{ marginTop: '1.5mm' }}>
          {t('couplers.missing', { joints: missing.map((m) => m.label).join(', ') })}
        </p>
      ) : null}
    </article>
  )
}
