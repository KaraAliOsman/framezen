import { useMemo, useRef, useState, type DragEvent } from 'react'
import { ArrowRight, FileSpreadsheet, TriangleAlert, Upload, X } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import { formatCLP } from '@framezen/engine'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import { Badge, Button, Card, IconButton, SegmentedControl, Select, Spinner, toast, toastUndo } from '../../../ui'
import { useImportCsv, usePriceOverrides, useSavePrices, type ImportCsvResponse } from '../api'
import { changePct, previewImport, type ImportPreview } from '../model/importPreview'
import { MiniStat, Swatch } from '../parts'

const MAX_BYTES = 15 * 1024 * 1024

export function ImportTab({ catalog, onDone }: { catalog: Catalog | undefined; onDone: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string; size: number } | null>(null)
  const [brandId, setBrandId] = useState('auto')
  const [view, setView] = useState<'changes' | 'unmatched'>('changes')
  const [dragging, setDragging] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportCsvResponse | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const importCsv = useImportCsv()
  const save = useSavePrices()
  const overrides = usePriceOverrides()

  const preview = useMemo<ImportPreview | null>(() => {
    if (!file || !catalog) return null
    try {
      return previewImport(file.text, catalog, { brandId: brandId === 'auto' ? undefined : brandId })
    } catch {
      return null
    }
  }, [file, catalog, brandId])

  const read = async (f: File | undefined) => {
    setReadError(null)
    setResult(null)
    if (!f) return
    if (f.size > MAX_BYTES) {
      setReadError('El archivo pesa más de 15 MB. Exporta solo las marcas que usas y vuelve a intentarlo.')
      return
    }
    const text = await f.text()
    if (!text.trim()) {
      setReadError('El archivo está vacío. Exporta tu lista «MisPrecios» y vuelve a soltarla aquí.')
      return
    }
    setFile({ name: f.name, text, size: f.size })
    setView('changes')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void read(e.dataTransfer.files?.[0])
  }

  const apply = () => {
    if (!file) return
    const previous = overrides.data?.overrides ?? []
    importCsv.mutate(
      { csv: file.text, brandId: brandId === 'auto' ? undefined : brandId },
      {
        onSuccess: (res) => {
          setResult(res)
          if (res.matched > 0) {
            toastUndo(importMessage(res), () =>
              save.mutate(
                { overrides: previous, replace: true },
                { onSuccess: () => toast.success('Volvimos a tus precios de antes.'), onError: (e) => toast.error(humanError(e)) },
              ),
            )
          } else toast.info(importMessage(res))
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }

  const brandOptions = useMemo(
    () => [
      { value: 'auto', label: 'Según la columna Marca' },
      ...(catalog?.brands ?? []).map((b) => ({ value: b.id, label: `Todo es de ${b.name}` })),
    ],
    [catalog],
  )

  if (result) {
    return (
      <Card padding="lg" className="flex flex-col items-start gap-4">
        <div className="flex items-start gap-3">
          <span className={cn('inline-flex size-10 items-center justify-center rounded-md', result.matched ? 'bg-ok-50 text-ok-600' : 'bg-warn-50 text-warn-600')}>
            <FileSpreadsheet aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-h3 font-semibold tracking-[-0.01em] text-paper-900">{result.matched ? 'Precios actualizados' : 'No encontramos coincidencias'}</h2>
            <p className="mt-1 max-w-xl text-paper-600">{importMessage(result)}</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-4 rounded-md border border-paper-200 p-4 sm:grid-cols-4">
          <MiniStat label="filas leídas" value={result.rows} />
          <MiniStat label="precios actualizados" value={result.matched} />
          <MiniStat label="no calzaron" value={result.unmatched} tone={result.unmatched ? 'warn' : 'default'} />
          <MiniStat label="precios tuyos en total" value={result.overridesTotal} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onDone}>
            Ver mis precios
          </Button>
          <Button
            onClick={() => {
              setResult(null)
              setFile(null)
            }}
          >
            Importar otro archivo
          </Button>
        </div>
      </Card>
    )
  }

  if (!file || !preview) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex min-h-72 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-160',
            dragging ? 'border-ink-500 bg-ink-50' : 'border-paper-350/60 bg-paper-0 hover:border-paper-600',
          )}
        >
          <span className="inline-flex size-12 items-center justify-center rounded-lg bg-paper-100 text-paper-600">
            <Upload aria-hidden className="size-6" strokeWidth={1.5} />
          </span>
          <span>
            <span className="block text-h3 font-semibold tracking-[-0.01em] text-paper-900">Suelta aquí tu lista «MisPrecios»</span>
            <span className="mt-1 block text-paper-600">Archivo CSV separado por punto y coma. Antes de guardar te mostramos qué cambia.</span>
          </span>
          <span className="inline-flex h-9 items-center rounded-sm border border-paper-200 bg-paper-0 px-3.5 font-medium text-paper-900">Elegir archivo</span>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              void read(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {readError ? (
            <span role="alert" className="flex items-center gap-1.5 text-[13px] text-bad-600">
              <TriangleAlert aria-hidden className="size-4" strokeWidth={1.75} />
              {readError}
            </span>
          ) : null}
        </label>
        <aside className="flex flex-col gap-3 rounded-lg border border-paper-200 bg-paper-0 p-5 text-[13px] leading-[18px] text-paper-600">
          <h3 className="text-base font-semibold text-paper-900">Cómo funciona</h3>
          <ol className="flex list-decimal flex-col gap-2 pl-4">
            <li>Exporta tu lista de precios en CSV desde tu planilla o tu distribuidor.</li>
            <li>La cruzamos con tu catálogo por código, color y descripción.</li>
            <li>Revisas qué precios suben o bajan y los que no encontramos.</li>
            <li>Aplicas. Si algo no te gusta, lo deshaces con un clic.</li>
          </ol>
          <p className="border-t border-paper-200 pt-3">
            Columnas que leemos: <span className="text-paper-900">Marca, Tipo, Código, Descripción, Línea, Color y Precio</span>. El orden da igual.
          </p>
        </aside>
      </div>
    )
  }

  const colors = new Map((catalog?.colors ?? []).map((c) => [c.id, c]))
  const shown = preview.changes.slice(0, 200)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-paper-200 bg-paper-0 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-ink-50 text-ink-700">
            <FileSpreadsheet aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-paper-900">{file.name}</p>
            <p className="text-meta text-paper-600">
              {formatNumber(preview.rows)} filas{preview.brands.length ? ` · ${preview.brands.slice(0, 3).join(', ')}${preview.brands.length > 3 ? '…' : ''}` : ''}
            </p>
          </div>
          <IconButton icon={X} label="Quitar archivo" size="sm" onClick={() => setFile(null)} />
        </div>
        <Select aria-label="Marca del archivo" value={brandId} onValueChange={setBrandId} options={brandOptions} className="sm:w-64" />
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-paper-200 bg-paper-0 p-4 sm:grid-cols-4">
        <MiniStat label="precios cambian" value={preview.changes.length} />
        <MiniStat label="ya estaban iguales" value={preview.unchanged} />
        <MiniStat label="no encontrados" value={preview.unmatched.length} tone={preview.unmatched.length ? 'warn' : 'default'} />
        <MiniStat label="filas sin precio u omitidas" value={preview.skipped} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          aria-label="Qué ver"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'changes', label: `Cambios · ${formatNumber(preview.changes.length)}` },
            { value: 'unmatched', label: `No encontrados · ${formatNumber(preview.unmatched.length)}` },
          ]}
        />
        {preview.review ? (
          <p className="flex items-center gap-1.5 text-[13px] text-warn-800">
            <TriangleAlert aria-hidden className="size-4 text-warn-600" strokeWidth={1.75} />
            {preview.review} {preview.review === 1 ? 'cambio grande para revisar' : 'cambios grandes para revisar'} (más de ±60 %)
          </p>
        ) : null}
      </div>

      {view === 'changes' ? (
        preview.changes.length ? (
          <div className="overflow-hidden rounded-md border border-paper-200 bg-paper-0">
            <div className="scrollbar-quiet overflow-x-auto">
              <table className="w-full min-w-[600px] text-table">
                <thead>
                  <tr className="h-9 border-b border-paper-200 bg-paper-50 text-meta text-paper-600">
                    <th scope="col" className="px-3 text-left font-medium">Artículo</th>
                    <th scope="col" className="px-3 text-left font-medium max-md:hidden">Línea</th>
                    <th scope="col" className="px-3 text-left font-medium">Color</th>
                    <th scope="col" className="px-3 text-right font-medium">Ahora</th>
                    <th scope="col" className="w-6" />
                    <th scope="col" className="px-3 text-right font-medium">Nuevo</th>
                    <th scope="col" className="px-3 text-right font-medium">Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const pct = changePct(c.before, c.after)
                    const color = c.colorId ? colors.get(c.colorId) : undefined
                    return (
                      <tr key={c.key} className={cn('h-10 border-b border-paper-200 last:border-b-0', c.review && 'bg-warn-50/50')}>
                        <td className="max-w-[300px] px-3">
                          <span className="flex min-w-0 items-baseline gap-2">
                            {c.code ? <span className="shrink-0 font-mono text-[12px] text-paper-600">{c.code}</span> : null}
                            <span className="truncate text-paper-900">{c.name}</span>
                          </span>
                        </td>
                        <td className="px-3 text-paper-600 max-md:hidden">{c.lineName ?? c.brandName}</td>
                        <td className="px-3">
                          {color ? (
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <Swatch color={color} size={12} />
                              {color.name}
                            </span>
                          ) : (
                            <span className="text-paper-600">—</span>
                          )}
                        </td>
                        <td className="px-3 text-right whitespace-nowrap text-paper-600 tabular">{c.before > 0 ? formatCLP(c.before) : 'Sin precio'}</td>
                        <td className="text-center text-paper-350">
                          <ArrowRight aria-hidden className="inline size-3.5" />
                        </td>
                        <td className="px-3 text-right font-medium whitespace-nowrap text-paper-900 tabular">{formatCLP(c.after)}</td>
                        <td className="px-3 text-right whitespace-nowrap">
                          {pct === null ? (
                            <Badge tone="ok" size="sm">
                              Nuevo
                            </Badge>
                          ) : c.review ? (
                            <Badge tone="warn" size="sm">
                              Revisa · {pct > 0 ? '+' : ''}
                              {formatNumber(pct, 1)} %
                            </Badge>
                          ) : (
                            <span className={cn('tabular', pct > 0 ? 'text-paper-900' : 'text-ok-800')}>
                              {pct > 0 ? '+' : ''}
                              {formatNumber(pct, 1)} %
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {preview.changes.length > shown.length ? (
              <p className="border-t border-paper-200 px-3 py-2 text-center text-[13px] text-paper-600">
                y {formatNumber(preview.changes.length - shown.length)} cambios más.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-paper-200 bg-paper-0 px-4 py-8 text-center text-paper-600">
            {preview.matched ? 'Todos los precios del archivo ya están iguales en tu catálogo.' : 'Ninguna fila calzó con tus marcas activas. Prueba eligiendo la marca del archivo arriba.'}
          </p>
        )
      ) : preview.unmatched.length ? (
        <div className="overflow-hidden rounded-md border border-paper-200 bg-paper-0">
          <ul className="divide-y divide-paper-200">
            {preview.unmatched.slice(0, 100).map((row, i) => (
              <li key={`${row.code}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-2 text-table">
                <span className="flex min-w-0 items-baseline gap-2">
                  {row.code ? <span className="shrink-0 font-mono text-[12px] text-paper-600">{row.code}</span> : null}
                  <span className="truncate text-paper-900">{row.description}</span>
                </span>
                <span className="shrink-0 text-paper-600 tabular">
                  {row.brand ? `${row.brand} · ` : ''}
                  {formatCLP(row.price)}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-paper-200 bg-paper-50 px-3 py-2 text-[13px] leading-[18px] text-paper-600">
            Estos artículos no están en tus marcas activas o tienen otro código. No se pierde nada: el resto se guarda igual.
          </p>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-paper-200 bg-paper-0 px-4 py-8 text-center text-paper-600">Todo lo del archivo calzó con tu catálogo.</p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-paper-200 bg-paper-50/95 px-4 py-3 backdrop-blur-[2px] sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-lg sm:border sm:bg-paper-0">
        <p className="text-[13px] leading-[18px] text-paper-600">
          Comparamos con tus marcas activas. Al aplicar también guardamos los precios de marcas desactivadas. Puedes deshacerlo.
        </p>
        <Button variant="primary" onClick={apply} disabled={importCsv.isPending || preview.rows === 0} className="shrink-0">
          {importCsv.isPending ? <Spinner size={16} /> : null}
          {preview.changes.length ? `Aplicar ${formatNumber(preview.changes.length)} ${preview.changes.length === 1 ? 'precio' : 'precios'}` : 'Aplicar igual'}
        </Button>
      </div>
    </div>
  )
}

/** Resumen en una frase, con plurales correctos. */
export function importMessage(res: Pick<ImportCsvResponse, 'matched' | 'unmatched'>): string {
  if (!res.matched) return 'No encontramos coincidencias con tu catálogo. Revisa que la marca del archivo esté activa o elígela arriba.'
  const updated = `Actualizamos ${formatNumber(res.matched)} ${res.matched === 1 ? 'precio' : 'precios'}.`
  if (!res.unmatched) return updated
  return `${updated} ${formatNumber(res.unmatched)} ${res.unmatched === 1 ? 'fila no calzó' : 'filas no calzaron'} con tu catálogo.`
}
