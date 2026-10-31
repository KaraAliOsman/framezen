import { act, cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarcoAvatar } from './MarcoAvatar'

afterEach(cleanup)

describe('<MarcoAvatar>', () => {
  it('se monta en StrictMode con etiqueta accesible y frame pintado', () => {
    const { getByRole } = render(
      <StrictMode>
        <MarcoAvatar state="idle" size={40} title="Marco, tu asistente" />
      </StrictMode>,
    )
    const svg = getByRole('img', { name: 'Marco, tu asistente' })
    expect(svg.getAttribute('width')).toBe('40')
    const body = svg.querySelector('[data-marco="body"]')
    expect(body?.getAttribute('d')).toMatch(/^M.+Z$/)
    expect(svg.querySelector('[data-marco="eye-0"]')?.getAttribute('display')).toBe('inline')
  })

  it('sin título es decorativo', () => {
    const { container } = render(<MarcoAvatar state="thinking" size={24} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('usa ids únicos y válidos para url(#…) en cada instancia', () => {
    const { container } = render(
      <>
        <MarcoAvatar state="approval" size={32} />
        <MarcoAvatar state="approval" size={32} />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('[id]')).map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/)
  })

  it('la miniatura estática se repinta al cambiar de estado', () => {
    const { container, rerender } = render(<MarcoAvatar state="idle" size={20} animated={false} />)
    const pill = () => container.querySelector('[data-marco="pill"]')!
    expect(pill().getAttribute('display')).toBe('none')
    act(() => rerender(<MarcoAvatar state="approval" size={20} animated={false} />))
    expect(pill().getAttribute('display')).toBe('inline')
    expect(pill().getAttribute('fill')).toBe('#F0B429')
    act(() => rerender(<MarcoAvatar state="thinking" size={20} animated={false} />))
    expect(container.querySelector('[data-marco="dot-0"]')!.getAttribute('display')).toBe('inline')
  })

  it('acepta un color propio para el cuerpo', () => {
    const { container } = render(<MarcoAvatar state="idle" color="#0E0E10" animated={false} />)
    expect((container.querySelector('[data-marco="body"]') as SVGPathElement).style.fill).toMatch(/#0e0e10|rgb\(14, 14, 16\)/i)
  })
})
