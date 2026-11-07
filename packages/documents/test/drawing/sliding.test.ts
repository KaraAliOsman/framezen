import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeLayout, createDesign, type Catalog, type TypologyId } from '@dekopen/engine'
import { slidingMeetings, slidingPlane, slidingPullSide, slidingVisibleRect, windowGeometry } from '../../src/drawing'

const catalog = SAMPLE_CATALOG as unknown as Catalog

function layoutOf(id: TypologyId) {
  const line = catalog.lines.find((l) => l.typologyIds.includes(id)) ?? catalog.lines.find((l) => l.kind === 'sliding')!
  return computeLayout(createDesign(id, { lineId: line.id, width: 3000, height: 1500, colorId: 'blanco', glassId: catalog.glass[0].id }), catalog)
}

describe('encuentros de correderas', () => {
  it('corredera 4 (F ← → F): traslapos con los fijos y las dos móviles a tope', () => {
    const layout = layoutOf('sliding_4')
    expect(slidingMeetings(layout).map((m) => m.kind)).toEqual(['lap', 'butt', 'lap'])
    const [, center] = slidingMeetings(layout)
    const left = slidingVisibleRect(layout, center.a)
    const right = slidingVisibleRect(layout, center.b)
    // Las dos hojas del mismo riel no ocupan el mismo lugar.
    expect(left.x + left.w).toBeLessThanOrEqual(right.x)
    expect(left.x + left.w).toBeCloseTo(center.at - 1.5, 3)
    expect(right.x).toBeCloseTo(center.at + 1.5, 3)
    // La medida de corte de cada hoja no cambia: el recorte es solo de lo que se ve.
    expect(center.a.rect.w).toBe(center.b.rect.w)
    expect(left.w).toBeLessThan(center.a.rect.w)
    // Cada tirador en su medio montante, uno a cada lado de la junta.
    expect(slidingPullSide(layout, center.a)).toBe('right')
    expect(slidingPullSide(layout, center.b)).toBe('left')
    expect(left.x + left.w).toBeGreaterThan(center.a.glassRect.x + center.a.glassRect.w)
    expect(right.x).toBeLessThan(center.b.glassRect.x)
  })

  it('lo que corre por delante tapa al de atrás; por fuera, al revés', () => {
    const layout = layoutOf('sliding_4')
    const g = windowGeometry(layout)
    const interlocks = g.meetings.filter((m) => m.interlock)
    expect(interlocks).toHaveLength(2)
    const [first] = interlocks
    expect(first.meeting.front?.kind).toBe('moving')
    expect(first.interlock!.interior.polygon).not.toEqual(first.interlock!.exterior.polygon)
  })

  it('el monorriel lleva la hoja por delante del fijo, aunque compartan riel', () => {
    const layout = layoutOf('sliding_mono')
    const [fixed, moving] = [...layout.sliding].sort((a, b) => a.index - b.index)
    expect(fixed.rail).toBe(moving.rail)
    expect(slidingPlane(moving)).toBeGreaterThan(slidingPlane(fixed))
    expect(slidingMeetings(layout)[0].kind).toBe('lap')
  })

  it('ningún tirador queda detrás de la hoja vecina', () => {
    for (const id of ['sliding_2', 'sliding_3', 'sliding_3_rail', 'sliding_4', 'sliding_6', 'sliding_3_center_fixed', 'sliding_4_center_fixed', 'lift_slide_3', 'lift_slide_4'] as const) {
      const layout = layoutOf(id)
      for (const panel of layout.sliding) {
        if (panel.kind !== 'moving') continue
        const side = slidingPullSide(layout, panel)
        expect(side, `${id} hoja ${panel.index}`).not.toBeNull()
        const hidden = slidingMeetings(layout).some((m) => m.kind === 'lap' && m.front?.panelId !== panel.panelId && ((side === 'left' && m.b.panelId === panel.panelId) || (side === 'right' && m.a.panelId === panel.panelId)))
        expect(hidden, `${id} hoja ${panel.index}`).toBe(false)
      }
    }
  })

  it('la guillotina se traslapa en el eje vertical', () => {
    const layout = layoutOf('vertical_sliding_double')
    const [meeting] = slidingMeetings(layout)
    expect(meeting.axis).toBe('y')
    expect(slidingPullSide(layout, meeting.a)).toBe('top')
    expect(slidingPullSide(layout, meeting.b)).toBe('bottom')
  })
})
