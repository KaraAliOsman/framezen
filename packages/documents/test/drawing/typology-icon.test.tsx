import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TYPOLOGIES, type TypologyId } from '@dekopen/engine'
import { TYPOLOGY_ICON_LABELS, TYPOLOGY_ICON_SPECS, TypologyIcon } from '../../src/drawing'

// Todas las tipologías del contrato: si el motor agrega una, este objeto deja de compilar.
const ALL: Record<TypologyId, true> = {
  fixed: true,
  casement: true,
  casement_out: true,
  tilt_turn: true,
  tilt: true,
  awning: true,
  casement_double: true,
  fixed_casement: true,
  fixed_tilt_turn: true,
  casement_transom: true,
  fixed_awning_bottom: true,
  fixed_3: true,
  casement_fixed_casement: true,
  door: true,
  door_double: true,
  door_sidelight: true,
  door_transom: true,
  arch: true,
  trapezoid: true,
  triangle: true,
  sliding_2: true,
  sliding_2_fixed: true,
  sliding_3: true,
  sliding_3_rail: true,
  sliding_4: true,
  sliding_mono: true,
  sliding_6: true,
  sliding_3_center_fixed: true,
  sliding_4_center_fixed: true,
  lift_slide_2: true,
  lift_slide_3: true,
  lift_slide_4: true,
  tilt_slide: true,
  tilt_slide_2: true,
  parallel_slide: true,
  folding_3: true,
  folding_4: true,
  folding_5: true,
  folding_6: true,
  folding_7: true,
  pivot_v: true,
  pivot_h: true,
  french_casement: true,
  french_tilt_turn: true,
  balcony_door: true,
  balcony_door_double: true,
  entrance_door: true,
  entrance_door_sidelights: true,
  door_double_sidelights: true,
  fixed_tilt_turn_fixed: true,
  tilt_turn_double_transom: true,
  round: true,
  oval: true,
  pentagon: true,
  octagon: true,
  gable: true,
  arch_segmental: true,
  arch_casement: true,
  casement_bottom_fixed: true,
  tilt_turn_bottom_fixed: true,
  casement_double_bottom_fixed: true,
  tilt_turn_transom: true,
  awning_transom: true,
  fixed_tilt: true,
  fixed_awning_side: true,
  casement_double_mullion: true,
  tilt_turn_fixed_tilt_turn: true,
  door_panel: true,
  door_zocalo: true,
  door_double_zocalo: true,
  door_out: true,
  vertical_sliding: true,
  vertical_sliding_double: true,
  louver_fixed: true,
}

describe('TypologyIcon', () => {
  const ids = Object.keys(ALL) as TypologyId[]

  it('tiene pictograma y nombre para cada tipología', () => {
    for (const id of ids) {
      expect(TYPOLOGY_ICON_SPECS[id], id).toBeDefined()
      expect(TYPOLOGY_ICON_LABELS[id], id).toMatch(/\S/)
    }
  })

  it.each(Object.keys(ALL))('dibuja %s en currentColor con nombre accesible', (id) => {
    const out = renderToStaticMarkup(<TypologyIcon typologyId={id as TypologyId} size={32} />)
    expect(out).toContain('width="32"')
    expect(out).toContain('stroke="currentColor"')
    expect(out).toContain(`data-typology="${id}"`)
    expect(out).toContain(`aria-label="${TYPOLOGY_ICON_LABELS[id as TypologyId]}"`)
    expect(out.match(/<(rect|path)/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('las correderas muestran flechas o «F», las puertas su manilla y las practicables su símbolo', () => {
    expect(renderToStaticMarkup(<TypologyIcon typologyId="sliding_2_fixed" />)).toContain('>F</text>')
    expect(renderToStaticMarkup(<TypologyIcon typologyId="casement_out" />)).toContain('stroke-dasharray')
    expect(renderToStaticMarkup(<TypologyIcon typologyId="casement" />)).not.toContain('stroke-dasharray')
  })
})

describe('pictogramas de correderas', () => {
  it('muestran las mismas hojas y sentidos que la galería', () => {
    for (const typology of TYPOLOGIES) {
      const root = TYPOLOGY_ICON_SPECS[typology.id].root
      if (root.t !== 'slide') continue
      const { root: built } = typology.build(typology.defaultSize.width, typology.defaultSize.height)
      if (built.type !== 'sliding') throw new Error(typology.id)
      expect(root.panels, typology.id).toEqual(built.panels.map((p) => (p.kind === 'fixed' ? 'f' : p.direction === 'right' ? 'r' : 'l')))
    }
  })
})
