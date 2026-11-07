import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG, matchMisPrecios, misPreciosRowKind, parseMisPreciosCsv } from '../src/index'

const CSV =
  '﻿ID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio\r\n' +
  '1;Perfiles de ejemplo;Perfil · Marco;S60-01NO;Marco 60;Serie 60 Practicable;NOGAL;$;CLP;41000,00\r\n' +
  '2;Perfiles de ejemplo;Perfil · Refuerzo;S60-R1;Refuerzo de marco;;;$;CLP;12000,00\r\n' +
  '3;Genéricos DEKOPEN;Herraje;FZ-BISAGRA-VENTANA;Bisagra de ventana 2D;;;$;CLP;2500,00\r\n' +
  '4;Vidrios de ejemplo;Vidrio;;DVH 4+12+4;;;$;CLP;35000,00\r\n' +
  '5;Perfiles de ejemplo;Perfil · Hoja;S60-02BL;Hoja de ventana 78;;BLANCO;$;CLP;1,00\r\n' +
  '6;Perfiles de ejemplo;Perfil · Hoja;ZZ-99;Perfil que no existe;;BLANCO;$;CLP;5000,00\r\n'

describe('matchMisPrecios', () => {
  it('convierte una lista subida en precios propios sobre el catálogo', () => {
    const result = matchMisPrecios(SAMPLE_CATALOG, parseMisPreciosCsv(CSV))
    expect(result.matched).toBe(4)
    expect(result.skipped).toBe(1)
    expect(result.unmatched.map((row) => row.code)).toEqual(['ZZ-99'])
    expect(result.overrides).toContainEqual({ kind: 'profile', id: 'serie-60.s60-01', colorId: 'nogal', price: 41000 })
    // El refuerzo sin color actualiza todos los colores de la línea.
    expect(result.overrides.filter((override) => override.id === 'serie-60.s60-r1')).toHaveLength(5)
    expect(result.overrides).toContainEqual({ kind: 'item', id: 'fz.bisagra-ventana', price: 2500 })
    expect(result.overrides).toContainEqual({ kind: 'glass', id: 'dvh-4-12-4', price: 35000 })
  })
})

describe('matchMisPrecios calza por tipo de fila', () => {
  it('una fila de herraje o accesorio jamás pisa el precio de un perfil', () => {
    // «S60-01» es el código del marco; aquí viene como herraje y como accesorio con otro precio.
    const csv =
      '\uFEFFID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio\r\n' +
      '1;Perfiles de ejemplo;Herraje · Hoja;S60-01;Manilla S60-01;;BLANCO;$;CLP;999,00\r\n' +
      '2;Perfiles de ejemplo;Accesorios · Accesorios;S60-01NO;Tapa S60-01 nogal;;NOGAL;$;CLP;888,00\r\n' +
      '3;Perfiles de ejemplo;;S60-01BL;Tornillo para S60-01;;BLANCO;$;CLP;777,00\r\n' +
      '4;Perfiles de ejemplo;Perfil · Marco;S60-01BL;Marco 60;;BLANCO;$;CLP;27500,00\r\n'
    const result = matchMisPrecios(SAMPLE_CATALOG, parseMisPreciosCsv(csv))
    const profileOverrides = result.overrides.filter((override) => override.kind === 'profile')
    expect(profileOverrides).toEqual([{ kind: 'profile', id: 'serie-60.s60-01', colorId: 'blanco', price: 27500 }])
    expect(result.unmatched.map((row) => row.id)).toEqual(['1', '2', '3'])
  })

  it('una fila de vidrio calza con vidrios y una de herraje con su artículo', () => {
    const csv =
      '\uFEFFID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio\r\n' +
      '1;Genéricos DEKOPEN;Herraje · Herraje;FZ-MANILLA-VENTANA;Manilla de ventana;;;$;CLP;3100,00\r\n' +
      '2;Vidrios de ejemplo;Vidrio · V.DVH;;DVH 5+12+5;;;$;CLP;41000,00\r\n'
    const result = matchMisPrecios(SAMPLE_CATALOG, parseMisPreciosCsv(csv))
    expect(result.overrides).toEqual(
      expect.arrayContaining([
        { kind: 'item', id: 'fz.manilla-ventana', price: 3100 },
        { kind: 'glass', id: 'dvh-5-12-5', price: 41000 },
      ]),
    )
    expect(misPreciosRowKind({ group: 'Herraje', subtype: 'Hoja', description: 'Manilla' })).toBe('item')
    expect(misPreciosRowKind({ group: '', subtype: '', description: 'Tornillo 3,9 x 19' })).toBe('item')
    expect(misPreciosRowKind({ group: 'Perfil', subtype: 'Marco', description: 'Marco 60' })).toBe('profile')
  })
})
