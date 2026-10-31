/**
 * /dev/designer — banco de pruebas del diseñador: lista de ventanas con miniaturas, lienzo,
 * ajustes de la ventana y del paño, galería de tipologías, deshacer/rehacer. Usa el catálogo de
 * tu cuenta si hay sesión; si no, el catálogo de ejemplo. No guarda nada en el servidor.
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Redo2, Undo2 } from 'lucide-react'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import { createDesign, describeDesign, type Catalog, type TypologyId, type WindowDesign } from '@framezen/engine'
import type { DrawingView } from '@framezen/documents'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useMe } from '../../lib/hooks'
import { qk } from '../../lib/queryClient'
import { usePageTitle } from '../../lib/usePageTitle'
import { useShortcut } from '../../lib/useShortcut'
import { useUndo } from '../../lib/useUndo'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { DesignCanvas } from './DesignCanvas'
import { DesignThumbnail } from './DesignThumbnail'
import { NodeInspector } from './NodeInspector'
import { TypologyPicker } from './TypologyPicker'
import { WindowSettings } from './WindowSettings'
import { pickColor, pickGlass, type DesignDefaults } from './lib/catalog'
import { defaultLineFor } from './lib/typologies'

interface Item {
  id: string
  ref: string
  qty: number
  design: WindowDesign
}

function seed(catalog: Catalog, defaults: DesignDefaults): Item[] {
  const make = (typologyId: TypologyId, width: number, height: number) => {
    const lineId = defaultLineFor(catalog, typologyId, defaults.lineId, {})
    return createDesign(typologyId, { lineId, width, height, colorId: pickColor(catalog, lineId, defaults.colorId), glassId: pickGlass(catalog, defaults.glassId) })
  }
  return [
    { id: 'i1', ref: 'V1', qty: 1, design: make('fixed_tilt_turn', 1600, 1300) },
    { id: 'i2', ref: 'V2', qty: 2, design: make('sliding_2', 1800, 1200) },
    { id: 'i3', ref: 'V3', qty: 1, design: make('door_transom', 900, 2500) },
  ]
}

function Workbench({ catalog, defaults, source }: { catalog: Catalog; defaults: DesignDefaults; source: 'cuenta' | 'ejemplo' }) {
  const history = useUndo<Item[]>(seed(catalog, defaults), { keyboard: true, mergeWindowMs: 900 })
  const items = history.value
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [view, setView] = useState<DrawingView>('interior')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [lastLabel, setLastLabel] = useState<string>('')
  const active = items.find((i) => i.id === activeId) ?? items[0]

  useShortcut('a', () => setPickerOpen(true))

  const updateDesign = (next: WindowDesign, label: string) => {
    if (!active) return
    history.set((prev) => prev.map((it) => (it.id === active.id ? { ...it, design: next } : it)), { mergeKey: `${active.id}:${label}` })
    setLastLabel(label)
  }

  const addItem = (design: WindowDesign, meta: { typologyId: TypologyId; qty: number }) => {
    const n = items.length + 1
    const item: Item = { id: `i${Date.now()}`, ref: `V${n}`, qty: meta.qty, design }
    history.set((prev) => [...prev, item])
    setActiveId(item.id)
    setSelectedNodeId(null)
    setLastLabel(`Agregar ${item.ref}`)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper-50 lg:h-dvh">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-paper-200 bg-paper-0 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-base font-semibold tracking-[-0.01em]">Diseñador</h1>
          <span className="hidden text-[13px] text-paper-600 sm:inline">banco de pruebas</span>
        </div>
        <span className="hidden sm:inline-flex">
          <Badge tone={source === 'cuenta' ? 'ink' : 'neutral'}>{source === 'cuenta' ? 'Catálogo de tu cuenta' : 'Catálogo de ejemplo'}</Badge>
        </span>
        <div className="ml-auto flex items-center gap-1">
          {lastLabel ? <span className="mr-2 hidden max-w-64 truncate text-[12px] text-paper-600 md:inline">Último cambio: {lastLabel}</span> : null}
          <IconButton icon={Undo2} label="Deshacer" shortcut="mod+z" onClick={history.undo} disabled={!history.canUndo} />
          <span className="hidden sm:inline-flex">
            <IconButton icon={Redo2} label="Rehacer" shortcut="shift+mod+z" onClick={history.redo} disabled={!history.canRedo} />
          </span>
          <Button variant="primary" icon={Plus} shortcut="a" onClick={() => setPickerOpen(true)} className="ml-1">
            <span className="hidden sm:inline">Agregar ventana</span>
            <span className="sm:hidden">Agregar</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Ítems */}
        <nav aria-label="Ventanas" className="order-2 shrink-0 border-paper-200 bg-paper-0 lg:order-1 lg:w-60 lg:border-r">
          <ul className="scrollbar-quiet flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-y-auto">
            {items.map((it) => (
              <li key={it.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(it.id)
                    setSelectedNodeId(null)
                  }}
                  aria-current={it.id === active?.id ? 'true' : undefined}
                  className={cn(
                    'flex w-56 items-center gap-3 rounded-md border px-2.5 py-2 text-left outline-none transition-colors duration-120 lg:w-full',
                    'focus-visible:shadow-[0_0_0_2px_var(--ink-500)]',
                    it.id === active?.id ? 'border-ink-100 bg-ink-50' : 'border-transparent hover:bg-paper-100',
                  )}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-paper-50">
                    <DesignThumbnail design={it.design} catalog={catalog} size={40} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-semibold">{it.ref}</span>
                      {it.qty > 1 ? <span className="text-[12px] text-paper-600">× {it.qty}</span> : null}
                    </span>
                    <span className="block truncate text-[12px] text-paper-600 tabular">
                      {formatNumber(it.design.width)} × {formatNumber(it.design.height)} mm
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Lienzo */}
        <main className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
          {active ? (
            <>
              <div className="flex h-11 shrink-0 items-center gap-2 border-b border-paper-200 bg-paper-0 px-4 text-[13px]">
                <span className="font-semibold">{active.ref}</span>
                <span className="min-w-0 truncate text-paper-600">{describeDesign(active.design, catalog)}</span>
              </div>
              <DesignCanvas
                design={active.design}
                catalog={catalog}
                onChange={updateDesign}
                selectedNodeId={selectedNodeId}
                onSelect={setSelectedNodeId}
                view={view}
                onViewChange={setView}
                className="h-[62dvh] lg:h-auto lg:flex-1"
              />
            </>
          ) : null}
        </main>

        {/* Inspector */}
        {active ? (
          <aside aria-label="Inspector" className="order-3 shrink-0 border-paper-200 bg-paper-0 lg:w-[320px] lg:overflow-y-auto lg:border-l">
            <div className="flex flex-col gap-6 p-4">
              {selectedNodeId ? <NodeInspector design={active.design} catalog={catalog} nodeId={selectedNodeId} onChange={updateDesign} /> : null}
              <div>
                <p className="mb-3 text-meta font-medium text-paper-600">Ventana {active.ref}</p>
                <WindowSettings design={active.design} catalog={catalog} onChange={updateDesign} />
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <TypologyPicker open={pickerOpen} onOpenChange={setPickerOpen} catalog={catalog} defaults={defaults} onCreate={addItem} />
    </div>
  )
}

export default function DesignerPlayground() {
  usePageTitle('Diseñador · banco de pruebas')
  const me = useMe()
  const signedIn = Boolean(me.data)
  // Mismas claves que useCatalog/useSettings, pero solo con sesión (sin 401 en la consola).
  const catalogQuery = useQuery({ queryKey: qk.catalog, queryFn: api.catalog.get, staleTime: 5 * 60_000, enabled: signedIn })
  const settings = useQuery({ queryKey: qk.settings, queryFn: api.settings.get, staleTime: 5 * 60_000, enabled: signedIn })
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (me.isFetched && (!signedIn || catalogQuery.isFetched)) setReady(true)
  }, [me.isFetched, signedIn, catalogQuery.isFetched])

  const real = signedIn && catalogQuery.data && catalogQuery.data.lines.length > 0 ? (catalogQuery.data as Catalog) : null
  const catalog = real ?? SAMPLE_CATALOG
  const defaults = useMemo<DesignDefaults>(() => (real ? (settings.data?.defaults ?? {}) : SAMPLE_DEFAULTS), [real, settings.data])

  if (!ready) return <div className="min-h-dvh bg-paper-50" />
  return <Workbench key={real ? 'cuenta' : 'ejemplo'} catalog={catalog} defaults={defaults} source={real ? 'cuenta' : 'ejemplo'} />
}
