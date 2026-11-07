import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { DEFAULT_PRICING, defaultBrandSettings } from '@dekopen/engine'
import { barExample, brandExample, exampleGlassId, exampleTypology, pickExampleLine } from './brandExample'
import { factoryOf, pautaExample, pautaPayload, pautaValue, samePauta, setPautaValue } from './pauta'
import { mergePautaPatch, patchLineInCatalog } from '../api'
import { monogramOrder, monogramText } from './labels'
import { addsInformation } from '../tabs/LinesTab'

const line = SAMPLE_CATALOG.lines.find((l) => l.kind === 'casement')!
const sliding = SAMPLE_CATALOG.lines.find((l) => l.kind === 'sliding')!

describe('ejemplo en vivo de «Mis precios» (motor real)', () => {
  it('elige una línea practicable y una tipología que la línea fabrica', () => {
    const picked = pickExampleLine(SAMPLE_CATALOG, line.brandId)!
    expect(picked.kind).toBe('casement')
    expect(picked.typologyIds).toContain(exampleTypology(picked))
    expect(exampleGlassId(SAMPLE_CATALOG)).toBeTruthy()
  })

  it('un descuento baja el material y el precio de venta; sin descuento ambos coinciden', () => {
    const base = defaultBrandSettings(line.brandId)
    const same = brandExample(SAMPLE_CATALOG, base, DEFAULT_PRICING)!
    expect(same.list.unitNet).toBeGreaterThan(0)
    expect(same.mine.unitNet).toBe(same.list.unitNet)
    const discounted = brandExample(SAMPLE_CATALOG, { ...base, discounts: { ...base.discounts, profiles: 30 } }, DEFAULT_PRICING)!
    expect(discounted.mine.materials.profiles).toBeLessThan(discounted.list.materials.profiles)
    expect(discounted.mine.unitNet).toBeLessThan(discounted.list.unitNet)
    expect(discounted.title).toMatch(/1\.200 × 1\.200 mm/)
  })

  it('una marca sin líneas no tiene ejemplo de ventana', () => {
    expect(brandExample(SAMPLE_CATALOG, defaultBrandSettings('no-existe'), DEFAULT_PRICING)).toBeNull()
  })

  it('despunte y disco cambian lo que sale de una barra (optimizador real)', () => {
    const plain = barExample(0, 4)
    expect(plain).toMatchObject({ pieces: 4, remainder: 184 })
    expect(plain.offsets).toEqual([0, 1404, 2808, 4212])
    const trimmed = barExample(200, 4)
    expect(trimmed.pieces).toBe(3)
    expect(trimmed.offsets[0]).toBe(200)
  })
})

describe('pauta explicada con medidas del motor', () => {
  it('muestra cortes y vidrios de una ventana de abatir de 1.200 × 1.200', () => {
    const example = pautaExample(SAMPLE_CATALOG, line)!
    const frame = example.measures.find((m) => m.id === 'frame')!
    expect(frame.value).toBe(1200 + 2 * line.pauta.weld)
    const glass = example.measures.find((m) => m.id === 'glass')!
    expect(glass.size?.width).toBeGreaterThan(0)
  })

  it('al cambiar la soldadura cambia el corte del marco, no el vidrio', () => {
    const before = pautaExample(SAMPLE_CATALOG, line)!
    const after = pautaExample(SAMPLE_CATALOG, line, { pauta: { ...line.pauta, weld: line.pauta.weld + 1 } })!
    const get = (e: typeof before, id: string) => e.measures.find((m) => m.id === id)?.value
    expect(get(after, 'frame')).toBe((get(before, 'frame') ?? 0) + 2)
    expect(get(after, 'glass')).toBe(get(before, 'glass'))
  })

  it('las correderas muestran la hoja de 2 hojas', () => {
    const example = pautaExample(SAMPLE_CATALOG, sliding)!
    expect(example.title).toBe('Corredera 2 hojas')
    expect(example.measures.some((m) => m.id === 'sash-w')).toBe(true)
  })

  it('edita valores simples y de refuerzo sin perder el resto', () => {
    const p = setPautaValue({ weld: 3, reinforcement: { frame: 114 } }, 'reinforcement.sash', 146)
    expect(p.reinforcement).toEqual({ frame: 114, sash: 146 })
    expect(pautaValue(setPautaValue(p, 'reinforcement.frame', null), 'reinforcement.frame')).toBeUndefined()
    expect(setPautaValue(p, 'weld', 2.5).weld).toBe(2.5)
  })
})

