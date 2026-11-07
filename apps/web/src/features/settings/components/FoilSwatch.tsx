/**
 * Muestra de foliado dibujada con CSS a partir de los colores de referencia de la textura (base,
 * claro, oscuro) y su acabado: veta para maderas, grano fino para arenados, cepillado para metálicos
 * y una luz suave para los lisos. Cuadrada como una muestra física.
 */
import type { CSSProperties } from 'react'
import type { BuiltinTexture } from '@dekopen/shared'
import { cn } from '../../../lib/cn'

/** #RRGGBB + alfa (0–1) → #RRGGBBAA. */
function alpha(hex: string, a: number): string {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255)
  return `${hex.slice(0, 7)}${v.toString(16).padStart(2, '0')}`
}

export function foilBackground(texture: Pick<BuiltinTexture, 'hex' | 'light' | 'dark' | 'finish'>): CSSProperties {
  const { hex, light, dark, finish } = texture
  const base = `linear-gradient(180deg, ${light} 0%, ${hex} 46%, ${dark} 100%)`
  switch (finish) {
    case 'woodgrain':
      return {
        backgroundImage: [
          `radial-gradient(120% 60% at 30% 38%, transparent 52%, ${alpha(dark, 0.32)} 54%, transparent 58%, transparent 66%, ${alpha(dark, 0.22)} 68%, transparent 72%)`,
          `repeating-linear-gradient(177deg, transparent 0 2px, ${alpha(dark, 0.28)} 2px 3px, transparent 3px 7px, ${alpha(light, 0.18)} 7px 8px, transparent 8px 13px)`,
          `repeating-linear-gradient(181deg, transparent 0 5px, ${alpha(dark, 0.18)} 5px 6px, transparent 6px 17px)`,
          base,
        ].join(', '),
      }
    case 'textured':
      return {
        backgroundImage: [
          `radial-gradient(${alpha('#ffffff', 0.1)} 0.6px, transparent 0.8px)`,
          `radial-gradient(${alpha('#000000', 0.14)} 0.6px, transparent 0.8px)`,
          base,
        ].join(', '),
        backgroundSize: '3px 3px, 4px 4px, 100% 100%',
        backgroundPosition: '0 0, 1px 2px, 0 0',
      }
    case 'metallic':
      return {
        backgroundImage: [
          `repeating-linear-gradient(90deg, ${alpha('#ffffff', 0.14)} 0 1px, transparent 1px 3px, ${alpha('#000000', 0.06)} 3px 4px)`,
          `linear-gradient(180deg, ${light} 0%, ${hex} 38%, ${dark} 62%, ${light} 100%)`,
        ].join(', '),
      }
    default:
      return { backgroundImage: `linear-gradient(135deg, ${alpha('#ffffff', 0.35)} 0%, transparent 42%), ${base}` }
  }
}

export function FoilSwatch({ texture, size = 56, className }: { texture: Pick<BuiltinTexture, 'hex' | 'light' | 'dark' | 'finish'>; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 rounded-xs ring-1 ring-black/10 ring-inset', className)}
      style={{ width: size, height: size, backgroundColor: texture.hex, ...foilBackground(texture) }}
    />
  )
}
