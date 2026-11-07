/**
 * Herrajes con forma real, en mm y en posición cerrada: manilla de ventana (roseta angosta, cuello y
 * palanca que cae), manilla de puerta con placa y cilindro, tirador de corredera, manilla larga de
 * elevadora, bisagras de canuto y tapas de drenaje. Las proporciones son las de un herraje europeo
 * común, sin imitar a ningún fabricante.
 */
import type { ReactNode } from 'react'
import type { ColorAppearance } from '../textures/resolve'
import type { DetailLevel } from './sections'
import { mixHex } from './shading'

const r1 = (n: number) => Math.round(n * 10) / 10
const NS = 'non-scaling-stroke' as const

/** El visor 3D usa estos mismos tonos: un herraje no cambia de color entre el dibujo y el volumen. */
export interface HardwareTone {
  id: 'white' | 'silver' | 'dark'
  base: string
  edge: string
  hi: string
  low: string
}

/** Blanco sobre perfil claro, plata sobre madera y colores medios, grafito sobre oscuros lisos. */
export function hardwareTone(a: ColorAppearance): HardwareTone {
  if (a.isLight) return { id: 'white', base: '#F2F3F1', edge: '#A7AEB0', hi: '#FFFFFF', low: '#CDD2D1' }
  if (a.luminance < 0.08 && a.finish !== 'woodgrain') return { id: 'dark', base: '#3A3F43', edge: '#121517', hi: '#8C9499', low: '#1F2326' }
  return { id: 'silver', base: '#C5C9CA', edge: '#6C7477', hi: '#F7F8F8', low: '#8E9597' }
}

/** Degradados del metal, uno por eje. El espejo los invierte para que la luz siga arriba a la izquierda. */
export function hardwareDefs(uid: string, tone: HardwareTone, mirror: boolean): ReactNode[] {
  const stops = (
    <>
      <stop offset="0" stopColor={tone.hi} />
      <stop offset="0.38" stopColor={tone.base} />
      <stop offset="0.78" stopColor={tone.low} />
      <stop offset="1" stopColor={mixHex(tone.low, tone.edge, 0.5)} />
    </>
  )
  return [
    <linearGradient key="hwx" id={`${uid}-hwx`} x1={mirror ? 1 : 0} y1="0" x2={mirror ? 0 : 1} y2="0">
      {stops}
    </linearGradient>,
    <linearGradient key="hwy" id={`${uid}-hwy`} x1="0" y1="0" x2="0" y2="1">
      {stops}
    </linearGradient>,
  ]
}

export interface HardwareContext {
  uid: string
  tone: HardwareTone
  mirror: boolean
  level: DetailLevel
}

function shadowOf(ctx: HardwareContext, depth: number): { dx: number; dy: number } {
  return { dx: (ctx.mirror ? -1 : 1) * depth * 0.7, dy: depth }
}

/** Palanca que cae desde el eje (0,0): se afina en el cuello y se ensancha hacia la punta redondeada. */
const LEVER = 'M-8.6 -5C-9.6 8-7 26-6.6 52C-6.4 78-8 102-8.8 116C-9.4 126 9.4 126 8.8 116C8 102 6.4 78 6.6 52C7 26 9.6 8 8.6 -5C7.4 -13 -7.4 -13 -8.6 -5Z'
const LEVER_HI = 'M-3.6 -2C-4.2 18-2.8 42-2.6 66C-2.5 84-3.2 100-3.6 112'

