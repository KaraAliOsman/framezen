// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditableText } from '../../src/base'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLDivElement | undefined

function mount() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  return (value: string) => act(() => root!.render(<EditableText value={value} field="intro" editable onChange={() => undefined} />))
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

describe('EditableText en pantalla', () => {
  it('deshacer siempre muestra el valor restaurado (el nodo se recrea por valor)', () => {
    const render = mount()
    render('Hola')
    const first = host!.querySelector('[data-field="intro"]') as HTMLElement
    // La persona escribe y confirma: el padre guarda «Hola, Carolina».
    first.textContent = 'Hola, Carolina'
    render('Hola, Carolina')
    const edited = host!.querySelector('[data-field="intro"]') as HTMLElement
    expect(edited).not.toBe(first)
    // Deshacer: vuelve «Hola» y se ve «Hola».
    render('Hola')
    expect(host!.querySelector('[data-field="intro"]')!.textContent).toBe('Hola')
  })

  it('una edición que no se aplicó se repone al volver a dibujar sin foco', () => {
    const render = mount()
    render('Hola')
    const el = host!.querySelector('[data-field="intro"]') as HTMLElement
    el.textContent = 'Texto que el padre ignoró'
    render('Hola')
    expect(host!.querySelector('[data-field="intro"]')!.textContent).toBe('Hola')
  })
})
