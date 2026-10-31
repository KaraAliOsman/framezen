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
 * El dibujo es WindowDrawing de @framezen/documents (mismo SVG que documentos y portal); las capas
 * de interacción usan su mismo Viewport, así que calzan al píxel.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Minus, Plus, Scan } from 'lucide-react'
import { computeBom, computeLayout, setMullionAxis, type Catalog, type Layout, type LayoutDimension, type LayoutMullion, type Rect, type WindowDesign } from '@framezen/engine'
import { WindowDrawing, type DrawingView, type Viewport } from '@framezen/documents'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { isTypingTarget } from '../../lib/useShortcut'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Tooltip } from '../../ui/Tooltip'
import { ContextToolbar } from './canvas/ContextToolbar'
import { DimensionEditor } from './canvas/DimensionEditor'
import { WarningMarkerButton, WarningSummary } from './canvas/WarningLayer'
import { canRemoveDivision, nodeSummary, nodeTitle, removeDivision, resolveSelection, splitAction, type Change } from './lib/actions'
import { applyDimension, applySizePair, dimensionAnchor, dimensionTarget, isTotalDimension } from './lib/dimensions'
import { focusCameFromTab, useElementSize } from './lib/hooks'
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
  zoomLabel,
  type Insets,
  type Pan,
} from './lib/viewport'
import { nodeRect, splitWarnings } from './lib/warnings'

export interface DesignCanvasProps {
  design: WindowDesign
  catalog: Catalog
  /** Cada cambio llega con un texto corto para el historial («Dividir en 2 (vertical)»). */
  onChange: (next: WindowDesign, label: string) => void
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

/** Anillo doble de selección: separación de papel + 2 px de tinta (DESIGN.md, foco). */
function SelectionRing({ r, kind }: { r: Rect; kind: 'select' | 'hover' | 'focus' }) {
  if (kind === 'hover') {
    return <rect x={r.x + 0.5} y={r.y + 0.5} width={Math.max(0, r.w - 1)} height={Math.max(0, r.h - 1)} rx={1.5} fill="var(--ink-50)" fillOpacity={0.28} stroke="var(--ink-500)" strokeOpacity={0.55} strokeWidth={1} />
  }
  if (kind === 'focus') {
    return <rect x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} rx={3} fill="none" stroke="var(--ink-500)" strokeWidth={1.5} strokeDasharray="4 3" />
  }
  return (
    <g>
      <rect className="fz-sel-tint" x={r.x} y={r.y} width={r.w} height={r.h} fill="var(--ink-50)" fillOpacity={0.4} />
      <rect x={r.x - 1} y={r.y - 1} width={r.w + 2} height={r.h + 2} rx={2} fill="none" stroke="var(--paper-0)" strokeWidth={2} />
      <rect x={r.x - 3} y={r.y - 3} width={r.w + 6} height={r.h + 6} rx={3.5} fill="none" stroke="var(--ink-500)" strokeWidth={2} />
    </g>
  )
}

