/**
 * Agregar ventana en ≤ 3 interacciones: abrir → elegir tipología → Enter.
 *
 * Paso 1, galería: a la izquierda los grupos (Ventanas, Puertas, Correderas, Elevables y paralelas,
 * Plegables, Pivotantes, Formas) con su conteo; a la derecha la grilla con el dibujo real de cada
 * tipología sobre el fondo hundido y su nombre debajo, sin tarjetas. Búsqueda sin tildes en el idioma
 * de la interfaz y en español (sinónimos del rubro), ordenada por relevancia; «Recientes» primero; se
 * muestran todas las tipologías del mercado: las que ninguna línea declara van al final de su grupo,
 * atenuadas (se crean igual, con aviso) y un interruptor deja solo las de tus líneas. Flechas para
 * moverse, Enter elige (en la búsqueda, la mejor coincidencia). En el teléfono: hoja inferior con los
 * grupos como chips.
 *
 * Paso 2, medidas: ancho × alto en dos campos grandes (acepta «1500x1200»), línea, color con muestras
 * realistas, vidrio y cantidad con valores por defecto visibles, y la ventana dibujada a escala.
 * Enter crea. Ctrl+Enter («Agregar y seguir») crea y deja el diálogo con la misma tipología, línea y
 * color, el cursor en el ancho. Pegar varias medidas, una por línea, pasa a la lista: todas de una vez.
 */
import { startTransition, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, ListPlus, Search, TriangleAlert } from 'lucide-react'
import { computeLayout, createDesign, getTypology, type Catalog, type TypologyId, type WindowDesign } from '@dekopen/engine'
import { TypologyIcon, WindowDrawing } from '@dekopen/documents'
import { cn } from '../../lib/cn'
import { useFormat, useLocale, useT } from '../../lib/i18n'
import { Button } from '../../ui/Button'
import { Dialog, DialogContent } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { Input, Textarea } from '../../ui/Input'
import { Sheet, SheetContent } from '../../ui/Sheet'
import { Switch } from '../../ui/Switch'
import { DesignThumbnail } from './DesignThumbnail'
import es from './i18n/es'
import { createFromPreset, presetChoices } from './lib/assembly'
import { lineColors, lineSupports, pickColor, pickGlass, type DesignDefaults } from './lib/catalog'
import { useMediaQuery } from './lib/hooks'
import { parseSizeLine, parseSizeList } from './lib/measure'
import { designCaption } from './lib/text'
import { defaultLineFor, readOnlyMine, readRecentTypologies, rememberLine, rememberTypology, typologyLabel, typologySections, writeOnlyMine, type TypologySection } from './lib/typologies'
import { GlassPicker, LinePicker } from './parts/CatalogPickers'
import { ColorPicker } from './parts/ColorPicker'
import { MeasureField } from './parts/MeasureField'

export interface PickerCreateMeta {
  typologyId: TypologyId
  qty: number
  /** «Agregar y seguir»: el diálogo sigue abierto para la ventana siguiente. */
  keepOpen?: boolean
}

export interface TypologyPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: Catalog
  defaults?: DesignDefaults
  onCreate: (design: WindowDesign, meta: PickerCreateMeta) => void
  /** Varias ventanas de una vez (medidas pegadas). Sin esto, llama a `onCreate` por cada una. */
  onCreateMany?: (entries: { design: WindowDesign; meta: PickerCreateMeta }[]) => void
}

interface Choice {
  typologyId: TypologyId
  width: number | null
  height: number | null
  lineId: string
  colorId: string
  glassId: string
  qty: number
}

const FORM_ID = 'fz-typology-form'
const WIDTH_ID = 'fz-typology-width'
const SEARCH_ID = 'fz-typology-search'
const BATCH_ID = 'fz-typology-batch'
/** Mosaicos que se dibujan al abrir (los que se ven); el resto llega en el cuadro siguiente. */
const EAGER_TILES = 20

