import '../../test/setup'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { columnMinWidth, DataTable, fitColumns, type DataTableColumn } from './DataTable'

interface Row {
  id: string
  title: string
  client: string
  total: number
}

const rows: Row[] = [
  { id: '1', title: 'Casa Fuentes', client: 'María José Fuentes', total: 1000 },
  { id: '2', title: 'Edificio Los Aromos', client: 'Constructora Los Aromos SpA', total: 2000 },
]

// Igual que /cotizaciones: N°, obra (flexible), cliente 20 %, estado, unidades, total, actualizada y menú.
const quoteLike: DataTableColumn<Row>[] = [
  { id: 'number', header: 'N°', width: 64 },
  { id: 'title', header: 'Obra', value: (r) => r.title },
  { id: 'client', header: 'Cliente', width: '20%', hideBelow: 'lg' },
  { id: 'status', header: 'Estado', width: 150 },
  { id: 'units', header: 'Unidades', width: 96, hideBelow: 'lg' },
  { id: 'total', header: 'Total', width: 136 },
  { id: 'updated', header: 'Actualizada', width: 156, hideBelow: 'md' },
  { id: 'actions', header: '', width: 52 },
]

describe('DataTable · anchos', () => {
  it('ancho mínimo: el número fijo, 200 px la flexible, 120 px los porcentajes, o el que pidas', () => {
    expect(columnMinWidth({ width: 64 })).toBe(64)
    expect(columnMinWidth({})).toBe(200)
    expect(columnMinWidth({ width: '20%' })).toBe(120)
    expect(columnMinWidth({ minWidth: 240 })).toBe(240)
    expect(columnMinWidth({ width: 300, minWidth: 180 })).toBe(180)
  })

  it('si no caben, esconde primero las secundarias menos importantes (nunca aplasta la principal)', () => {
    // 1024 px con la barra lateral en iconos: ~902 px para la tabla.
    const tablet = fitColumns(quoteLike, { available: 902, viewport: 1024 })
    expect([...tablet.hidden].sort()).toEqual(['client', 'units'])
    expect(tablet.minWidth).toBe(64 + 200 + 150 + 136 + 156 + 52)
    expect(tablet.minWidth).toBeLessThanOrEqual(902)

    // Escritorio amplio: todo cabe.
    const desk = fitColumns(quoteLike, { available: 1300, viewport: 1440 })
    expect(desk.hidden.size).toBe(0)
    expect(desk.minWidth).toBe(64 + 200 + 120 + 150 + 96 + 136 + 156 + 52)
  })

  it('si ni sin secundarias cabe, la tabla mantiene su mínimo (se desplaza en horizontal)', () => {
    const narrow = fitColumns(quoteLike, { available: 500, viewport: 1024 })
    expect([...narrow.hidden].sort()).toEqual(['client', 'units', 'updated'])
    expect(narrow.minWidth).toBe(64 + 200 + 150 + 136 + 52)
  })

  it('las columnas que ya esconde la pantalla no cuentan, y sin medida no esconde nada', () => {
    const phone = fitColumns(quoteLike, { available: 700, viewport: 700 })
    expect(phone.hidden.size).toBe(0)
    expect(phone.minWidth).toBe(64 + 200 + 150 + 136 + 52)
    expect(fitColumns(quoteLike, { available: null, viewport: 1024 }).hidden.size).toBe(0)
    expect(fitColumns([{ id: 'a' }], { available: null, viewport: 1024, selectable: true }).minWidth).toBe(240)
  })

  it('aplica el mínimo a encabezados, celdas y a la tabla', () => {
    render(<DataTable caption="Obras" rows={rows} columns={quoteLike.slice(0, 2)} getRowId={(r) => r.id} />)
    const table = screen.getByRole('table')
    expect(table.style.minWidth).toBe('264px')
    const [numberHeader, titleHeader] = screen.getAllByRole('columnheader')
    expect(numberHeader.style.minWidth).toBe('64px')
    expect(titleHeader.style.minWidth).toBe('200px')
    expect(screen.getByText('Casa Fuentes').closest('td')?.style.minWidth).toBe('200px')
  })
})

describe('DataTable · filtros sin resultados', () => {
  const columns: DataTableColumn<Row>[] = [
    { id: 'title', header: 'Obra', value: (r) => r.title },
    { id: 'total', header: 'Total', value: (r) => r.total, align: 'right' },
  ]

  it('habla en humano según lo que lista y ofrece quitar los filtros', () => {
    const clear = vi.fn()
    render(
      <DataTable caption="Obras" rows={rows} columns={columns} getRowId={(r) => r.id} filter={() => false} onClearFilters={clear} noun={['cotización', 'cotizaciones']} />,
    )
    expect(screen.getByText('No hay cotizaciones con estos filtros.')).toBeTruthy()
    expect(screen.queryByText(/Ninguna fila/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    expect(clear).toHaveBeenCalled()
  })

  it('sin sustantivo dice «No hay nada con estos filtros.»; con búsqueda, «Sin resultados para…»', () => {
    const { unmount } = render(<DataTable caption="Obras" rows={rows} columns={columns} getRowId={(r) => r.id} filter={() => false} />)
    expect(screen.getByText('No hay nada con estos filtros.')).toBeTruthy()
    unmount()
    render(<DataTable caption="Obras" rows={rows} columns={columns} getRowId={(r) => r.id} query="quincho" />)
    expect(screen.getByText('Sin resultados para «quincho».')).toBeTruthy()
  })

  it('`emptyFiltered` reemplaza el texto por uno propio de la pantalla', () => {
    render(
      <DataTable
        caption="Obras"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        filter={() => false}
        emptyFiltered={<p>No tienes cotizaciones rechazadas.</p>}
      />,
    )
    expect(screen.getByText('No tienes cotizaciones rechazadas.')).toBeTruthy()
    expect(screen.queryByText(/con estos filtros/)).toBeNull()
  })
})
