/**
 * Leyenda de los símbolos de apertura para documentos (cotización, catálogo, portal): explica la
 * convención (vista interior, vértice = bisagras, continua/discontinua) y solo las aperturas presentes.
 */
import type { Layout } from '@dekopen/engine'
import type { Locale } from '@dekopen/shared'
import { drawingText, type DrawingMessageKey } from './i18n'

export const LEGEND_ENTRIES = ['turn', 'tiltTurn', 'tilt', 'awning', 'pivot', 'slide', 'liftSlide', 'tiltSlide', 'parallelSlide', 'folding', 'fixed'] as const
export type LegendEntry = (typeof LEGEND_ENTRIES)[number]

/** Aperturas presentes en un conjunto de dibujos, en el orden de la leyenda. */
export function legendEntries(layouts: readonly Layout[]): LegendEntry[] {
  const found = new Set<LegendEntry>()
  for (const layout of layouts) {
    for (const sash of layout.sashes) {
      switch (sash.opening.kind) {
        case 'casement':
        case 'door':
          found.add('turn')
          break
        case 'tilt_turn':
          found.add('tiltTurn')
          break
        case 'tilt':
          found.add('tilt')
          break
        case 'awning':
          found.add('awning')
          break
        case 'pivot_v':
        case 'pivot_h':
          found.add('pivot')
          break
        case 'tilt_slide':
          found.add('tiltSlide')
          break
        case 'parallel_slide':
          found.add('parallelSlide')
          break
        case 'folding':
          found.add('folding')
          break
        default:
          break
      }
    }
    if (layout.sliding.some((p) => p.kind === 'moving')) found.add(layout.slidingSystem === 'lift_slide' ? 'liftSlide' : 'slide')
    if (layout.sliding.some((p) => p.kind === 'fixed')) found.add('fixed')
  }
  return LEGEND_ENTRIES.filter((e) => found.has(e))
}

const GLYPH: Record<LegendEntry, string> = {
  turn: 'M24 3L4 11L24 19',
  tiltTurn: 'M24 3L4 11L24 19M4 3L14 19L24 3',
  tilt: 'M4 3L14 19L24 3',
  awning: 'M4 19L14 3L24 19',
  pivot: 'M14 2V20M9 7Q14 3 19 7M17 4.6L19 7L16.4 7.8',
  slide: 'M8 11H20M17 8L20 11L17 14',
  liftSlide: 'M8 14H20M17 11L20 14L17 17M8 14V6M6 8L8 6L10 8',
  tiltSlide: 'M4 3L14 19L24 3M9 13H19M16.5 10.5L19 13L16.5 15.5',
  parallelSlide: 'M8 11H20M17 8L20 11L17 14',
  folding: 'M4 4L10 18L16 4L22 18M12 11H5M7 9L5 11L7 13',
  fixed: '',
}

function Glyph({ entry }: { entry: LegendEntry }) {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="25" height="19" rx="1" strokeOpacity="0.55" />
      {entry === 'parallelSlide' ? <rect x="4" y="4" width="20" height="14" strokeOpacity="0.45" strokeDasharray="2 2" /> : null}
      {entry === 'pivot' ? <path d="M14 2V20" strokeDasharray="4 1.5 1 1.5" /> : null}
      {entry === 'fixed' ? (
        <text x="14" y="15" textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor" stroke="none">
          F
        </text>
      ) : (
        <path d={entry === 'pivot' ? 'M9 7Q14 3 19 7M17 4.6L19 7L16.4 7.8' : GLYPH[entry]} strokeDasharray={entry === 'awning' ? '3 2' : undefined} />
      )}
    </svg>
  )
}

export interface DrawingLegendProps {
  /** Entradas a mostrar; si falta, se deducen de `layouts`. */
  entries?: readonly LegendEntry[]
  layouts?: readonly Layout[]
  view?: 'interior' | 'exterior'
  locale?: Locale
  className?: string
  /** Agrega «Medidas en mm. Esquema proporcional.». */
  units?: boolean
}

/** Leyenda de símbolos (HTML liviano: hereda tipografía y color del documento). */
export function DrawingLegend({ entries, layouts = [], view = 'interior', locale = 'es', className, units = true }: DrawingLegendProps) {
  const list = entries ?? legendEntries(layouts)
  const t = (key: DrawingMessageKey) => drawingText(key, undefined, locale)
  return (
    <div className={className ? `fzd-legend ${className}` : 'fzd-legend'} data-legend="openings" style={{ display: 'grid', gap: '4px', fontSize: '0.92em' }}>
      <p style={{ margin: 0 }}>{t(view === 'interior' ? 'legend.convention' : 'legend.conventionExterior')}</p>
      <p style={{ margin: 0 }}>{t('legend.lines')}</p>
      {list.length ? (
        <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {list.map((entry) => (
            <li key={entry} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} data-entry={entry}>
              <Glyph entry={entry} />
              <span>{t(`legend.${entry}` as DrawingMessageKey)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {units ? <p style={{ margin: 0 }}>{t('legend.units')}</p> : null}
    </div>
  )
}
