import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useFormat } from '../lib/i18n'

/**
 * Dibujo de ventana en trazo fino para estados vacíos y pantallas de acceso. No es el dibujo
 * técnico (ese vive en @dekopen/documents): es una ilustración sobria con la convención del rubro.
 */
export type SketchKind = 'casement' | 'tilt_turn' | 'double' | 'sliding' | 'transom' | 'fixed' | 'door' | 'triple'

export interface WindowSketchProps {
  kind?: SketchKind
  /** Medidas en mm (proporción del dibujo y texto de las cotas). */
  width?: number
  height?: number
  /** Mostrar cotas en tinta. */
  dimensions?: boolean
  /** Alto en px del SVG (el ancho se ajusta). */
  size?: number
  className?: string
  title?: string
  /** Marca con un trazo más grueso el canto de apertura (lado de cierre de la hoja). */
  accentEdge?: boolean
}

/** Si el dibujo resalta el canto de apertura (solo en la primera hoja que abre: la marca `accent`). */
const AccentContext = createContext(false)

function AccentEdge({ x, y, h }: { x: number; y: number; h: number }) {
  if (!useContext(AccentContext)) return null
  return (
    <path
      d={`M${x} ${y + 1.5} V${y + h - 1.5}`}
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      fill="none"
    />
  )
}

const SCALE = 0.1 // 1 unidad = 10 mm
const FRAME = 6 // cara vista del marco (60 mm)
const SASH = 7 // cara vista de la hoja (70 mm)

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const inset = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d })

const stroke = {
  vectorEffect: 'non-scaling-stroke' as const,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinejoin: 'round' as const,
}

function Glass({ box }: { box: Box }) {
  const { x, y, w, h } = box
  // Reflejo: dos trazos diagonales finos, blancos, en el tercio superior derecho.
  const r1 = Math.min(w, h) * 0.22
  const cx = x + w * 0.66
  const cy = y + h * 0.3
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--color-glass, #d9ebee)" style={{ fillOpacity: 'var(--sketch-glass-opacity, 0.7)' }} />
      <path
        d={`M${cx - r1 / 2} ${cy + r1 / 2} L${cx + r1 / 2} ${cy - r1 / 2} M${cx - r1 / 2 + 3} ${cy + r1 / 2 + 3} L${cx + r1 / 2 - 2} ${cy - r1 / 2 + 8}`}
        stroke="#fff"
        style={{ strokeOpacity: 'var(--sketch-glint-opacity, 0.95)' }}
        strokeWidth={1.25}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <rect x={x} y={y} width={w} height={h} {...stroke} strokeOpacity={0.55} />
    </g>
  )
}

/** Símbolo de apertura: líneas desde las esquinas del lado de cierre al medio del lado de bisagras. */
function OpeningSymbol({ box, hinge, away = false }: { box: Box; hinge: 'left' | 'right' | 'top' | 'bottom'; away?: boolean }) {
  const { x, y, w, h } = box
  const pts = {
    left: [`${x + w} ${y}`, `${x} ${y + h / 2}`, `${x + w} ${y + h}`],
    right: [`${x} ${y}`, `${x + w} ${y + h / 2}`, `${x} ${y + h}`],
    top: [`${x} ${y + h}`, `${x + w / 2} ${y}`, `${x + w} ${y + h}`],
    bottom: [`${x} ${y}`, `${x + w / 2} ${y + h}`, `${x + w} ${y}`],
  }[hinge]
  return (
    <path
      d={`M${pts[0]} L${pts[1]} L${pts[2]}`}
      {...stroke}
      strokeWidth={1}
      strokeOpacity={0.7}
      strokeDasharray={away ? '6 4' : undefined}
    />
  )
}

function Handle({ box, side }: { box: Box; side: 'left' | 'right' }) {
  const hx = side === 'right' ? box.x + box.w - SASH / 2 - 1 : box.x + SASH / 2 - 1
  const hy = box.y + box.h / 2
  return <rect x={hx} y={hy - 5} width={2} height={10} rx={1} fill="currentColor" fillOpacity={0.8} />
}

