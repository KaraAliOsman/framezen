import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Simula el ancho de pantalla para '(max-width: 1279px)'. */
function screenWidth(width: number) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('max-width: 1279px') ? width <= 1279 : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

async function freshStore() {
  vi.resetModules()
  return (await import('./stores')).useShellStore
}

describe('barra lateral', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('en tablet (< 1280 px) parte en modo iconos si nunca la elegiste; en escritorio, expandida', async () => {
    screenWidth(1024)
    expect((await freshStore()).getState().sidebarCollapsed).toBe(true)
    screenWidth(1440)
    expect((await freshStore()).getState().sidebarCollapsed).toBe(false)
  })

  it('sin elección guardada sigue a la pantalla; al elegir, se respeta y se guarda', async () => {
    screenWidth(1440)
    const store = await freshStore()
    screenWidth(1100)
    store.getState().syncSidebarToScreen()
    expect(store.getState().sidebarCollapsed).toBe(true)
    // Sin elección no se guarda nada.
    expect(JSON.parse(localStorage.getItem('fz-shell') ?? '{"state":{}}').state.sidebarPinned).toBeUndefined()

    store.getState().toggleSidebar() // la persona la expande en tablet
    expect(store.getState().sidebarCollapsed).toBe(false)
    store.getState().syncSidebarToScreen()
    expect(store.getState().sidebarCollapsed).toBe(false)

    // Al volver otro día, en tablet, sigue expandida.
    screenWidth(1024)
    expect((await freshStore()).getState().sidebarCollapsed).toBe(false)
  })

  it('migra la versión anterior: solo «contraída» era una elección', async () => {
    localStorage.setItem('fz-shell', JSON.stringify({ state: { sidebarCollapsed: false }, version: 0 }))
    screenWidth(1024)
    expect((await freshStore()).getState().sidebarCollapsed).toBe(true)

    localStorage.setItem('fz-shell', JSON.stringify({ state: { sidebarCollapsed: true }, version: 0 }))
    screenWidth(1440)
    const store = await freshStore()
    expect(store.getState().sidebarCollapsed).toBe(true)
    expect(store.getState().sidebarPinned).toBe(true)
  })
})
