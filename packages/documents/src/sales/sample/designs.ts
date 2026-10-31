import type { DesignNode, LeafNode, Opening, Shape, SlidingPanel, TypologyId, WindowDesign } from '@framezen/engine'

/**
 * Diseños de ejemplo para la galería de plantillas y las pruebas. No reemplazan a
 * las tipologías del motor: solo arman árboles plausibles para mostrar documentos.
 */

let seq = 0
const nid = (prefix: string) => `${prefix}${++seq}`

const leaf = (opening: Opening, fill: 'glass' | 'panel' = 'glass'): LeafNode => ({ id: nid('n'), type: 'leaf', opening, fill })
const fixed = () => leaf({ kind: 'fixed' })
const split = (dir: 'vertical' | 'horizontal', children: DesignNode[], sizes?: (number | null)[], joint?: 'mullion' | 'french'): DesignNode => ({
  id: nid('s'),
  type: 'split',
  dir,
  children,
  sizes: sizes ?? children.map(() => null),
  joint,
})
const panel = (kind: 'moving' | 'fixed', direction?: 'left' | 'right'): SlidingPanel => ({ id: nid('p'), kind, direction })
const sliding = (rails: 1 | 2 | 3, panels: SlidingPanel[]): DesignNode => ({ id: nid('r'), type: 'sliding', rails, panels })

export const SLIDING_TYPOLOGIES: TypologyId[] = ['sliding_2', 'sliding_2_fixed', 'sliding_3', 'sliding_3_rail', 'sliding_4', 'sliding_mono']

export function sampleTree(typologyId: TypologyId, width: number, height: number): { root: DesignNode; shape?: Shape } {
  seq = 0
  switch (typologyId) {
    case 'fixed':
      return { root: fixed() }
    case 'casement':
      return { root: leaf({ kind: 'casement', hinge: 'left', direction: 'in' }) }
    case 'casement_out':
      return { root: leaf({ kind: 'casement', hinge: 'left', direction: 'out' }) }
    case 'tilt_turn':
      return { root: leaf({ kind: 'tilt_turn', hinge: 'left', direction: 'in' }) }
    case 'tilt':
      return { root: leaf({ kind: 'tilt', direction: 'in' }) }
    case 'awning':
      return { root: leaf({ kind: 'awning', direction: 'out' }) }
    case 'casement_double':
      return { root: split('vertical', [leaf({ kind: 'casement', hinge: 'left' }), leaf({ kind: 'tilt_turn', hinge: 'right' })], undefined, 'french') }
    case 'fixed_casement':
      return { root: split('vertical', [fixed(), leaf({ kind: 'casement', hinge: 'right' })]) }
    case 'fixed_tilt_turn':
      return { root: split('vertical', [fixed(), leaf({ kind: 'tilt_turn', hinge: 'right' })]) }
    case 'casement_transom':
      return { root: split('horizontal', [fixed(), leaf({ kind: 'casement', hinge: 'left' })], [Math.round(height * 0.3), null]) }
    case 'fixed_awning_bottom':
      return { root: split('horizontal', [fixed(), leaf({ kind: 'awning', direction: 'out' })], [null, Math.round(height * 0.36)]) }
    case 'fixed_3':
      return { root: split('vertical', [fixed(), fixed(), fixed()]) }
    case 'casement_fixed_casement':
      return { root: split('vertical', [leaf({ kind: 'casement', hinge: 'left' }), fixed(), leaf({ kind: 'casement', hinge: 'right' })], [Math.round(width * 0.28), null, Math.round(width * 0.28)]) }
    case 'door':
      return { root: leaf({ kind: 'door', hinge: 'left', direction: 'in' }) }
    case 'door_double':
      return { root: split('vertical', [leaf({ kind: 'door', hinge: 'left' }), leaf({ kind: 'door', hinge: 'right' })], undefined, 'french') }
    case 'door_sidelight':
      return { root: split('vertical', [leaf({ kind: 'door', hinge: 'left' }), fixed()], [Math.round(width * 0.66), null]) }
    case 'door_transom':
      return { root: split('horizontal', [fixed(), leaf({ kind: 'door', hinge: 'right', direction: 'in' })], [Math.min(500, Math.round(height * 0.2)), null]) }
    case 'arch':
      return { root: fixed(), shape: { kind: 'arch', rise: Math.round(width * 0.35) } }
    case 'trapezoid':
      return { root: fixed(), shape: { kind: 'trapezoid', leftHeight: Math.round(height * 0.55), rightHeight: height } }
    case 'triangle':
      return { root: fixed(), shape: { kind: 'triangle', apex: 'center' } }
    case 'sliding_2':
      return { root: sliding(2, [panel('moving', 'right'), panel('moving', 'left')]) }
    case 'sliding_2_fixed':
      return { root: sliding(2, [panel('fixed'), panel('moving', 'left')]) }
    case 'sliding_3':
      return { root: sliding(2, [panel('moving', 'right'), panel('fixed'), panel('moving', 'left')]) }
    case 'sliding_3_rail':
      return { root: sliding(3, [panel('fixed'), panel('moving', 'left'), panel('moving', 'left')]) }
    case 'sliding_4':
      return { root: sliding(2, [panel('fixed'), panel('moving', 'right'), panel('moving', 'left'), panel('fixed')]) }
    case 'sliding_mono':
      return { root: sliding(1, [panel('fixed'), panel('moving', 'left')]) }
    default:
      return { root: fixed() }
  }
}

export interface SampleDesignInput {
  typologyId: TypologyId
  width: number
  height: number
  lineId: string
  colorId: string
  colorInId?: string
  glassId: string
}

export function sampleDesign(input: SampleDesignInput): WindowDesign {
  const tree = sampleTree(input.typologyId, input.width, input.height)
  return {
    version: 1,
    lineId: input.lineId,
    width: input.width,
    height: input.height,
    colorId: input.colorId,
    colorInId: input.colorInId,
    glassId: input.glassId,
    shape: tree.shape,
    root: tree.root,
  }
}
