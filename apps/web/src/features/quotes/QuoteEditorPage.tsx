/**
 * /cotizaciones/:id — editor de cotización (SPEC §5). Carga la cotización, el catálogo y los
 * ajustes; el editor (store por cotización) se encarga del resto: cálculo en vivo, historial,
 * autoguardado y acciones.
 *
 * El precio en vivo usa el catálogo y los ajustes del caché: si están viejos (p. ej. recién
 * cambiaste tus precios y quedaron invalidados) se espera la respuesta fresca antes de abrir, y
 * lo que llegue después (otra persona cambió precios, volviste a la pestaña) se aplica al editor.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { OrgSettings, Quote } from '@dekopen/shared'
import { api, ApiRequestError, humanError } from '../../lib/api'
import { useCatalog, useSettings } from '../../lib/hooks'
import { translate, useT } from '../../lib/i18n'
import { qk } from '../../lib/queryClient'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, buttonClass, EmptyState, Skeleton } from '../../ui'
import { toast } from './editor/toasts'
import es from './i18n/es'
import { createEditorUi, EditorProvider } from './editor/context'
import { Editor } from './editor/Editor'
import { localDrafts, pruneLocalDrafts } from './model/localDrafts'
import { acquireEditor, releaseEditor, retainEditor } from './model/registry'
import { createQuoteEditor, type EditorNotice, type EditorSettings, type EditorView } from './model/store'

type LoadedQuote = Quote & { deletedAt?: string }

/** Tope de espera por datos frescos al abrir: nunca se bloquea el editor por una red lenta. */
const FRESH_WAIT_MS = 2500

/** ¿El caché se sabe viejo y ya se está pidiendo de nuevo? Entonces conviene esperar la respuesta. */
function isRefreshing(query: Pick<UseQueryResult, 'isStale' | 'isFetching'>): boolean {
  return query.isStale && query.isFetching
}

let pruned = false

