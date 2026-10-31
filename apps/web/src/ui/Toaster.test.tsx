import '../../test/setup'
import { useRef, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TOP_TOAST_GAP, useToastArea } from './Toaster'

function Area({ gap, children }: { gap?: number; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useToastArea(ref, gap === undefined ? undefined : { gap })
  return <div ref={ref}>{children}</div>
}

const topVar = () => document.documentElement.style.getPropertyValue('--fz-toast-area-top')

describe('useToastArea', () => {
  it('los avisos de arriba bajan bajo la zona; gana la más interna (el lienzo dentro de <main>)', () => {
    const { rerender, unmount } = render(
      <Area>
        <Area gap={40} />
      </Area>,
    )
    // jsdom mide todo en 0: el valor publicado es solo la separación de la zona activa.
    expect(topVar()).toBe('40px')
    expect(document.documentElement.style.getPropertyValue('--fz-toast-area-x')).toBe('0px')

    rerender(<Area />)
    expect(topVar()).toBe(`${TOP_TOAST_GAP}px`)

    unmount()
    expect(topVar()).toBe('')
  })
})
