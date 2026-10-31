import { describe, expect, it } from 'vitest'
import {
  chamberFromColor,
  inferUnit,
  isComplementProfile,
  isPlaceholderPrice,
  itemKind,
  parseBarLength,
  parseFace,
  parseGlass,
  parseInches,
  parseRange,
  profileFamily,
  repeatedPlaceholderValues,
  roleFor,
  rowStatus,
} from '../src/index'

describe('estado de filas y precios', () => {
  it('descarta marcadores de proveedor, comodines y basura', () => {
    expect(rowStatus('Marco viejo ** NO USAR **')).toBe('deprecated')
    expect(rowStatus('Hoja *** ELIMINAR ***')).toBe('deprecated')
    expect(rowStatus('Hoja', 'X1', 'Serie 9 ** DISCONTINUA **')).toBe('deprecated')
    expect(rowStatus('Tamaño de Vidrios Andina')).toBe('virtual')
    expect(rowStatus('Tamaño Junquillo')).toBe('virtual')
    expect(rowStatus('ssss')).toBe('junk')
    expect(rowStatus('dummy', 'DUMMY')).toBe('junk')
    expect(rowStatus('Marco practicable 62 mm')).toBe('ok')
  })

  it('reconoce precios de relleno', () => {
    expect(isPlaceholderPrice(1)).toBe(true)
    expect(isPlaceholderPrice(0.65)).toBe(true)
    expect(isPlaceholderPrice(0)).toBe(false)
    expect(isPlaceholderPrice(1500)).toBe(false)
    const repeated = repeatedPlaceholderValues([...Array(30).fill(12345), 1000, 2000, 3000])
    expect([...repeated]).toEqual([12345])
    expect(repeatedPlaceholderValues([1000, 1000, 2000]).size).toBe(0)
  })
})

describe('perfiles', () => {
  it('rol por la primera palabra de la descripción, con respaldo en el subtipo', () => {
    expect(profileFamily('Hoja', 'MARCO FIJO 60')).toBe('frame')
    expect(profileFamily('Marco', 'HOJA PUERTA EXT. 102')).toBe('door_sash')
    expect(profileFamily('Hoja', 'Hoja ventana exterior')).toBe('sash')
    expect(profileFamily('', 'REF. MULTIPLE 28X25')).toBe('reinforcement')
    expect(profileFamily('Complementario', 'Traslapo central')).toBe('interlock')
    expect(profileFamily('', 'Poste / Barra T')).toBe('mullion')
    expect(profileFamily('Unión', 'marco/marco')).toBe('coupler')
    expect(profileFamily('Complementario', 'Batiente doble hoja')).toBe('french_mullion')
    expect(profileFamily('', 'Perfil solera puerta')).toBe('threshold')
    expect(profileFamily('Junquillo', '12345 Junquillo 20 mm')).toBe('bead')
    expect(profileFamily('Complementario', 'Ensanche 30')).toBe('other')
    expect(profileFamily('Complementario', 'Yag traslapo')).toBe('interlock')
    expect(profileFamily('Palillo', 'Pilar / poste 703')).toBe('mullion')
    expect(roleFor('frame', 'sliding')).toBe('sliding_frame')
    expect(roleFor('sash', 'casement')).toBe('sash')
  })

  it('rótulas, adaptadores, tapas y mosquiteros nunca son estructura', () => {
    expect(profileFamily('Hoja', 'ROTULA ( 58) 406 BLANCO')).toBe('other')
    expect(profileFamily('Hoja', 'ADAPTADOR ROTULA 612 BLANCO')).toBe('other')
    expect(profileFamily('Marco', 'Tapa refuerzo')).toBe('other')
    expect(profileFamily('Hoja', 'Hoja mosquitero 813')).toBe('other')
    expect(profileFamily('Marco', 'Marco mosquitero 812 alum')).toBe('other')
    expect(profileFamily('Palillo', 'Barra T Mosquitero')).toBe('other')
    expect(profileFamily('Palillo', 'Travesaño Mosquitero')).toBe('other')
    expect(profileFamily('Hoja', 'Vierteaguas 409')).toBe('other')
    expect(profileFamily('Hoja', 'ALFEIZER-CORNIZA 414 / 120 x 60 x 8MM')).toBe('other')
    expect(profileFamily('Complementario', 'Perfil inversor 4ta hoja')).toBe('other')
    expect(isComplementProfile('Cubre cristal monoriel 819')).toBe(true)
    expect(isComplementProfile('Marco fijo 701 euro')).toBe(false)
  })

  it('un poste inversor o batiente es la unión de doble hoja, no un travesaño fijo', () => {
    expect(profileFamily('Palillo', 'Poste inversor / traslapo falso 604')).toBe('french_mullion')
    expect(profileFamily('Palillo', 'Poste batiente o inversor S60 X 3')).toBe('french_mullion')
    expect(profileFamily('Palillo', 'Poste inversor o batiente - (718CZ00011)')).toBe('french_mullion')
    expect(profileFamily('Palillo', 'Inversora Batiente')).toBe('french_mullion')
    expect(profileFamily('Palillo', 'Barra T')).toBe('mullion')
  })

  it('cara vista y largo de barra escritos en la descripción', () => {
    expect(parseFace('frame', 'MARCO DC 60/64 BLANCO')).toBe(64)
    expect(parseFace('sash', 'HOJA PTA. EXT. 102MM')).toBe(102)
    expect(parseFace('bead', 'JUNQUILLO 19/20-22')).toBe(19)
    expect(parseFace('other', 'ANGULO 100X60')).toBeUndefined()
    expect(parseBarLength('MARCO PRO01 X 5.8')).toBe(5800)
    expect(parseBarLength('Refuerzo 1,5 mm X 5,8')).toBe(5800)
    expect(parseBarLength('Junquillo 3 MTS')).toBe(3000)
    expect(parseBarLength('Hoja', 'PVC2221NO6000')).toBe(6000)
    expect(parseBarLength('Junquillo 6.5MM')).toBeUndefined()
  })
})

