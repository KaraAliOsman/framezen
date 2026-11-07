/**
 * Lienzo del diseñador: la ventana a escala, grande y centrada, con encuadre automático.
 *
 * - Zoom con rueda centrado en el cursor (pellizco en pantallas táctiles), paneo arrastrando el
 *   fondo, con espacio + arrastre o con el botón del medio; F encuadra.
 * - Clic en un paño → selección con anillo doble y barra contextual (aperturas, dividir, unión
 *   francesa, quitar división, vidrio). En correderas, clic en una hoja → fija/móvil y sentido.
 * - Cotas editables en el lugar (totales → setSize, parciales → setNodeSize).
 * - Travesaños arrastrables con imán (50 mm a ±12 px, si no 10 mm) y medida en vivo; también
 *   con flechas cuando están enfocados.
 * - Vista interior/exterior, avisos del despiece como marcadores discretos, accesible por teclado.
 *
 * El dibujo es WindowDrawing de @dekopen/documents (mismo SVG que documentos y portal); las capas
 * de interacción usan su mismo Viewport, así que calzan al píxel.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Minus, Plus, Scan } from 'lucide-react'
import { computeBom, computeLayout, isAssembly, type Catalog, type Layout, type LayoutDimension, type LayoutMullion, type Rect, type WindowDesign } from '@dekopen/engine'
import { AssemblyPlan, slidingVisibleRect, WindowDrawing, type DrawingView, type Viewport } from '@dekopen/documents'
import { cn } from '../../lib/cn'
import { useFormat, useLocale, useT } from '../../lib/i18n'
import { isTypingTarget } from '../../lib/useShortcut'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Toolbar, ToolbarButton, ToolbarSeparator } from '../../ui/Toolbar'
import { Tooltip } from '../../ui/Tooltip'
import { AssemblyLayer } from './canvas/AssemblyLayer'
import { ContextToolbar } from './canvas/ContextToolbar'
import { DimensionEditor } from './canvas/DimensionEditor'
import { WarningMarkerButton, WarningSummary } from './canvas/WarningLayer'
import es from './i18n/es'
import { moveMullion, scopeOf, unitSegment } from './lib/assembly'
import { canRemoveDivision, nodeSummary, nodeTitle, removeDivision, resolveSelection, splitAction, type Change } from './lib/actions'
import { applyDimension, applySizePair, dimensionAnchor, dimensionTarget, isTotalDimension } from './lib/dimensions'
import { focusCameFromTab, useElementSize, useMediaQuery } from './lib/hooks'
import { undoLabel, type UndoLabel } from './lib/undo'
import { arrowDirection, nextInDirection, type NavTarget } from './lib/navigation'
import { keyboardStep, snapMullion, type SnapResult } from './lib/snap'
import {
  centeredPan,
  clampZoom,
  fitBox,
  offsetRect,
  pointToMm,
  stageSize,
  stageViewport,
  toStage,
  unionRect,
  zoomAt,
  type Insets,
  type Pan,
} from './lib/viewport'
import { nodeRect, splitWarnings } from './lib/warnings'

export interface DesignCanvasProps {
  design: WindowDesign
  catalog: Catalog
  /**
   * Cada cambio llega con el texto del paso en el idioma actual («Dividir en 2 (vertical)») y su
   * clave estable (`undo`, para agrupar el historial y volver a traducirlo: ver `undoText`).
   */
  onChange: (next: WindowDesign, label: string, undo?: UndoLabel) => void
  selectedNodeId: string | null
  onSelect: (id: string | null) => void
  view?: DrawingView
  onViewChange?: (view: DrawingView) => void
  /** Solo mirar: zoom y paneo, sin editar ni seleccionar. */
  readOnly?: boolean
  className?: string
}

interface Camera {
  zoom: number
  /** null = centrado automático (encuadre). */
  pan: Pan | null
}

interface MullionDrag {
  pointerId: number
  mullion: LayoutMullion
  vp: Viewport
  layout: Layout
  pan: Pan
  segStart: number
  segEnd: number
  startX: number
  startY: number
  moved: boolean
}

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  startPan: Pan
  panning: boolean
  forcePan: boolean
  target: Element | null
}

interface Pinch {
  startDist: number
  startMid: Pan
  startZoom: number
  startPan: Pan
}

const FALLBACK_SIZE = { width: 880, height: 600 }

function insetsFor(width: number): Insets {
  if (width < 600) return { top: 56, right: 14, bottom: 64, left: 14 }
  return { top: 64, right: 48, bottom: 68, left: 48 }
}

/** Segmentos del tramo de un travesaño (eje anterior y siguiente) desde las cotas parciales. */
function mullionSegment(layout: Layout, m: LayoutMullion): { segStart: number; segEnd: number } {
  const unit = unitSegment(layout, m)
  if (unit) return unit
  const before = layout.dimensions.find((d) => d.target && 'nodeId' in d.target && d.target.nodeId === m.nodeId && d.target.index === m.index)
  const after = layout.dimensions.find((d) => d.target && 'nodeId' in d.target && d.target.nodeId === m.nodeId && d.target.index === m.index + 1)
  const extent = m.dir === 'vertical' ? layout.width : layout.height
  return { segStart: before?.from ?? 0, segEnd: after?.to ?? extent }
}

function matchesFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * Selección con el canto de vidrio (DESIGN §14): filo azul de 2 px (`--dk-select`, solo en el lienzo) con
 * halo y un velo muy suave. Hover: contorno fino. Foco de teclado: contorno discontinuo.
 */
