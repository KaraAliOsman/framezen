/**
 * Acciones de la cotización que tocan el servidor (PDF, estado, taller, duplicar, papelera).
 * Todas esperan el autoguardado antes de correr, así nunca trabajan con datos viejos: si tus
 * últimos cambios no llegaron al servidor, la acción se detiene y dice qué hacer.
 */
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { QuoteStatus, QuoteTemplateId } from '@framezen/shared'
import { mergeQuoteDocPrefs } from '@framezen/documents'
import { api, humanError } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { revisionLetter } from '../../../lib/format'
import { qk } from '../../../lib/queryClient'
import { QUOTE_STATUS_COPY } from '../../../ui'
import { appToast, appToastUndo, toast, toastUndo } from './toasts'
import { buildEditorDocData, downloadServerPdf, printQuoteDocument } from '../lib/document'
import { canCopyCurrentLink, pdfFileName, portalUrl, sentPriceDrift } from '../lib/share'
import { UnsavedChangesError } from '../model/store'
import { useEditor, useEditorUiApi } from './context'

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

  const refreshLists = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] })
  }, [queryClient])

  const template = useCallback((): QuoteTemplateId => {
    const s = editor.get()
    return mergeQuoteDocPrefs(s.settings.documents, s.doc.documentOverrides).quoteTemplate
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
    return printQuoteDocument(data, template(), pdfFileName(quote.number, quote.title, revisionLetter(quote.revision)).replace(/\.pdf$/, ''))
  }, [editor, session.org, template])

  const downloadPdf = useCallback(async () => {
    if (busy === 'pdf') return
    setBusy('pdf')
    try {
      // El PDF lo arma el servidor con lo guardado: sin tus últimos cambios saldría otro documento.
      await editor.ensureSaved()
      const quote = editor.getQuote()
      const ok = await downloadServerPdf(quote.id, template(), pdfFileName(quote.number, quote.title, revisionLetter(quote.revision)))
      if (ok) toast.success('Descargamos el PDF.')
      else await printFallback()
    } catch (error) {
      toast.error(actionError(error))
    } finally {
      setBusy(null)
    }
  }, [busy, editor, printFallback, template])

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
        toastUndo(`Marcaste la cotización como ${QUOTE_STATUS_COPY[status].label.toLowerCase()}.`, () => {
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

  const toWorkshop = useCallback(async () => {
    const s = editor.get()
    if (s.doc.items.length === 0) {
      toast('Agrega al menos una ventana para pasarla a taller.')
      return
    }
    setBusy('workshop')
    try {
      const order = await editor.serverOp(() => api.workOrders.createFromQuote(s.meta.id), () => null)
      refreshLists()
      void queryClient.invalidateQueries({ queryKey: qk.workOrders })
      appToast.success(order.existing ? `Abrimos la OT N° ${order.number}.` : `Creamos la OT N° ${order.number}. Cortes, vidrios y materiales ya están calculados.`)
      navigate(`/taller/${order.id}`)
    } catch (error) {
      toast.error(actionError(error))
    } finally {
      setBusy(null)
    }
  }, [editor, navigate, queryClient, refreshLists])

  const duplicateQuote = useCallback(async () => {
    const s = editor.get()
    setBusy('duplicate')
    try {
      const copy = await editor.serverOp(() => api.quotes.duplicate(s.meta.id), () => null)
      queryClient.setQueryData(qk.quote(copy.id), copy)
      refreshLists()
      const back = s.meta.id
      toast(`Duplicaste la cotización. Ahora estás en la N° ${copy.number}.`, {
        action: { label: `Volver a la N° ${s.meta.number}`, onClick: () => navigate(`/cotizaciones/${back}`) },
      })
      navigate(`/cotizaciones/${copy.id}`)
    } catch (error) {
      toast.error(actionError(error))
    } finally {
      setBusy(null)
    }
  }, [editor, navigate, queryClient, refreshLists])

  const trashQuote = useCallback(async () => {
    const s = editor.get()
    setBusy('trash')
    try {
      await editor.serverOp(() => api.quotes.remove(s.meta.id), () => null, { requireSaved: false })
      refreshLists()
      navigate('/cotizaciones')
      appToastUndo(`Moviste la N° ${s.meta.number} a la papelera.`, () => {
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
          ? `Copiamos el enlace de la versión ${revisionLetter(s.meta.revision)}. Tus precios cambiaron desde el envío: si quieres que tu cliente vea los de hoy, envía la versión ${revisionLetter(s.meta.revision + 1)}.`
          : 'Copiamos el enlace del cliente.',
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
    downloadPdf,
    printFallback,
    setStatus,
    toWorkshop,
    openWorkOrder,
    duplicateQuote,
    trashQuote,
    copyLink,
  }
}
