/**
 * `TextureRef` (shared) se deriva de `Color.texture` (motor): no pueden separarse. Las aserciones
 * son de compilación (`npx tsc -p packages/catalog` las comprueba: este paquete ve a la vez el motor y
 * `@dekopen/shared`); la prueba en tiempo de ejecución confirma que los valores de ejemplo encajan.
 */
import type { Color, ColorFinish, ColorTexture } from '@dekopen/engine'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { BUILTIN_TEXTURE_IDS, textureRefSchema, TEXTURE_FINISHES, type BuiltinTextureId, type TextureFinish, type TextureRef } from '@dekopen/shared'

/** Igualdad estricta de tipos (no solo asignabilidad en un sentido). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const assertTrue = <T extends true>(): T | undefined => undefined

type EngineTexture = NonNullable<Color['texture']>

// 1. El tipo del motor de un color es `ColorTexture` (con ids de texto libre)…
assertTrue<Equal<EngineTexture, ColorTexture>>()
// 2. …y `TextureRef` es ese mismo tipo con los ids de la biblioteca integrada: se deriva de él.
assertTrue<Equal<TextureRef, ColorTexture<BuiltinTextureId>>>()
// 3. Todo `TextureRef` se guarda como `Color.texture` sin conversión (la dirección inversa necesita comprobar el id).
const stored: EngineTexture = {} as TextureRef
void stored
// 4. Lo demás no puede divergir: tipo de referencia, textura subida, escala, giro y acabado.
assertTrue<Equal<TextureRef['kind'], EngineTexture['kind']>>()
assertTrue<Equal<Extract<TextureRef, { kind: 'upload' }>, Extract<EngineTexture, { kind: 'upload' }>>>()
assertTrue<Equal<TextureRef['scaleMm'], EngineTexture['scaleMm']>>()
assertTrue<Equal<TextureRef['angleDeg'], EngineTexture['angleDeg']>>()
assertTrue<Equal<TextureRef['finish'], EngineTexture['finish']>>()
assertTrue<Equal<TextureRef['finish'], ColorFinish | undefined>>()
assertTrue<Equal<TextureFinish, ColorFinish>>()
assertTrue<Equal<(typeof TEXTURE_FINISHES)[number], ColorFinish>>()
// 5. El esquema de validación produce algo que el motor acepta.
const fromSchema: EngineTexture = {} as z.infer<typeof textureRefSchema>
void fromSchema

describe('TextureRef y Color.texture del motor', () => {
  it('la referencia integrada solo admite ids de la biblioteca; la del motor, cualquier texto', () => {
    const ok: TextureRef = { kind: 'builtin', id: BUILTIN_TEXTURE_IDS[0], scaleMm: 600, finish: 'woodgrain' }
    // @ts-expect-error: «no_existe» no es un id de la biblioteca integrada
    const bad: TextureRef = { kind: 'builtin', id: 'no_existe' }
    const loose: EngineTexture = { kind: 'builtin', id: 'no_existe' }
    expect([ok.kind, bad.kind, loose.kind]).toEqual(['builtin', 'builtin', 'builtin'])
  })

  it('un TextureRef cabe tal cual en un color del motor', () => {
    const texture: TextureRef = { kind: 'upload', assetId: 'asset-1', angleDeg: 90 }
    const color: Color = { id: 'c1', name: 'Roble', hex: '#8a5a2b', texture }
    expect(color.texture).toBe(texture)
  })
})