function Sash({ box, hinge, away, tilt, accent }: { box: Box; hinge: 'left' | 'right'; away?: boolean; tilt?: boolean; accent?: boolean }) {
  const glass = inset(box, SASH)
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} {...stroke} />
      <Glass box={glass} />
      <OpeningSymbol box={glass} hinge={hinge} away={away} />
      {tilt ? <OpeningSymbol box={glass} hinge="bottom" away /> : null}
      <Handle box={box} side={hinge === 'left' ? 'right' : 'left'} />
      {accent ? <AccentEdge x={hinge === 'left' ? box.x + box.w : box.x} y={box.y} h={box.h} /> : null}
    </g>
  )
}

function SlidingArrow({ box, direction }: { box: Box; direction: 'left' | 'right' }) {
  const y = box.y + box.h / 2
  const from = box.x + box.w * (direction === 'right' ? 0.25 : 0.75)
  const to = box.x + box.w * (direction === 'right' ? 0.75 : 0.25)
  const head = direction === 'right' ? -4 : 4
  return (
    <path
      d={`M${from} ${y} L${to} ${y} M${to + head} ${y - 3} L${to} ${y} L${to + head} ${y + 3}`}
      {...stroke}
      strokeWidth={1}
      strokeOpacity={0.75}
      strokeLinecap="round"
    />
  )
}

function Dimension({
  axis,
  from,
  to,
  at,
  value,
  k,
}: {
  axis: 'x' | 'y'
  from: number
  to: number
  at: number
  value: number
  /** Unidades del dibujo por píxel en pantalla (para que el texto mida ~12 px). */
  k: number
}) {
  const tick = 3.5 * k
  const ext = 8 * k
  const textGap = 15 * k
  const fontSize = 11.5 * k
  const label = useFormat().mm(value)
  const common = { vectorEffect: 'non-scaling-stroke' as const, stroke: 'var(--dk-dimension)', strokeWidth: 1, fill: 'none' }
  if (axis === 'x') {
    return (
      <g>
        <path d={`M${from} ${at - ext} V${at + ext / 2} M${to} ${at - ext} V${at + ext / 2}`} {...common} strokeOpacity={0.5} />
        <path d={`M${from} ${at} H${to}`} {...common} />
        <path d={`M${from - tick} ${at + tick} L${from + tick} ${at - tick} M${to - tick} ${at + tick} L${to + tick} ${at - tick}`} {...common} />
        <text
          x={(from + to) / 2}
          y={at + textGap}
          textAnchor="middle"
          fill="var(--dk-dimension-text)"
          className="dim"
          style={{ fontSize, fontWeight: 500 }}
        >
          {label}
        </text>
      </g>
    )
  }
  return (
    <g>
      <path d={`M${at - ext} ${from} H${at + ext / 2} M${at - ext} ${to} H${at + ext / 2}`} {...common} strokeOpacity={0.5} />
      <path d={`M${at} ${from} V${to}`} {...common} />
      <path d={`M${at - tick} ${from + tick} L${at + tick} ${from - tick} M${at - tick} ${to + tick} L${at + tick} ${to - tick}`} {...common} />
      <text
        x={at + textGap}
        y={(from + to) / 2}
        textAnchor="middle"
        fill="var(--dk-dimension-text)"
        className="dim"
        transform={`rotate(-90 ${at + textGap} ${(from + to) / 2})`}
        style={{ fontSize, fontWeight: 500 }}
      >
        {label}
      </text>
    </g>
  )
}

const DEFAULT_SIZES: Record<SketchKind, [number, number]> = {
  casement: [900, 1200],
  tilt_turn: [800, 1200],
  double: [1400, 1300],
  sliding: [1800, 1300],
  transom: [1000, 1600],
  fixed: [1000, 1000],
  door: [900, 2100],
  triple: [2100, 1300],
}

