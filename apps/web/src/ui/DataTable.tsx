import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatNumber, normalizeSearch } from '../lib/format'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { parseCLP } from './MoneyField'
import { parseMeasure } from './NumberField'
import { SkeletonRows } from './Skeleton'
import { WindowSketch } from './WindowSketch'

export type SortDir = 'asc' | 'desc'

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  /** Valor para ordenar, buscar y sumar. */
  value?: (row: T) => string | number | null | undefined
  /** Celda personalizada (si no, se muestra `value`, formateado con `format` si es número). */
  cell?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number | string
  /**
   * Ancho mínimo en px: la columna nunca se aplasta por debajo. Por defecto: el `width` si es un
   * número; 200 px si no tiene `width` (la columna principal: obra, cliente, artículo); 120 px si el
   * `width` es un porcentaje. Si las columnas no caben, primero se esconden las secundarias
   * (`hideBelow`, de la menos a la más importante) y, si aun así no caben, la tabla se desplaza en
   * horizontal en vez de aplastar.
   */
  minWidth?: number
  /** Ordenable (por defecto, si tiene `value`). */
  sortable?: boolean
  /** Pie: 'sum' suma `value`; o una función con las filas visibles. */
  footer?: 'sum' | ((rows: T[]) => ReactNode)
  format?: (n: number) => ReactNode
  /** Edición en línea: clic o Enter edita, Enter confirma, Esc cancela. */
  edit?: {
    type: 'text' | 'number' | 'money'
    onCommit: (row: T, value: string | number | null) => void
    label?: (row: T) => string
  }
  /**
   * Columna secundaria: se oculta bajo este ancho de pantalla (sm 640, md 768, lg 1024, xl 1280) y
   * también cuando no cabe en su contenedor (primero las `xl`, luego `lg`, `md` y `sm`).
   */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export interface DataTableProps<T> {
  rows: T[]
  columns: DataTableColumn<T>[]
  getRowId: (row: T) => string
  /** Nombre accesible de la tabla. */
  caption: string
  /** Texto de búsqueda (filtra por los `value` de las columnas o por `searchText`). */
  query?: string
  searchText?: (row: T) => string
  /** Filtro adicional (estado, fechas). */
  filter?: (row: T) => boolean
  /** Si existe, se ofrece «Quitar filtros» cuando hay filas ocultas. */
  onClearFilters?: () => void
  defaultSort?: { id: string; dir: SortDir }
  selectable?: boolean
  selected?: ReadonlySet<string>
  onSelectedChange?: (ids: Set<string>) => void
  /** Acciones de la barra flotante cuando hay selección. */
  bulkActions?: (rows: T[], clear: () => void) => ReactNode
  onRowClick?: (row: T) => void
  loading?: boolean
  /** Contenido cuando no hay filas en absoluto (primera vez). */
  empty?: ReactNode
  /**
   * Contenido cuando hay filas pero los filtros o la búsqueda no dejan ninguna, p. ej.
   * «No tienes cotizaciones rechazadas.» + «Ver todas». Por defecto: «No hay {plural} con estos
   * filtros.» (o «Sin resultados para «…».») con «Quitar filtros» si existe `onClearFilters`.
   */
  emptyFiltered?: ReactNode
  /** Singular y plural para conteos: ['cotización', 'cotizaciones']. */
  noun?: [string, string]
  className?: string
}

type HideBelow = NonNullable<DataTableColumn<unknown>['hideBelow']>

const hideClass: Record<HideBelow, string> = { sm: 'max-sm:hidden', md: 'max-md:hidden', lg: 'max-lg:hidden', xl: 'max-xl:hidden' }
const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' }
/** Mismos cortes que Tailwind (`max-sm:hidden` = menos de 640 px de pantalla). */
const BREAKPOINT: Record<HideBelow, number> = { sm: 640, md: 768, lg: 1024, xl: 1280 }
/** Orden en que se esconden las secundarias cuando no caben: de la menos a la más importante. */
const DROP_ORDER: HideBelow[] = ['xl', 'lg', 'md', 'sm']
const FLEX_MIN_WIDTH = 200
const PERCENT_MIN_WIDTH = 120
const SELECT_WIDTH = 40

/** Ancho mínimo efectivo de una columna (ver `DataTableColumn.minWidth`). */
export function columnMinWidth(col: Pick<DataTableColumn<never>, 'width' | 'minWidth'>): number {
  if (col.minWidth !== undefined) return col.minWidth
  if (typeof col.width === 'number') return col.width
  if (col.width === undefined) return FLEX_MIN_WIDTH
  return PERCENT_MIN_WIDTH
}

