/**
 * Código QR en SVG puro (un solo trazado), síncrono y sin canvas: se ve igual en la vista previa y en
 * el PDF. El contenido es el enlace del portal que genera el servidor para la revisión emitida (sin
 * datos personales); la zona de silencio es de 4 módulos, como pide la norma.
 */
import QRCode from 'qrcode'

const cache = new Map<string, { size: number; path: string }>()

function qrPath(value: string): { size: number; path: string } {
  const hit = cache.get(value)
  if (hit) return hit
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
  const { size, data } = qr.modules
  let path = ''
  for (let y = 0; y < size; y++) {
    let start = -1
    for (let x = 0; x <= size; x++) {
      const dark = x < size && data[y * size + x] === 1
      if (dark && start < 0) start = x
      if (!dark && start >= 0) {
        path += `M${start + 4} ${y + 4}h${x - start}v1h-${x - start}z`
        start = -1
      }
    }
  }
  const out = { size: size + 8, path }
  if (cache.size > 64) cache.clear()
  cache.set(value, out)
  return out
}

/** ¿El valor sirve para un QR del portal? (solo http/https, largo acotado). */
export function isQrValue(value: string | undefined): value is string {
  return !!value && value.length <= 600 && /^https?:\/\/[^\s<>"']+$/i.test(value)
}

export function QrCode({ value, size, label, ink = '#111111' }: { value: string; size: number; label: string; ink?: string }) {
  if (!isQrValue(value)) return null
  let qr: { size: number; path: string }
  try {
    qr = qrPath(value)
  } catch {
    return null
  }
  return (
    <svg className="dkd-qr" width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={qr.size} height={qr.size} fill="#FFFFFF" />
      <path d={qr.path} fill={ink} />
    </svg>
  )
}
