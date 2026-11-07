import { buildSection, flipNodes, type Section, type SectionNode } from './section'

/**
 * Secciones genéricas de perfil de PVC (mm): proporciones de un perfil europeo con cantos suaves,
 * rebaje, junquillo inclinado y burlete. Ancho y profundidad vienen del motor; el dibujo interior de la
 * sección es representativo, no el de una serie concreta: el motor no entrega secciones.
 */

export interface FrameSectionSpec {
  face: number
  depth: number
  /** Espesor del labio exterior (mm en profundidad). */
  lip: number
  /** Ancho del rebaje hacia el hueco. */
  rebate: number
}

/** Medidas de la hoja dentro del marco. */
export interface SashSectionSpec {
  face: number
  z0: number
  z1: number
  /** Cara interior del marco: la hoja monta sobre ella. */
  overlapZ: number
  /** Cuánto monta la hoja sobre la cara del marco (mm). */
  overlap: number
  /** Piso del rebaje de vidrio. */
  floorZ: number
  bead: number
}

const AO_DEEP = 0.42
const AO_MID = 0.68

export function frameNodes({ face: F, depth: D, lip: L, rebate: R }: FrameSectionSpec): SectionNode[] {
  const inner = F - R
  const groove = Math.min(F * 0.4, F - 14)
  return [
    { d: 0, z: 0, r: 1.8 },
    { d: groove - 1.1, z: 0 },
    { d: groove, z: 1, ao: AO_MID },
    { d: groove + 1.1, z: 0 },
    { d: F - 6, z: 0, r: 3 },
    { d: F, z: 6, r: 2 },
    { d: F, z: L, r: 0.8, ao: AO_MID },
    { d: inner, z: L, ao: AO_DEEP },
    { d: inner, z: D - 1.6, r: 0.7, ao: AO_MID },
    { d: inner - 2, z: D, r: 1 },
    { d: 5, z: D, r: 4 },
    { d: 0, z: D - 5, r: 4 },
  ]
}

/** Marco de corredera: canal entre dos labios; los rieles van aparte. */
export function slidingFrameNodes({ face: F, depth: D, lip, channel }: { face: number; depth: number; lip: number; channel: number }): SectionNode[] {
  return [
    { d: 0, z: 0, r: 1.8 },
    { d: F - 3, z: 0, r: 2 },
    { d: F, z: 3, r: 1.5 },
    { d: F, z: lip, r: 0.8, ao: AO_MID },
    { d: channel, z: lip, ao: AO_DEEP },
    { d: channel, z: D - lip, ao: AO_DEEP },
    { d: F, z: D - lip, r: 0.8, ao: AO_MID },
    { d: F, z: D - 3, r: 1.5 },
    { d: F - 3, z: D, r: 2 },
    { d: 5, z: D, r: 4 },
    { d: 0, z: D - 5, r: 4 },
  ]
}

export function sashNodes({ face: S, z0, z1, overlapZ, overlap, floorZ, bead }: SashSectionSpec): SectionNode[] {
  const step = S - bead - 1.2
  const groove = Math.max(overlap + 8, step * 0.5)
  return [
    { d: overlap, z: z0, r: 1 },
    { d: S - 5, z: z0, r: 3 },
    { d: S, z: z0 + 5, r: 2 },
    { d: S, z: floorZ, ao: AO_MID },
    { d: step, z: floorZ, ao: AO_DEEP },
    { d: step, z: z1 - 1, ao: AO_MID },
    { d: step - 1.2, z: z1, r: 0.8 },
    { d: groove + 1.1, z: z1 },
    { d: groove, z: z1 - 0.9, ao: AO_MID },
    { d: groove - 1.1, z: z1 },
    { d: 7, z: z1, r: 6 },
    { d: 0, z: z1 - 7, r: 6 },
    { d: 0, z: overlapZ, r: 1, ao: AO_MID },
    { d: overlap, z: overlapZ, ao: AO_DEEP },
  ]
}

/** Hoja de corredera: un bastidor con cantos suaves por ambos lados. */
export function slidingPanelNodes({ face: S, z0, z1, floorZ, bead }: { face: number; z0: number; z1: number; floorZ: number; bead: number }): SectionNode[] {
  const step = S - bead - 1
  return [
    { d: 0, z: z0 + 3, r: 2.5 },
    { d: 3, z: z0, r: 2.5 },
    { d: S - 4, z: z0, r: 2.5 },
    { d: S, z: z0 + 4, r: 2 },
    { d: S, z: floorZ, ao: AO_MID },
    { d: step, z: floorZ, ao: AO_DEEP },
    { d: step, z: z1 - 0.8, ao: AO_MID },
    { d: step - 1, z: z1, r: 0.6 },
    { d: 4, z: z1, r: 3 },
    { d: 0, z: z1 - 4, r: 3 },
  ]
}

