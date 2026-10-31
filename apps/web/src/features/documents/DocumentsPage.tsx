import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BookOpen, FileDown, FileText, PenLine, Printer, Redo2, Undo2 } from 'lucide-react'
import {
  buildSampleQuoteDoc,
  CATALOG_TEMPLATES,
  CatalogDocument,
  DocumentStyles,
  PAPER_SIZE,
  QUOTE_TEMPLATES,
  QuoteDocument,
  themeFromPrefs,
  type CatalogDocData,
  type QuoteDocData,
  type QuoteDocField,
} from '@framezen/documents'
import { computeLayout } from '@framezen/engine'
import type { CatalogTemplateId, DocumentPrefs, QuoteTemplateId } from '@framezen/shared'
import { humanError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useCatalog, useMe, useQuote, useQuotes, useSettings, useUpdateSettings } from '../../lib/hooks'
import { formatNumber } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'
import { useUndo } from '../../lib/useUndo'
import { Badge, Button, Checkbox, IconButton, Input, Page, PageHeader, SaveIndicator, SegmentedControl, Skeleton, toast } from '../../ui'
import { useAutosave } from '../catalog/useAutosave'
import { catalogDocFromCatalog, quoteDocFromQuote, sampleQuoteDoc, toDocOrg, type DocContext } from './model/docData'
import { applyDocEdit, withDefaultPrefs } from './model/prefs'
import { documentFontCss, downloadPdf, fileSlug, printDocument } from './output'
import { PrefsEditor, type PrefsPatch } from './PrefsEditor'
import { ScaledDoc } from './ScaledDoc'

type Mode = 'quote' | 'catalog'
const CATALOG_TITLE = 'Catálogo de ventanas y puertas'

