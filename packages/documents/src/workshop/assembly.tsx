import type { WorkshopWindow } from '@dekopen/engine'
import { Box, DocHeader, DocRoot, Sheet, Signatures, WindowSketch, WriteField } from './common'
import { chunk, otLabel, quoteTitle, uniqueFooter, windowIsSliding, windowOperable, windowTitle } from './helpers'
import { resolveWorkshopLocale, workshopI18n, type WorkshopI18n } from './locale'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

export interface AssemblyCheck {
  id: 'seal_in' | 'seal_out' | 'glass' | 'screws' | 'adjust' | 'handle' | 'drain' | 'square' | 'coupler'
  label: string
  hint?: string
  /** No aplica a esta ventana (p. ej. regulación en un paño fijo). */
  na?: boolean
}

/** Controles de montaje de una ventana, adaptados a su tipología (en el idioma pedido). */
export function assemblyChecks(window: WorkshopWindow, w: WorkshopI18n = workshopI18n()): AssemblyCheck[] {
  const operable = windowOperable(window)
  const sliding = windowIsSliding(window)
  const t = w.t
  return [
    { id: 'seal_in', label: t('assembly.check.seal_in'), hint: t('assembly.check.seal_in_hint') },
    { id: 'seal_out', label: t('assembly.check.seal_out'), hint: t('assembly.check.seal_out_hint') },
    { id: 'glass', label: t('assembly.check.glass'), hint: t('assembly.check.glass_hint') },
    { id: 'screws', label: t('assembly.check.screws'), hint: t('assembly.check.screws_hint') },
    {
      id: 'adjust',
      label: sliding ? t('assembly.check.adjust_sliding') : t('assembly.check.adjust'),
      hint: sliding ? t('assembly.check.adjust_sliding_hint') : t('assembly.check.adjust_hint'),
      na: !operable,
    },
    { id: 'handle', label: t('assembly.check.handle'), hint: t('assembly.check.handle_hint'), na: !operable },
    { id: 'drain', label: t('assembly.check.drain'), hint: t('assembly.check.drain_hint') },
    { id: 'square', label: t('assembly.check.square'), hint: t('assembly.check.square_hint') },
    ...(window.design.assembly ? [{ id: 'coupler' as const, label: t('assembly.check.coupler'), hint: t('assembly.check.coupler_hint') }] : []),
  ]
}

const MAX_UNITS_PER_CARD = 8

interface Card {
  window: WorkshopWindow
  units: number[]
  part: number
  parts: number
}

const CARDS_PER_SHEET = 2

/** Unidades con casillas (al menos una). */
function unitCount(qty: number): number {
  const units = Math.max(1, Math.round(qty))
  return Number.isFinite(units) ? units : 0
}

function buildCards(windows: WorkshopWindow[]): Card[] {
  const cards: Card[] = []
  for (const window of windows) {
    const all = Array.from({ length: unitCount(window.qty) }, (_, i) => i + 1)
    const parts = chunk(all, MAX_UNITS_PER_CARD)
    parts.forEach((units, i) => cards.push({ window, units, part: i + 1, parts: parts.length }))
  }
  return cards
}

/** Hojas del listado de montaje (las mismas que dibuja el documento), sin dibujarlas. */
export function assemblyChecklistSheets(data: Pick<WorkshopDocumentData, 'windows'>): number {
  const cards = data.windows.reduce((s, w) => s + Math.ceil(unitCount(w.qty) / MAX_UNITS_PER_CARD), 0)
  return Math.ceil(cards / CARDS_PER_SHEET)
}

export interface AssemblyChecklistDocumentProps extends WorkshopDocumentProps {
  /**
   * Hojas a dibujar como máximo (las primeras), para la vista previa en pantalla: con cientos
   * de unidades son cientos de fichas. La numeración «Hoja 1 de N» sigue siendo la completa.
   * Sin límite, todas.
   */
  maxSheets?: number
}

/**
 * Listado de montaje: una ficha por ventana con casillas por unidad para sello interior,
 * sello exterior, vidrio, tornillos, regulación, manilla, deflector/drenaje y escuadra,
 * medida real y firmas Armó / Controló.
 */