/**
 * Qué columnas secundarias esconder para que las demás quepan con su ancho mínimo en `available`
 * px (ancho del contenedor), y el ancho mínimo resultante de la tabla. Sin medida (`available`
 * nulo o 0, p. ej. en pruebas) no esconde nada.
 */
export function fitColumns(
  columns: readonly Pick<DataTableColumn<never>, 'id' | 'width' | 'minWidth' | 'hideBelow'>[],
  { available, viewport, selectable = false }: { available: number | null; viewport: number; selectable?: boolean },
): { hidden: Set<string>; minWidth: number } {
  const shown = columns.filter((c) => !c.hideBelow || viewport >= BREAKPOINT[c.hideBelow])
  const hidden = new Set<string>()
  const need = () =>
    shown.reduce((sum, c) => (hidden.has(c.id) ? sum : sum + columnMinWidth(c)), selectable ? SELECT_WIDTH : 0)
  if (available) {
    for (const level of DROP_ORDER) {
      if (need() <= available) break
      for (const c of shown) if (c.hideBelow === level) hidden.add(c.id)
    }
  }
  return { hidden, minWidth: need() }
}

/** Ancho del contenedor (y de la pantalla) para decidir qué columnas caben. */
function useFitWidth() {
  // Ref con estado: la tabla puede montarse después (al llegar las filas) y hay que medirla entonces.
  const [el, ref] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ available: number | null; viewport: number }>(() => ({
    available: null,
    viewport: typeof window === 'undefined' ? 1440 : window.innerWidth,
  }))
  useLayoutEffect(() => {
    if (!el) return
    const measure = () => {
      const next = { available: el.clientWidth || null, viewport: window.innerWidth }
      setSize((prev) => (prev.available === next.available && prev.viewport === next.viewport ? prev : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [ref, size] as const
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' })
}

function EditableCell<T>({
  row,
  column,
  display,
}: {
  row: T
  column: DataTableColumn<T> & { edit: NonNullable<DataTableColumn<T>['edit']> }
  display: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cellRef = useRef<HTMLDivElement>(null)
  const raw = column.value?.(row)
  const label = column.edit.label?.(row) ?? (typeof column.header === 'string' ? `Editar ${column.header}` : 'Editar')

  const start = () => {
    setDraft(raw === null || raw === undefined ? '' : String(raw).replace('.', column.edit.type === 'number' ? ',' : '.'))
    setEditing(true)
  }
  const finish = (commit: boolean) => {
    if (commit) {
      const t = column.edit.type
      const value = t === 'text' ? draft : t === 'money' ? parseCLP(draft) : parseMeasure(draft)
      if (t === 'text' || value !== null || draft.trim() === '') {
        if (value !== raw) column.edit.onCommit(row, t === 'text' ? draft : value)
      }
    }
    setEditing(false)
    requestAnimationFrame(() => cellRef.current?.focus())
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        value={draft}
        inputMode={column.edit.type === 'text' ? undefined : 'decimal'}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') finish(true)
          if (e.key === 'Escape') finish(false)
        }}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(
          '-mx-2 h-8 w-[calc(100%+16px)] rounded-sm border border-ink-500 bg-paper-0 px-2 text-table outline-none',
          column.edit.type !== 'text' && 'text-right tabular',
        )}
      />
    )
  }
  return (
    <div
      ref={cellRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        start()
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault()
          e.stopPropagation()
          start()
        }
      }}
      className="-mx-2 cursor-text truncate rounded-sm px-2 py-1 hover:bg-paper-100 hover:shadow-[inset_0_0_0_1px_var(--paper-200)] focus-visible:outline-offset-[-2px]"
    >
      {display ?? <span className="text-paper-350">—</span>}
    </div>
  )
}

