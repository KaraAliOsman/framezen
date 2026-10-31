import '../../../../test/setup'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '../../../ui'
import type { ChatEntry } from '../types'
import { MarcoMinimized, MarcoPanel, statusLine, type MarcoPanelProps } from './MarcoPanel'

function renderPanel(overrides: Partial<MarcoPanelProps> = {}) {
  const props: MarcoPanelProps = {
    entries: [],
    draft: '',
    busy: false,
    face: 'idle',
    statusText: 'Disponible',
    mode: { mode: 'local', reason: 'plan', credits: 0 },
    suggestions: ['Agrega una corredera de 1.500 × 1.200', 'Busca a Pérez'],
    mobile: false,
    greet: false,
    onDraft: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onUndo: vi.fn(),
    onApproval: vi.fn(),
    onMinimize: vi.fn(),
    onClose: vi.fn(),
    onReset: vi.fn(),
    onFocusChange: vi.fn(),
    onGreeted: vi.fn(),
    ...overrides,
  }
  render(
    <MemoryRouter>
      <TooltipProvider>
        <MarcoPanel {...props} />
      </TooltipProvider>
    </MemoryRouter>,
  )
  return props
}

const reply = (patch: Partial<ChatEntry>): ChatEntry => ({ id: 'a1', role: 'assistant', text: 'Listo.', at: 0, status: 'done', ...patch })

describe('MarcoPanel', () => {
  it('saluda con ideas según el contexto y las envía con un clic', () => {
    const props = renderPanel()
    expect(screen.getByRole('complementary', { name: 'Marco, tu asistente' })).toBeTruthy()
    expect(screen.getByText('Hola, soy Marco.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agrega una corredera de 1.500 × 1.200' }))
    expect(props.onSend).toHaveBeenCalledWith('Agrega una corredera de 1.500 × 1.200')
    // Modo local discreto con camino a Pro.
    expect(screen.getByText('Modo local')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver Pro' }).getAttribute('href')).toBe('/ajustes/plan')
  })

  it('Enter envía, Shift+Enter no; Esc minimiza', () => {
    const props = renderPanel({ draft: 'descuento 5%' })
    const input = screen.getByLabelText('Mensaje para Marco')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(props.onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onSend).toHaveBeenCalledWith('descuento 5%')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(props.onMinimize).toHaveBeenCalled()
  })

  it('mientras trabaja, el botón es «Detener» y la entrada sigue disponible', () => {
    const props = renderPanel({ busy: true, face: 'working', draft: 'otra cosa', entries: [reply({ status: 'pending', text: '', steps: [{ id: 's', label: 'Agregando la ventana…', done: false }] })] })
    const input = screen.getByLabelText('Mensaje para Marco') as HTMLTextAreaElement
    expect(input.disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Detener' }))
    expect(props.onStop).toHaveBeenCalled()
    expect(screen.getByText('Agregando la ventana…')).toBeTruthy()
  })

  it('muestra recibos con «Deshacer» y la tarjeta de aprobación', () => {
    const props = renderPanel({
      entries: [
        { id: 'u1', role: 'user', text: 'agrega una corredera', at: 0 },
        reply({
          receipts: [
            { id: 'r1', text: 'Agregué V3 · Corredera 2 hojas 1.500 × 1.200 mm', undoable: true },
            { id: 'r2', text: 'Quité V1', undoable: false, undone: true },
          ],
          approval: { id: 'ok1', title: '¿Envío la cotización N° 7 a Juan Pérez?', lines: ['Por correo a juan@correo.cl'], confirmLabel: 'Sí, enviar', status: 'pending' },
        }),
      ],
    })
    expect(screen.getByText('Agregué V3 · Corredera 2 hojas 1.500 × 1.200 mm')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(props.onUndo).toHaveBeenCalledWith('r1')
    expect(screen.getByText('Deshecho')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, enviar' }))
    expect(props.onApproval).toHaveBeenCalledWith('a1', true)
  })

  it('flotando tiene alto propio; acoplado en la columna de ventanas ocupa todo su espacio', () => {
    renderPanel()
    const floating = screen.getByRole('complementary', { name: 'Marco, tu asistente' })
    expect(floating.hasAttribute('data-docked')).toBe(false)
    expect(floating.style.height).toContain('min(640px')
    cleanup()
    renderPanel({ docked: true })
    const docked = screen.getByRole('complementary', { name: 'Marco, tu asistente' })
    expect(docked.hasAttribute('data-docked')).toBe(true)
    expect(docked.style.height).toBe('')
    expect(docked.className).toContain('h-full')
    // Sigue siendo el mismo panel: saludo, ideas y entrada.
    expect(screen.getByText('Hola, soy Marco.')).toBeTruthy()
    expect(screen.getByLabelText('Mensaje para Marco')).toBeTruthy()
  })

  it('línea de estado y píldora minimizada', () => {
    expect(statusLine('working', [reply({ steps: [{ id: 's', label: 'Revisando el precio…', done: false }] })])).toBe('Revisando el precio…')
    expect(statusLine('approval', [])).toBe('Esperando tu visto bueno')
    expect(statusLine('thinking', [])).toBe('Pensando…')
    const onExpand = vi.fn()
    render(
      <TooltipProvider>
        <MarcoMinimized face="idle" statusText="Disponible" preview="Agregué V3" mobile={false} onExpand={onExpand} onClose={vi.fn()} />
      </TooltipProvider>,
    )
    expect(screen.getByText('Agregué V3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el panel de Marco' }))
    expect(onExpand).toHaveBeenCalled()
  })
})
