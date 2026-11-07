/**
 * Importar clientes desde una planilla (CSV/TSV o filas pegadas desde Excel/Sheets). Paso a paso y
 * sin sorpresas: se lee en el navegador, se muestra qué es cada columna (editable) y una muestra,
 * se omiten los repetidos y recién al confirmar se crean. Al terminar se puede deshacer todo.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileUp, Upload } from 'lucide-react'
import type { Client } from '@dekopen/shared'
import { api, humanError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useT } from '../../lib/i18n'
import { Button, Meter, Notice, Select, Sheet, SheetContent, Textarea, toast, toastUndo } from '../../ui'
import { IconProfileSection } from '../../ui/icons'
import es from './i18n/es'
import { analyzeCsv, CLIENT_FIELDS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, planImport, type ColumnTarget, type CsvAnalysis } from './model/csv'
import { useTaxIdRules } from './taxId'
import { useIsPhone } from './useIsPhone'

type Step = 'pick' | 'review' | 'importing' | 'done'

const PREVIEW_ROWS = 6
const CONCURRENCY = 3

export function ImportClientsSheet({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Clientes ya cargados en la lista (para no duplicar). */
  existing: readonly Pick<Client, 'name' | 'rut'>[]
}) {
  const t = useT(es)
  const tax = useTaxIdRules()
  const phone = useIsPhone()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('pick')
  const [analysis, setAnalysis] = useState<CsvAnalysis | null>(null)
  const [targets, setTargets] = useState<ColumnTarget[]>([])
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState({ done: 0, failed: 0, total: 0 })
  const [failures, setFailures] = useState<string[]>([])
  const created = useRef<string[]>([])
  const stopRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setStep('pick')
    setAnalysis(null)
    setTargets([])
    setPasted('')
    setError(null)
    setProgress({ done: 0, failed: 0, total: 0 })
    setFailures([])
    created.current = []
    stopRef.current = false
  }, [open])

  const plan = useMemo(
    () => (analysis ? planImport(analysis, targets, existing, tax.normalize) : null),
    [analysis, targets, existing, tax.normalize],
  )

  const readText = (text: string) => {
    const result = analyzeCsv(text)
    const usable = result.rows.length > 0 && result.targets.includes('name')
    if (!usable) {
      setError(t('import.nothing'))
      return
    }
    setError(null)
    setAnalysis(result)
    setTargets(result.targets)
    setStep('review')
  }

  const readFile = (file: File | undefined | null) => {
    if (!file) return
    if (file.size > IMPORT_MAX_BYTES) {
      setError(t('import.tooBig'))
      return
    }
    file
      .text()
      .then(readText)
      .catch(() => setError(t('import.unreadable')))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    readFile(e.dataTransfer.files?.[0])
  }

  const runImport = async () => {
    if (!plan || plan.drafts.length === 0) return
    const drafts = plan.drafts
    setStep('importing')
    setProgress({ done: 0, failed: 0, total: drafts.length })
    created.current = []
    stopRef.current = false
    const errors: string[] = []
    let next = 0
    let done = 0
    let failed = 0
    const worker = async () => {
      while (next < drafts.length && !stopRef.current) {
        const draft = drafts[next++]!
        try {
          const client = await api.clients.create(draft)
          created.current.push(client.id)
          done += 1
        } catch (e) {
          failed += 1
          if (errors.length < 5) errors.push(`${draft.name}: ${humanError(e)}`)
        }
        setProgress({ done, failed, total: drafts.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, drafts.length) }, worker))
    setFailures(errors)
    void queryClient.invalidateQueries({ queryKey: ['clients'] })
    setStep('done')
    if (stopRef.current) toast(t('import.stopped'))
  }

  const undoImport = (ids: string[]) => {
    Promise.allSettled(ids.map((id) => api.clients.remove(id))).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast(t('import.undone'))
    })
  }

  const finish = () => {
    const ids = [...created.current]
    onOpenChange(false)
    if (ids.length > 0) toastUndo(t('import.done', { count: ids.length }), () => undoImport(ids))
  }

  const fieldLabel = (field: ColumnTarget) => (field === 'ignore' ? t('import.ignore') : field === 'rut' ? tax.label : t(`fields.${field}`))
  const fieldOptions = (['ignore', ...CLIENT_FIELDS] as ColumnTarget[]).map((value) => ({ value, label: fieldLabel(value) }))

  const footer =
    step === 'pick' ? (
      <>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t('sheet.cancel')}
        </Button>
        <Button variant="primary" disabled={!pasted.trim()} onClick={() => readText(pasted)}>
          {t('import.read')}
        </Button>
      </>
    ) : step === 'review' ? (
      <>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep('pick')}>
          {t('import.back')}
        </Button>
        <Button variant="primary" icon={Upload} disabled={!plan || plan.drafts.length === 0} onClick={() => void runImport()}>
          {t('import.confirm', { count: plan?.drafts.length ?? 0 })}
        </Button>
      </>
    ) : step === 'importing' ? (
      <Button variant="ghost" onClick={() => (stopRef.current = true)}>
        {t('import.stop')}
      </Button>
    ) : (
      <Button variant="primary" onClick={finish}>
        {t('import.close')}
      </Button>
    )

  return (
    <Sheet open={open} onOpenChange={(next) => (step === 'importing' ? undefined : next ? onOpenChange(true) : finish())}>
      <SheetContent side={phone ? 'bottom' : 'right'} width={560} title={t('import.title')} description={t('import.description')} footer={footer}>
        {step === 'pick' ? (
          <div className="flex flex-col gap-5">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-100',
                dragOver ? 'border-accent bg-accent-subtle' : 'border-divider-strong bg-sunken',
              )}
            >
              <FileUp aria-hidden strokeWidth={1.5} className="size-8 text-fg-muted" />
              <div>
                <p className="font-medium text-fg-strong">{t('import.drop')}</p>
                <p className="mt-0.5 text-table text-fg-muted">{t('import.dropHint')}</p>
              </div>
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                {t('import.choose')}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  readFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="import-paste" className="text-table font-medium text-fg-muted">
                {t('import.pasteLabel')}
              </label>
              <Textarea
                id="import-paste"
                rows={5}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={t('import.pastePlaceholder')}
                className="text-table"
              />
            </div>
            {error ? (
              <Notice tone="warning" size="compact">
                {error}
              </Notice>
            ) : null}
          </div>
        ) : null}

        {step === 'review' && analysis && plan ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <p className="text-h4 font-medium text-fg-strong tabular">{t('import.summary', { count: plan.drafts.length })}</p>
              <ul className="text-table text-fg-muted">
                {plan.skippedEmpty > 0 ? <li>{t('import.skippedEmpty', { count: plan.skippedEmpty })}</li> : null}
                {plan.skippedDuplicate > 0 ? <li>{t('import.skippedDuplicate', { count: plan.skippedDuplicate })}</li> : null}
              </ul>
              {plan.truncated > 0 ? (
                <Notice tone="info" size="compact" className="mt-2">
                  {t('import.truncated', { max: IMPORT_MAX_ROWS })}
                </Notice>
              ) : null}
            </div>

            <section aria-labelledby="import-columns" className="flex flex-col gap-2">
              <h3 id="import-columns" className="flex items-center gap-2 text-table font-semibold text-fg">
                <IconProfileSection aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
                {t('import.columns')}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {analysis.headers.map((header, i) => (
                  <div key={i} className="flex min-w-0 items-center gap-2 rounded-sm border border-divider bg-surface py-1 pr-1 pl-2.5">
                    <span className="min-w-0 flex-1 truncate text-table text-fg" title={header}>
                      {analysis.hasHeader ? header : `#${header}`}
                    </span>
                    <Select<ColumnTarget>
                      size="sm"
                      className="w-40 shrink-0"
                      aria-label={t('import.columnLabel', { column: header })}
                      value={targets[i] ?? 'ignore'}
                      onValueChange={(value) =>
                        setTargets((prev) => prev.map((current, j) => (j === i ? value : value !== 'ignore' && current === value ? 'ignore' : current)))
                      }
                      options={fieldOptions}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="import-preview" className="flex flex-col gap-2">
              <h3 id="import-preview" className="text-table font-semibold text-fg">
                {t('import.preview')}
              </h3>
              <div className="scrollbar-quiet overflow-x-auto rounded-md border border-divider">
                <table className="w-full min-w-[480px] text-table">
                  <thead className="bg-sunken text-left text-meta text-fg-muted">
                    <tr>
                      {(['name', 'phone', 'email', 'rut', 'city'] as const).map((f) => (
                        <th key={f} scope="col" className="px-3 py-2 font-medium">
                          {fieldLabel(f)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {plan.drafts.slice(0, PREVIEW_ROWS).map((d, i) => (
                      <tr key={i} className="text-fg">
                        <td className="max-w-48 truncate px-3 py-2 font-medium text-fg-strong">{d.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap tabular">{d.phone ?? '—'}</td>
                        <td className="max-w-48 truncate px-3 py-2">{d.email ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap code-id">{d.rut ?? '—'}</td>
                        <td className="px-3 py-2">{d.city ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.drafts.length > PREVIEW_ROWS ? (
                <p className="text-meta text-fg-muted">{t('import.previewMore', { count: plan.drafts.length - PREVIEW_ROWS })}</p>
              ) : null}
            </section>
          </div>
        ) : null}

        {step === 'importing' || step === 'done' ? (
          <div className="flex flex-col gap-4" aria-live="polite">
            <Meter
              value={progress.done + progress.failed}
              max={Math.max(1, progress.total)}
              size="md"
              tone={step === 'done' && progress.failed === 0 ? 'success' : 'accent'}
              label={step === 'importing' ? t('import.progress', { done: progress.done + progress.failed, total: progress.total }) : t('import.done', { count: progress.done })}
              valueLabel={`${progress.done + progress.failed}/${progress.total}`}
            />
            {step === 'done' && progress.failed > 0 ? (
              <Notice tone="warning" title={t('import.failed', { count: progress.failed })}>
                <ul className="mt-1 space-y-0.5">
                  {failures.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            {step === 'done' && created.current.length > 0 ? (
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const ids = [...created.current]
                    created.current = []
                    undoImport(ids)
                    onOpenChange(false)
                  }}
                >
                  {t('import.undo')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