export default function QuoteEditorPage() {
  const t = useT(es)
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const quote = useQuery<LoadedQuote>({
    queryKey: qk.quote(id),
    queryFn: () => api.quotes.get(id),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
  const catalog = useCatalog()
  const settings = useSettings()

  // Antes de crear el editor de esta cotización, si el catálogo o los ajustes del caché están
  // viejos y se están pidiendo de nuevo, se espera esa respuesta (con tope). Una vez abierto, los
  // datos nuevos se aplican en vivo (EditorRoot) y no se vuelve al esqueleto.
  const opened = useRef<string | null>(null)
  const waitingFresh = opened.current !== id && (isRefreshing(catalog) || isRefreshing(settings))
  const [gaveUp, setGaveUp] = useState<string | null>(null)
  useEffect(() => {
    if (!waitingFresh) return
    const timer = setTimeout(() => setGaveUp(id), FRESH_WAIT_MS)
    return () => clearTimeout(timer)
  }, [waitingFresh, id])

  const failed = quote.error ?? catalog.error ?? settings.error
  if (failed && !(quote.data && catalog.data && settings.data)) {
    const notFound = failed instanceof ApiRequestError && failed.status === 404
    return (
      <PageMessage
        title={notFound ? t('page.notFound.title') : t('page.openError')}
        description={notFound ? t('page.notFound.description') : humanError(failed)}
        retry={
          notFound
            ? undefined
            : () => {
                void quote.refetch()
                void catalog.refetch()
                void settings.refetch()
              }
        }
      />
    )
  }
  if (!quote.data || !catalog.data || !settings.data) return <EditorSkeleton />
  if (waitingFresh && gaveUp !== id) return <EditorSkeleton />
  if (quote.data.deletedAt) {
    return (
      <PageMessage
        title={t('page.trashed.title', { number: quote.data.number })}
        description={t('page.trashed.description')}
        action={
          <Button
            variant="primary"
            icon={RotateCcw}
            onClick={() =>
              api.quotes.restore(id).then(
                (restored) => {
                  queryClient.setQueryData(qk.quote(id), restored)
                  void queryClient.invalidateQueries({ queryKey: ['quotes'] })
                },
                (e) => toast.error(humanError(e)),
              )
            }
          >
            {t('page.trashed.restore')}
          </Button>
        }
      />
    )
  }
  opened.current = id
  return <EditorRoot key={id} quote={quote.data} catalog={catalog.data} settings={settings.data} />
}

function notify(notice: EditorNotice) {
  if (notice.kind === 'merged') toast(translate(es, 'page.notice.merged'))
  else if (notice.kind === 'restored') toast(translate(es, 'page.notice.restored'), { duration: 8000 })
  else if (notice.kind === 'conflict')
    toast(translate(es, 'page.notice.conflict'), {
      duration: 12_000,
      action: { label: translate(es, 'page.notice.recover'), onClick: notice.recover },
    })
  else toast.error(notice.message)
}

function editorSettings(settings: OrgSettings): EditorSettings {
  return {
    pricing: settings.pricing,
    cut: settings.cut,
    documents: settings.documents,
    defaults: settings.defaults,
    locale: settings.locale,
    currency: settings.currency,
    taxLabel: settings.taxLabel,
    sending: settings.sending,
    payments: settings.payments,
  }
}

/** Parámetro de la URL con la vista del editor: recargar o compartir el enlace vuelve a ella. */
const VIEW_PARAM = 'vista'
const VIEW_DOCUMENT = 'documento'

function viewFromParams(params: URLSearchParams): EditorView {
  return params.get(VIEW_PARAM) === VIEW_DOCUMENT ? 'document' : 'design'
}

function EditorRoot({ quote, catalog, settings }: { quote: LoadedQuote; catalog: Catalog; settings: OrgSettings }) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const urlView = viewFromParams(params)
  const [editor] = useState(() =>
    acquireEditor(quote.id, () => {
      if (!pruned) {
        pruned = true
        pruneLocalDrafts()
      }
      return createQuoteEditor(
        { quote, catalog, settings: editorSettings(settings), initialView: urlView },
        {
          transport: { save: (id, body) => api.quotes.save(id, body), get: (id) => api.quotes.get(id) },
          notify,
          drafts: localDrafts,
        },
      )
    }),
  )
  const [ui] = useState(() => createEditorUi({ sendOpen: params.get('enviar') === '1' }))

  // Catálogo y ajustes que llegan después de abrir (refetch, otra persona cambió precios, el editor
  // reutilizado de antes): el precio en vivo se recalcula con lo mismo que usará el servidor.
  const pricingSettings = useMemo(() => editorSettings(settings), [settings])
  useEffect(() => {
    editor.setCatalog(catalog)
  }, [editor, catalog])
  useEffect(() => {
    editor.setSettings(pricingSettings)
  }, [editor, pricingSettings])

  useEffect(() => {
    retainEditor(quote.id)
    return () =>
      releaseEditor(quote.id, (e) => {
        // La lista y el caché quedan al día con lo último guardado. Los totales son los del
        // servidor (no los vivos): así, al volver, se nota si tus precios cambiaron desde el envío.
        queryClient.setQueryData(qk.quote(quote.id), { ...e.getQuote(), totals: e.get().meta.totals })
        void queryClient.invalidateQueries({ queryKey: ['quotes'] })
      })
  }, [quote.id, queryClient])

  // Datos frescos que llegan después de abrir (p. ej. desde el caché): se adoptan si no editaste.
  useEffect(() => {
    editor.adoptServerQuote(quote)
  }, [editor, quote])

  // Vista Diseño / Documento ↔ `?vista=documento` (la URL manda al abrir o al navegar atrás).
  useEffect(() => {
    editor.setView(urlView)
  }, [editor, urlView])
  useEffect(
    () =>
      editor.store.subscribe((state, previous) => {
        if (state.view === previous.view) return
        setParams(
          (current) => {
            if (viewFromParams(current) === state.view) return current
            const next = new URLSearchParams(current)
            if (state.view === 'document') next.set(VIEW_PARAM, VIEW_DOCUMENT)
            else next.delete(VIEW_PARAM)
            return next
          },
          { replace: true },
        )
      }),
    [editor, setParams],
  )

  useEffect(() => {
    if (params.has('enviar')) {
      params.delete('enviar')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  return (
    <EditorProvider editor={editor} ui={ui}>
      <Editor />
    </EditorProvider>
  )
}

function PageMessage({ title, description, retry, action }: { title: string; description: string; retry?: () => void; action?: ReactNode }) {
  const t = useT(es)
  usePageTitle(t('page.title'))
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        title={title}
        description={description}
        action={
          action ??
          (retry ? (
            <Button variant="primary" onClick={retry}>
              {t('page.retry')}
            </Button>
          ) : (
            <Link to="/cotizaciones" className={buttonClass('primary')}>
              <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
              {t('page.back')}
            </Link>
          ))
        }
        secondary={
          action || retry ? (
            <Link to="/cotizaciones" className={buttonClass('ghost')}>
              {t('page.back')}
            </Link>
          ) : undefined
        }
      />
    </div>
  )
}

/** Bloques quietos con la forma del editor (sin shimmer): cabecera, ventanas, lienzo, inspector y resumen. */
function EditorSkeleton() {
  const t = useT(es)
  usePageTitle(t('page.title'))
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas" aria-busy="true" aria-label={t('page.opening')}>
      <div className="flex h-14 shrink-0 items-center gap-3 px-5 max-lg:hidden">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-5 w-32" />
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 bg-sunken">
        <div className="hidden w-[264px] shrink-0 flex-col gap-1 p-2 lg:flex xl:w-[272px]">
          <Skeleton className="mx-3 my-3 h-4 w-24" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-2.5 py-2">
              <Skeleton className="size-12" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 place-items-center">
          <Skeleton className="h-64 w-56" />
        </div>
        <div className="hidden w-[328px] shrink-0 space-y-3 bg-surface p-4 xl:block">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <div className="h-16 shrink-0 max-lg:hidden" />
    </div>
  )
}
