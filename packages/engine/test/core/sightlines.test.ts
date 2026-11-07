import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '../../../catalog/src/sample'
import { TYPOLOGIES, computeBom, computeLayout, createDesign, type Catalog, type Profile } from '../../src'

/** El catálogo de muestra con los números que publica el perfil cambiados por rol. */
function withFaces(faces: Partial<Record<Profile['role'], number>>): Catalog {
  return { ...SAMPLE_CATALOG, profiles: SAMPLE_CATALOG.profiles.map((p) => (faces[p.role] ? { ...p, face: faces[p.role] } : p)) }
}

function design(typology: string, width: number, height: number) {
  return createDesign(typology, { ...SAMPLE_DEFAULTS, width, height })
}

/** Por lado, cuánto entra cada vidrio cortado en su galce respecto de lo que se ve. */
function bites(catalog: Catalog, typology: string, width: number, height: number): number[] {
  const d = design(typology, width, height)
  const panes = computeLayout(d, catalog).panes.filter((p) => p.fill === 'glass' && !p.outline)
  const glass = computeBom(d, catalog).glass.flatMap((g) => Array.from({ length: g.qty }, () => g))
  expect(panes.length).toBe(glass.length)
  const byWidth = <T,>(list: T[], w: (x: T) => number) => [...list].sort((a, b) => w(a) - w(b))
  const seen = byWidth(panes, (p) => p.glassRect.w)
  const cut = byWidth(glass, (g) => g.width)
  return seen.flatMap((p, i) => [(cut[i]!.width - p.glassRect.w) / 2, (cut[i]!.height - p.glassRect.h) / 2])
}

describe('el vidrio visible sale de la pauta', () => {
  it('un número de perfil que no es cara vista no agranda ni achica el vidrio', () => {
    // «Marco 70/42» es el cuerpo hasta el galce, «Hoja 105» el ancho del perfil: ninguno es lo que se ve.
    const catalog = withFaces({ frame: 44, sash: 105, door_sash: 90, mullion: 30 })
    for (const typology of ['fixed', 'casement', 'fixed_casement', 'door']) {
      for (const bite of bites(catalog, typology, 1600, 2100)) {
        expect(bite, typology).toBeGreaterThanOrEqual(8)
        expect(bite, typology).toBeLessThanOrEqual(25)
      }
    }
  })

  it('una cara vista que calza con el descuento se respeta', () => {
    const line = SAMPLE_CATALOG.lines.find((l) => l.id === SAMPLE_DEFAULTS.lineId)!
    const face = line.pauta.frameDeduction + 22
    const layout = computeLayout(design('fixed', 1000, 1000), withFaces({ frame: face }))
    expect(layout.frame.face).toBe(face)
  })

  it('en todas las tipologías de la línea cada vidrio queda dentro de su galce', () => {
    const line = SAMPLE_CATALOG.lines.find((l) => l.id === SAMPLE_DEFAULTS.lineId)!
    for (const typology of TYPOLOGIES.filter((t) => ['fixed', 'casement', 'fixed_casement', 'tilt_turn', 'awning'].includes(t.id))) {
      const { width, height } = typology.defaultSize
      for (const bite of bites(SAMPLE_CATALOG, typology.id, width, height)) expect(bite, `${line.name} ${typology.id}`).toBeGreaterThanOrEqual(8)
    }
  })
})
