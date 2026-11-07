/**
 * Tarjeta de la galería: miniatura real de la primera hoja (se dibuja al entrar en pantalla),
 * nombre, estilo de origen y «Predeterminada». Acciones al pasar el puntero y al enfocar.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { MoreHorizontal, Star } from 'lucide-react'
import { DOC_PRESET_TRAITS, isDocPresetId, presetDescription, presetName, type DocTemplateRecord } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useLocale, useT } from '../../../lib/i18n'
import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, IconButton, Skeleton } from '../../../ui'
import es from '../i18n/es'

export interface TemplateCardProps {
  record: DocTemplateRecord
  /** Dibuja la miniatura (se llama sólo cuando la tarjeta es visible). */
  thumbnail: () => ReactNode
  onOpen: () => void
  /** Acción principal visible al pasar (p. ej. «Usar»). */
  primary?: ReactNode
  /** Ítems del menú «Más acciones». */
  menu?: ReactNode
  showDescription?: boolean
}

function useVisible<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true)
        io.disconnect()
      }
    }, { rootMargin: '240px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  return [ref, visible]
}

export function TemplateCard({ record, thumbnail, onOpen, primary, menu, showDescription }: TemplateCardProps) {
  const t = useT(es)
  const fmt = useFormat()
  const { locale } = useLocale()
  const [ref, visible] = useVisible<HTMLDivElement>()
  const name = record.builtin && isDocPresetId(record.id) ? presetName(record.id, locale) : record.name
  const traits = record.builtin && isDocPresetId(record.id) ? DOC_PRESET_TRAITS[record.id] : undefined
  return (
    <article className="group relative flex flex-col gap-2.5" data-template-id={record.id}>
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-panel bg-sunken p-4 transition-colors duration-100 group-hover:bg-hover group-focus-within:bg-hover',
          record.isDefault && 'outline outline-offset-2 outline-accent',
        )}
      >
        <button type="button" onClick={onOpen} className="block w-full rounded-xs text-left" aria-label={name}>
          <div className="overflow-hidden rounded-xs bg-white shadow-raised transition-shadow duration-100 group-hover:shadow-float">
            {visible ? thumbnail() : <Skeleton className="aspect-[1/1.294] w-full rounded-none" />}
          </div>
        </button>
        {primary || menu ? (
          <div className="pointer-events-none absolute inset-x-5 bottom-5 flex justify-end gap-1.5 opacity-0 transition-opacity duration-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            {primary}
            {menu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} size="sm" variant="secondary" label={t('card.more')} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 items-start justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium text-fg-strong">{name}</h3>
          <p className="truncate text-meta text-fg-muted">
            {record.builtin
              ? traits
                ? `${t(`traits.audience.${traits.audience}`)} · ${t(`traits.style.${traits.style}`)}`
                : ''
              : record.presetId
                ? t('card.basedOn', { name: presetName(record.presetId, locale) })
                : t('card.fromAi')}
            {!record.builtin && record.updatedAt ? ` · ${t('card.updated', { when: fmt.relative(record.updatedAt) })}` : ''}
          </p>
        </div>
        {record.isDefault ? (
          <Badge tone="accent" size="sm" icon={<Star aria-hidden className="size-3" />} className="shrink-0">
            {t('card.default')}
          </Badge>
        ) : null}
      </div>
      {showDescription && record.builtin && isDocPresetId(record.id) ? <p className="-mt-1 line-clamp-2 px-0.5 text-meta text-fg-muted">{presetDescription(record.id, locale)}</p> : null}
    </article>
  )
}
