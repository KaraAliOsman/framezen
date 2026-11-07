import '../../../../test/setup'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../provider'
import { resetI18nForTests, setLocale } from '../runtime'
import { QuoteSummaryExample, resizeUndoLabel } from './QuoteSummaryExample'

afterEach(() => resetI18nForTests())

const props = { number: 412, windows: 3, total: 1234567, typology: 'tilt_turn', width: 1500, height: 1200 }

describe('espacio de nombres de ejemplo', () => {
  it('en español (por defecto) se ve como siempre, aun sin proveedor', () => {
    render(<QuoteSummaryExample {...props} />)
    expect(screen.getByRole('heading').textContent).toBe('Cotización N° 412')
    expect(screen.getByTestId('windows').textContent).toBe('3 ventanas')
    expect(screen.getByTestId('typology').textContent).toBe('Oscilobatiente · 1.500 × 1.200 mm')
    expect(screen.getByTestId('total').innerHTML).toBe('Total <strong>$1.234.567</strong> + IVA')
    expect(screen.getByRole('link', { name: 'guía de medidas' }).getAttribute('href')).toBe('/ayuda/medidas')
  })

  it('cambia todo a turco al elegir el idioma (textos, plural, glosario y formatos)', async () => {
    render(
      <I18nProvider>
        <QuoteSummaryExample {...props} windows={1} />
      </I18nProvider>,
    )
    expect(screen.getByTestId('windows').textContent).toBe('1 ventana')
    await act(() => setLocale('tr'))
    expect(screen.getByRole('heading').textContent).toBe('Teklif No. 412')
    expect(screen.getByTestId('windows').textContent).toBe('1 pencere')
    expect(screen.getByTestId('typology').textContent).toBe('Çift açılım · 1.500 × 1.200 mm')
    expect(screen.getByTestId('total').textContent).toBe('Toplam CLP 1.234.567 + KDV')
    expect(screen.getByRole('link', { name: 'ölçü kılavuzunu' })).toBeTruthy()
  })

  it('el plural con =0 y el inglés', async () => {
    render(
      <I18nProvider>
        <QuoteSummaryExample {...props} windows={0} />
      </I18nProvider>,
    )
    expect(screen.getByTestId('windows').textContent).toBe('Sin ventanas todavía')
    await act(() => setLocale('en'))
    expect(screen.getByTestId('windows').textContent).toBe('No windows yet')
    expect(screen.getByTestId('typology').textContent).toBe('Tilt and turn · 1,500 × 1,200 mm')
  })

  it('las etiquetas de deshacer conservan una clave estable aunque cambie el idioma', async () => {
    const es = resizeUndoLabel(1500, 1200)
    await setLocale('de')
    const de = resizeUndoLabel(1500, 1200)
    expect(es).toEqual({ key: 'undo.resize', label: 'Cambiar medida a 1500 × 1200 mm' })
    expect(de).toEqual({ key: 'undo.resize', label: 'Maß auf 1500 × 1200 mm ändern' })
  })
})
