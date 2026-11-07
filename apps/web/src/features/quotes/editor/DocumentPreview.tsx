/**
 * Documento para el cliente dentro del editor: datos vivos del documento, idioma del documento y la
 * hoja real, editable en el lugar con `DocCanvas`. Cada edición es una `DocOp` sobre los ajustes de
 * esta cotización: entra al historial y se guarda sola, sin tocar la plantilla (`DocScope` decide
 * llevarla ahí). La elección del diseño vive en `TemplateGallery`.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Languages } from 'lucide-react'
import type { QuoteDocData } from '@dekopen/documents'
import { DOC_LOCALES, LOCALE_META, getDocPreset, isDocPresetId, resolveDocTemplateRef, resolveQuoteDocument, type DocLocale, type DocOp, type DocTemplate, type DocTemplateListResponse, type QuoteDocOverridesV2 } from '@dekopen/shared'
import { request } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { Select, toast } from '../../../ui'
import { DocCanvas, DocChecks, DocScope, applyQuoteOps, useDocChecks } from '../../documents'
import es from '../i18n/es'
import { buildEditorDocData, DOCUMENT_FONT_CSS, previewPageWidth, QuotePreview } from '../lib/document'
import { portalUrl } from '../lib/share'
import { composeQuote } from '../model/doc'
import { ql } from '../model/history'
import { useImageData } from '../../documents/api'
import { brandLogoIdsOf, templateAssetIdsOf } from '../../documents/model/assets'
import { useEditor, useEditorShallow, useEditorState, useEditorUi } from './context'

const DOC_FIELDS = ['intro', 'conditions', 'paymentTerms', 'warranty', 'leadTimeText', 'signatureName', 'footer', 'includes', 'excludes'] as const

/** Plantillas propias de la organización (si la API no responde, solo los diseños predefinidos). */
export function useQuoteTemplates() {
  return useQuery({
    queryKey: ['templates', 'list', 'quote'],
    queryFn: () => request<DocTemplateListResponse>('/templates', { query: { kind: 'quote' } }),
    staleTime: 60_000,
    retry: false,
  })
}

/** Id de la plantilla predeterminada de la organización (la de tus ajustes). */
export function useOrgTemplateId(): string {
  const list = useQuoteTemplates()
  const legacy = useEditorShallow((s) => ({ t: s.settings.documents?.quoteTemplate })).t
  return list.data?.defaults?.quote ?? resolveDocTemplateRef(legacy, 'quote').id
}

/** Plantilla elegida para esta cotización (o la de la organización): id de diseño o de plantilla propia. */
export function useDocTemplateId(): string {
  const orgId = useOrgTemplateId()
  const chosen = useEditorShallow((s) => ({ t: s.doc.documentOverrides?.templateId })).t
  return chosen ? resolveDocTemplateRef(chosen, 'quote').id : orgId
}

/** Idioma del documento: el de la cotización o el de tus ajustes (español por defecto). */
export function useDocLocale(): { locale: DocLocale; own: boolean; orgLocale: DocLocale } {
  return useEditorShallow((s) => {
    const org = (s.settings.locale as DocLocale | undefined) ?? 'es'
    const own = s.doc.documentOverrides?.locale
    return { locale: own ?? org, own: !!own, orgLocale: org }
  })
}

export function DocumentLanguagePicker({ className, block = false }: { className?: string; block?: boolean }) {
  const t = useT(es)
  const editor = useEditor()
  const { locale, orgLocale } = useDocLocale()
  return (
    <Select<DocLocale>
      size="sm"
      value={locale}
      onValueChange={(next) => editor.setDocumentOverride({ locale: next === orgLocale ? null : next }, ql('history.locale', { name: LOCALE_META[next].label }))}
      options={DOC_LOCALES.map((l) => ({
        value: l,
        label: l === orgLocale ? t('doc.languageDefault', { language: LOCALE_META[l].label }) : LOCALE_META[l].label,
        leading: <Languages aria-hidden strokeWidth={1.75} className="size-3.5 text-fg-muted" />,
      }))}
      className={cn(block ? 'w-full' : 'w-44 max-w-full min-w-0', className)}
      aria-label={t('doc.language')}
    />
  )
}

/** Datos del documento con el estado vivo del editor (los mismos que imprime el servidor). */
export function useQuoteDocData(extraAssets: readonly string[] = []): QuoteDocData {
  const session = useSession()
  const state = useEditorShallow((s) => ({
    meta: s.meta,
    doc: s.doc,
    evaluation: s.evaluation,
    catalog: s.catalog,
    settings: s.settings,
    client: s.doc.clientId ? s.clients[s.doc.clientId] : undefined,
  }))
  // Los logos de marca y las fotos del documento viven como imágenes: sin esto la hoja no sería la del PDF.
  const logos = useImageData([...brandLogoIdsOf(state.settings.documents), ...extraAssets])
  return useMemo(() => {
    const data = buildEditorDocData({
      quote: composeQuote(state.meta, state.doc, { client: state.client, totals: state.evaluation.totals }),
      org: session.org,
      catalog: state.catalog,
      settings: state.settings,
      client: state.client,
      evaluation: state.evaluation,
      portalUrl: state.meta.shareToken ? portalUrl(state.meta.shareToken) : undefined,
    })
    const document = (data as { document?: { assets?: Record<string, string> } }).document
    return logos.data && document ? ({ ...data, document: { ...document, assets: { ...document.assets, ...logos.data } } } as QuoteDocData) : data
  }, [state.meta, state.doc, state.client, state.evaluation, state.catalog, state.settings, session.org, logos.data])
}