export default function DocumentsPage() {
  usePageTitle('Documentos')
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('tipo') === 'catalogo' ? 'catalog' : 'quote'
  const setMode = (next: Mode) => {
    const p = new URLSearchParams(params)
    if (next === 'catalog') p.set('tipo', 'catalogo')
    else p.delete('tipo')
    setParams(p, { replace: true })
  }

  const me = useMe()
  const org = me.data?.org
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
  const catalog = useCatalog()
  const quotes = useQuotes()
  const latestId = quotes.data?.find((q) => q.units > 0)?.id
  const latest = useQuote(latestId)

  // Preferencias con deshacer/rehacer; se guardan solas.
  const history = useUndo<DocumentPrefs | null>(null, { keyboard: true, mergeWindowMs: 1200 })
  const ready = useRef(false)
  useEffect(() => {
    if (settings.data && !ready.current) {
      ready.current = true
      history.reset(withDefaultPrefs(settings.data.documents))
    }
  }, [settings.data, history])
  const prefs = history.value ?? withDefaultPrefs(settings.data?.documents)
  const autosave = useAutosave<DocumentPrefs>((value) => updateSettings.mutateAsync({ documents: value }), 700)
  const lastSaved = useRef<DocumentPrefs | null>(null)
  useEffect(() => {
    if (!history.value) return
    if (lastSaved.current === null) {
      lastSaved.current = history.value
      return
    }
    if (lastSaved.current !== history.value) {
      lastSaved.current = history.value
      autosave.schedule(history.value)
    }
  }, [history.value, autosave])

  const change = (patch: PrefsPatch, mergeKey?: string) => {
    history.set((prev) => ({ ...(prev ?? prefs), ...patch }), mergeKey ? { mergeKey } : undefined)
  }

  // Lo pesado (motor + dibujos) usa una versión diferida para que escribir nunca se trabe.
  const shown = useDeferredValue(prefs)
  const theme = themeFromPrefs(shown, org?.accent)
  const pageWidth = PAPER_SIZE[shown.paper]?.width ?? 816
  const fontCss = useMemo(() => documentFontCss(), [])

  const ctx = useMemo<Omit<DocContext, 'prefs'> | null>(() => {
    if (!catalog.data || !settings.data || !org) return null
    return { catalog: catalog.data, pricing: settings.data.pricing, cut: settings.data.cut, org: toDocOrg(org), defaults: settings.data.defaults }
  }, [catalog.data, settings.data, org])

  // Cotización: la última del taller con ventanas, o un ejemplo con sus propias líneas y precios.
  const quoteBase = useMemo(() => {
    if (!ctx) return null
    const full = { ...ctx, prefs }
    if (latest.data?.items.length) {
      try {
        return {
          source: { kind: 'quote' as const, number: latest.data.number, title: latest.data.title, id: latest.data.id },
          full: quoteDocFromQuote(latest.data, full),
          thumb: quoteDocFromQuote({ ...latest.data, items: latest.data.items.slice(0, 3) }, full),
        }
      } catch {
        /* si la cotización tiene algo raro, seguimos con el ejemplo */
      }
    }
    const sample = sampleQuoteDoc(full)
    if (sample) return { source: { kind: 'sample' as const }, full: sample, thumb: sampleQuoteDoc(full, { items: 3 }) ?? sample }
    const fallback = buildSampleQuoteDoc({ layout: computeLayout, org: ctx.org, prefs })
    return { source: { kind: 'sample' as const }, full: fallback, thumb: buildSampleQuoteDoc({ layout: computeLayout, org: ctx.org, prefs, items: 3 }) }
    // Las preferencias se aplican abajo; aquí solo cambia con datos nuevos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, latest.data])

  // Catálogo de productos: líneas elegidas. Por defecto, las activas con datos completos: las que
  // tienen datos parciales quedan desmarcadas (con aviso) y se pueden sumar con un clic.
  const allLineIds = useMemo(() => (catalog.data?.lines ?? []).map((l) => l.id), [catalog.data])
  const partialIds = useMemo(() => new Set((catalog.data?.lines ?? []).filter((l) => l.completeness === 'partial').map((l) => l.id)), [catalog.data])
  const [chosenExcluded, setExcluded] = useState<Set<string> | null>(null)
  const excluded = useMemo(
    () => chosenExcluded ?? (partialIds.size < allLineIds.length ? partialIds : new Set<string>()),
    [chosenExcluded, partialIds, allLineIds.length],
  )
  const [catalogTitle, setCatalogTitle] = useState(CATALOG_TITLE)
  const lineIds = useMemo(() => allLineIds.filter((id) => !excluded.has(id)), [allLineIds, excluded])
  const deferredLineIds = useDeferredValue(lineIds)
  const catalogBase = useMemo<{ full: CatalogDocData; thumb: CatalogDocData } | null>(() => {
    if (!ctx || mode !== 'catalog') return null
    const full = { ...ctx, prefs }
    return {
      full: catalogDocFromCatalog(full, { lineIds: deferredLineIds }),
      thumb: catalogDocFromCatalog(full, { lineIds: deferredLineIds.slice(0, 2), maxTypologies: 6 }),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, mode, deferredLineIds])

  const quoteData: QuoteDocData | null = quoteBase ? { ...quoteBase.full, prefs: shown } : null
  const quoteThumb: QuoteDocData | null = quoteBase ? { ...quoteBase.thumb, prefs: shown } : null
  const catalogData: CatalogDocData | null = catalogBase ? { ...catalogBase.full, prefs: shown, title: catalogTitle || CATALOG_TITLE } : null
  const catalogThumb: CatalogDocData | null = catalogBase ? { ...catalogBase.thumb, prefs: shown, title: catalogTitle || CATALOG_TITLE } : null

  const [previewKey, setPreviewKey] = useState(0)
  const onDocEdit = (field: QuoteDocField, value: string) => {
    const result = applyDocEdit(prefs, field, value)
    if ('patch' in result) change(result.patch)
    else if ('ignored' in result) {
      setPreviewKey((k) => k + 1)
      toast.info('El nombre de la obra y las notas se escriben en cada cotización. Aquí cambias los textos que se repiten en todas.', { id: 'doc-field' })
    }
  }

  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('preview')
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null)

  const printCurrent = async () => {
    setBusy('print')
    try {
      if (mode === 'catalog' && catalogData) {
        await printDocument(<CatalogDocument template={shown.catalogTemplate} data={catalogData} />, { title: catalogData.title ?? CATALOG_TITLE, theme })
      } else if (quoteData) {
        await printDocument(<QuoteDocument template={shown.quoteTemplate} data={quoteData} />, { title: `Cotización N° ${quoteData.quote.number}`, theme })
      }
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setBusy(null)
    }
  }

  const generateCatalog = async () => {
    if (mode !== 'catalog') setMode('catalog')
    if (!ctx) return
    setBusy('pdf')
    const query = new URLSearchParams({ template: prefs.catalogTemplate })
    // Lista explícita si no son todas o si incluye líneas parciales: el PDF calza con la vista previa.
    if (lineIds.length !== allLineIds.length || lineIds.some((id) => partialIds.has(id))) query.set('lines', lineIds.join(','))
    if (catalogTitle && catalogTitle !== CATALOG_TITLE) query.set('title', catalogTitle)
    const name = `${fileSlug(`${catalogTitle || 'catalogo'} ${org?.name ?? ''}`)}.pdf`
    const ok = await downloadPdf(`/api/catalog/pdf?${query.toString()}`, name)
    if (ok) {
      toast.success('Listo: descargamos tu catálogo en PDF.')
      setBusy(null)
      return
    }
    // Respaldo: el navegador lo imprime o lo guarda como PDF.
    try {
      const data = { ...catalogDocFromCatalog({ ...ctx, prefs }, { lineIds }), title: catalogTitle || CATALOG_TITLE }
      await printDocument(<CatalogDocument template={prefs.catalogTemplate} data={data} />, { title: data.title, theme: themeFromPrefs(prefs, org?.accent) })
      toast.info('Abrimos la impresión: elige «Guardar como PDF» para descargarlo.', { id: 'pdf-fallback' })
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setBusy(null)
    }
  }

  const loading = !ctx || (latestId !== undefined && latest.isLoading)
  const templates = mode === 'quote' ? QUOTE_TEMPLATES : CATALOG_TEMPLATES
  const selected = mode === 'quote' ? prefs.quoteTemplate : prefs.catalogTemplate
  const lines = catalog.data?.lines ?? []
  const brandName = new Map((catalog.data?.brands ?? []).map((b) => [b.id, b.name]))
  const typologyCount = catalogData?.entries.reduce((n, e) => n + e.typologies.length, 0) ?? 0

  return (
    <Page width="wide">
      <style dangerouslySetInnerHTML={{ __html: fontCss }} />
      <DocumentStyles theme={theme} />
      <PageHeader
        title="Documentos"
        description="Cómo se ven tus cotizaciones y tu catálogo de productos. Lo que cambies aquí se usa en cada documento nuevo y se guarda solo."
        actions={
          <>
            <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} />
            <Button variant={mode === 'catalog' ? 'primary' : 'secondary'} icon={FileDown} onClick={generateCatalog} loading={busy === 'pdf'} disabled={!ctx} className="max-sm:hidden">
              Generar catálogo de productos
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<Mode>
          aria-label="Tipo de documento"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'quote', label: 'Cotización', icon: FileText },
            { value: 'catalog', label: 'Catálogo de productos', icon: BookOpen },
          ]}
        />
        <p className="text-[13px] text-paper-600">
          {mode === 'quote' ? 'Elige el diseño con que salen tus cotizaciones. Puedes cambiarlo en cada una.' : 'Un folleto con tus líneas, sus tipologías dibujadas y precios desde, por m².'}
        </p>
      </div>

      {/* Galería de diseños */}
      <section aria-label="Diseños" className="mt-5">
        <div
          role="radiogroup"
          aria-label={mode === 'quote' ? 'Diseño de cotización' : 'Diseño de catálogo'}
          className={cn(
            'scrollbar-quiet -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-0.5 pb-2 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0',
            mode === 'quote' ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          {templates.map((t) => {
            const active = selected === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t.name}
                aria-description={t.description}
                onClick={() => change(mode === 'quote' ? { quoteTemplate: t.id as QuoteTemplateId } : { catalogTemplate: t.id as CatalogTemplateId })}
                className="group flex w-[72vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 rounded-lg text-left sm:w-auto sm:max-w-none"
              >
                <div
                  className={cn(
                    'overflow-hidden rounded-lg border bg-paper-100 p-3 transition-[border-color,box-shadow] duration-160',
                    active ? 'border-ink-500 shadow-[0_0_0_1px_var(--ink-500)]' : 'border-paper-200 group-hover:border-paper-350/70',
                  )}
                >
                  {loading || (mode === 'quote' ? !quoteThumb : !catalogThumb) ? (
                    <Skeleton className="aspect-[1/1.02] w-full rounded-sm" />
                  ) : (
                    <ScaledDoc pageWidth={pageWidth} crop={1.02} inert className="rounded-[2px]">
                      {mode === 'quote' ? (
                        <QuoteDocument template={t.id as QuoteTemplateId} data={quoteThumb!} />
                      ) : (
                        <CatalogDocument template={t.id as CatalogTemplateId} data={catalogThumb!} />
                      )}
                    </ScaledDoc>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <span className="font-medium text-paper-900">{t.name}</span>
                  {active ? (
                    <Badge tone="ink" size="sm">
                      Predeterminado
                    </Badge>
                  ) : (
                    <span className="text-meta text-paper-600 opacity-0 transition-opacity duration-160 group-hover:opacity-100">Usar este</span>
                  )}
                </div>
                <p className="-mt-1 px-0.5 text-meta leading-4 text-paper-600">
                  {t.description}
                  {'bestFor' in t ? <span className="block text-paper-900/80">Ideal para: {(t as { bestFor: string }).bestFor.toLowerCase()}</span> : null}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Teléfono: alternar entre ajustes y vista previa */}
      <div className="mt-8 lg:hidden">
        <SegmentedControl
          aria-label="Ver"
          block
          value={mobileView}
          onValueChange={setMobileView}
          options={[
            { value: 'preview', label: 'Vista previa' },
            { value: 'edit', label: 'Estilo y textos' },
          ]}
        />
      </div>

      <div className="mt-4 grid items-start gap-6 lg:mt-8 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <aside
          className={cn(
            'scrollbar-quiet rounded-lg border border-paper-200 bg-paper-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-88px)] lg:overflow-y-auto',
            mobileView === 'edit' ? 'block' : 'max-lg:hidden',
          )}
          aria-label="Estilo y textos"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-paper-200 bg-paper-0/95 px-5 py-3 backdrop-blur-[2px]">
            <h2 className="font-semibold text-paper-900">{mode === 'quote' ? 'Estilo y textos' : 'Estilo y contenido'}</h2>
            <div className="flex items-center gap-0.5">
              <IconButton icon={Undo2} label="Deshacer" shortcut="mod+z" size="sm" disabled={!history.canUndo} onClick={history.undo} />
              <IconButton icon={Redo2} label="Rehacer" shortcut="shift+mod+z" size="sm" disabled={!history.canRedo} onClick={history.redo} />
            </div>
          </div>
          <div className="p-5">
            {settings.isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-40" />
              </div>
            ) : (
              <PrefsEditor prefs={prefs} orgAccent={org?.accent} onChange={change} showTexts={mode === 'quote'}>
                {mode === 'catalog' ? (
                  <section className="flex flex-col gap-4">
                    <div className="flex items-end justify-between gap-3 border-b border-paper-200 pb-2">
                      <h3 className="text-[13px] font-semibold tracking-[0.01em] text-paper-900">Contenido</h3>
                      <span className="text-meta text-paper-600 tabular">
                        {formatNumber(lineIds.length)} {lineIds.length === 1 ? 'línea' : 'líneas'} · {formatNumber(typologyCount)} tipologías
                      </span>
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-paper-900">Título de portada</span>
                      <Input value={catalogTitle} onChange={(e) => setCatalogTitle(e.target.value)} placeholder={CATALOG_TITLE} />
                    </label>
                    {lines.length ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-medium text-paper-900">Líneas</span>
                          <button
                            type="button"
                            className="rounded-xs text-[13px] font-medium text-ink-600 hover:text-ink-700"
                            onClick={() => setExcluded(excluded.size ? new Set() : new Set(allLineIds))}
                          >
                            {excluded.size ? 'Todas' : 'Ninguna'}
                          </button>
                        </div>
                        <ul className="flex max-h-72 flex-col overflow-y-auto rounded-md border border-paper-200 scrollbar-quiet">
                          {lines.map((line) => (
                            <li key={line.id} className="border-b border-paper-200/70 px-3 py-2 last:border-b-0">
                              <Checkbox
                                checked={!excluded.has(line.id)}
                                onCheckedChange={(v) => {
                                  const next = new Set(excluded)
                                  if (v) next.delete(line.id)
                                  else next.add(line.id)
                                  setExcluded(next)
                                }}
                                label={line.name}
                                description={`${brandName.get(line.brandId) ?? ''} · ${line.kind === 'sliding' ? 'Corredera' : 'Practicable'}${
                                  partialIds.has(line.id) ? ' · datos incompletos: algunos precios saldrán «a consultar»' : ''
                                }`}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="rounded-md bg-paper-50 px-3 py-2 text-[13px] text-paper-600">
                        Activa tus marcas en <Link to="/catalogo" className="font-medium text-ink-600">Catálogo</Link> para armar el folleto con tus líneas.
                      </p>
                    )}
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-paper-900">
                        Pie de página <span className="font-normal text-paper-600">(opcional)</span>
                      </span>
                      <Input value={prefs.footer ?? ''} onChange={(e) => change({ footer: e.target.value || undefined }, 'footer')} placeholder={org?.name ?? ''} />
                    </label>
                  </section>
                ) : null}
              </PrefsEditor>
            )}
          </div>
        </aside>

        <section aria-label="Vista previa" className={cn('min-w-0', mobileView === 'preview' ? 'block' : 'max-lg:hidden')}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-2 text-[13px] text-paper-600">
              {mode === 'quote' ? (
                quoteBase?.source.kind === 'quote' ? (
                  <>
                    <span>Con tu cotización</span>
                    <Link to={`/cotizaciones/${quoteBase.source.id}`} className="truncate font-medium text-ink-600 hover:text-ink-700">
                      N° {quoteBase.source.number} · {quoteBase.source.title || 'Sin título'}
                    </Link>
                  </>
                ) : (
                  <>
                    <Badge tone="neutral" size="sm">
                      Ejemplo
                    </Badge>
                    <span>Armado con tus líneas y tus precios.</span>
                  </>
                )
              ) : (
                <span>Con tus líneas activas y precios desde, calculados con tus precios.</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {mode === 'quote' ? (
                <span className="hidden items-center gap-1.5 text-[13px] text-paper-600 xl:inline-flex">
                  <PenLine aria-hidden className="size-3.5" strokeWidth={1.75} />
                  Haz clic en un texto para editarlo
                </span>
              ) : null}
              <Button size="sm" icon={Printer} onClick={printCurrent} loading={busy === 'print'} disabled={loading}>
                Imprimir
              </Button>
              {mode === 'catalog' ? (
                <Button size="sm" variant="primary" icon={FileDown} onClick={generateCatalog} loading={busy === 'pdf'} disabled={loading || !lineIds.length}>
                  Descargar PDF
                </Button>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border border-paper-200 bg-paper-100 p-3 sm:p-6">
            {loading || (mode === 'quote' ? !quoteData : !catalogData) ? (
              <Skeleton className="mx-auto aspect-[816/1056] w-full max-w-[816px] rounded-sm" />
            ) : mode === 'quote' ? (
              <ScaledDoc key={`q-${previewKey}-${shown.paper}`} pageWidth={pageWidth}>
                <QuoteDocument template={shown.quoteTemplate} data={quoteData!} editable onEdit={onDocEdit} />
              </ScaledDoc>
            ) : catalogData!.entries.length ? (
              <ScaledDoc key={`c-${shown.paper}`} pageWidth={pageWidth}>
                <CatalogDocument template={shown.catalogTemplate} data={catalogData!} />
              </ScaledDoc>
            ) : (
              <p className="px-4 py-16 text-center text-paper-600">Elige al menos una línea para armar el catálogo.</p>
            )}
          </div>
        </section>
      </div>
    </Page>
  )
}
