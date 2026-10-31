import { useLayoutEffect, useRef, useState } from 'react'
import { Box } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import { WindowDrawing } from '@framezen/documents'
import { cn } from '../../lib/cn'
import { formatArea, formatCLP, formatNumber } from '../../lib/format'
import type { PortalItem } from './portalModel'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export type PortalView = 'interior' | 'exterior'

/** Una ventana tal como la ve el cliente: dibujo acotado, medidas, terminaciones y precio. */
export function PortalItemCard({
  item,
  catalog,
  can3d,
  onOpen3d,
}: {
  item: PortalItem
  catalog: Catalog
  can3d: boolean
  onOpen3d: (item: PortalItem) => void
}) {
  const [view, setView] = useState<PortalView>('interior')
  const [boxRef, boxWidth] = useWidth<HTMLDivElement>()
  const drawW = Math.max(160, Math.min(boxWidth - 40, 300))
  const drawH = Math.min(250, Math.round(drawW * 0.9))

  const details: { label: string; value: React.ReactNode }[] = [
    { label: 'Medidas', value: <span className="whitespace-nowrap">{item.size}</span> },
    { label: 'Cantidad', value: <span className="whitespace-nowrap">{`${formatNumber(item.qty)} ${item.qty === 1 ? 'unidad' : 'unidades'}`}</span> },
    ...(item.lineName ? [{ label: 'Línea', value: item.lineName }] : []),
    ...(item.colorName
      ? [
          {
            label: 'Color',
            value: (
              <span className="inline-flex items-center gap-1.5">
                {item.colorHex ? <span aria-hidden className="size-3 rounded-full border border-black/15" style={{ background: item.colorHex }} /> : null}
                {item.colorInName ? `${item.colorName} afuera, ${item.colorInName.toLowerCase()} adentro` : item.colorName}
              </span>
            ),
          },
        ]
      : []),
    ...(item.glassName ? [{ label: 'Vidrio', value: item.glassName }] : []),
    { label: 'Superficie', value: <span className="whitespace-nowrap">{item.qty > 1 ? `${formatArea(item.area)} c/u` : formatArea(item.area)}</span> },
  ]

  return (
    <article aria-labelledby={`item-${item.id}`} className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0 break-inside-avoid">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div ref={boxRef} className="relative flex flex-col border-paper-200 bg-paper-50 max-md:border-b md:border-r">
          <div className="flex flex-1 items-center justify-center px-5 pt-10 pb-4">
            {item.layout && boxWidth > 0 ? (
              <WindowDrawing
                layout={item.layout}
                design={item.design}
                catalog={catalog}
                view={view}
                dimensions="all"
                width={drawW}
                height={drawH}
                title={`${item.title}, vista ${view === 'interior' ? 'desde adentro' : 'desde afuera'}`}
              />
            ) : (
              <div style={{ height: drawH }} />
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-3 pb-3 print:hidden">
            <div role="radiogroup" aria-label="Ver la ventana desde" className="inline-flex rounded-sm border border-paper-200 bg-paper-0 p-0.5 text-[12px]">
              {(['interior', 'exterior'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    'h-7 rounded-[4px] px-2.5 font-medium whitespace-nowrap transition-colors duration-120 touch:h-9',
                    view === v ? 'bg-paper-100 text-paper-900' : 'text-paper-600 hover:text-paper-900',
                  )}
                >
                  {v === 'interior' ? 'Adentro' : 'Afuera'}
                </button>
              ))}
            </div>
            {can3d && item.layout ? (
              <button
                type="button"
                onClick={() => onOpen3d(item)}
                className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-paper-200 bg-paper-0 px-2.5 text-[12px] font-medium whitespace-nowrap text-paper-900 transition-colors duration-120 hover:bg-paper-100 touch:h-10"
              >
                <Box aria-hidden strokeWidth={1.75} className="size-3.5" />
                Ver en 3D
              </button>
            ) : null}
          </div>
          <span className="absolute top-3 left-3 inline-flex h-6 items-center rounded-xs border border-paper-200 bg-paper-0 px-1.5 text-[12px] font-semibold text-[var(--brand-ink)] tabular">
            {item.ref}
          </span>
        </div>

        <div className="flex min-w-0 flex-col p-5 sm:p-6">
          <div className="min-w-0">
            {item.location || item.name ? (
              <p className="truncate text-[13px] text-paper-600">{[item.name, item.location].filter(Boolean).join(' · ')}</p>
            ) : null}
            <h3 id={`item-${item.id}`} className="mt-0.5 text-h3 font-semibold tracking-[-0.01em] text-paper-900">
              {item.title}
            </h3>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-[13px] leading-[18px]">
            {details.map((d) => (
              <div key={d.label} className="min-w-0">
                <dt className="text-paper-600">{d.label}</dt>
                <dd className="mt-0.5 text-paper-900 tabular">{d.value}</dd>
              </div>
            ))}
          </dl>
          {item.notes ? <p className="mt-4 rounded-sm bg-paper-50 px-3 py-2 text-[13px] leading-[19px] text-paper-900">{item.notes}</p> : null}
          <div className="mt-auto flex items-end justify-between gap-3 border-t border-paper-200 pt-4 max-md:mt-5 md:mt-6">
            <span className="text-[13px] text-paper-600 tabular">{item.qty > 1 ? `${formatCLP(item.unitNet)} c/u` : 'Precio neto'}</span>
            <span className="text-h3 font-semibold text-paper-900 tabular">{formatCLP(item.totalNet)}</span>
          </div>
        </div>
      </div>
    </article>
  )
}