describe('herrajes y accesorios', () => {
  it('tipo de ítem', () => {
    expect(itemKind('Herraje', 'Cremona abatir E15 400-600')).toBe('hardware')
    expect(itemKind('Herraje', 'Tornillo autoperforante 3,9 x 19')).toBe('consumable')
    expect(itemKind('Accesorios', 'Calzo de acristalar 24x4')).toBe('accessory')
    expect(itemKind('Herraje', 'Plantilla aluminio para soldar')).toBe('other')
    expect(itemKind('Instalación', 'Espuma poliuretano')).toBe('consumable')
  })

  it('unidad y envase inferidos', () => {
    // Caja deducida por el precio: se usa para no cotizar $42.000 por tornillo, pero queda por confirmar.
    expect(inferUnit('Tornillo ref. autoperf. 3.9 X 19MM', 42000)).toMatchObject({ unit: 'caja', packSize: 1000, doubtful: expect.stringContaining('supuesta') })
    expect(inferUnit('Tornillo inst. PVC 7.5 X 122', 36000)).toMatchObject({ unit: 'caja', packSize: 200, doubtful: expect.stringContaining('supuesta') })
    expect(inferUnit('3.9x16 punta broca Caja/2000unds', 0)).toEqual({ unit: 'caja', packSize: 2000 })
    expect(inferUnit('Tornillo amo 3 80mm', 91)).toEqual({ unit: 'u' })
    expect(inferUnit('Tapa batiente blanca (PAR)', 700)).toEqual({ unit: 'par', packSize: 2 })
    expect(inferUnit('Kit ventana corredera 2 hojas', 0)).toEqual({ unit: 'kit' })
    expect(inferUnit('Silicona neutra blanca 310ML', 3000)).toEqual({ unit: 'cartucho' })
    expect(inferUnit('Felpa 5x7 rollo 250 m', 30000)).toEqual({ unit: 'm', packSize: 250 })
    expect(inferUnit('Felpa 5x7', 140)).toEqual({ unit: 'm' })
    expect(inferUnit('Bisagra 3D blanca', 9000)).toEqual({ unit: 'u' })
  })

  it('lo explícito no depende del precio y lo dudoso se marca', () => {
    // Rollo de referencia sin precio: conserva su largo.
    expect(inferUnit('Burlete EPDM rollo 100 m', 0)).toEqual({ unit: 'm', packSize: 100 })
    // Número entre paréntesis al final: candidato a envase, no se convierte solo.
    expect(inferUnit('Tapa poste inversor 709 blanca (10)', 573)).toEqual({ unit: 'u', doubtful: 'posible envase de 10' })
    // Un «metro» de felpa a $25.000 es un rollo sin largo escrito.
    expect(inferUnit('Felpa 7x6 gris', 25871)).toEqual({ unit: 'm', doubtful: 'precio de rollo sin largo' })
    expect(inferUnit('Tornillo autoperforante 3,9 X 19 caja 1000', 15000)).toEqual({ unit: 'caja', packSize: 1000 })
  })

  it('rangos de medida, entradas y pulgadas en los nombres', () => {
    expect(parseRange('Cremona abatir E25 1200- 1400')).toEqual({ min: 1200, max: 1400 })
    expect(parseRange('CREMONA ABA E25 1200-1201/1400 3B')).toEqual({ min: 1200, max: 1400 })
    expect(parseRange('CREMONA OB E15 920/801-1200MM')).toEqual({ min: 801, max: 1200 })
    expect(parseRange('Cremona corredera E15 1200')).toBeUndefined()
    expect(parseInches('Brazo proyección 16" 406 mm')).toBe(16)
    expect(parseInches('Brazo 10 PLG')).toBe(10)
  })
})

