import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { TypologyIcon, WindowDrawing, type DrawingRender } from '@dekopen/documents'
import { computeLayout, TYPOLOGIES, type Catalog, type TypologyGroup, type WindowDesign } from '@dekopen/engine'
import { useMemo, useState } from 'react'

/**
 * Galería de dibujos (/dev/dibujos, solo en desarrollo): todas las tipologías del motor en los colores del
 * catálogo de ejemplo, en vista interior o exterior, realista o técnico, con o sin accesorios. Sirve para
 * revisar a ojo el dibujo antes de que llegue a cotizaciones, portal y PDF.
 */
const catalog = SAMPLE_CATALOG as unknown as Catalog
const COLORS = [
  ['blanco', 'Blanco'],
  ['roble-dorado', 'Roble dorado'],
  ['antracita', 'Antracita'],
  ['nogal', 'Nogal'],
] as const
const GROUPS: [TypologyGroup | 'all', string][] = [
  ['all', 'Todas'],
  ['window', 'Ventanas'],
  ['door', 'Puertas'],
  ['sliding', 'Correderas'],
  ['folding', 'Plegables'],
  ['shape', 'Formas'],
]

function designFor(typologyId: string, colorId: string, colorInId: string | undefined, extras: boolean): { design: WindowDesign; layout: ReturnType<typeof computeLayout> } {
  const typology = TYPOLOGIES.find((t) => t.id === typologyId)!
  const line = catalog.lines.find((l) => l.typologyIds.includes(typology.id)) ?? catalog.lines.find((l) => l.kind === typology.kind) ?? catalog.lines[0]
  const built = typology.build(typology.defaultSize.width, typology.defaultSize.height)
  const design = {
    version: 1,
    lineId: line.id,
    width: typology.defaultSize.width,
    height: typology.defaultSize.height,
    colorId,
    ...(colorInId ? { colorInId } : {}),
    glassId: catalog.glass[0].id,
    root: built.root,
    ...(built.shape ? { shape: built.shape } : {}),
    ...(extras ? { extras: { sill: true, rollerShutter: { type: 'monoblock', operation: 'strap' }, insectScreen: { type: 'roller' } } } : {}),
  } as WindowDesign
  return { design, layout: computeLayout(design, catalog) }
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-control border border-control bg-sunken p-0.5">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className="h-8 rounded-[5px] px-3 text-table font-medium text-fg-muted transition-colors duration-100 aria-pressed:bg-surface aria-pressed:text-fg-strong aria-pressed:shadow-sm"
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export default function DibujosGallery() {
  const [group, setGroup] = useState<TypologyGroup | 'all'>('all')
  const [view, setView] = useState<'interior' | 'exterior'>('interior')
  const [render, setRender] = useState<DrawingRender>('realistic')
  const [extras, setExtras] = useState(false)
  const [bicolor, setBicolor] = useState(false)
  const [colors, setColors] = useState<string[]>(['blanco', 'roble-dorado', 'antracita'])

  const cells = useMemo(
    () =>
      TYPOLOGIES.filter((t) => group === 'all' || t.group === group).flatMap((t) =>
        colors.map((colorId) => ({ id: t.id, name: t.name, colorId, ...designFor(t.id, colorId, bicolor && colorId !== 'blanco' ? 'blanco' : undefined, extras) })),
      ),
    [group, colors, bicolor, extras],
  )

  return (
    <main className="min-h-screen bg-canvas p-6 text-fg">
      <header className="mx-auto flex max-w-[1500px] flex-col gap-4">
        <div>
          <p className="code-id text-fg-faint">/dev/dibujos</p>
          <h1 className="text-h2 text-fg-strong">Dibujos de ventanas</h1>
          <p className="text-table text-fg-muted">
            {TYPOLOGIES.length} tipologías del motor con el catálogo de ejemplo. El mismo componente se usa en el diseñador, las cotizaciones, el portal y los PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Grupo" value={group} onChange={setGroup} options={GROUPS} />
          <Segmented label="Vista" value={view} onChange={setView} options={[['interior', 'Interior'], ['exterior', 'Exterior']]} />
          <Segmented label="Dibujo" value={render} onChange={setRender} options={[['realistic', 'Realista'], ['technical', 'Técnico']]} />
          <label className="flex items-center gap-2 text-table">
            <input type="checkbox" checked={extras} onChange={(e) => setExtras(e.target.checked)} /> Persiana, mosquitero y alféizar
          </label>
          <label className="flex items-center gap-2 text-table">
            <input type="checkbox" checked={bicolor} onChange={(e) => setBicolor(e.target.checked)} /> Interior blanco (bicolor)
          </label>
          <div role="group" aria-label="Colores" className="flex items-center gap-3 text-table">
            {COLORS.map(([id, name]) => (
              <label key={id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={colors.includes(id)} onChange={(e) => setColors((prev) => (e.target.checked ? [...prev, id] : prev.filter((c) => c !== id)))} /> {name}
              </label>
            ))}
          </div>
        </div>
      </header>
      <section className="mx-auto mt-6 grid max-w-[1500px] grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {cells.map((cell) => (
          <figure key={`${cell.id}-${cell.colorId}`} className="m-0 rounded-panel border border-divider bg-surface p-2">
            <div className="flex justify-center">
              <WindowDrawing layout={cell.layout} design={cell.design} catalog={catalog} view={view} render={render} width={290} height={290} dimensions="total" showLabels />
            </div>
            <figcaption className="mt-1 flex items-center gap-2 text-meta text-fg-muted">
              <TypologyIcon typologyId={cell.id} size={22} />
              <span className="truncate">
                {cell.name} · {cell.colorId}
              </span>
            </figcaption>
          </figure>
        ))}
      </section>
    </main>
  )
}