/** Siguiente mosaico al moverse con flechas dentro de la galería (filas reales del layout). */
function nextTile(container: HTMLElement, current: HTMLElement, key: string): HTMLElement | null {
  const tiles = [...container.querySelectorAll<HTMLElement>('[data-tile]')]
  const i = tiles.indexOf(current)
  if (i < 0) return tiles[0] ?? null
  if (key === 'ArrowRight') return tiles[i + 1] ?? null
  if (key === 'ArrowLeft') return tiles[i - 1] ?? null
  const r = current.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const down = key === 'ArrowDown'
  let best: { el: HTMLElement; score: number } | null = null
  for (const t of tiles) {
    const tr = t.getBoundingClientRect()
    const dy = down ? tr.top - r.top : r.top - tr.top
    if (dy <= 4) continue
    const score = dy * 4 + Math.abs(tr.left + tr.width / 2 - cx)
    if (!best || score < best.score) best = { el: t, score }
  }
  return best?.el ?? null
}

/** Diseños de muestra de la galería: uno por tipología, línea, color y vidrio (son inmutables). */
const samples = new WeakMap<Catalog, Map<string, WindowDesign | null>>()

function sampleDesign(catalog: Catalog, id: TypologyId, defaults: DesignDefaults | undefined): WindowDesign | null {
  let byKey = samples.get(catalog)
  if (!byKey) samples.set(catalog, (byKey = new Map()))
  const key = `${id}|${defaults?.lineId ?? ''}|${defaults?.colorId ?? ''}|${defaults?.glassId ?? ''}`
  const hit = byKey.get(key)
  if (hit !== undefined) return hit
  let design: WindowDesign | null = null
  try {
    const lineId = defaultLineFor(catalog, id, [defaults?.lineId, defaults?.fallbackLineId])
    const size = getTypology(id)?.defaultSize
    if (lineId && size) design = createDesign(id, { lineId, width: size.width, height: size.height, colorId: pickColor(catalog, lineId, defaults?.colorId), glassId: pickGlass(catalog, defaults?.glassId) })
  } catch {
    design = null
  }
  byKey.set(key, design)
  return design
}

