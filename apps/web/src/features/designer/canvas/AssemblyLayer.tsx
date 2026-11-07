/**
 * Unir ventanas desde el dibujo. Al acercar el cursor a un borde o esquina aparece un «+»: duplica esa
 * ventana y la une por ese lado. Sobre cada unión hay un control con su ángulo y dirección, y la
 * ventana elegida de un conjunto se cambia de tipo o se quita ahí mismo. Vive dentro del escenario,
 * así que el paneo la mueve junto con el dibujo; en pantallas táctiles el «+» de la ventana elegida
 * queda a la vista y con teclado se llega a todos.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Link2, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { computeLayout, foldAngle, isAssembly, matchTypology, parseUnitNodeId, removeUnit, updateUnit, type Catalog, type Layout, type LayoutAssemblyJoint, type UnitSide, type WindowDesign } from '@dekopen/engine'
import type { Viewport } from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { useGlossary, useT } from '../../../lib/i18n'
import { IconButton } from '../../../ui/IconButton'
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover'
import { JointEditor, angleText } from '../JointEditor'
import es from '../i18n/es'
import { addNeighbor, addedJoint, changeTypology, jointAngle, jointBreakable, nearestEdge, unitTypologies, type EdgeBox } from '../lib/assembly'
import type { Change } from '../lib/actions'
import { undoLabel, type UndoKey } from '../lib/undo'
import { toStage } from '../lib/viewport'
import { PickerList } from '../parts/SearchPicker'

const SIDES: UnitSide[] = ['left', 'right', 'top', 'bottom']
const opposite = (side: UnitSide): UnitSide => (side === 'left' ? 'right' : side === 'right' ? 'left' : side)

export interface AssemblyLayerProps {
  design: WindowDesign
  layout: Layout
  catalog: Catalog
  vp: Viewport
  mirror: boolean
  /** Sin cursor: el «+» de la ventana elegida queda visible. */
  coarse: boolean
  compact: boolean
  selectedNodeId: string | null
  /** Hay un gesto en curso (arrastre, paneo, cota abierta): los «+» se apartan. */
  quiet: boolean
  onApply: (change: Change, nextSelected?: string | null) => void
}

interface Box extends EdgeBox {
  /** Unidad del conjunto; en una ventana suelta, null. */
  unitId: string | null
  design: WindowDesign
}

/** Dónde cae un punto del borde `side` de la caja, en px del escenario. */
function edgePoint(box: Box, side: UnitSide, along: number): { x: number; y: number } {
  if (side === 'left') return { x: box.x, y: box.y + along }
  if (side === 'right') return { x: box.x + box.w, y: box.y + along }
  return { x: box.x + along, y: side === 'top' ? box.y : box.y + box.h }
}

function ghostRect(box: Box, side: UnitSide) {
  if (side === 'left') return { left: box.x - box.w, top: box.y, width: box.w, height: box.h }
  if (side === 'right') return { left: box.x + box.w, top: box.y, width: box.w, height: box.h }
  return { left: box.x, top: side === 'top' ? box.y - box.h : box.y + box.h, width: box.w, height: box.h }
}

/**
 * Chip sobre una unión. Su control se abre arriba de la unión (o abajo), fuera de los paños: los
 * bordes siguen libres para seguir agregando con el «+» sin cerrarlo antes.
 */
