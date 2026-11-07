import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { WindowDrawing, WindowThumbnail, type DrawingRender, type DrawingView } from '@dekopen/documents'
import { computeLayout, TYPOLOGIES, type Catalog, type WindowDesign } from '@dekopen/engine'

/**
 * Auditoría del dibujo (/dev/encuentros, solo en desarrollo). Sin parámetros, hoja de contacto de toda la
 * galería. Con `?id=sliding_4&ancho=3000&alto=1500&px=1600`, una tipología a gran escala para mirar sus
 * encuentros. `vista` (interior, exterior) y `dibujo` (realistic, technical) eligen qué se revisa.
 */
const catalog = SAMPLE_CATALOG as unknown as Catalog

function designFor(typologyId: string, colorId: string, width?: number, height?: number) {
  const typology = TYPOLOGIES.find((t) => t.id === typologyId)!
  const line = catalog.lines.find((l) => l.typologyIds.includes(typology.id)) ?? catalog.lines.find((l) => l.kind === typology.kind) ?? catalog.lines[0]
  const w = width ?? typology.defaultSize.width
  const h = height ?? typology.defaultSize.height
  const built = typology.build(w, h)
  const design = { version: 1, lineId: line.id, width: w, height: h, colorId, glassId: catalog.glass[0].id, root: built.root, ...(built.shape ? { shape: built.shape } : {}) } as WindowDesign
  return { design, layout: computeLayout(design, catalog), name: typology.name }
}

export default function Encuentros() {
  const q = new URLSearchParams(window.location.search)
  const view = (q.get('vista') ?? 'interior') as DrawingView
  const render = (q.get('dibujo') ?? 'realistic') as DrawingRender
  const color = q.get('color') ?? 'blanco'
  const id = q.get('id')
  if (id) {
    const px = Number(q.get('px') ?? 1600)
    const one = designFor(id, color, Number(q.get('ancho')) || undefined, Number(q.get('alto')) || undefined)
    return (
      <main className="bg-canvas p-6">
        <WindowDrawing layout={one.layout} design={one.design} catalog={catalog} view={view} render={render} width={px} dimensions="none" detail="high" />
      </main>
    )
  }
  const grupo = q.get('grupo')
  return (
    <main className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-2 bg-canvas p-3">
      {TYPOLOGIES.filter((t) => !grupo || t.group === grupo).map((t) => {
        const one = designFor(t.id, color)
        return (
          <figure key={t.id} className="m-0 border border-divider p-1">
            <div className="flex h-[250px] items-center justify-center">
              <WindowDrawing layout={one.layout} design={one.design} catalog={catalog} view={view} render={render} width={290} height={240} dimensions="none" />
            </div>
            <figcaption className="flex items-center gap-2 text-meta text-fg-muted">
              <WindowThumbnail layout={one.layout} design={one.design} catalog={catalog} view={view} size={56} />
              <span className="truncate">{t.id}</span>
            </figcaption>
          </figure>
        )
      })}
    </main>
  )
}
