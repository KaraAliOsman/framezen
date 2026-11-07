/**
 * Acciones de la cotización que tocan el servidor (PDF, estado, taller, duplicar, papelera).
 * Todas esperan el autoguardado antes de correr, así nunca trabajan con datos viejos: si tus
 * últimos cambios no llegaron al servidor, la acción se detiene y dice qué hacer.
 */
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { resolveDocTemplateRef, type DocLocale, type Quote, type QuoteStatus } from '@dekopen/shared'
import { api, humanError, request } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { revisionLetter } from '../../../lib/format'
import { getGlossary, translate } from '../../../lib/i18n'
import { qk } from '../../../lib/queryClient'
import es from '../i18n/es'
import { appToast, appToastUndo, toast, toastUndo } from './toasts'
import { buildEditorDocData, downloadServerPdf, fetchServerPdf, printQuoteDocument } from '../lib/document'
import { canCopyCurrentLink, pdfFileName, portalUrl, sentPriceDrift } from '../lib/share'
import { UnsavedChangesError } from '../model/store'
import type { DuplicateBody } from '../DuplicateDialog'
import { useEditor, useEditorUiApi } from './context'
import { useQuoteTemplates } from './DocumentPreview'

/** Mensaje para una acción que falló (incluye «tus cambios no se guardaron»). */
export function actionError(error: unknown): string {
  return error instanceof UnsavedChangesError ? error.message : humanError(error)
}

