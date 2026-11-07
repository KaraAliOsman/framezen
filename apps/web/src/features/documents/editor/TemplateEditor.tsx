/**
 * Editor de plantillas (pantalla completa dentro del shell): secciones a la izquierda, la hoja real al
 * centro, editable en el lugar con `DocCanvas` (el mismo lienzo de una cotización), y el inspector a la
 * derecha (Sección · Tema · Página · IA). Cada cambio es una DocOp con su paso de deshacer; todo se
 * guarda solo. Los estilos DEKOPEN se ven aquí en modo lectura con «Duplicar y editar».
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Copy, Eye, MoreHorizontal, Redo2, RotateCcw, SlidersHorizontal, Star, Trash2, Undo2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import {
  DOC_LOCALES,
  LOCALE_META,
  describeDocOp,
  getDocPreset,
  isDocPresetId,
  presetName,
  resolveDocSettings,
  type DocLocale,
  type DocOp,
  type DocTemplateRecord,
  type DocumentPrefs,
} from '@dekopen/shared'
import type { QuoteDocField } from '@dekopen/documents'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useMe, useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useLocale, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import { useShortcut } from '../../../lib/useShortcut'
import { useMediaQuery } from '../useMediaQuery'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Inspector,
  Notice,
  SaveIndicator,
  Select,
  SegmentedControl,
  Sheet,
  SheetContent,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarSpacer,
  toast,
  toastUndo,
} from '../../../ui'
import { brandLogoIdsOf, templateAssetIdsOf } from '../model/assets'
import { canRedo, canUndo, createEditorState, editorReducer, type EditorEntry } from '../model/editor'
import { presetRecords, useImageData, useTemplate, useTemplateMutations, useTemplates } from '../api'
import { TemplatePreview } from '../preview/TemplatePreview'
import { usePreviewData } from '../preview/usePreviewData'
import { DocCanvas } from '../canvas/DocCanvas'
import { IDENTITY_ID } from '../canvas/model'
import { withDefaultPrefs } from '../model/prefs'
import { publishOpenTemplate } from '../openTemplate'
import { TextsSheet } from '../texts/TextsSheet'
import es from '../i18n/es'
import { AiPanel, type AiProposal } from './AiPanel'
import { BrandsPanel } from './BrandsPanel'
import { DocControls } from './DocControls'
import { PagePanel } from './PagePanel'
import { SectionInspector } from './SectionInspector'
import { SectionsPanel } from './SectionsPanel'
import { ThemePanel } from './ThemePanel'
import { useTemplateAutosave } from './useTemplateAutosave'

type InspectorTab = 'document' | 'section' | 'theme' | 'page' | 'ai'
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25] as const

/** Textos de la empresa que se escriben en la hoja. En una plantilla no hay obra ni nota de cotización. */
const ORG_TEXT_FIELDS: readonly QuoteDocField[] = ['intro', 'conditions', 'paymentTerms', 'warranty', 'leadTimeText', 'validityDays', 'signatureName', 'footer', 'includes', 'excludes', 'docTitle']

/** Cambios hechos sobre un estilo DEKOPEN: se aplican a su copia apenas se abre. */
const pendingOps = new Map<string, DocOp[]>()

export function TemplateEditor({ id }: { id: string }) {
  const t = useT(es)
  const builtin = isDocPresetId(id)
  const query = useTemplate(builtin ? undefined : id)
  const list = useTemplates()
  const record: DocTemplateRecord | undefined = useMemo(() => {
    if (builtin) return presetRecords(getDocPreset(id).kind, list.data?.defaults[getDocPreset(id).kind]).find((r) => r.id === id)
    return query.data
  }, [builtin, id, query.data, list.data?.defaults])

  if (!record) {
    if (!builtin && query.isError) {
      return (
        <div className="p-8">
          <EmptyState
            title={t('editor.notFound')}
            action={
              <Button asChild variant="primary">
                <Link to="/documentos">{t('editor.backToGallery')}</Link>
              </Button>
            }
          />
        </div>
      )
    }
    return <EditorSkeleton />
  }
  return <LoadedEditor key={record.id} record={record} canEditPlan={list.data?.canEdit ?? true} canGenerate={list.data?.canGenerate ?? false} />
}

