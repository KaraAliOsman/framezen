import { describe, expect, it } from 'vitest'
import { codesByCut, consolidateItems, formatCodeRange, sideWords, workshopPieceCodes } from '../../src/workshop/helpers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkshopQr, workshopQrMatrix, workshopQrPath } from '../../src/workshop/qr'
import { sampleWorkshopData } from '../../src/workshop/sample'

describe('códigos de pieza', () => {
  const data = sampleWorkshopData()
  const v1 = data.windows.find((w) => w.ref === 'V1')!

  it('numera cada pieza física de la ventana y asigna su lado', () => {
    const units = workshopPieceCodes(v1)
    const total = v1.bom.cuts.reduce((s, c) => s + c.qty, 0)
    expect(units).toHaveLength(total)
    expect(units[0]).toMatchObject({ code: 'V1-M01', side: 'arr' })
    expect(units[1]).toMatchObject({ code: 'V1-M02', side: 'aba' })
    // Los códigos son únicos dentro de la ventana.
    expect(new Set(units.map((u) => u.code)).size).toBe(units.length)
  })

  it('el refuerzo hereda el código de la pieza que refuerza', () => {
    const units = workshopPieceCodes(v1)
    const frameSteel = units.filter((u) => u.piece.kind === 'reinforcement' && u.piece.nodeId === 'frame')
    expect(frameSteel.map((u) => u.member)).toEqual(['M01-R', 'M02-R', 'M03-R', 'M04-R'])
    const transomSteel = units.find((u) => u.piece.kind === 'reinforcement' && u.piece.label === 'trav')
    const transom = units.find((u) => u.piece.kind === 'profile' && u.piece.label === 'trav')
    expect(transomSteel?.member).toBe(`${transom?.member}-R`)
  })

  it('dos refuerzos distintos sobre hojas distintas no se confunden', () => {
    const v4 = data.windows.find((w) => w.ref === 'V4')!
    const units = workshopPieceCodes(v4)
    const steel = units.filter((u) => u.piece.kind === 'reinforcement' && u.piece.label === 'izq · der')
    expect(steel).toHaveLength(6) // marco + hoja izq. + hoja der.
    expect(new Set(steel.map((u) => u.member)).size).toBe(6)
  })

  it('agrupa códigos por fila y los resume', () => {
    const map = codesByCut(workshopPieceCodes(v1))
    expect(map.get(0)).toEqual(['M01', 'M02'])
    expect(formatCodeRange(['M05', 'M06', 'M07', 'M08'])).toBe('M05–M08')
    expect(formatCodeRange(['M01', 'M02'])).toBe('M01 · M02')
    expect(formatCodeRange(['M01-R', 'M02-R'])).toBe('M01-R · M02-R')
  })
})

describe('lenguaje de taller', () => {
  it('expande los lados', () => {
    expect(sideWords('arr · aba')).toBe('arriba · abajo')
    expect(sideWords('izq;der')).toBe('izquierda · derecha')
    expect(sideWords('trav')).toBe('travesaño')
    expect(sideWords('guía')).toBe('guía')
  })

  it('consolida herrajes repetidos', () => {
    const data = sampleWorkshopData()
    const v1 = data.windows.find((w) => w.ref === 'V1')!
    const screws = consolidateItems(v1.bom.items).filter((i) => i.itemId === 'tornillo-ref')
    expect(screws).toHaveLength(1)
    expect(screws[0]?.qty).toBe(36)
  })
})

describe('QR síncrono', () => {
  it('dibuja el QR con un solo trazado que cubre exactamente los módulos oscuros', () => {
    const value = 'FZ:OT38:V2-M03:U2'
    const m = workshopQrMatrix(value)
    const svg = renderToStaticMarkup(createElement(WorkshopQr, { value, size: '27mm', margin: 2 }))
    // Fondo + un trazado; ningún <rect> por tramo (con miles de etiquetas el HTML pesaba 4 veces más).
    expect(svg.match(/<rect /g)).toHaveLength(1)
    expect(svg.match(/<path /g)).toHaveLength(1)
    const d = /<path d="([^"]+)"/.exec(svg)![1]
    expect(d).toBe(workshopQrPath(m, 2))
    // Se vuelve a pintar el trazado sobre una cuadrícula: debe dar la misma matriz, sin tramos repetidos.
    expect(d.replace(/M\d+ \d+h(\d+)v1h-\1z/g, '')).toBe('')
    const n = m.length
    const painted = Array.from({ length: n }, () => Array<boolean>(n).fill(false))
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let k = 0; k < Number(w); k++) {
        const row = painted[Number(y) - 2]
        expect(row[Number(x) - 2 + k]).toBe(false)
        row[Number(x) - 2 + k] = true
      }
    }
    expect(painted).toEqual(m)
  })

  it('genera la matriz con los patrones de posición en tres esquinas', () => {
    const m = workshopQrMatrix('FZ:OT38:V2-M03')
    const n = m.length
    expect(n).toBeGreaterThanOrEqual(21)
    expect((n - 17) % 4).toBe(0)
    const finderAt = (r: number, c: number) =>
      [0, 6].every((i) => m[r + i]?.slice(c, c + 7).every(Boolean)) && m[r + 3]?.slice(c + 2, c + 5).every(Boolean)
    expect(finderAt(0, 0)).toBe(true)
    expect(finderAt(0, n - 7)).toBe(true)
    expect(finderAt(n - 7, 0)).toBe(true)
    expect(finderAt(n - 7, n - 7)).toBe(false)
  })
})
