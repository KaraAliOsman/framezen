import { describe, expect, it } from 'vitest'
import { parseCsv, parseDecimal, parseMisPreciosCsv, splitType } from '../src/index'

describe('parseCsv', () => {
  it('respeta BOM, CRLF, comillas y comillas dobladas', () => {
    const text = '﻿a;b;c\r\n1;"dos; con punto y coma";"dice ""hola"""\r\n\r\n3;;\r\n'
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'dos; con punto y coma', 'dice "hola"'],
      ['3', '', ''],
    ])
  })

  it('acepta otros separadores y la última fila sin salto', () => {
    expect(parseCsv('x,y\n1,2', ',')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ])
  })
})

describe('parseDecimal', () => {
  it('lee coma decimal, punto decimal y miles', () => {
    expect(parseDecimal('26528,00')).toBe(26528)
    expect(parseDecimal('1.234,5')).toBe(1234.5)
    expect(parseDecimal('55.3')).toBe(55.3)
    expect(parseDecimal('$ 1,10')).toBe(1.1)
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('abc')).toBeNaN()
  })
})

describe('parseMisPreciosCsv', () => {
  const text =
    '﻿ID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio\r\n' +
    '11;Andina;Perfil · Marco;AN1-BL;Marco 62 mm;Andina 60;BLANCO;$;CLP;21000,50\r\n' +
    '12;Andina;Herraje;H-1;"Brazo 10"" (254 mm); con nota";;;$;CLP;0,65\r\n' +
    '13;Andina;Accesorios;;;;;$;CLP;100,00\r\n' +
    '14;Andina;Perfil;AN2;Hoja;;;;;\r\n'

  it('lee las columnas por nombre, con columnas sin nombre y coma decimal', () => {
    const rows = parseMisPreciosCsv(text)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      id: '11',
      brand: 'Andina',
      type: 'Perfil · Marco',
      group: 'Perfil',
      subtype: 'Marco',
      code: 'AN1-BL',
      description: 'Marco 62 mm',
      line: 'Andina 60',
      color: 'BLANCO',
      currency: 'CLP',
      price: 21000.5,
    })
    expect(rows[1].description).toBe('Brazo 10" (254 mm); con nota')
    expect(rows[1].price).toBe(0.65)
    expect(rows[2]).toMatchObject({ code: 'AN2', price: 0, priceText: '' })
  })

  it('omite filas sin código ni descripción y tolera texto vacío', () => {
    expect(parseMisPreciosCsv('')).toEqual([])
    expect(parseMisPreciosCsv(text).some((row) => row.id === '13')).toBe(false)
  })

  it('detecta separador coma y cabeceras sin tildes', () => {
    const rows = parseMisPreciosCsv('ID,Marca,Tipo,Codigo,Descripcion,Linea,Color,Precio\n5,X,Herraje,C1,Cremona,,,1500\n')
    expect(rows[0]).toMatchObject({ code: 'C1', description: 'Cremona', price: 1500 })
  })

  it('divide el tipo en grupo y subtipo', () => {
    expect(splitType('Vidrio · V.DVH')).toEqual({ group: 'Vidrio', subtype: 'V.DVH' })
    expect(splitType('Instalación')).toEqual({ group: 'Instalación', subtype: '' })
  })
})