function JointChip({ joint, design, layout, catalog, vp, mirror, compact, canvas, open, onOpenChange, onEmit }: { joint: LayoutAssemblyJoint; design: WindowDesign; layout: Layout; catalog: Catalog; vp: Viewport; mirror: boolean; compact: boolean; canvas: HTMLElement | null; open: boolean; onOpenChange: (open: boolean) => void; onEmit: (next: WindowDesign, key: UndoKey) => void }) {
  const t = useT(es)
  const r = toStage(vp, layout, joint.rect)
  const breakable = jointBreakable(design, joint)
  const post = foldAngle(jointAngle(design, joint))
  const flat = Math.abs(post - 180) < 0.5
  const inward = jointAngle(design, joint) > 180.5
  const missing = joint.status === 'missing'
  const state = !breakable ? '' : flat ? t('assembly.straight') : inward ? t('assembly.inward') : t('assembly.outward')
  const Direction = inward ? ChevronDown : ChevronUp
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-canvas-ui=""
          data-joint-chip={joint.id}
          data-status={joint.status}
          aria-label={t('assembly.jointState', { label: joint.label, angle: breakable ? angleText(post) : '', state }).trim()}
          style={{ left: r.x + r.w / 2, top: r.y + r.h / 2 }}
          className={cn(
            'dim pointer-events-auto absolute flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full bg-surface px-1.5 text-micro font-medium text-fg-strong shadow-float transition-[scale] duration-100 outline-none active:scale-[.97] touch:h-8 touch:px-2.5',
            'hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus',
            open && 'ring-2 ring-[var(--dk-select)]',
            missing && 'text-danger',
          )}
        >
          {missing ? <TriangleAlert aria-hidden strokeWidth={2} className="size-3" /> : null}
          {breakable ? angleText(post) : <Link2 aria-hidden strokeWidth={2} className="size-3" />}
          {breakable && !flat ? <Direction aria-hidden strokeWidth={2.25} className="size-3" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={joint.dir === 'vertical' ? 'top' : 'right'}
        align={compact ? 'center' : 'end'}
        alignOffset={compact ? 0 : 24}
        sideOffset={(joint.dir === 'vertical' ? r.h : r.w) / 2 + 10}
        collisionBoundary={compact ? undefined : canvas}
        updatePositionStrategy="always"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={compact ? 'w-[248px]' : 'w-[396px]'}
        aria-label={t('assembly.joint', { label: joint.label })}
      >
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h3 className="text-table font-medium text-fg-strong">{t('assembly.joint', { label: joint.label })}</h3>
          {joint.length > 0 ? <span className="dim text-meta text-fg-muted">{joint.length} mm</span> : null}
        </div>
        <JointEditor joint={joint} design={design} catalog={catalog} onEmit={onEmit} mirror={mirror} wide={!compact} />
      </PopoverContent>
    </Popover>
  )
}

/** Lo que se cambia tocando una ventana del conjunto: su tipo y quitarla. */
function UnitBar({ box, design, catalog, onEmit, onRemove }: { box: Box; design: WindowDesign; catalog: Catalog; onEmit: (next: WindowDesign, key: UndoKey) => void; onRemove: () => void }) {
  const t = useT(es)
  const g = useGlossary()
  const [open, setOpen] = useState(false)
  const unitId = box.unitId!
  const line = catalog.lines.find((l) => l.id === box.design.lineId)
  const items = unitTypologies(line, catalog).map((x) => ({ value: x.id, label: g.typology(x.id), keywords: x.tags }))
  const current = matchTypology(box.design)
  return (
    <div
      data-canvas-ui=""
      data-unit-bar={unitId}
      style={{ left: box.x + box.w / 2, top: box.y + box.h - 8 }}
      className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-sm bg-raised p-0.5 text-table shadow-float"
    >
      <span className="dim px-1.5 text-micro font-medium text-fg-muted">{unitId}</span>
      {items.length ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-label={t('assembly.typeOf', { unit: unitId })} className="inline-flex h-6 max-w-40 items-center gap-1 rounded-xs px-1.5 text-table text-fg-strong outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus">
              <span className="truncate">{current ? g.typology(current) : t('settings.typologyCustom')}</span>
              <ChevronDown aria-hidden strokeWidth={2} className="size-3 shrink-0 text-fg-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent flush side="top" className="w-64">
            <PickerList
              value={current}
              onSelect={(id) => {
                setOpen(false)
                onEmit(updateUnit(design, unitId, changeTypology(box.design, id), catalog), 'assemblyUnit')
              }}
              groups={[{ id: 't', items }]}
            />
          </PopoverContent>
        </Popover>
      ) : null}
      <IconButton size="xs" icon={Trash2} label={t('assembly.remove', { unit: unitId })} onClick={onRemove} />
    </div>
  )
}

