import { useCallback, useState, type ReactElement } from 'react'
import { workshopDocumentFileName, type WorkshopDocumentKind } from '@framezen/documents'
import { toast } from '../../../ui'
import { fetchServerPdf, pdfUrl, saveBlob } from '../data'
import { printElement } from '../print'

/** Documentos cuyas cifras cambian con los ajustes de corte (barras, sobrantes, costos). */
export const CUT_DEPENDENT: ReadonlySet<WorkshopDocumentKind> = new Set(['cuts', 'materials', 'materials-costs', 'purchase', 'costs'])

export interface DocumentRequest {
  kind: WorkshopDocumentKind
  element: ReactElement
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
export function useDocumentActions({ orderId, orderNumber, simulated }: { orderId: string; orderNumber: number; simulated: boolean }) {
  const [busy, setBusy] = useState<WorkshopDocumentKind | null>(null)

  const printInBrowser = useCallback(
    (req: DocumentRequest) => {
      const title = workshopDocumentFileName(req.kind, orderNumber, 'pdf').replace(/\.pdf$/, '')
      void printElement(req.element, title)
    },
    [orderNumber],
  )

  /** Baja el PDF del servidor; false si no se pudo. */
  const fromServer = useCallback(
    async (req: DocumentRequest): Promise<boolean> => {
      setBusy(req.kind)
      const blob = await fetchServerPdf(pdfUrl(orderId, req.kind, req.params))
      setBusy(null)
      if (!blob) return false
      saveBlob(blob, workshopDocumentFileName(req.kind, orderNumber))
      return true
    },
    [orderId, orderNumber],
  )

  /** Simulación de corte en curso: el servidor no la conoce, su PDF saldría con otras cifras. */
  const simulating = useCallback((req: DocumentRequest) => simulated && CUT_DEPENDENT.has(req.kind), [simulated])

  /** Documento enorme: solo el PDF del servidor, o un aviso claro si no se puede. */
  const serverOnly = useCallback(
    async (req: DocumentRequest, reason: string, printing: boolean) => {
      if (simulating(req)) {
        toast.error(`${reason} Vuelve a tus ajustes de corte para bajar el PDF del servidor.`)
        return
      }
      if (req.browserOnly) {
        toast.error(`${reason} Y con estas opciones el PDF del servidor no saldría igual que en pantalla.`)
        return
      }
      if (printing) toast(`${reason} Te bajamos el PDF para que lo imprimas.`)
      if (await fromServer(req)) return
      toast.error(`No pudimos armar el PDF en el servidor. ${reason} Prueba de nuevo en un momento.`)
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
        toast('Estás simulando ajustes de corte: armamos el PDF en tu navegador. Elige «Guardar como PDF».')
        printInBrowser(req)
        return
      }
      if (req.browserOnly) {
        toast(req.browserOnly)
        printInBrowser(req)
        return
      }
      if (await fromServer(req)) return
      toast('No pudimos armar el PDF en el servidor. Abrimos la impresión: elige «Guardar como PDF».')
      printInBrowser(req)
    },
    [simulating, serverOnly, fromServer, printInBrowser],
  )

  return { print, download, busy }
}
