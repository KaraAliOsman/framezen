import '../../../../test/setup'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from '../../../ui'
import type { PriceRow } from '../model/prices'
import { BulkAdjust } from './BulkAdjust'

const row = (key: string, price: number, own = false): PriceRow => ({
  key,
  kind: 'item',
  family: 'hardware',
  id: key,
  code: key.toUpperCase(),
  name: `Herraje ${key}`,
  brandId: 'b',
  brandName: 'Marca',
  unit: 'unidad',
  price,
  own,
})

describe('BulkAdjust', () => {
  it('muestra cuántos precios cambian y aplica el porcentaje elegido', () => {
    const onApply = vi.fn()
    render(<BulkAdjust rows={[row('a', 10000), row('b', 20000, true), row('c', 0)]} onApply={onApply} trigger={<Button>Ajustar</Button>} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }))
    fireEvent.click(screen.getByRole('button', { name: '+10 %' }))
    expect(screen.getByText(/sin precio quedan igual/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Aplicar \+10/ }))
    expect(onApply).toHaveBeenCalledTimes(1)
    const [result, pct] = onApply.mock.calls[0]
    expect(pct).toBe(10)
    expect(result.changed).toBe(2)
    expect(result.change.overrides).toEqual([
      { kind: 'item', id: 'a', price: 11000 },
      { kind: 'item', id: 'b', price: 22000 },
    ])
    // El deshacer devuelve el precio propio y quita el nuevo.
    expect(result.undo).toEqual({ overrides: [{ kind: 'item', id: 'b', price: 20000 }], remove: [{ kind: 'item', id: 'a' }] })
  })
})
