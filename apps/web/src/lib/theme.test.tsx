import '../../test/setup'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { THEME_META_COLOR, THEME_TOKENS } from '../brand/tokens'
import { isPublicPath, ThemeProvider, THEME_STORAGE_KEY, useLandingTheme, useTheme } from './theme'

type Theme = ReturnType<typeof useTheme>

function mount(extra?: () => void) {
  let current: Theme
  function Probe() {
    current = useTheme()
    extra?.()
    return null
  }
  const view = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  return { get: () => current, ...view }
}

const root = document.documentElement

describe('tema', () => {
  beforeEach(() => {
    localStorage.clear()
    delete root.dataset.theme
    window.history.pushState({}, '', '/inicio')
  })
  afterEach(() => localStorage.clear())

  it('quien nunca eligió ve Original', () => {
    const { get } = mount()
    expect(get().theme).toBe('original')
    expect(root.dataset.theme).toBe('original')
  })

  it('una preferencia guardada se respeta y una rota vuelve a Original', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const first = mount()
    expect(first.get().theme).toBe('light')
    first.unmount()
    localStorage.setItem(THEME_STORAGE_KEY, 'lila')
    expect(mount().get().theme).toBe('original')
  })

  it('setTheme acepta los cuatro valores y guarda la elección', () => {
    const { get } = mount()
    for (const value of ['dark', 'light', 'original'] as const) {
      act(() => get().setTheme(value))
      expect(root.dataset.theme).toBe(value)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(value)
    }
    act(() => get().setTheme('system'))
    expect(['light', 'dark']).toContain(root.dataset.theme)
  })

  it('la landing y el portal no estrenan Original', () => {
    expect(isPublicPath('/')).toBe(true)
    expect(isPublicPath('/c/abc')).toBe(true)
    expect(isPublicPath('/cotizaciones')).toBe(false)
    window.history.pushState({}, '', '/')
    const { get } = mount()
    expect(get().resolved).toBe('original')
    expect(root.dataset.theme).toBe('light')
  })

  it('la landing se ve en Blanco y al salir vuelve el tema de la persona', () => {
    window.history.pushState({}, '', '/')
    let forced: string | undefined
    const { unmount } = mount(() => {
      forced = useLandingTheme()
    })
    expect(forced).toBe('light')
    expect(root.dataset.theme).toBe('light')
    unmount()
    expect(root.dataset.theme).toBe('original')
  })

  it('la landing no pisa a quien eligió Oscuro', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    let forced: string | undefined
    mount(() => {
      forced = useLandingTheme()
    })
    expect(forced).toBeUndefined()
    expect(root.dataset.theme).toBe('dark')
  })
})

/** Lee las variables de un bloque de styles.css (sin resolver alfa). */
const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8')
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThan(-1)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('paleta Original', () => {
  const original = block("[data-theme='original']")
  const frame = block("[data-theme='original'] [data-frame]")
  const light = block("[data-theme='light']")
  const dark = block("[data-theme='dark']")

  it('define todo lo que definen los otros temas', () => {
    for (const token of Object.keys(light)) expect(original, token).toHaveProperty([token])
    for (const token of Object.keys(dark)) expect(original, token).toHaveProperty([token])
  })

  it('cada variable de tema está en THEME_TOKENS (el portal las copia todas)', () => {
    for (const token of Object.keys(original)) {
      if (token.startsWith('--dk-')) expect(THEME_TOKENS as readonly string[], token).toContain(token)
    }
  })

  it('texto AA sobre hoja, placa y hundido', () => {
    const grounds = [original['--dk-canvas']!, original['--dk-surface']!, original['--dk-sunken']!]
    for (const ground of grounds) {
      for (const text of ['--dk-fg-strong', '--dk-fg', '--dk-fg-muted', '--dk-fg-faint', '--dk-success', '--dk-warning', '--dk-danger', '--dk-info']) {
        expect(contrast(original[text]!, ground), `${text} sobre ${ground}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('texto AA sobre el marco y bordes de campo a 3:1', () => {
    for (const text of ['--dk-fg-strong', '--dk-fg', '--dk-fg-muted', '--dk-fg-faint']) {
      expect(contrast(frame[text]!, original['--dk-frame']!), text).toBeGreaterThanOrEqual(4.5)
      expect(contrast(frame[text]!, frame['--dk-hover']!), text).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast(original['--dk-control']!, original['--dk-canvas']!)).toBeGreaterThanOrEqual(3)
  })

  it('tiene tono propio: ni casi blanco ni casi negro, y las superficies se separan', () => {
    const canvas = luminance(original['--dk-canvas']!)
    expect(canvas).toBeLessThan(0.85)
    expect(canvas).toBeGreaterThan(0.5)
    expect(contrast(original['--dk-canvas']!, original['--dk-surface']!)).toBeGreaterThan(1.2)
    expect(luminance(original['--dk-frame']!)).toBeGreaterThan(luminance(dark['--dk-frame']!))
  })

  it('el dibujo, los materiales y la señal no cambian con el tema', () => {
    for (const token of ['--dk-signal', '--dk-on-signal', '--dk-select', '--dk-frame-line', '--dk-brand-glass', '--sketch-glass-opacity', '--sketch-glint-opacity']) {
      expect(original[token], token).toBe(light[token])
    }
  })

  it('el script de index.html usa los mismos colores que THEME_META_COLOR', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
    for (const [theme, color] of Object.entries(THEME_META_COLOR)) expect(html, theme).toContain(`${theme}: '${color}'`)
    expect(THEME_META_COLOR.original).toBe(original['--dk-frame'])
  })
})