/**
 * Tabla de datos de oficina: orden, búsqueda/filtros que nunca esconden datos sin avisar,
 * selección con barra flotante, edición en línea y sumas al pie. Filas de 40 px, cifras tabulares.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  caption,
  query = '',
  searchText,
  filter,
  onClearFilters,
  defaultSort,
  selectable = false,
  selected: selectedProp,
  onSelectedChange,
  bulkActions,
  onRowClick,
  loading,
  empty,
  emptyFiltered,
  noun,
  className,
}: DataTableProps<T>) {
  const [fitRef, fitSize] = useFitWidth()
  const fit = useMemo(() => fitColumns(columns, { ...fitSize, selectable }), [columns, fitSize, selectable])
  const [sort, setSort] = useState<{ id: string; dir: SortDir } | null>(defaultSort ?? null)
  const [innerSelected, setInnerSelected] = useState<Set<string>>(new Set())
  const selected = selectedProp ?? innerSelected
  const setSelected = (ids: Set<string>) => {
    if (!selectedProp) setInnerSelected(ids)
    onSelectedChange?.(ids)
  }

  const visible = useMemo(() => {
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
    let out = rows
    if (filter) out = out.filter(filter)
    if (terms.length) {
      out = out.filter((row) => {
        const text = normalizeSearch(
          searchText ? searchText(row) : columns.map((c) => c.value?.(row) ?? '').join(' '),
        )
        return terms.every((t) => text.includes(t))
      })
    }
    if (sort) {
      const col = columns.find((c) => c.id === sort.id)
      if (col?.value) {
        const get = col.value
        out = [...out].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * compare(get(a), get(b)))
      }
    }
    return out
  }, [rows, filter, query, searchText, sort, columns])

  const hidden = rows.length - visible.length
  const visibleIds = visible.map(getRowId)
  const selectedVisible = visibleIds.filter((id) => selected.has(id))
  const allChecked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someChecked = selectedVisible.length > 0 && !allChecked
  const selectedRows = visible.filter((r) => selected.has(getRowId(r)))
  const hasFooter = columns.some((c) => c.footer)
  const footerRows = selectedRows.length > 0 ? selectedRows : visible
  const [singular, plural] = noun ?? ['fila', 'filas']
  const count = (n: number) => `${formatNumber(n)} ${n === 1 ? singular : plural}`
  /** Clases para esconder una columna secundaria (por pantalla o porque no cabe). */
  const hideFor = (col: DataTableColumn<T>) => (fit.hidden.has(col.id) ? 'hidden' : col.hideBelow && hideClass[col.hideBelow])
  const sizeFor = (col: DataTableColumn<T>) => ({ width: col.width, minWidth: columnMinWidth(col) })

  const toggleSort = (id: string) => {
    setSort((s) => (s?.id !== id ? { id, dir: 'asc' } : s.dir === 'asc' ? { id, dir: 'desc' } : null))
  }

  const toggleRow = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const clearSelection = () => setSelected(new Set())

  if (!loading && rows.length === 0 && empty) return <>{empty}</>

  const colCount = columns.length + (selectable ? 1 : 0)

  return (
    <div className={cn('relative overflow-hidden rounded-md border border-paper-200 bg-paper-0', className)}>
      <div ref={fitRef} className="scrollbar-quiet overflow-x-auto">
        <table className="w-full border-collapse text-table" style={{ minWidth: fit.minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="h-9 border-b border-paper-200 bg-paper-50">
              {selectable ? (
                <th scope="col" className="w-10 pl-3">
                  <Checkbox
                    aria-label="Seleccionar todas"
                    checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                    onCheckedChange={() => setSelected(allChecked ? new Set() : new Set([...selected, ...visibleIds]))}
                  />
                </th>
              ) : null}
              {columns.map((col) => {
                const sortable = col.sortable ?? Boolean(col.value)
                const active = sort?.id === col.id
                const align = col.align ?? 'left'
                return (
                  <th
                    key={col.id}
                    scope="col"
                    style={sizeFor(col)}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'px-3 text-meta font-medium whitespace-nowrap text-paper-600',
                      alignClass[align],
                      hideFor(col),
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={cn(
                          'group -mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 hover:text-paper-900',
                          align === 'right' && 'flex-row-reverse',
                          active && 'text-paper-900',
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort.dir === 'asc' ? (
                            <ArrowUp aria-hidden className="size-3" strokeWidth={2} />
                          ) : (
                            <ArrowDown aria-hidden className="size-3" strokeWidth={2} />
                          )
                        ) : (
                          <ChevronsUpDown aria-hidden className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  <SkeletonRows rows={6} columns={Math.min(columns.length, 5)} />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  {emptyFiltered ?? (
                    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                      <WindowSketch kind="fixed" size={56} />
                      <p className="font-medium text-paper-900">
                        {query.trim() ? (
                          <>Sin resultados para «{query.trim()}».</>
                        ) : noun ? (
                          `No hay ${plural} con estos filtros.`
                        ) : (
                          'No hay nada con estos filtros.'
                        )}
                      </p>
                      {onClearFilters ? (
                        <Button size="sm" onClick={onClearFilters}>
                          Quitar filtros
                        </Button>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const id = getRowId(row)
                const isSelected = selected.has(id)
                return (
                  <tr
                    key={id}
                    aria-selected={selectable ? isSelected : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row)
                          }
                        : undefined
                    }
                    className={cn(
                      'h-10 border-b border-paper-200 last:border-b-0 transition-colors duration-120',
                      onRowClick && 'cursor-pointer focus-visible:outline-offset-[-2px]',
                      isSelected ? 'bg-ink-50/60' : 'hover:bg-paper-100/70',
                    )}
                  >
                    {selectable ? (
                      <td className="w-10 pl-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label="Seleccionar fila" checked={isSelected} onCheckedChange={() => toggleRow(id)} />
                      </td>
                    ) : null}
                    {columns.map((col) => {
                      const raw = col.value?.(row)
                      const display: ReactNode = col.cell
                        ? col.cell(row)
                        : typeof raw === 'number' && col.format
                          ? col.format(raw)
                          : (raw ?? null)
                      return (
                        <td
                          key={col.id}
                          className={cn(
                            'max-w-0 px-3 text-paper-900',
                            alignClass[col.align ?? 'left'],
                            (col.align === 'right' || typeof raw === 'number') && 'tabular',
                            hideFor(col),
                            col.className,
                          )}
                          style={sizeFor(col)}
                        >
                          {col.edit ? (
                            <EditableCell row={row} column={col as DataTableColumn<T> & { edit: NonNullable<DataTableColumn<T>['edit']> }} display={display} />
                          ) : (
                            <div className="truncate">{display}</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
          {hasFooter && !loading && visible.length > 0 ? (
            <tfoot>
              <tr className="h-10 border-t border-paper-200 bg-paper-50 text-paper-600">
                {selectable ? <td /> : null}
                {columns.map((col, i) => {
                  let content: ReactNode = null
                  let isCount = false
                  if (col.footer === 'sum' && col.value) {
                    const total = footerRows.reduce((acc, r) => {
                      const v = col.value?.(r)
                      return acc + (typeof v === 'number' ? v : 0)
                    }, 0)
                    content = <span className="font-medium text-paper-900">{col.format ? col.format(total) : formatNumber(total)}</span>
                  } else if (typeof col.footer === 'function') {
                    content = col.footer(footerRows)
                  } else if (i === 0) {
                    isCount = true
                    content = selectedRows.length > 0 ? `${count(selectedRows.length)} seleccionadas` : count(visible.length)
                  }
                  return (
                    <td
                      key={col.id}
                      className={cn(
                        'px-3 text-meta tabular whitespace-nowrap',
                        alignClass[col.align ?? 'left'],
                        // El conteo puede asomarse sobre el pie vacío de al lado sin ensanchar su columna.
                        isCount && 'relative z-[1] max-w-0 overflow-visible',
                        hideFor(col),
                      )}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {hidden > 0 && visible.length > 0 ? (
        <div className="flex items-center justify-center gap-2 border-t border-paper-200 px-4 py-2 text-[13px] text-paper-600">
          <span>{count(hidden)} ocultas por filtros</span>
          {onClearFilters ? (
            <>
              <span aria-hidden>·</span>
              <button type="button" onClick={onClearFilters} className="font-medium text-ink-600 hover:text-ink-700">
                Quitar filtros
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence>
        {selectable && selectedRows.length > 0 && bulkActions ? (
          <motion.div
            role="toolbar"
            aria-label="Acciones con la selección"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            className="fixed bottom-6 left-1/2 z-40 flex items-center gap-2 rounded-lg bg-paper-900 py-1.5 pr-1.5 pl-4 text-paper-0 shadow-pop max-md:bottom-[calc(76px+env(safe-area-inset-bottom))]"
            style={{ x: '-50%' }}
          >
            <span className="text-base font-medium tabular whitespace-nowrap">{count(selectedRows.length)}</span>
            <span aria-hidden className="mx-1 h-4 w-px bg-paper-0/20" />
            <div className="flex items-center gap-1 [&_button]:border-transparent [&_button]:bg-transparent [&_button]:text-paper-0 [&_button:hover]:bg-paper-0/10">{bulkActions(selectedRows, clearSelection)}</div>
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Quitar selección"
              className="inline-flex size-8 items-center justify-center rounded-sm text-paper-0/70 hover:bg-paper-0/10 hover:text-paper-0"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
