import '../../../../test/setup'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Catalog } from '@framezen/engine'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { ColorsTab } from './ColorsTab'
import { glassBrandLabel } from './GlassTab'

const catalog: Catalog = {
  ...SAMPLE_CATALOG,
  colors: [...SAMPLE_CATALOG.colors, { id: 'caoba', name: 'Caoba', hex: '#6B2E1F', code: 'CA' }],
}

describe('ColorsTab', () => {
  it('muestra nombre y líneas, nunca códigos ni hexadecimales', () => {
    const { container } = render(<ColorsTab catalog={catalog} loading={false} />)
    const text = container.textContent ?? ''
    for (const color of catalog.colors) {
      expect(text).not.toContain(color.hex.toUpperCase())
      if (color.code) expect(screen.queryByText(color.code, { exact: true })).toBeNull()
    }
    // El color que ninguna línea usa dice cómo se activa, sin opacidad (contraste AA).
    const caoba = screen.getByText('Caoba').closest('li')!
    expect(caoba.textContent).toContain('Se activa con su marca')
    expect(caoba.className).not.toMatch(/opacity/)
    // El código y el hex quedan para soporte, en el tooltip.
    expect(caoba.getAttribute('title')).toBe('Caoba · CA · #6B2E1F')
  })
})

describe('glassBrandLabel', () => {
  it('quita la palabra de la familia y nombra la lista sin proveedor', () => {
    expect(glassBrandLabel('Vidrios PROLINE')).toBe('PROLINE')
    expect(glassBrandLabel('Vidrios PYG')).toBe('PYG')
    expect(glassBrandLabel('Vidrios')).toBe('Lista general')
    expect(glassBrandLabel('Cristalería Sur')).toBe('Cristalería Sur')
  })
})