export function WindowSketch({ kind = 'casement', width, height, dimensions = false, size, className, title, accentEdge = false }: WindowSketchProps) {
  const [dw, dh] = DEFAULT_SIZES[kind]
  const mmW = width ?? dw
  const mmH = height ?? dh
  const W = mmW * SCALE
  const H = mmH * SCALE
  const pad = 3
  // Unidades por píxel: con `size` conocido, las cotas miden lo mismo en pantalla a cualquier escala.
  const k = size ? (H + 40) / size : 0.7
  const dimSpace = dimensions ? 34 * k : 0
  const frame: Box = { x: pad, y: pad, w: W, h: H }
  const light = inset(frame, FRAME)
  const vbW = W + pad * 2 + dimSpace
  const vbH = H + pad * 2 + dimSpace

  let body: ReactNode
  switch (kind) {
    case 'casement':
      body = <Sash box={light} hinge="left" accent />
      break
    case 'tilt_turn':
      body = <Sash box={light} hinge="left" tilt accent />
      break
    case 'double': {
      const half = light.w / 2
      body = (
        <>
          <Sash box={{ ...light, w: half }} hinge="left" />
          <Sash box={{ ...light, x: light.x + half, w: half }} hinge="right" accent />
        </>
      )
      break
    }
    case 'sliding': {
      const overlap = SASH
      const pw = (light.w + overlap) / 2
      const left: Box = { ...light, w: pw }
      const right: Box = { ...light, x: light.x + light.w - pw, w: pw }
      body = (
        <>
          <rect x={left.x} y={left.y} width={left.w} height={left.h} {...stroke} />
          <Glass box={inset(left, SASH)} />
          <rect x={right.x} y={right.y} width={right.w} height={right.h} {...stroke} />
          <Glass box={inset(right, SASH)} />
          <SlidingArrow box={inset(left, SASH)} direction="right" />
          <AccentEdge x={left.x + left.w} y={left.y} h={left.h} />
          <SlidingArrow box={inset(right, SASH)} direction="left" />
        </>
      )
      break
    }
    case 'transom': {
      const topH = light.h * 0.28
      const bar = FRAME * 0.9
      body = (
        <>
          <Glass box={{ ...light, h: topH - bar / 2 }} />
          <rect x={light.x} y={light.y + topH - bar / 2} width={light.w} height={bar} {...stroke} />
          <Sash box={{ ...light, y: light.y + topH + bar / 2, h: light.h - topH - bar / 2 }} hinge="left" accent />
        </>
      )
      break
    }
    case 'fixed':
      body = <Glass box={light} />
      break
    case 'door': {
      const sash = light
      const glass = inset(sash, SASH + 2)
      const panelH = glass.h * 0.34
      body = (
        <>
          <rect x={sash.x} y={sash.y} width={sash.w} height={sash.h} {...stroke} />
          <Glass box={{ ...glass, h: glass.h - panelH - 4 }} />
          <rect x={glass.x} y={glass.y + glass.h - panelH} width={glass.w} height={panelH} {...stroke} strokeOpacity={0.55} />
          <OpeningSymbol box={glass} hinge="left" />
          <Handle box={sash} side="right" />
          <AccentEdge x={sash.x + sash.w} y={sash.y} h={sash.h} />
        </>
      )
      break
    }
    case 'triple': {
      const third = light.w / 3
      const mullion = FRAME * 0.9
      body = (
        <>
          <Sash box={{ ...light, w: third - mullion / 2 }} hinge="left" />
          <rect x={light.x + third - mullion / 2} y={light.y} width={mullion} height={light.h} {...stroke} />
          <Glass box={{ ...light, x: light.x + third + mullion / 2, w: third - mullion }} />
          <rect x={light.x + 2 * third - mullion / 2} y={light.y} width={mullion} height={light.h} {...stroke} />
          <Sash box={{ ...light, x: light.x + 2 * third + mullion / 2, w: third - mullion / 2 }} hinge="right" accent />
        </>
      )
      break
    }
  }

  return (
    <AccentContext.Provider value={accentEdge}>
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      height={size}
      width={size ? (size * vbW) / vbH : undefined}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0 overflow-visible text-fg-muted', className)}
    >
      <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} rx={0.8} {...stroke} fill="var(--dk-surface)" />
      <rect x={light.x} y={light.y} width={light.w} height={light.h} {...stroke} strokeOpacity={0.7} />
      {body}
      {dimensions ? (
        <>
          <Dimension axis="x" from={frame.x} to={frame.x + W} at={frame.y + H + 12 * k} value={mmW} k={k} />
          <Dimension axis="y" from={frame.y} to={frame.y + H} at={frame.x + W + 12 * k} value={mmH} k={k} />
        </>
      ) : null}
    </svg>
    </AccentContext.Provider>
  )
}
