import '../../test/setup'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { InspectorRow, InspectorSection } from './Inspector'
import { Meter } from './Meter'
import { Notice } from './Notice'
import { Numeric } from './Numeric'
import { NumberField } from './NumberField'
import { StatusDot, StatusPill } from './Badge'
import { Button } from './Button'
import { DekopenLogo, DekopenMark } from './DekopenLogo'
import { DEKOPEN_ICONS, OPENING_ICONS } from './icons'
import { THEME_TOKENS } from '../brand/tokens'

describe('Meter', () => {
  it('expone el valor como meter accesible y en «auto» pasa a aviso y a peligro según el consumo', () => {
    const { rerender } = render(<Meter label="Créditos" value={50} max={100} tone="auto" />)
    const meter = screen.getByRole('meter', { name: 'Créditos' })
    expect(meter.getAttribute('aria-valuenow')).toBe('50')
    expect((meter.firstElementChild as HTMLElement).className).toContain('bg-accent')
    rerender(<Meter label="Créditos" value={90} max={100} tone="auto" />)
    expect((screen.getByRole('meter').firstElementChild as HTMLElement).className).toContain('bg-warning-solid')
    rerender(<Meter label="Créditos" value={130} max={100} tone="auto" />)
    const bar = screen.getByRole('meter').firstElementChild as HTMLElement
    expect(bar.className).toContain('bg-danger')
    expect(bar.style.width).toBe('100%')
  })
})

describe('Notice', () => {
  it('los avisos de peligro y aviso se anuncian; los informativos son estado', () => {
    const { rerender } = render(<Notice tone="warning" title="Falta un precio" />)
    expect(screen.getByRole('alert').textContent).toContain('Falta un precio')
    rerender(<Notice tone="info">Precios actualizados</Notice>)
    expect(screen.getByRole('status').textContent).toContain('Precios actualizados')
  })
})

describe('NumberField', () => {
  const Field = () => {
    const [value, setValue] = useState<number | null>(40)
    return <NumberField aria-label="Margen" value={value} onChange={setValue} min={0} max={500} unit="%" />
  }

  it('escribir antes de que llegue la selección diferida no pierde la primera cifra', () => {
    const frames: FrameRequestCallback[] = []
    const raf = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => frames.push(cb)
    try {
      render(<Field />)
      const input = screen.getByRole('spinbutton', { name: 'Margen' }) as HTMLInputElement
      fireEvent.focus(input)
      input.setSelectionRange(2, 2)
      const type = (char: string) => {
        fireEvent.keyDown(input, { key: char })
        const start = input.selectionStart ?? 0
        const end = input.selectionEnd ?? 0
        fireEvent.change(input, { target: { value: input.value.slice(0, start) + char + input.value.slice(end) } })
      }
      type('1')
      expect(input.value).toBe('1')
      input.setSelectionRange(1, 1)
      frames.forEach((cb) => cb(0))
      expect(input.selectionStart).toBe(1)
      expect(input.selectionEnd).toBe(1)
      type('2')
      input.setSelectionRange(2, 2)
      type('0')
      expect(input.value).toBe('120')
    } finally {
      window.requestAnimationFrame = raf
    }
  })
})

describe('Inspector', () => {
  it('las secciones plegables cambian aria-expanded y esconden su contenido', () => {
    render(
      <InspectorSection title="Acabado" collapsible>
        <InspectorRow label="Vidrio">DVH 4/12/4</InspectorRow>
      </InspectorSection>,
    )
    const toggle = screen.getByRole('button', { name: 'Acabado' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('DVH 4/12/4')).toBeTruthy()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('DVH 4/12/4')).toBeNull()
  })

  it('las medidas usan cifras tabulares (dim) y los montos también', () => {
    render(
      <>
        <InspectorRow label="Medida" kind="mono">
          1.200 × 1.000 mm
        </InspectorRow>
        <Numeric size="total">$928.200</Numeric>
      </>,
    )
    expect(screen.getByText('1.200 × 1.000 mm').className).toContain('dim')
    const total = screen.getByText('$928.200')
    expect(total.className).toContain('tabular')
    expect(total.className).toContain('text-figure')
  })
})

describe('Estados', () => {
  it('cada estado de cotización lleva texto y glifo; el color tiñe el glifo, el texto queda legible', () => {
    render(<StatusPill status="accepted" />)
    const pill = screen.getByText('Aceptada')
    expect(pill.className).toContain('text-fg')
    expect(pill.querySelector('svg[aria-hidden]')?.getAttribute('class')).toContain('text-success')
  })

  it('StatusDot acompaña al texto y puede latir', () => {
    render(
      <StatusDot tone="accent" pulse>
        Escuchando
      </StatusDot>,
    )
    const dot = screen.getByText('Escuchando').querySelector('[aria-hidden]') as HTMLElement
    expect(dot.className).toContain('fz-breathe')
  })
})

describe('Button', () => {
  it('cargando: no acepta clics, avisa aria-busy y no se ve como deshabilitado', () => {
    render(
      <Button variant="primary" loading>
        Generando PDF
      </Button>,
    )
    const button = screen.getByRole('button', { name: /Generando PDF/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.className).toContain('disabled:aria-busy:opacity-80')
  })
})

describe('Marca', () => {
  it('el logotipo tiene nombre accesible y la marca es decorativa salvo que reciba título', () => {
    const { container } = render(
      <>
        <DekopenLogo />
        <DekopenMark size={16} />
        <DekopenMark size={32} tile title="DEKOPEN" />
      </>,
    )
    // Logotipo completo + marca con título: dos imágenes accesibles; la marca sin título no se anuncia.
    expect(screen.getAllByRole('img', { name: 'DEKOPEN' }).length).toBe(2)
    const marks = container.querySelectorAll('svg')
    expect(marks[0].getAttribute('aria-hidden')).toBe('true')
    expect(marks[2].getAttribute('aria-hidden')).toBe('true')
  })
})

describe('Íconos del rubro', () => {
  it('todos se dibujan como SVG de 24 con trazo de lucide y nombres únicos', () => {
    const names = new Set(DEKOPEN_ICONS.map((i) => i.name))
    expect(names.size).toBe(DEKOPEN_ICONS.length)
    for (const { Icon } of DEKOPEN_ICONS) {
      const { container, unmount } = render(<Icon strokeWidth={1.75} />)
      const svg = container.querySelector('svg') as SVGElement
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.getAttribute('stroke-width')).toBe('1.75')
      expect(svg.children.length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('hay un ícono para cada tipo de apertura del motor v5', () => {
    for (const kind of ['fixed', 'casement', 'tilt_turn', 'tilt', 'awning', 'sliding', 'lift_slide', 'tilt_slide', 'parallel_slide', 'pivot_v', 'pivot_h', 'folding', 'door']) {
      expect(OPENING_ICONS[kind as keyof typeof OPENING_ICONS]).toBeTruthy()
    }
  })
})

describe('Tokens', () => {
  it('la lista de tokens de tema incluye los nuevos y los alias heredados, sin repetidos', () => {
    expect(new Set(THEME_TOKENS).size).toBe(THEME_TOKENS.length)
    for (const token of ['--dk-canvas', '--dk-accent', '--dk-fg-muted', '--paper-0', '--ink-600', '--ok-800', '--sketch-glass-opacity']) {
      expect(THEME_TOKENS).toContain(token)
    }
  })
})
