/**
 * Contexto de muro (opcional): la ventana instalada. Es para portadas y vistas grandes; el dibujo
 * normal va sobre papel.
 *
 *  - Por dentro: muro pintado, tapajuntas del mismo foliado, antepecho o piso.
 *  - Por fuera: muro de estuco, vano con la sombra de su dintel y alféizar de piedra o vereda.
 *
 * Son elevaciones honestas: el muro se ve de frente y la profundidad del vano solo aparece como sombra.
 */
import type { ReactNode } from 'react'
import type { Layout, Rect } from '@dekopen/engine'
import type { ColorAppearance } from '../textures/resolve'
import type { DrawingView } from './geometry'
import type { WindowGeometry } from './pieces'
import { expandRect, ringPieces } from './pieces'
import { SECTIONS, shadeRing, type DetailLevel } from './sections'
import { mixHex, polyPath, rectPathD, tonesOf, VeilBatch } from './shading'
import { tiledPolygon, type TileContext } from './tiles'

const r1 = (n: number) => Math.round(n * 10) / 10
const TRIM = 46

export interface WallInput {
  uid: string
  rect: Rect
  layout: Layout
  geometry: WindowGeometry
  view: DrawingView
  mirror: boolean
  level: DetailLevel
  appearance: ColorAppearance
  patternId: string | null
  tiles: TileContext
  /** La hoja llega al piso: puerta o balconera. */
  floor: boolean
  /** Ya hay alféizar propio (accesorio del diseño). */
  hasSill: boolean
}

/** Tramo del muro que queda por debajo del piso o del antepecho. */
function floorY(layout: Layout): number {
  return layout.height + 12
}

