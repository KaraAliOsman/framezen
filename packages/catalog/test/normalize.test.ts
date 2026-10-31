import { describe, expect, it } from 'vitest'
import {
  colorFromCode,
  isColorless,
  mapTypology,
  modelGroupKey,
  normalizeColor,
  profileModelCode,
  prolineToken,
  supplierFamily,
  TYPOLOGY_IDS,
} from '../src/index'

describe('normalizeColor', () => {
  it('lleva los alias de proveedor a la paleta canónica', () => {
    expect(normalizeColor('BLANCO')).toMatchObject({ id: 'blanco', name: 'Blanco', code: 'BL' })
    expect(normalizeColor('ROBLE DOR')).toMatchObject({ id: 'roble-dorado', name: 'Roble dorado' })
    expect(normalizeColor('golden oak').id).toBe('roble-dorado')
    expect(normalizeColor('JET BLACK').id).toBe('negro')
    expect(normalizeColor('NEW BLACK').id).toBe('negro')
    expect(normalizeColor('NEGRO MATE').id).toBe('negro-mate')
    expect(normalizeColor('GRIS METALIZADO').id).toBe('titanio')
    expect(normalizeColor('ROBLE MONTAÑA')).toMatchObject({ id: 'roble-montana', name: 'Roble montaña' })
    expect(normalizeColor('KOLONIAL').id).toBe('colonial')
    expect(normalizeColor('Winchester').hex).toBe('#7A4A2A')
  })

  it('crea colores nuevos con id estable y tono aproximado', () => {
    const color = normalizeColor('VERDE MUSGO')
    expect(color).toMatchObject({ id: 'verde-musgo', name: 'Verde musgo' })
    expect(color.hex).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('reconoce valores que no son color de perfil', () => {
    for (const value of ['', 'N/A', 'INCOLORO', 'Mate 10', 'SEPARADOR BRONCE/NATURAL', 'Vidrio']) expect(isColorless(value)).toBe(true)
    expect(isColorless('NOGAL')).toBe(false)
    expect(normalizeColor('').id).toBe('sin-color')
  })
})

describe('mapTypology', () => {
  const cases: [string, string | null][] = [
    ['Abatir Exterior', 'casement_out'],
    ['Abatir Interior', 'casement'],
    ['Oscilobatiente', 'tilt_turn'],
    ['Oscilante', 'tilt'],
    ['Proyectante', 'awning'],
    ['Proyectante Interior', 'awning'],
    ['Ventana Abatir Doble Exterior', 'casement_double'],
    ['Ventana Abatir Doble Interior Oscilobatiente', 'casement_double'],
    ['Corredera 2 Hojas Doble Riel', 'sliding_2'],
    ['Corredera 2 Hojas Doble Riel 1HF', 'sliding_2_fixed'],
    ['Corredera 2 Hojas 1HF Doble Riel Caracol', 'sliding_2_fixed'],
    ['Corredera 2 Hojas Doble Riel con PALILO', 'sliding_2'],
    ['Correderea 2 Hojas ZOCALO', 'sliding_2'],
    ['ALUM CORREDERA 2 HOJAS 90° 90° 1HF', 'sliding_2_fixed'],
    ['Corredera 3 Hojas Doble Riel', 'sliding_3'],
    ['Corredera 3 Hojas Dobre Riel 2Fijos', 'sliding_3'],
    ['Corredera 3 Hojas Triple Riel', 'sliding_3_rail'],
    ['Corredera 4 Hojas Doble Riel', 'sliding_4'],
    ['Corredera 6 Hojas Triple Riel', 'sliding_3_rail'],
    ['Corredera Monorriel', 'sliding_mono'],
    ['Corredera Monorriel 4 Hojas', 'sliding_mono'],
    ['Corredera Doble Vidrio Mosquitero', 'sliding_2'],
    ['Puerta Abatir EXTERIOR', 'door'],
    ['Puerta Abatir INTERIOR PASOLIBRE', 'door'],
    ['Puerta Abatir Doble EXTERIOR', 'door_double'],
    ['Puerta Abatir 2 Hojas Interior ZOCALO', 'door_double'],
    ['Puerta Abatir VAIVEN BAÑO EXTERIO', 'door'],
    ['ALUM-PUERTA ABATIR DOBLE INTERIOR TRAVESAÑO', 'door_double'],
    ['Fijo', 'fixed'],
    ['ALUM-FIJO', 'fixed'],
    ['FIJO SIN LATERAL', 'fixed'],
    ['MEDIO PUNTO', 'arch'],
    ['FIJO CON ARCADA', 'arch'],
    ['ALUM-MEDIO PUNTO 2 ARCADA', 'arch'],
    ['FIJO TRIANGULO', 'triangle'],
    ['Fijo Angulo Recto', 'triangle'],
    ['FIJO TRAPECIO', 'trapezoid'],
    ['Fijo Irregular Vertical', 'trapezoid'],
    ['Paño Fijo', 'fixed'],
    ['Ventana Hoja Abatible Interior', 'casement'],
    ['Corredera 3 Hojas Marco X (Hoja 80mm)', 'sliding_3'],
    ['Vano', null],
    ['Pared', null],
    ['Guillotina', null],
    ['MOSQUITERO ABATIR', null],
    ['TEMPLADO-FIJO', null],
    ['Vidrio Triangulo', null],
    ['Tipología…', null],
    ['', null],
  ]
  it.each(cases)('«%s» → %s', (name, expected) => {
    expect(mapTypology(name)).toBe(expected)
  })

  it('solo devuelve plantillas existentes', () => {
    for (const [name] of cases) {
      const id = mapTypology(name)
      if (id) expect(TYPOLOGY_IDS).toContain(id)
    }
  })

  it('clasifica la familia aunque no haya plantilla', () => {
    expect(supplierFamily('Guillotina 2Hojas Caracol')).toBe('sliding')
    expect(supplierFamily('Puerta Abatir Doble INTERIOR')).toBe('door')
    expect(supplierFamily('Vano')).toBe('none')
    expect(supplierFamily('Oscilobatiente')).toBe('casement')
  })
})

describe('códigos de modelo y color', () => {
  it('Proline: token PRO de la descripción (con ceros y refuerzos)', () => {
    expect(prolineToken('MARCO X 60/64 NEGRO PRO01 X 5.8')).toBe('PRO01')
    expect(prolineToken('JUNQUILLO PRO5 X 5.8')).toBe('PRO05')
    expect(prolineToken('REF. PRO-R7 22X52 PARA PRO20')).toBe('PRO-R7')
    expect(prolineToken('TAPA PROSLD70 BLANCO PRO231K')).toBe('PRO231K')
    expect(prolineToken('PERFIL SOLERA PRO6004')).toBeUndefined()
    expect(profileModelCode('Proline', '101300001', 'MARCO 60/64 PRO01', 'blanco')).toBe('PRO01')
    expect(colorFromCode('Proline', '101600033')).toBe('antracita')
    expect(colorFromCode('Proline', '102000001')).toBe('negro')
    expect(colorFromCode('Proline', 'PRO33NO')).toBe('nogal')
  })

  it('reglas numéricas por marca', () => {
    expect(profileModelCode('Kompen', '0201999-3154', 'HOJA', 'nogal')).toBe('0201999')
    expect(colorFromCode('Kompen', '0201999-7016')).toBe('antracita')
    expect(profileModelCode('TERMICO', '598765-4', 'Marco', 'antracita')).toBe('598765')
    expect(colorFromCode('TERMICO', '598765-2')).toBe('nogal')
    expect(profileModelCode('WINDOLINE', '13XY8803', 'Marco', 'antracita')).toBe('13XY88')
    expect(colorFromCode('WINDOLINE', '13XY8801')).toBe('nogal')
    expect(profileModelCode('Veratec', '12345VER153', 'Hoja', 'nogal')).toBe('12345VER')
    expect(profileModelCode('PENTECH', 'PVC9991NO6000', 'Marco', 'nogal')).toBe('PVC9991')
    expect(profileModelCode('Muchtek - Tecnocom', '987654100', 'Acople', 'nogal')).toBe('987654')
  })

  it('genérico: quita el sufijo de color según la columna Color', () => {
    expect(profileModelCode('Winsa', 'W-XX70-P7001-AN', 'Hoja', 'antracita')).toBe('W-XX70-P7001')
    expect(profileModelCode('Kunstherm', 'K7012NO', 'Hoja', 'nogal')).toBe('K7012')
    expect(profileModelCode('Kunstherm', 'K7012N', 'Hoja', 'negro')).toBe('K7012')
    expect(profileModelCode('Adopen', 'S900-03RD', 'Hoja', 'roble-dorado')).toBe('S900-03')
    expect(profileModelCode('REHAU', '512345.100', 'Marco', 'nogal')).toBe('512345')
    expect(profileModelCode('Winhouse', '', '716XX00106 Junquillo 17-20 mm', 'blanco')).toBe('716XX00106')
    expect(modelGroupKey('W-CD99-P1')).toBe(modelGroupKey('WCD99P1'))
  })
})
