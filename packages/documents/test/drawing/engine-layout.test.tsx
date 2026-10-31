import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TYPOLOGIES, computeLayout, createDesign } from '@framezen/engine'
import { WindowDrawing } from '../../src/drawing'
import { SAMPLE_CATALOG } from '../../src/sales'

/** Con la geometría real del motor: todas las tipologías se dibujan en ambas vistas. */
describe('WindowDrawing con computeLayout del motor', () => {
  it.each(TYPOLOGIES.map((t) => [t.id, t.kind] as const))('%s', (id, kind) => {
    const design = createDesign(id, {
      lineId: kind === 'sliding' ? 'sample-s70' : 'sample-c60',
      colorId: 'walnut',
      glassId: 'dvh-4-12-4',
    })
    const layout = computeLayout(design, SAMPLE_CATALOG)
    const inside = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={SAMPLE_CATALOG} width={260} height={240} dimensions="all" />)
    const outside = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={SAMPLE_CATALOG} width={260} height={240} view="exterior" />)
    expect(inside).toContain('data-layer="window"')
    expect(inside).toContain('data-layer="dimensions"')
    expect(inside).not.toContain('NaN')
    expect(outside).not.toContain('NaN')
    expect(outside).toContain('data-view="exterior"')
  })
})
