import { PLANS } from '@framezen/shared'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import LandingPage from './LandingPage'
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

afterEach(() => cleanup())

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it('presenta la propuesta y lleva a crear cuenta y entrar', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Cotiza en minutos.')
    const signup = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/crear-cuenta'))
    const login = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/entrar')
    expect(signup.length).toBeGreaterThan(3)
    expect(login.length).toBeGreaterThan(0)
  })

  it('el mini diseñador cambia de tipología y acepta medidas escritas', () => {
    renderLanding()
    const designer = screen.getByRole('group', { name: 'Mini diseñador de ventanas' })
    const typologies = within(designer).getByRole('radiogroup', { name: 'Tipología' })
    expect(within(typologies).getAllByRole('radio')).toHaveLength(5)

    fireEvent.click(within(typologies).getByRole('radio', { name: /Puerta/ }))
    expect(within(designer).getByText('Puerta 1 hoja')).toBeTruthy()

    const width = within(designer).getByLabelText('Ancho') as HTMLInputElement
    const height = within(designer).getByLabelText('Alto') as HTMLInputElement
    fireEvent.change(width, { target: { value: '1000x2200' } })
    expect(width.value).toBe('1.000')
    expect(height.value).toBe('2.200')

    fireEvent.change(width, { target: { value: '90' } })
    expect(within(designer).getByText(/Para este ejemplo usa entre/)).toBeTruthy()
  })

  it('muestra los 4 planes con selector mensual/anual y Pro recomendado', () => {
    renderLanding()
    const pricing = screen.getByRole('region', { name: /Precios claros/ })
    for (const plan of Object.values(PLANS)) {
      expect(within(pricing).getByRole('heading', { name: plan.name })).toBeTruthy()
    }
    expect(within(pricing).getByText('Recomendado')).toBeTruthy()
    expect(within(pricing).getAllByText(formatClp(PLANS.pro.monthly)).length).toBeGreaterThan(0)

    act(() => {
      fireEvent.click(within(pricing).getByRole('radio', { name: 'Anual' }))
    })
    expect(within(pricing).getAllByText(formatClp(PLANS.pro.yearlyMonthly * 12)).length).toBeGreaterThan(0)
  })

  it('compara cortar ventana por ventana con la optimización', () => {
    renderLanding()
    const workshop = screen.getByRole('region', { name: /Un taller sin errores/ })
    const bars = () => within(workshop).getByText('Barras').nextElementSibling?.textContent ?? ''
    expect(bars()).toContain('5')
    act(() => {
      fireEvent.click(within(workshop).getByRole('radio', { name: 'Ventana por ventana' }))
    })
    expect(bars()).toContain('7')
  })

  it('Marco aplica una frase y permite deshacerla', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderLanding()
      const marco = screen.getByRole('region', { name: /Cotiza conversando/ })
      fireEvent.click(within(marco).getByRole('button', { name: /agrega una corredera/ }))
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      vi.useRealTimers()
      expect(await within(marco).findByText(/Agregué la V4/)).toBeTruthy()
      expect(within(marco).getByText('V4')).toBeTruthy()
      fireEvent.click(within(marco).getByRole('button', { name: 'Deshacer' }))
      expect(await within(marco).findByText(/Todo quedó como estaba/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('abre una pregunta frecuente', () => {
    renderLanding()
    const trigger = screen.getByRole('button', { name: '¿Necesito tarjeta para probar?' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('habla de «versión» como el resto del producto y la píldora «Aceptada» llega a AA', () => {
    renderLanding()
    expect(screen.getByText('Versión B automática si cambias algo')).toBeTruthy()
    const faq = screen.getByRole('button', { name: '¿Puedo cambiar una cotización después de enviarla?' })
    fireEvent.click(faq)
    expect(screen.getByText(/guarda la versión B/)).toBeTruthy()
    expect(document.body.textContent ?? '').not.toMatch(/revisi[oó]n/i)

    // ok-600 sobre ok-50 queda en 4,38:1; ok-800 da 7,9:1 (claro) y 10,1:1 (oscuro).
    const pill = screen.getByText('Aceptada')
    expect(pill.className).toContain('text-ok-800')
    expect(pill.className).not.toContain('text-ok-600')
  })
})
