import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Box } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import { WindowDrawing } from '@dekopen/documents'
import type { PublicQuoteMark } from '@dekopen/shared'
import { cn } from '../../lib/cn'
import { useFormat, useGlossary, useT, type GlossaryHelpers } from '../../lib/i18n'
import { buttonClass } from '../../ui/Button'
import { ColorSwatch } from '../../ui/ColorSwatch'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Switch } from '../../ui/Switch'
import es from './i18n/es'
import type { PortalItem } from './portalModel'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export type PortalView = 'interior' | 'exterior'

/** Qué muestra cada ventana (los mismos interruptores que el PDF del taller). */
/** Logos que el taller eligió mostrar. Una marca sin logo no se escribe. */
export function PortalMarks({ marks, className }: { marks: readonly PublicQuoteMark[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2', className)}>
      {marks.map((mark) => (
        <img key={`${mark.kind}:${mark.brandId ?? mark.name}`} src={mark.src} alt={mark.name} className="h-5 w-auto max-w-32 object-contain" />
      ))}
    </div>
  )
}

export interface PortalItemPrefs {
  showUnitPrice?: boolean
  showArea?: boolean
  showGlass?: boolean
  showLine?: boolean
  showColorSwatch?: boolean
}

/**
 * Nombre de la ventana en el idioma del documento: la tipología del glosario si el motor la
 * reconoce; si no, el nombre del motor (español) o «Ventana» traducido.
 */
export function portalItemTitle(item: Pick<PortalItem, 'typologyId' | 'title' | 'design'>, g: Pick<GlossaryHelpers, 'locale' | 'typology' | 'term'>): string {
  if (item.typologyId) return g.typology(item.typologyId, item.title)
  // Un conjunto ya viene con su nombre en el idioma del cliente.
  return g.locale === 'es' || item.design?.assembly ? item.title : g.term('product.window')
}

/**
 * Una ventana tal como la ve el cliente: el dibujo manda, a todo el ancho del recorrido, y debajo
 * lo que está comprando. Sin caja: las ventanas se separan con aire.
 */
export function PortalItemCard({
  item,
  catalog,
  can3d,
  onOpen3d,
  currency,
  prefs = {},
  choice,
  marks,
}: {
  item: PortalItem
  catalog: Catalog
  can3d: boolean
  onOpen3d: (item: PortalItem) => void
  currency?: string
  prefs?: PortalItemPrefs
  /** Solo en opcionales y alternativas. Sin `onChange`, ya se aceptó: se muestra lo que quedó. */
  choice?: { on: boolean; onChange?: (on: boolean) => void }
  /** Logos de marca y herrajes de esta ventana. */
  marks?: readonly PublicQuoteMark[]
}) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat({ locale: t.locale, currency })
  const [view, setView] = useState<PortalView>('interior')
  const [boxRef, boxWidth] = useWidth<HTMLDivElement>()
  const drawW = Math.max(200, Math.min(boxWidth - 48, 560))
  const drawH = boxWidth >= 560 ? 340 : 264
  const title = portalItemTitle(item, g)
  const place = [item.name, item.location].filter(Boolean).join(' · ')

  const colorText = item.colorName
    ? item.colorInName
      ? t('item.colorInOut', { out: item.colorName, in: item.colorInName })
      : item.colorName
    : undefined

  const details: { label: string; value: ReactNode }[] = [
    { label: t('item.size'), value: <span className="tabular whitespace-nowrap">{fmt.size(item.width, item.height)}</span> },
    ...(item.qty > 1 ? [{ label: t('item.quantity'), value: <span className="tabular whitespace-nowrap">{g.count('pieces', item.qty)}</span> }] : []),
    ...(item.lineName && prefs.showLine !== false ? [{ label: t('item.line'), value: item.lineName }] : []),
    ...(colorText
      ? [
          {
            label: t('item.color'),
            value: (
              <span className="inline-flex items-center gap-1.5">
                {prefs.showColorSwatch !== false && item.colorHex ? <ColorSwatch hex={item.colorHex} hexIn={item.colorInHex} size="sm" /> : null}
                <span className="min-w-0">{colorText}</span>
              </span>
            ),
          },
        ]
      : []),
    ...(item.glassName && prefs.showGlass !== false ? [{ label: t('item.glass'), value: item.glassName }] : []),
    ...(item.accessories.length ? [{ label: t('item.accessories'), value: item.accessories.join(' · ') }] : []),
    ...(prefs.showArea !== false
      ? [
          {
            label: t('item.area'),
            value: <span className="tabular whitespace-nowrap">{item.qty > 1 ? t('item.areaEach', { area: fmt.area(item.area) }) : fmt.area(item.area)}</span>,
          },
        ]
      : []),
  ]

  return (
    <article aria-labelledby={`item-${item.id}`} className="break-inside-avoid">
      {choice ? (
        <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="min-w-0 text-table text-fg-muted">
            {item.role === 'alternative' ? (item.altLabel ? t('item.alternativeOf', { group: item.altLabel }) : t('item.alternative')) : t('item.optional')}
            {!choice.on ? ` · ${t('item.notIncluded')}` : ''}
          </p>
          {!choice.onChange ? null : item.role === 'alternative' ? (
            <button type="button" aria-pressed={choice.on} disabled={choice.on} onClick={() => choice.onChange?.(true)} className={buttonClass(choice.on ? 'ghost' : 'secondary', 'sm')}>
              {choice.on ? t('item.chosen') : t('item.choose')}
            </button>
          ) : (
            <Switch label={t('item.include')} checked={choice.on} onCheckedChange={choice.onChange} />
          )}
        </div>
      ) : null}
      <div ref={boxRef} className={choice && !choice.on ? 'relative rounded-panel bg-sunken opacity-55' : 'relative rounded-panel bg-sunken'}>
        <div className="flex items-center justify-center px-4 pt-6 pb-16">
          {item.layout && boxWidth > 0 ? (
            <WindowDrawing
              layout={item.layout}
              design={item.design}
              catalog={catalog}
              view={view}
              locale={t.locale}
              dimensions="total"
              width={drawW}
              height={drawH}
              title={view === 'interior' ? t('item.drawingInside', { title }) : t('item.drawingOutside', { title })}
            />
          ) : (
            <div style={{ height: drawH }} />
          )}
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 print:hidden">
          <SegmentedControl
            size="sm"
            aria-label={t('item.viewFrom')}
            value={view}
            onValueChange={setView}
            options={[
              { value: 'interior', label: t('item.inside') },
              { value: 'exterior', label: t('item.outside') },
            ]}
          />
          {can3d && item.layout ? (
            <button type="button" onClick={() => onOpen3d(item)} className={buttonClass('ghost', 'sm')}>
              <Box aria-hidden strokeWidth={1.75} />
              {t('item.view3d')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-table text-fg-muted">
            <span className="tabular font-medium text-[var(--brand-ink)]">{item.ref}</span>
            {place ? ` · ${place}` : ''}
          </p>
          <h3 id={`item-${item.id}`} className="mt-0.5 font-display text-h3 font-medium text-fg-strong">
            {title}
          </h3>
        </div>
        {item.pending ? (
          // Sin precio no hay cifra: ni $0, ni la parte que sí tiene precio.
          <p className="shrink-0 text-right text-table text-fg-muted">{t('item.pricePending')}</p>
        ) : prefs.showUnitPrice !== false ? (
          <p className="shrink-0 text-right">
            <span className="tabular block text-lead font-medium text-fg-strong">{fmt.money(item.totalNet)}</span>
            <span className="tabular block text-meta text-fg-muted">{item.qty > 1 ? t('item.priceEach', { price: fmt.money(item.unitNet) }) : t('item.netPrice')}</span>
          </p>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-table sm:grid-cols-3">
        {details.map((d) => (
          <div key={d.label} className="min-w-0">
            <dt className="text-fg-muted">{d.label}</dt>
            <dd className="mt-0.5 text-fg">{d.value}</dd>
          </div>
        ))}
      </dl>
      {marks?.length ? <PortalMarks marks={marks} className="mt-4" /> : null}
      {item.notes ? <p className="mt-4 text-table whitespace-pre-line text-fg-muted">{item.notes}</p> : null}
    </article>
  )
}
