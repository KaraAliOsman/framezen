/**
 * Lista de ventanas de la cotización: miniatura dibujada, referencia, medidas, cantidad en línea
 * y precio. Filas sin borde: la activa sube de tono con la sombra de pastilla, sin filo de color.
 * Se reordena arrastrando (o con Alt+↑/↓) y cada fila se selecciona con un clic o 1–9. Con teclado
 * es una sola parada de Tab (foco itinerante): ↑/↓ recorren las filas, Inicio/Fin van a los extremos,
 * Enter selecciona (y en la fila ya elegida abre «Agregar ventana») y Tab entra a la cantidad de esa
 * fila (que acepta ↑/↓).
 */
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Reorder, useDragControls, useReducedMotion } from 'motion/react'
import { GripVertical, TriangleAlert } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { QuoteItem } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { DesignThumbnail } from '../../designer'
import es from '../i18n/es'
import { itemWarnings } from '../model/evaluate'
import { useEditor, useEditorShallow, useEditorUiApi } from './context'
import { QtyStepper } from './fields'
import { useItemName } from './names'

export function ItemsList({ className, variant = 'column', onOpenItem }: { className?: string; variant?: 'column' | 'cards'; onOpenItem?: (id: string) => void }) {
  const t = useT(es)
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
  // Solo las filas nuevas entran con movimiento (no toda la lista al abrir la cotización).
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])
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
      aria-label={t('items.list')}
      className={cn('flex flex-col', variant === 'column' ? 'gap-0.5' : 'divide-y divide-divider', className)}
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
            included={evaluated?.included ?? true}
            pending={Boolean(evaluated?.price.pending?.length) && !evaluated?.price.totalNet}
            unitNet={evaluated?.price.unitNet ?? 0}
            warned={itemWarnings(evaluated?.bom, evaluated?.price.warnings).some((w) => w.level !== 'info')}
            catalog={catalog}
            variant={variant}
            reduced={!!reduced}
            animateIn={mounted.current}
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
  included: boolean
  pending: boolean
  warned: boolean
  catalog: Catalog
  variant: 'column' | 'cards'
  reduced: boolean
  /** Fila recién agregada: entra con 180 ms de opacidad + 4 px. */
  animateIn: boolean
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
  included,
  pending,
  warned,
  catalog,
  variant,
  reduced,
  animateIn,
  tabbable,
  onFocusRow,
  onRowKey,
  onDragEnd,
  onOpen,
}: RowProps) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const itemName = useItemName()
  const editor = useEditor()
  const ui = useEditorUiApi()
  const controls = useDragControls()
  const rowRef = useRef<HTMLLIElement>(null)
  const name = itemName(item)
  const cards = variant === 'cards'
  const size = fmt.size(item.design.width, item.design.height)
  const secondary = item.location?.trim()

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
      initial={reduced || !animateIn ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      whileDrag={{ scale: 1.01, boxShadow: 'var(--dk-shadow-float)' }}
      className={cn('group relative list-none', !cards && 'rounded-md')}
      style={{ position: 'relative' }}
    >
      <div
        className={cn(
          'relative flex items-center gap-3 text-left transition-[background-color,box-shadow] duration-100',
          cards ? 'px-1 py-3 active:bg-hover' : 'rounded-md py-2 pr-2.5 pl-2.5',
          !cards && (selected ? 'bg-surface shadow-raised' : 'hover:bg-hover'),
        )}
      >
        {/* Botón que cubre la fila: seleccionar con clic, Enter o Espacio; Alt+↑/↓ para mover. */}
        <button
          type="button"
          data-item-row=""
          tabIndex={tabbable ? 0 : -1}
          onFocus={() => onFocusRow(item.id)}
          aria-current={selected ? 'true' : undefined}
          aria-label={t('items.row', { ref: item.ref, name, size, units: g.count('pieces', item.qty), total: fmt.money(totalNet) })}
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
            if (e.key === 'Enter' && selected && !cards) {
              e.preventDefault()
              ui.getState().set({ pickerOpen: true })
              return
            }
            onRowKey(e)
          }}
          className={cn('absolute inset-0 cursor-pointer focus-visible:-outline-offset-2', !cards && 'rounded-md')}
        />
        {total > 1 ? (
          <span
            aria-hidden
            onPointerDown={(e) => {
              e.preventDefault()
              controls.start(e)
            }}
            className={cn(
              'absolute top-1/2 left-0 z-10 flex h-8 w-3 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-xs text-fg-faint active:cursor-grabbing',
              cards ? 'hidden' : 'opacity-0 transition-opacity duration-100 group-hover:opacity-100',
            )}
          >
            <GripVertical strokeWidth={1.75} className="size-3.5" />
          </span>
        ) : null}
        <div aria-hidden className={cn('pointer-events-none flex shrink-0 items-center justify-center', cards ? 'size-16' : 'size-12')}>
          <DesignThumbnail design={item.design} catalog={catalog} size={cards ? 60 : 46} />
        </div>
        <div className="pointer-events-none min-w-0 flex-1">
          <div aria-hidden className="flex items-baseline gap-1.5">
            <span className="code-id shrink-0 text-table font-medium text-fg-strong">{item.ref}</span>
            <span className="min-w-0 flex-1 truncate text-table text-fg-strong">{secondary || name}</span>
            {warned ? (
              <span title={t('items.warned')} className="pointer-events-auto relative inline-flex shrink-0 self-center text-warning">
                <TriangleAlert strokeWidth={1.75} className="size-3.5" />
              </span>
            ) : null}
          </div>
          <div aria-hidden className="mt-0.5 truncate text-meta text-fg-muted">
            {secondary ? <>{name} · </> : null}
            <span className="dim">{size}</span>
            {item.role && item.role !== 'base' ? <> · {t(item.role === 'optional' ? 'items.tagOptional' : 'items.tagAlternative')}{included ? '' : ` · ${t('items.tagOff')}`}</> : null}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <QtyStepper
              value={item.qty}
              onChange={(qty) => editor.setQty(item.id, qty)}
              label={t('qty.label', { ref: item.ref })}
              size={cards ? 'md' : 'sm'}
              quiet={!cards}
              tabIndex={tabbable ? 0 : -1}
              stepButtonsInTabOrder={false}
              className="pointer-events-auto relative z-10 shrink-0"
            />
            <span aria-hidden className="min-w-0 text-right" title={item.qty > 1 ? t('items.each', { price: fmt.money(unitNet) }) : undefined}>
              {pending ? <span className="block text-table font-medium whitespace-nowrap text-warning">{t('items.pending')}</span> : <span className={cn('block text-table font-medium whitespace-nowrap tabular', included ? 'text-fg-strong' : 'text-fg-muted')}>{fmt.money(totalNet)}</span>}
            </span>
          </div>
          {warned ? <span className="sr-only">{t('items.warnedSr')}</span> : null}
        </div>
      </div>
    </Reorder.Item>
  )
})
