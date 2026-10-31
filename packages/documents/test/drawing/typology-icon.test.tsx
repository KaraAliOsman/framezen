import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TypologyId } from '@framezen/engine'
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
