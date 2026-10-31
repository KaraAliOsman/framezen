/**
 * Preparación común para pruebas de componentes (jsdom). Se importa al inicio de cada archivo
 * de prueba de interfaz: `import './setup'`.
 */
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom no trae estas APIs que usan Radix y motion.
if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
  }
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  }
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
}
