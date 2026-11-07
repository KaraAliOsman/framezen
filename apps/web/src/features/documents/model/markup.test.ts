import { describe, expect, it } from 'vitest'
import { RichTextSchema } from '@dekopen/shared'
import { applyMark, insertAt, markupToRichText, richTextToMarkup } from './markup'

describe('texto libre ↔ marcas simples', () => {
  it('ida y vuelta conserva títulos, viñetas, numeradas, negrita, cursiva y datos', () => {
    const text = ['## Condiciones', '', 'Hola {client.name}, esto es **importante** y *suave*.', '', '- Uno', '- Dos', '', '1. Primero', '2. Segundo'].join('\n')
    const doc = markupToRichText(text)
    expect(RichTextSchema.safeParse(doc).success).toBe(true)
    expect(richTextToMarkup(doc)).toBe(text)
  })

  it('el AST siempre sale de richTextFromPlain: nunca HTML (lo que parece etiqueta queda como texto)', () => {
    const doc = markupToRichText('<script>alert(1)</script> **x**')
    const flat = JSON.stringify(doc)
    expect(flat).not.toContain('"type":"script"')
    expect(richTextToMarkup(doc)).toContain('<script>')
  })

  it('vacío o ausente da texto vacío', () => {
    expect(richTextToMarkup(undefined)).toBe('')
    expect(richTextToMarkup(null)).toBe('')
  })

  it('negrita y cursiva envuelven la selección', () => {
    expect(applyMark('hola mundo', 5, 10, 'bold')).toEqual({ value: 'hola **mundo**', start: 7, end: 12 })
    expect(applyMark('hola mundo', 0, 4, 'italic')).toEqual({ value: '*hola* mundo', start: 1, end: 5 })
  })

  it('viñeta, numerada y título trabajan por línea y reemplazan el prefijo anterior', () => {
    expect(applyMark('uno\ndos', 0, 7, 'bullet').value).toBe('- uno\n- dos')
    expect(applyMark('uno\ndos', 0, 7, 'ordered').value).toBe('1. uno\n2. dos')
    expect(applyMark('- uno', 0, 5, 'heading').value).toBe('## uno')
    expect(applyMark('1. uno', 0, 6, 'bullet').value).toBe('- uno')
  })

  it('inserta un dato en el cursor y deja el cursor después', () => {
    expect(insertAt('Hola ', 5, 5, '{client.name}')).toEqual({ value: 'Hola {client.name}', caret: 18 })
    expect(insertAt('Hola XX!', 5, 7, '{org.name}').value).toBe('Hola {org.name}!')
  })
})
