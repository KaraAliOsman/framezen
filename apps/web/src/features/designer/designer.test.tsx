import '../../../test/setup'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import { createDesign, findNode, type LeafNode, type SplitNode, type TypologyId, type WindowDesign } from '@framezen/engine'
import { TooltipProvider } from '../../ui/Tooltip'
import { DesignCanvas, DesignThumbnail, NodeInspector, TypologyPicker, WindowSettings } from './index'

const catalog = SAMPLE_CATALOG
const make = (t: TypologyId, width = 1200, height = 1200): WindowDesign =>
  createDesign(t, { lineId: t.startsWith('sliding') ? 'serie-70-corredera' : t.startsWith('door') ? 'serie-puerta-70' : 'serie-60', width, height, colorId: 'blanco', glassId: 'dvh-4-12-4' })

/** Lienzo controlado como lo usará el editor de cotizaciones. */
function Harness({ initial, onChange, readOnly }: { initial: WindowDesign; onChange?: (d: WindowDesign, label: string) => void; readOnly?: boolean }) {
  const [design, setDesign] = useState(initial)
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <TooltipProvider>
      <DesignCanvas
        design={design}
        catalog={catalog}
        selectedNodeId={selected}
        onSelect={setSelected}
        readOnly={readOnly}
        onChange={(next, label) => {
          onChange?.(next, label)
          setDesign(next)
        }}
      />
      <output data-testid="selected">{selected ?? ''}</output>
    </TooltipProvider>
  )
}

