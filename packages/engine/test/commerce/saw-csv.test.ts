import { describe, expect, it } from 'vitest'
import { optimizeCuts } from '../../src/commerce/optimizer'
import { toSawCsv } from '../../src/commerce/saw-csv'

describe('toSawCsv', () => {
  it('separador «;», BOM UTF-8, coma decimal y una fila por pieza en orden de corte', () => {
    const plan = optimizeCuts(
      [
        { key: 'pro01|blanco', code: 'PRO01', colorId: 'blanco', length: 1006, qty: 2, label: 'V1 · arr', angleStart: 45, angleEnd: 45 },
        { key: 'pro01|blanco', code: 'PRO01', colorId: 'blanco', length: 554.5, qty: 1, label: 'V2 · izq; ojo' },
        { key: 'r1|', code: 'R1', length: 892, qty: 1, label: 'V1 · "ref"', angleStart: 90, angleEnd: 90 },
      ],
      { barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 },
    )
    const csv = toSawCsv(plan, [{ id: 'blanco', name: 'Blanco' }])
    expect(csv.startsWith('﻿')).toBe(true)
    const rows = csv.slice(1).split('\r\n')
    expect(rows.at(-1)).toBe('')
    expect(rows.slice(0, -1)).toEqual([
      'Perfil;Color;Barra;Orden;Largo (mm);Ángulo inicio;Ángulo fin;Etiqueta',
      'PRO01;Blanco;1;1;1006;45;45;V1 · arr',
      'PRO01;Blanco;1;2;1006;45;45;V1 · arr',
      'PRO01;Blanco;1;3;554,5;90;90;"V2 · izq; ojo"',
      'R1;;1;1;892;90;90;"V1 · ""ref"""',
    ])
  })

  it('un plan vacío deja solo el encabezado', () => {
    expect(toSawCsv({ groups: [], totalBars: 0, totalPieces: 0, yieldPct: 0, offcuts: [] })).toBe(
      '﻿Perfil;Color;Barra;Orden;Largo (mm);Ángulo inicio;Ángulo fin;Etiqueta\r\n',
    )
  })
})