describe('vidrios', () => {
  it('interpreta DVH, laminados, templados y monolíticos', () => {
    expect(parseGlass('DVH  4+12+ 4')).toMatchObject({ name: 'DVH 4+12+4', kind: 'dvh', thickness: 20, composition: '4 + 12 cámara + 4', weightKgM2: 20 })
    expect(parseGlass('DVH 4+15Ar+ 4 Low-e')).toMatchObject({ kind: 'dvh', thickness: 23 })
    expect(parseGlass('DVH 4+6+4+6+4')).toMatchObject({ kind: 'dvh', thickness: 24 })
    expect(parseGlass('Laminado Inc. 6.38mm')).toMatchObject({ kind: 'laminated', thickness: 6.38 })
    expect(parseGlass('Templado 10mm')).toMatchObject({ kind: 'tempered', thickness: 10 })
    expect(parseGlass('Cristal Incoloro  4mm')).toMatchObject({ kind: 'mono', thickness: 4, name: 'Cristal Incoloro 4mm' })
    expect(parseGlass('Policarbonato 6mm')).toMatchObject({ kind: 'other' })
    expect(parseGlass('Panel de puerta antracita')).toBeUndefined()
    expect(parseGlass('Bisagra 3D')).toBeUndefined()
  })

  it('lee los DVH por capas: paños, cámaras, low-e, argón y laminados', () => {
    expect(parseGlass('DVH 6 Blue Green+12+4')).toMatchObject({ kind: 'dvh', thickness: 22, weightKgM2: 25, composition: '6 + 12 cámara + 4' })
    expect(parseGlass('DVH 8LamAcus+12+8LamAcus')).toMatchObject({ kind: 'dvh', thickness: 28, composition: '8 laminado acústico + 12 cámara + 8 laminado acústico' })
    const acoustic = parseGlass('DVH Lam. Acustico (4+4 Planitherm)+12+Lam, (5+5)')!
    expect(acoustic).toMatchObject({ kind: 'dvh', weightKgM2: 45 })
    expect(acoustic.thickness).toBeCloseTo(30.8, 1)
    expect(acoustic.composition).toBe('4+4 laminado low-e acústico + 12 cámara + 5+5 laminado')
    // «44.4» es un laminado 4+4 con cuatro PVB, no una placa de 44,4 mm.
    expect(parseGlass('DVH 44.4 FT (15 AIR) 44.4 FT Planitherm')).toMatchObject({ kind: 'dvh', thickness: 34, weightKgM2: 40 })
    expect(parseGlass('DVH  4+12 argon+6 Low-e')).toMatchObject({ thickness: 22, composition: '4 + 12 cámara argón + 6 low-e' })
    expect(parseGlass('DVH  4+10+4 Low-e con Argón')?.composition).toBe('4 + 10 cámara argón + 4 low-e')
    expect(parseGlass('DVH 4+6+4+6+4')).toMatchObject({ thickness: 24, weightKgM2: 30, composition: '4 + 6 cámara + 4 + 6 cámara + 4' })
    // Cámara sin medida: se conserva el vidrio, pero sin inventar el espesor.
    expect(parseGlass('DVH 6FT (Argon 90) 44.1')).toMatchObject({ kind: 'dvh', thickness: 0, weightKgM2: 35, doubtful: expect.stringContaining('cámara') })
    // «DVH 4+PVB+6» no trae cámara: es un laminado.
    expect(parseGlass('DVH 4+PVB+6 Arti Blue')).toMatchObject({ kind: 'laminated', thickness: 10.4, doubtful: expect.any(String) })
    // La cámara viene en la columna Color.
    expect(chamberFromColor('Mate 10')).toBe(10)
    expect(chamberFromColor('Bronce 11.5')).toBe(11.5)
    expect(parseGlass('DVH 4 + 4', chamberFromColor('Negro 8'))).toMatchObject({ kind: 'dvh', thickness: 16, weightKgM2: 20, composition: '4 + 8 cámara + 4' })
    // La masa de un laminado sale del vidrio, no del PVB.
    expect(parseGlass('Laminado Inc. 6.38mm')).toMatchObject({ weightKgM2: 15 })
    expect(parseGlass('Laminado 33.1 incoloro')).toMatchObject({ kind: 'laminated', thickness: 6.4, weightKgM2: 15 })
  })

  it('descarta lo que no es vidrio aunque venga en una lista de vidrios', () => {
    expect(parseGlass('PALETA ACRISTALAMIENTO ROJA (875400)')).toBeUndefined()
    expect(parseGlass('SILICONA MIRRORFIX PARA ESPEJO 310ML')).toBeUndefined()
    expect(parseGlass('SELLADOR TERMOPANEL HOTMELT')).toBeUndefined()
    expect(itemKind('Herraje', 'PALETA ACRISTALAMIENTO ROJA (875400)')).toBe('other')
  })
})