function EditorSkeleton() {
  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="h-14 border-b border-divider bg-surface" />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[264px] border-r border-divider bg-sunken p-3 lg:block">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="mb-2 h-10" />
          ))}
        </div>
        <div className="flex flex-1 justify-center bg-canvas p-8">
          <Skeleton className="aspect-[816/1056] w-full max-w-[640px] rounded-xs" />
        </div>
        <div className="hidden w-[336px] border-l border-divider bg-surface xl:block" />
      </div>
    </div>
  )
}

function LoadedEditor({ record, canEditPlan, canGenerate }: { record: DocTemplateRecord; canEditPlan: boolean; canGenerate: boolean }) {
  const t = useT(es)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const me = useMe()
  const plan = usePlan()
  const mutations = useTemplateMutations()
  const [state, dispatch] = useReducer(editorReducer, record.template, createEditorState)
  const role = me.data?.role
  const manager = role === 'owner' || !plan?.has('roles')
  const locked = !canEditPlan || !manager || Boolean(plan?.readOnly)
  // Un estilo DEKOPEN no se modifica: el primer cambio crea la copia del taller y sigue en ella.
  const readOnly = locked
  const autosave = useTemplateAutosave(record.builtin ? undefined : record, state, dispatch, !readOnly && !record.builtin)
  const template = state.template
  const [tab, setTab] = useState<InspectorTab>(record.template.kind === 'quote' ? 'document' : 'section')
  const [zoom, setZoom] = useState<number | undefined>(undefined)
  const [previewLocale, setPreviewLocale] = useState<DocLocale>(((me.data?.org.locale as DocLocale | undefined) ?? 'es'))
  const [dataSource, setDataSource] = useState<'latest' | 'sample'>('latest')
  const [textsOpen, setTextsOpen] = useState(false)
  const [finalView, setFinalView] = useState(false)
  const phone = useMediaQuery('(max-width: 767px)')
  const [panelOpen, setPanelOpen] = useState(false)
  const data = usePreviewData({ useLatest: dataSource === 'latest', wantCatalog: template.kind === 'catalog' })
  const orgSettings = useSettings()
  const updateSettings = useUpdateSettings()
  const images = useImageData([...templateAssetIdsOf(template), ...brandLogoIdsOf(orgSettings.data?.documents)])
  const isDefault = (list: ReturnType<typeof useTemplates>['data']) => list?.defaults[template.kind] === record.id
  const templates = useTemplates()

  const copying = useRef(false)
  const defaults = useRef<Partial<Record<string, string>> | undefined>(undefined)
  defaults.current = templates.data?.defaults
  const apply = useCallback((ops: DocOp[], mergeKey?: string) => {
    if (readOnly) return
    if (!record.builtin) {
      dispatch({ type: 'apply', ops, mergeKey, at: Date.now() })
      return
    }
    if (copying.current) return
    copying.current = true
    const wasDefault = defaults.current?.[record.template.kind] === record.id
    void mutations.duplicate
      .mutateAsync({ id: record.id })
      .then(async (copy) => {
        pendingOps.set(copy.id, ops)
        if (wasDefault) await mutations.setDefault.mutateAsync({ kind: record.template.kind, templateId: copy.id })
        toast.success(t('editor.copied', { name: copy.name }))
        navigate(`/documentos?plantilla=${copy.id}`, { replace: true })
      })
      .catch((error) => toast.error(humanError(error)))
      .finally(() => {
        copying.current = false
      })
    // Las mutaciones cambian de identidad en cada render; `record` es lo que importa aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, record.id, record.builtin])

  useEffect(() => {
    const ops = pendingOps.get(record.id)
    if (!ops || record.builtin) return
    pendingOps.delete(record.id)
    dispatch({ type: 'apply', ops, at: Date.now() })
  }, [record.id, record.builtin])

  // Problemas de la última operación: aviso breve (nunca un diálogo).
  useEffect(() => {
    const first = state.issues.find((i) => i.severity === 'error')
    if (first) toast.warning(first.message, { id: 'tpl-issue' })
  }, [state.issues])

  // Lo abierto queda a la vista de quien lo necesite (el agente): ver `openTemplate.ts`.
  useEffect(
    () => publishOpenTemplate({ id: record.id, kind: template.kind, name: template.name, builtin: Boolean(record.builtin), version: record.version }),
    [record.id, record.builtin, record.version, template.kind, template.name],
  )

  // Los textos comerciales son de la empresa, no de la plantilla: se escriben en sus ajustes.
  const orgPrefs = useMemo(() => withDefaultPrefs(orgSettings.data?.documents), [orgSettings.data?.documents])
  const writeText = useCallback(
    (field: string, value: string) => {
      const patch: Record<string, unknown> = field === 'validityDays' ? { validityDays: Number.parseInt(value, 10) || 0 } : { [field]: value.trim() ? value : field === 'signatureName' || field === 'footer' ? null : '' }
      updateSettings.mutate({ documents: patch as unknown as DocumentPrefs }, { onError: (error) => toast.error(humanError(error)) })
    },
    [updateSettings],
  )
  const textOf = useCallback((field: string) => String((orgPrefs as unknown as Record<string, unknown>)[field] ?? ''), [orgPrefs])
  const onDocText = useCallback(
    (field: string, value: string) => {
      if (field === 'docTitle') {
        apply([{ op: 'setDocSettings', patch: { customTitle: value.trim() ? value : null } } as DocOp])
        return
      }
      const before = textOf(field)
      if (before === value) return
      dispatch({ type: 'text', field, before, after: value, at: Date.now() })
      writeText(field, value)
    },
    [apply, textOf, writeText],
  )

  const undoLabel = (entry: EditorEntry | undefined) =>
    !entry ? undefined : entry.cause.kind === 'op' ? describeDocOp(entry.cause.op, { locale, template }) : entry.cause.kind === 'text' ? t('editor.textEdit') : t(`editor.replaced.${entry.cause.reason}`)
  const undo = () => {
    const entry = state.past[state.past.length - 1]
    if (entry?.cause.kind === 'text') writeText(entry.cause.field, entry.cause.before)
    dispatch({ type: 'undo' })
  }
  const redo = () => {
    const entry = state.future[0]
    if (entry?.cause.kind === 'text') writeText(entry.cause.field, entry.cause.after)
    dispatch({ type: 'redo' })
  }
  useShortcut('mod+z', (e) => {
    if (isTyping(e)) return
    e.preventDefault()
    undo()
  })
  useShortcut('shift+mod+z', (e) => {
    if (isTyping(e)) return
    e.preventDefault()
    redo()
  })

  const select = (sectionId: string) => {
    dispatch({ type: 'select', id: sectionId })
    setTab('section')
  }
  const selectFromPage = useCallback((sectionId: string | null) => {
    dispatch({ type: 'select', id: sectionId })
    // El encabezado no es una sección: sus ajustes viven en «Documento».
    if (sectionId === IDENTITY_ID) setTab('document')
    else if (sectionId) setTab('section')
  }, [])
  const selected = template.sections.find((s) => s.id === state.selectedId) ?? null

  const duplicate = async () => {
    try {
      await autosave.flush()
      const copy = await mutations.duplicate.mutateAsync({ id: record.id })
      toast.success(t('toasts.created', { name: copy.name }))
      navigate(`/documentos?plantilla=${copy.id}`)
    } catch (error) {
      toast.error(humanError(error))
    }
  }
  const setDefault = async () => {
    try {
      await mutations.setDefault.mutateAsync({ kind: template.kind, templateId: record.id })
      toast.success(t('toasts.defaultSet', { name: template.name }))
    } catch (error) {
      toast.error(humanError(error))
    }
  }
  const remove = async () => {
    try {
      await autosave.flush()
      const res = await mutations.remove.mutateAsync(record.id)
      navigate('/documentos' + (template.kind === 'catalog' ? '?tipo=catalogo' : ''))
      toastUndo(t('toasts.deleted', { name: template.name }), () => {
        void mutations.restore.mutateAsync({ id: record.id, makeDefault: Boolean(res.defaultReset) }).then((r) => toast.success(t('toasts.restored', { name: r.name })))
      })
    } catch (error) {
      toast.error(humanError(error))
    }
  }
  const resetToStyle = () => {
    if (!template.presetId) return
    const base = getDocPreset(template.presetId)
    dispatch({ type: 'replace', template: { ...base, id: template.id, name: template.name, presetId: template.presetId }, reason: 'reset', at: Date.now() })
  }
  const applyAi = (proposal: AiProposal) => {
    dispatch({ type: 'replace', template: { ...proposal.template, id: template.id, name: template.name }, reason: 'ai', at: Date.now() })
    toast.success(t('ai.applied'))
    setTab('section')
  }
  const saveAiAsNew = async (proposal: AiProposal) => {
    try {
      const created = await mutations.create.mutateAsync({ kind: template.kind, template: proposal.template, name: proposal.template.name })
      toast.success(t('toasts.created', { name: created.name }))
      navigate(`/documentos?plantilla=${created.id}`)
    } catch (error) {
      toast.error(humanError(error))
    }
  }

  const onSectionText = useCallback(
    (sectionId: string, slot: 'title' | 'subtitle' | 'content', value: string) => apply([{ op: 'setSectionText', sectionId, slot, value: value.trim() ? value : null }], `text:${sectionId}:${slot}`),
    [apply],
  )
  const editing = readOnly || finalView ? {} : { onSectionText, ...(template.kind === 'quote' ? { onEdit: onDocText, editableFields: ORG_TEXT_FIELDS } : {}) }
  const sharedPreview = {
    kind: template.kind,
    quote: data.quote,
    catalog: data.catalog,
    locale: previewLocale,
    currency: data.currency,
    taxLabel: data.taxLabel,
    assets: images.data,
  }

  const inspectorTabs = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as InspectorTab)} className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 shrink-0 border-b border-divider bg-surface px-3 py-2">
        <TabsList variant="pill" className="w-full">
          {template.kind === 'quote' ? (
            <TabsTrigger value="document" className="flex-1">
              {t('inspector.tabs.document')}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="section" className="flex-1">
            {t('inspector.tabs.section')}
          </TabsTrigger>
          <TabsTrigger value="theme" className="flex-1">
            {t('inspector.tabs.theme')}
          </TabsTrigger>
          <TabsTrigger value="page" className="flex-1">
            {t('inspector.tabs.page')}
          </TabsTrigger>
          {!record.builtin ? (
            <TabsTrigger value="ai" className="flex-1">
              {t('inspector.tabs.ai')}
            </TabsTrigger>
          ) : null}
        </TabsList>
      </div>
      <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
        {template.kind === 'quote' ? (
          <TabsContent value="document">
            <DocControls settings={resolveDocSettings(template.settings)} sections={template.sections} readOnly={readOnly} onOps={apply} />
            <BrandsPanel readOnly={!manager || Boolean(plan?.readOnly)} />
          </TabsContent>
        ) : null}
        <TabsContent value="section">
          {selected ? (
            <SectionInspector template={template} section={selected} readOnly={readOnly} onOps={apply} onEditTexts={template.kind === 'quote' ? () => setTextsOpen(true) : undefined} />
          ) : (
            <div className="p-4">
              <p className="text-table text-fg-muted">{t('inspector.noSelection')}</p>
              {/* En pantallas sin la columna izquierda, la lista de secciones vive aquí. */}
              <div className="mt-3 lg:hidden">
                <SectionsPanel template={template} selectedId={state.selectedId} readOnly={readOnly} onSelect={select} onOps={apply} />
              </div>
              <p className="mt-4 text-meta text-fg-faint">{t('editor.shortcuts')}</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="theme">
          <ThemePanel template={template} readOnly={readOnly} brandAccent={me.data?.org.accent} onOps={apply} />
        </TabsContent>
        <TabsContent value="page">
          <PagePanel template={template} readOnly={readOnly} onOps={apply} />
        </TabsContent>
        {!record.builtin ? (
          <TabsContent value="ai">
            <AiPanel
              kind={template.kind}
              base={template}
              baseId={record.id}
              canGenerate={canGenerate && !readOnly}
              autoFocus
              renderThumb={(tpl) => <TemplatePreview {...sharedPreview} quote={data.quoteThumb} catalog={data.catalogThumb} template={tpl} thumbnail />}
              onApply={applyAi}
              onSaveAsNew={(p) => void saveAiAsNew(p)}
            />
          </TabsContent>
        ) : null}
      </div>
    </Tabs>
  )

  return (
    <div className="flex h-full min-h-[560px] flex-col" data-template-id={record.id}>
      {/* Cabecera */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-divider bg-surface px-3 sm:px-4">
        <Button asChild variant="ghost" size="sm" icon={ArrowLeft} className="max-sm:px-2">
          <Link to={`/documentos${template.kind === 'catalog' ? '?tipo=catalogo' : ''}`} aria-label={t('editor.back')}>
            <span className="max-sm:sr-only">{t('editor.back')}</span>
          </Link>
        </Button>
        <span aria-hidden className="h-5 w-px bg-divider max-sm:hidden" />
        <NameField value={template.name} readOnly={readOnly} onChange={(name) => apply([{ op: 'rename', name }], 'rename')} />
        <Badge tone="outline" size="sm" className="max-sm:hidden">
          {template.kind === 'quote' ? t('editor.kindQuote') : t('editor.kindCatalog')}
        </Badge>
        {!record.builtin ? <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} className="max-md:hidden" /> : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton icon={Undo2} size="sm" label={canUndo(state) ? t('editor.undoWhat', { what: undoLabel(state.past[state.past.length - 1]) ?? '' }) : t('editor.undo')} shortcut="mod+z" disabled={!canUndo(state)} onClick={undo} />
          <IconButton icon={Redo2} size="sm" label={canRedo(state) ? t('editor.redoWhat', { what: undoLabel(state.future[0]) ?? '' }) : t('editor.redo')} shortcut="shift+mod+z" disabled={!canRedo(state)} onClick={redo} />
          <Button size="sm" variant="subtle" icon={SlidersHorizontal} onClick={() => setPanelOpen(true)} className="md:hidden">
            {t('card.edit')}
          </Button>
          {isDefault(templates.data) ? (
            <Badge tone="accent" icon={<Star aria-hidden className="size-3" />} className="max-sm:hidden">
              {t('editor.isDefault')}
            </Badge>
          ) : record.builtin ? null : (
            <Button size="sm" variant="primary" onClick={() => void setDefault()} disabled={!manager} className="max-sm:hidden">
              {t('editor.setDefault')}
            </Button>
          )}
          {record.builtin ? (
            <Button size="sm" variant="primary" icon={Copy} onClick={() => void duplicate()} loading={mutations.duplicate.isPending} disabled={!canEditPlan} className="max-sm:hidden">
              {t('editor.builtinAction')}
            </Button>
          ) : null}
          {record.builtin && !phone ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={MoreHorizontal} size="sm" label={t('editor.menu')} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {record.builtin ? (
                  <DropdownMenuItem icon={Copy} disabled={!canEditPlan} onSelect={() => void duplicate()}>
                    {t('editor.builtinAction')}
                  </DropdownMenuItem>
                ) : (
                  <>
                    {!isDefault(templates.data) ? (
                      <DropdownMenuItem icon={Star} disabled={!manager} onSelect={() => void setDefault()} className="sm:hidden">
                        {t('editor.setDefault')}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem icon={Copy} disabled={!canEditPlan} onSelect={() => void duplicate()}>
                      {t('editor.duplicate')}
                    </DropdownMenuItem>
                    {template.presetId ? (
                      <DropdownMenuItem icon={RotateCcw} disabled={readOnly} onSelect={resetToStyle}>
                        {t('editor.resetToStyle', { name: presetName(template.presetId, locale) })}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={Trash2} danger disabled={!manager} onSelect={() => void remove()}>
                      {t('editor.delete')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {record.builtin ? (
        <div className="border-b border-divider bg-surface px-4 py-2.5">
          <Notice tone="accent" size="compact" title={t('editor.builtinTitle')}>
            {t('editor.builtinBody')}
          </Notice>
        </div>
      ) : !canEditPlan ? (
        <div className="border-b border-divider bg-surface px-4 py-2.5">
          <Notice tone="neutral" size="compact">
            {t('editor.readOnly')}
          </Notice>
        </div>
      ) : null}
      {state.rebased ? (
        <div className="border-b border-divider bg-surface px-4 py-2.5">
          <Notice tone="info" size="compact" action={<Button size="xs" variant="ghost" onClick={() => dispatch({ type: 'dismissRebased' })}>{t('editor.dismiss')}</Button>}>
            {t('editor.rebased')}
          </Notice>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Secciones */}
        <aside className="hidden w-[264px] shrink-0 flex-col border-r border-divider bg-sunken lg:flex" aria-label={t('sections.title')}>
          <SectionsPanel template={template} selectedId={state.selectedId} readOnly={readOnly} onSelect={select} onOps={apply} />
        </aside>

        {/* Página */}
        <section className="flex min-w-0 flex-1 flex-col bg-canvas" aria-label={t('canvas.label')}>
          <Toolbar aria-label={t('canvas.label')} className="scrollbar-quiet shrink-0 gap-1 overflow-x-auto [&>*]:shrink-0">
            <ToolbarGroup>
              <IconButton icon={ZoomOut} size="sm" label={t('canvas.zoomOut')} onClick={() => setZoom((z) => stepZoom(z, -1))} />
              <button type="button" onClick={() => setZoom(undefined)} className="num h-8 min-w-14 rounded-sm px-1.5 text-table text-fg-muted hover:bg-hover hover:text-fg" title={t('canvas.fit')}>
                {zoom ? `${Math.round(zoom * 100)} %` : <Maximize2 aria-label={t('canvas.fit')} className="mx-auto size-4" strokeWidth={1.75} />}
              </button>
              <IconButton icon={ZoomIn} size="sm" label={t('canvas.zoomIn')} onClick={() => setZoom((z) => stepZoom(z, 1))} />
            </ToolbarGroup>
            <ToolbarSeparator />
            <SegmentedControl
              aria-label={t('canvas.paper')}
              size="sm"
              value={template.page.size}
              onValueChange={(size) => apply([{ op: 'setPage', patch: { size } }])}
              options={(['A4', 'Letter'] as const).map((s) => ({ value: s, label: t(`pageSetup.sizes.${s}`), disabled: readOnly }))}
            />
            <ToolbarSeparator />
            <IconButton icon={Eye} size="sm" label={t('canvas.finalView')} aria-pressed={finalView} onClick={() => setFinalView((v) => !v)} />
            <ToolbarSpacer />
            {template.kind === 'quote' ? (
              <Select
                size="sm"
                className="w-44 max-md:hidden"
                value={dataSource}
                onValueChange={(v) => setDataSource(v as 'latest' | 'sample')}
                options={[
                  { value: 'latest', label: t('canvas.dataLatest') },
                  { value: 'sample', label: t('canvas.dataSample') },
                ]}
              />
            ) : null}
            <Select
              size="sm"
              className="w-36"
              value={previewLocale}
              onValueChange={(v) => setPreviewLocale(v as DocLocale)}
              options={DOC_LOCALES.map((l) => ({ value: l, label: LOCALE_META[l].label }))}
            />
          </Toolbar>
          <div className="scrollbar-quiet min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-8">
            {data.source.kind === 'sample' && template.kind === 'quote' ? (
              <p className="mx-auto mb-3 flex max-w-[816px] items-center gap-2 text-table text-fg-muted">
                <Badge tone="neutral" size="sm">
                  {t('gallery.sampleBadge')}
                </Badge>
                {t('gallery.previewWithSample')}
              </p>
            ) : null}
            {!data.ready ? (
              <div className="mx-auto max-w-[816px]">
                <Skeleton className="aspect-[816/1056] w-full rounded-xs" />
              </div>
            ) : (
              <div className={cn('mx-auto', zoom ? 'w-fit' : 'max-w-[900px]')}>
                <DocCanvas
                  template={template}
                  scope="template"
                  readOnly={readOnly || finalView}
                  selectedId={state.selectedId}
                  onSelect={selectFromPage}
                  onOps={apply}
                  texts={{ warranty: orgPrefs.warranty, paymentTerms: orgPrefs.paymentTerms, validityDays: orgPrefs.validityDays > 0 ? String(orgPrefs.validityDays) : '' }}
                  onText={onDocText}
                >
                  <TemplatePreview
                    {...sharedPreview}
                    template={template}
                    scale={zoom}
                    selectedSectionId={selected && (selected.type === 'cover' || selected.type === 'custom_text') ? selected.id : undefined}
                    {...editing}
                    className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                  />
                </DocCanvas>
              </div>
            )}
          </div>
        </section>

        {/* Inspector (en el teléfono vive en una hoja inferior) */}
        {phone ? null : (
          <Inspector aria-label={t('inspector.tabs.section')} className="hidden w-[336px] shrink-0 border-l border-divider md:flex">
            {inspectorTabs}
          </Inspector>
        )}
      </div>
      {phone ? (
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="bottom" title={template.name} className="h-[82dvh]">
            <div className="-m-5">{inspectorTabs}</div>
          </SheetContent>
        </Sheet>
      ) : null}
      <TextsSheet open={textsOpen} onOpenChange={setTextsOpen} />
    </div>
  )
}

function stepZoom(current: number | undefined, dir: 1 | -1): number {
  const value = current ?? 0.8
  const index = ZOOMS.findIndex((z) => z >= value - 0.001)
  const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (index === -1 ? ZOOMS.length - 1 : index) + dir))]
  return next
}

function isTyping(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
}

function NameField({ value, readOnly, onChange }: { value: string; readOnly: boolean; onChange: (name: string) => void }) {
  const t = useT(es)
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])
  return (
    <input
      value={draft}
      readOnly={readOnly}
      aria-label={t('editor.nameLabel')}
      maxLength={80}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false
        if (!draft.trim()) setDraft(value)
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.target.value.trim()) onChange(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
      }}
      className="h-9 min-w-0 max-w-[360px] flex-1 truncate rounded-sm border border-transparent bg-transparent px-2 text-h4 font-semibold text-fg-strong outline-none hover:border-divider focus:border-accent focus:bg-surface focus:ring-[3px] focus:ring-[var(--dk-focus-ring)] read-only:hover:border-transparent"
    />
  )
}
