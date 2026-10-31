import QRCode from 'qrcode'

export type WorkshopQrLevel = 'L' | 'M' | 'Q' | 'H'

/** Matriz de módulos del QR (true = oscuro), generada de forma síncrona. */
export function workshopQrMatrix(value: string, level: WorkshopQrLevel = 'M'): boolean[][] {
  const qr = QRCode.create(value, { errorCorrectionLevel: level })
  const { size, data } = qr.modules
  const rows: boolean[][] = []
  for (let r = 0; r < size; r++) {
    const row: boolean[] = []
    for (let c = 0; c < size; c++) row.push(data[r * size + c] === 1)
    rows.push(row)
  }
  return rows
}

export interface WorkshopQrProps {
  value: string
  /** Tamaño en unidades CSS («26mm», 96…). */
  size: string | number
  level?: WorkshopQrLevel
  /** Zona de silencio en módulos (mínimo recomendado 2 en etiquetas con margen propio). */
  margin?: number
  title?: string
}

/**
 * Trazado SVG de los módulos oscuros: un rectángulo de 1 de alto por cada tramo horizontal
 * («M3 0h7v1h-7z»), ya desplazado por la zona de silencio. Un solo <path> por QR en vez de un
 * <rect> por tramo: con miles de etiquetas el documento pesa la cuarta parte y se arma (y se
 * imprime) varias veces más rápido, con el mismo dibujo.
 */
export function workshopQrPath(matrix: readonly (readonly boolean[])[], margin = 0): string {
  let d = ''
  matrix.forEach((row, y) => {
    let start = -1
    for (let x = 0; x <= row.length; x++) {
      const dark = x < row.length && row[x]
      if (dark && start < 0) start = x
      if (!dark && start >= 0) {
        d += `M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`
        start = -1
      }
    }
  })
  return d
}

/**
 * QR en SVG puro (fondo blanco + un trazado con los módulos oscuros), sin canvas ni promesas,
 * para que se renderice igual en el servidor (PDF) y en el navegador.
 */
export function WorkshopQr({ value, size, level = 'M', margin = 2, title }: WorkshopQrProps) {
  const matrix = workshopQrMatrix(value, level)
  const total = matrix.length + margin * 2
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? `Código QR: ${value}`}
      data-qr={value}
    >
      <rect width={total} height={total} fill="#FFFFFF" />
      <path d={workshopQrPath(matrix, margin)} fill="#000000" />
    </svg>
  )
}
