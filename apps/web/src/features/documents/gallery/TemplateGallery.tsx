/**
 * Galería de plantillas (/documentos): pestañas Cotización · Catálogo, tus plantillas y los estilos
 * DEKOPEN con miniaturas reales (tus líneas y precios), filtros por estilo, «Nueva plantilla» (desde
 * un estilo o con la IA), predeterminada, duplicar y borrar con deshacer.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { BookOpen, ChevronDown, Copy, FileDown, FileText, PenLine, Plus, Star, Trash2 } from 'lucide-react'
import {
  DOC_PRESET_TRAITS,
  getDocPreset,
  isDocPresetId,
  presetDescription,
  presetName,
  type DocLocale,
  type DocTemplate,
  type DocTemplateKind,
  type DocTemplateRecord,
} from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useMe } from '../../../lib/hooks'
import { useLocale, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Notice,
  Page,
  PageHeader,
  PlanGate,
  SegmentedControl,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
  toastUndo,
} from '../../../ui'
import { presetRecords, useTemplateMutations, useTemplates } from '../api'
import { AiPanel, type AiProposal } from '../editor/AiPanel'
import { templateAssetIdsOf } from '../model/assets'
import { TemplatePreview } from '../preview/TemplatePreview'
import { usePreviewData, type PreviewData } from '../preview/usePreviewData'
import { TextsSheet } from '../texts/TextsSheet'
import { useImageData } from '../api'
import es from '../i18n/es'
import { CatalogDialog } from './CatalogDialog'
import { TemplateCard } from './TemplateCard'

type StyleFilter = 'all' | 'visual' | 'balanced' | 'technical'

export function TemplateGallery() {
  const t = useT(es)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const kind: DocTemplateKind = params.get('tipo') === 'catalogo' ? 'catalog' : 'quote'
  const setKind = (next: DocTemplateKind) => {
    const p = new URLSearchParams(params)
    if (next === 'catalog') p.set('tipo', 'catalogo')
    else p.delete('tipo')
    setParams(p, { replace: true })
  }
  const list = useTemplates()
  const plan = usePlan()
  const me = useMe()
  const mutations = useTemplateMutations()
  const preview = usePreviewData({ wantCatalog: kind === 'catalog' })
  const [filter, setFilter] = useState<StyleFilter>('all')
  const [aiOpen, setAiOpen] = useState(false)
  const [textsOpen, setTextsOpen] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [previewing, setPreviewing] = useState<DocTemplateRecord | null>(null)

  const defaults = list.data?.defaults ?? { quote: 'hogar', catalog: 'coleccion-modular' }
  const canEdit = list.data?.canEdit ?? plan?.has('custom_templates') ?? false
  const manager = me.data?.role === 'owner' || !plan?.has('roles')
  const own = useMemo(() => (list.data?.templates ?? []).filter((r) => r.kind === kind), [list.data, kind])
  const presets = useMemo(() => presetRecords(kind, defaults[kind]), [kind, defaults])
  const shownPresets = presets.filter((p) => filter === 'all' || (isDocPresetId(p.id) && DOC_PRESET_TRAITS[p.id].style === filter))
  const defaultRecord = [...own, ...presets].find((r) => r.id === defaults[kind]) ?? presets[0]

  const open = (record: DocTemplateRecord) => navigate(`/documentos?plantilla=${record.id}`)
  const setDefault = async (record: DocTemplateRecord) => {
    try {
      await mutations.setDefault.mutateAsync({ kind, templateId: record.id })
      toast.success(t('toasts.defaultSet', { name: record.builtin && isDocPresetId(record.id) ? presetName(record.id, locale) : record.name }))
    } catch (error) {
      toast.error(humanError(error))
    }
  }
  const duplicate = async (record: DocTemplateRecord, edit = true) => {
    try {
      const copy = await mutations.duplicate.mutateAsync({ id: record.id })
      toast.success(t('toasts.created', { name: copy.name }))
      if (edit) open(copy)
    } catch (error) {
      toast.error(humanError(error))
    }
  }
  const remove = async (record: DocTemplateRecord) => {
    try {
      const res = await mutations.remove.mutateAsync(record.id)
      toastUndo(t('toasts.deleted', { name: record.name }), () => {
        void mutations.restore.mutateAsync({ id: record.id, makeDefault: Boolean(res.defaultReset) })
      })
    } catch (error) {
      toast.error(humanError(error))
    }
  }
  const saveAi = async (proposal: AiProposal) => {
    try {
      const created = await mutations.create.mutateAsync({ kind, template: proposal.template, name: proposal.template.name })
      toast.success(t('toasts.created', { name: created.name }))
      setAiOpen(false)
      open(created)
    } catch (error) {
      toast.error(humanError(error))
    }
  }

  const docLocale = (preview.orgLocale as DocLocale) ?? 'es'
  const thumb = (record: DocTemplateRecord) => <Thumb template={record.template} kind={kind} preview={preview} locale={docLocale} />

  return (
    <Page width="wide">
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
        actions={
          <>
            {kind === 'quote' ? (
              <Button variant="ghost" icon={PenLine} onClick={() => setTextsOpen(true)} className="max-sm:hidden">
                {t('page.commercialTexts')}
              </Button>
            ) : (
              <Button variant="secondary" icon={FileDown} onClick={() => setCatalogOpen(true)}>
                {t('page.generateCatalog')}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="primary" icon={Plus} iconRight={ChevronDown} disabled={!manager}>
                  {t('page.newTemplate')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger icon={Copy}>{t('page.fromStyle')}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                    {presets.map((p) => (
                      <DropdownMenuItem key={p.id} disabled={!canEdit} onSelect={() => void duplicate(p)}>
                        {isDocPresetId(p.id) ? presetName(p.id, locale) : p.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem icon={PenLine} disabled={!canEdit} onSelect={() => setAiOpen(true)}>
                  {t('page.askAi')}
                </DropdownMenuItem>
                {!canEdit ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-meta font-normal text-fg-muted">{t('toasts.planNeeded')}</DropdownMenuLabel>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Tabs value={kind} onValueChange={(v) => setKind(v as DocTemplateKind)}>
        <TabsList aria-label={t('page.title')}>
          <TabsTrigger value="quote" badge={list.data ? (list.data.templates.filter((r) => r.kind === 'quote').length || undefined) : undefined}>
            <FileText aria-hidden className="size-4" strokeWidth={1.75} />
            {t('page.tabs.quote')}
          </TabsTrigger>
          <TabsTrigger value="catalog" badge={list.data ? (list.data.templates.filter((r) => r.kind === 'catalog').length || undefined) : undefined}>
            <BookOpen aria-hidden className="size-4" strokeWidth={1.75} />
            {t('page.tabs.catalog')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {list.isError ? (
        <Notice tone="warning" className="mt-6" action={<Button size="sm" variant="secondary" onClick={() => void list.refetch()}>{t('gallery.retry')}</Button>}>
          {t('gallery.loadError')}
        </Notice>
      ) : null}

      {/* Tus plantillas */}
      {/* Sin plantillas propias no hay sección: lo primero que se ve son los estilos listos para usar. */}
      {own.length || (!canEdit && plan) ? (
      <section aria-labelledby="tpl-own" className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="tpl-own" className="text-h3 font-medium text-fg-strong">
              {t('gallery.own')}
            </h2>
            {own.length ? <p className="num text-table text-fg-muted">{t('gallery.ownCount', { count: own.length })}</p> : null}
          </div>
        </div>
        {!canEdit && plan ? (
          <PlanGate feature="custom_templates" variant="card" preview={false} className="mb-4" />
        ) : null}
        {own.length ? (
          <CardGrid>
            {own.map((record) => (
              <TemplateCard
                key={record.id}
                record={record}
                thumbnail={() => thumb(record)}
                onOpen={() => open(record)}
                primary={
                  <Button size="sm" variant="secondary" icon={PenLine} onClick={() => open(record)}>
                    {t('card.edit')}
                  </Button>
                }
                menu={
                  <>
                    <DropdownMenuItem icon={Star} disabled={record.isDefault || !manager} onSelect={() => void setDefault(record)}>
                      {t('card.useAsDefault')}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={Copy} disabled={!canEdit || !manager} onSelect={() => void duplicate(record, false)}>
                      {t('card.duplicate')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={Trash2} danger disabled={!manager} onSelect={() => void remove(record)}>
                      {t('card.delete')}
                    </DropdownMenuItem>
                  </>
                }
              />
            ))}
          </CardGrid>
        ) : null}
      </section>
      ) : null}

      {/* Estilos DEKOPEN */}
      <section aria-labelledby="tpl-presets" className={own.length ? 'mt-12' : 'mt-8'}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2 id="tpl-presets" className="text-h3 font-medium text-fg-strong">
              {t('gallery.presets')}
            </h2>
            <p className="text-table text-fg-muted">{kind === 'quote' ? t('gallery.presetsHint') : t('gallery.presetsHintCatalog')}</p>
          </div>
          {kind === 'quote' ? (
            <SegmentedControl<StyleFilter>
              aria-label={t('gallery.presets')}
              size="sm"
              value={filter}
              onValueChange={setFilter}
              options={(['all', 'visual', 'balanced', 'technical'] as const).map((v) => ({ value: v, label: t(`gallery.filters.${v}`) }))}
            />
          ) : null}
        </div>
        <p className="mb-4 flex items-center gap-2 text-table text-fg-muted">
          {kind === 'catalog' ? (
            t('gallery.previewCatalog')
          ) : preview.source.kind === 'sample' ? (
            <>
              <Badge tone="neutral" size="sm">
                {t('gallery.sampleBadge')}
              </Badge>
              {t('gallery.previewWithSample')}
            </>
          ) : (
            t('gallery.previewWith')
          )}
        </p>
        {shownPresets.length ? (
          <CardGrid>
            {shownPresets.map((record) => (
              <TemplateCard
                key={record.id}
                record={record}
                showDescription
                thumbnail={() => thumb(record)}
                onOpen={() => setPreviewing(record)}
                primary={
                  !record.isDefault ? (
                    <Button size="sm" variant="secondary" icon={Star} disabled={!manager} onClick={() => void setDefault(record)}>
                      {t('card.use')}
                    </Button>
                  ) : undefined
                }
                menu={
                  <>
                    <DropdownMenuItem icon={FileText} onSelect={() => setPreviewing(record)}>
                      {t('card.preview')}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={Copy} disabled={!canEdit || !manager} onSelect={() => void duplicate(record)}>
                      {t('card.duplicateAndEdit')}
                    </DropdownMenuItem>
                  </>
                }
              />
            ))}
          </CardGrid>
        ) : (
          <div className="flex items-center gap-3 rounded-panel border border-divider bg-sunken px-4 py-6 text-table text-fg-muted">
            {t('gallery.noMatches')}
            <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>
              {t('gallery.clearFilter')}
            </Button>
          </div>
        )}
        {canEdit && !own.length && !list.isLoading ? (
          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-divider pt-5">
            <div className="min-w-0 flex-1 basis-80">
              <h3 className="font-medium text-fg-strong">{t('gallery.emptyTitle')}</h3>
              <p className="text-pretty text-table text-fg-muted">{t('gallery.emptyBody')}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="secondary" icon={Copy} onClick={() => defaultRecord && void duplicate(defaultRecord)} disabled={!manager}>
                {t('card.duplicateAndEdit')}
              </Button>
              <Button variant="ghost" icon={PenLine} onClick={() => setAiOpen(true)} disabled={!manager}>
                {t('page.askAi')}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Vista previa grande de un estilo */}
      <Dialog open={Boolean(previewing)} onOpenChange={(o) => !o && setPreviewing(null)}>
        {previewing ? (
          <DialogContent
            size="xl"
            title={isDocPresetId(previewing.id) ? presetName(previewing.id, locale) : previewing.name}
            footer={
              <>
                <Button variant="ghost" icon={PenLine} onClick={() => open(previewing)}>
                  {t('card.open')}
                </Button>
                <Button variant="secondary" icon={Copy} disabled={!canEdit || !manager} onClick={() => void duplicate(previewing)}>
                  {t('card.duplicateAndEdit')}
                </Button>
                {!previewing.isDefault ? (
                  <Button
                    variant="primary"
                    icon={Star}
                    disabled={!manager}
                    onClick={() => {
                      void setDefault(previewing)
                      setPreviewing(null)
                    }}
                  >
                    {t('card.useAsDefault')}
                  </Button>
                ) : null}
              </>
            }
          >
            <PresetDetail record={previewing} />
            <div className="scrollbar-quiet mt-4 max-h-[60vh] overflow-y-auto rounded-panel bg-sunken p-4">
              <BigPreview template={previewing.template} kind={kind} preview={preview} locale={docLocale} />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* Nueva plantilla con IA */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent size="lg" title={t('ai.title')}>
          {defaultRecord ? (
            <AiPanel
              kind={kind}
              base={defaultRecord.template}
              baseId={defaultRecord.id}
              canGenerate={list.data?.canGenerate ?? false}
              autoFocus
              className="p-0"
              renderThumb={(tpl) => <Thumb template={tpl} kind={kind} preview={preview} locale={docLocale} small />}
              onSaveAsNew={(p) => void saveAi(p)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <TextsSheet open={textsOpen} onOpenChange={setTextsOpen} />
      {kind === 'catalog' ? <CatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen} templates={[...own, ...presets]} defaultId={defaults.catalog} /> : null}
    </Page>
  )
}

function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>
}

function Thumb({ template, kind, preview, locale, small }: { template: DocTemplate; kind: DocTemplateKind; preview: PreviewData; locale: DocLocale; small?: boolean }) {
  const images = useImageData(templateAssetIdsOf(template))
  if (!preview.ready) return <Skeleton className="aspect-[1/1.294] w-full rounded-none" />
  return (
    <TemplatePreview
      template={template}
      kind={kind}
      quote={preview.quoteThumb}
      catalog={preview.catalogThumb}
      locale={locale}
      currency={preview.currency}
      taxLabel={preview.taxLabel}
      assets={images.data}
      thumbnail
      className={small ? 'max-h-56 overflow-hidden' : undefined}
    />
  )
}

function BigPreview({ template, kind, preview, locale }: { template: DocTemplate; kind: DocTemplateKind; preview: PreviewData; locale: DocLocale }) {
  const images = useImageData(templateAssetIdsOf(template))
  if (!preview.ready) return <Skeleton className="mx-auto aspect-[816/1056] w-full max-w-[720px] rounded-xs" />
  return <TemplatePreview template={template} kind={kind} quote={preview.quote} catalog={preview.catalog} locale={locale} currency={preview.currency} taxLabel={preview.taxLabel} assets={images.data} className="mx-auto max-w-[760px]" />
}

function PresetDetail({ record }: { record: DocTemplateRecord }) {
  const t = useT(es)
  const { locale } = useLocale()
  if (!record.builtin || !isDocPresetId(record.id)) return null
  const traits = DOC_PRESET_TRAITS[record.id]
  const template = getDocPreset(record.id)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="outline" size="sm">
        {t(`traits.audience.${traits.audience}`)}
      </Badge>
      <Badge tone="outline" size="sm">
        {t(`traits.style.${traits.style}`)}
      </Badge>
      {traits.usesPhotos ? (
        <Badge tone="outline" size="sm">
          {t('traits.photos')}
        </Badge>
      ) : null}
      <Badge tone="outline" size="sm">
        {t('traits.ideal', { min: traits.idealItems[0], max: traits.idealItems[1] })}
      </Badge>
      <Badge tone="outline" size="sm">
        {t('card.sections', { count: template.sections.filter((s) => s.enabled).length })}
      </Badge>
      <p className="mt-2 w-full text-table text-fg-muted">{presetDescription(record.id, locale)}</p>
    </div>
  )
}
