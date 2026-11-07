/*
 * Accesorios de los avatares: dónde se apoyan en el cuerpo (datos puros). El dibujo vive en
 * AccessoryArt.tsx. Diseño propio de DEKOPEN.
 *
 * Cada pieza se ancla al contorno REAL de la silueta en un ángulo (como la pastilla de
 * aprobación): un casco queda sobre la cabeza de un triángulo y de una cápsula por igual, y
 * acompaña al cuerpo cuando se encoge, respira o se funde.
 */
import type { AvatarAccessory } from '@dekopen/shared'

export interface AccessoryPartDef {
  /** ángulo del ancla en grados (0 = derecha, 90 = abajo, −90 = arriba) */
  anchor: number
  /** distancia del ancla al contorno, en radios (negativo = hacia adentro del cuerpo) */
  out: number
  /** cuánto sigue a la cabeza (giro y alabeo de la mirada), 0 a 1 */
  follow: number
  /** detrás o delante del cuerpo */
  layer: 'back' | 'front'
  /** el dibujo se estira a lo ancho con la cabeza (vincha del audífono) */
  spanX?: boolean
  /** bajo este tamaño (px) la pieza no se dibuja: sería ruido */
  minSize: number
}

export interface AccessoryDef {
  id: AvatarAccessory
  parts: AccessoryPartDef[]
  /** accesorio de cara: sigue a los ojos (lentes) */
  face: 'glasses' | 'visor' | null
  /** espacio extra que pide en la caja, en radios: arriba, abajo y a cada lado */
  room: { top: number; bottom: number; side: number }
}

const none = { top: 0, bottom: 0, side: 0 }

export const ACCESSORIES: Record<AvatarAccessory, AccessoryDef> = {
  none: { id: 'none', parts: [], face: null, room: none },
  glasses: { id: 'glasses', parts: [], face: 'glasses', room: none },
  safety_glasses: { id: 'safety_glasses', parts: [], face: 'visor', room: none },
  hard_hat: {
    id: 'hard_hat',
    parts: [{ anchor: -90, out: -0.1, follow: 0.35, layer: 'front', minSize: 0 }],
    face: null,
    room: { top: 0.3, bottom: 0, side: 0.06 },
  },
  cap: {
    id: 'cap',
    parts: [{ anchor: -90, out: -0.08, follow: 0.35, layer: 'front', minSize: 0 }],
    face: null,
    room: { top: 0.22, bottom: 0, side: 0.1 },
  },
  headset: {
    id: 'headset',
    parts: [
      { anchor: -90, out: 0.02, follow: 0.2, layer: 'back', spanX: true, minSize: 0 },
      { anchor: 180, out: -0.06, follow: 0.2, layer: 'front', minSize: 0 },
      { anchor: 0, out: -0.06, follow: 0.2, layer: 'front', minSize: 0 },
    ],
    face: null,
    room: { top: 0.12, bottom: 0, side: 0.12 },
  },
  pencil: {
    id: 'pencil',
    parts: [{ anchor: -55, out: -0.16, follow: 0.25, layer: 'back', minSize: 24 }],
    face: null,
    room: { top: 0.2, bottom: 0, side: 0.12 },
  },
  tape_measure: {
    id: 'tape_measure',
    parts: [{ anchor: 58, out: -0.16, follow: 0.08, layer: 'front', minSize: 24 }],
    face: null,
    room: { top: 0, bottom: 0.1, side: 0.12 },
  },
  bow_tie: {
    id: 'bow_tie',
    parts: [{ anchor: 90, out: -0.12, follow: 0.12, layer: 'front', minSize: 0 }],
    face: null,
    room: { top: 0, bottom: 0.08, side: 0 },
  },
  leaf: {
    id: 'leaf',
    parts: [{ anchor: -90, out: -0.04, follow: 0.4, layer: 'front', minSize: 0 }],
    face: null,
    room: { top: 0.32, bottom: 0, side: 0 },
  },
}

export function accessoryDef(id: string | undefined): AccessoryDef {
  return (id && (ACCESSORIES as Record<string, AccessoryDef>)[id]) || ACCESSORIES.none
}