export function useQuoteActions() {
  const editor = useEditor()
  const ui = useEditorUiApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useSession()
  const [busy, setBusy] = useState<null | 'pdf' | 'workshop' | 'status' | 'duplicate' | 'trash'>(null)
  const templates = useQuoteTemplates()
  const orgTemplate = templates.data?.defaults?.quote

  const refreshLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] })
  }, [queryClient])

  /** Plantilla de esta cotización (la elegida o la de la organización) e idioma del documento. */
  const template = useCallback((): string => {
    const s = editor.get()
    const chosen = s.doc.documentOverrides?.templateId
    return chosen ? resolveDocTemplateRef(chosen, 'quote').id : (orgTemplate ?? resolveDocTemplateRef(s.settings.documents?.quoteTemplate, 'quote').id)
  }, [editor, orgTemplate])
  const docLocale = useCallback((): DocLocale => {
    const s = editor.get()
    return (s.doc.documentOverrides?.locale ?? s.settings.locale ?? 'es') as DocLocale
  }, [editor])

  const printFallback = useCallback(() => {
    const s = editor.get()
    const quote = editor.getQuote()
    const data = buildEditorDocData({
      quote,
      org: session.org,
      catalog: s.catalog,
      settings: s.settings,
      client: s.doc.clientId ? s.clients[s.doc.clientId] : undefined,
      evaluation: s.evaluation,
      portalUrl: s.meta.shareToken ? portalUrl(s.meta.shareToken) : undefined,
    })
    const locale = docLocale()
    return printQuoteDocument(data, template(), pdfFileName(quote.number, quote.title, revisionLetter(quote.revision), locale).replace(/\.pdf$/, ''), locale)
  }, [editor, session.org, template, docLocale])

  const downloadPdf = useCallback(async () => {
    if (busy === 'pdf') return
    setBusy('pdf')
    try {
      // El PDF lo arma el servidor con lo guardado: sin tus últimos cambios saldría otro documento.
      await editor.ensureSaved()
      const quote = editor.getQuote()
      const ok = await downloadServerPdf(quote.id, template(), pdfFileName(quote.number, quote.title, revisionLetter(quote.revision), docLocale()))
      if (ok) toast.success(translate(es, 'actions.pdfDone'))
      else await printFallback()
    } catch (error) {
      toast.error(actionError(error))
    } finally {
      setBusy(null)
    }
  }, [busy, editor, printFallback, template, docLocale])

  /** El PDF en memoria, para descargarlo o compartirlo desde el diálogo de envío. */
  const pdfFile = useCallback(async (): Promise<{ blob: Blob; name: string } | null> => {
    const quote = editor.getQuote()
    const blob = await fetchServerPdf(quote.id, template())
    return blob ? { blob, name: pdfFileName(quote.number, quote.title, revisionLetter(quote.revision), docLocale()) } : null
  }, [editor, template, docLocale])

  const setStatus = useCallback(
    async (status: QuoteStatus) => {
      const s = editor.get()
      if (s.meta.status === status) return
      const previous = s.meta.status
      setBusy('status')
      try {
        // El estado no depende del documento: se cambia aunque haya cambios sin guardar.
        await editor.serverOp(() => api.quotes.setStatus(s.meta.id, status), undefined, { requireSaved: false })
        refreshLists()
        toastUndo(translate(es, 'actions.status', { status: getGlossary().quoteStatus(status) }), () => {
          void editor
            .serverOp(() => api.quotes.setStatus(s.meta.id, previous), undefined, { requireSaved: false })
            .then(refreshLists, (e) => toast.error(actionError(e)))
        })
      } catch (error) {
        toast.error(actionError(error))
      } finally {
        setBusy(null)
      }
    },
    [editor, refreshLists],
  )

  const openWorkOrder = useCallback(
    (order: { id: string }) => {
      navigate(`/taller/${order.id}`)
    },
    [navigate],
  )

  /** Los cortes de esta cotización: con lo último guardado, sin crear nada ni exigir OT. */
  const openCuts = useCallback(
    async (order: { id: string } | null) => {
      const s = editor.get()
      try {
        await editor.serverOp(async () => null, () => null)
        await queryClient.invalidateQueries({ queryKey: qk.quote(s.meta.id) })
        navigate(order ? `/taller/${order.id}?pestana=cortes` : `/cotizaciones/${s.meta.id}/cortes`)
      } catch (error) {
        toast.error(actionError(error))
      }
    },
    [editor, navigate, queryClient],
  )

  const toWorkshop = useCallback(async () => {
    const s = editor.get()
    if (s.doc.items.length === 0) {
      toast(translate(es, 'actions.needItems'))
      return
    }
    setBusy('workshop')
    try {
      const order = await editor.serverOp(() => api.workOrders.createFromQuote(s.meta.id), () => null)
      refreshLists()
      void queryClient.invalidateQueries({ queryKey: qk.workOrders })
      appToast.success(translate(es, order.existing ? 'actions.orderOpened' : 'actions.orderCreated', { number: order.number }))
      navigate(`/taller/${order.id}`)
    } catch (error) {
      toast.error(actionError(error))
    } finally {
      setBusy(null)
    }
  }, [editor, navigate, queryClient, refreshLists])

  /** Duplica con lo último guardado para el cliente elegido y abre la copia, con precios de hoy. */
  const duplicateQuote = useCallback(
    async (body: DuplicateBody) => {
      const s = editor.get()
      setBusy('duplicate')
      try {
        const copy = await editor.serverOp(() => request<Quote>(`/quotes/${encodeURIComponent(s.meta.id)}/duplicate`, { method: 'POST', body }), () => null)
        queryClient.setQueryData(qk.quote(copy.id), copy)
        refreshLists()
        const back = s.meta.id
        toast(translate(es, 'actions.duplicated', { number: copy.number }), {
          action: { label: translate(es, 'actions.backTo', { number: s.meta.number }), onClick: () => navigate(`/cotizaciones/${back}`) },
        })
        navigate(`/cotizaciones/${copy.id}`)
      } catch (error) {
        toast.error(actionError(error))
      } finally {
        setBusy(null)
      }
    },
    [editor, navigate, queryClient, refreshLists],
  )

  const trashQuote = useCallback(async () => {
    const s = editor.get()
    setBusy('trash')
    try {
      await editor.serverOp(() => api.quotes.remove(s.meta.id), () => null, { requireSaved: false })
      refreshLists()
      navigate('/cotizaciones')
      appToastUndo(translate(es, 'actions.trashed', { number: s.meta.number }), () => {
        api.quotes.restore(s.meta.id).then(
          (quote) => {
            queryClient.setQueryData(qk.quote(quote.id), quote)
            refreshLists()
            navigate(`/cotizaciones/${quote.id}`)
          },
          (e) => toast.error(humanError(e)),
        )
      })
    } catch (error) {
      toast.error(actionError(error))
    } finally {
      setBusy(null)
    }
  }, [editor, navigate, queryClient, refreshLists])

  /**
   * Copia el enlace vigente del cliente si el documento no cambió desde el envío, aunque tus
   * precios hayan cambiado (copiar nunca crea una versión nueva ni quita una aceptación). Si el
   * documento cambió o nunca se envió, abre «Enviar al cliente», que pide confirmar la versión
   * siguiente antes de crearla.
   */
  const copyLink = useCallback(async () => {
    const s = editor.get()
    const token = s.meta.shareToken
    if (!token || !canCopyCurrentLink(s.meta, s.save.dirty || s.save.status === 'saving')) {
      ui.getState().set({ sendOpen: true, sendIntent: 'copy' })
      return
    }
    try {
      await navigator.clipboard.writeText(portalUrl(token))
      const drift = sentPriceDrift(s.meta, s.evaluation.totals.total)
      toast.success(
        drift
          ? translate(es, 'actions.copiedDrift', { letter: revisionLetter(s.meta.revision), next: revisionLetter(s.meta.revision + 1) })
          : translate(es, 'actions.copied'),
        drift ? { duration: 8000 } : undefined,
      )
    } catch {
      ui.getState().set({ sendOpen: true, sendIntent: null })
    }
  }, [editor, ui])

  return {
    busy,
    openSend: () => ui.getState().set({ sendOpen: true, sendIntent: null }),
    /** Abre «Enviar al cliente» y copia el enlace apenas esté listo. */
    openSendToCopy: () => ui.getState().set({ sendOpen: true, sendIntent: 'copy' }),
    openDuplicate: () => ui.getState().set({ duplicateOpen: true }),
    openDeposit: () => ui.getState().set({ depositOpen: true }),
    downloadPdf,
    pdfFile,
    printFallback,
    setStatus,
    toWorkshop,
    openWorkOrder,
    openCuts,
    duplicateQuote,
    trashQuote,
    copyLink,
  }
}
