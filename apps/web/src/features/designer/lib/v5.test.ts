import { afterEach, describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { createDesign, findNode, type Color, type LeafNode, type SplitNode, type TypologyId, type WindowDesign } from '@dekopen/engine'
import { compileMessage, messageParams, TRANSLATED_LOCALES } from '@dekopen/shared'
import { resetI18nForTests, setLocale } from '../../../lib/i18n'
import es from '../i18n/es'
import en from '../i18n/en'
import pt from '../i18n/pt'
import fr from '../i18n/fr'
import de from '../i18n/de'
import it_ from '../i18n/it'
import tr from '../i18n/tr'
import {
  OPENING_PRESETS,
  applyOpeningPreset,
  presetLabel,
  setFoldSide,
  setJointAction,
  setLeafUse,
  setPanelCount,
  setPassive,
  setPivot,
  setSequence,
  setSlide,
  setSystem,
  toggleFold,
} from './actions'
import { swatchAppearance, swatchTile } from './appearance'
import { measureDraft, parseMeasureExpression, readNumber } from './measure'
import { designCaption, openingDetail } from './text'
import { undoText } from './undo'

afterEach(() => resetI18nForTests())

const catalog = SAMPLE_CATALOG
const make = (t: TypologyId, width = 1200, height = 1200, lineId = 'serie-60'): WindowDesign =>
  createDesign(t, { lineId, width, height, colorId: 'blanco', glassId: 'dvh-4-12-4' })
const preset = (id: string) => OPENING_PRESETS.find((p) => p.id === id)!
const leaf = (d: WindowDesign, id: string) => findNode(d, id) as LeafNode

describe('aperturas v5', () => {
  it('pivotantes, osciloparalela y paralela desde los presets especiales', () => {
    const d = make('fixed')
    const id = d.root.id
    const pv = applyOpeningPreset(d, id, preset('pivot_v'))!
    expect(leaf(pv.design, id).opening).toEqual({ kind: 'pivot_v', direction: 'in', pivot: 0.5 })
    expect(pv.label).toBe('Apertura: Pivotante vertical')
    expect(pv.undo).toEqual({ key: 'opening', params: { opening: 'pivot_v' } })
    const psk = applyOpeningPreset(d, id, preset('tilt_slide'))!
    expect(leaf(psk.design, id).opening).toMatchObject({ kind: 'tilt_slide', slide: 'right' })
    expect(psk.label).toBe('Apertura: Osciloparalela (PSK)')
    const ps = applyOpeningPreset(d, id, preset('parallel_slide'))!
    expect(leaf(ps.design, id).opening.kind).toBe('parallel_slide')
    expect(OPENING_PRESETS.filter((p) => p.tier === 'special').map((p) => p.kind)).toEqual(['door', 'pivot_v', 'pivot_h', 'tilt_slide', 'parallel_slide'])
    expect(presetLabel(preset('casement_left'))).toBe('Abatible, bisagras a la izquierda')
    expect(presetLabel(preset('pivot_h'))).toBe('Pivotante horizontal')
  })

  it('manilla del oscilobatiente, deslizamiento, eje del pivote y uso de la hoja', () => {
    const d = make('tilt_turn')
    const id = d.root.id
    const seq = setSequence(d, id, 'tilt_first')!
    expect(leaf(seq.design, id).opening.sequence).toBe('tilt_first')
    expect(seq.label).toBe('Oscila primero')
    expect(setSequence(seq.design, id, 'tilt_first')).toBeNull()
    expect(leaf(setSequence(seq.design, id, 'turn_first')!.design, id).opening.sequence).toBeUndefined()

    const use = setLeafUse(d, id, 'balcony')!
    expect(leaf(use.design, id).opening.use).toBe('balcony')
    expect(use.label).toBe('Hoja de puerta balconera')
    expect(leaf(setLeafUse(use.design, id, 'window')!.design, id).opening.use).toBeUndefined()

    const psk = applyOpeningPreset(make('fixed'), make('fixed').root.id, preset('tilt_slide'))!
    const slid = setSlide(psk.design, psk.design.root.id, 'left')!
    expect(leaf(slid.design, slid.design.root.id).opening.slide).toBe('left')
    expect(slid.label).toBe('Desliza hacia la izquierda')

    const pv = make('pivot_v')
    const moved = setPivot(pv, pv.root.id, 0.3)!
    expect(leaf(moved.design, pv.root.id).opening.pivot).toBe(0.3)
    expect(moved.undo.key).toBe('pivot')
    expect(setPivot(moved.design, pv.root.id, 0.3)).toBeNull()
    expect(leaf(setPivot(pv, pv.root.id, 2)!.design, pv.root.id).opening.pivot).toBe(0.95)
  })

  it('unión plegable y francesa con hoja pasiva, ida y vuelta', () => {
    const d = make('casement_double', 1600, 1200)
    const split = d.root as SplitNode
    const folded = toggleFold(d, split.id)!
    expect((folded.design.root as SplitNode).joint).toBe('fold')
    expect((folded.design.root as SplitNode).children.every((c) => c.type === 'leaf' && c.opening.kind === 'folding')).toBe(true)
    expect(folded.label).toBe('Unión plegable')
    const side = setFoldSide(folded.design, (folded.design.root as SplitNode).children[0].id, 'right')!
    expect(side.label).toBe('Se pliega hacia la derecha')
    const french = setJointAction(folded.design, split.id, 'french')!
    const node = french.design.root as SplitNode
    expect(node.joint).toBe('french')
    expect(node.children.every((c) => c.type === 'leaf' && c.opening.kind === 'casement')).toBe(true)
    const passive = setPassive(french.design, split.id, 'right')!
    expect((passive.design.root as SplitNode).passive).toBe('right')
    expect(passive.label).toBe('Hoja pasiva a la derecha')
    expect(setJointAction(passive.design, split.id, 'mullion')!.label).toBe('Travesaño fijo')
  })

  it('corredera elevadora y hasta 6 hojas', () => {
    const d = make('sliding_2', 2400, 1200, 'serie-70-corredera')
    const lift = setSystem(d, 'lift_slide')!
    expect(lift.design.root.type === 'sliding' && lift.design.root.system).toBe('lift_slide')
    expect(lift.label).toBe('Corredera elevadora')
    const six = setPanelCount(d, 6)!
    expect(six.design.root.type === 'sliding' && six.design.root.panels).toHaveLength(6)
    expect(six.label).toBe('Corredera de 6 hojas')
  })
})

describe('etiquetas de deshacer por clave', () => {
  it('la clave no cambia con el idioma y el texto se vuelve a traducir', async () => {
    const d = make('fixed')
    const change = applyOpeningPreset(d, d.root.id, preset('casement_right'))!
    expect(change.label).toBe('Apertura: Abatible')
    await setLocale('en')
    expect(undoText(change.undo)).toMatch(/^Opening: /)
    const again = applyOpeningPreset(d, d.root.id, preset('casement_right'))!
    expect(again.undo).toEqual(change.undo)
    expect(undoText({ key: 'widthTo', params: { width: 1500 } })).toBe('Width 1,500 mm')
    expect(undoText({ key: 'widthTo', params: { width: 1500 } }, 'es')).toBe('Ancho 1.500 mm')
    expect(undoText({ key: 'rails', params: { rails: 1 } }, 'es')).toBe('Monorriel')
    await setLocale('de')
    expect(undoText({ key: 'rails', params: { rails: 3 } })).toBe('3 Laufschienen')
    expect(undoText(change.undo)).toBe('Öffnungsart: Drehflügel')
  })
})

describe('medidas en cualquier idioma', () => {
  it.each([
    ['1,200', 1200],
    ['1.200', 1200],
    ['1,200.5', 1200.5],
    ['1.200,5', 1200.5],
    ['1200.5', 1200.5],
    ['1200,5', 1200.5],
    ['12.5 cm', 125],
    ['1,25 m', 1250],
    ['1 200', 1200],
    ['1.200.000', 1200000],
  ])('«%s» = %d mm', (text, mm) => {
    expect(parseMeasureExpression(text)).toBe(mm)
  })

  it('rechaza números mal formados y escribe el borrador con el decimal del idioma', () => {
    expect(readNumber('1,2,3')).toBeNull()
    expect(readNumber('1.20.0')).toBeNull()
    expect(readNumber('12,')).toBeNull()
    expect(measureDraft(1200.5, 'es')).toBe('1200,5')
    expect(measureDraft(1200.5, 'en')).toBe('1200.5')
    expect(measureDraft(1200, 'de')).toBe('1200')
  })
})

describe('muestras de color realistas', () => {
  const color = (c: Partial<Color> & Pick<Color, 'id' | 'name' | 'hex'>): Color => c as Color

  it('madera con veta, texturas subidas por la API y lisos planos', () => {
    const oak = swatchAppearance(color({ id: 'x-oak', name: 'Roble dorado', hex: '#A8692E', texture: { kind: 'builtin', id: 'golden_oak' } }))
    expect(oak.finish).toBe('woodgrain')
    expect(oak.image).toMatch(/^data:image\/svg\+xml,/)
    const legacy = swatchAppearance(color({ id: 'nogal', name: 'Nogal', hex: '#5B3A22', texture: { kind: 'builtin', id: 'wood-walnut' } }))
    expect(legacy.finish).toBe('woodgrain')
    const byName = swatchAppearance(color({ id: 'n2', name: 'Nogal', hex: '#5B3A22' }))
    expect(byName.finish).toBe('woodgrain')
    const upload = swatchAppearance(color({ id: 'custom-1', name: 'Mi roble', hex: '#9B7B55', texture: { kind: 'upload', assetId: 'abc' } }))
    expect(upload.image).toBe('/api/textures/abc/image')
    expect(upload.custom).toBe(true)
    const white = color({ id: 'blanco', name: 'Blanco', hex: '#F6F5F1' })
    expect(swatchAppearance(white)).toEqual({ hex: '#F6F5F1', finish: 'smooth', custom: false })
    expect(swatchAppearance(white)).toBe(swatchAppearance(white))
    expect(swatchTile('smooth', { hex: '#fff', light: '#fff', dark: '#000' })).toBeUndefined()
  })

  it('todos los colores del catálogo de ejemplo tienen una muestra válida', () => {
    for (const c of catalog.colors) {
      const look = swatchAppearance(c)
      expect(look.hex).toMatch(/^#[0-9a-f]{6}$/i)
      if (/nogal|roble/i.test(c.name)) expect(look.finish).toBe('woodgrain')
    }
  })
})

describe('textos del diseño', () => {
  it('leyenda y detalle de la apertura en español y en inglés', async () => {
    const d = make('sliding_2', 1500, 1200, 'serie-70-corredera')
    expect(designCaption(d)).toBe('Corredera 2 hojas · 1.500 × 1.200 mm')
    expect(openingDetail({ kind: 'casement', hinge: 'left', direction: 'in' })).toBe('Abatible, bisagras a la izquierda (vista interior)')
    expect(openingDetail({ kind: 'pivot_v', pivot: 0.3 })).toBe('Pivotante vertical, eje al 30 % desde la izquierda')
    expect(openingDetail({ kind: 'casement', hinge: 'right', direction: 'out' })).toBe('Abatible exterior, bisagras a la derecha (vista interior)')
    await setLocale('en')
    expect(designCaption(d)).toMatch(/· 1,500 × 1,200 mm$/)
    expect(openingDetail({ kind: 'tilt_turn', hinge: 'left', sequence: 'tilt_first' })).toMatch(/hinged on the left \(inside view\), tilts first$/)
  })
})

describe('traducciones del diseñador', () => {
  const all = { en, pt, fr, de, it: it_, tr } as const

  const flat = (tree: object, prefix = ''): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k
      if (typeof v === 'string') acc[key] = v
      else Object.assign(acc, flat(v as object, key))
      return acc
    }, {})

  const source = flat(es)

  it.each(TRANSLATED_LOCALES)('%s: mismas claves, mismos parámetros, mensajes válidos y traducidos', (locale) => {
    const target = flat(all[locale])
    expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort())
    let same = 0
    for (const [key, text] of Object.entries(source)) {
      const translated = target[key]
      expect(() => compileMessage(translated), `${locale}:${key}`).not.toThrow()
      expect(messageParams(translated).sort(), `${locale}:${key}`).toEqual(messageParams(text).sort())
      if (translated === text) same++
    }
    // Solo coinciden textos sin palabras (unidades, separadores) o términos idénticos en el idioma
    // (el portugués comparte muchos: «Forma», «Sistema», «Persiana», «Cancelar»…).
    expect(same, `${locale}: demasiados textos sin traducir`).toBeLessThan(Object.keys(source).length * 0.1)
  })
})
