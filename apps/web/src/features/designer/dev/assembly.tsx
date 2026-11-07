/**
 * Hoja de revisión de conjuntos, con el dibujo de documentos y de taller.
 * http://localhost:5221/src/features/designer/dev/assembly.html?catalogo=<ruta de base.json>&linea=<id>
 */
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import { computeBom, computeLayout, createAssembly, createDesign, describeDesign, joinWindow, priceItem, setAssemblyAlign, setAssemblyAngle, type Catalog, type WindowDesign } from '@dekopen/engine'
import { WindowDrawing } from '@dekopen/documents'
import '../../../styles.css'

const params = new URLSearchParams(window.location.search)
const file = params.get('catalogo')

function designs(catalog: Catalog, lineId: string): { title: string; design: WindowDesign; catalog?: Catalog }[] {
  const line = catalog.lines.find((l) => l.id === lineId)
  const colorId = line?.colorIds?.[0] ?? SAMPLE_DEFAULTS.colorId
  const glassId = catalog.glass.find((g) => g.kind === 'dvh' && g.pricePerM2 > 0)?.id ?? SAMPLE_DEFAULTS.glassId
  const base = { lineId, colorId, glassId }
  const win = (id: string, width: number, height: number) => createDesign(id, { ...base, width, height })
  // Para ver una unión que el sistema no permite: la misma línea sin su poste variable.
  const fixedPosts = { ...catalog, profiles: catalog.profiles.filter((p) => !/variable/i.test(p.name)) }
  const mixed = setAssemblyAlign(joinWindow(joinWindow(win('door', 900, 2100), win('fixed', 1200, 1500), 'right', catalog), win('fixed', 1200, 600), 'top', catalog, 'B'), 'g1', 'end', catalog)
  return [
    { title: 'Dos ventanas unidas', design: joinWindow(win('tilt_turn', 800, 1300), win('fixed', 1200, 1300), 'right', catalog) },
    { title: 'Puerta, ventana y sobreluz', design: mixed },
    { title: 'Esquina a 90°', design: createAssembly('corner_90', { ...base, width: 1200, height: 1400 }, catalog) },
    { title: 'Bay window', design: createAssembly('bay', { ...base, width: 800, height: 1400, angle: 135 }, catalog) },
    { title: 'Bow window (ángulo variable)', design: createAssembly('bow', { ...base, width: 700, height: 1400, count: 5, angle: 160 }, catalog) },
    { title: 'Ángulo que el sistema no permite', catalog: fixedPosts, design: setAssemblyAngle(createAssembly('bay', { ...base, width: 800, height: 1400, angle: 135 }, fixedPosts), 150, fixedPosts) },
    { title: 'Puerta con zócalo', design: win('door_zocalo', 900, 2100) },
    { title: 'Abatible con paño inferior', design: win('casement_bottom_fixed', 900, 1800) },
    { title: 'Celosía fija', design: win('louver_fixed', 700, 700) },
  ]
}

function Sheet({ catalog, lineId }: { catalog: Catalog; lineId: string }) {
  const list = useMemo(() => designs(catalog, lineId), [catalog, lineId])
  return (
    <div className="grid grid-cols-3 gap-4 bg-white p-4" style={{ width: 1500 }}>
      {list.map(({ title, design, catalog: own }) => {
        const cat = own ?? catalog
        const layout = computeLayout(design, cat)
        const bom = computeBom(design, cat)
        const price = priceItem(bom, design, cat, {})
        const pendingUnits = (price.units ?? []).filter((u) => u.pending && u.kind === 'unit').map((u) => u.id)
        return (
          <section key={title} data-card={title} className="rounded-sm border border-divider p-3">
            <h2 className="text-table font-semibold">{title}</h2>
            <p className="text-meta text-fg-muted">{describeDesign(design, cat)}</p>
            <WindowDrawing layout={layout} design={design} catalog={cat} width={460} height={380} dimensions="all" pendingUnits={pendingUnits} view={params.get('vista') === 'exterior' ? 'exterior' : 'interior'} />
            <WindowDrawing layout={layout} design={design} catalog={cat} width={460} height={220} dimensions="all" render="technical" assemblyView="developed" plan={false} />
            <p className="text-meta">
              Cortes {bom.cuts.length} · vidrios {bom.glass.length} · {price.pending?.length ? `pendiente: ${price.pending.map((p) => `${p.unitId ? `${p.unitId} ` : ''}${p.ref}`).slice(0, 3).join(', ')}` : 'con precio'} · neto ${price.unitNet.toLocaleString('es-CL')}
            </p>
          </section>
        )
      })}
    </div>
  )
}

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(file ? null : (SAMPLE_CATALOG as Catalog))
  useEffect(() => {
    if (file) void fetch(`/@fs/${file}`).then(async (r) => setCatalog((await r.json()) as Catalog))
  }, [])
  return catalog ? <Sheet catalog={catalog} lineId={params.get('linea') ?? SAMPLE_DEFAULTS.lineId} /> : null
}

createRoot(document.getElementById('root')!).render(<App />)
