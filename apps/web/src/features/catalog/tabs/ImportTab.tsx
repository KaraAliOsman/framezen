import { useMemo, useRef, useState, type DragEvent } from 'react'
import { ArrowRight, TriangleAlert, X } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { translate, useFormat, useT } from '../../../lib/i18n'
import { Button, buttonClass, IconButton, Meter, Notice, SegmentedControl, Select, toast, toastUndo } from '../../../ui'
import { useImportCsv, usePriceOverrides, useSavePrices, type ImportCsvResponse } from '../api'
import es from '../i18n/es'
import { changePct, previewImport, type ImportPreview } from '../model/importPreview'
import { MiniStat, Swatch } from '../parts'

const MAX_BYTES = 15 * 1024 * 1024

type Step = 'file' | 'review' | 'done'
const STEPS: Step[] = ['file', 'review', 'done']

/** Pasos de la importación como indicador (no interactivo): archivo → revisión → listo. */
function Steps({ current }: { current: Step }) {
  const t = useT(es)
  const index = STEPS.indexOf(current)
  return (
    <div aria-label={t('import.stepsLabel')} className="flex items-center gap-3">
      <p className="text-table text-fg-muted tabular">
        {t('import.stepOf', { n: index + 1, total: STEPS.length })} · <span className="text-fg">{t(`import.step.${current}`)}</span>
      </p>
      <Meter value={index + 1} max={STEPS.length} aria-label={t('import.stepsLabel')} className="w-20" />
    </div>
  )
}