/** Manilla de ventana: `rotate` 0 cae hacia abajo (cerrada); ±90 para manillas en travesaños. */
export function windowHandle(ctx: HardwareContext, cx: number, cy: number, rotate: number, key: string): ReactNode {
  const { tone, uid, level } = ctx
  const t = (x: number, y: number) => `translate(${r1(x)} ${r1(y)})${rotate ? ` rotate(${rotate})` : ''}`
  const s = shadowOf(ctx, 7)
  const near = shadowOf(ctx, 2.6)
  const parts: ReactNode[] = []
  if (level >= 3) parts.push(<path key="sf" d={LEVER} transform={t(cx + s.dx * 1.5, cy + s.dy * 1.5)} fill="#000000" fillOpacity={0.05} />)
  if (level >= 2) parts.push(<path key="s" d={LEVER} transform={t(cx + s.dx, cy + s.dy)} fill="#000000" fillOpacity={0.13} />)
  parts.push(<rect key="rs" x={-14} y={-38} width={28} height={76} rx={7} transform={t(cx + near.dx, cy + near.dy)} fill="#000000" fillOpacity={0.2} />)
  parts.push(<rect key="r" x={-14} y={-38} width={28} height={76} rx={7} transform={t(cx, cy)} fill={`url(#${uid}-hw${rotate ? 'y' : 'x'})`} stroke={tone.edge} strokeOpacity={0.55} strokeWidth={0.5} vectorEffect={NS} />)
  if (level >= 3) {
    // Tapa de la roseta: un filo fino hacia el borde.
    parts.push(<rect key="rl" x={-12} y={-36} width={24} height={72} rx={5.4} transform={t(cx, cy)} fill="none" stroke={tone.hi} strokeOpacity={0.5} strokeWidth={0.5} vectorEffect={NS} />)
  }
  parts.push(<path key="l" d={LEVER} transform={t(cx, cy)} fill={`url(#${uid}-hw${rotate ? 'y' : 'x'})`} stroke={tone.edge} strokeOpacity={0.6} strokeWidth={0.55} vectorEffect={NS} />)
  if (level >= 2) parts.push(<path key="h" d={LEVER_HI} transform={t(cx, cy)} fill="none" stroke={tone.hi} strokeOpacity={0.65} strokeWidth={2.2} strokeLinecap="round" />)
  return <g key={key}>{parts}</g>
}

/** Manilla de puerta de acceso: placa larga, palanca horizontal hacia las bisagras y cilindro. */
export function doorHandle(ctx: HardwareContext, cx: number, cy: number, towardHinge: -1 | 1, key: string): ReactNode {
  const { tone, uid, level } = ctx
  const near = shadowOf(ctx, 2.6)
  const far = shadowOf(ctx, 8)
  const plate = { x: cx - 19, y: cy - 118, w: 38, h: 236 }
  const x0 = towardHinge > 0 ? cx - 8 : cx + 8
  const x1 = cx + towardHinge * 138
  const leverD = (dx: number, dy: number) => `M${r1(x0 + dx)} ${r1(cy - 58 + dy)}H${r1(x1 + dx)}C${r1(x1 + towardHinge * 8 + dx)} ${r1(cy - 58 + dy)} ${r1(x1 + towardHinge * 8 + dx)} ${r1(cy - 36 + dy)} ${r1(x1 + dx)} ${r1(cy - 36 + dy)}H${r1(x0 + dx)}Z`
  const parts: ReactNode[] = [
    <rect key="ps" x={r1(plate.x + near.dx)} y={r1(plate.y + near.dy)} width={plate.w} height={plate.h} rx={7} fill="#000000" fillOpacity={0.2} />,
    level >= 2 ? <path key="ls" d={leverD(far.dx, far.dy)} fill="#000000" fillOpacity={0.15} /> : null,
    <rect key="p" x={r1(plate.x)} y={r1(plate.y)} width={plate.w} height={plate.h} rx={7} fill={`url(#${uid}-hwx)`} stroke={tone.edge} strokeOpacity={0.55} strokeWidth={0.5} vectorEffect={NS} />,
    <circle key="n" cx={r1(cx)} cy={r1(cy - 47)} r={15} fill={`url(#${uid}-hwy)`} stroke={tone.edge} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />,
    <path key="l" d={leverD(0, 0)} fill={`url(#${uid}-hwy)`} stroke={tone.edge} strokeOpacity={0.6} strokeWidth={0.55} vectorEffect={NS} />,
  ]
  if (level >= 2) {
    parts.push(<path key="h" d={`M${r1(x0 + towardHinge * 12)} ${r1(cy - 53.5)}H${r1(x1 - towardHinge * 4)}`} stroke={tone.hi} strokeOpacity={0.8} strokeWidth={3} strokeLinecap="round" fill="none" />)
    // Cilindro de seguridad.
    parts.push(<circle key="c" cx={r1(cx)} cy={r1(cy + 44)} r={10} fill={tone.low} stroke={tone.edge} strokeOpacity={0.7} strokeWidth={0.5} vectorEffect={NS} />)
    parts.push(<rect key="k" x={r1(cx - 1.8)} y={r1(cy + 38)} width={3.6} height={14} rx={1.8} fill="#15181A" />)
  }
  return <g key={key}>{parts}</g>
}

