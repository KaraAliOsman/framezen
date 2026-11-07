import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { normalizeSearch } from '../lib/format'
import { LOCALE_META, useFormat, useLocale, useT, type Locale } from '../lib/i18n'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import es from './i18n/es'
import { formatMoneyInput, parseMoney } from './MoneyField'
import { measureInputText, parseMeasure } from './NumberField'
import { SkeletonRows } from './Skeleton'

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
  /**
   * Singular y plural para conteos, ya en el idioma de la interfaz: ['cotización', 'cotizaciones'].
   * Se elige con las reglas de plural del idioma (en francés y portugués, 0 usa el singular).
   */
  noun?: [string, string]
  /** compact = 36 px para listas largas de consulta (precios); comfortable = 56 px para dos líneas (obra arriba, cliente abajo). */
  density?: 'compact' | 'default' | 'comfortable'
  /** La tabla sobresale 12 px a cada lado: el texto queda alineado con el título de la página. */
  bleed?: boolean
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

const collators = new Map<Locale, Intl.Collator>()

/** Orden alfabético del idioma (ñ, ç, ß, ı en su lugar), con números naturales («V2» antes que «V10»). */
function collator(locale: Locale): Intl.Collator {
  let c = collators.get(locale)
  if (!c) {
    c = new Intl.Collator(LOCALE_META[locale].intl, { numeric: true, sensitivity: 'base' })
    collators.set(locale, c)
  }
  return c
}

