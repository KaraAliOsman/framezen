/**
 * Foliado sobre una pieza: la pieza recorta una imagen compartida, repetida a mano.
 *
 * No usa `<pattern>` a propósito. Chromium no sabe llevar un patrón SVG a un PDF: rasteriza cada relleno
 * por separado, y como cada pieza tiene su propia veta, un documento de 40 ítems llegaba a pesar más de
 * 100 MB. Una misma `<image>` usada muchas veces, en cambio, viaja una sola vez y el recorte sigue siendo
 * vectorial. La tesela es periódica: los pequeños solapes entre repeticiones no se notan y evitan
 * líneas finas de antialias entre una y otra.
 */
import type { ReactNode } from 'react'
import { patternSize } from '../textures/defs'
import type { ColorAppearance } from '../textures/resolve'
import type { Pt } from './path'
import { polyPath } from './shading'

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** Solape entre repeticiones (mm). */
const OVERLAP = 0.5
/** Las superficies isótropas no necesitan su escala física: el grano no se resuelve a esta distancia. */
const ISOTROPIC_MIN_MM = 320
/** Tope de repeticiones por pieza: una barra muy larga con una tesela muy chica no debe disparar el SVG. */
const MAX_TILES = 24

export interface TileContext {
  uid: string
  /** Contador de recortes del dibujo. */
  n: number
}

/** Tamaño físico al que se dibuja una repetición. */
export function tileSize(a: ColorAppearance): { w: number; h: number } {
  const size = patternSize(a)
  if (a.grain !== 'none') return size
  const k = Math.max(1, ISOTROPIC_MIN_MM / Math.max(size.w, size.h))
  return { w: size.w * k, h: size.h * k }
}

/** Un polígono relleno con la tesela `tileId`, con la veta en `grain` grados. */
export function tiledPolygon(polygon: readonly Pt[], grain: number, seed: number, a: ColorAppearance, tileId: string, ctx: TileContext, key: string): ReactNode {
  const { w, h } = tileSize(a)
  const theta = (a.grain === 'none' ? 0 : grain) + a.angleDeg
  const rad = (-theta * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const [ax, ay] = polygon[0]
  const local = polygon.map(([x, y]) => {
    const dx = x - ax
    const dy = y - ay
    return [dx * cos - dy * sin, dx * sin + dy * cos] as Pt
  })
  const xs = local.map((p) => p[0])
  const ys = local.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX
  const spanY = maxY - minY
  // Fase estable por pieza; si la pieza cabe en una repetición, se elige una fase que no la corte.
  const fx = ((seed % 1009) / 1009) * Math.max(w - spanX, w * 0.999)
  const fy = (((seed >>> 10) % 1013) / 1013) * (spanY < h ? h - spanY : h)
  const x0 = minX - (spanX < w ? ((seed % 1009) / 1009) * (w - spanX) : fx)
  const y0 = minY - fy
  const nx = Math.min(MAX_TILES, Math.ceil((maxX - x0) / w))
  const ny = Math.min(MAX_TILES, Math.ceil((maxY - y0) / h))
  const clipId = `${ctx.uid}-c${ctx.n++}`
  const place = `translate(${r1(ax)} ${r1(ay)})${theta ? ` rotate(${r2(theta)})` : ''}`
  const uses: ReactNode[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      uses.push(<use key={`${i}-${j}`} href={`#${tileId}`} transform={`${place} translate(${r1(x0 + i * w)} ${r1(y0 + j * h)}) scale(${r1(w + OVERLAP)} ${r1(h + OVERLAP)})`} />)
    }
  }
  return (
    <g key={key} clipPath={`url(#${clipId})`}>
      <clipPath id={clipId}>
        <path d={polyPath(polygon)} />
      </clipPath>
      {uses}
    </g>
  )
}
