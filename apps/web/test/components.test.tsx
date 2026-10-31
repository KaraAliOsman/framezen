import './setup'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { FEATURE_COPY } from '@framezen/shared'
import { createQueryClient } from '../src/lib/queryClient'
import { Button, DataTable, NumberField, PlanGate, StatusPill, type DataTableColumn } from '../src/ui'

function withProviders(ui: React.ReactNode) {
  const client = createQueryClient()
  client.setQueryData(['me'], null)
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('NumberField', () => {
  function Size({ onSize }: { onSize?: (s: { width: number; height: number }) => void }) {
    const [w, setW] = useState<number | null>(1200)
    return (
      <>
        <NumberField aria-label="Ancho" value={w} onChange={setW} onSizeInput={onSize} min={200} max={6000} />
        <output data-testid="w">{w}</output>
      </>
    )
  }

  it('suma con flechas: 10 mm, y 100 mm con Shift', () => {
    render(<Size />)
    const input = screen.getByRole('spinbutton', { name: 'Ancho' })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getByTestId('w').textContent).toBe('1210')
    fireEvent.keyDown(input, { key: 'ArrowDown', shiftKey: true })
    expect(screen.getByTestId('w').textContent).toBe('1110')
  })

  it('acepta «1200x1500» y entrega ancho y alto', () => {
    const onSize = vi.fn()
    render(<Size onSize={onSize} />)
    const input = screen.getByRole('spinbutton', { name: 'Ancho' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1800x1300' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSize).toHaveBeenCalledTimes(1)
    expect(onSize).toHaveBeenCalledWith({ width: 1800, height: 1300 })
    fireEvent.blur(input)
    expect(onSize).toHaveBeenCalledTimes(1)
  })

  it('ajusta al mínimo sin regañar y muestra miles al salir', () => {
    render(<Size />)
    const input = screen.getByRole('spinbutton', { name: 'Ancho' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '50' } })
    fireEvent.blur(input)
    expect(screen.getByTestId('w').textContent).toBe('200')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '2.400' } })
    fireEvent.blur(input)
    expect(input.value).toBe('2.400')
  })
})

describe('StatusPill', () => {
  it('muestra el estado con texto, no solo color', () => {
    render(<StatusPill status="workshop" suffix="rev. B" />)
    expect(screen.getByText('En taller')).toBeTruthy()
    expect(screen.getByText(/rev\. B/)).toBeTruthy()
  })
})

describe('PlanGate', () => {
  it('con el plan correcto muestra la función tal cual', () => {
    render(withProviders(<PlanGate feature="purchasing" allowed><p>Orden de compra</p></PlanGate>))
    expect(screen.getByText('Orden de compra')).toBeTruthy()
    expect(screen.queryByText(FEATURE_COPY.purchasing.title)).toBeNull()
  })

  it('sin el plan explica, ofrece mejorar y deja ver la función (nunca un muro)', () => {
    render(withProviders(<PlanGate feature="stations" allowed={false}><p>Tablero</p></PlanGate>))
    expect(screen.getByText(FEATURE_COPY.stations.title)).toBeTruthy()
    expect(screen.getByText(FEATURE_COPY.stations.why)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Mejorar a Empresa/ })
    expect(link.getAttribute('href')).toBe('/ajustes/plan')
    expect(screen.getByText('Tablero')).toBeTruthy()
  })
})

describe('Button', () => {
  it('muestra el atajo y queda ocupado mientras carga', () => {
    render(
      <Button variant="primary" shortcut="a" loading>
        Agregar ventana
      </Button>,
    )
    const button = screen.getByRole('button', { name: /Agregar ventana/ })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(within(button).getByText('A')).toBeTruthy()
  })
})

describe('DataTable', () => {
  interface Row {
    id: string
    name: string
    total: number
  }
  const rows: Row[] = [
    { id: '1', name: 'Casa Pérez', total: 3000 },
    { id: '2', name: 'Oficina Ñuble', total: 1000 },
    { id: '3', name: 'Quincho', total: 2000 },
  ]
  const columns: DataTableColumn<Row>[] = [
    { id: 'name', header: 'Obra', value: (r) => r.name },
    { id: 'total', header: 'Total', value: (r) => r.total, align: 'right', footer: 'sum', format: (n) => `$${n}` },
  ]

  it('ordena por columna y suma al pie', () => {
    render(<DataTable caption="Obras" rows={rows} columns={columns} getRowId={(r) => r.id} />)
    expect(screen.getByText('$6000')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Total/ }))
    const body = screen.getAllByRole('row').slice(1, 4)
    expect(body.map((r) => r.textContent)).toEqual(['Oficina Ñuble$1000', 'Quincho$2000', 'Casa Pérez$3000'])
    expect(screen.getByRole('columnheader', { name: /Total/ }).getAttribute('aria-sort')).toBe('ascending')
  })

  it('avisa cuántas filas esconde el filtro y permite quitarlo', () => {
    const clear = vi.fn()
    render(
      <DataTable caption="Obras" rows={rows} columns={columns} getRowId={(r) => r.id} query="perez" onClearFilters={clear} noun={['obra', 'obras']} />,
    )
    expect(screen.getByText('Casa Pérez')).toBeTruthy()
    expect(screen.getByText('2 obras ocultas por filtros')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    expect(clear).toHaveBeenCalled()
  })

  it('edita en línea con Enter y confirma el valor', () => {
    const onCommit = vi.fn()
    const editable: DataTableColumn<Row>[] = [
      { id: 'name', header: 'Obra', value: (r) => r.name, edit: { type: 'text', onCommit } },
    ]
    render(<DataTable caption="Obras" rows={rows.slice(0, 1)} columns={editable} getRowId={(r) => r.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar Obra' }))
    const input = screen.getByRole('textbox', { name: 'Editar Obra' })
    fireEvent.change(input, { target: { value: 'Casa Pérez · Concepción' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith(rows[0], 'Casa Pérez · Concepción')
  })
})
