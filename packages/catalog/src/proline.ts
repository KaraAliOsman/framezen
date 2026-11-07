/**
 * Datos verificados de Proline (OT N° 385 y plantilla del fabricante, ver
 * docs/research/06 y 11). Sobrescriben lo que el importador deduce de la pauta
 * de la distribuidora. Códigos de perfil sin color (PRO01, PRO-R1…).
 */
import type { BrandSettings, Line, Pauta, ProfileRole, TypologyId } from '@dekopen/engine'
import { VERIFIED_SOURCE_MARK } from './readiness'

export interface VerifiedLine {
  description: string
  depth?: number
  chambers?: number
  kind: Line['kind']
  pauta?: Pauta
  doorPauta?: Partial<Pauta>
  /** Pauta de la hoja interior cuando difiere de la exterior. */
  sashInPauta?: Partial<Pauta>
  /** Perfil por defecto de cada rol (código de modelo). */
  roles: Partial<Record<ProfileRole, string>>
  sashIn?: string
  /** Perfiles que pertenecen a la línea aunque la lista no lo diga. */
  models: string[]
  /**
   * Tipologías que la línea fabrica aunque la distribuidora no las publique como producto: las
   * compuestas que el motor arma con el travesaño de la propia línea (fijo + abatible, dos hojas…).
   */
  typologies?: TypologyId[]
  /**
   * Líneas de la misma marca cuyos herrajes y accesorios sirven cuando la lista no trae uno que
   * nombre a esta (PROSLD84 usa el carro de PROSLD70; PRO7005, el puente de PRO6004).
   */
  relatedLines?: string[]
  completeness?: Line['completeness']
  source?: string
}

/**
 * Fuente que ve cada taller en la ficha de la línea (`Line.source`). Nunca cita la orden de trabajo
 * con que se verificó (es de un tercero): solo dice que DEKOPEN la verificó, y `lineReadiness` lo
 * reconoce como evidencia.
 */
const VERIFIED = `Pauta de la distribuidora, ${VERIFIED_SOURCE_MARK}`
const VERIFIED_ONE = `Pauta de la distribuidora, ${VERIFIED_SOURCE_MARK} en una ventana real`

/**
 * Compuestas que el motor arma con travesaños (OT 385: V1 puerta + fijo, V7 dos hojas, V8 fijo +
 * hoja). La distribuidora solo publica las simples para PRO6004 y PRO7005, y sin esto la galería
 * ofrecía «Fijo + abatible» únicamente en PRO5003, que no tiene precios de perfiles.
 */
const COMPOUND_TYPOLOGIES: TypologyId[] = [
  'fixed_casement',
  'casement_double',
  'fixed_tilt_turn',
  'casement_transom',
  'fixed_awning_bottom',
  'fixed_3',
  'casement_fixed_casement',
  'door_transom',
  'door_sidelight',
]

