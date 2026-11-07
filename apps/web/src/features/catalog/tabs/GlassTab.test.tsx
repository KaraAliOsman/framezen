import '../../../../test/setup'
import { describe, expect, it } from 'vitest'
import { glassBrandLabel } from './GlassTab'

describe('glassBrandLabel', () => {
  it('quita la palabra de la familia y nombra la lista sin proveedor', () => {
    expect(glassBrandLabel('Vidrios PROLINE')).toBe('PROLINE')
    expect(glassBrandLabel('Vidrios PYG')).toBe('PYG')
    expect(glassBrandLabel('Vidrios')).toBe('Lista general')
    expect(glassBrandLabel('Vidrios', 'General list')).toBe('General list')
    expect(glassBrandLabel('Cristalería Sur')).toBe('Cristalería Sur')
  })
})
