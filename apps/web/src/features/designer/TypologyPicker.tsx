/**
 * Agregar ventana en ≤ 3 interacciones: abrir → elegir tipología → Enter.
 *
 * Paso 1, galería: búsqueda sin tildes, recientes y todas las tipologías agrupadas (Ventanas,
 * Puertas, Correderas, Formas) filtradas por las líneas del catálogo. Flechas para moverse,
 * Enter elige (en la búsqueda, la primera coincidencia).
 * Paso 2, medidas: ancho × alto en dos campos grandes (acepta «1500x1200»), línea, color, vidrio
 * y cantidad con valores por defecto visibles, y la ventana dibujada a escala. Enter crea.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { computeLayout, createDesign, describeDesign, getTypology, type Catalog, type TypologyId, type WindowDesign } from '@framezen/engine'
import { TypologyIcon, WindowDrawing } from '@framezen/documents'
import { cn } from '../../lib/cn'
import { Button } from '../../ui/Button'
import { ColorSwatchGroup } from '../../ui/ColorSwatch'
import { Dialog, DialogContent } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { Input } from '../../ui/Input'
import { MeasureField } from './parts/MeasureField'
import { Sheet, SheetContent } from '../../ui/Sheet'
import { lineColors, lineSupports, pickColor, pickGlass, type DesignDefaults } from './lib/catalog'
import { useMediaQuery } from './lib/hooks'
import { defaultLineFor, readRecentTypologies, rememberLine, rememberTypology, typologySections, type TypologySection } from './lib/typologies'
import { GlassPicker, LinePicker } from './parts/CatalogPickers'

export interface TypologyPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: Catalog
  defaults?: DesignDefaults
  onCreate: (design: WindowDesign, meta: { typologyId: TypologyId; qty: number }) => void
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

function Gallery({
  catalog,
  query,
  onQuery,
  onPick,
  sections,
  autoFocus,
}: {
  catalog: Catalog
  autoFocus: boolean
  query: string
  onQuery: (q: string) => void
  onPick: (id: TypologyId) => void
  sections: TypologySection[]
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const first = sections[0]?.items[0]
  const onTileKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key) || !gridRef.current) return
    e.preventDefault()
    const next = nextTile(gridRef.current, e.currentTarget, e.key)
    if (next) next.focus()
    else if (e.key === 'ArrowUp') document.getElementById('fz-typology-search')?.focus()
  }
  return (
    <div className="flex flex-col gap-1">
      <Input
        id="fz-typology-search"
        icon={Search}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Buscar: corredera, puerta, oscilobatiente…"
        aria-label="Buscar tipología"
        aria-controls="fz-typology-grid"
        size="lg"
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
      <div id="fz-typology-grid" ref={gridRef} className="mt-1">
        {sections.length === 0 ? (
          <p className="py-10 text-center text-paper-600">
            No encontramos «{query}». Prueba con «fijo», «abatible» o «corredera».
          </p>
        ) : null}
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`fz-tg-${section.id}`} className="mt-4 first:mt-3">
            <h3 id={`fz-tg-${section.id}`} className="mb-1.5 flex items-center gap-2 text-meta font-medium text-paper-600">
              {section.label}
              {section.muted ? <span className="font-normal">· se crean igual, con un aviso</span> : null}
            </h3>
            <ul className="grid grid-cols-3 gap-1 sm:grid-cols-5" role="list">
              {section.items.map((t) => (
                <li key={`${section.id}-${t.id}`}>
                  <button
                    type="button"
                    data-tile=""
                    aria-label={t.name}
                    onClick={() => onPick(t.id)}
                    onKeyDown={onTileKey}
                    className={cn(
                      'group flex h-full w-full flex-col items-center gap-2 rounded-md border border-transparent px-1.5 pt-3 pb-2.5 text-center outline-none',
                      'transition-[background-color,border-color,transform] duration-120 ease-out active:scale-[0.98]',
                      'hover:border-paper-200 hover:bg-paper-50 focus-visible:border-ink-500 focus-visible:bg-ink-50/60 focus-visible:shadow-[0_0_0_1px_var(--ink-500)]',
                      section.muted && 'opacity-70',
                    )}
                  >
                    <span className="flex h-[60px] items-center justify-center text-paper-900 transition-colors duration-120 group-hover:text-ink-700 group-focus-visible:text-ink-700">
                      <TypologyIcon typologyId={t.id} size={56} strokeWidth={1.4} />
                    </span>
                    <span className="text-[13px] leading-4 text-paper-900">{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {catalog.lines.length === 0 ? (
        <p className="mt-3 text-[13px] text-paper-600">Tu catálogo aún no tiene líneas: igual puedes dibujar y cotizar; los avisos te dirán qué falta.</p>
      ) : null}
    </div>
  )
}

function Preview({ design, catalog }: { design: WindowDesign | null; catalog: Catalog }) {
  const layout = useMemo(() => (design ? computeLayout(design, catalog) : null), [design, catalog])
  if (!design || !layout || !(layout.width > 0) || !(layout.height > 0)) {
    return <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-paper-200 text-[13px] text-paper-600">Escribe las medidas</div>
  }
  const landscape = layout.width / layout.height >= 1
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="flex aspect-square w-full items-center justify-center rounded-md border border-paper-200 bg-paper-50 p-3">
        <WindowDrawing layout={layout} design={design} catalog={catalog} dimensions="total" width={landscape ? 214 : undefined} height={landscape ? undefined : 214} />
      </div>
      <figcaption className="text-center text-[12px] leading-4 text-paper-600">{describeDesign(design, catalog)}</figcaption>
    </figure>
  )
}

function SizeStep({
  catalog,
  choice,
  update,
  onBack,
  onSubmit,
  compact,
}: {
  catalog: Catalog
  choice: Choice
  update: (patch: Partial<Choice>) => void
  onBack: () => void
  onSubmit: () => void
  compact: boolean
}) {
  const typology = getTypology(choice.typologyId)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(WIDTH_ID) as HTMLInputElement | null
      el?.focus()
      el?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [choice.typologyId])
  const supporting = useMemo(() => catalog.lines.filter((l) => lineSupports(l, choice.typologyId)), [catalog, choice.typologyId])
  const lineFilter = useMemo(() => (supporting.length ? (l: (typeof catalog.lines)[number]) => lineSupports(l, choice.typologyId) : undefined), [supporting, choice.typologyId])
  const colors = lineColors(catalog, choice.lineId)
  const preview = useMemo(() => {
    if (!choice.width || !choice.height) return null
    return createDesign(choice.typologyId, { lineId: choice.lineId, width: choice.width, height: choice.height, colorId: choice.colorId, glassId: choice.glassId })
  }, [choice])

  return (
    <form
      id={FORM_ID}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_236px]"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="group flex min-w-0 items-center gap-3 rounded-md border border-paper-200 bg-paper-0 py-1.5 pr-3 pl-1.5 text-left outline-none transition-colors duration-120 hover:bg-paper-50 focus-visible:shadow-[0_0_0_2px_var(--ink-500)]"
            aria-label={`Cambiar tipología (${typology?.name ?? ''})`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-paper-100 text-paper-900">
              <TypologyIcon typologyId={choice.typologyId} size={32} strokeWidth={1.5} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-paper-900">{typology?.name}</span>
              <span className="flex items-center gap-1 text-[12px] text-paper-600">
                <ArrowLeft aria-hidden strokeWidth={1.75} className="size-3" /> Cambiar tipología
              </span>
            </span>
          </button>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium text-paper-900">
            Medidas <span className="font-normal text-paper-600">· ancho × alto, o pega «1500x1200»</span>
          </legend>
          <div className="flex items-center gap-2">
            <MeasureField
              id={WIDTH_ID}
              aria-label="Ancho"
              size="lg"
              value={choice.width}
              min={100}
              max={20000}
              onChange={(width) => update({ width })}
              onSizeInput={(s) => update({ width: s.width, height: s.height })}
              className="min-w-0 flex-1"
              placeholder="Ancho"
            />
            <span aria-hidden className="text-h3 text-paper-350">×</span>
            <MeasureField
              aria-label="Alto"
              size="lg"
              value={choice.height}
              min={100}
              max={20000}
              onChange={(height) => update({ height })}
              onSizeInput={(s) => update({ width: s.width, height: s.height })}
              className="min-w-0 flex-1"
              placeholder="Alto"
            />
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_112px]">
          <Field label="Línea">
            <LinePicker catalog={catalog} showBrand value={choice.lineId || undefined} filter={lineFilter} onChange={(lineId) => update({ lineId, colorId: pickColor(catalog, lineId, choice.colorId) })} />
          </Field>
          <Field label="Cantidad">
            <MeasureField value={choice.qty} onChange={(qty) => update({ qty: Math.max(1, Math.round(qty ?? 1)) })} unit={null} min={1} max={999} step={1} bigStep={10} decimals={0} />
          </Field>
        </div>

        {colors.length ? (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-paper-900">
              Color <span className="font-normal text-paper-600">· {colors.find((c) => c.id === choice.colorId)?.name ?? 'elige uno'}</span>
            </span>
            <ColorSwatchGroup aria-label="Color" value={choice.colorId} onValueChange={(colorId) => update({ colorId })} colors={colors} />
          </div>
        ) : null}

        <Field label="Vidrio">
          <GlassPicker catalog={catalog} value={choice.glassId || undefined} onChange={(glassId) => update({ glassId })} />
        </Field>
      </div>
      {!compact ? <Preview design={preview} catalog={catalog} /> : null}
    </form>
  )
}

export function TypologyPicker({ open, onOpenChange, catalog, defaults, onCreate }: TypologyPickerProps) {
  const compact = useMediaQuery('(max-width: 639px)')
  const [step, setStep] = useState<'gallery' | 'size'>('gallery')
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<TypologyId[]>([])
  const [choice, setChoice] = useState<Choice | null>(null)
  const choiceRef = useRef<Choice | null>(null)
  // Recuerda color y vidrio elegidos en esta sesión para la siguiente ventana.
  const lastPick = useRef<{ colorId?: string; glassId?: string }>({})

  useEffect(() => {
    if (!open) return
    setStep('gallery')
    setQuery('')
    setRecent(readRecentTypologies())
  }, [open])

  const sections = useMemo(() => typologySections(catalog, query, recent), [catalog, query, recent])

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

  const create = (c: Choice | null) => {
    if (!c) return
    const typology = getTypology(c.typologyId)
    const width = c.width && c.width > 0 ? c.width : (typology?.defaultSize.width ?? 1000)
    const height = c.height && c.height > 0 ? c.height : (typology?.defaultSize.height ?? 1000)
    const design = createDesign(c.typologyId, { lineId: c.lineId, width, height, colorId: c.colorId, glassId: c.glassId })
    lastPick.current = { colorId: c.colorId, glassId: c.glassId }
    setRecent(rememberTypology(c.typologyId))
    rememberLine(c.lineId)
    onCreate(design, { typologyId: c.typologyId, qty: Math.max(1, Math.round(c.qty || 1)) })
    onOpenChange(false)
  }

  const pick = (typologyId: TypologyId) => {
    setBoth(initialChoice(typologyId))
    setStep('size')
  }

  const update = (patch: Partial<Choice>) => {
    const base = choiceRef.current
    if (!base) return
    setBoth({ ...base, ...patch })
  }

  const body: ReactNode =
    step === 'size' && choice ? (
      <SizeStep catalog={catalog} choice={choice} update={update} onBack={() => setStep('gallery')} onSubmit={() => create(choiceRef.current)} compact={compact} />
    ) : (
      <Gallery catalog={catalog} autoFocus={!compact} query={query} onQuery={setQuery} onPick={pick} sections={sections} />
    )

  const footer =
    step === 'size' ? (
      <>
        <span className="mr-auto hidden text-[12px] text-paper-600 sm:inline">Todo se puede cambiar después</span>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" form={FORM_ID} shortcut="enter">
          {choice && choice.qty > 1 ? `Agregar ${choice.qty} ventanas` : 'Agregar ventana'}
        </Button>
      </>
    ) : undefined

  const title = step === 'size' ? 'Medidas y terminaciones' : 'Agregar ventana'
  const description = step === 'size' ? undefined : 'Elige la tipología. Después escribes ancho × alto y Enter.'

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
      <DialogContent size="lg" title={title} description={description} footer={footer} className="h-[min(600px,calc(100dvh-48px))]">
        {body}
      </DialogContent>
    </Dialog>
  )
}
