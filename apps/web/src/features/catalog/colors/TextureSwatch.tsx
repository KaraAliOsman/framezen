import type { CSSProperties } from 'react'
import { cn } from '../../../lib/cn'
import { fallbackBackground, isLightHex, type ColorAppearance } from './model'

export interface TextureSwatchProps {
  appearance: ColorAppearance
  /** Lado en px. */
  size?: number
  /** Ocupa todo el ancho del contenedor (cuadrado). */
  fill?: boolean
  /** Nombre accesible (sin nombre la muestra es decorativa). */
  name?: string
  /** Milímetros de material que muestra la muestra (escala física de la veta). */
  viewMm?: number
  className?: string
}

/**
 * Muestra de material cuadrada, como una muestra física: la tesela real a escala (la veta se ve
 * del tamaño que tiene en un perfil), con brillo de canto arriba a la izquierda. Si la tesela aún no
 * está, una muestra de respaldo con el color y una veta suave; nunca un círculo plano.
 */
export function TextureSwatch({ appearance, size = 48, fill, name, viewMm = 220, className }: TextureSwatchProps) {
  const px = fill ? 160 : size
  const tilePx = appearance.procedural ? px : Math.round(Math.min(px * 6, Math.max(px * 0.9, (px * appearance.scaleMm) / viewMm)))
  // Misma proporción física que el dibujo 2D y el visor 3D: la veta de madera repite cada ~3 anchos de tesela.
  const aspect = appearance.source === 'upload' ? 1 : appearance.finish === 'woodgrain' ? 1 / 3 : appearance.finish === 'metallic' ? 1 / 4 : 1
  const tile = appearance.thumbUrl && px <= 64 ? appearance.thumbUrl : appearance.tileUrl
  const tinted = Boolean(appearance.tint)
  const style: CSSProperties = tile
    ? {
        backgroundColor: appearance.hex,
        backgroundImage: `url("${tile}")`,
        backgroundSize: `${tilePx}px ${Math.max(1, Math.round(tilePx * aspect))}px`,
        backgroundRepeat: 'repeat',
        // Familia (p. ej. «Embero» sin foliado propio): la veta de la biblioteca teñida con su color.
        ...(tinted ? { backgroundBlendMode: 'soft-light' } : {}),
      }
    : { background: fallbackBackground(appearance) }
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      data-source={appearance.source}
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-sm border',
        isLightHex(appearance.hex) ? 'border-control/50' : 'border-black/15 dark:border-white/12',
        fill ? 'aspect-square w-full' : null,
        className,
      )}
      style={fill ? style : { ...style, width: size, height: size }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(135deg, rgb(255 255 255 / 0.20), transparent 42%, rgb(0 0 0 / 0.10))' }}
      />
    </span>
  )
}
