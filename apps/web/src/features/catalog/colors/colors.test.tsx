import { render } from '@testing-library/react'
import { diffTranslation, LOCALES, lookupMessage, messageKeys, messageParams, type MessageTree } from '@dekopen/shared'
import { describe, expect, it } from 'vitest'
import es from './i18n/es'
import { appearanceOf, factorToPct, fallbackBackground, guessBuiltinTexture, nameFromFileName, normalizeRotation, pctToFactor, shade } from './model'
import { TextureSwatch } from './TextureSwatch'

const modules = import.meta.glob<{ default: Record<string, unknown> }>('./i18n/*.ts', { eager: true })

describe('textos de colores y texturas en los 7 idiomas', () => {
  it('cada idioma tiene exactamente las claves del español, con los mismos parámetros', () => {
    for (const locale of LOCALES) {
      const dict = locale === 'es' ? es : modules[`./i18n/${locale}.ts`]?.default
      expect(dict, `falta ${locale}.ts`).toBeTruthy()
      if (locale === 'es') continue
      const diff = diffTranslation(es as never, dict as never)
      expect(diff.missing, `${locale}: faltan`).toEqual([])
      expect(diff.extra, `${locale}: sobran`).toEqual([])
      for (const key of messageKeys(es as never)) {
        const want = messageParams(lookupMessage(es as MessageTree, key)!).sort()
        const have = messageParams(lookupMessage(dict as MessageTree, key) ?? '').sort()
        expect(have, `${locale}: parámetros de ${key}`).toEqual(want)
      }
    }
  })
})

describe('apariencia de un color', () => {
  it('«Nogal» y «Roble dorado» se reconocen por el nombre como foliados de madera', () => {
    expect(guessBuiltinTexture('Nogal')?.id).toBe('nut_tree')
    expect(guessBuiltinTexture('Roble dorado')?.id).toBe('golden_oak')
    const wood = appearanceOf({ name: 'Roble dorado', hex: '#A8692E' })
    expect(wood.finish).toBe('woodgrain')
    expect(['builtin', 'family']).toContain(wood.source)
  })

  it('un color sin nombre conocido ni textura es liso', () => {
    const flat = appearanceOf({ name: 'Rojo teja', hex: '#A33B2C' })
    expect(flat.source).toBe('flat')
    expect(flat.tileUrl).toBeUndefined()
  })

  it('una textura subida usa la imagen de la API por id de asset', () => {
    const a = appearanceOf({ name: 'Mi veta', hex: '#8A5A2B', texture: { kind: 'upload', assetId: 'asset-1' } })
    expect(a.source).toBe('upload')
    expect(a.assetId).toBe('asset-1')
  })
})

describe('muestra de textura', () => {
  it('la madera se muestra con la proporción física de la veta (1:3), como el dibujo y el visor 3D', () => {
    const wood = { hex: '#A8692E', source: 'builtin' as const, tileUrl: 'data:image/webp;base64,AAAA', finish: 'woodgrain' as const, scaleMm: 500 }
    const { container } = render(<TextureSwatch appearance={wood} size={96} name="Roble" />)
    const style = (container.firstElementChild as HTMLElement).style
    const [w, h] = style.backgroundSize.split(' ').map((v) => parseFloat(v))
    expect(w / h).toBeCloseTo(3, 0)
  })

  it('una textura subida es cuadrada y un liso sin tesela usa el fondo de respaldo (nunca un círculo plano)', () => {
    const upload = { hex: '#8A5A2B', source: 'upload' as const, tileUrl: 'data:image/webp;base64,AAAA', finish: 'woodgrain' as const, scaleMm: 200 }
    const { container } = render(<TextureSwatch appearance={upload} size={64} />)
    const [w, h] = (container.firstElementChild as HTMLElement).style.backgroundSize.split(' ').map((v) => parseFloat(v))
    expect(w).toBe(h)
    expect(fallbackBackground({ hex: '#222222', finish: 'smooth' })).toBe('#222222')
    expect(fallbackBackground({ hex: '#A8692E', finish: 'woodgrain' })).toContain('repeating-linear-gradient')
  })
})

describe('utilidades', () => {
  it('nombre sugerido desde el archivo: limpia guiones y descarta nombres de cámara', () => {
    expect(nameFromFileName('roble_rustico-02.jpg')).toBe('Roble rustico 02')
    expect(nameFromFileName('IMG_2041.jpg')).toBeNull()
    expect(nameFromFileName('Captura de pantalla.png')).toBeNull()
    expect(nameFromFileName(undefined)).toBeNull()
  })

  it('recargo ↔ factor y giro normalizado', () => {
    expect(factorToPct(1.15)).toBe(15)
    expect(pctToFactor(15)).toBe(1.15)
    expect(pctToFactor(factorToPct(1.234)!)).toBeCloseTo(1.234, 2)
    expect(factorToPct(undefined)).toBeNull()
    expect(normalizeRotation(270)).toBe(-90)
    expect(normalizeRotation(-180)).toBe(180)
    expect(normalizeRotation(10.04)).toBe(10)
  })

  it('shade aclara y oscurece sin salirse de #RRGGBB', () => {
    expect(shade('#808080', 1)).toBe('#FFFFFF')
    expect(shade('#808080', -1)).toBe('#000000')
    expect(shade('rojo', 0.2)).toBe('rojo')
  })
})