/** Tirador de corredera: placa angosta con cubeta para los dedos y pestillo. */
export function slidingPull(ctx: HardwareContext, cx: number, cy: number, h: number, key: string, w = 28): ReactNode {
  const { tone, uid, level } = ctx
  const y = cy - h / 2
  const near = shadowOf(ctx, 2.4)
  const parts: ReactNode[] = [
    <rect key="s" x={r1(cx - w / 2 + near.dx)} y={r1(y + near.dy)} width={w} height={r1(h)} rx={6} fill="#000000" fillOpacity={0.2} />,
    <rect key="p" x={r1(cx - w / 2)} y={r1(y)} width={w} height={r1(h)} rx={6} fill={`url(#${uid}-hwx)`} stroke={tone.edge} strokeOpacity={0.55} strokeWidth={0.5} vectorEffect={NS} />,
  ]
  if (level >= 2) {
    const cup = w * 0.54
    const pin = w * 0.29
    parts.push(<rect key="c" x={r1(cx - cup / 2)} y={r1(y + h * 0.16)} width={r1(cup)} height={r1(h * 0.46)} rx={r1(cup / 2)} fill={tone.edge} fillOpacity={0.5} />)
    parts.push(<rect key="ch" x={r1(cx - cup / 2)} y={r1(y + h * 0.16 + 2.2)} width={r1(cup)} height={r1(h * 0.46 - 2.2)} rx={r1(cup / 2)} fill={tone.low} />)
    parts.push(<rect key="b" x={r1(cx - pin / 2)} y={r1(y + h * 0.74)} width={r1(pin)} height={r1(h * 0.13)} rx={3} fill={`url(#${uid}-hwy)`} stroke={tone.edge} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />)
  }
  return <g key={key}>{parts}</g>
}

