/*
 * Dibujo de los accesorios y del detalle de la ventana (DEKOPEN). Vectores planos en el mismo
 * lenguaje del avatar: formas llenas y redondeadas, sin contornos negros, colores de la paleta
 * del avatar por variables CSS (`--av-fill` cuerpo, `--av-accent`, `--av-eye`).
 *
 * Coordenadas locales en unidades de viewBox con el radio de la bola = 100; el origen es el
 * ancla sobre el contorno y −y apunta hacia afuera (arriba).
 */
import type { AvatarAccessory } from '@dekopen/shared'
import { memo } from 'react'
import { RADIUS } from './engine/engine'
import { WINDOW_GEOMETRY } from './engine/shapes'

const accent = 'var(--av-accent)'
const accentLight = 'color-mix(in oklab, var(--av-accent) 72%, white)'
const accentDark = 'color-mix(in oklab, var(--av-accent) 78%, black)'
/** Gris de equipo (vincha, auriculares): el cuerpo oscurecido, así combina con cualquier paleta. */
const gear = 'color-mix(in oklab, var(--av-fill) 40%, #11171a)'
const LEAF = '#4F9B6C'
const LEAF_DARK = '#3C7A55'
const LEAF_LIGHT = '#6DB786'

function HardHat() {
  return (
    <g>
      <path d="M-47 3C-47-33-24-50 0-50S47-33 47 3Z" fill={accent} />
      <path d="M-8-49.4C-8.6-30-8.8-12-9.4 3h18.8C8.8-12 8.6-30 8-49.4Q0-50.6-8-49.4Z" fill={accentLight} />
      <rect x="-61" y="-1" width="122" height="12" rx="6" fill={accentDark} />
      <path d="M-35-16C-33-28-24-38-14-42" fill="none" stroke="#fff" strokeOpacity="0.38" strokeWidth="4.5" strokeLinecap="round" />
    </g>
  )
}

function Cap() {
  return (
    <g>
      <path d="M13 3C34-1 58 1 71 11C58 15.5 34 14 12 11Z" fill={accentDark} />
      <path d="M-43 6C-43-25-21-40 0-40S43-25 43 6Z" fill={accent} />
      <path d="M0-39.5L-20 5M0-39.5L20 5" fill="none" stroke={accentDark} strokeWidth="2.6" strokeLinecap="round" strokeOpacity="0.55" />
      <circle cx="0" cy="-40" r="5" fill={accentDark} />
      <path d="M-30-12C-27-24-18-32-9-35" fill="none" stroke="#fff" strokeOpacity="0.32" strokeWidth="4" strokeLinecap="round" />
    </g>
  )
}

function Leaf() {
  return (
    <g>
      <path d="M0 8C0-3 2.5-14 0.5-27" fill="none" stroke={LEAF_DARK} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M0-16C-9-14-23-19-29-33C-14-37-3-30 0-16Z" fill={LEAF_LIGHT} />
      <path d="M-2-18.5C-9-21-16-25-22-31" fill="none" stroke={LEAF_DARK} strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M1.2-25C8-31 21-35 31-50C13-53 1-43 1.2-25Z" fill={LEAF} />
      <path d="M3-28C10-33 18-39 24-45" fill="none" stroke={LEAF_DARK} strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" />
    </g>
  )
}

/** Vincha: dibujada para media cabeza = 100 (la pieza se estira con el ancho real). */
function HeadsetBand() {
  return <path d="M-107 90A107 107 0 0 1 107 90H96A96 96 0 0 0-96 90Z" fill={gear} />
}

function HeadsetCup({ mic }: { mic: boolean }) {
  return (
    <g>
      {mic ? (
        <>
          <path d="M5 13C9 39 31 52 57 47" fill="none" stroke={gear} strokeWidth="5.5" strokeLinecap="round" />
          <ellipse cx="61" cy="46" rx="8.5" ry="6.5" fill={accent} />
        </>
      ) : null}
      <rect x="-12" y="-21" width="24" height="42" rx="10" fill={gear} />
      <rect x="-4.5" y="-11" width="9" height="22" rx="4.5" fill={accent} />
    </g>
  )
}

function Pencil() {
  return (
    <g transform="rotate(-38)">
      <rect x="-54" y="-6.5" width="11" height="13" rx="3.5" fill="#E79595" />
      <rect x="-44" y="-6.5" width="8.5" height="13" fill="#C9CED1" />
      <rect x="-36" y="-6.5" width="60" height="13" fill="#F0BC45" />
      <rect x="-36" y="-6.5" width="60" height="4.4" fill="#F7D57A" />
      <path d="M24-6.5L42 0L24 6.5Z" fill="#E6C69C" />
      <path d="M36.4-2.2L42 0L36.4 2.2Z" fill="#363C40" />
    </g>
  )
}

function TapeMeasure() {
  return (
    <g transform="rotate(-10)">
      <rect x="-33" y="9" width="20" height="7.5" rx="1.5" fill="#F0BC45" />
      <path d="M-29 9v3.5M-25 9v2.5M-21 9v3.5M-17 9v2.5" stroke="#6B5310" strokeWidth="1.1" />
      <rect x="-36" y="7.5" width="4" height="10.5" rx="1.2" fill="#363C40" />
      <rect x="-18" y="-18" width="36" height="36" rx="10" fill={accent} />
      <circle cx="0" cy="0" r="10" fill={accentLight} />
      <circle cx="0" cy="0" r="3" fill={accentDark} />
      <path d="M-12-11.5C-9-14-5-15.4-1-15.6" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

function BowTie() {
  return (
    <g>
      <path d="M-4-3.5C-14-13-24-15-29-8.5C-31.5-3-31.5 3-29 8.5C-24 15-14 13-4 3.5Z" fill={accent} />
      <path d="M4-3.5C14-13 24-15 29-8.5C31.5-3 31.5 3 29 8.5C24 15 14 13 4 3.5Z" fill={accent} />
      <rect x="-6.5" y="-6.5" width="13" height="13" rx="4" fill={accentDark} />
    </g>
  )
}

/** Pieza `index` del accesorio `id` (en el orden de ACCESSORIES[id].parts). */
export const AccessoryPartArt = memo(function AccessoryPartArt({ id, index }: { id: AvatarAccessory; index: number }) {
  switch (id) {
    case 'hard_hat':
      return <HardHat />
    case 'cap':
      return <Cap />
    case 'leaf':
      return <Leaf />
    case 'headset':
      return index === 0 ? <HeadsetBand /> : <HeadsetCup mic={index === 1} />
    case 'pencil':
      return <Pencil />
    case 'tape_measure':
      return <TapeMeasure />
    case 'bow_tie':
      return <BowTie />
    default:
      return null
  }
})

const W = WINDOW_GEOMETRY

/** Alféizar: una sola pieza plana, del color del cuerpo. */
export function WindowSill({ stroke }: { stroke?: string }) {
  const r = W.sillHeight * RADIUS
  return (
    <rect
      x={-W.sillHw * RADIUS}
      y={W.sillTop * RADIUS}
      width={W.sillHw * 2 * RADIUS}
      height={r}
      rx={r / 2}
      style={{ fill: 'var(--av-fill)', stroke: stroke ?? 'none', strokeWidth: stroke ? 1 : 0 }}
      vectorEffect="non-scaling-stroke"
    />
  )
}
