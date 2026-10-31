import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Reveal } from './primitives'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as { animate?: unknown }).animate
})

describe('Reveal: visible por defecto, la animación es solo un realce', () => {
  it('sin observador ni Web Animations el contenido se ve igual', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Reveal>Documentos que venden</Reveal>)
    const el = screen.getByText('Documentos que venden')
    expect(el.style.opacity).toBe('')
    expect(el.getAttribute('style') ?? '').not.toMatch(/opacity/)
  })

  it('si el observador nunca dispara (captura de página completa, impresión), nada queda oculto', () => {
    const observed: Element[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(el: Element) {
          observed.push(el)
        }
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return []
        }
      },
    )
    const animate = vi.fn(() => ({ cancel() {}, finish() {} }))
    ;(HTMLElement.prototype as { animate?: unknown }).animate = animate
    render(<Reveal as="li">Totales sin letra chica</Reveal>)
    const el = screen.getByText('Totales sin letra chica')
    expect(observed).toContain(el)
    expect(animate).not.toHaveBeenCalled()
    expect(el.getAttribute('style') ?? '').not.toMatch(/opacity/)
  })

  it('al entrar en pantalla se anima con fill «backwards» (nunca deja un estado oculto al terminar)', () => {
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          fire = cb
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return []
        }
      },
    )
    const animate = vi.fn(() => ({ cancel() {}, finish() {} }))
    ;(HTMLElement.prototype as { animate?: unknown }).animate = animate
    render(<Reveal delay={0.1}>Aceptación en línea</Reveal>)
    act(() => fire?.([{ isIntersecting: true }]))
    expect(animate).toHaveBeenCalledTimes(1)
    const [, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions]
    expect(options.fill).toBe('backwards')
  })

  it('con «mount» se anima al montar, sin esperar al observador', () => {
    const animate = vi.fn(() => ({ cancel() {}, finish() {} }))
    ;(HTMLElement.prototype as { animate?: unknown }).animate = animate
    render(
      <Reveal as="h1" when="mount">
        Cotiza en minutos
      </Reveal>,
    )
    expect(screen.getByRole('heading', { name: 'Cotiza en minutos' })).toBeTruthy()
    expect(animate).toHaveBeenCalledTimes(1)
  })
})