describe('textos humanos', () => {
  it('monograma: iniciales propias o de las dos primeras palabras', () => {
    expect(monogramText({ name: 'Proline', monogram: 'PR' })).toBe('PR')
    expect(monogramText({ name: 'Vidrios del Sur' })).toBe('VD')
    expect(monogramText({ name: 'aPLAST' })).toBe('AP')
  })

  it('monograma: con la lista de marcas no repite iniciales (activas primero, luego por id)', () => {
    // Como en el catálogo base: el importador pone las dos primeras letras a cada marca.
    const brands = [
      { id: 'winsa', name: 'Winsa', monogram: 'WI', enabled: true },
      { id: 'windoline', name: 'WINDOLINE', monogram: 'WI', enabled: false },
      { id: 'winhouse', name: 'Winhouse', monogram: 'WI', enabled: true },
      { id: 'proline', name: 'Proline', monogram: 'PR', enabled: true },
    ]
    const ordered = monogramOrder(brands, (b) => b.enabled)
    expect(ordered.map((b) => b.id)).toEqual(['proline', 'winhouse', 'winsa', 'windoline'])
    const shown = ordered.map((b) => monogramText(b, ordered))
    expect(shown).toEqual(['PR', 'WI', 'WA', expect.any(String)])
    expect(new Set(shown).size).toBe(shown.length)
    // Las activas salen igual con la lista completa o solo con las activas (pestaña Líneas).
    const onlyActive = monogramOrder(brands.filter((b) => b.enabled))
    expect(onlyActive.map((b) => monogramText(b, onlyActive))).toEqual(['PR', 'WI', 'WA'])
    // Sin lista, igual que antes.
    expect(monogramText(brands[0])).toBe('WI')
  })

  it('la descripción de una línea se muestra solo si agrega algo', () => {
    expect(addsInformation('Practicable', 'PVC · Practicable')).toBe(false)
    expect(addsInformation('Practicable 60 mm, 4 cámaras', 'PVC · Practicable · 60 mm · 4 cámaras')).toBe(false)
    expect(addsInformation('Corredera americana', 'PVC · Corredera')).toBe(true)
    expect(addsInformation(undefined, 'PVC')).toBe(false)
  })
})

describe('guardar la pauta (PATCH /api/catalog/lines/:id)', () => {
  const factory = { weld: 3, frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20, reinforcement: { frame: 114, sash: 146 } }

  it('manda todos los valores presentes y null en los que se quitaron', () => {
    const draft = { ...factory, weld: 4, reinforcement: { frame: 114 } }
    expect(pautaPayload(draft, factory)).toEqual({
      weld: 4,
      frameDeduction: 44,
      sashWidth: 80,
      sashDeduction: 60,
      sashOverlap: 8,
      glassGap: 5,
      mullionDeduction: 20,
      reinforcement: { frame: 114, sash: null },
    })
  })

  it('no inventa valores que la línea no traía', () => {
    expect(pautaPayload({ weld: 3 }, { weld: 3 })).toEqual({ weld: 3 })
  })

  it('la caché mezcla igual que el servidor: null vuelve al de fábrica', () => {
    const adjusted = { ...factory, weld: 4, frameDeduction: 46 }
    const merged = mergePautaPatch(adjusted, { weld: null, reinforcement: { sash: 150 } }, factory)!
    expect(merged.weld).toBe(3)
    expect(merged.frameDeduction).toBe(46)
    expect(merged.reinforcement).toEqual({ frame: 114, sash: 150 })
    expect(mergePautaPatch(adjusted, null, factory)).toEqual(factory)
  })

  it('patchLineInCatalog guarda la pauta de fábrica para poder volver', () => {
    const next = patchLineInCatalog(SAMPLE_CATALOG, line.id, { pauta: { weld: line.pauta.weld + 1 } })
    const edited = next.lines.find((l) => l.id === line.id) as typeof line & { factory?: { pauta: typeof line.pauta } }
    expect(edited.pauta.weld).toBe(line.pauta.weld + 1)
    expect(factoryOf(edited).pauta.weld).toBe(line.pauta.weld)
  })

  it('compara pautas por valor', () => {
    expect(samePauta({ weld: 3, glassGap: 5 }, { glassGap: 5, weld: 3 })).toBe(true)
    expect(samePauta({ weld: 3 }, { weld: 4 })).toBe(false)
    expect(samePauta({ weld: 3, reinforcement: { frame: 1 } }, { weld: 3 })).toBe(false)
  })
})
