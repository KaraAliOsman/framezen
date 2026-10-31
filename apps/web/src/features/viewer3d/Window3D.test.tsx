import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureWindow } from './fixtures'
import { Window3DLazy } from './lazy'
import { resetWebGLCacheForTests } from './webgl'
import { Window3D } from './Window3D'

describe('Window3D sin WebGL', () => {
  beforeEach(() => {
    resetWebGLCacheForTests()
    // jsdom no tiene WebGL: getContext devuelve null, como un navegador sin aceleración.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    resetWebGLCacheForTests()
  })

  it('muestra un mensaje claro y no intenta crear el lienzo', () => {
    const { design, layout, catalog } = fixtureWindow('casement')
    const { container } = render(<Window3D layout={layout} design={design} catalog={catalog} openAmount={0.5} height={300} className="rounded-xl" />)
    expect(screen.getByRole('status').textContent).toContain('No pudimos mostrar la vista 3D')
    expect(container.querySelector('canvas')).toBeNull()
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.height).toBe('300px')
    expect(wrapper.className).toContain('rounded-xl')
  })

  it('la versión diferida termina mostrando el mismo mensaje', async () => {
    const { design, layout, catalog } = fixtureWindow('sliding_2')
    render(<Window3DLazy layout={layout} design={design} catalog={catalog} />)
    expect(await screen.findByText('No pudimos mostrar la vista 3D', undefined, { timeout: 10_000 })).toBeTruthy()
  })
})
