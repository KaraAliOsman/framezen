/*
 * Siluetas de los avatares. Los perfiles de blob, pebble, squircle, capsule, egg, hexagon,
 * drop, cloud y triangle vienen de bloub (https://github.com/jeremy-prt/bloub, Copyright (c)
 * 2026 Jérémy Perret, MIT — ver THIRD_PARTY_NOTICES.md). «blob», «star» y «window» son
 * diseño propio de DEKOPEN.
 *
 * Todas comparten los mismos 64 ángulos: pasar de una forma a otra es interpolar radios.
 */
import { AVATAR_SHAPES, type AvatarShape } from '@dekopen/shared'
import { FACE_FITS, type FaceFit } from './facefit-table'
import { TAU } from './math'
import {
  PROFILE_SAMPLES,
  hullOfCircles,
  normalizeProfile,
  profileFromPolygon,
  regularPolygonProfile,
  roundedRectProfile,
  superellipseProfile,
  unionOfCirclesProfile,
} from './shape'

export interface ShapeDef {
  id: AvatarShape
  /** perfil radial en reposo (radio de la bola = 1) */
  radii: number[]
  /** lleva alféizar bajo el cuerpo (forma «window») */
  sill: boolean
  /** dónde y de qué tamaño va la cara para que los ojos nunca se salgan (ver facefit.ts) */
  face: FaceFit
  /** el cuerpo ondula muy lento en reposo (solo «blob») */
  wobble: boolean
}

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU)

/** Huevo medido en el video de referencia de bloub (profiles.ts). */
const EGG = [
  0.8369, 0.8424, 0.8497, 0.8585, 0.8674, 0.8775, 0.8878, 0.8983, 0.9089, 0.9185, 0.9288, 0.9374, 0.9445, 0.9504, 0.9543,
  0.9559, 0.9555, 0.9519, 0.9466, 0.9389, 0.9302, 0.9193, 0.9085, 0.8969, 0.8852, 0.8734, 0.8625, 0.8513, 0.8411, 0.8325,
  0.8243, 0.8179, 0.8137, 0.8112, 0.8102, 0.8128, 0.8178, 0.8262, 0.8374, 0.8518, 0.8702, 0.8922, 0.9169, 0.9446, 0.9741,
  1.0023, 1.0267, 1.0433, 1.0481, 1.0393, 1.0216, 0.997, 0.9697, 0.9418, 0.9169, 0.8949, 0.876, 0.8604, 0.849, 0.8394,
  0.8337, 0.8314, 0.8305, 0.8326,
]

const circle = new Array<number>(PROFILE_SAMPLES).fill(1)

/** Blob: varias armónicas bajas; más irregular que el canto rodado y vivo en reposo. */
const blob = normalizeProfile(
  ANGLES.map((a) => 1 + 0.07 * Math.cos(2 * a + 0.9) + 0.045 * Math.cos(3 * a + 2.6) + 0.022 * Math.cos(5 * a + 1.3)),
  1.04,
)

/** Canto rodado: círculo deformado por dos armónicas bajas (bloub). */
const pebble = normalizeProfile(
  ANGLES.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)),
  1.02,
)

/** Squircle: superelipse n = 4,2 llevada a 1,15 en la diagonal (si no, se ve más chico). */
const squircle = normalizeProfile(superellipseProfile(4.2), 1.15)

/** Cápsula acostada (bloub). */
const capsule = profileFromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62), 0, 0)

/** Hexágono con vértices a los lados, aristas planas arriba y abajo (bloub). */
const hexagon = regularPolygonProfile(6, 1.04, 0.26, 0)

/** Gota: disco grande abajo, punta arriba (bloub). */
const drop = normalizeProfile(profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0), 1.04)

/** Nube: unión de bolas, ancha abajo y dos lóbulos arriba (bloub). */
const cloud = normalizeProfile(
  unionOfCirclesProfile([
    { x: -0.44, y: 0.2, r: 0.54 },
    { x: 0.46, y: 0.2, r: 0.5 },
    { x: 0.02, y: 0.3, r: 0.6 },
    { x: -0.24, y: -0.3, r: 0.48 },
    { x: 0.3, y: -0.24, r: 0.44 },
  ]),
  1.02,
)

/** Estrella suave de cinco puntas, una hacia arriba: puntas y valles redondeados. */
const star = ANGLES.map((a) => {
  const bump = ((1 + Math.cos(5 * (a + Math.PI / 2))) / 2) ** 2.2
  return 0.7 + (1.12 - 0.7) * bump
})

/** Triángulo con la punta arriba y esquinas muy redondeadas (bloub). */
const triangle = regularPolygonProfile(3, 1.12, 0.34, -90)

/**
 * Ventana (DEKOPEN): la misma idea que las otras formas, una silueta sólida con dos ojos. Lo que la
 * vuelve ventana es la proporción y el alféizar debajo; sin vidrio, sin cruz y sin manilla.
 */
const WINDOW_HW = 0.88
const WINDOW_HH = 0.93
const windowBody = roundedRectProfile(WINDOW_HW, WINDOW_HH, 0.44)

/** Alféizar, en radios de la bola. El cuerpo centrado deja el conjunto 0,15 más abajo. */
export const WINDOW_GEOMETRY = {
  sillHw: 1.06,
  sillTop: 1.03,
  sillHeight: 0.2,
  /** corrimiento vertical para centrar cuerpo + alféizar en la caja */
  centerY: 0.15,
} as const

const PROFILES: Record<AvatarShape, number[]> = {
  blob,
  circle,
  pebble,
  squircle,
  capsule,
  egg: EGG,
  hexagon,
  drop,
  cloud,
  star,
  triangle,
  window: windowBody,
}

function build(id: AvatarShape): ShapeDef {
  const radii = PROFILES[id]
  return {
    id,
    radii,
    sill: id === 'window',
    face: FACE_FITS[id],
    wobble: id === 'blob',
  }
}

export const SHAPES: Record<AvatarShape, ShapeDef> = Object.fromEntries(AVATAR_SHAPES.map((id) => [id, build(id)])) as Record<
  AvatarShape,
  ShapeDef
>

/** Perfiles crudos (para el solucionador de la cara y las pruebas). */
export const SHAPE_PROFILES: Readonly<Record<AvatarShape, readonly number[]>> = PROFILES

/** Forma por id; cualquier valor desconocido cae en el círculo (datos viejos nunca rompen). */
export function shapeDef(id: string | undefined): ShapeDef {
  return (id && (SHAPES as Record<string, ShapeDef>)[id]) || SHAPES.circle
}
