import { useCallback, useState, type ReactElement } from 'react'
import { workshopDocumentFileName, type WorkshopDocumentKind } from '@dekopen/documents'
import { translate } from '../../../lib/i18n'
import { toast } from '../../../ui'
import { fetchServerPdf, pdfUrl, saveBlob } from '../data'
import es from '../i18n/es'
import { printElement } from '../print'

/** Documentos cuyas cifras cambian con los ajustes de corte (barras, sobrantes, costos). */
export const CUT_DEPENDENT: ReadonlySet<WorkshopDocumentKind> = new Set(['cuts', 'cut-order', 'materials', 'materials-costs', 'purchase', 'costs', 'labels'])

/** De dónde sale el PDF cuando no es de una OT (los cortes de una cotización). */
export interface DocumentSource {
  url: (kind: WorkshopDocumentKind, params?: DocumentRequest['params']) => string
  fileName: (kind: WorkshopDocumentKind, ext?: string) => string
}

export interface DocumentRequest {
  kind: WorkshopDocumentKind
  element: ReactElement
  /** Se suma al nombre del archivo: «OT-38-Cortes-Hojas.pdf». */
  fileSuffix?: string
  /**
   * Parámetros extra del PDF del servidor, con los nombres que lee GET /work-orders/:id/pdf
   * (`labels=sheet|roll` en etiquetas, `brandId` en compras).
   */
  params?: Record<string, string | number | undefined>
  /**
   * Si el PDF del servidor no respetaría una opción elegida en pantalla, el aviso a mostrar:
   * el PDF se arma en el navegador para que salga igual que la vista previa.
   */
  browserOnly?: string
  /**
   * Si el documento es demasiado grande para armarlo en el navegador (miles de etiquetas o de
   * barras traban o botan la pestaña), el porqué: «Imprimir» baja el PDF del servidor y, si el
   * servidor falla, se avisa en vez de armarlo en la pestaña.
   */
  serverOnly?: string
}

/**
 * Imprimir y descargar documentos de taller. El PDF lo arma el servidor; si no puede (o si
 * estás simulando ajustes de corte que el servidor no conoce), se imprime desde el navegador
 * con «Guardar como PDF», sin bloquear nada. Los documentos enormes (`serverOnly`) nunca se
 * arman en el navegador.
 */
export function useDocumentActions({ orderId, orderNumber, simulated, source }: { orderId: string; orderNumber: number; simulated: boolean; source?: DocumentSource }) {
  const [busy, setBusy] = useState<WorkshopDocumentKind | null>(null)

  const fileName = useCallback(
    (req: DocumentRequest) => {
      const name = source ? source.fileName(req.kind) : workshopDocumentFileName(req.kind, orderNumber)
      return req.fileSuffix ? name.replace(/\.pdf$/, `-${req.fileSuffix}.pdf`) : name
    },
    [source, orderNumber],
  )

  const printInBrowser = useCallback(
    (req: DocumentRequest) => {
      void printElement(req.element, fileName(req).replace(/\.pdf$/, ''))
    },
    [fileName],
  )

  /** Baja el PDF del servidor; false si no se pudo. */
  const fromServer = useCallback(
    async (req: DocumentRequest): Promise<boolean> => {
      setBusy(req.kind)
      const blob = await fetchServerPdf(source ? source.url(req.kind, req.params) : pdfUrl(orderId, req.kind, req.params))
      setBusy(null)
      if (!blob) return false
      saveBlob(blob, fileName(req))
      return true
    },
    [orderId, source, fileName],
  )

  /** Simulación de corte en curso: el servidor no la conoce, su PDF saldría con otras cifras. */
  const simulating = useCallback((req: DocumentRequest) => simulated && CUT_DEPENDENT.has(req.kind), [simulated])

  /** Documento enorme: solo el PDF del servidor, o un aviso claro si no se puede. */
  const serverOnly = useCallback(
    async (req: DocumentRequest, reason: string, printing: boolean) => {
      if (simulating(req)) {
        toast.error(translate(es, 'doc.toast.simulating', { reason }))
        return
      }
      if (req.browserOnly) {
        toast.error(translate(es, 'doc.toast.options', { reason }))
        return
      }
      if (printing) toast(translate(es, 'doc.toast.downloading', { reason }))
      if (await fromServer(req)) return
      toast.error(translate(es, 'doc.toast.serverFailed', { reason }))
    },
    [simulating, fromServer],
  )

  const print = useCallback(
    (req: DocumentRequest) => {
      if (req.serverOnly) {
        void serverOnly(req, req.serverOnly, true)
        return
      }
      printInBrowser(req)
    },
    [printInBrowser, serverOnly],
  )

  const download = useCallback(
    async (req: DocumentRequest) => {
      if (req.serverOnly) {
        await serverOnly(req, req.serverOnly, false)
        return
      }
      if (simulating(req)) {
        toast(translate(es, 'doc.toast.browserSim'))
        printInBrowser(req)
        return
      }
      if (req.browserOnly) {
        toast(req.browserOnly)
        printInBrowser(req)
        return
      }
      if (await fromServer(req)) return
      toast(translate(es, 'doc.toast.browserFallback'))
      printInBrowser(req)
    },
    [simulating, serverOnly, fromServer, printInBrowser],
  )

  return { print, download, busy }
}
