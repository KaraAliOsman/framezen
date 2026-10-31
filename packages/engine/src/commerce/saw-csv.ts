import type { Color, OptimizationResult } from '../types'
import { roundHalfUp } from './format'

const BOM = '﻿'
const SEP = ';'
const EOL = '\r\n'

/** Número para planilla chilena: coma decimal, sin separador de miles. */
function csvNumber(n: number | undefined, fallback: number): string {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return String(roundHalfUp(value, 1)).replace('.', ',')
}

function csvText(text: string | undefined): string {
  const value = text ?? ''
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * CSV de corte para sierra o centro de corte: separador «;», BOM UTF-8 (abre bien en Excel)
 * y una fila por pieza en el orden de corte. Columnas: perfil, color, barra, orden, largo,
 * ángulo inicio, ángulo fin, etiqueta. Las barras se numeran por perfil (retazos primero).
 */
export function toSawCsv(optimization: OptimizationResult, colors: readonly Pick<Color, 'id' | 'name'>[] = []): string {
  const colorName = new Map(colors.map((c) => [c.id, c.name]))
  const rows: string[] = [['Perfil', 'Color', 'Barra', 'Orden', 'Largo (mm)', 'Ángulo inicio', 'Ángulo fin', 'Etiqueta'].join(SEP)]
  for (const group of optimization?.groups ?? []) {
    const color = group.colorId ? (colorName.get(group.colorId) ?? group.colorId) : ''
    group.bars.forEach((bar, barIndex) => {
      bar.cuts.forEach((cut, cutIndex) => {
        rows.push(
          [
            csvText(group.code),
            csvText(color),
            String(barIndex + 1),
            String(cutIndex + 1),
            csvNumber(cut.length, 0),
            csvNumber(cut.angleStart, 90),
            csvNumber(cut.angleEnd, 90),
            csvText(cut.label),
          ].join(SEP),
        )
      })
    })
  }
  return BOM + rows.join(EOL) + EOL
}