export function AssemblyChecklistDocument({ data, paper, maxSheets, locale, currency, taxLabel }: AssemblyChecklistDocumentProps) {
  const w = resolveWorkshopLocale({ locale, currency, taxLabel }, data)
  const t = w.t
  const footer = uniqueFooter(t('assembly.footer', { ot: otLabel(data, w), title: quoteTitle(data, w) }))
  const allPages = chunk(buildCards(data.windows), CARDS_PER_SHEET)
  const pages = maxSheets === undefined ? allPages : allPages.slice(0, Math.max(1, Math.floor(maxSheets)))
  const units = data.windows.reduce((s, x) => s + x.qty, 0)
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="assembly" w={w}>
      {pages.map((cards, i) => (
        <Sheet key={i} footer={footer} footRight={t('assembly.sheet', { index: i + 1, total: allPages.length })}>
          <DocHeader
            data={data}
            kicker={t('assembly.kicker')}
            meta={
              <>
                {t('common.windows', { count: data.windows.length })} · {t('common.units', { count: units })}
              </>
            }
            w={w}
          />
          <div className="fzw-cards">
            {cards.map((card) => (
              <AssemblyCard key={`${card.window.ref}-${card.part}`} card={card} data={data} w={w} />
            ))}
          </div>
        </Sheet>
      ))}
      {pages.length === 0 ? (
        <Sheet footer={footer}>
          <DocHeader data={data} kicker={t('assembly.kicker')} w={w} />
          <p className="fzw-muted">{t('assembly.empty')}</p>
        </Sheet>
      ) : null}
    </DocRoot>
  )
}

function AssemblyCard({ card, data, w }: { card: Card; data: WorkshopDocumentData; w: WorkshopI18n }) {
  const t = w.t
  const { window } = card
  const { title, subtitle } = windowTitle(window, w)
  const checks = assemblyChecks(window, w)
  const notes = data.windowNotes?.[window.ref]
  return (
    <article className="fzw-card">
      <div className="fzw-card-grid">
        <div>
          <div className="fzw-drawing" style={{ padding: '2mm' }}>
            <WindowSketch window={window} catalog={data.catalog} width={180} height={160} />
          </div>
          <div style={{ marginTop: '2.5mm', display: 'grid', gap: '2.5mm' }}>
            <div className="fzw-small">
              {t('assembly.ordered')} <strong className="fzw-nowrap">{w.f.size(window.design.width, window.design.height)}</strong>
            </div>
            <WriteField label={t('assembly.realWidth')} />
            <WriteField label={t('assembly.realHeight')} />
          </div>
        </div>
        <div>
          <div className="fzw-win" style={{ marginBottom: '2.5mm' }}>
            <span className="fzw-ref fzw-ref-sm">{window.ref}</span>
            <div>
              <div className="fzw-win-name">{title}</div>
              {subtitle ? <div className="fzw-win-desc fzw-ellipsis">{subtitle}</div> : null}
            </div>
            <div className="fzw-win-size">
              <span className="fzw-qty-chip">
                {card.parts > 1
                  ? t('assembly.unitsRange', { from: card.units[0], to: card.units[card.units.length - 1], total: w.f.int(window.qty) })
                  : t('common.units', { count: window.qty })}
              </span>
            </div>
          </div>
          <table className="fzw-table fzw-check">
            <thead>
              <tr>
                <th>{t('assembly.control')}</th>
                {card.units.map((u) => (
                  <th key={u} className="unit">
                    {card.units.length === 1 && window.qty === 1 ? t('assembly.done') : t('assembly.unit', { n: u })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`fzw-cell-title${c.na ? ' fzw-na' : ''}`}>{c.label}</span>
                    <span className="fzw-muted fzw-small"> · {c.na ? t('assembly.na') : c.hint}</span>
                  </td>
                  {card.units.map((u) => (
                    <td key={u} className="unit">
                      <Box large na={c.na} label={c.na ? t('assembly.naAria', { label: c.label }) : t('assembly.unitAria', { label: c.label, unit: u })} w={w} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {notes ? (
            <p className="fzw-small" style={{ marginTop: '2mm' }}>
              {t('assembly.note', { note: notes })}
            </p>
          ) : null}
          <Signatures labels={[t('assembly.signBuilt'), t('assembly.signChecked')]} w={w} />
        </div>
      </div>
    </article>
  )
}
