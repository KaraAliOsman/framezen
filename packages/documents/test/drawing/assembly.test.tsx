import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import { computeLayout, createAssembly, createDesign, invertAssembly, joinWindow, mirrorAssembly, setAssemblyAngle, type Catalog, type Profile } from '@dekopen/engine'
import { AssemblyPlan, TYPOLOGY_ICON_SPECS, WindowDrawing, assemblyProjection } from '../../src/drawing'

const base = { lineId: SAMPLE_DEFAULTS.lineId, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId }
const post = (angle: number): Profile => ({ id: `P${angle}`, lineId: base.lineId, code: `P${angle}`, name: `Pilar Esquinero ${angle}°`, role: 'coupler', face: 40, barLength: 5800, priceByColor: { blanco: 30000 } })
const catalog: Catalog = { ...(SAMPLE_CATALOG as Catalog), profiles: [...SAMPLE_CATALOG.profiles, post(90), post(135)] }
const draw = (design: Parameters<typeof computeLayout>[0], props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<WindowDrawing layout={computeLayout(design, catalog)} design={design} catalog={catalog} width={500} height={400} {...props} />)

describe('dibujo de conjuntos', () => {
  const flat = joinWindow(createDesign('fixed', { ...base, width: 1000, height: 1200 }), createDesign('fixed', { ...base, width: 800, height: 1200 }), 'right', catalog)
  const bay = createAssembly('bay', { ...base, width: 800, height: 1400 }, catalog)

  it('plano: cada unidad, su unión, su letra y las cotas de cada una y del total', () => {
    const svg = draw(flat, { dimensions: 'total' })
    expect(svg.match(/data-unit="/g)).toHaveLength(2)
    expect(svg).toContain('data-joint="J1"')
    expect(svg).toContain('data-unit-badge="A"')
    expect(svg).toContain('1.000')
    expect(svg).toContain('800')
    expect(svg).not.toContain('data-layer="plan"')
  })

  it('bay en un documento: perspectiva y planta, sin paneles de canto', () => {
    const svg = draw(bay, { dimensions: 'all' })
    expect(svg.match(/matrix\(/g)).toHaveLength(3)
    expect(svg).toContain('data-layer="plan"')
    expect(svg).toContain('135°')
    const p = assemblyProjection(computeLayout(bay, catalog).assembly!, 'interior')!
    expect(p.units.map((u) => Math.round(u.a * 100))).toEqual([71, 100, 71])
  })

  it('una esquina a 90° muestra sus dos paños, no uno de canto', () => {
    const corner = createAssembly('corner_90', { ...base, width: 1000, height: 1300 }, catalog)
    const p = assemblyProjection(computeLayout(corner, catalog).assembly!, 'interior')!
    for (const u of p.units) expect(Math.abs(u.a)).toBeCloseTo(Math.SQRT1_2, 3)
  })

  it('la vista exterior espeja el orden de los paños', () => {
    const layout = computeLayout(bay, catalog)
    const a = assemblyProjection(layout.assembly!, 'interior')!
    const b = assemblyProjection(layout.assembly!, 'exterior')!
    expect(a.units[0].e).toBeLessThan(a.units[2].e)
    expect(b.units[0].e).toBeGreaterThan(b.units[2].e)
  })

  it('el editor pide el desarrollo y sin planta: calza con su viewport', () => {
    const svg = draw(bay, { assemblyView: 'developed', plan: false, dimensions: 'all' })
    expect(svg).not.toContain('matrix(')
    expect(svg).not.toContain('data-layer="plan"')
    expect(svg).toContain('data-joint="J1"')
  })

  it('una unión sin pieza se ve en rojo y una unidad sin precio queda marcada', () => {
    const missing = setAssemblyAngle(bay, 150, catalog)
    const developed = draw(missing, { assemblyView: 'developed', plan: false })
    expect(developed).toContain('data-status="missing"')
    expect(developed).toContain('data-joint-warning="J1"')
    expect(draw(flat, { pendingUnits: ['B'] })).toContain('Sin precio')
    expect(draw(flat)).not.toContain('Sin precio')
  })

  it('la planta suelta se dibuja con ancho, vuelo y ángulos', () => {
    const plan = computeLayout(bay, catalog).assembly!.plan!
    const svg = renderToStaticMarkup(<AssemblyPlan plan={plan} locale="en" />)
    expect(svg).toContain('Projection')
    expect(svg).toContain('135°')
  })

  it('bow hacia adentro: ángulos bajo los postes y la cota del ancho más abajo, sin pisarse', () => {
    const bow = invertAssembly(setAssemblyAngle(bay, 135, catalog), catalog)
    const svg = renderToStaticMarkup(<AssemblyPlan plan={computeLayout(bow, catalog).assembly!.plan!} width={396} height={236} />)
    const y = (text: RegExp) => [...svg.matchAll(new RegExp(`<text[^>]* y="([\\d.]+)"[^>]*>${text.source}`, 'g'))].map((m) => Number(m[1]))
    const angles = y(/135°/)
    expect(angles).toHaveLength(2)
    const [span] = y(/Ancho/)
    expect(span - Math.max(...angles)).toBeGreaterThan(11)
    const facet = y(/B · /)[0]
    expect(Math.min(...angles) - facet).toBeGreaterThan(11)
  })

  it('un paño de costado se lee de abajo arriba y deja libre la cota del vuelo', () => {
    const corner = createAssembly('corner_90', { ...base, width: 1000, height: 1300 }, catalog)
    for (const design of [corner, mirrorAssembly(corner, catalog), invertAssembly(corner, catalog), mirrorAssembly(invertAssembly(corner, catalog), catalog)]) {
      const svg = renderToStaticMarkup(<AssemblyPlan plan={computeLayout(design, catalog).assembly!.plan!} width={396} height={236} />)
      const turns = [...svg.matchAll(/rotate\((-?[\d.]+) /g)].map((m) => Number(m[1]))
      for (const turn of turns) expect(Math.abs(turn)).toBeLessThanOrEqual(90)
      const labels = [...svg.matchAll(/<text[^>]* x="([\d.]+)"[^>]*rotate\(-90[^>]*>(.*?)<\/text>/g)].map((m) => ({ x: Number(m[1]), text: m[2] }))
      const vuelo = labels.find((l) => l.text.startsWith('Vuelo'))
      for (const l of labels) if (vuelo && l !== vuelo) expect(Math.abs(l.x - vuelo.x)).toBeGreaterThan(14)
    }
  })

  it('toda tipología tiene pictograma', () => {
    expect(Object.keys(TYPOLOGY_ICON_SPECS).length).toBeGreaterThan(70)
  })
})

describe('zócalo y celosía', () => {
  it('la puerta con zócalo dibuja su panel y su travesaño en técnico', () => {
    const door = createDesign('door_zocalo', { ...base, width: 900, height: 2100 })
    expect(draw(door, { render: 'technical' })).toContain('data-zocalo="n1"')
  })

  it('la guillotina dibuja flecha vertical', () => {
    const sliding = (catalog.lines.find((l) => l.kind === 'sliding') ?? catalog.lines[0]).id
    const d = createDesign('vertical_sliding', { ...base, lineId: sliding, width: 900, height: 1500 })
    expect(draw(d, { render: 'technical' })).toContain('data-symbol="vertical_slide"')
  })
})