function clickHit(el: Element) {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(el, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
}

const canvasEl = (container: HTMLElement) => container.querySelector('[data-designer-canvas]') as HTMLElement
const cells = (container: HTMLElement) => [...container.querySelectorAll('[data-hit="cell"]')]

describe('DesignCanvas', () => {
  it('dibuja la ventana con sus cotas y un paño seleccionable por cada luz', () => {
    const { container } = render(<Harness initial={make('fixed_casement')} />)
    expect(container.querySelector('svg.fzd-drawing')).not.toBeNull()
    expect(cells(container)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Editar medida de 1.200 mm' })).toHaveLength(2)
    expect(container.querySelectorAll('[data-hit="mullion"]')).toHaveLength(1)
  })

  it('clic en un paño lo selecciona y muestra la barra contextual; Esc deselecciona', () => {
    const { container } = render(<Harness initial={make('fixed_casement')} />)
    const [first] = cells(container)
    clickHit(first)
    expect(screen.getByTestId('selected').textContent).toBe(first.getAttribute('data-node-id'))
    expect(first.getAttribute('aria-pressed')).toBe('true')
    const toolbar = screen.getByRole('toolbar')
    expect(within(toolbar).getByRole('group', { name: 'Apertura' })).toBeTruthy()
    fireEvent.keyDown(canvasEl(container), { key: 'Escape' })
    expect(screen.getByTestId('selected').textContent).toBe('')
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('la barra cambia la apertura y avisa con un texto para deshacer', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness initial={make('fixed_casement')} onChange={onChange} />)
    const [first] = cells(container)
    const id = first.getAttribute('data-node-id')!
    clickHit(first)
    fireEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Abatible, bisagras a la derecha' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const [next, label] = onChange.mock.calls[0]
    expect(label).toBe('Apertura: Abatible')
    expect((findNode(next, id) as LeafNode).opening).toEqual({ kind: 'casement', hinge: 'right', direction: 'in' })
  })

  it('en vista exterior el botón «bisagras a la izquierda» aplica la derecha interior', () => {
    const onChange = vi.fn()
    function Ext() {
      const [d, setD] = useState(make('fixed'))
      return (
        <TooltipProvider>
          <DesignCanvas design={d} catalog={catalog} view="exterior" selectedNodeId={d.root.id} onSelect={() => {}} onChange={(n, l) => (onChange(n, l), setD(n))} />
        </TooltipProvider>
      )
    }
    render(<Ext />)
    fireEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Abatible, bisagras a la izquierda' }))
    expect((onChange.mock.calls[0][0] as WindowDesign).root).toMatchObject({ opening: { kind: 'casement', hinge: 'right' } })
  })

  it('atajos: V divide el paño, Supr quita la división y la selección pasa al vecino', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness initial={make('fixed')} onChange={onChange} />)
    clickHit(cells(container)[0])
    const canvas = canvasEl(container)
    fireEvent.keyDown(canvas, { key: 'v' })
    expect(onChange.mock.calls.at(-1)?.[1]).toBe('Dividir en 2 (vertical)')
    expect(cells(container)).toHaveLength(2)
    // Selecciona el segundo paño y lo quita.
    clickHit(cells(container)[1])
    fireEvent.keyDown(canvas, { key: 'Delete' })
    expect(onChange.mock.calls.at(-1)?.[1]).toBe('Quitar división')
    expect(cells(container)).toHaveLength(1)
    expect(screen.getByTestId('selected').textContent).toBe(cells(container)[0].getAttribute('data-node-id'))
  })

  it('al quitar la división desde la barra, la selección pasa al paño que ocupa su lugar', () => {
    const { container } = render(<Harness initial={make('fixed', 1800, 1000)} />)
    clickHit(cells(container)[0])
    fireEvent.keyDown(canvasEl(container), { key: 'v', shiftKey: true })
    expect(cells(container)).toHaveLength(3)
    clickHit(cells(container)[2])
    fireEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Quitar división' }))
    expect(cells(container)).toHaveLength(2)
    expect(screen.getByTestId('selected').textContent).toBe(cells(container)[1].getAttribute('data-node-id'))
  })

  it('las flechas mueven la selección entre paños', () => {
    const { container } = render(<Harness initial={make('casement_fixed_casement', 1800, 1200)} />)
    const canvas = canvasEl(container)
    const ids = cells(container).map((c) => c.getAttribute('data-node-id'))
    fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    expect(screen.getByTestId('selected').textContent).toBe(ids[0])
    fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    expect(screen.getByTestId('selected').textContent).toBe(ids[1])
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' })
    expect(screen.getByTestId('selected').textContent).toBe(ids[0])
  })

  it('clic en una cota abre el editor en el lugar: «2400/2» + Enter cambia el ancho', () => {
    const onChange = vi.fn()
    render(<Harness initial={make('fixed', 1000, 1000)} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar medida de 1.000 mm' })[0])
    const input = screen.getByRole('textbox', { name: /Ancho total|Alto total/ })
    fireEvent.change(input, { target: { value: '2400/2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    const [next, label] = onChange.mock.calls[0]
    expect(next.width === 1200 || next.height === 1200).toBe(true)
    expect(label).toMatch(/^(Ancho|Alto) 1\.200 mm$/)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('Esc cancela la cota sin cambios; un texto que no se entiende avisa y no aplica', () => {
    const onChange = vi.fn()
    render(<Harness initial={make('fixed', 1000, 1000)} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar medida de 1.000 mm' })[0])
    let input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '1500' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar medida de 1.000 mm' })[0])
    input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'hola' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(/Escribe una medida/)).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cota parcial → medida del paño (setNodeSize)', () => {
    const onChange = vi.fn()
    render(<Harness initial={make('fixed_casement', 1200, 1200)} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar medida de 600 mm' })[0])
    const input = screen.getByRole('textbox', { name: 'Medida del paño' })
    fireEvent.change(input, { target: { value: '450' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const [next, label] = onChange.mock.calls[0]
    expect(label).toBe('Medida del paño')
    expect((next.root as SplitNode).sizes).toEqual([450, 750])
  })

  it('un montante enfocado se mueve con flechas (10 mm, 50 con Shift)', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness initial={make('fixed_casement', 1200, 1200)} onChange={onChange} />)
    const mullion = container.querySelector('[data-hit="mullion"]') as SVGElement
    expect(mullion.getAttribute('role')).toBe('slider')
    expect(mullion.getAttribute('aria-valuenow')).toBe('600')
    fireEvent.keyDown(mullion, { key: 'ArrowRight' })
    expect(onChange.mock.calls[0][1]).toBe('Mover travesaño')
    expect((onChange.mock.calls[0][0].root as SplitNode).sizes).toEqual([610, 590])
    fireEvent.keyDown(container.querySelector('[data-hit="mullion"]')!, { key: 'ArrowLeft', shiftKey: true })
    expect((onChange.mock.calls[1][0].root as SplitNode).sizes).toEqual([560, 640])
  })

  it('en correderas, clic en una hoja permite hacerla fija', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness initial={make('sliding_2', 1500, 1200)} onChange={onChange} />)
    clickHit(cells(container)[0])
    fireEvent.click(within(screen.getByRole('toolbar')).getByRole('button', { name: 'Hoja fija' }))
    expect(onChange.mock.calls[0][1]).toBe('Hoja fija')
    const root = onChange.mock.calls[0][0].root
    expect(root.type === 'sliding' && root.panels[0].kind).toBe('fixed')
  })

  it('muestra los avisos del despiece como marcador sobre el paño afectado', () => {
    // Paño fijo de más de 2,6 m² en termopanel → aviso de vidrio grande en ese paño.
    const { container } = render(<Harness initial={make('fixed', 2400, 1800)} />)
    const marker = container.querySelector('button[aria-label*="aviso"]')
    expect(marker).not.toBeNull()
    fireEvent.click(marker!)
    expect(screen.getByText(/m²|vidrio/i)).toBeTruthy()
  })

  it('solo lectura: sin selección, sin barra y sin cotas editables', () => {
    const { container } = render(<Harness initial={make('fixed_casement')} readOnly />)
    expect(cells(container)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Editar medida/ })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Vista' }) ?? screen.getByLabelText('Vista')).toBeTruthy()
  })
})

describe('TypologyPicker', () => {
  function renderPicker(onCreate = vi.fn()) {
    const onOpenChange = vi.fn()
    render(
      <TooltipProvider>
        <TypologyPicker open onOpenChange={onOpenChange} catalog={catalog} defaults={SAMPLE_DEFAULTS} onCreate={onCreate} />
      </TooltipProvider>,
    )
    return { onCreate, onOpenChange }
  }

  it('busca, elige con Enter y crea con Enter: 3 interacciones', () => {
    localStorage.clear()
    const { onCreate, onOpenChange } = renderPicker()
    const search = screen.getByRole('textbox', { name: 'Buscar tipología' })
    fireEvent.change(search, { target: { value: 'corredera 2' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.getByRole('button', { name: /Cambiar tipología \(Corredera 2 hojas\)/ })).toBeTruthy()
    const width = screen.getByRole('spinbutton', { name: 'Ancho' })
    expect((width as HTMLInputElement).value).toBe('1.500')
    fireEvent.submit(width.closest('form')!)
    expect(onCreate).toHaveBeenCalledTimes(1)
    const [design, meta] = onCreate.mock.calls[0]
    expect(meta).toEqual({ typologyId: 'sliding_2', qty: 1 })
    expect(design).toMatchObject({ width: 1500, height: 1200, lineId: 'serie-70-corredera', colorId: 'blanco', glassId: 'dvh-4-12-4' })
    expect(design.root.type).toBe('sliding')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('acepta «1800x1000» en el ancho y la cantidad', () => {
    const { onCreate } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Abatible' }))
    const width = screen.getByRole('spinbutton', { name: 'Ancho' })
    fireEvent.focus(width)
    fireEvent.change(width, { target: { value: '1800x1000' } })
    fireEvent.keyDown(width, { key: 'Enter' })
    const qty = screen.getAllByRole('spinbutton').find((el) => el.getAttribute('aria-valuenow') === '1')!
    fireEvent.focus(qty)
    fireEvent.change(qty, { target: { value: '3' } })
    fireEvent.submit(width.closest('form')!)
    const [design, meta] = onCreate.mock.calls[0]
    expect(design).toMatchObject({ width: 1800, height: 1000, lineId: 'serie-60' })
    expect(meta).toEqual({ typologyId: 'casement', qty: 3 })
  })

  it('elegir con clic y crear con Enter recuerda la tipología como reciente', () => {
    localStorage.clear()
    const { onCreate } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Puerta' }))
    fireEvent.submit(screen.getByRole('spinbutton', { name: 'Ancho' }).closest('form')!)
    expect(onCreate.mock.calls[0][0]).toMatchObject({ width: 900, height: 2100, lineId: 'serie-puerta-70' })
    expect(JSON.parse(localStorage.getItem('fz-designer-recent-typologies') ?? '[]')).toEqual(['door'])
  })
})

describe('WindowSettings y NodeInspector', () => {
  it('cambia medidas, color interior y extras con textos para deshacer', () => {
    const onChange = vi.fn()
    const design = make('casement', 600, 1000)
    render(
      <TooltipProvider>
        <WindowSettings design={design} catalog={catalog} onChange={onChange} />
      </TooltipProvider>,
    )
    const width = screen.getByRole('spinbutton', { name: 'Ancho' })
    fireEvent.focus(width)
    fireEvent.change(width, { target: { value: '750' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ width: 750 }), 'Cambiar ancho')
    fireEvent.click(screen.getByRole('switch', { name: 'Interior de otro color' }))
    expect(onChange.mock.calls.at(-1)?.[1]).toBe('Bicolor')
    expect(onChange.mock.calls.at(-1)?.[0].colorInId).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Mosquitero' }))
    expect(onChange.mock.calls.at(-1)?.[0].extras).toEqual({ screen: true })
  })

  it('el inspector del paño cambia la apertura; sin paño explica qué hacer', () => {
    const onChange = vi.fn()
    const design = make('fixed_casement')
    const leafId = (design.root as SplitNode).children[0].id
    const { rerender } = render(
      <TooltipProvider>
        <NodeInspector design={design} catalog={catalog} nodeId={leafId} onChange={onChange} />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Proyectante' }))
    expect(onChange.mock.calls[0][1]).toBe('Apertura: Proyectante')
    rerender(
      <TooltipProvider>
        <NodeInspector design={design} catalog={catalog} nodeId={null} onChange={onChange} />
      </TooltipProvider>,
    )
    expect(screen.getByText(/Elige un paño en el dibujo/)).toBeTruthy()
  })

  it('el inspector de una división edita las medidas a ejes', () => {
    const onChange = vi.fn()
    const design = make('fixed_casement', 1200, 1200)
    render(
      <TooltipProvider>
        <NodeInspector design={design} catalog={catalog} nodeId={design.root.id} onChange={onChange} />
      </TooltipProvider>,
    )
    const first = screen.getByRole('spinbutton', { name: 'Ancho del paño 1' })
    fireEvent.focus(first)
    fireEvent.change(first, { target: { value: '400' } })
    expect((onChange.mock.calls.at(-1)?.[0].root as SplitNode).sizes).toEqual([400, 800])
  })
})

describe('DesignThumbnail', () => {
  it('dibuja una miniatura proporcional y accesible', () => {
    const { container } = render(<DesignThumbnail design={make('door', 900, 2100)} catalog={catalog} size={40} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(Number(svg.getAttribute('height'))).toBe(40)
    expect(Number(svg.getAttribute('width'))).toBeLessThan(40)
  })

  it('reutiliza la geometría del mismo diseño', async () => {
    const design = make('fixed')
    const { cachedLayout } = await import('./DesignThumbnail')
    expect(cachedLayout(design, catalog)).toBe(cachedLayout(design, catalog))
    act(() => {})
  })
})