export function DocumentPreview() {
  const t = useT(es)
  const { locale: uiLocale } = useLocale()
  const editor = useEditor()
  const templateId = useDocTemplateId()
  const list = useQuoteTemplates()
  const { locale, orgLocale } = useDocLocale()
  const record = list.data?.templates.find((r) => r.id === templateId)
  const ownTemplate: DocTemplate | undefined = record?.template
  const overrides = useEditorState((s) => s.doc.documentOverrides)
  const orgPrefs = useEditorState((s) => s.settings.documents)

  // Plantilla base y, encima, lo de esta cotización: lo mismo que imprime el servidor.
  const base = useMemo<DocTemplate>(() => ownTemplate ?? getDocPreset(isDocPresetId(templateId) ? templateId : resolveDocTemplateRef(templateId, 'quote').fallbackPresetId), [ownTemplate, templateId])
  const resolved = useMemo(() => resolveQuoteDocument({ template: base, orgPrefs, overrides, brandAccent: null, orgLocale }), [base, orgPrefs, overrides, orgLocale])
  const data = useQuoteDocData(useMemo(() => templateAssetIdsOf(resolved.template), [resolved.template]))
  const pageWidth = previewPageWidth(data, ownTemplate ?? templateId)
  const [selected, setSelected] = useState<string | null>(null)
  const [finalView, setFinalView] = useState(false)

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

  const checks = useDocChecks(data, ownTemplate ?? templateId)

  // Las operaciones se aplican sobre lo vigente (no sobre lo que había al dibujar).
  const latest = useRef({ base, uiLocale })
  latest.current = { base, uiLocale }
  const apply = useCallback(
    (ops: DocOp[]) => {
      const result = applyQuoteOps(editor.get().doc.documentOverrides, ops, latest.current.base, latest.current.uiLocale as DocLocale)
      if (!result.ok) {
        const issue = result.issues.find((i) => i.severity === 'error')
        if (issue) toast.warning(issue.message, { id: 'doc-issue' })
        return
      }
      if (result.changed) editor.setDocumentOverrides(result.next ?? undefined, result.label)
    },
    [editor],
  )
  const replace = useCallback((next: QuoteDocOverridesV2 | null, label: string) => editor.setDocumentOverrides(next ?? undefined, label), [editor])

  const onEdit = useCallback(
    (field: string, value: string) => {
      if (field === 'title') {
        editor.setTitle(value)
        return
      }
      const label = t.has(`doc.fields.${field}`) ? ql(`doc.fields.${field}` as Parameters<typeof ql>[0]) : ql('history.docText')
      if (field === 'validityDays') {
        const n = Number.parseInt(value.replace(/\D/g, ''), 10)
        editor.setDocumentOverride({ validityDays: Number.isFinite(n) ? n : null }, label)
        return
      }
      if (field === 'docTitle') {
        apply([{ op: 'setDocSettings', patch: { customTitle: value.trim() ? value : null } } as DocOp])
        return
      }
      if (field === 'notes' || field === 'clientNote') {
        editor.setDocumentOverride({ texts: { clientNote: value } }, label)
        return
      }
      if ((DOC_FIELDS as readonly string[]).includes(field)) editor.setDocumentOverride({ texts: { [field]: value } }, label)
    },
    [apply, editor, t],
  )
  const onSectionEdit = useCallback(
    (sectionId: string, slot: 'title' | 'subtitle' | 'content', value: string) => apply([{ op: 'setSectionText', sectionId, slot, value: value.trim() ? value : null }]),
    [apply],
  )
  const onItemEdit = useCallback(
    (itemId: string, field: 'name' | 'note', value: string) => {
      if (field === 'name') editor.updateItem(itemId, { name: value.trim() || undefined })
      else apply([{ op: 'setItemNote', itemId, note: value.trim() ? value : null }])
    },
    [apply, editor],
  )
  const texts = useMemo(
    () => ({ warranty: resolved.texts.warranty, paymentTerms: resolved.texts.paymentTerms, validityDays: resolved.validityDays ? String(resolved.validityDays) : '' }),
    [resolved],
  )
  const selectedSection = resolved.template.sections.find((s) => s.id === selected)
  // Solo estas secciones ofrecen textos opcionales al elegirlas: las demás no se vuelven a dibujar.
  const optional = selectedSection?.type === 'cover' || selectedSection?.type === 'custom_text' ? selected ?? undefined : undefined

  return (
    <div ref={boxRef} className="scrollbar-quiet absolute inset-0 overflow-auto bg-sunken">
      <style>{DOCUMENT_FONT_CSS()}</style>
      <DocChecks checks={checks} className="mx-auto max-w-[816px] px-4 pt-4" />
      <DocScope base={base} record={record} resolved={resolved.template} overrides={overrides} final={finalView} onFinal={setFinalView} onOps={apply} onReplace={replace} canSave={list.data?.canEdit ?? false} />
      {/* w-max + min-w-full: a 100 % en un panel angosto la hoja se desplaza completa (no se corta a la izquierda). */}
      <div className="w-max min-w-full px-4 py-4" style={{ zoom: scale }} data-doc-scale={scale.toFixed(2)}>
        <DocCanvas template={resolved.template} scope="quote" readOnly={finalView} selectedId={selected} onSelect={setSelected} onOps={apply} texts={texts} onText={onEdit}>
          {finalView ? <QuotePreview data={data} template={ownTemplate ?? templateId} locale={locale} /> : <QuotePreview data={data} template={ownTemplate ?? templateId} locale={locale} editable onEdit={onEdit} onSectionEdit={onSectionEdit} onItemEdit={onItemEdit} selectedSectionId={optional} />}
        </DocCanvas>
      </div>
    </div>
  )
}
