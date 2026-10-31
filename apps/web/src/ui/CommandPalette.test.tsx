import '../../test/setup'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommandPalette, type CommandGroup } from './CommandPalette'
import { StatusPill } from './Badge'

const groups: CommandGroup[] = [
  { heading: 'Ir a', items: [{ id: 'catalog', label: 'Catálogo', onSelect: () => {} }] },
]

describe('CommandPalette sin coincidencias', () => {
  it('con Marco: una línea compacta «Sin coincidencias…» y la sugerencia justo debajo', () => {
    render(<CommandPalette open onOpenChange={() => {}} groups={groups} onAsk={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nogal' } })
    const empty = screen.getByText('Sin coincidencias para «nogal».')
    expect(empty.className).not.toMatch(/py-8/)
    expect(screen.getByText(/Preguntarle a Marco/)).toBeTruthy()
    expect(screen.queryByText('Catálogo')).toBeNull()
  })

  it('sin Marco: explica que no hay nada y sugiere otra palabra', () => {
    render(<CommandPalette open onOpenChange={() => {}} groups={groups} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nogal' } })
    expect(screen.getByText('Nada por aquí. Prueba con otra palabra.')).toBeTruthy()
  })
})

describe('StatusPill', () => {
  it('el sufijo de versión no baja la opacidad (contraste AA): solo cambia el peso', () => {
    render(<StatusPill status="sent" suffix="versión A" />)
    const suffix = screen.getByText(/versión A/)
    expect(suffix.className).not.toMatch(/opacity/)
    expect(suffix.className).toContain('font-normal')
  })
})