/** Cuadrícula de 100 mm a escala, alineada con el marco (se aclara al alejarse). */
const Grid = memo(function Grid({ scale, originX, originY, frame }: { scale: number; originX: number; originY: number; frame: Rect }) {
  let stepMm = 100
  while (stepMm * scale < 9 && stepMm < 100000) stepMm *= stepMm === 100 ? 5 : 2
  const step = stepMm * scale
  const major = step * (stepMm === 100 ? 10 : 5)
  const id = useMemo(() => `fzg${Math.random().toString(36).slice(2, 8)}`, [])
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" shapeRendering="crispEdges">
      <defs>
        <pattern id={`${id}a`} width={step} height={step} patternUnits="userSpaceOnUse" x={originX} y={originY}>
          <path d={`M${step} 0V${step}M0 ${step}H${step}`} fill="none" stroke="var(--paper-200)" strokeOpacity={0.5} strokeWidth={1} />
        </pattern>
        <pattern id={`${id}b`} width={major} height={major} patternUnits="userSpaceOnUse" x={originX} y={originY}>
          <path d={`M${major} 0V${major}M0 ${major}H${major}`} fill="none" stroke="var(--paper-200)" strokeOpacity={0.85} strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}a)`} />
      <rect width="100%" height="100%" fill={`url(#${id}b)`} />
      <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="var(--paper-50)" />
    </svg>
  )
})

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
  const clashesView = (t: number) => t < 48 && left < 200
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
  const btn =
    'inline-flex size-8 items-center justify-center rounded-sm text-paper-600 outline-none transition-colors duration-120 hover:bg-paper-100 hover:text-paper-900 focus-visible:shadow-[0_0_0_2px_var(--ink-500)] touch:size-10'
  return (
    <div data-canvas-ui="" className="flex items-center gap-0.5 rounded-md border border-paper-200 bg-paper-0 p-0.5 shadow-[0_1px_2px_rgb(31_28_24/0.06)]">
      {!compact ? (
        <Tooltip content="Alejar" shortcut="-">
          <button type="button" aria-label="Alejar" className={btn} onClick={() => onZoom(1 / 1.25)}>
            <Minus aria-hidden strokeWidth={1.75} className="size-4" />
          </button>
        </Tooltip>
      ) : null}
      <Tooltip content="Encuadrar" shortcut="f">
        <button type="button" aria-label={`Zoom ${zoomLabel(zoom)}. Encuadrar`} className={cn(btn, 'w-auto min-w-14 px-1.5 text-[12px] font-medium tabular')} onClick={onFit}>
          {zoomLabel(zoom)}
        </button>
      </Tooltip>
      {!compact ? (
        <Tooltip content="Acercar" shortcut="+">
          <button type="button" aria-label="Acercar" className={btn} onClick={() => onZoom(1.25)}>
            <Plus aria-hidden strokeWidth={1.75} className="size-4" />
          </button>
        </Tooltip>
      ) : null}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-paper-200" />
      <Tooltip content="Encuadrar" shortcut="f">
        <button type="button" aria-label="Encuadrar la ventana" className={btn} onClick={onFit}>
          <Scan aria-hidden strokeWidth={1.75} className="size-4" />
        </button>
      </Tooltip>
    </div>
  )
}

