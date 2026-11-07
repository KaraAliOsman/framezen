import { PLANS, QUOTE_PRESET_IDS } from '@dekopen/shared'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import LandingPage from './LandingPage'
import { resetI18nForTests, setLocale } from '../../lib/i18n/runtime'
import { formatClp } from './lib/format'

beforeAll(() => {
  // jsdom no trae estas APIs del navegador; motion y el lienzo las usan.
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('ResizeObserver', Observer)
  if (!window.matchMedia) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }))
  }
})

afterEach(() => {
  cleanup()
  resetI18nForTests()
})

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

const money = (text: string | null) => Number((text ?? '').replace(/[^\d−-]/g, '').replace('−', '-'))

describe('LandingPage', () => {
  it('presenta la propuesta en una frase y lleva a crear cuenta y entrar', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cotiza ventanas de PVC con tus precios y pasa los cortes al taller.')
    const links = screen.getAllByRole('link')
    expect(links.filter((link) => link.getAttribute('href')?.startsWith('/crear-cuenta')).length).toBeGreaterThan(3)
    expect(links.filter((link) => link.getAttribute('href') === '/entrar').length).toBeGreaterThan(0)
  })

  it('no promete tiempos ni cifras que no salgan del producto', () => {
    renderLanding()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\b3 minutos|un minuto|\d+ talleres|\d+ %\s+(más|menos) de/i)
    // Promesas retiradas por no tener función detrás, e instrucciones internas publicadas como ventaja.
    expect(text).not.toMatch(/soporte prioritario|exportar tus datos|terreno|aluminio|el total, al final|familia rojas|ventanas del sur/i)
  })

  it('la prueba cambia de tipología y acepta medidas escritas', () => {
    renderLanding()
    const designer = screen.getByRole('group', { name: 'Prueba de ventana' })
    const typologies = within(designer).getByRole('radiogroup', { name: 'Tipología' })
    expect(within(typologies).getAllByRole('radio')).toHaveLength(5)

    fireEvent.click(within(typologies).getByRole('radio', { name: /Puerta/ }))
    const width = within(designer).getByLabelText('Ancho') as HTMLInputElement
    const height = within(designer).getByLabelText('Alto') as HTMLInputElement
    expect(width.value).toBe('900')
    fireEvent.change(width, { target: { value: '1000x2200' } })
    expect(width.value).toBe('1.000')
    expect(height.value).toBe('2.200')

    fireEvent.change(width, { target: { value: '90' } })
    expect(within(designer).getByText(/En esta prueba usa entre/)).toBeTruthy()
  })

  it('el desglose suma exactamente el precio de la ventana', () => {
    renderLanding()
    const rows = within(screen.getByTestId('price-breakdown')).getAllByRole('definition').map((dd) => money(dd.textContent))
    const total = money(screen.getByTestId('example-price').textContent)
    expect(rows.length).toBeGreaterThan(4)
    expect(total).toBeGreaterThan(0)
    expect(rows.reduce((sum, value) => sum + value, 0)).toBe(total)
  })

  it('ofrece las 5 plantillas de cotización', () => {
    renderLanding()
    const templates = screen.getByRole('radiogroup', { name: 'Plantilla de la cotización' })
    expect(within(templates).getAllByRole('radio')).toHaveLength(QUOTE_PRESET_IDS.length)
    expect(QUOTE_PRESET_IDS).toHaveLength(5)
  })

  it('compara los 4 planes en tabla con precios de @dekopen/shared', () => {
    renderLanding()
    const plans = screen.getByRole('region', { name: /Elige tu plan/ })
    const table = within(plans).getByRole('table')
    for (const plan of Object.values(PLANS)) {
      expect(within(table).getAllByRole('columnheader', { name: new RegExp('^' + plan.name) }).length).toBeGreaterThan(0)
    }
    expect(within(table).getByText(formatClp(PLANS.pro.monthly))).toBeTruthy()
    act(() => {
      fireEvent.click(within(plans).getByRole('radio', { name: /Anual/ }))
    })
    expect(within(table).getByText(formatClp(PLANS.pro.yearlyMonthly))).toBeTruthy()
  })

  it('el taller muestra los cortes que calcula el optimizador', () => {
    renderLanding()
    const workshop = screen.getByRole('region', { name: /el taller ya sabe qué cortar/ })
    const bars = within(workshop).getByText('Barras').parentElement?.textContent ?? ''
    expect(Number(bars.replace(/\D/g, ''))).toBeGreaterThan(0)
    expect(within(workshop).getAllByRole('listitem', { name: /^Barra con cortes de/ }).length).toBeGreaterThan(0)
  })

  it('Marco aplica una frase, recalcula y permite deshacerla', async () => {
    renderLanding()
    const marco = screen.getByRole('region', { name: /Escríbele a Marco/ })
    const net = () => money(within(marco).getByTestId('assistant-net').textContent)
    const before = net()
    fireEvent.click(within(marco).getByRole('button', { name: /descuento 5/ }))
    expect(await within(marco).findByText(/Apliqué un 5 %/)).toBeTruthy()
    expect(net()).toBeLessThan(before)
    fireEvent.click(within(marco).getByRole('button', { name: 'Deshacer' }))
    expect(net()).toBe(before)
  })

  it('abre una pregunta frecuente', () => {
    renderLanding()
    const trigger = screen.getByRole('button', { name: '¿Necesito tarjeta para probar?' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('LandingPage en otros idiomas', () => {
  it.each([
    ['en', 'Quote PVC windows'],
    ['de', 'PVC-Fenster'],
    ['tr', 'PVC pencere'],
  ] as const)('%s: titular y navegación traducidos, sin restos en español', async (locale, title) => {
    renderLanding()
    await act(async () => {
      await setLocale(locale)
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(title)
    expect(screen.queryByRole('link', { name: 'Cotización' })).toBeNull()
    expect(screen.queryByText('Preguntas frecuentes')).toBeNull()
    expect(document.documentElement.lang).toMatch(new RegExp(`^${locale}-`))
  })

  it('los precios siguen en pesos chilenos aunque cambie el idioma', async () => {
    renderLanding()
    await act(async () => {
      await setLocale('en')
    })
    const plans = screen.getByRole('region', { name: /Choose your plan/ })
    const text = (plans.textContent ?? '').replace(/\s/g, ' ')
    expect(text).toContain(`CLP ${new Intl.NumberFormat('en-US').format(PLANS.pro.monthly)}`)
    expect(text).not.toMatch(/USD|€/)
  })
})
