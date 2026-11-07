/**
 * Selector de color de perfil con muestras realistas (veta, granulado, cepillado, texturas subidas):
 * cuadradas como una muestra física, nunca un punto plano para un foliado. Con muchos colores se
 * agrupan por terminación (lisos, madera, texturados, metalizados) y los propios del taller van al
 * final. Debajo, el nombre del color elegido y su terminación.
 */
import { useMemo } from 'react'
import type { Color, ColorFinish } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { ColorSwatchGroup, type ColorOption } from '../../../ui/ColorSwatch'
import es from '../i18n/es'
import { swatchAppearance } from '../lib/appearance'

export interface ColorPickerProps {
  colors: Color[]
  value: string | undefined
  onChange: (colorId: string) => void
  'aria-label': string
  size?: 'md' | 'lg'
  /** Muestra el nombre y la terminación del color elegido debajo de las muestras. */
  showSelected?: boolean
  className?: string
}

type GroupId = ColorFinish | 'own'
const ORDER: GroupId[] = ['smooth', 'woodgrain', 'textured', 'metallic', 'own']
/** Desde cuántos colores conviene agruparlos por terminación. */
const GROUP_FROM = 9

export function colorOption(color: Color): ColorOption & { finish: ColorFinish; custom: boolean } {
  const look = swatchAppearance(color)
  return { id: color.id, name: color.name, hex: look.hex, image: look.image, finish: look.finish, custom: look.custom }
}

export function ColorPicker({ colors, value, onChange, size = 'lg', showSelected = true, className, ...aria }: ColorPickerProps) {
  const t = useT(es)
  const options = useMemo(() => colors.map(colorOption), [colors])
  const selected = options.find((o) => o.id === value)
  const groups = useMemo(() => {
    if (options.length < GROUP_FROM) return null
    const by = new Map<GroupId, typeof options>()
    for (const o of options) {
      const id: GroupId = o.custom ? 'own' : o.finish
      by.set(id, [...(by.get(id) ?? []), o])
    }
    return ORDER.filter((id) => by.has(id)).map((id) => ({ id, items: by.get(id)! }))
  }, [options])

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {groups && groups.length > 1 ? (
        groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-1">
            <span className="text-meta text-fg-muted">{t(`colors.${g.id}`)}</span>
            <ColorSwatchGroup aria-label={`${aria['aria-label']} · ${t(`colors.${g.id}`)}`} value={value} onValueChange={onChange} colors={g.items} size={size} className="gap-1!" />
          </div>
        ))
      ) : (
        <ColorSwatchGroup aria-label={aria['aria-label']} value={value} onValueChange={onChange} colors={options} size={size} className="gap-1!" />
      )}
      {showSelected && selected ? (
        <p className="flex min-w-0 items-baseline gap-1.5 text-table">
          <span className="truncate font-medium text-fg">{selected.name}</span>
          <span className="shrink-0 text-fg-muted">· {selected.custom ? t('colors.custom') : t(`colors.finish.${selected.finish}`)}</span>
        </p>
      ) : null}
    </div>
  )
}