export function DesignCanvas({ design, catalog, onChange, selectedNodeId, onSelect, view: viewProp, onViewChange, readOnly = false, className }: DesignCanvasProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>(FALLBACK_SIZE)
  const compact = size.width < 600
  const insets = insetsFor(size.width)
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
  const [panning, setPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [ring, setRing] = useState(false)

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
      onChange(change.design, change.label)
      if (nextSelected !== undefined) select(nextSelected)
      else if (selectedNodeId && !resolveSelection(change.design, selectedNodeId)) select(successorOf(selectedNodeId, change.design))
    },
    [onChange, readOnly, select, selectedNodeId],
  )

  const onFix = useCallback((next: WindowDesign, label: string) => apply({ design: next, label }), [apply])

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
    if (layout.sliding.length) return layout.sliding.map((p) => ({ id: p.panelId, rect: toStage(vp, layout, p.rect), kind: 'panel' as const }))
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

  const selectedRects = rectsFor(selectedNodeId, mullionIndex)
  const anchor = unionRect(selectedRects)

  // ── Avisos ────────────────────────────────────────────────────────────────
  const warnings = useMemo(() => splitWarnings(bom.warnings, baseLayout), [bom, baseLayout])

  // ── Teclado ───────────────────────────────────────────────────────────────
  const removeSelected = (): boolean => {
    if (!selectedNodeId || !canRemoveDivision(design, selectedNodeId)) return false
    const sel = resolveSelection(design, selectedNodeId)
    if (!sel) return false
    if (sel.kind === 'leaf' && sel.parent) {
      const siblings = sel.parent.node.children
      const neighbor = siblings[sel.parent.index > 0 ? sel.parent.index - 1 : sel.parent.index + 1]
      const change = removeDivision(design, selectedNodeId)
      const keep = neighbor?.type === 'leaf' ? neighbor.id : null
      apply(change, keep)
      return Boolean(change)
    }
    if (sel.kind === 'split') {
      const index = mullionIndex
      const keepNode = index !== null ? sel.node.children[index] : sel.node.children[0]
      const change = removeDivision(design, sel.node.id, index ?? undefined)
      apply(change, keepNode?.type === 'leaf' ? keepNode.id : null)
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
          apply(splitAction(design, selection.node.id, e.key.toLowerCase() === 'v' ? 'vertical' : 'horizontal', e.shiftKey ? 3 : 2))
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
    setDraft(setMullionAxis(design, d.mullion.nodeId, d.mullion.index, result.axis))
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
    if (d.moved && next && next !== design) onChange(next, 'Mover travesaño')
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
      const next = setMullionAxis(design, m.nodeId, m.index, axis)
      if (next !== design) onChange(next, 'Mover travesaño')
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
      apply(removeDivision(design, m.nodeId, m.index), keep?.type === 'leaf' ? keep.id : null)
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
        onDimensionClick={readOnly ? undefined : onDimensionClick}
        className="block select-none"
      />
    ),
    [layout, shown, catalog, view, stage.width, stage.height, readOnly, onDimensionClick],
  )

  const frameRect = offsetRect(toStage(vp, layout, layout.frame.rect), pan)
  const cursor = panning ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : ''
  const announce = selectedNodeId && selection ? `${nodeTitle(design, selectedNodeId)} seleccionado: ${nodeSummary(design, selectedNodeId, catalog)}` : ''
  const dragging = Boolean(snap)

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="group"
      aria-roledescription="lienzo de diseño"
      aria-label={readOnly ? 'Dibujo de la ventana' : 'Lienzo de la ventana. Flechas para elegir paño, Supr quita división, F encuadra.'}
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
        'relative isolate min-h-[320px] touch-none overflow-hidden bg-paper-50 outline-none select-none',
        ring && 'shadow-[inset_0_0_0_2px_var(--ink-500)]',
        // Cotas: se ven clicables (fondo tinta suave al pasar, anillo al enfocar con teclado).
        '[&_[data-layer=dimensions]_[role=button]_rect]:transition-[fill] [&_[data-layer=dimensions]_[role=button]_rect]:duration-120',
        '[&_[data-layer=dimensions]_[role=button]:hover_rect]:fill-ink-50 [&_[data-layer=dimensions]_[role=button]:hover_text]:fill-ink-600',
        '[&_[data-layer=dimensions]_[role=button]:focus-visible_rect]:fill-ink-50 [&_[data-layer=dimensions]_[role=button]:focus-visible_rect]:stroke-ink-500',
        // Modo oscuro: el dibujo trae colores de papel; las cotas pasan a tinta clara para leerse.
        'dark:[&_[data-layer=dimensions]_text]:fill-ink-700 dark:[&_[data-layer=dimensions]_path]:stroke-ink-700',
        'dark:[&_.fz-sel-tint]:fill-ink-500 dark:[&_.fz-sel-tint]:[fill-opacity:0.14]',
        cursor,
        className,
      )}
      data-designer-canvas=""
    >
      <Grid scale={vp.scale} originX={pan.x + vp.ox} originY={pan.y + vp.oy} frame={frameRect} />

      {/* Escenario: dibujo + capas de interacción, trasladado por el paneo. */}
      <div className="absolute top-0 left-0 will-change-transform" style={{ transform: `translate3d(${Math.round(pan.x)}px, ${Math.round(pan.y)}px, 0)`, width: vp.width, height: vp.height }}>
        {drawing}
        <svg className="absolute inset-0 overflow-visible" width={vp.width} height={vp.height} style={{ pointerEvents: 'none' }} aria-hidden={readOnly || undefined}>
          {hoverId && hoverId !== selectedNodeId && !dragging ? rectsFor(hoverId).map((r, i) => <SelectionRing key={`h${i}`} r={r} kind="hover" />) : null}
          {selectedRects.map((r, i) => (
            <SelectionRing key={`s${i}`} r={r} kind="select" />
          ))}
          {focusId && focusId !== selectedNodeId ? rectsFor(focusId).map((r, i) => <SelectionRing key={`f${i}`} r={r} kind="focus" />) : null}
          {!readOnly ? (
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
                const word = vertical ? 'Montante' : 'Travesaño'
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
                    fill={active ? 'var(--ink-500)' : 'transparent'}
                    fillOpacity={active ? 0.12 : 0}
                    role="slider"
                    tabIndex={0}
                    aria-orientation={vertical ? 'horizontal' : 'vertical'}
                    aria-label={`${word} ${m.kind === 'french' ? '(unión francesa)' : ''}`.trim()}
                    aria-valuemin={Math.round(m.min - seg.segStart)}
                    aria-valuemax={Math.round(m.max - seg.segStart)}
                    aria-valuenow={Math.round(before)}
                    aria-valuetext={`${formatNumber(before, 1)} mm ${vertical ? 'a la izquierda' : 'arriba'}, ${formatNumber(after, 1)} mm ${vertical ? 'a la derecha' : 'abajo'}`}
                    style={{ pointerEvents: 'all', cursor: vertical ? 'col-resize' : 'row-resize', outline: 'none' }}
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
        </svg>
      </div>

      {/* Avisos sobre los paños afectados. */}
      {!dragging
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
                className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-sm bg-paper-900 px-2 py-1 text-[12px] font-medium text-paper-0 tabular shadow-float"
                style={{ left: r.x + r.w / 2, top: vertical ? Math.max(18, r.y + r.h / 2) : r.y + r.h / 2 }}
                aria-hidden
              >
                <span>{formatNumber(first, 1)}</span>
                <span className="opacity-50">{vertical ? '|' : '/'}</span>
                <span>{formatNumber(second, 1)}</span>
                {snap.kind === 'center' ? <span className="ml-0.5 rounded-xs bg-paper-0/15 px-1 text-[11px]">mitad</span> : null}
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
          label={isTotalDimension(editing) ? (editing.axis === 'x' ? 'Ancho total' : 'Alto total') : 'Medida del paño'}
          allowPair={isTotalDimension(editing)}
          onCancel={() => {
            setEditing(null)
            containerRef.current?.focus({ preventScroll: true })
          }}
          onCommit={(value) => {
            const change = applyDimension(design, editing, value)
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
      {editable && selection && anchor && !editing && !dragging && !panning ? (
        <Floating key={`${selectedNodeId}-${mullionIndex ?? ''}`} anchor={offsetRect(anchor, pan)} container={size} compact={compact}>
          <ContextToolbar design={design} catalog={catalog} selection={selection} view={view} mullionIndex={mullionIndex} onApply={(c) => apply(c)} compact={compact} />
        </Floating>
      ) : null}

      {/* Controles fijos. */}
      <div data-canvas-ui="" className={cn('absolute top-3 left-3 z-10', compact && 'top-2 left-2')}>
        <SegmentedControl
          aria-label="Vista"
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'interior', label: 'Interior' },
            { value: 'exterior', label: 'Exterior' },
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
          compact ? 'right-2 bottom-2 left-2' : 'right-[196px]',
          compact && selection && editable && 'hidden',
        )}
      >
        <WarningSummary warnings={warnings.general} design={design} onFix={onFix} readOnly={readOnly} />
        {!compact && !selection && editable ? (
          <p className="min-w-0 truncate text-[12px] text-paper-600 pointer-events-none!">
            {size.width >= 900 ? 'Clic en un paño para editarlo · clic en una cota para cambiarla · arrastra los travesaños' : 'Clic en un paño o en una cota para editar'}
          </p>
        ) : null}
      </div>

      <div className="sr-only" aria-live="polite">
        {snap ? `${formatNumber(snap.before, 1)} y ${formatNumber(snap.after, 1)} milímetros` : announce}
      </div>
    </div>
  )
}