export function AssemblyLayer({ design, layout, catalog, vp, mirror, coarse, compact, selectedNodeId, quiet, onApply }: AssemblyLayerProps) {
  const t = useT(es)
  const rootRef = useRef<HTMLDivElement>(null)
  const assembly = isAssembly(design)
  const boxes = useMemo<Box[]>(() => {
    const units = layout.assembly?.units
    if (units?.length) return units.map((u) => ({ id: u.unitId, unitId: u.unitId, design: u.design, ...toStage(vp, layout, u.rect) }))
    return [{ id: 'window', unitId: null, design, ...toStage(vp, layout, { x: 0, y: 0, w: layout.width, h: layout.height }) }]
  }, [layout, vp, design])
  const [hot, setHot] = useState<{ id: string; side: UnitSide; along: number } | null>(null)
  const [ghost, setGhost] = useState<{ id: string; side: UnitSide } | null>(null)
  const [openJoint, setOpenJoint] = useState<string | null>(null)
  const [canvas, setCanvas] = useState<HTMLElement | null>(null)
  const live = useRef({ boxes, quiet })
  live.current = { boxes, quiet }

  useEffect(() => {
    const stage = rootRef.current
    const el = stage?.closest<HTMLElement>('[data-designer-canvas]')
    if (!stage || !el) return
    setCanvas(el)
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons !== 0 || live.current.quiet) return setHot(null)
      const at = stage.getBoundingClientRect()
      const next = nearestEdge({ x: e.clientX - at.left, y: e.clientY - at.top }, live.current.boxes)
      setHot((prev) => (!next ? null : prev && prev.id === next.id && prev.side === next.side && prev.along === next.along ? prev : next))
    }
    const onLeave = () => setHot(null)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const selectedUnit = selectedNodeId && assembly ? parseUnitNodeId(selectedNodeId).unitId : null
  const emit = (next: WindowDesign, key: UndoKey, selected?: string | null) => {
    if (next === design) return
    const step = undoLabel(key)
    onApply({ design: next, label: step.label, undo: step.undo }, selected)
  }
  const join = (box: Box, stageSide: UnitSide) => {
    const side = mirror ? opposite(stageSide) : stageSide
    const next = addNeighbor(design, side, catalog, box.unitId ?? undefined)
    setGhost(null)
    setHot(null)
    emit(next, 'assemblyJoin', null)
    // Una unión nueva y recta pide su ángulo; si heredó el de su vecina, se sigue armando sin parar.
    const joint = addedJoint(design, computeLayout(next, catalog), box.unitId ?? undefined)
    setOpenJoint(joint && joint.angle === 180 && jointBreakable(next, joint) ? joint.id : null)
  }

  const handleShown = (box: Box, side: UnitSide) => {
    if (quiet) return false
    if (hot?.id === box.id && hot.side === side) return true
    return coarse && (box.unitId ? box.unitId === selectedUnit : true)
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0" data-assembly-layer="">
      {ghost
        ? boxes
            .filter((b) => b.id === ghost.id)
            .map((b) => <div key="ghost" aria-hidden className="absolute rounded-xs border-2 border-dashed opacity-50" style={{ ...ghostRect(b, ghost.side), borderColor: 'var(--dk-select)' }} />)
        : null}

      {boxes.flatMap((box) =>
        SIDES.map((side) => {
          const shown = handleShown(box, side)
          const along = hot?.id === box.id && hot.side === side ? hot.along : (side === 'left' || side === 'right' ? box.h : box.w) / 2
          const at = edgePoint(box, side, along)
          const unit = box.unitId ?? t('assembly.thisWindow')
          return (
            <button
              key={`${box.id}-${side}`}
              type="button"
              data-canvas-ui=""
              data-join-side={side}
              data-join-unit={box.unitId ?? ''}
              data-shown={shown || undefined}
              aria-label={t(`assembly.add.${side}`, { unit })}
              style={{ left: at.x, top: at.y }}
              onPointerEnter={() => setGhost({ id: box.id, side })}
              onPointerLeave={() => setGhost(null)}
              onBlur={() => setGhost(null)}
              onClick={() => join(box, side)}
              className={cn(
                'absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-surface text-[var(--dk-select)] outline-none transition-opacity duration-100',
                'hover:bg-[var(--dk-select)] hover:text-white focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:ring-2 focus-visible:ring-focus',
                'after:absolute after:-inset-2.5',
                shown ? 'pointer-events-auto opacity-100' : 'opacity-0',
              )}
            >
              <Plus aria-hidden strokeWidth={2.5} className="size-3.5" />
            </button>
          )
        }),
      )}

      {(layout.assembly?.joints ?? []).map((joint) => (
        <JointChip
          key={joint.id}
          joint={joint}
          design={design}
          layout={layout}
          catalog={catalog}
          vp={vp}
          mirror={mirror}
          compact={compact}
          canvas={canvas}
          open={openJoint === joint.id}
          onOpenChange={(open) => setOpenJoint(open ? joint.id : null)}
          onEmit={(next, key) => emit(next, key)}
        />
      ))}

      {selectedUnit && !compact && !quiet
        ? boxes
            .filter((b) => b.unitId === selectedUnit)
            .map((b) => (
              <UnitBar
                key={b.id}
                box={b}
                design={design}
                catalog={catalog}
                onEmit={(next, key) => emit(next, key)}
                onRemove={() => {
                  setOpenJoint(null)
                  emit(removeUnit(design, selectedUnit, catalog), 'assemblyRemove', null)
                }}
              />
            ))
        : null}
    </div>
  )
}