export const PROLINE_LINES: Record<string, VerifiedLine> = {
  PRO6004: {
    description: 'Practicable 60 mm, 4 cámaras',
    depth: 60,
    chambers: 4,
    kind: 'casement',
    pauta: {
      weld: 3,
      frameDeduction: 44,
      sashWidth: 80,
      sashDeduction: 60,
      sashOverlap: 8,
      glassGap: 5,
      mullionDeduction: 20,
      // Plantilla PRO6004: doble hoja con separación 10 y batiente −56; solera a 13 de la cota.
      frenchGap: 10,
      frenchMullionDeduction: 56,
      thresholdGap: 13,
      reinforcement: { frame: 114, sash: 146, mullion: 20 },
    },
    doorPauta: { sashWidth: 110, sashDeduction: 90, reinforcement: { frame: 114, sash: 108, mullion: 20 } },
    roles: {
      frame: 'PRO01',
      sash: 'PRO521',
      door_sash: 'PRO04',
      mullion: 'PRO03',
      bead: 'PRO05',
      french_mullion: 'PRO12',
      threshold: '010120014',
      reinforcement: 'PRO-R1',
    },
    sashIn: 'PRO02',
    // Hoja interior PRO02 (OT 385 ítem 05): junquillo = nominal − 107, refuerzo = corte − 64,8.
    sashInPauta: { beadDeduction: 107, reinforcement: { sash: 64.8 } },
    models: ['PRO01', 'PRO02', 'PRO521', 'PRO03', 'PRO04', 'PRO10', 'PRO12', 'PRO05', 'PRO06', 'PRO08', '010120014'],
    typologies: COMPOUND_TYPOLOGIES,
    completeness: 'verified',
    source: VERIFIED,
  },
  PRO7005: {
    description: 'Practicable 70 mm, 5 cámaras',
    depth: 70,
    chambers: 5,
    kind: 'casement',
    // Hoja PRO716 (105 mm) tal como la usa la OT 385 en la oscilobatiente.
    pauta: {
      weld: 3,
      frameDeduction: 42,
      sashWidth: 105,
      sashDeduction: 57,
      sashOverlap: 7.5,
      glassGap: 5,
      mullionDeduction: 20,
      beadDeduction: 94.8,
      reinforcement: { frame: 27.8, sash: 58.5 },
    },
    roles: { frame: 'PRO711', sash: 'PRO716', door_sash: 'PRO716', mullion: 'PRO713', bead: 'PRO701', french_mullion: 'PRO717', reinforcement: 'PRO-R1' },
    models: ['PRO711', 'PRO712', 'PRO713', 'PRO715', 'PRO716', 'PRO717', 'PRO701', 'PRO700', 'PRO702'],
    typologies: COMPOUND_TYPOLOGIES,
    relatedLines: ['PRO6004'],
    completeness: 'verified',
    source: VERIFIED_ONE,
  },
  PRO5003: {
    description: 'Practicable 50 mm, 3 cámaras',
    depth: 50,
    chambers: 3,
    kind: 'casement',
    roles: {},
    models: ['PRO531', 'PRO533', 'PRO536', 'PRO500'],
  },
  PROSLD70: {
    description: 'Corredera 70 mm',
    depth: 70,
    kind: 'sliding',
    pauta: {
      weld: 3,
      frameDeduction: 52,
      sashWidth: 80,
      sashDeduction: 60,
      sashOverlap: 8,
      glassGap: 5,
      mullionDeduction: 20,
      reinforcement: { frame: 130, sash: 146 },
    },
    roles: { sliding_frame: 'PRO201', sliding_sash: 'PRO211', interlock: 'PRO204', bead: 'PRO703', guide: 'PRO271', mullion: 'PRO212', reinforcement: 'PRO-R5' },
    models: ['PRO201', 'PRO2011', 'PRO211', 'PRO212', 'PRO213', 'PRO204', 'PRO214', 'PRO231', 'PRO231K', 'PRO23', 'PRO703', 'PRO271'],
    completeness: 'verified',
    source: VERIFIED,
  },
  PROSLD84: {
    description: 'Corredera 84 mm',
    depth: 84,
    kind: 'sliding',
    // Cruce central observado 94 (cara vista de la hoja 80), traslapo 8,5 y holgura 4,8.
    pauta: {
      weld: 3,
      frameDeduction: 60,
      sashWidth: 94,
      sashDeduction: 60,
      sashOverlap: 8.5,
      glassGap: 4.8,
      mullionDeduction: 20,
      beadDeduction: 106.6,
      reinforcement: { frame: 27.8, sash: 65.3 },
    },
    roles: { sliding_frame: 'PRO20', sliding_sash: 'PRO21', interlock: 'PRO22', bead: 'PRO05', guide: 'PRO271', reinforcement: 'PRO-R7' },
    models: ['PRO20', 'PRO21', 'PRO22', 'PRO24', 'PRO25'],
    // OT 385 V4: «carro doble» y cremona E15 de corredera, los mismos artículos de PROSLD70.
    relatedLines: ['PROSLD70'],
    completeness: 'verified',
    source: VERIFIED_ONE,
  },
  PROSLD60: {
    description: 'Corredera 60 mm',
    depth: 60,
    kind: 'sliding',
    roles: { sliding_frame: 'PRO600', sliding_sash: 'PRO604', interlock: 'PRO606', bead: 'PRO07', reinforcement: 'PRO-R38' },
    models: ['PRO600', 'PRO604', 'PRO606', 'PRO07', 'PRO704'],
  },
  AMERICANPRO: {
    description: 'Corredera americana',
    kind: 'sliding',
    roles: { sliding_frame: '8201', sliding_sash: '8203', interlock: '8205', bead: '13010' },
    models: ['8201', '8203', '8204', '8205', '8206', '8207', '8211', '13010'],
  },
}

