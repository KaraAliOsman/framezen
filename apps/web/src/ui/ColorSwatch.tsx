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
  /** Segundo color para bicolor (mitad diagonal). */
  hexIn?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'size-4', md: 'size-6', lg: 'size-8' }

/** Muestra de color de material (marco PVC, foliado). */
export function ColorSwatch({ hex, hexIn, name, size = 'md', className }: ColorSwatchProps) {
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      className={cn(
        'inline-block shrink-0 rounded-full border',
        isLight(hex) ? 'border-paper-350/70' : 'border-black/10',
        sizes[size],
        className,
      )}
      style={{
        background: hexIn ? `linear-gradient(135deg, ${hex} 0 50%, ${hexIn} 50% 100%)` : hex,
      }}
    />
  )
}

export interface ColorOption {
  id: string
  name: string
  hex: string
}

export interface ColorSwatchGroupProps {
  value: string | undefined
  onValueChange: (id: string) => void
  colors: ColorOption[]
  size?: 'md' | 'lg'
  className?: string
  'aria-label': string
}

/** Selector de color con muestras (teclado: flechas). */
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
              'relative inline-flex items-center justify-center rounded-full p-0.5 ring-offset-0 transition-shadow duration-120 ease-out',
              'data-[state=checked]:shadow-[0_0_0_2px_var(--paper-0),0_0_0_3.5px_var(--ink-600)]',
            )}
          >
            <ColorSwatch hex={color.hex} size={size} />
          </RadioGroup.Item>
        </Tooltip>
      ))}
    </RadioGroup.Root>
  )
}
