import '../../../test/setup'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useLocale } from '../../lib/i18n'
import { getLocale, LOCALE_STORAGE_KEY, resetI18nForTests } from '../../lib/i18n/runtime'
import { createQueryClient } from '../../lib/queryClient'
import { AppProviders } from '../providers'
import { LanguageOptions } from './LanguageMenu'

afterEach(() => {
  resetI18nForTests()
  window.localStorage.removeItem(LOCALE_STORAGE_KEY)
})

function Harness() {
  const { locale, setLocale } = useLocale()
  const [value, setValue] = useState(locale)
  return (
    <LanguageOptions
      value={value}
      onChange={(next) => {
        setValue(next)
        void setLocale(next)
      }}
    />
  )
}

describe('selector de idioma', () => {
  it('muestra los 7 idiomas con su nombre nativo y marca el actual', () => {
    render(
      <AppProviders client={createQueryClient()}>
        <Harness />
      </AppProviders>,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent?.trim())).toEqual(['Español', 'English', 'Português (Brasil)', 'Français', 'Deutsch', 'Italiano', 'Türkçe'])
    expect(screen.getByRole('radio', { name: 'Español' }).getAttribute('aria-checked')).toBe('true')
  })

  it('cambiar de idioma lo aplica a la app, a <html lang> y lo guarda para la próxima visita', async () => {
    render(
      <AppProviders client={createQueryClient()}>
        <Harness />
      </AppProviders>,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }))
    })
    await waitFor(() => expect(getLocale()).toBe('de'))
    expect(document.documentElement.lang).toBe('de-DE')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de')
  })
})