export function ImportTab({ catalog, onDone }: { catalog: Catalog | undefined; onDone: () => void }) {
  const t = useT(es)
  const fmt = useFormat()
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
      setReadError(t('import.tooBig'))
      return
    }
    const text = await f.text()
    if (!text.trim()) {
      setReadError(t('import.empty'))
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
              save.mutate({ overrides: previous, replace: true }, { onSuccess: () => toast.success(t('import.undone')), onError: (e) => toast.error(humanError(e)) }),
            )
          } else toast.info(importMessage(res))
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }

  const brandOptions = useMemo(
    () => [{ value: 'auto', label: t('import.brandAuto') }, ...(catalog?.brands ?? []).map((b) => ({ value: b.id, label: t('import.brandForced', { name: b.name }) }))],
    [catalog, t],
  )

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <Steps current="done" />
        <div className="flex flex-col items-start gap-6">
          <div>
            <h2 className="font-display text-h2 font-medium text-fg-strong">{result.matched ? t('import.resultTitle') : t('import.resultNone')}</h2>
            <p className="mt-1 max-w-xl text-fg-muted">{importMessage(result)}</p>
          </div>
          <div className="grid w-full max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            <MiniStat label={t('import.statRows')} value={result.rows} />
            <MiniStat label={t('import.statUpdated')} value={result.matched} />
            <MiniStat label={t('import.statUnmatched')} value={result.unmatched} tone={result.unmatched ? 'warn' : 'default'} />
            <MiniStat label={t('import.statOwnTotal')} value={result.overridesTotal} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={onDone}>
              {t('import.seePrices')}
            </Button>
            <Button
              onClick={() => {
                setResult(null)
                setFile(null)
              }}
            >
              {t('import.another')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!file || !preview) {
    return (
      <div className="flex flex-col gap-4">
        <Steps current="file" />
        <div className="flex max-w-3xl flex-col gap-3">
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex min-h-56 cursor-pointer flex-col items-center justify-center gap-4 rounded-panel border border-dashed border-divider-strong bg-plate px-6 py-10 text-center transition-colors duration-100 ease-out',
              dragging ? 'border-accent bg-accent-subtle' : 'hover:border-control hover:bg-hover',
            )}
          >
            <span>
              <span className="block text-h3 font-medium text-fg-strong">{t('import.dropTitle')}</span>
              <span className="mt-1 block text-fg-muted">{t('import.dropHelp')}</span>
            </span>
            <span className={buttonClass('secondary', 'md')}>{t('import.choose')}</span>
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
              <span role="alert" className="flex items-center gap-1.5 text-table text-danger">
                <TriangleAlert aria-hidden className="size-4" strokeWidth={1.75} />
                {readError}
              </span>
            ) : null}
          </label>
          <p className="text-table text-fg-muted">{t.rich('import.columns', { b: <span className="text-fg" /> })}</p>
        </div>
      </div>
    )
  }

  const colors = new Map((catalog?.colors ?? []).map((c) => [c.id, c]))
  const shown = preview.changes.slice(0, 200)
  const signedPct = (n: number) => (n > 0 ? `+${fmt.pct(n)}` : fmt.pct(n))

  return (
    <div className="flex flex-col gap-4">
      <Steps current="review" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-fg-strong">{file.name}</p>
            <p className="text-meta text-fg-muted">
              {t('import.rows', { count: preview.rows })}
              {preview.brands.length ? ` · ${preview.brands.slice(0, 3).join(', ')}${preview.brands.length > 3 ? '…' : ''}` : ''}
            </p>
          </div>
          <IconButton icon={X} label={t('import.removeFile')} size="sm" onClick={() => setFile(null)} />
        </div>
        <Select aria-label={t('import.brandLabel')} value={brandId} onValueChange={setBrandId} options={brandOptions} size="sm" className="sm:w-64" />
      </div>

      <div className="grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
        <MiniStat label={t('import.statChanges')} value={preview.changes.length} />
        <MiniStat label={t('import.statUnchanged')} value={preview.unchanged} />
        <MiniStat label={t('import.statNotFound')} value={preview.unmatched.length} tone={preview.unmatched.length ? 'warn' : 'default'} />
        <MiniStat label={t('import.statSkipped')} value={preview.skipped} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          aria-label={t('import.viewLabel')}
          value={view}
          onValueChange={setView}
          options={[
            { value: 'changes', label: t('import.viewChanges', { count: fmt.number(preview.changes.length) }) },
            { value: 'unmatched', label: t('import.viewUnmatched', { count: fmt.number(preview.unmatched.length) }) },
          ]}
        />
        {preview.review ? (
          <p className="flex items-center gap-1.5 text-table text-warning">
            <TriangleAlert aria-hidden className="size-4" strokeWidth={1.75} />
            {t('import.review', { count: preview.review })}
          </p>
        ) : null}
      </div>

      {view === 'changes' ? (
        preview.changes.length ? (
          <div>
            <div className="scrollbar-quiet -mx-3 overflow-x-auto rounded-panel bg-plate shadow-plate">
              <table className="w-full min-w-[600px] text-table">
                <thead>
                  <tr className="h-9 border-b border-divider text-table text-fg-muted [&_th]:font-normal">
                    <th scope="col" className="px-3 text-left font-medium">
                      {t('import.colItem')}
                    </th>
                    <th scope="col" className="px-3 text-left font-medium max-md:hidden">
                      {t('import.colLine')}
                    </th>
                    <th scope="col" className="px-3 text-left font-medium">
                      {t('import.colColor')}
                    </th>
                    <th scope="col" className="px-3 text-right font-medium">
                      {t('import.colNow')}
                    </th>
                    <th scope="col" className="w-6" />
                    <th scope="col" className="px-3 text-right font-medium">
                      {t('import.colNew')}
                    </th>
                    <th scope="col" className="px-3 text-right font-medium">
                      {t('import.colChange')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const pct = changePct(c.before, c.after)
                    const color = c.colorId ? colors.get(c.colorId) : undefined
                    return (
                      <tr key={c.key} className={cn('h-9 border-b border-divider last:border-b-0', c.review && 'bg-warning-bg')}>
                        <td className="max-w-[300px] px-3">
                          <span className="flex min-w-0 items-baseline gap-2">
                            {c.code ? <span className="code-id shrink-0 text-meta text-fg-muted">{c.code}</span> : null}
                            <span className="truncate text-fg">{c.name}</span>
                          </span>
                        </td>
                        <td className="px-3 text-fg-muted max-md:hidden">{c.lineName ?? c.brandName}</td>
                        <td className="px-3">
                          {color ? (
                            <span className="flex items-center gap-1.5 whitespace-nowrap">
                              <Swatch color={color} size={14} />
                              {color.name}
                            </span>
                          ) : (
                            <span className="text-fg-muted">{t('common.noneDash')}</span>
                          )}
                        </td>
                        <td className="px-3 text-right whitespace-nowrap text-fg-muted tabular">{c.before > 0 ? fmt.money(c.before) : t('common.noPrice')}</td>
                        <td className="text-center text-fg-faint">
                          <ArrowRight aria-hidden className="inline size-3.5" />
                        </td>
                        <td className="px-3 text-right font-medium whitespace-nowrap text-fg-strong tabular">{fmt.money(c.after)}</td>
                        <td className="px-3 text-right whitespace-nowrap">
                          {pct === null ? (
                            <span className="text-success">{t('import.isNew')}</span>
                          ) : c.review ? (
                            <span className="text-warning tabular">{t('import.reviewBadge', { pct: signedPct(pct) })}</span>
                          ) : (
                            <span className={cn('tabular', pct > 0 ? 'text-fg' : 'text-success')}>{signedPct(pct)}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {preview.changes.length > shown.length ? (
              <p className="py-2 text-table text-fg-muted">{t('import.moreChanges', { count: preview.changes.length - shown.length })}</p>
            ) : null}
          </div>
        ) : (
          <p className="py-6 text-fg-muted">
            {preview.matched ? t('import.allSame') : t('import.noneMatched')}
          </p>
        )
      ) : preview.unmatched.length ? (
        <div>
          <ul className="divide-y divide-divider">
            {preview.unmatched.slice(0, 100).map((row, i) => (
              <li key={`${row.code}-${i}`} className="flex min-h-10 items-baseline justify-between gap-3 py-2 text-table">
                <span className="flex min-w-0 items-baseline gap-2">
                  {row.code ? <span className="code-id shrink-0 text-meta text-fg-muted">{row.code}</span> : null}
                  <span className="truncate text-fg">{row.description}</span>
                </span>
                <span className="shrink-0 text-fg-muted tabular">
                  {row.brand ? `${row.brand} · ` : ''}
                  {fmt.money(row.price)}
                </span>
              </li>
            ))}
          </ul>
          <Notice tone="neutral" size="compact" className="mt-2">
            {t('import.unmatchedNote')}
          </Notice>
        </div>
      ) : (
        <p className="py-6 text-fg-muted">{t('import.allMatched')}</p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-divider bg-canvas/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:pb-3">
        <p className="text-table text-fg-muted">{t('import.footer')}</p>
        <Button variant="primary" onClick={apply} loading={importCsv.isPending} disabled={preview.rows === 0} className="shrink-0">
          {t('import.apply', { count: preview.changes.length })}
        </Button>
      </div>
    </div>
  )
}

/** Resumen en una frase, con plurales correctos (idioma de la interfaz). */
export function importMessage(res: Pick<ImportCsvResponse, 'matched' | 'unmatched'>): string {
  if (!res.matched) return translate(es, 'import.msgNone')
  const updated = translate(es, 'import.msgUpdated', { count: res.matched })
  if (!res.unmatched) return updated
  return translate(es, 'import.msgBoth', { updated, unmatched: translate(es, 'import.msgUnmatched', { count: res.unmatched }) })
}