/**
 * Refuerzo de cada perfil según la OT 385 (prevalece sobre «PARA PROxx» de la lista).
 * PRO521 lleva PRO-R19 («Refuerzo Pro 521», hecho para esa hoja): la OT 385 lo corta en las hojas
 * de V7 (2 × 1.138). La OT mezcla R1 en algunos tramos de la misma hoja, pero el perfil tiene un
 * solo refuerzo y R19 es el del fabricante para PRO521 (el más caro de los dos: nunca falta acero).
 */
export const PROLINE_REINFORCEMENT: Record<string, string> = {
  PRO01: 'PRO-R1',
  PRO03: 'PRO-R1',
  PRO521: 'PRO-R19',
  PRO02: 'PRO-R1',
  PRO04: 'PRO-R4',
  PRO711: 'PRO-R1',
  PRO716: 'PRO-R6',
  PRO201: 'PRO-R5',
  PRO211: 'PRO-R18',
  PRO231: 'PRO-R9',
  PRO20: 'PRO-R7',
  PRO21: 'PRO-R18',
}

/** Línea de cada refuerzo Proline (por el perfil que refuerza). */
export const PROLINE_REINFORCEMENT_LINE: Record<string, string> = {
  'PRO-R1': 'PRO6004',
  'PRO-R2': 'PRO6004',
  'PRO-R3': 'PRO6004',
  'PRO-R4': 'PRO6004',
  'PRO-R8': 'PRO6004',
  'PRO-R10': 'PRO6004',
  'PRO-R11': 'PRO6004',
  'PRO-R12': 'PRO6004',
  'PRO-R13': 'PRO6004',
  'PRO-R17': 'PRO6004',
  'PRO-R19': 'PRO6004',
  'PRO-R6': 'PRO7005',
  'PRO-R5': 'PROSLD70',
  'PRO-R9': 'PROSLD70',
  'PRO-R14': 'PROSLD70',
  'PRO-R15': 'PROSLD70',
  'PRO-R16': 'PROSLD70',
  'PRO-R18': 'PROSLD70',
  'PRO-R21': 'PROSLD70',
  'PRO-R7': 'PROSLD84',
  'PRO-R38': 'PROSLD60',
  'PRO-R39': 'PROSLD60',
  'PRO-R41': 'PROSLD60',
  'PRO-R28': 'PRO5003',
}

/** Caras vistas acreditadas (mm). */
export const PROLINE_FACES: Record<string, number> = { PRO01: 64, PRO521: 80, PRO02: 80, PRO03: 80, PRO05: 19 }

/**
 * Ajustes base de Proline en el catálogo compartido: activa, despunte 0 y sierra 4, SIN descuentos.
 * El catálogo base lo hereda toda organización nueva: el descuento de compra es de cada taller
 * (lo carga en «Mis precios» de su organización) y nunca se versiona en el repositorio.
 */
export function prolineSettings(brandId: string): BrandSettings {
  return {
    brandId,
    enabled: true,
    trim: 0,
    kerf: 4,
    discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
  }
}
