import { describe, expect, it } from 'vitest'
import { sampleWorkshopData, workshopLabelCount } from '@framezen/documents'
import { renderWorkshopDocument, renderWorkshopDocumentAsync } from '../src/services/pdf/render'

/** Los ids de useId llevan un prefijo por tramo: se numeran en orden de aparición para comparar. */
function normalizeIds(html: string): string {
  const ids = [...new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]
  let out = html
  for (const [id, placeholder] of ids.map((id, i) => [id, `ID${i}`] as const).sort((a, b) => b[0].length - a[0].length)) out = out.split(id).join(placeholder)
  return out
}

describe('documentos de taller grandes sin congelar la API', () => {
  it('las etiquetas de una OT grande se arman por tramos: los demás pedidos se atienden mientras tanto', async () => {
    const base = sampleWorkshopData()
    const data = sampleWorkshopData({ windows: base.windows.map((w) => ({ ...w, qty: w.qty * 8 })) })
    expect(workshopLabelCount(data)).toBeGreaterThan(1500)

    // Un «latido» con setImmediate: cuenta cuántas veces corre el bucle de eventos durante el armado.
    const beat = () => {
      let ticks = 0
      let running = true
      const tick = () => {
        ticks++
        if (running) setImmediate(tick)
      }
      setImmediate(tick)
      return () => {
        running = false
        return ticks
      }
    }

    const stopSync = beat()
    const sync = renderWorkshopDocument(data, { kind: 'labels' })
    const syncTicks = stopSync()
    const stopAsync = beat()
    const sliced = await renderWorkshopDocumentAsync(data, { kind: 'labels' })
    const asyncTicks = stopAsync()

    // El síncrono no deja correr nada; el por tramos cede el hilo muchas veces.
    expect(syncTicks).toBe(0)
    expect(asyncTicks).toBeGreaterThan(5)
    // Mismo documento, título y archivo.
    expect(sliced.title).toBe(sync.title)
    expect(sliced.fileName).toEqual(sync.fileName)
    expect(normalizeIds(sliced.html)).toBe(normalizeIds(sync.html))
  }, 60_000)
})
