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
import type { Catalog } from '@framezen/engine'
import type { OrgSettings, Quote } from '@framezen/shared'
import { api, ApiRequestError, humanError } from '../../lib/api'
import { useCatalog, useSettings } from '../../lib/hooks'
import { qk } from '../../lib/queryClient'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, buttonClass, EmptyState, Skeleton } from '../../ui'
import { toast } from './editor/toasts'
import { createEditorUi, EditorProvider } from './editor/context'
import { Editor } from './editor/Editor'
import { localDrafts, pruneLocalDrafts } from './model/localDrafts'
import { acquireEditor, releaseEditor, retainEditor } from './model/registry'
import { createQuoteEditor, type EditorNotice, type EditorSettings } from './model/store'

type LoadedQuote = Quote & { deletedAt?: string }

/** Tope de espera por datos frescos al abrir: nunca se bloquea el editor por una red lenta. */
const FRESH_WAIT_MS = 2500

/** ¿El caché se sabe viejo y ya se está pidiendo de nuevo? Entonces conviene esperar la respuesta. */
function isRefreshing(query: Pick<UseQueryResult, 'isStale' | 'isFetching'>): boolean {
  return query.isStale && query.isFetching
}

let pruned = false

export default function QuoteEditorPage() {
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
        title={notFound ? 'No encontramos esa cotización' : 'No pudimos abrir la cotización'}
        description={notFound ? 'Puede que la hayan eliminado o que el enlace esté incompleto.' : humanError(failed)}
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
        title={`La N° ${quote.data.number} está en la papelera`}
        description="Restáurala para seguir editándola. Nada se perdió."
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
            Restaurar
          </Button>
        }
      />
    )
  }
  opened.current = id
  return <EditorRoot key={id} quote={quote.data} catalog={catalog.data} settings={settings.data} />
}

function notify(notice: EditorNotice) {
  if (notice.kind === 'merged') toast('Sumamos los cambios hechos en otra pestaña.')
  else if (notice.kind === 'restored') toast('Recuperamos cambios que no alcanzaron a guardarse en este equipo. Los estamos guardando.', { duration: 8000 })
  else if (notice.kind === 'conflict')
    toast('Esta cotización cambió en otra pestaña. Te mostramos la versión más reciente.', {
      duration: 12_000,
      action: { label: 'Recuperar mis cambios', onClick: notice.recover },
    })
  else toast.error(notice.message)
}

function editorSettings(settings: OrgSettings): EditorSettings {
  return { pricing: settings.pricing, cut: settings.cut, documents: settings.documents, defaults: settings.defaults }
}

function EditorRoot({ quote, catalog, settings }: { quote: LoadedQuote; catalog: Catalog; settings: OrgSettings }) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [editor] = useState(() =>
    acquireEditor(quote.id, () => {
      if (!pruned) {
        pruned = true
        pruneLocalDrafts()
      }
      return createQuoteEditor(
        { quote, catalog, settings: editorSettings(settings) },
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
  usePageTitle('Cotización')
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        sketch="casement"
        title={title}
        description={description}
        action={
          action ??
          (retry ? (
            <Button variant="primary" onClick={retry}>
              Reintentar
            </Button>
          ) : (
            <Link to="/cotizaciones" className={buttonClass('primary')}>
              <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
              Volver a cotizaciones
            </Link>
          ))
        }
        secondary={
          action || retry ? (
            <Link to="/cotizaciones" className={buttonClass('ghost')}>
              Volver a cotizaciones
            </Link>
          ) : undefined
        }
      />
    </div>
  )
}

/** Bloques quietos con la forma del editor (sin shimmer). */
function EditorSkeleton() {
  usePageTitle('Cotización')
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Abriendo la cotización">
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[280px] shrink-0 flex-col gap-3 border-r border-paper-200 bg-paper-0 p-4 lg:flex">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-9 w-full" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-12" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-12 border-b border-paper-200" />
          <div className="grid flex-1 place-items-center">
            <Skeleton className="h-64 w-56" />
          </div>
        </div>
        <div className="hidden w-[320px] shrink-0 space-y-3 border-l border-paper-200 bg-paper-0 p-4 xl:block">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <div className="h-16 border-t border-paper-200 bg-paper-0 max-lg:hidden" />
    </div>
  )
}