/** Junquillo inclinado; `d` crece hacia el vidrio y `zFloor` queda sobre el burlete interior. */
export function beadNodes(width: number, zFloor: number, zTop: number): SectionNode[] {
  const rise = zTop - zFloor
  const nose = Math.min(2.4, rise * 0.25)
  return [
    { d: 0.4, z: zFloor, ao: AO_DEEP },
    { d: width - 0.4, z: zFloor, ao: AO_DEEP },
    { d: width, z: zFloor + nose, r: 0.9, ao: AO_MID },
    { d: width * 0.58, z: zFloor + rise * 0.72, r: 7 },
    { d: 3, z: zTop, r: 2.4 },
    { d: 0.4, z: zTop, r: 0.4, ao: AO_MID },
  ]
}

/** Burlete de vidrio: cuña blanda de `zFlat` (la cara que toca el vidrio) a `zBack`, que asoma `lip` mm al hueco. */
export function gasketNodes(edge: number, zFlat: number, zBack: number, lip = 1.8): SectionNode[] {
  const nodes: SectionNode[] = [
    { d: edge - 3.5, z: zFlat },
    { d: edge + lip, z: zFlat, r: 0.4 },
    { d: edge + 0.2, z: zBack, r: 0.5 },
    { d: edge - 3.5, z: zBack },
  ]
  return zBack > zFlat ? nodes : nodes.reverse()
}

/** Travesaño: T simétrica centrada en d = 0, con labio exterior y rebaje a cada lado. */
export function mullionNodes({ width: M, depth: D, lip: L, rebate: R }: { width: number; depth: number; lip: number; rebate: number }): SectionNode[] {
  const half = M / 2
  const stem = Math.max(half - R, Math.min(half, 6))
  return [
    { d: -half + 4, z: 0, r: 3 },
    { d: -1, z: 0 },
    { d: 0, z: 0.9, ao: AO_MID },
    { d: 1, z: 0 },
    { d: half - 4, z: 0, r: 3 },
    { d: half, z: 4, r: 2 },
    { d: half, z: L, r: 0.8, ao: AO_MID },
    { d: stem, z: L, ao: AO_DEEP },
    { d: stem, z: D - 3, r: 0.7, ao: AO_MID },
    { d: stem - 3, z: D, r: 2.5 },
    { d: -stem + 3, z: D, r: 2.5 },
    { d: -stem, z: D - 3, r: 0.7, ao: AO_MID },
    { d: -stem, z: L, ao: AO_DEEP },
    { d: -half, z: L, r: 0.8, ao: AO_MID },
    { d: -half, z: 4, r: 2 },
  ]
}

/** Barra de sección redondeada: travesaño móvil de hoja francesa, poste, acople. */
export function barNodes(width: number, z0: number, z1: number, radius = 2.5): SectionNode[] {
  const half = width / 2
  return [
    { d: -half, z: z0, r: radius },
    { d: half, z: z0, r: radius },
    { d: half, z: z1, r: radius },
    { d: -half, z: z1, r: radius },
  ]
}

/** Riel de corredera: lomo redondeado sobre el fondo del canal. `d` crece desde la base, `z` va centrada. */
export function railNodes(height: number, width: number): SectionNode[] {
  return [
    { d: 0, z: width / 2 + 2, ao: AO_DEEP },
    { d: 0, z: -width / 2 - 2, ao: AO_DEEP },
    { d: height * 0.3, z: -width / 2 },
    { d: height, z: -width / 2, r: width * 0.45 },
    { d: height, z: width / 2, r: width * 0.45 },
    { d: height * 0.3, z: width / 2 },
  ]
}

export function sectionOf(nodes: SectionNode[], arcSteps: number, flip?: { zSum: number }): Section {
  return buildSection(flip ? flipNodes(nodes, flip.zSum) : nodes, { arcSteps })
}

/** Desplaza una sección en profundidad. */
export function shiftNodes(nodes: SectionNode[], dz: number): SectionNode[] {
  return nodes.map((node) => ({ ...node, z: node.z + dz }))
}