export function wallLayers({ uid, rect, layout, geometry, view, mirror, level, appearance: a, patternId, tiles, floor, hasSill }: WallInput): { defs: ReactNode[]; back: ReactNode[]; front: ReactNode[] } {
  const interior = view === 'interior'
  const W = layout.width
  const H = layout.height
  const tones = tonesOf(a)
  const wallBase = interior ? '#EBEBE7' : '#DAD8D2'
  const sx0 = mirror ? rect.x + rect.w : rect.x
  const sx1 = mirror ? rect.x : rect.x + rect.w
  const defs: ReactNode[] = [
    <linearGradient key="wall" id={`${uid}-wall`} gradientUnits="userSpaceOnUse" x1={r1(sx0)} y1={r1(rect.y)} x2={r1(sx1)} y2={r1(rect.y + rect.h)}>
      <stop offset="0" stopColor={mixHex(wallBase, '#FFFFFF', 0.35)} />
      <stop offset="0.55" stopColor={wallBase} />
      <stop offset="1" stopColor={mixHex(wallBase, '#3A3D3E', 0.16)} />
    </linearGradient>,
    <linearGradient key="stone" id={`${uid}-stone`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#F4F3EF" />
      <stop offset="0.45" stopColor="#D9D8D2" />
      <stop offset="1" stopColor="#ABABA5" />
    </linearGradient>,
    <linearGradient key="floor" id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={interior ? '#BDB8AE' : '#B4B3AE'} />
      <stop offset="1" stopColor={interior ? '#9C978D' : '#9A9994'} />
    </linearGradient>,
  ]
  const back: ReactNode[] = [<rect key="wall" x={r1(rect.x)} y={r1(rect.y)} width={r1(rect.w)} height={r1(rect.h)} fill={`url(#${uid}-wall)`} />]
  const front: ReactNode[] = []
  const shaped = geometry.shaped?.outer
  const silhouette = shaped ?? rectPathD(layout.frame.rect)
  const sx = mirror ? -1 : 1
  const fy = floorY(layout)

  // Piso o vereda: la puerta llega hasta él.
  if (floor) back.push(<rect key="floor" x={r1(rect.x)} y={r1(fy)} width={r1(rect.w)} height={r1(Math.max(0, rect.y + rect.h - fy))} fill={`url(#${uid}-floor)`} />)
  if (floor && interior) back.push(<rect key="base" x={r1(rect.x)} y={r1(fy - 70)} width={r1(rect.w)} height={70} fill="#F4F3F0" />, <rect key="base-l" x={r1(rect.x)} y={r1(fy - 70)} width={r1(rect.w)} height={1.6} fill="#000000" fillOpacity={0.18} />)

  if (interior) {
    // Tapajuntas: tres lados en puertas, cuatro en ventanas. Sombra leve sobre el muro.
    if (!shaped) {
      const outer = expandRect(layout.frame.rect, TRIM)
      const trimRect = floor ? { ...outer, h: outer.h - TRIM } : outer
      back.push(
        ...[10, 6].map((d) => (
          <path key={`ts-${d}`} d={rectPathD({ x: trimRect.x + sx * d * 0.7, y: trimRect.y + d, w: trimRect.w, h: trimRect.h })} fill="#20262A" fillOpacity={0.05} />
        )),
      )
      const ring = ringPieces(trimRect, { top: TRIM, right: TRIM, bottom: floor ? 0 : TRIM, left: TRIM }, { role: 'frame', owner: 'trim' })
      back.push(<path key="trim" d={rectPathD(ring.outer) + rectPathD(ring.inner)} fillRule="evenodd" fill={a.hex} />)
      if (patternId) {
        for (const piece of ring.pieces) {
          if (piece.side === 'bottom' && floor) continue
          back.push(tiledPolygon(piece.polygon, piece.grain, piece.seed, a, patternId, tiles, `tp-${piece.side}`))
        }
      }
      if (level >= 1) {
        const batch = new VeilBatch(tones)
        shadeRing(batch, ring.outer, ring.inner, SECTIONS.bead[level >= 3 ? 3 : level === 2 ? 2 : 1], mirror, { skip: floor ? ['bottom'] : undefined })
        back.push(...batch.nodes('tv', (k, d, fill, opacity) => <path key={k} d={d} fill={fill} fillOpacity={opacity} />))
      }
      back.push(<path key="tseam" d={ring.seams.filter((_, i) => !floor || i < 2).map((s) => `M${r1(s.a[0])} ${r1(s.a[1])}L${r1(s.b[0])} ${r1(s.b[1])}`).join('')} fill="none" stroke={tones.seam} strokeOpacity={tones.seamOpacity} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)
    } else {
      back.push(<path key="trim" d={silhouette} fill="none" stroke={a.hex} strokeWidth={TRIM * 2} strokeLinejoin="miter" />)
    }
    // Antepecho: losa fina que vuela a cada lado del tapajuntas.
    if (!floor && !shaped) {
      const y = H + TRIM - 4
      const pad = 66
      back.push(
        ...[12, 24, 38].map((d) => <rect key={`ap-sh-${d}`} x={r1(-pad + (sx * d) / 5)} y={r1(y + 30)} width={r1(W + 2 * pad)} height={d} fill="#20262A" fillOpacity={0.05} />),
        <rect key="ap" x={r1(-pad)} y={r1(y)} width={r1(W + 2 * pad)} height={30} fill={`url(#${uid}-stone)`} />,
        <rect key="ap-o" x={r1(-pad)} y={r1(y)} width={r1(W + 2 * pad)} height={30} fill="none" stroke="#000000" strokeOpacity={0.18} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />,
      )
    }
  } else {
    // Vano: fondo oscuro detrás del marco; la silueta del muro lo recorta.
    back.push(<path key="reveal" d={silhouette} fill="#2A2E30" fillOpacity={0.4} />)
    if (!hasSill && !floor && !shaped) {
      const y = H - 2
      const pad = 70
      back.push(
        ...[16, 34, 56].map((d) => <rect key={`ss-sh-${d}`} x={r1(-pad + (sx * d) / 5)} y={r1(y + 44)} width={r1(W + 2 * pad)} height={d} fill="#20262A" fillOpacity={0.065} />),
        <rect key="ss" x={r1(-pad)} y={r1(y)} width={r1(W + 2 * pad)} height={44} fill={`url(#${uid}-stone)`} />,
        <rect key="ss-o" x={r1(-pad)} y={r1(y)} width={r1(W + 2 * pad)} height={44} fill="none" stroke="#000000" strokeOpacity={0.2} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />,
      )
    }
    // Sombra del dintel y de la jamba sobre la ventana: el vano es profundo.
    const dv = Math.min(120, H * 0.09)
    const dh = Math.min(84, W * 0.09)
    const x = mirror ? W - dh : 0
    defs.push(
      <linearGradient key="lint" id={`${uid}-lint`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0C1012" stopOpacity="0.46" />
        <stop offset="0.72" stopColor="#0C1012" stopOpacity="0.3" />
        <stop offset="1" stopColor="#0C1012" stopOpacity="0" />
      </linearGradient>,
      <linearGradient key="jamb" id={`${uid}-jamb`} x1={mirror ? 1 : 0} y1="0" x2={mirror ? 0 : 1} y2="0">
        <stop offset="0" stopColor="#0C1012" stopOpacity="0.32" />
        <stop offset="0.7" stopColor="#0C1012" stopOpacity="0.2" />
        <stop offset="1" stopColor="#0C1012" stopOpacity="0" />
      </linearGradient>,
    )
    front.push(
      <clipPath key="vc" id={`${uid}-vano`}>
        <path d={silhouette} />
      </clipPath>,
      <g key="vano" clipPath={`url(#${uid}-vano)`} data-part="reveal-shadow">
        <rect x={0} y={0} width={r1(W)} height={r1(dv)} fill={`url(#${uid}-lint)`} />
        <rect x={r1(x)} y={0} width={r1(dh)} height={r1(H)} fill={`url(#${uid}-jamb)`} />
      </g>,
    )
  }
  return { defs, back, front }
}