function Tile({
  id,
  name,
  catalog,
  defaults,
  draw,
  noLine,
  noLineHint,
  selected,
  onPick,
  onKeyDown,
}: {
  id: TypologyId
  name: string
  catalog: Catalog
  defaults?: DesignDefaults
  /** Ya toca dibujarlo: abrir el diálogo nunca espera a los 58 dibujos. */
  draw: boolean
  /** Ninguna línea activa la declara: se crea igual (atenuada, con la explicación al apuntar). */
  noLine?: boolean
  noLineHint: string
  selected?: boolean
  onPick: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const design = draw ? sampleDesign(catalog, id, defaults) : null
  return (
    <button
      type="button"
      data-tile=""
      data-no-line={noLine || undefined}
      aria-label={name}
      aria-description={noLine ? noLineHint : undefined}
      title={noLine ? noLineHint : undefined}
      aria-current={selected || undefined}
      onClick={onPick}
      onKeyDown={onKeyDown}
      className="group flex h-full w-full flex-col gap-1.5 rounded-sm text-left outline-none"
    >
      <span
        className={cn(
          'flex aspect-[5/4] w-full items-center justify-center rounded-sm bg-sunken transition-[background-color,transform] duration-100 ease-out group-hover:bg-hover group-active:scale-[0.98]',
          'group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus',
          selected && 'outline-2 -outline-offset-2 outline-accent',
        )}
      >
        <span className={cn('flex items-center justify-center', noLine && 'opacity-55')}>
          {design ? <DesignThumbnail design={design} catalog={catalog} size={84} title={name} /> : draw ? <TypologyIcon typologyId={id} size={64} strokeWidth={1.4} className="text-fg-muted" /> : null}
        </span>
      </span>
      <span className={cn('line-clamp-2 px-0.5 text-table font-medium', noLine ? 'text-fg-muted' : 'text-fg-strong')}>{name}</span>
    </button>
  )
}

/** Conjuntos: se crean con la línea que los fabrica. Si ninguna trae la unión se dice aquí y el conjunto se crea igual, con su aviso. */
function AssemblyPresets({ catalog, defaults, onCreate }: { catalog: Catalog; defaults?: DesignDefaults; onCreate: (design: WindowDesign) => void }) {
  const t = useT(es)
  const choices = useMemo(() => presetChoices(catalog, [defaults?.lineId, defaults?.fallbackLineId]), [catalog, defaults?.lineId, defaults?.fallbackLineId])
  return (
    <section aria-label={t('picker.assemblies')} data-assembly-presets="">
      <h3 className="mb-2 text-meta font-semibold text-fg-muted">{t('picker.assemblies')}</h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {choices.map((choice) => {
          const off = !choice.lineId
          const hint = choice.reason ? t(choice.reason === 'no_post' ? 'picker.assemblyNoPost' : 'picker.assemblyNoCoupler') : undefined
          return (
            <button
              key={choice.preset.id}
              type="button"
              disabled={off}
              title={hint}
              data-preset={choice.preset.id}
              onClick={() => {
                const colorId = pickColor(catalog, choice.lineId ?? undefined, defaults?.colorId)
                const glassId = pickGlass(catalog, defaults?.glassId)
                const design = createFromPreset(choice, colorId, glassId, catalog)
                if (design) onCreate(design)
              }}
              className={cn('flex flex-col gap-0.5 rounded-sm border border-divider bg-surface p-2.5 text-left outline-none hover:border-divider-strong focus-visible:outline-2 focus-visible:outline-focus', off && 'cursor-not-allowed opacity-60 hover:border-divider')}
            >
              <span className="text-table font-medium text-fg-strong">{t(`picker.preset.${choice.preset.id}`)}</span>
              <span className="text-meta text-fg-muted">{hint ?? (choice.angle === 180 ? t('picker.assemblyFlat') : t('picker.assemblyAngle', { angle: choice.angle }))}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function Gallery({
  catalog,
  defaults,
  query,
  onQuery,
  onPick,
  onAssembly,
  sections,
  autoFocus,
  compact,
  current,
  onlyMine,
  onOnlyMine,
  hasUnavailable,
}: {
  catalog: Catalog
  defaults?: DesignDefaults
  autoFocus: boolean
  query: string
  onQuery: (q: string) => void
  onPick: (id: TypologyId) => void
  onAssembly: (design: WindowDesign) => void
  sections: TypologySection[]
  compact: boolean
  current?: TypologyId
  onlyMine: boolean
  onOnlyMine: (on: boolean) => void
  /** Hay tipologías que ninguna línea declara (si no, el interruptor no aporta). */
  hasUnavailable: boolean
}) {
  const t = useT(es)
  const gridRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string | null>(null)
  const [drawAll, setDrawAll] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => startTransition(() => setDrawAll(true)))
    return () => cancelAnimationFrame(frame)
  }, [])
  let tileIndex = 0
  const first = sections[0]?.items[0]
  const shownActive = sections.some((s) => s.id === active) ? active : (sections[0]?.id ?? null)

  const onTileKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key) || !gridRef.current) return
    e.preventDefault()
    const next = nextTile(gridRef.current, e.currentTarget, e.key)
    if (next) next.focus()
    else if (e.key === 'ArrowUp') document.getElementById(SEARCH_ID)?.focus()
  }

  const jump = (id: string) => {
    setActive(id)
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`)
    const box = compact ? null : gridRef.current
    if (el && box) box.scrollTo({ top: el.offsetTop - box.offsetTop, behavior: 'smooth' })
    else el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Grupo activo según lo que se ve arriba en la grilla (escritorio).
  const onScroll = () => {
    const box = gridRef.current
    if (!box || compact) return
    let current: string | null = null
    for (const el of box.querySelectorAll<HTMLElement>('[data-section]')) {
      if (el.offsetTop - box.offsetTop - box.scrollTop <= 24) current = el.dataset.section ?? null
    }
    if (current && current !== active) setActive(current)
  }
  useEffect(() => {
    setActive(null)
    gridRef.current?.scrollTo?.({ top: 0 })
  }, [query])

  const nav = sections.length > 1 && (
    <nav aria-label={t('picker.groups')} className={cn(compact ? 'scrollbar-quiet -mx-1 flex gap-1 overflow-x-auto px-1 pb-1' : 'flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-1')}>
      {sections.map((s) => {
        const on = s.id === shownActive
        return (
          <button
            key={s.id}
            type="button"
            aria-current={on || undefined}
            onClick={() => jump(s.id)}
            className={cn(
              'flex shrink-0 items-center justify-between gap-2 rounded-sm text-left transition-colors duration-100',
              compact ? 'h-9 px-3 text-table touch:h-10' : 'h-8 px-2.5 text-base',
              on ? 'bg-hover font-medium text-fg-strong' : 'text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            <span className="truncate">{s.label}</span>
            {compact ? null : <span className="text-meta font-normal text-fg-muted tabular">{s.items.length}</span>}
          </button>
        )
      })}
    </nav>
  )

  const mine =
    hasUnavailable || onlyMine ? (
      <Switch size="sm" label={t('picker.onlyMine')} checked={onlyMine} onCheckedChange={onOnlyMine} className={cn(compact ? 'shrink-0' : 'mt-auto pt-3')} />
    ) : null

  const grid = (
    <div id="fz-typology-grid" ref={gridRef} onScroll={onScroll} className={cn(!compact && 'scrollbar-quiet min-h-0 flex-1 overflow-y-auto pr-1 pb-2')}>
      {sections.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <p className="text-base font-medium text-fg">{t('picker.empty', { query })}</p>
          <p className="text-table text-fg-muted">{t('picker.emptyHint')}</p>
        </div>
      ) : null}
      {query.trim() ? null : <AssemblyPresets catalog={catalog} defaults={defaults} onCreate={onAssembly} />}
      {sections.map((section) => (
        <section key={section.id} data-section={section.id} aria-labelledby={`fz-tg-${section.id}`} className="pb-6">
          <h3 id={`fz-tg-${section.id}`} className="mb-2 text-table font-medium text-fg-muted">
            {section.label}
          </h3>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4 min-[420px]:grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(124px,1fr))]" role="list">
            {section.items.map((item) => (
              <li key={`${section.id}-${item.id}`}>
                <Tile
                  id={item.id}
                  name={typologyLabel(item)}
                  catalog={catalog}
                  defaults={defaults}
                  draw={drawAll || tileIndex++ < EAGER_TILES}
                  noLine={section.unavailable.has(item.id)}
                  noLineHint={t('picker.noLine')}
                  selected={item.id === current}
                  onPick={() => onPick(item.id)}
                  onKeyDown={onTileKey}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {catalog.lines.length === 0 ? <p className="mt-1 text-table text-fg-muted">{t('picker.noLines')}</p> : null}
    </div>
  )

  return (
    <div className={cn('flex flex-col gap-4', !compact && 'h-full min-h-0')}>
      <Input
        id={SEARCH_ID}
        icon={Search}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t('picker.searchPlaceholder')}
        aria-label={t('picker.search')}
        aria-controls="fz-typology-grid"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && first) {
            e.preventDefault()
            onPick(first.id)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            gridRef.current?.querySelector<HTMLElement>('[data-tile]')?.focus()
          }
        }}
      />
      {compact ? (
        <>
          {nav}
          {mine}
          {grid}
        </>
      ) : (
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex w-48 shrink-0 flex-col">
            {nav}
            {mine}
          </div>
          {grid}
        </div>
      )}
    </div>
  )
}

function Preview({ design, catalog }: { design: WindowDesign | null; catalog: Catalog }) {
  const t = useT(es)
  const { locale } = useLocale()
  const layout = useMemo(() => (design ? computeLayout(design, catalog) : null), [design, catalog])
  if (!design || !layout || !(layout.width > 0) || !(layout.height > 0)) {
    return <div className="flex aspect-square items-center justify-center rounded-md bg-sunken text-table text-fg-muted">{t('picker.previewEmpty')}</div>
  }
  const landscape = layout.width / layout.height >= 1
  return (
    <figure className="flex flex-col gap-3">
      <div className="flex aspect-square w-full items-center justify-center rounded-md bg-sunken p-5 [&_[data-layer=dimensions]_path]:stroke-dimension [&_[data-layer=dimensions]_text]:fill-dimension-text">
        <WindowDrawing layout={layout} design={design} catalog={catalog} dimensions="total" width={landscape ? 256 : undefined} height={landscape ? undefined : 256} />
      </div>
      <figcaption className="text-meta text-fg-muted">{designCaption(design, locale)}</figcaption>
    </figure>
  )
}

/** Lo que se entendió de las medidas pegadas, línea por línea. */
function BatchPreview({ text }: { text: string }) {
  const t = useT(es)
  const fmt = useFormat()
  const rows = useMemo(() => parseSizeList(text), [text])
  const good = rows.filter((row) => row.size)
  const units = good.reduce((sum, row) => sum + (row.size?.qty ?? 0), 0)
  return (
    <div aria-live="polite" className="flex min-h-0 flex-col gap-2 self-stretch rounded-md bg-sunken p-4">
      <p className="text-table font-medium text-fg-strong">{good.length ? t('picker.batchSummary', { windows: good.length, units }) : t('picker.batchEmpty')}</p>
      <ol className="scrollbar-quiet flex max-h-72 min-h-0 flex-col gap-1 overflow-y-auto text-table">
        {rows.map((row, i) =>
          row.size ? (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="dim text-fg">{fmt.size(row.size.width, row.size.height)}</span>
              {row.size.qty > 1 ? <span className="tabular text-fg-muted">× {fmt.number(row.size.qty)}</span> : null}
            </li>
          ) : (
            <li key={i} className="flex items-center gap-1.5 text-warning" title={t('picker.batchBad')}>
              <TriangleAlert aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{row.text}</span>
              <span className="sr-only">{t('picker.batchBad')}</span>
            </li>
          ),
        )}
      </ol>
    </div>
  )
}

function SizeStep({
  catalog,
  choice,
  update,
  onBack,
  onSubmit,
  onContinue,
  focusTick,
  batch,
  onBatch,
  compact,
}: {
  catalog: Catalog
  choice: Choice
  update: (patch: Partial<Choice>) => void
  onBack: () => void
  onSubmit: () => void
  /** Ctrl+Enter: crea y sigue con la misma tipología. */
  onContinue: () => void
  /** Cambia para volver el cursor al ancho (después de «Agregar y seguir»). */
  focusTick: number
  /** Texto de la lista de medidas; `null` = una sola medida. */
  batch: string | null
  onBatch: (text: string | null) => void
  compact: boolean
}) {
  const t = useT(es)
  const typology = getTypology(choice.typologyId)
  const name = typology ? typologyLabel(typology) : ''
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(batch === null ? WIDTH_ID : BATCH_ID) as HTMLInputElement | HTMLTextAreaElement | null
      el?.focus()
      if (batch === null) el?.select()
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.typologyId, focusTick, batch === null])
  const supporting = useMemo(() => catalog.lines.filter((l) => lineSupports(l, choice.typologyId, catalog)), [catalog, choice.typologyId])
  const lineFilter = useMemo(() => (supporting.length ? (l: (typeof catalog.lines)[number]) => lineSupports(l, choice.typologyId, catalog) : undefined), [supporting, choice.typologyId])
  const colors = lineColors(catalog, choice.lineId)
  const preview = useMemo(() => {
    if (!choice.width || !choice.height) return null
    return createDesign(choice.typologyId, { lineId: choice.lineId, width: choice.width, height: choice.height, colorId: choice.colorId, glassId: choice.glassId })
  }, [choice])

  /** Pegar: varias líneas pasan a la lista; una con cantidad («1500x1200 x2») llena los tres campos. */
  const onPaste = (e: ClipboardEvent<HTMLElement>) => {
    const text = e.clipboardData.getData('text').trim()
    if (parseSizeList(text).length > 1) {
      e.preventDefault()
      onBatch(text)
      return
    }
    const one = parseSizeLine(text)
    if (one && one.qty > 1) {
      e.preventDefault()
      update({ width: one.width, height: one.height, qty: one.qty })
    }
  }

  return (
    <form
      id={FORM_ID}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        if (batch === null) onContinue()
        else onSubmit()
      }}
      className="grid grid-cols-1 gap-7 sm:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <button
          type="button"
          onClick={onBack}
          className="group -ml-1 flex w-fit max-w-full items-center gap-2 rounded-sm py-1 pr-2 pl-1 text-left transition-colors duration-100 hover:bg-hover"
          aria-label={t('picker.change', { name })}
        >
          <ArrowLeft aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
          <span className="truncate text-base font-medium text-fg-strong">{name}</span>
          <span className="shrink-0 text-table text-fg-muted">{t('picker.changeShort')}</span>
        </button>

        {batch === null ? (
          <fieldset className="flex flex-col gap-1.5" onPaste={onPaste}>
            <legend className="mb-1.5 text-table font-medium text-fg">
              {t('picker.sizes')} <span className="font-normal text-fg-muted">{t('picker.sizesHint')}</span>
            </legend>
            <div className="flex items-center gap-2">
              <MeasureField
                id={WIDTH_ID}
                aria-label={t('picker.width')}
                size="lg"
                value={choice.width}
                min={100}
                max={20000}
                onChange={(width) => update({ width })}
                onSizeInput={(s) => update({ width: s.width, height: s.height })}
                className="min-w-0 flex-1"
                placeholder={t('picker.width')}
              />
              <span aria-hidden className="dim text-h3 text-fg-faint">
                ×
              </span>
              <MeasureField
                aria-label={t('picker.height')}
                size="lg"
                value={choice.height}
                min={100}
                max={20000}
                onChange={(height) => update({ height })}
                onSizeInput={(s) => update({ width: s.width, height: s.height })}
                className="min-w-0 flex-1"
                placeholder={t('picker.height')}
              />
            </div>
            <button type="button" onClick={() => onBatch('')} className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-xs text-table text-fg-muted transition-colors duration-100 hover:text-fg-strong">
              <ListPlus aria-hidden strokeWidth={1.75} className="size-4" />
              {t('picker.batchOpen')}
            </button>
          </fieldset>
        ) : (
          <Field label={t('picker.batchLabel')} hint={t('picker.batchHint')}>
            <Textarea id={BATCH_ID} rows={6} spellCheck={false} value={batch} onChange={(e) => onBatch(e.target.value)} placeholder={'1500x1200 x2\n900x1100\n2400x2100'} className="tabular" />
          </Field>
        )}

        <div className={cn('grid grid-cols-1 gap-4', batch === null && 'sm:grid-cols-[minmax(0,1fr)_112px]')}>
          <Field label={t('picker.line')}>
            <LinePicker catalog={catalog} showBrand value={choice.lineId || undefined} filter={lineFilter} onChange={(lineId) => update({ lineId, colorId: pickColor(catalog, lineId, choice.colorId) })} />
          </Field>
          {batch === null ? (
            <Field label={t('picker.quantity')}>
              <MeasureField value={choice.qty} onChange={(qty) => update({ qty: Math.max(1, Math.round(qty ?? 1)) })} unit={null} min={1} max={999} step={1} bigStep={10} decimals={0} />
            </Field>
          ) : null}
        </div>

        {colors.length ? (
          <div className="flex flex-col gap-2">
            <span className="text-table font-medium text-fg">{t('picker.color')}</span>
            <ColorPicker aria-label={t('picker.color')} value={choice.colorId} onChange={(colorId) => update({ colorId })} colors={colors} />
          </div>
        ) : null}

        <Field label={t('picker.glass')}>
          <GlassPicker catalog={catalog} value={choice.glassId || undefined} onChange={(glassId) => update({ glassId })} />
        </Field>
      </div>
      {batch !== null ? <BatchPreview text={batch} /> : !compact ? <Preview design={preview} catalog={catalog} /> : null}
    </form>
  )
}

export function TypologyPicker({ open, onOpenChange, catalog, defaults, onCreate, onCreateMany }: TypologyPickerProps) {
  const t = useT(es)
  const fmt = useFormat()
  const { locale } = useLocale()
  const compact = useMediaQuery('(max-width: 639px)')
  const [step, setStep] = useState<'gallery' | 'size'>('gallery')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<TypologyId[]>([])
  const [onlyMine, setOnlyMine] = useState(readOnlyMine)
  const [choice, setChoice] = useState<Choice | null>(null)
  const choiceRef = useRef<Choice | null>(null)
  const [batch, setBatch] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  // «Agregar y seguir»: cuántas van y qué medida se acaba de agregar. Mientras no cambies nada, Enter
  // cierra en vez de repetir la misma ventana.
  const [added, setAdded] = useState<{ count: number; size: string; key: string } | null>(null)
  // Recuerda color y vidrio elegidos en esta sesión para la siguiente ventana.
  const lastPick = useRef<{ colorId?: string; glassId?: string }>({})

  useEffect(() => {
    if (!open) return
    setStep('gallery')
    setQuery('')
    setBoth(null)
    setBatch(null)
    setAdded(null)
    setRecent(readRecentTypologies())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sections = useMemo(() => typologySections(catalog, query, recent, locale, { onlyAvailable: onlyMine }), [catalog, query, recent, locale, onlyMine])
  const hasUnavailable = useMemo(() => typologySections(catalog, '', [], locale).some((s) => s.unavailable.size > 0), [catalog, locale])
  const changeOnlyMine = (on: boolean) => {
    setOnlyMine(on)
    writeOnlyMine(on)
  }

  const setBoth = (next: Choice | null) => {
    choiceRef.current = next
    setChoice(next)
  }

  const initialChoice = (typologyId: TypologyId): Choice => {
    const typology = getTypology(typologyId)
    const lineId = defaultLineFor(catalog, typologyId, [defaults?.lineId, defaults?.fallbackLineId])
    return {
      typologyId,
      width: typology?.defaultSize.width ?? 1000,
      height: typology?.defaultSize.height ?? 1000,
      lineId,
      // Lo que pasa el anfitrión (la ventana de referencia o tus ajustes) manda; si no trae nada,
      // lo último elegido en esta sesión.
      colorId: pickColor(catalog, lineId, defaults?.colorId ?? lastPick.current.colorId),
      glassId: pickGlass(catalog, defaults?.glassId ?? lastPick.current.glassId),
      qty: 1,
    }
  }

  const buildDesign = (c: Choice, width: number | null, height: number | null) => {
    const typology = getTypology(c.typologyId)
    const w = width && width > 0 ? width : (typology?.defaultSize.width ?? 1000)
    const h = height && height > 0 ? height : (typology?.defaultSize.height ?? 1000)
    return createDesign(c.typologyId, { lineId: c.lineId, width: w, height: h, colorId: c.colorId, glassId: c.glassId })
  }

  const remember = (c: Choice) => {
    lastPick.current = { colorId: c.colorId, glassId: c.glassId }
    setRecent(rememberTypology(c.typologyId))
    rememberLine(c.lineId)
  }

  const choiceKey = (c: Choice) => JSON.stringify(c)
  /** Ya se agregó justo esto y no se ha tocado nada desde entonces. */
  const unchanged = !!added && !!choice && added.key === choiceKey(choice)

  const create = (c: Choice | null) => {
    if (!c) return
    if (unchanged) {
      onOpenChange(false)
      return
    }
    remember(c)
    onCreate(buildDesign(c, c.width, c.height), { typologyId: c.typologyId, qty: Math.max(1, Math.round(c.qty || 1)) })
    onOpenChange(false)
  }

  /** Crea y sigue: misma tipología, línea, color y vidrio; cantidad en 1 y el cursor en el ancho. */
  const addAndContinue = (c: Choice | null) => {
    if (!c) return
    const design = buildDesign(c, c.width, c.height)
    remember(c)
    onCreate(design, { typologyId: c.typologyId, qty: Math.max(1, Math.round(c.qty || 1)), keepOpen: true })
    const next = { ...c, qty: 1 }
    setBoth(next)
    setAdded((prev) => ({ count: (prev?.count ?? 0) + 1, size: fmt.size(design.width, design.height), key: choiceKey(next) }))
    setFocusTick((n) => n + 1)
  }

  const createBatch = (c: Choice | null, text: string | null) => {
    if (!c || text === null) return
    const good = parseSizeList(text).flatMap((row) => (row.size ? [row.size] : []))
    if (!good.length) return
    remember(c)
    const entries = good.map((size) => ({ design: buildDesign(c, size.width, size.height), meta: { typologyId: c.typologyId, qty: size.qty } }))
    if (onCreateMany) onCreateMany(entries)
    else for (const entry of entries) onCreate(entry.design, entry.meta)
    onOpenChange(false)
  }

  const pick = (typologyId: TypologyId) => {
    // Volver a la misma tipología conserva lo que ya escribiste.
    setBoth(choiceRef.current?.typologyId === typologyId ? choiceRef.current : initialChoice(typologyId))
    setStep('size')
  }

  const update = (patch: Partial<Choice>) => {
    const base = choiceRef.current
    if (!base) return
    setBoth({ ...base, ...patch })
  }

  const submit = () => (batch === null ? create(choiceRef.current) : createBatch(choiceRef.current, batch))

  const body: ReactNode =
    step === 'size' && choice ? (
      <SizeStep
        catalog={catalog}
        choice={choice}
        update={update}
        onBack={() => {
          setBatch(null)
          setStep('gallery')
        }}
        onSubmit={submit}
        onContinue={() => addAndContinue(choiceRef.current)}
        focusTick={focusTick}
        batch={batch}
        onBatch={setBatch}
        compact={compact}
      />
    ) : (
      <Gallery
        catalog={catalog}
        defaults={defaults}
        autoFocus={!compact}
        query={query}
        onQuery={setQuery}
        onPick={pick}
        onAssembly={(design) => {
          onCreate(design, { typologyId: 'fixed', qty: 1 })
          onOpenChange(false)
        }}
        sections={sections}
        compact={compact}
        current={choice?.typologyId}
        onlyMine={onlyMine}
        onOnlyMine={changeOnlyMine}
        hasUnavailable={hasUnavailable}
      />
    )

  const batchCount = batch === null ? 0 : parseSizeList(batch).filter((row) => row.size).length

  const footer =
    step !== 'size' ? undefined : batch !== null ? (
      <>
        <Button variant="ghost" className="mr-auto" onClick={() => setBatch(null)}>
          {t('picker.batchBack')}
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t('picker.cancel')}
        </Button>
        <Button variant="primary" type="submit" form={FORM_ID} shortcut="mod+enter" disabled={batchCount === 0}>
          {t('picker.add', { count: Math.max(batchCount, 1) })}
        </Button>
      </>
    ) : (
      <>
        <span aria-live="polite" className={cn('mr-auto min-w-0 truncate text-meta max-sm:hidden', added ? 'font-medium text-fg-strong' : 'text-fg-muted')}>
          {added ? t('picker.added', { count: added.count, size: added.size }) : t('picker.later')}
        </span>
        {added ? null : (
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('picker.cancel')}
          </Button>
        )}
        <Button variant="secondary" shortcut="mod+enter" onClick={() => addAndContinue(choiceRef.current)}>
          {t('picker.addContinue')}
        </Button>
        <Button variant="primary" type="submit" form={FORM_ID} shortcut="enter">
          {unchanged ? t('picker.done') : t('picker.add', { count: choice?.qty ?? 1 })}
        </Button>
      </>
    )

  const title = step === 'size' ? t('picker.sizeTitle') : t('picker.title')
  const description = step === 'size' ? undefined : t('picker.description')

  if (compact) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" title={title} description={description} footer={footer} className="h-[85dvh]">
          {body}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" title={title} description={description} footer={footer} className="h-[min(720px,calc(100dvh-48px))]">
        {body}
      </DialogContent>
    </Dialog>
  )
}