function SelectionRing({ r, kind }: { r: Rect; kind: 'select' | 'hover' | 'focus' }) {
  if (kind === 'hover') {
    return <rect x={r.x + 0.5} y={r.y + 0.5} width={Math.max(0, r.w - 1)} height={Math.max(0, r.h - 1)} rx={1.5} fill="var(--dk-select)" fillOpacity={0.06} stroke="var(--dk-select)" strokeOpacity={0.55} strokeWidth={1} />
  }
  if (kind === 'focus') {
    return <rect x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} rx={3} fill="none" stroke="var(--dk-focus)" strokeWidth={1.5} strokeDasharray="4 3" />
  }
  return (
    <g>
      <rect className="fz-sel-tint" x={r.x} y={r.y} width={r.w} height={r.h} fill="var(--dk-select)" fillOpacity={0.09} />
      <rect x={r.x - 3} y={r.y - 3} width={r.w + 6} height={r.h + 6} rx={3.5} fill="none" stroke="var(--dk-select-ring)" strokeWidth={4} />
      <rect x={r.x - 1} y={r.y - 1} width={r.w + 2} height={r.h + 2} rx={2} fill="none" stroke="var(--dk-select)" strokeWidth={2} />
    </g>
  )
}

/** Coloca un elemento flotante sobre (o bajo) un rectángulo, dentro del lienzo. */
function Floating({ anchor, container, children, compact, gap = 14 }: { anchor: Rect; container: { width: number; height: number }; children: ReactNode; compact?: boolean; gap?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [own, setOwn] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setOwn((p) => (p.w === w && p.h === h ? p : { w, h }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  })
  if (compact) {
    return (
      <div ref={ref} className="fz-pop absolute inset-x-2 bottom-2 z-20 flex justify-center" data-state="open">
        {children}
      </div>
    )
  }
  const left = Math.min(Math.max(8, anchor.x + anchor.w / 2 - own.w / 2), Math.max(8, container.width - own.w - 8))
  // Arriba de la selección; si no cabe (o choca con el selector de vista), adentro arriba; si
  // la selección es baja, debajo.
  const clashesView = (t: number) => t < 48 && left + own.w > container.width - 200
  let top = anchor.y - own.h - gap
  if (top < 8 || clashesView(top)) {
    const inside = Math.max(anchor.y, 8) + 10
    top = anchor.h > own.h + 48 && !clashesView(inside) ? inside : anchor.y + anchor.h + gap
  }
  top = Math.min(Math.max(8, top), container.height - own.h - 8)
  return (
    <div ref={ref} className="fz-pop absolute z-20" data-state="open" style={{ left, top }}>
      {children}
    </div>
  )
}

function ZoomControls({ zoom, onZoom, onFit, compact }: { zoom: number; onZoom: (factor: number) => void; onFit: () => void; compact: boolean }) {
  const t = useT(es)
  const fmt = useFormat()
  const btn = 'inline-flex size-8 items-center justify-center rounded-sm text-fg-muted outline-none transition-colors duration-100 hover:bg-hover hover:text-fg-strong touch:size-10'
  const zoomText = fmt.pct(Math.round(zoom * 100))
  return (
    <Toolbar variant="floating" aria-label={t('canvas.zoom')} data-canvas-ui="" className="h-10 gap-0.5 px-1 touch:h-12">
      {!compact ? (
        <Tooltip content={t('canvas.zoomOut')} shortcut="-">
          <ToolbarButton asChild>
            <button type="button" aria-label={t('canvas.zoomOut')} className={btn} onClick={() => onZoom(1 / 1.25)}>
              <Minus aria-hidden strokeWidth={1.75} className="size-4" />
            </button>
          </ToolbarButton>
        </Tooltip>
      ) : null}
      <Tooltip content={t('canvas.fit')} shortcut="f">
        <ToolbarButton asChild>
          <button type="button" aria-label={t('canvas.zoomFit', { zoom: zoomText })} className={cn(btn, 'w-auto min-w-14 px-1.5 text-meta font-medium tabular')} onClick={onFit}>
            {zoomText}
          </button>
        </ToolbarButton>
      </Tooltip>
      {!compact ? (
        <Tooltip content={t('canvas.zoomIn')} shortcut="+">
          <ToolbarButton asChild>
            <button type="button" aria-label={t('canvas.zoomIn')} className={btn} onClick={() => onZoom(1.25)}>
              <Plus aria-hidden strokeWidth={1.75} className="size-4" />
            </button>
          </ToolbarButton>
        </Tooltip>
      ) : null}
      <ToolbarSeparator className="mx-0.5" />
      <Tooltip content={t('canvas.fit')} shortcut="f">
        <ToolbarButton asChild>
          <button type="button" aria-label={t('canvas.fitWindow')} className={btn} onClick={onFit}>
            <Scan aria-hidden strokeWidth={1.75} className="size-4" />
          </button>
        </ToolbarButton>
      </Tooltip>
    </Toolbar>
  )
}

/** Nombre del campo al editar una cota (total, parcial, flecha del arco, alturas del trapecio). */
function dimensionLabel(design: WindowDesign, dim: LayoutDimension, t: (key: 'dimension.totalWidth' | 'dimension.totalHeight' | 'dimension.archRise' | 'dimension.leftHeight' | 'dimension.rightHeight' | 'dimension.pane') => string): string {
  if (isTotalDimension(dim)) return dim.axis === 'x' ? t('dimension.totalWidth') : t('dimension.totalHeight')
  const target = dimensionTarget(design, dim)
  if (target?.kind === 'arch-rise') return t('dimension.archRise')
  if (target?.kind === 'trapezoid') return target.side === 'leftHeight' ? t('dimension.leftHeight') : t('dimension.rightHeight')
  return t('dimension.pane')
}

export function DesignCanvas({ design, catalog, onChange, selectedNodeId, onSelect, view: viewProp, onViewChange, readOnly = false, className }: DesignCanvasProps) {
  const t = useT(es)
  const fmt = useFormat()
  const { locale } = useLocale()
  const coarse = useMediaQuery('(pointer: coarse)')
  const [containerRef, size] = useElementSize<HTMLDivElement>(FALLBACK_SIZE)
  const compact = size.width < 600
  // En un conjunto quebrado la planta ocupa la esquina superior: el dibujo parte bajo ella.
  const broken = (design.assembly?.kind ?? 'flat') !== 'flat'
  const insets = useMemo(() => {
    const base = insetsFor(size.width)
    return broken && size.width >= 600 && size.height >= 560 ? { ...base, top: 228 } : base
  }, [size.width, size.height, broken])
  const box = fitBox(size, insets)

  const [viewState, setViewState] = useState<DrawingView>('interior')
  const view = viewProp ?? viewState
  const setView = (v: DrawingView) => {
    if (v === view) return
    // Con zoom, el mismo punto de la ventana queda al centro al espejar la vista.
    setCam((c) => {
      if (!c.pan) return c
      const L = live.current
      const vpNow = stageViewport(L.layout, stageSize(L.box, c.zoom), L.view)
      const cx = L.box.x + L.box.w / 2
      const u = (cx - c.pan.x - vpNow.ox) / vpNow.scale
      const mirrored = L.layout.width - u
      return { zoom: c.zoom, pan: { x: cx - vpNow.ox - mirrored * vpNow.scale, y: c.pan.y } }
    })
    onViewChange?.(v)
    if (viewProp === undefined) setViewState(v)
  }

  const [cam, setCam] = useState<Camera>({ zoom: 1, pan: null })
  const [draft, setDraft] = useState<WindowDesign | null>(null)
  const [snap, setSnap] = useState<(SnapResult & { mullion: LayoutMullion }) | null>(null)
  const [editing, setEditing] = useState<LayoutDimension | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [mullionSel, setMullionSel] = useState<{ splitId: string; index: number } | null>(null)
  const [hoverMullion, setHoverMullion] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [ring, setRing] = useState(false)
  // Conjunto quebrado: se edita en el desarrollo y se revisa en volumen.
  const [volumeMode, setVolumeMode] = useState(false)

  const shown = draft ?? design
  const baseLayout = useMemo(() => computeLayout(design, catalog), [design, catalog])
  const draftLayout = useMemo(() => (draft ? computeLayout(draft, catalog) : null), [draft, catalog])
  const layout = draftLayout ?? baseLayout
  const bom = useMemo(() => computeBom(design, catalog), [design, catalog])
  const stage = stageSize(box, cam.zoom)
  const vp = useMemo(() => stageViewport(layout, stage, view), [layout, stage.width, stage.height, view])
  const pan = cam.pan ?? centeredPan(box, stage)
  const mirror = view === 'exterior'

  // Valores vivos para los manejadores nativos (rueda) y los gestos.
  const live = useRef({ layout, view, box, zoom: cam.zoom, pan, readOnly })
  live.current = { layout, view, box, zoom: cam.zoom, pan, readOnly }
  const drag = useRef<MullionDrag | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, Pan>())
  const pinch = useRef<Pinch | null>(null)
  const spaceRef = useRef(false)
  const spacePanned = useRef(false)
  const hitRefs = useRef(new Map<string, SVGRectElement>())

  // En un conjunto, las acciones trabajan sobre la unidad elegida y `scoped.lift` arma el conjunto.
  const scoped = useMemo(() => scopeOf(design, selectedNodeId, catalog), [design, selectedNodeId, catalog])
  const selection = useMemo(() => resolveSelection(design, selectedNodeId), [design, selectedNodeId])
  const mullionIndex = mullionSel && mullionSel.splitId === selectedNodeId ? mullionSel.index : null
  const editable = !readOnly

  // Un cambio externo (deshacer) cierra la edición de cotas en curso.
  useEffect(() => {
    setEditing(null)
  }, [design])

  /** Si el paño seleccionado desaparece (se unió a otro), la selección pasa al que ocupa su lugar. */
  const successorOf = (id: string, next: WindowDesign): string | null => {
    const old = nodeRect(baseLayout, id)
    if (!old) return null
    const cx = old.x + old.w / 2
    const cy = old.y + old.h / 2
    const nl = computeLayout(next, catalog)
    const list = nl.sliding.length ? nl.sliding.map((p) => ({ id: p.panelId, r: p.rect })) : nl.cells.map((c) => ({ id: c.nodeId, r: c.rect }))
    return list.find((t) => cx >= t.r.x && cx <= t.r.x + t.r.w && cy >= t.r.y && cy <= t.r.y + t.r.h)?.id ?? null
  }

  const select = useCallback(
    (id: string | null, mullion?: { splitId: string; index: number }) => {
      setMullionSel(mullion ?? null)
      if (!readOnly) onSelect(id)
    },
    [onSelect, readOnly],
  )

  const apply = useCallback(
    (change: Change | null, nextSelected?: string | null) => {
      if (!change || readOnly) return
      onChange(change.design, change.label, change.undo)
      if (nextSelected !== undefined) select(nextSelected)
      else if (selectedNodeId && !resolveSelection(change.design, selectedNodeId)) select(successorOf(selectedNodeId, change.design))
    },
    [onChange, readOnly, select, selectedNodeId],
  )

  const applyScoped = (change: Change | null, nextLocal?: string | null) => {
    if (!change) return
    apply({ ...change, design: scoped.lift(change.design) }, nextLocal === undefined ? undefined : nextLocal === null ? null : scoped.outer(nextLocal))
  }

  const onFix = useCallback((next: WindowDesign, label: string, undo?: UndoLabel) => apply({ design: next, label, undo: undo ?? { key: 'fix', params: { label } } }), [apply])

  // ── Cámara ────────────────────────────────────────────────────────────────
  const fit = useCallback(() => setCam({ zoom: 1, pan: null }), [])
  const zoomBy = useCallback(
    (factor: number, point?: Pan) => {
      const L = live.current
      const p = point ?? { x: L.box.x + L.box.w / 2, y: L.box.y + L.box.h / 2 }
      setCam(zoomAt({ layout: L.layout, view: L.view, box: L.box, zoom: L.zoom, pan: L.pan, nextZoom: L.zoom * factor, point: p }))
    },
    [],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null
      if (target?.closest?.('[data-canvas-ui]')) return
      // En solo lectura el lienzo puede vivir en una página con scroll: solo pellizco/Ctrl.
      if (live.current.readOnly && !e.ctrlKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018))
      const L = live.current
      setCam(zoomAt({ layout: L.layout, view: L.view, box: L.box, zoom: L.zoom, pan: L.pan, nextZoom: clampZoom(L.zoom * factor), point: { x: e.clientX - rect.left, y: e.clientY - rect.top } }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef])

  useEffect(() => {
    const reset = () => {
      spaceRef.current = false
      setSpaceHeld(false)
    }
    window.addEventListener('blur', reset)
    return () => window.removeEventListener('blur', reset)
  }, [])

  // ── Objetivos (paños / hojas) en px del escenario ──────────────────────────
  const targets = useMemo<(NavTarget & { kind: 'cell' | 'panel' })[]>(() => {
    if (layout.sliding.length && !layout.assembly) return layout.sliding.map((p) => ({ id: p.panelId, rect: toStage(vp, layout, slidingVisibleRect(layout, p)), kind: 'panel' as const }))
    return layout.cells.map((c) => ({ id: c.nodeId, rect: toStage(vp, layout, c.rect), kind: 'cell' as const }))
  }, [layout, vp])

  const rectsFor = useCallback(
    (id: string | null, index: number | null = null): Rect[] => {
      if (!id) return []
      const sash = layout.sashes.find((x) => x.nodeId === id)
      if (sash) return [toStage(vp, layout, sash.rect)]
      const t = targets.filter((x) => x.id === id).map((x) => x.rect)
      if (t.length) return t
      const ms = layout.mullions.filter((m) => m.nodeId === id && (index === null || m.index === index)).map((m) => toStage(vp, layout, m.rect))
      if (ms.length) return ms
      const r = nodeRect(layout, id)
      return r ? [toStage(vp, layout, r)] : []
    },
    [targets, layout, vp],
  )

  const volume = volumeMode && Boolean(layout.assembly?.plan)
  const selectedRects = volume ? [] : rectsFor(selectedNodeId, mullionIndex)
  const anchor = unionRect(selectedRects)

  // ── Avisos ────────────────────────────────────────────────────────────────
  const warnings = useMemo(() => splitWarnings(bom.warnings, baseLayout), [bom, baseLayout])

  // ── Teclado ───────────────────────────────────────────────────────────────
  const removeSelected = (): boolean => {
    if (!scoped.nodeId || !canRemoveDivision(scoped.design, scoped.nodeId)) return false
    const sel = resolveSelection(scoped.design, scoped.nodeId)
    if (!sel) return false
    if (sel.kind === 'leaf' && sel.parent) {
      const siblings = sel.parent.node.children
      const neighbor = siblings[sel.parent.index > 0 ? sel.parent.index - 1 : sel.parent.index + 1]
      const change = removeDivision(scoped.design, scoped.nodeId)
      const keep = neighbor?.type === 'leaf' ? neighbor.id : null
      applyScoped(change, keep)
      return Boolean(change)
    }
    if (sel.kind === 'split') {
      const index = mullionIndex
      const keepNode = index !== null ? sel.node.children[index] : sel.node.children[0]
      const change = removeDivision(scoped.design, sel.node.id, index ?? undefined)
      applyScoped(change, keepNode?.type === 'leaf' ? keepNode.id : null)
      return Boolean(change)
    }
    return false
  }

  const navigate = (dir: 'left' | 'right' | 'up' | 'down') => {
    const id = nextInDirection(targets, selection?.kind === 'split' ? null : selectedNodeId, dir)
    if (!id) return
    select(id)
    requestAnimationFrame(() => hitRefs.current.get(id)?.focus({ preventScroll: true }))
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = containerRef.current
    const target = e.target as HTMLElement
    if (!el || !el.contains(target) || e.nativeEvent.isComposing || isTypingTarget(target)) return
    // Sobre los botones flotantes (barra, zoom, vista) valen los atajos, pero no flechas, Enter ni espacio.
    const onUi = Boolean(target.closest('[data-canvas-ui]'))
    if (onUi && (e.key === ' ' || e.key === 'Enter' || e.key.startsWith('Arrow'))) return
    if (e.key === ' ') {
      e.preventDefault()
      if (!spaceRef.current) {
        spaceRef.current = true
        spacePanned.current = false
        setSpaceHeld(true)
      }
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const dir = arrowDirection(e.key)
    if (dir && !readOnly) {
      e.preventDefault()
      navigate(dir)
      return
    }
    switch (e.key) {
      case 'Escape':
        if (selectedNodeId) {
          e.preventDefault()
          select(null)
          el.focus({ preventScroll: true })
        }
        return
      case 'f':
      case 'F':
      case '0':
        e.preventDefault()
        fit()
        return
      case '+':
      case '=':
        e.preventDefault()
        zoomBy(1.25)
        return
      case '-':
      case '_':
        e.preventDefault()
        zoomBy(1 / 1.25)
        return
      case 'Delete':
      case 'Backspace':
        if (editable && removeSelected()) e.preventDefault()
        return
      case 'v':
      case 'V':
      case 'h':
      case 'H':
        if (editable && selection?.kind === 'leaf') {
          e.preventDefault()
          applyScoped(splitAction(scoped.design, selection.node.id, e.key.toLowerCase() === 'v' ? 'vertical' : 'horizontal', e.shiftKey ? 3 : 2))
        }
        return
      case 'Enter':
        if (!readOnly && target === el && !selectedNodeId && targets[0]) {
          e.preventDefault()
          navigate('right')
        }
        return
    }
  }

  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== ' ') return
    const wasPanned = spacePanned.current
    spaceRef.current = false
    setSpaceHeld(false)
    const target = e.target as Element
    if (!wasPanned && !readOnly) {
      const hit = target.closest?.('[data-hit="cell"]')
      if (hit) select(hit.getAttribute('data-node-id'))
    }
  }

  // ── Gestos: paneo, pellizco, clic ─────────────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    const target = e.target as Element
    if (!el || !el.contains(target) || target.closest('[data-canvas-ui]')) return
    if (!target.closest('[data-hit]') && !target.closest('[data-layer="dimensions"]')) el.focus({ preventScroll: true })
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const rect = el.getBoundingClientRect()
      gesture.current = null
      setPanning(false)
      pinch.current = {
        startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        startMid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
        startZoom: live.current.zoom,
        startPan: live.current.pan,
      }
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    const forcePan = e.button === 1 || spaceRef.current
    gesture.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPan: pan, panning: forcePan, forcePan, target }
    if (forcePan) {
      e.preventDefault()
      el.setPointerCapture?.(e.pointerId)
      setPanning(true)
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const el = containerRef.current
    if (pinch.current && pointers.current.size >= 2 && el) {
      const [a, b] = [...pointers.current.values()]
      const rect = el.getBoundingClientRect()
      const p = pinch.current
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top }
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const L = live.current
      const z = zoomAt({ layout: L.layout, view: L.view, box: L.box, zoom: p.startZoom, pan: p.startPan, nextZoom: p.startZoom * (dist / p.startDist), point: p.startMid })
      setCam({ zoom: z.zoom, pan: { x: z.pan.x + mid.x - p.startMid.x, y: z.pan.y + mid.y - p.startMid.y } })
      return
    }
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId || !el) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.panning && Math.hypot(dx, dy) > 4) {
      g.panning = true
      el.setPointerCapture?.(e.pointerId)
      setPanning(true)
      setHoverId(null)
    }
    if (g.panning) setCam((c) => ({ zoom: c.zoom, pan: { x: g.startPan.x + dx, y: g.startPan.y + dy } }))
  }

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null
      gesture.current = null
      setPanning(false)
      return
    }
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null
    if (g.panning) {
      setPanning(false)
      if (spaceRef.current) spacePanned.current = true
      return
    }
    if (cancelled || g.forcePan || readOnly) return
    const hit = g.target?.closest?.('[data-hit="cell"]')
    if (hit) select(hit.getAttribute('data-node-id'))
    else if (!g.target?.closest?.('[data-layer="dimensions"]')) select(null)
  }

  // ── Travesaños: arrastre con imán y teclado ───────────────────────────────
  const onMullionDown = (e: ReactPointerEvent<SVGRectElement>, m: LayoutMullion) => {
    if (readOnly || spaceRef.current || e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const seg = mullionSegment(layout, m)
    drag.current = { pointerId: e.pointerId, mullion: m, vp, layout, pan, ...seg, startX: e.clientX, startY: e.clientY, moved: false }
  }

  const onMullionMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const d = drag.current
    const el = containerRef.current
    if (!d || d.pointerId !== e.pointerId || !el) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 3) return
    d.moved = true
    const rect = el.getBoundingClientRect()
    const mm = pointToMm(d.vp, d.layout, d.pan, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    const raw = d.mullion.dir === 'vertical' ? mm.x : mm.y
    const result = snapMullion({ raw, segStart: d.segStart, segEnd: d.segEnd, min: d.mullion.min, max: d.mullion.max, pxPerMm: d.vp.scale, free: e.altKey })
    setSnap({ ...result, mullion: d.mullion })
    setDraft(moveMullion(design, d.mullion, result.axis, d.layout, catalog))
  }

  const onMullionUp = (e: ReactPointerEvent<SVGRectElement>, cancelled = false) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const next = draft
    setDraft(null)
    setSnap(null)
    if (cancelled) return
    if (d.moved && next && next !== design) {
      const step = undoLabel('moveMullion')
      onChange(next, step.label, step.undo)
    }
    else if (!d.moved) select(d.mullion.nodeId, { splitId: d.mullion.nodeId, index: d.mullion.index })
  }

  const onMullionKey = (e: ReactKeyboardEvent<SVGRectElement>, m: LayoutMullion) => {
    if (readOnly) return
    const vertical = m.dir === 'vertical'
    let delta = 0
    if (vertical && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) delta = (e.key === 'ArrowRight' ? 1 : -1) * (mirror ? -1 : 1)
    if (!vertical && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) delta = e.key === 'ArrowDown' ? 1 : -1
    if (delta !== 0) {
      e.preventDefault()
      e.stopPropagation()
      const axis = Math.min(m.max, Math.max(m.min, m.axis + delta * keyboardStep(e)))
      const next = moveMullion(design, m, axis, layout, catalog)
      if (next !== design) {
        const step = undoLabel('moveMullion')
        onChange(next, step.label, step.undo)
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      select(m.nodeId, { splitId: m.nodeId, index: m.index })
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      const node = resolveSelection(design, m.nodeId)
      const keep = node?.kind === 'split' ? node.node.children[m.index] : undefined
      const scope = scopeOf(design, m.nodeId, catalog)
      if (!scope.nodeId) return
      const change = removeDivision(scope.design, scope.nodeId, m.index)
      if (change) apply({ ...change, design: scope.lift(change.design) }, keep?.type === 'leaf' ? scope.outer(keep.id) : null)
    }
  }

  // ── Cotas ─────────────────────────────────────────────────────────────────
  const editableRef = useRef(editable)
  editableRef.current = editable
  const designRef = useRef(design)
  designRef.current = design
  const onDimensionClick = useCallback((dim: LayoutDimension) => {
    if (!editableRef.current || !dimensionTarget(designRef.current, dim)) return
    setEditing(dim)
    setHoverId(null)
  }, [])

  const editAnchor = editing ? dimensionAnchor(layout, vp, editing) : null

  // ── Dibujo (memoizado: el paneo no lo vuelve a renderizar) ────────────────
  const drawing = useMemo(
    () => (
      <WindowDrawing
        layout={layout}
        design={shown}
        catalog={catalog}
        view={view}
        dimensions="all"
        width={stage.width}
        height={stage.height}
        onDimensionClick={readOnly || volume ? undefined : onDimensionClick}
        className="block select-none"
        assemblyView={volume ? 'perspective' : 'developed'}
        plan={false}
      />
    ),
    // El idioma entra en la memoria: el dibujo trae textos accesibles («Editar medida de…»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, shown, catalog, view, stage.width, stage.height, readOnly, onDimensionClick, locale, volume],
  )

  const cursor = panning ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : ''
  const announce = selectedNodeId && selection ? t('canvas.selected', { title: nodeTitle(design, selectedNodeId), summary: nodeSummary(design, selectedNodeId, catalog) }) : ''
  const dragging = Boolean(snap)
  // Etiqueta flotante del elemento elegido: «Paño 2 · 600 × 1.200 mm» (medidas del motor, en mm).
  const selectedMm = selectedNodeId && selection && selection.kind !== 'split' ? nodeRect(layout, selectedNodeId) : null
  const tag = selectedNodeId && selectedMm && anchor && !editing && !dragging && !compact ? t('canvas.tag', { title: nodeTitle(design, selectedNodeId), size: fmt.size(selectedMm.w, selectedMm.h) }) : null

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="group"
      aria-roledescription={t('canvas.roleDescription')}
      aria-label={readOnly ? t('canvas.labelReadOnly') : t('canvas.label')}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) setRing(focusCameFromTab())
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget) setRing(false)
      }}
      onContextMenu={(e) => {
        if (panning) e.preventDefault()
      }}
      className={cn(
        'relative isolate min-h-80 touch-none overflow-hidden bg-canvas outline-none select-none',
        ring && 'ring-2 ring-focus ring-inset',
        // Cotas con los tokens de dibujo (neutros, legibles en claro y oscuro).
        '[&_[data-layer=dimensions]_text]:fill-dimension-text [&_[data-layer=dimensions]_path]:stroke-dimension [&_[data-layer=dimensions]_line]:stroke-dimension',
        // Cotas editables: se ven clicables (velo de acento al pasar, contorno al enfocar con teclado).
        '[&_[data-layer=dimensions]_[role=button]_rect]:transition-[fill] [&_[data-layer=dimensions]_[role=button]_rect]:duration-100',
        '[&_[data-layer=dimensions]_[role=button]:hover_rect]:fill-select-ring [&_[data-layer=dimensions]_[role=button]:hover_text]:fill-select',
        '[&_[data-layer=dimensions]_[role=button]:focus-visible_rect]:fill-select-ring [&_[data-layer=dimensions]_[role=button]:focus-visible_rect]:stroke-focus',
        cursor,
        className,
      )}
      data-designer-canvas=""
    >
      {/* Escenario: dibujo + capas de interacción, trasladado por el paneo. */}
      <div className="absolute top-0 left-0 will-change-transform" style={{ transform: `translate3d(${Math.round(pan.x)}px, ${Math.round(pan.y)}px, 0)`, width: vp.width, height: vp.height }}>
        {drawing}
        <svg className="absolute inset-0 overflow-visible" width={vp.width} height={vp.height} style={{ pointerEvents: 'none' }} aria-hidden={readOnly || undefined}>
          {hoverId && hoverId !== selectedNodeId && !dragging ? rectsFor(hoverId).map((r, i) => <SelectionRing key={`h${i}`} r={r} kind="hover" />) : null}
          {selectedRects.map((r, i) => (
            <SelectionRing key={`s${i}`} r={r} kind="select" />
          ))}
          {focusId && focusId !== selectedNodeId ? rectsFor(focusId).map((r, i) => <SelectionRing key={`f${i}`} r={r} kind="focus" />) : null}
          {!readOnly && !volume ? (
            <g data-layer="hits">
              {targets.map((t) => {
                const selected = t.id === selectedNodeId
                return (
                  <rect
                    key={`c-${t.id}`}
                    ref={(node) => {
                      if (node) hitRefs.current.set(t.id, node)
                      else hitRefs.current.delete(t.id)
                    }}
                    data-hit="cell"
                    data-node-id={t.id}
                    x={t.rect.x}
                    y={t.rect.y}
                    width={Math.max(1, t.rect.w)}
                    height={Math.max(1, t.rect.h)}
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={`${nodeTitle(design, t.id)}: ${nodeSummary(design, t.id, catalog)}`}
                    style={{ pointerEvents: 'all', cursor: panning || spaceHeld ? undefined : 'pointer', outline: 'none' }}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && !gesture.current?.panning && setHoverId(t.id)}
                    onPointerLeave={() => setHoverId((h) => (h === t.id ? null : h))}
                    onFocus={(e) => setFocusId(matchesFocusVisible(e.currentTarget) ? t.id : null)}
                    onBlur={() => setFocusId((f) => (f === t.id ? null : f))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        e.stopPropagation()
                        select(t.id)
                      }
                    }}
                  />
                )
              })}
              {layout.mullions.map((m) => {
                const r = toStage(vp, layout, m.rect)
                const vertical = m.dir === 'vertical'
                const thick = compact ? 22 : 12
                const hit = vertical ? { x: r.x + r.w / 2 - Math.max(r.w, thick) / 2, y: r.y, w: Math.max(r.w, thick), h: r.h } : { x: r.x, y: r.y + r.h / 2 - Math.max(r.h, thick) / 2, w: r.w, h: Math.max(r.h, thick) }
                const seg = mullionSegment(layout, m)
                const before = m.axis - seg.segStart
                const after = seg.segEnd - m.axis
                const active = selectedNodeId === m.nodeId && (mullionIndex === null || mullionIndex === m.index)
                return (
                  <rect
                    key={`m-${m.nodeId}-${m.index}`}
                    data-hit="mullion"
                    data-node-id={m.nodeId}
                    x={hit.x}
                    y={hit.y}
                    width={hit.w}
                    height={hit.h}
                    fill={active ? 'var(--dk-select)' : 'transparent'}
                    fillOpacity={active ? 0.14 : 0}
                    role="slider"
                    tabIndex={0}
                    aria-orientation={vertical ? 'horizontal' : 'vertical'}
                    aria-label={t('canvas.mullion', { dir: m.dir, joint: m.kind ?? 'mullion' })}
                    aria-valuemin={Math.round(m.min - seg.segStart)}
                    aria-valuemax={Math.round(m.max - seg.segStart)}
                    aria-valuenow={Math.round(before)}
                    aria-valuetext={t('canvas.mullionValue', { before: fmt.mm(before), after: fmt.mm(after), dir: m.dir })}
                    style={{ pointerEvents: 'all', cursor: vertical ? 'col-resize' : 'row-resize', outline: 'none' }}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setHoverMullion(`${m.nodeId}:${m.index}`)}
                    onPointerLeave={() => setHoverMullion((h) => (h === `${m.nodeId}:${m.index}` ? null : h))}
                    onPointerDown={(e) => onMullionDown(e, m)}
                    onPointerMove={onMullionMove}
                    onPointerUp={(e) => onMullionUp(e)}
                    onPointerCancel={(e) => onMullionUp(e, true)}
                    onFocus={(e) => setFocusId(matchesFocusVisible(e.currentTarget) ? m.nodeId : null)}
                    onBlur={() => setFocusId((f) => (f === m.nodeId ? null : f))}
                    onKeyDown={(e) => onMullionKey(e, m)}
                  />
                )
              })}
            </g>
          ) : null}
          {!readOnly && !volume ? (
            <g data-layer="handles" aria-hidden>
              {layout.mullions.map((m) => {
                const key = `${m.nodeId}:${m.index}`
                const active = (selectedNodeId === m.nodeId && (mullionIndex === null || mullionIndex === m.index)) || (snap?.mullion.nodeId === m.nodeId && snap.mullion.index === m.index)
                const shown = active || hoverMullion === key || focusId === m.nodeId || coarse
                if (!shown) return null
                const r = toStage(vp, layout, m.rect)
                const vertical = m.dir === 'vertical'
                const cx = r.x + r.w / 2
                const cy = r.y + r.h / 2
                const radius = coarse ? 7 : 5
                return (
                  <g key={`hd-${key}`}>
                    {active ? <circle cx={cx} cy={cy} r={radius + 4} fill="var(--dk-select-ring)" /> : null}
                    <circle cx={cx} cy={cy} r={radius} fill="var(--dk-surface)" stroke="var(--dk-select)" strokeWidth={2} />
                    <path
                      d={vertical ? `M${cx - 1.5} ${cy - 2.5}v5M${cx + 1.5} ${cy - 2.5}v5` : `M${cx - 2.5} ${cy - 1.5}h5M${cx - 2.5} ${cy + 1.5}h5`}
                      stroke="var(--dk-select)"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                    />
                  </g>
                )
              })}
            </g>
          ) : null}
        </svg>
        {editable && !volume ? (
          <AssemblyLayer design={design} layout={layout} catalog={catalog} vp={vp} mirror={mirror} coarse={coarse} compact={compact} selectedNodeId={selectedNodeId} quiet={dragging || panning || Boolean(editing)} onApply={apply} />
        ) : null}
      </div>

      {/* Etiqueta del elemento elegido (arriba a la izquierda, dentro de su contorno). */}
      {tag && anchor ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 max-w-60 truncate rounded-xs bg-inverse px-1.5 py-0.5 text-micro font-medium text-fg-inverse shadow-xs"
          style={{ left: Math.max(4, anchor.x + pan.x + 6), top: Math.max(4, anchor.y + pan.y + 6) }}
        >
          {tag}
        </div>
      ) : null}

      {/* Avisos sobre los paños afectados. */}
      {!dragging && !volume
        ? warnings.markers.map((mk) => {
            const r = offsetRect(toStage(vp, layout, mk.rect), pan)
            const inset = Math.min(16, r.w / 4, r.h / 4)
            return (
              <WarningMarkerButton
                key={mk.nodeId}
                x={r.x + r.w - inset}
                y={r.y + inset}
                warnings={mk.warnings}
                label={nodeTitle(design, mk.nodeId)}
                design={design}
                onFix={onFix}
                readOnly={readOnly}
              />
            )
          })
        : null}

      {/* Medida en vivo al arrastrar un travesaño. */}
      {snap
        ? (() => {
            const r = offsetRect(toStage(vp, layout, layout.mullions.find((m) => m.nodeId === snap.mullion.nodeId && m.index === snap.mullion.index)?.rect ?? snap.mullion.rect), pan)
            const vertical = snap.mullion.dir === 'vertical'
            const [first, second] = vertical && mirror ? [snap.after, snap.before] : [snap.before, snap.after]
            return (
              <div
                className="dim pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-sm bg-inverse px-2 py-1 text-meta font-medium text-fg-inverse shadow-float"
                style={{ left: r.x + r.w / 2, top: vertical ? Math.max(18, r.y + r.h / 2) : r.y + r.h / 2 }}
                aria-hidden
              >
                <span>{fmt.mm(first)}</span>
                <span className="opacity-50">{vertical ? '|' : '/'}</span>
                <span>{fmt.mm(second)}</span>
                {snap.kind === 'center' ? <span className="ml-0.5 rounded-xs bg-fg-inverse/15 px-1 font-sans text-micro">{t('canvas.half')}</span> : null}
              </div>
            )
          })()
        : null}

      {/* Editor de cota en el lugar. */}
      {editing && editAnchor ? (
        <DimensionEditor
          key={`${editing.axis}-${editing.level}-${editing.from}-${editing.to}`}
          x={editAnchor.x + pan.x}
          y={editAnchor.y + pan.y}
          value={editing.value}
          container={size}
          label={dimensionLabel(design, editing, t)}
          allowPair={isTotalDimension(editing)}
          onCancel={() => {
            setEditing(null)
            containerRef.current?.focus({ preventScroll: true })
          }}
          onCommit={(value) => {
            const change = applyDimension(design, editing, value, catalog)
            setEditing(null)
            apply(change)
            containerRef.current?.focus({ preventScroll: true })
          }}
          onCommitPair={(pair) => {
            setEditing(null)
            apply(applySizePair(design, pair))
            containerRef.current?.focus({ preventScroll: true })
          }}
        />
      ) : null}

      {/* Barra contextual del paño seleccionado. */}
      {editable && selection && anchor && !editing && !dragging && !panning && !volume ? (
        <Floating key={`${selectedNodeId}-${mullionIndex ?? ''}`} anchor={offsetRect(anchor, pan)} container={size} compact={compact}>
          <ContextToolbar design={scoped.design} catalog={catalog} selection={selection} view={view} mullionIndex={mullionIndex} onApply={(c) => applyScoped(c)} compact={compact} />
        </Floating>
      ) : null}

      {/* Planta del conjunto: el lienzo edita el desarrollo, la planta muestra cómo se quiebra. */}
      {layout.assembly?.plan && !compact ? (
        <div data-canvas-ui="" className="pointer-events-none absolute top-14 right-3 z-10 rounded-sm bg-surface/95 shadow-xs">
          <AssemblyPlan plan={layout.assembly.plan} width={260} height={156} locale={locale} />
        </div>
      ) : null}

      {/* Controles fijos. */}
      <div data-canvas-ui="" className={cn('absolute top-3 right-3 z-10 flex items-center gap-2', compact && 'top-2 right-auto left-2')}>
        {layout.assembly?.plan ? (
          <SegmentedControl
            aria-label={t('canvas.assemblyView')}
            size="sm"
            value={volume ? 'volume' : 'developed'}
            onValueChange={(v) => setVolumeMode(v === 'volume')}
            options={[
              { value: 'developed', label: t('canvas.developed') },
              { value: 'volume', label: t('canvas.volume') },
            ]}
          />
        ) : null}
        <SegmentedControl
          aria-label={t('canvas.view')}
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'interior', label: t('canvas.interior') },
            { value: 'exterior', label: t('canvas.exterior') },
          ]}
        />
      </div>
      <div className={cn('absolute right-3 bottom-3 z-10', compact && 'right-2 bottom-2', compact && selection && editable && 'hidden')}>
        <ZoomControls zoom={cam.zoom} onZoom={(f) => zoomBy(f)} onFit={fit} compact={compact} />
      </div>
      {/* Nunca por debajo de los controles de zoom (≈ 180 px a la derecha). */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-3 left-3 z-10 flex min-w-0 items-center gap-3 *:pointer-events-auto',
          compact ? 'right-28 bottom-2 left-2' : 'right-56',
          compact && selection && editable && 'hidden',
        )}
      >
        <WarningSummary warnings={warnings.general} design={design} onFix={onFix} readOnly={readOnly} />
        {!compact && !selection && editable ? (
          <p className="min-w-0 truncate text-meta text-fg-muted pointer-events-none!">
            {coarse ? t('canvas.hintTouch') : size.width >= 900 ? t('canvas.hintWide') : t('canvas.hintNarrow')}
          </p>
        ) : null}
      </div>

      <div className="sr-only" aria-live="polite">
        {snap ? t('canvas.snapLive', { before: fmt.mm(snap.before), after: fmt.mm(snap.after) }) : announce}
      </div>
    </div>
  )
}
