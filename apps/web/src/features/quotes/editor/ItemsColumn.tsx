/**
 * Columna izquierda sobre el mismo fondo hundido del escenario: las ventanas de la cotización con su
 * miniatura realista, los extras de la obra como filas bajas y «Agregar ventana» siempre a mano.
 */
import { Plus } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Button } from '../../../ui'
import es from '../i18n/es'
import { useEditorShallow, useEditorState, useEditorUi } from './context'
import { ItemsList } from './ItemsList'
import { countedUnits } from './names'

export function ItemsColumn({ className }: { className?: string }) {
  const t = useT(es)
  const g = useGlossary()
  const setUi = useEditorUi((s) => s.set)
  const { count, units, docView } = useEditorShallow((s) => ({ count: s.doc.items.length, units: countedUnits(s.doc.items, s.evaluation.items), docView: s.view === 'document' }))

  return (
    <aside aria-label={t('items.aria')} data-assistant-anchor="items" className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 pr-4 pl-5">
        <h2 className="text-base font-medium text-fg-strong">{t('items.heading')}</h2>
        {count > 0 ? <span className="text-meta whitespace-nowrap tabular text-fg-muted">{t('items.count', { windows: g.count('windows', count), units: g.count('pieces', units) })}</span> : null}
      </div>

      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {count > 0 ? (
          <>
            <ItemsList />
            <ExtrasRows />
          </>
        ) : null}
      </div>

      {/* Sin ventanas, el escenario ya ofrece agregar la primera: un solo botón. */}
      {count > 0 || docView ? (
        <div className="shrink-0 p-2">
          <Button variant="subtle" icon={Plus} shortcut="a" className="w-full" onClick={() => setUi({ pickerOpen: true })}>
            {t('items.add')}
          </Button>
        </div>
      ) : null}
    </aside>
  )
}

/** Extras de la obra (instalación, despacho…) como filas bajas bajo las ventanas. */
function ExtrasRows() {
  const t = useT(es)
  const fmt = useFormat()
  const extras = useEditorState((s) => s.doc.extras)
  const setUi = useEditorUi((s) => s.set)
  if (!extras.length) return null
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setUi({ inspectorTab: 'quote', inspectorOpen: true })}
        className="flex h-7 w-full items-center rounded-xs px-3 text-meta font-medium text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg"
        aria-label={t('items.extrasEdit')}
      >
        {t('items.extras')}
      </button>
      <ul>
        {extras.map((extra) => (
          <li key={extra.id} className="flex h-8 items-center justify-between gap-3 px-3 text-table">
            <span className="min-w-0 truncate text-fg">{extra.label || t('items.extraUntitled')}</span>
            <span className="shrink-0 tabular text-fg-muted">{fmt.money(extra.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
