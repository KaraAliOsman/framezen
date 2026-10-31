/**
 * Vista previa en vivo del documento para el cliente, con la plantilla elegida y edición de
 * textos en el lugar (cada edición entra al historial y se guarda sola). La escala calza el
 * ancho del panel, igual que la hoja impresa.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { DocumentStyles, mergeQuoteDocPrefs, PAPER_SIZE, QUOTE_TEMPLATES, QuoteDocument, themeFromPrefs, type QuoteDocField } from '@framezen/documents'
import type { QuoteTemplateId } from '@framezen/shared'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { Select } from '../../../ui'
import { buildEditorDocData, DOCUMENT_FONT_CSS } from '../lib/document'
import { portalUrl } from '../lib/share'
import { composeQuote } from '../model/doc'
import { useEditor, useEditorShallow, useEditorUi, useMediaQuery } from './context'

const FIELD_LABELS: Record<QuoteDocField, string> = {
  intro: 'Editar saludo del documento',
  conditions: 'Editar condiciones',
  paymentTerms: 'Editar forma de pago',
  warranty: 'Editar garantía',
  leadTimeText: 'Editar plazo de entrega',
  validityDays: 'Editar validez',
  signatureName: 'Editar firma',
  footer: 'Editar pie de página',
  title: 'Cambiar nombre de la obra',
  notes: 'Editar nota para el cliente',
}

export function useDocTemplate(): QuoteTemplateId {
  return useEditorShallow((s) => ({ t: mergeQuoteDocPrefs(s.settings.documents, s.doc.documentOverrides).quoteTemplate })).t
}

export function TemplatePicker({ className }: { className?: string }) {
  const editor = useEditor()
  const template = useDocTemplate()
  const orgTemplate = useEditorShallow((s) => ({ t: s.settings.documents?.quoteTemplate ?? 'esencial' })).t
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Select<QuoteTemplateId>
        size="sm"
        value={template}
        onValueChange={(value) => {
          const name = QUOTE_TEMPLATES.find((t) => t.id === value)?.name ?? value
          editor.setDocumentOverride({ quoteTemplate: value === orgTemplate ? undefined : value }, `Diseño del documento: ${name}`)
        }}
        options={QUOTE_TEMPLATES.map((t) => ({ value: t.id, label: t.name, description: t.bestFor, leading: <LayoutTemplate aria-hidden strokeWidth={1.75} className="size-3.5 text-paper-600" /> }))}
        className="w-44 max-w-full min-w-0"
        aria-label="Diseño del documento"
      />
    </div>
  )
}

export function DocumentPreview() {
  const editor = useEditor()
  const session = useSession()
  const state = useEditorShallow((s) => ({
    meta: s.meta,
    doc: s.doc,
    evaluation: s.evaluation,
    catalog: s.catalog,
    settings: s.settings,
    client: s.doc.clientId ? s.clients[s.doc.clientId] : undefined,
  }))

  const data = useMemo(
    () =>
      buildEditorDocData({
        quote: composeQuote(state.meta, state.doc, { client: state.client, totals: state.evaluation.totals }),
        org: session.org,
        catalog: state.catalog,
        settings: state.settings,
        client: state.client,
        evaluation: state.evaluation,
        portalUrl: state.meta.shareToken ? portalUrl(state.meta.shareToken) : undefined,
      }),
    [state.meta, state.doc, state.client, state.evaluation, state.catalog, state.settings, session.org],
  )
  const theme = themeFromPrefs(data.prefs, data.org.accent)
  const pageWidth = PAPER_SIZE[theme.paper]?.width ?? 816

  // «Ajustar al ancho» calza la hoja en el panel (sin pasar del tamaño real); «100 %» la deja en
  // tamaño real, con desplazamiento lateral si el panel es angosto.
  const zoom = useEditorUi((s) => s.docZoom)
  const boxRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0.7)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const width = el.clientWidth
      // La hoja más su margen de 16 px por lado (que también escala) calza en el panel.
      if (width > 0) setFit(Math.min(1, Math.max(0.3, width / (pageWidth + 32))))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageWidth])
  const scale = zoom === 'actual' ? 1 : fit

  const touch = useMediaQuery('(pointer: coarse)')
  const onEdit = (field: QuoteDocField, value: string) => {
    const label = FIELD_LABELS[field]
    if (field === 'title') {
      editor.setTitle(value)
      return
    }
    if (field === 'validityDays') {
      const n = Number.parseInt(value.replace(/\D/g, ''), 10)
      editor.setDocumentOverride({ validityDays: Number.isFinite(n) ? n : undefined }, label)
      return
    }
    editor.setDocumentOverride({ [field]: value }, label)
  }

  return (
    <div ref={boxRef} className="scrollbar-quiet absolute inset-0 overflow-auto bg-paper-100">
      <style>{DOCUMENT_FONT_CSS}</style>
      <DocumentStyles theme={theme} />
      {/* w-max + min-w-full: a 100 % en un panel angosto la hoja se desplaza completa (no se corta a la izquierda). */}
      <div className="w-max min-w-full px-4 py-4" style={{ zoom: scale }} data-doc-scale={scale.toFixed(2)}>
        <QuoteDocument data={data} template={data.prefs.quoteTemplate} editable onEdit={onEdit} />
      </div>
      <p className="px-4 pb-6 text-center text-meta text-paper-600">{touch ? 'Toca' : 'Haz clic en'} cualquier texto del documento para cambiarlo solo en esta cotización.</p>
    </div>
  )
}
