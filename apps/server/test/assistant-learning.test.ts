import { describe, expect, it } from 'vitest'
import { acceptableNote, parseReview, worthReview } from '../src/services/assistant/learning'

describe('aprendizaje automático', () => {
  it('repasa al tiro ante una corrección y si no, cada varios mensajes', () => {
    expect(worthReview(1, 'no te dije que lo vuelvas así')).toBe(true)
    expect(worthReview(1, 'siempre con termopanel')).toBe(true)
    expect(worthReview(1, 'agrega una corredera')).toBe(false)
    expect(worthReview(4, 'agrega una corredera')).toBe(true)
    expect(worthReview(0, 'no')).toBe(false)
  })

  it('lee la respuesta del modelo sin confiar en su forma', () => {
    const review = parseReview('texto {"summary":"Hecho","add":[{"kind":"procedure","content":"Mover el parante"},{"kind":"raro","content":"Otro"},{"content":""}],"update":[{"index":1,"content":"x"},{"index":"2","content":"y"}],"remove":[3,"4"]} fin')
    expect(review).toEqual({
      summary: 'Hecho',
      add: [
        { kind: 'procedure', content: 'Mover el parante' },
        { kind: 'fact', content: 'Otro' },
      ],
      update: [{ index: 1, content: 'x' }],
      remove: [3],
    })
    expect(parseReview('sin json')).toBeNull()
  })

  it('no guarda más de cuatro recuerdos por repaso', () => {
    const add = Array.from({ length: 9 }, (_, i) => ({ kind: 'fact', content: `Dato ${i}` }))
    expect(parseReview(JSON.stringify({ add }))?.add).toHaveLength(4)
  })

  it('nunca acepta dinero, secretos ni enlaces', () => {
    expect(acceptableNote('Le dice paño a cada división de la ventana')).toBe(true)
    expect(acceptableNote('La V1 cuesta $401.600')).toBe(false)
    expect(acceptableNote('Cobra 150000 clp por instalar')).toBe(false)
    expect(acceptableNote('contraseña: 1234')).toBe(false)
    expect(acceptableNote('Revisa https://ejemplo.test/orden')).toBe(false)
  })
})
