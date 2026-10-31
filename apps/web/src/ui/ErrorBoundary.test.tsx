import '../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorBoundary, ZoneError } from './ErrorBoundary'

function Window({ id, broken }: { id: string; broken: ReadonlySet<string> }) {
  if (broken.has(id)) throw new TypeError("Cannot read properties of undefined (reading 'map')")
  return <p>Ventana {id}</p>
}

function Stage({ id, broken, onError }: { id: string; broken: ReadonlySet<string>; onError?: () => void }) {
  return (
    <div>
      <p>Lista de ventanas</p>
      <ErrorBoundary
        label="lienzo"
        resetKeys={[id]}
        onError={onError}
        fallback={({ reset }) => <ZoneError title="No pudimos dibujar esta ventana" onRetry={reset} actions={<button type="button">Eliminar ventana</button>} />}
      >
        <Window id={id} broken={broken} />
      </ErrorBoundary>
    </div>
  )
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('si la zona falla se pierde solo esa zona, con aviso y acciones', () => {
    const onError = vi.fn()
    render(<Stage id="V1" broken={new Set(['V1'])} onError={onError} />)
    expect(screen.getByText('Lista de ventanas')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('No pudimos dibujar esta ventana')
    expect(screen.getByRole('button', { name: 'Eliminar ventana' })).toBeTruthy()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('se reinicia al cambiar de ítem (resetKeys) y vuelve el aviso si el nuevo también falla', () => {
    const broken = new Set(['V1', 'V3'])
    const { rerender } = render(<Stage id="V1" broken={broken} />)
    expect(screen.queryByRole('alert')).toBeTruthy()

    rerender(<Stage id="V2" broken={broken} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Ventana V2')).toBeTruthy()

    rerender(<Stage id="V3" broken={broken} />)
    expect(screen.getByRole('alert').textContent).toContain('No pudimos dibujar esta ventana')
  })

  it('«Reintentar» vuelve a dibujar cuando el problema ya pasó', () => {
    const broken = new Set(['V1'])
    render(<Stage id="V1" broken={broken} />)
    broken.clear()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Ventana V1')).toBeTruthy()
  })
})
