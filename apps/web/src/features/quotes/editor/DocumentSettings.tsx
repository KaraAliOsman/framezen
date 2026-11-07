/**
 * Ajustes del documento de esta cotización (secciones visibles, textos, vigencia, nota para el
 * cliente y notas por ventana): el panel `QuoteDocumentPanel` del módulo de documentos, conectado al
 * editor. Cada cambio es una sola entrada del historial (con el texto que entrega el panel) y se
 * guarda solo con la cotización; nada de esto toca los ajustes de la empresa ni las otras cotizaciones.
 */
import { useMemo } from 'react'
import type { DocLocale } from '@dekopen/shared'
import { useT } from '../../../lib/i18n'
import { QuoteDocumentPanel, type QuotePanelItem } from '../../documents'
import es from '../i18n/es'
import { useEditor, useEditorState } from './context'

export function DocumentSettings({ className }: { className?: string }) {
  const editor = useEditor()
  const overrides = useEditorState((s) => s.doc.documentOverrides)
  const rawItems = useEditorState((s) => s.doc.items)
  const orgPrefs = useEditorState((s) => s.settings.documents)
  const orgLocale = useEditorState((s) => s.settings.locale) as DocLocale | undefined
  const items = useMemo<QuotePanelItem[]>(() => rawItems.map((item) => ({ id: item.id, ref: item.ref, name: item.name })), [rawItems])
  return (
    <QuoteDocumentPanel
      className={className}
      overrides={overrides}
      items={items}
      orgPrefs={orgPrefs}
      orgLocale={orgLocale ?? 'es'}
      onChange={(next, change) => editor.setDocumentOverrides(next ?? undefined, change.label)}
    />
  )
}

/** Columna fija del documento (escritorio ancho): reemplaza al inspector de la ventana. */
export function DocumentColumn({ className }: { className?: string }) {
  const t = useT(es)
  return (
    <aside aria-label={t('doc.settings')} className={className}>
      <div className="flex h-12 shrink-0 items-center px-4">
        <h2 className="text-base font-medium text-fg-strong">{t('doc.settings')}</h2>
      </div>
      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto p-4">
        <DocumentSettings />
      </div>
    </aside>
  )
}
