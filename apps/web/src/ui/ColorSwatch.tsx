import { RadioGroup } from 'radix-ui'
import { cn } from '../lib/cn'
import { Tooltip } from './Tooltip'

/** Contraste suficiente: los colores muy claros (PVC blanco) llevan un borde más marcado. */
function isLight(hex: string): boolean {
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (!m) return false
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 200
}

export interface ColorSwatchProps {
  hex: string
  /** Segundo color para bicolor (mitad diagonal: exterior / interior). */
  hexIn?: string
  /**
   * Imagen de la textura (foliado de madera, metálico…): URL de datos o de objeto de una tesela.
   * Si existe, se muestra sobre el color (que queda como respaldo mientras carga).
   */
  image?: string
  name?: string
  /** sm 16 · md 24 · lg 32 · xl 48 (muestras de material en el catálogo). */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = { sm: 'size-4 rounded-[3px]', md: 'size-6 rounded-xs', lg: 'size-8 rounded-xs', xl: 'size-12 rounded-sm' }

/**
 * Muestra de material (marco PVC, foliado): cuadrada como una muestra física, con un brillo de canto
 * muy sutil. Nunca un círculo de color plano para un foliado con veta: pasa `image`.
 */
export function ColorSwatch({ hex, hexIn, image, name, size = 'md', className }: ColorSwatchProps) {
  const base = hexIn ? `linear-gradient(135deg, ${hex} 0 50%, ${hexIn} 50% 100%)` : hex
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      className={cn(
        'relative inline-block shrink-0 overflow-hidden border',
        isLight(hex) && !image ? 'border-control/60' : 'border-black/15 dark:border-white/15',
        sizes[size],
        className,
      )}
      style={{
        background: image ? `center / cover no-repeat url("${image}"), ${hex}` : base,
      }}
    >
      {/* Brillo de canto (luz arriba a la izquierda), como en los dibujos realistas. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255/0.22),transparent_45%,rgb(0_0_0/0.08))]" />
    </span>
  )
}

export interface ColorOption {
  id: string
  name: string
  hex: string
  /** Tesela de textura opcional (ver ColorSwatch.image). */
  image?: string
}

export interface ColorSwatchGroupProps {
  value: string | undefined
  onValueChange: (id: string) => void
  colors: ColorOption[]
  size?: 'md' | 'lg' | 'xl'
  className?: string
  'aria-label': string
}

/** Selector de color con muestras (teclado: flechas). La elegida lleva aro de acento separado. */
export function ColorSwatchGroup({ value, onValueChange, colors, size = 'md', className, ...aria }: ColorSwatchGroupProps) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      orientation="horizontal"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...aria}
    >
      {colors.map((color) => (
        <Tooltip key={color.id} content={color.name}>
          <RadioGroup.Item
            value={color.id}
            aria-label={color.name}
            className={cn(
              'relative inline-flex items-center justify-center rounded-sm p-[3px] transition-shadow duration-100 ease-out',
              'hover:shadow-[0_0_0_1px_var(--dk-divider-strong)] focus-visible:outline-offset-1',
              'data-[state=checked]:shadow-[0_0_0_2px_var(--dk-accent)]',
            )}
          >
            <ColorSwatch hex={color.hex} image={color.image} size={size} />
          </RadioGroup.Item>
        </Tooltip>
      ))}
    </RadioGroup.Root>
  )
}
