/**
 * Lista de ventanas de la cotización: miniatura dibujada, referencia, medidas, cantidad en línea
 * y precio. Se reordena arrastrando (o con Alt+↑/↓) y cada fila se selecciona con un clic o 1–9.
 * Con teclado es una sola parada de Tab (foco itinerante): ↑/↓ recorren las filas, Inicio/Fin van
 * a los extremos, Enter selecciona y Tab entra a la cantidad de esa fila (que acepta ↑/↓).
 */
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Reorder, useDragControls, useReducedMotion } from 'motion/react'
import { GripVertical, TriangleAlert } from 'lucide-react'
import { designName, formatCLP, formatSize, type Catalog } from '@framezen/engine'
import type { QuoteItem } from '@framezen/shared'
import { cn } from '../../../lib/cn'
import { DesignThumbnail } from '../../designer'
import { itemWarnings } from '../model/evaluate'
import { useEditor, useEditorShallow } from './context'
import { QtyStepper } from './fields'

export function ItemsList({ className, variant = 'column', onOpenItem }: { className?: string; variant?: 'column' | 'cards'; onOpenItem?: (id: string) => void }) {
  const editor = useEditor()
  const { items, selectedItemId, catalog, evaluation } = useEditorShallow((s) => ({
    items: s.doc.items,
    selectedItemId: s.selectedItemId,
    catalog: s.catalog,
    evaluation: s.evaluation,
  }))
  // Orden local mientras se arrastra; se confirma al soltar (un solo paso de deshacer).
  const [order, setOrder] = useState<string[] | null>(null)
  const ids = order ?? items.map((i) => i.id)
  const byId = new Map(items.map((item, index) => [item.id, { item, index }]))
  const reduced = useReducedMotion()
  // Fila que entra al orden de Tab: la que tuvo el foco o, si no, la seleccionada.
  const [focusId, setFocusId] = useState<string | null>(null)
  const tabId = focusId && byId.has(focusId) ? focusId : selectedItemId && byId.has(selectedItemId) ? selectedItemId : (ids[0] ?? null)

  useEffect(() => {
    setOrder(null)
  }, [items])

  useEffect(() => {
    setFocusId(null)
  }, [selectedItemId])

  const onRowKey = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity }
    const step = keys[e.key]
    if (step === undefined) return
    e.preventDefault()
    const rows = Array.from(e.currentTarget.closest('ol')?.querySelectorAll<HTMLButtonElement>('button[data-item-row]') ?? [])
    const at = rows.indexOf(e.currentTarget)
    const next = step === -Infinity ? 0 : step === Infinity ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + step))
    rows[next]?.focus()
  }, [])

  const commitOrder = () => {
    if (order && order.some((id, i) => id !== items[i]?.id)) editor.reorderItems(order)
    setOrder(null)
  }

  return (
    <Reorder.Group
      as="ol"
      axis="y"
      values={ids}
      onReorder={setOrder}
      aria-label="Ventanas de la cotización"
      className={cn('flex flex-col', variant === 'column' ? 'gap-1' : 'gap-2', className)}
    >
      {ids.map((id) => {
        const entry = byId.get(id)
        if (!entry) return null
        const evaluated = evaluation.items[entry.index]
        return (
          <Row
            key={id}
            item={entry.item}
            index={entry.index}
            total={items.length}
            selected={id === selectedItemId}
            totalNet={evaluated?.price.totalNet ?? 0}
            unitNet={evaluated?.price.unitNet ?? 0}
            warned={itemWarnings(evaluated?.bom, evaluated?.price.warnings).some((w) => w.level !== 'info')}
            catalog={catalog}
            variant={variant}
            reduced={!!reduced}
            tabbable={id === tabId}
            onFocusRow={setFocusId}
            onRowKey={onRowKey}
            onDragEnd={commitOrder}
            onOpen={onOpenItem}
          />
        )
      })}
    </Reorder.Group>
  )
}

