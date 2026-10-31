import type { WorkshopWindow } from '@framezen/engine'
import { Box, DocHeader, DocRoot, Sheet, Signatures, WindowSketch, WriteField } from './common'
import { fmtInt, fmtSize, plural } from './format'
import { chunk, otLabel, windowIsSliding, windowOperable, windowTitle } from './helpers'
import type { WorkshopDocumentData, WorkshopDocumentProps } from './types'

export interface AssemblyCheck {
  id: 'seal_in' | 'seal_out' | 'glass' | 'screws' | 'adjust' | 'handle' | 'drain' | 'square'
  label: string
  hint?: string
  /** No aplica a esta ventana (p. ej. regulación en un paño fijo). */
  na?: boolean
}

/** Controles de montaje de una ventana, adaptados a su tipología. */
export function assemblyChecks(window: WorkshopWindow): AssemblyCheck[] {
  const operable = windowOperable(window)
  const sliding = windowIsSliding(window)
  return [
    { id: 'seal_in', label: 'Sello interior', hint: 'burlete continuo, esquinas pegadas' },
    { id: 'seal_out', label: 'Sello exterior', hint: 'burlete y silicona donde corresponde' },
    { id: 'glass', label: 'Vidrio', hint: 'calzado, junquillos firmes' },
    { id: 'screws', label: 'Tornillos', hint: 'refuerzos y herrajes apretados' },
    {
      id: 'adjust',
      label: sliding ? 'Regulación de carros' : 'Regulación de hojas',
      hint: sliding ? 'corre suave, sin roce' : 'cierra parejo, sin roce',
      na: !operable,
    },
    { id: 'handle', label: 'Manilla y cierre', hint: 'traba en todos los puntos', na: !operable },
    { id: 'drain', label: 'Deflector y drenaje', hint: 'desagües destapados, tapas puestas' },
    { id: 'square', label: 'Control de escuadra', hint: 'diagonales con diferencia de hasta 1,5 mm' },
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
export function AssemblyChecklistDocument({ data, paper, maxSheets }: AssemblyChecklistDocumentProps) {
  const footer = `${otLabel(data)} · Listado de montaje · ${data.quote.title}`
  const allPages = chunk(buildCards(data.windows), CARDS_PER_SHEET)
  const pages = maxSheets === undefined ? allPages : allPages.slice(0, Math.max(1, Math.floor(maxSheets)))
  const units = data.windows.reduce((s, w) => s + w.qty, 0)
  return (
    <DocRoot data={data} paper={paper} footer={footer} kind="assembly">
      {pages.map((cards, i) => (
        <Sheet key={i} footer={footer} footRight={`Hoja ${i + 1} de ${allPages.length}`}>
          <DocHeader
            data={data}
            kicker="Listado de montaje"
            meta={
              <>
                {plural(data.windows.length, 'ventana')} · {plural(units, 'unidad', 'unidades')}
              </>
            }
          />
          <div className="fzw-cards">
            {cards.map((card) => (
              <AssemblyCard key={`${card.window.ref}-${card.part}`} card={card} data={data} />
            ))}
          </div>
        </Sheet>
      ))}
      {pages.length === 0 ? (
        <Sheet footer={footer}>
          <DocHeader data={data} kicker="Listado de montaje" />
          <p className="fzw-muted">No hay ventanas en esta OT.</p>
        </Sheet>
      ) : null}
    </DocRoot>
  )
}

function AssemblyCard({ card, data }: { card: Card; data: WorkshopDocumentData }) {
  const { window } = card
  const { title, subtitle } = windowTitle(window)
  const checks = assemblyChecks(window)
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
              Medida pedida <strong className="fzw-nowrap">{fmtSize(window.design.width, window.design.height)}</strong>
            </div>
            <WriteField label="Ancho real" />
            <WriteField label="Alto real" />
            <span className="fzw-small fzw-muted">Tolerancia ± 2 mm</span>
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
                  ? `Unidades ${card.units[0]}–${card.units[card.units.length - 1]} de ${fmtInt(window.qty)}`
                  : plural(window.qty, 'unidad', 'unidades')}
              </span>
            </div>
          </div>
          <table className="fzw-table fzw-check">
            <thead>
              <tr>
                <th>Control</th>
                {card.units.map((u) => (
                  <th key={u} className="unit">
                    {card.units.length === 1 && window.qty === 1 ? 'Listo' : `U${u}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`fzw-cell-title${c.na ? ' fzw-na' : ''}`}>{c.label}</span>
                    <span className="fzw-muted fzw-small"> · {c.na ? 'no aplica: no tiene hojas que abran' : c.hint}</span>
                  </td>
                  {card.units.map((u) => (
                    <td key={u} className="unit">
                      <Box large na={c.na} label={c.na ? `${c.label}: no aplica` : `${c.label}, unidad ${u}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {notes ? <p className="fzw-small" style={{ marginTop: '2mm' }}>Nota: {notes}</p> : null}
          <Signatures labels={['Armó', 'Controló']} />
        </div>
      </div>
    </article>
  )
}