function compare(a: unknown, b: unknown, locale: Locale): number {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator(locale).compare(String(a), String(b))
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
  const t = useT(es)
  const { locale } = useLocale()
  const fmt = useFormat()
  const raw = column.value?.(row)
  const label =
    column.edit.label?.(row) ?? (typeof column.header === 'string' ? t('table.edit', { column: column.header }) : t('table.editGeneric'))

  const start = () => {
    // El borrador usa el separador decimal del idioma (y se relee con las mismas reglas).
    const kind = column.edit.type
    const text =
      raw === null || raw === undefined
        ? ''
        : kind === 'number' && typeof raw === 'number'
          ? measureInputText(raw, locale)
          : kind === 'money' && typeof raw === 'number'
            ? formatMoneyInput(raw, { locale, currency: fmt.currency })
            : String(raw)
    setDraft(text)
    setEditing(true)
  }
  const finish = (commit: boolean) => {
    if (commit) {
      const kind = column.edit.type
      const value =
        kind === 'text' ? draft : kind === 'money' ? parseMoney(draft, { locale, currency: fmt.currency }) : parseMeasure(draft, locale)
      if (kind === 'text' || value !== null || draft.trim() === '') {
        if (value !== raw) column.edit.onCommit(row, kind === 'text' ? draft : value)
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
          '-mx-2 h-8 w-[calc(100%+16px)] rounded-sm border border-focus bg-surface px-2 text-table text-fg shadow-[0_0_0_3px_var(--dk-focus-ring)] outline-none',
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
      className="-mx-2 cursor-text truncate rounded-sm px-2 py-1 transition-colors duration-100 hover:bg-surface hover:shadow-[inset_0_0_0_1px_var(--dk-divider-strong)] focus-visible:outline-offset-[-2px]"
    >
      {display ?? <span className="text-fg-faint">—</span>}
    </div>
  )
}

/**
 * Tabla de datos de oficina: orden, búsqueda/filtros que nunca esconden datos sin avisar,
 * selección con barra flotante, edición en línea y sumas al pie. Filas de 44 px, cifras tabulares, la
 * selección se marca por tono.
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
  density = 'default',
  bleed = false,
  className,
}: DataTableProps<T>) {
  const t = useT(es)
  const fmt = useFormat()
  const { locale } = useLocale()
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
        out = [...out].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * compare(get(a), get(b), locale))
      }
    }
    return out
  }, [rows, filter, query, searchText, sort, columns, locale])

  const hidden = rows.length - visible.length
  const visibleIds = visible.map(getRowId)
  const selectedVisible = visibleIds.filter((id) => selected.has(id))
  const allChecked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someChecked = selectedVisible.length > 0 && !allChecked
  const selectedRows = visible.filter((r) => selected.has(getRowId(r)))
  const hasFooter = columns.some((c) => c.footer)
  const footerRows = selectedRows.length > 0 ? selectedRows : visible
  const plurals = useMemo(() => new Intl.PluralRules(LOCALE_META[locale].intl), [locale])
  /** «3 cotizaciones» con el plural del idioma; sin sustantivo, «3 filas». */
  const count = (n: number) =>
    noun ? `${fmt.number(n)} ${plurals.select(n) === 'one' ? noun[0] : noun[1]}` : t('table.rows', { count: n })
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
    <div className={cn('relative overflow-hidden rounded-panel bg-plate shadow-plate', bleed && '-mx-3', className)}>
      <div ref={fitRef} className="scrollbar-quiet overflow-x-auto">
        <table className="w-full border-collapse text-table" style={{ minWidth: fit.minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="h-9 border-b border-divider">
              {selectable ? (
                <th scope="col" className="w-10 pl-3">
                  <span className="flex items-center">
                    <Checkbox
                      aria-label={t('table.selectAll')}
                      checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                      onCheckedChange={() => setSelected(allChecked ? new Set() : new Set([...selected, ...visibleIds]))}
                    />
                  </span>
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
                      'px-3 text-table font-normal whitespace-nowrap text-fg-muted',
                      alignClass[align],
                      hideFor(col),
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={cn(
                          'group -mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 transition-colors duration-100 hover:text-fg',
                          align === 'right' && 'flex-row-reverse',
                          active && 'text-fg-strong',
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
                      <p className="font-medium text-fg-strong">
                        {query.trim()
                          ? t('table.noResultsFor', { query: query.trim() })
                          : noun
                            ? t('table.noneWithFilters', { noun: noun[1] })
                            : t('table.nothingWithFilters')}
                      </p>
                      {onClearFilters ? (
                        <Button size="sm" onClick={onClearFilters}>
                          {t('table.clearFilters')}
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
                      density === 'comfortable' ? 'h-14' : density === 'compact' ? 'h-9' : 'h-11',
                      'border-b border-divider transition-colors duration-100',
                      onRowClick && 'cursor-pointer focus-visible:outline-offset-[-2px]',
                      isSelected ? 'bg-accent-subtle' : 'hover:bg-hover',
                    )}
                  >
                    {selectable ? (
                      <td className="w-10 pl-3" onClick={(e) => e.stopPropagation()}>
                        <span className="flex items-center">
                          <Checkbox aria-label={t('table.selectRow')} checked={isSelected} onCheckedChange={() => toggleRow(id)} />
                        </span>
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
                            cn('max-w-0 px-3 text-fg', density === 'compact' ? 'text-table' : 'text-base'),
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
              <tr className="h-10 text-fg-muted">
                {selectable ? <td /> : null}
                {columns.map((col, i) => {
                  let content: ReactNode = null
                  let isCount = false
                  if (col.footer === 'sum' && col.value) {
                    const total = footerRows.reduce((acc, r) => {
                      const v = col.value?.(r)
                      return acc + (typeof v === 'number' ? v : 0)
                    }, 0)
                    content = <span className="font-medium text-fg-strong">{col.format ? col.format(total) : fmt.number(total)}</span>
                  } else if (typeof col.footer === 'function') {
                    content = col.footer(footerRows)
                  } else if (i === 0) {
                    isCount = true
                    content = selectedRows.length > 0 ? t('table.selectedCount', { items: count(selectedRows.length) }) : count(visible.length)
                  }
                  return (
                    <td
                      key={col.id}
                      className={cn(
                        'px-3 text-table tabular whitespace-nowrap',
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
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-table text-fg-muted">
          <span>{t('table.hiddenByFilters', { items: count(hidden) })}</span>
          {onClearFilters ? (
            <>
              <span aria-hidden>·</span>
              <button type="button" onClick={onClearFilters} className="font-medium text-accent hover:text-accent-hover">
                {t('table.clearFilters')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence>
        {selectable && selectedRows.length > 0 && bulkActions ? (
          <motion.div
            role="toolbar"
            aria-label={t('table.bulkActions')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed bottom-6 left-1/2 z-40 flex h-12 items-center gap-2 rounded-lg bg-inverse py-1.5 pr-1.5 pl-4 text-fg-inverse shadow-pop max-md:bottom-[calc(76px+env(safe-area-inset-bottom))] "
            style={{ x: '-50%' }}
          >
            <span className="text-base font-medium tabular whitespace-nowrap">{count(selectedRows.length)}</span>
            <span aria-hidden className="mx-1 h-5 w-px bg-current opacity-20" />
            <div className="flex items-center gap-1 [&_button]:border-transparent [&_button]:bg-transparent [&_button]:text-inherit [&_button]:shadow-none [&_button:hover]:bg-white/10">{bulkActions(selectedRows, clearSelection)}</div>
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t('table.clearSelection')}
              className="inline-flex size-9 items-center justify-center rounded-sm opacity-70 transition-[opacity,background-color] duration-100 hover:bg-white/10 hover:opacity-100"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