/** Manilla larga de elevadora: placa, cuello y palanca hacia arriba (hoja apoyada, cerrada). */
export function liftSlideHandle(ctx: HardwareContext, cx: number, cy: number, key: string): ReactNode {
  const { tone, uid, level } = ctx
  const near = shadowOf(ctx, 2.8)
  const far = shadowOf(ctx, 9)
  const plate = { x: cx - 21, y: cy - 118, w: 42, h: 236 }
  const lever = `M${r1(cx - 11)} ${r1(cy + 14)}C${r1(cx - 12)} ${r1(cy - 90)} ${r1(cx - 8.5)} ${r1(cy - 200)} ${r1(cx - 10)} ${r1(cy - 276)}C${r1(cx - 11)} ${r1(cy - 292)} ${r1(cx + 11)} ${r1(cy - 292)} ${r1(cx + 10)} ${r1(cy - 276)}C${r1(cx + 8.5)} ${r1(cy - 200)} ${r1(cx + 12)} ${r1(cy - 90)} ${r1(cx + 11)} ${r1(cy + 14)}Z`
  const parts: ReactNode[] = [
    <rect key="ps" x={r1(plate.x + near.dx)} y={r1(plate.y + near.dy)} width={plate.w} height={plate.h} rx={7} fill="#000000" fillOpacity={0.2} />,
    level >= 2 ? <path key="ls" d={lever} transform={`translate(${r1(far.dx)} ${r1(far.dy)})`} fill="#000000" fillOpacity={0.14} /> : null,
    <rect key="p" x={r1(plate.x)} y={r1(plate.y)} width={plate.w} height={plate.h} rx={7} fill={`url(#${uid}-hwx)`} stroke={tone.edge} strokeOpacity={0.55} strokeWidth={0.5} vectorEffect={NS} />,
    <path key="l" d={lever} fill={`url(#${uid}-hwx)`} stroke={tone.edge} strokeOpacity={0.6} strokeWidth={0.55} vectorEffect={NS} />,
    <circle key="n" cx={r1(cx)} cy={r1(cy)} r={17} fill={`url(#${uid}-hwy)`} stroke={tone.edge} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />,
  ]
  if (level >= 2) parts.push(<path key="h" d={`M${r1(cx - 5)} ${r1(cy - 24)}C${r1(cx - 6)} ${r1(cy - 110)} ${r1(cx - 3.6)} ${r1(cy - 200)} ${r1(cx - 4.6)} ${r1(cy - 270)}`} stroke={tone.hi} strokeOpacity={0.8} strokeWidth={3} strokeLinecap="round" fill="none" />)
  return <g key={key}>{parts}</g>
}

export interface HingeShape {
  x: number
  y: number
  w: number
  h: number
}

/** Bisagra de canuto a la vista: cuerpo redondeado, con la unión de las dos alas si hay detalle. */
export function hingeNodes(ctx: HardwareContext, hinges: readonly HingeShape[], key: string): ReactNode {
  const { tone, uid, level } = ctx
  if (!hinges.length) return null
  return (
    <g key={key}>
      {hinges.map((r, i) => {
        const vertical = r.h >= r.w
        const near = shadowOf(ctx, 2.2)
        const rx = Math.min(r.w, r.h) / 3.2
        return (
          <g key={i}>
            <rect x={r1(r.x + near.dx)} y={r1(r.y + near.dy)} width={r1(r.w)} height={r1(r.h)} rx={rx} fill="#000000" fillOpacity={0.2} />
            <rect x={r1(r.x)} y={r1(r.y)} width={r1(r.w)} height={r1(r.h)} rx={rx} fill={`url(#${uid}-hw${vertical ? 'x' : 'y'})`} stroke={tone.edge} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />
            {level >= 2 ? (
              <path
                d={vertical ? `M${r1(r.x)} ${r1(r.y + r.h / 2)}H${r1(r.x + r.w)}` : `M${r1(r.x + r.w / 2)} ${r1(r.y)}V${r1(r.y + r.h)}`}
                stroke={tone.edge}
                strokeOpacity={0.8}
                strokeWidth={0.8}
                fill="none"
              />
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

/** Tapas de drenaje del perfil inferior (solo se ven por fuera). */
export function drainCaps(ctx: HardwareContext, y: number, xs: readonly number[], capTone: string, key: string): ReactNode {
  if (ctx.level < 2 || !xs.length) return null
  return (
    <g key={key} data-part="drains">
      {xs.map((x, i) => (
        <g key={i}>
          <rect x={r1(x - 18)} y={r1(y - 4.2)} width={36} height={9.4} rx={4.2} fill="#000000" fillOpacity={0.22} />
          <rect x={r1(x - 18)} y={r1(y - 5)} width={36} height={9.4} rx={4.2} fill={capTone} stroke="#000000" strokeOpacity={0.25} strokeWidth={0.5} vectorEffect={NS} />
          <rect x={r1(x - 11)} y={r1(y - 1)} width={22} height={2.4} rx={1.2} fill="#14181A" fillOpacity={0.75} />
        </g>
      ))}
    </g>
  )
}
