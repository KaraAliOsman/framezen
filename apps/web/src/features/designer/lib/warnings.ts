/**
 * Avisos del despiece en el lienzo: los que apuntan a un paño, hoja o travesaño se dibujan como
 * un marcador discreto sobre él; el resto va a un resumen. Los avisos de precio pertenecen al
 * desglose del precio (inspector), no al dibujo.
 */
import type { Layout, Rect, Warning, WarningLevel } from '@dekopen/engine'
import { translate } from '../../../lib/i18n'
import es from '../i18n/es'
import { unionRect } from './viewport'

export interface WarningMarker {
  nodeId: string
  /** Rectángulo en mm (vista interior) del elemento afectado. */
  rect: Rect
  level: WarningLevel
  warnings: Warning[]
}

const RANK: Record<WarningLevel, number> = { info: 0, warn: 1, error: 2 }

export function isCanvasWarning(w: Warning): boolean {
  return !w.code.startsWith('price_missing')
}

export function worstLevel(warnings: Warning[]): WarningLevel {
  return warnings.reduce<WarningLevel>((acc, w) => (RANK[w.level] > RANK[acc] ? w.level : acc), 'info')
}

/** Rectángulo (mm) del elemento al que apunta un aviso, si se puede ubicar en el dibujo. */
export function nodeRect(layout: Layout, nodeId: string): Rect | null {
  const cells = layout.cells.filter((c) => c.nodeId === nodeId).map((c) => c.rect)
  if (cells.length) return unionRect(cells)
  const panel = layout.sliding.find((p) => p.panelId === nodeId)
  if (panel) return panel.rect
  const sash = layout.sashes.find((s) => s.nodeId === nodeId)
  if (sash) return sash.rect
  const mullions = layout.mullions.filter((m) => m.nodeId === nodeId).map((m) => m.rect)
  if (mullions.length) return unionRect(mullions)
  const pane = layout.panes.find((p) => p.nodeId === nodeId)
  return pane ? pane.glassRect : null
}

export function splitWarnings(warnings: Warning[], layout: Layout): { markers: WarningMarker[]; general: Warning[] } {
  const byNode = new Map<string, Warning[]>()
  const general: Warning[] = []
  for (const w of warnings) {
    if (!isCanvasWarning(w)) continue
    if (w.nodeId && w.nodeId !== 'frame' && nodeRect(layout, w.nodeId)) {
      const list = byNode.get(w.nodeId) ?? []
      list.push(w)
      byNode.set(w.nodeId, list)
    } else general.push(w)
  }
  const markers: WarningMarker[] = []
  for (const [nodeId, list] of byNode) {
    const rect = nodeRect(layout, nodeId)
    if (rect) markers.push({ nodeId, rect, level: worstLevel(list), warnings: list })
  }
  return { markers, general }
}

export function warningCountLabel(n: number): string {
  return translate(es, 'warnings.count', { count: n })
}
