import { describe, expect, it } from 'vitest'
import { LOCALES, type Locale } from '@dekopen/shared'
import { setLocale } from '../../../lib/i18n'
import { describeCall, describePlan } from './describe'

describe('«Entendí» de los conjuntos', () => {
  it('nombra el conjunto y sus medidas, sin el nombre técnico de la herramienta', () => {
    const text = describePlan([{ id: '1', tool: 'add_assembly', args: { preset: 'bow', panes: 5, width: 700, height: 1400 } }])
    expect(text).toContain('Bow window')
    expect(text).toContain('5 paños')
    expect(text).toMatch(/700/)
    expect(text).not.toContain('add assembly')
  })

  it('cuenta los conjuntos cuando son varios', () => {
    expect(describeCall({ id: '1', tool: 'add_assembly', args: { preset: 'bay', qty: 2, width: 800, height: 1400 } })).toMatch(/^2 × Bay window/)
  })

  it('una pareja o un trío son un conjunto, no copias: nunca «2 ×»', () => {
    for (const preset of ['coupled_2', 'coupled_3']) {
      expect(describeCall({ id: '1', tool: 'add_assembly', args: { preset, width: 1000, height: 1400 } })).not.toMatch(/^d+ ×|unidades/)
    }
  })

  it('une ventanas por su referencia', () => {
    expect(describePlan([{ id: '1', tool: 'join_windows', args: { items: ['V1', 'V2'] } }])).toBe('Unir V1 y V2')
    expect(describeCall({ id: '1', tool: 'join_windows', args: { items: ['V1', 'V2'], side: 'top' } })).toBe('unir V1 y V2 arriba')
  })

  it('tiene texto en los siete idiomas', async () => {
    for (const locale of LOCALES as readonly Locale[]) {
      await setLocale(locale)
      expect(describeCall({ id: '1', tool: 'join_windows', args: { items: ['V1', 'V2'] } })).not.toMatch(/plan\.|join windows/)
      expect(describeCall({ id: '1', tool: 'add_assembly', args: { preset: 'corner_90', width: 900, height: 900 } })).not.toMatch(/plan\.|add assembly|corner_90/)
    }
    await setLocale('es')
  })
})