interface RowProps {
  item: QuoteItem
  index: number
  total: number
  selected: boolean
  totalNet: number
  unitNet: number
  warned: boolean
  catalog: Catalog
  variant: 'column' | 'cards'
  reduced: boolean
  /** Única fila con Tab (foco itinerante). */
  tabbable: boolean
  onFocusRow: (id: string) => void
  onRowKey: (e: KeyboardEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  onOpen?: (id: string) => void
}

const Row = memo(function Row({
  item,
  index,
  total,
  selected,
  totalNet,
  unitNet,
  warned,
  catalog,
  variant,
  reduced,
  tabbable,
  onFocusRow,
  onRowKey,
  onDragEnd,
  onOpen,
}: RowProps) {
  const editor = useEditor()
  const controls = useDragControls()
  const rowRef = useRef<HTMLLIElement>(null)
  const name = item.name?.trim() || designName(item.design)
  const cards = variant === 'cards'

  useEffect(() => {
    if (selected && !cards) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [selected, cards, reduced])

  return (
    <Reorder.Item
      ref={rowRef}
      value={item.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      layout="position"
      transition={{ duration: reduced ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
      whileDrag={{ scale: 1.01, boxShadow: '0 1px 2px rgb(31 28 24 / .06), 0 8px 24px rgb(31 28 24 / .1)' }}
      className={cn('group relative list-none rounded-md', cards ? 'bg-paper-0' : '')}
      style={{ position: 'relative' }}
    >
      <div
        className={cn(
          'relative flex items-start gap-3 rounded-md border text-left transition-colors duration-120',
          cards ? 'border-paper-200 p-3' : 'py-2 pr-2.5 pl-2',
          selected
            ? 'border-ink-100 bg-ink-50/70'
            : cards
              ? 'hover:bg-paper-50'
              : 'border-transparent hover:bg-paper-100/70',
        )}
      >
        {/* Botón que cubre la fila: seleccionar con clic, Enter o Espacio; Alt+↑/↓ para mover. */}
        <button
          type="button"
          data-item-row=""
          tabIndex={tabbable ? 0 : -1}
          onFocus={() => onFocusRow(item.id)}
          aria-current={selected ? 'true' : undefined}
          aria-label={`${item.ref}, ${name}, ${formatSize(item.design.width, item.design.height)}, ${item.qty} ${item.qty === 1 ? 'unidad' : 'unidades'}, ${formatCLP(totalNet)}`}
          onClick={() => {
            editor.select(item.id)
            onOpen?.(item.id)
          }}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault()
              const target = e.currentTarget
              editor.moveItem(index, e.key === 'ArrowUp' ? index - 1 : index + 1)
              requestAnimationFrame(() => target.focus())
              return
            }
            onRowKey(e)
          }}
          className="absolute inset-0 cursor-pointer rounded-md focus-visible:outline-offset-[-2px]"
        />
        {selected && !cards ? <span aria-hidden className="pointer-events-none absolute top-2 bottom-2 -left-px w-0.5 rounded-full bg-ink-600" /> : null}
        {total > 1 ? (
          <span
            aria-hidden
            onPointerDown={(e) => {
              e.preventDefault()
              controls.start(e)
            }}
            className={cn(
              'absolute top-1/2 -left-0.5 z-10 flex h-8 w-3.5 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-xs text-paper-350 active:cursor-grabbing',
              cards ? 'hidden' : 'opacity-0 transition-opacity duration-120 group-hover:opacity-100',
            )}
          >
            <GripVertical strokeWidth={1.75} className="size-3.5" />
          </span>
        ) : null}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none flex shrink-0 items-center justify-center rounded-sm border border-paper-200 bg-paper-50',
            cards ? 'size-16' : 'size-12',
          )}
        >
          <DesignThumbnail design={item.design} catalog={catalog} size={cards ? 56 : 42} />
        </div>
        <div className="pointer-events-none min-w-0 flex-1">
          <div aria-hidden className="flex items-baseline gap-1.5">
            <span className="shrink-0 text-[13px] font-semibold tabular text-paper-900">{item.ref}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-paper-900">{name}</span>
            {warned ? (
              <span title="Tiene avisos: revísalos en el panel de la ventana" className="pointer-events-auto relative inline-flex shrink-0 self-center text-warn-600">
                <TriangleAlert strokeWidth={2} className="size-3.5" />
              </span>
            ) : null}
          </div>
          <div aria-hidden className="mt-0.5 truncate text-meta text-paper-600">
            <span className="narrow tabular">{formatSize(item.design.width, item.design.height).replace(' mm', '')}</span>
            {item.location ? <> · {item.location}</> : null}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <QtyStepper
              value={item.qty}
              onChange={(qty) => editor.setQty(item.id, qty)}
              label={`Cantidad de ${item.ref}`}
              size={cards ? 'md' : 'sm'}
              tabIndex={tabbable ? 0 : -1}
              stepButtonsInTabOrder={false}
              className="pointer-events-auto relative z-10"
            />
            <span aria-hidden className="min-w-0 text-right leading-4">
              <span className="block text-[13px] font-medium tabular text-paper-900">{formatCLP(totalNet)}</span>
              {item.qty > 1 ? <span className="block text-[11px] tabular text-paper-600">{formatCLP(unitNet)} c/u</span> : null}
            </span>
          </div>
          {warned ? <span className="sr-only">Tiene avisos.</span> : null}
        </div>
      </div>
    </Reorder.Item>
  )
})
