import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { RotateCw, Upload } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { TextureCommitResponse, TextureFinish, TexturePreview, TexturePreviewResponse, TextureSeamMethod, TextureWarningCode } from '@dekopen/shared'
import { TEXTURE_FINISHES } from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import {
  Button,
  Checkbox,
  Field,
  Input,
  Notice,
  NumberField,
  SegmentedControl,
  Sheet,
  SheetContent,
  Slider,
  StatusDot,
  Switch,
  toast,
} from '../../../ui'
import { IconFoil } from '../../../ui/icons'
import { texturesApi, useRefreshTextures } from './api'
import es from './i18n/es'
import { UPLOAD_MAX_BYTES, UPLOAD_TYPES, nameFromFileName, normalizeRotation, pctToFactor, readFileAsDataUrl, type ColorAppearance } from './model'
import { WindowPreview } from './WindowPreview'

export interface UploadSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: Catalog | undefined
  /** Foto soltada directamente sobre la pestaña. */
  initialFile?: File | null
  onSaved?: (result: TextureCommitResponse) => void
}

type View = 'window' | 'tile' | 'repeat' | 'before'
type Step = keyof typeof es.upload.steps

interface Adjust {
  autoRotate: boolean
  /** Giro base (el que había al empezar a corregir a mano) + cuartos de vuelta + ajuste fino. */
  base: number | null
  quarters: number
  fine: number
  finish?: TextureFinish
  seam: TextureSeamMethod
  /** Lado del recorte centrado (fracción del lado menor). */
  crop: number
}

const INITIAL_ADJUST: Adjust = { autoRotate: true, base: null, quarters: 0, fine: 0, seam: 'feather', crop: 0.92 }

/** Avisos que no le sirven a quien sube (la IA no está configurada en este servidor). */
const HIDDEN_WARNINGS: ReadonlySet<TextureWarningCode> = new Set(['ai_unavailable'])
const AI_WARNINGS: ReadonlySet<TextureWarningCode> = new Set(['ai_plan', 'ai_no_credits', 'ai_daily_limit', 'ai_failed'])

function processOptions(adjust: Adjust, source: { width: number; height: number } | undefined) {
  const rotation = adjust.base !== null ? normalizeRotation(adjust.base + adjust.quarters * 90 + adjust.fine) : undefined
  const crop =
    source && Math.abs(adjust.crop - 0.92) > 0.005
      ? (() => {
          const side = Math.min(source.width, source.height) * adjust.crop
          const width = side / source.width
          const height = side / source.height
          return { x: round4((1 - width) / 2), y: round4((1 - height) / 2), width: round4(width), height: round4(height) }
        })()
      : undefined
  return {
    autoRotate: adjust.autoRotate,
    ...(rotation !== undefined ? { rotationDeg: rotation } : {}),
    ...(adjust.finish ? { finish: adjust.finish } : {}),
    seam: adjust.seam,
    ...(crop ? { crop } : {}),
  }
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

export function UploadSheet({ open, onOpenChange, catalog, initialFile, onSaved }: UploadSheetProps) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const plan = usePlan()
  const refresh = useRefreshTextures()
  const aiPossible = Boolean(plan?.has('assistant') && plan.credits.left > 0)

  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<TexturePreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [adjust, setAdjust] = useState<Adjust>(INITIAL_ADJUST)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [scaleMm, setScaleMm] = useState<number | null>(null)
  const [view, setView] = useState<View>('window')
  const [saving, setSaving] = useState(false)
  const lines = catalog?.lines ?? []
  const [createColor, setCreateColor] = useState(true)
  const [lineIds, setLineIds] = useState<string[] | null>(null)
  const [showLines, setShowLines] = useState(false)
  const [surcharge, setSurcharge] = useState<number | null>(0)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const adjustAbort = useRef<AbortController | null>(null)
  const adjustTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = useRef<string | null>(null)

  const preview: TexturePreview | null = result?.preview ?? null
  const selectedLines = lineIds ?? lines.map((l) => l.id)
  const steps: Step[] = useMemo(() => ['checking', 'cropping', 'grain', 'seamless', ...(aiPossible ? (['naming'] as const) : [])], [aiPossible])

  // La pestaña puede abrir la hoja con una foto ya soltada.
  useEffect(() => {
    if (open && initialFile) void choose(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile])

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }, [objectUrl])

  // Pasos escritos mientras el servidor procesa (se detienen en el último hasta que responda).
  useEffect(() => {
    if (!processing) return
    setStep(0)
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 520)
    return () => clearInterval(timer)
  }, [processing, steps.length])

  function reset() {
    adjustAbort.current?.abort()
    if (adjustTimer.current) clearTimeout(adjustTimer.current)
    if (draftRef.current) void texturesApi.discard(draftRef.current).catch(() => undefined)
    draftRef.current = null
    setFile(null)
    setObjectUrl(null)
    setResult(null)
    setError(null)
    setProcessing(false)
    setAdjusting(false)
    setAdjust(INITIAL_ADJUST)
    setName('')
    setNameTouched(false)
    setScaleMm(null)
    setView('window')
    setLineIds(null)
    setShowLines(false)
    setSurcharge(0)
    setCreateColor(true)
  }

  function close(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function errorMessage(err: unknown): string {
    if (err instanceof ApiRequestError) {
      const reason = (err.body as { reason?: string } | undefined)?.reason
      if (reason && t.has(`upload.errors.${reason}`)) return t(`upload.errors.${reason}` as 'upload.errors.format')
    }
    return humanError(err)
  }

  async function choose(next: File) {
    setError(null)
    if (!(UPLOAD_TYPES as readonly string[]).includes(next.type)) {
      setError(t('upload.errors.type'))
      return
    }
    if (next.size > UPLOAD_MAX_BYTES) {
      setError(t('upload.errors.too_large'))
      return
    }
    if (draftRef.current) void texturesApi.discard(draftRef.current).catch(() => undefined)
    draftRef.current = null
    setFile(next)
    setObjectUrl(URL.createObjectURL(next))
    setResult(null)
    setAdjust(INITIAL_ADJUST)
    setScaleMm(null)
    const fromFile = nameFromFileName(next.name)
    setName(fromFile ?? '')
    setNameTouched(Boolean(fromFile))
    await upload(next, INITIAL_ADJUST, { useAi: aiPossible && !fromFile, name: fromFile ?? undefined })
  }

  async function upload(source: File, adj: Adjust, extra: { useAi?: boolean; name?: string } = {}) {
    setProcessing(true)
    try {
      const dataUrl = await readFileAsDataUrl(source)
      const res = (await texturesApi.upload({ dataUrl, preview: true, ...processOptions(adj, undefined), ...(extra.useAi ? { useAi: true } : {}), ...(extra.name ? { name: extra.name } : {}) })) as TexturePreviewResponse
      draftRef.current = res.draft.id
      apply(res)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setProcessing(false)
    }
  }

  function apply(res: TexturePreviewResponse) {
    setResult(res)
    if (!nameTouched) setName(res.preview.name)
  }

  /** Vuelve a procesar con otros ajustes (borrador en el servidor; si venció, se resube la foto). */
  function runAdjust(next: Adjust, options: { delay?: number; useAi?: boolean } = {}) {
    setAdjust(next)
    if (adjustTimer.current) clearTimeout(adjustTimer.current)
    adjustTimer.current = setTimeout(async () => {
      const draftId = draftRef.current
      if (!draftId || !file) return
      adjustAbort.current?.abort()
      const controller = new AbortController()
      adjustAbort.current = controller
      setAdjusting(true)
      try {
        const res = await texturesApi.adjust(draftId, { ...processOptions(next, preview?.analysis.source), ...(options.useAi ? { useAi: true } : {}) }, controller.signal)
        if (!controller.signal.aborted) apply(res)
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
        if (err instanceof ApiRequestError && err.status === 410) await upload(file, next, { useAi: options.useAi })
        else toast.error(errorMessage(err))
      } finally {
        if (adjustAbort.current === controller) setAdjusting(false)
      }
    }, options.delay ?? 0)
  }

  function startManual(change: Partial<Adjust>) {
    const base = adjust.base ?? preview?.analysis.rotatedDeg ?? 0
    runAdjust({ ...adjust, autoRotate: false, base, ...change }, { delay: change.fine !== undefined ? 320 : 0 })
  }

  async function save() {
    const draftId = draftRef.current
    if (!draftId || !preview) return
    setSaving(true)
    try {
      const body = {
        ...processOptions(adjust, preview.analysis.source),
        scaleMm: Math.round(scaleMm ?? preview.scaleMm),
        ...(name.trim() ? { name: name.trim().slice(0, 80) } : {}),
        ...(createColor ? { color: { lineIds: selectedLines, priceFactor: pctToFactor(surcharge ?? 0) } } : {}),
      }
      let res: TextureCommitResponse
      try {
        res = await texturesApi.commit(draftId, body)
      } catch (err) {
        // El borrador venció mientras se ajustaba: se resube y se guarda con los mismos ajustes.
        if (!(err instanceof ApiRequestError && err.status === 410) || !file) throw err
        const dataUrl = await readFileAsDataUrl(file)
        const fresh = (await texturesApi.upload({ dataUrl, preview: true, ...processOptions(adjust, preview.analysis.source) })) as TexturePreviewResponse
        res = await texturesApi.commit(fresh.draft.id, body)
      }
      draftRef.current = null
      const label = res.color?.name ?? res.texture.name
      toast.success(res.duplicate ? t('toast.textureDuplicate', { name: res.texture.name }) : res.color ? t('toast.textureSavedColor', { name: label }) : t('toast.textureSaved', { name: label }))
      refresh(Boolean(res.color))
      onSaved?.(res)
      close(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) void choose(dropped)
  }

  const appearance: ColorAppearance | null = preview
    ? {
        hex: preview.hex,
        source: 'upload',
        tileUrl: preview.tileDataUrl,
        thumbUrl: preview.thumbDataUrl,
        finish: preview.finish,
        scaleMm: scaleMm ?? preview.scaleMm,
        light: preview.analysis.palette.light,
        dark: preview.analysis.palette.dark,
      }
    : null

  const grainText = preview
    ? !preview.analysis.autoRotated && preview.analysis.rotatedDeg !== 0
      ? t('upload.grainManual', { angle: `${fmt.number(preview.analysis.rotatedDeg, { maxDecimals: 1 })}°` })
      : preview.analysis.autoRotated
        ? t('upload.grainRotated', { angle: `${fmt.number(preview.analysis.grainAngleDeg, { maxDecimals: 1 })}°` })
        : preview.analysis.coherence >= 0.28
          ? t('upload.grainStraight')
          : t('upload.grainNone')
    : ''

  const warnings = (preview?.warnings ?? []).filter((w) => !HIDDEN_WARNINGS.has(w))
  const refColorName = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of lines.filter((x) => selectedLines.includes(x.id))) if (l.colorIds[0]) counts.set(l.colorIds[0], (counts.get(l.colorIds[0]) ?? 0) + 1)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return catalog?.colors.find((c) => c.id === top)?.name ?? catalog?.colors[0]?.name ?? ''
  }, [lines, selectedLines, catalog])

  const linesSummary =
    selectedLines.length === 0
      ? t('upload.noLines')
      : selectedLines.length === lines.length
        ? t('upload.allLines')
        : fmt.list(lines.filter((l) => selectedLines.includes(l.id)).map((l) => l.name))

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent
        title={t('upload.title')}
        description={t('upload.description')}
        width={920}
        footer={
          preview ? (
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                {t('upload.cancel')}
              </Button>
              <Button onClick={() => inputRef.current?.click()} disabled={saving}>
                {t('upload.changePhoto')}
              </Button>
              <Button variant="primary" onClick={() => void save()} loading={saving} disabled={adjusting}>
                {createColor ? t('upload.saveWithColor') : t('upload.save')}
              </Button>
            </>
          ) : null
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const picked = e.target.files?.[0]
            e.target.value = ''
            if (picked) void choose(picked)
          }}
        />
        {!file || (!preview && !processing) ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex min-h-72 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-100 ease-out',
                dragging ? 'border-accent bg-accent-subtle' : 'border-divider-strong bg-sunken hover:border-control-hover hover:bg-hover',
              )}
            >
              <IconFoil aria-hidden className="size-8 text-fg-muted" strokeWidth={1.5} />
              <span className="text-h4 font-medium text-fg-strong">{t('upload.dropTitle')}</span>
              <span className="text-table text-fg-muted">{t('upload.dropFormats')}</span>
              <span className="mt-2 inline-flex items-center gap-2 rounded-control border border-divider-strong bg-surface px-3 py-1.5 text-base font-medium text-fg shadow-xs">
                <Upload aria-hidden className="size-4" strokeWidth={1.75} />
                {t('upload.choose')}
              </span>
            </button>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <ul className="grid gap-2 text-table text-fg-muted sm:grid-cols-3">
              {(['tipFront', 'tipFlat', 'tipClean'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2 rounded-panel bg-sunken px-3 py-2.5">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  {t(`upload.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        ) : processing && !preview ? (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="relative aspect-square overflow-hidden rounded-panel border border-divider bg-sunken">
              {objectUrl ? <img src={objectUrl} alt="" className="size-full object-cover opacity-80" /> : null}
            </div>
            <ol className="flex flex-col justify-center gap-3" aria-live="polite">
              {steps.map((key, i) => (
                <li key={key} className={cn('flex items-center gap-3 text-base transition-opacity duration-180', i > step ? 'opacity-40' : 'opacity-100')}>
                  <StatusDot tone={i < step ? 'success' : i === step ? 'accent' : 'neutral'} pulse={i === step} />
                  <span className={i === step ? 'font-medium text-fg-strong' : 'text-fg-muted'}>{t(`upload.steps.${key}`)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : preview && appearance ? (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <SegmentedControl
                aria-label={t('editor.preview')}
                value={view}
                onValueChange={(v) => setView(v as View)}
                size="sm"
                options={[
                  { value: 'window', label: t('upload.onWindow') },
                  { value: 'tile', label: t('upload.after') },
                  { value: 'repeat', label: t('upload.repeat') },
                  { value: 'before', label: t('upload.before') },
                ]}
              />
              <div className={cn('relative aspect-square overflow-hidden rounded-panel border border-divider bg-sunken transition-opacity duration-140', adjusting && 'opacity-80')}>
                {view === 'window' ? (
                  <>
                    <WindowPreview appearance={appearance} label={t('upload.previewAlt', { name: name || preview.name })} className="size-full p-4" />
                    <div className="absolute right-3 bottom-3 size-28 overflow-hidden rounded-sm border border-divider bg-surface shadow-raised">
                      <WindowPreview appearance={appearance} variant="corner" label={t('upload.previewAlt', { name: name || preview.name })} className="size-full" />
                    </div>
                  </>
                ) : view === 'tile' ? (
                  <img src={preview.tileDataUrl} alt={t('upload.previewAlt', { name: name || preview.name })} className="size-full object-cover" />
                ) : view === 'repeat' ? (
                  <div
                    role="img"
                    aria-label={t('upload.repeat')}
                    className="size-full"
                    style={{ backgroundImage: `url("${preview.tileDataUrl}")`, backgroundSize: '33.3333% 33.3333%', backgroundRepeat: 'repeat' }}
                  />
                ) : (
                  <div className="relative size-full">
                    <img src={preview.beforeDataUrl} alt={t('upload.before')} className="size-full object-cover" />
                    {preview.analysis.coherence >= 0.28 ? (
                      <svg aria-hidden viewBox="-50 -50 100 100" className="pointer-events-none absolute inset-0 size-full">
                        <g transform={`rotate(${preview.analysis.grainAngleDeg})`}>
                          <line x1={-40} y1={0} x2={40} y2={0} stroke="white" strokeWidth={1.6} strokeDasharray="4 3" opacity={0.9} />
                          <path d="M 36 -3 L 42 0 L 36 3" fill="none" stroke="white" strokeWidth={1.6} opacity={0.9} />
                        </g>
                      </svg>
                    ) : null}
                  </div>
                )}
              </div>
              <p className="flex items-center gap-2 text-table text-fg-muted" aria-live="polite">
                <StatusDot tone={adjusting ? 'accent' : 'neutral'} pulse={adjusting} />
                {adjusting ? t('upload.updating') : grainText}
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <Field
                label={t('upload.name')}
                hint={
                  preview.ai && preview.ai.name !== name ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {t('upload.aiSuggestion')}: <span className="font-medium text-fg">{preview.ai.name}</span>
                      <button
                        type="button"
                        className="font-medium text-accent hover:text-accent-hover"
                        onClick={() => {
                          setName(preview.ai!.name)
                          setNameTouched(true)
                        }}
                      >
                        {t('upload.useSuggestion')}
                      </button>
                    </span>
                  ) : undefined
                }
                aside={
                  aiPossible && !preview.ai ? (
                    <button type="button" className="font-medium text-accent hover:text-accent-hover" title={t('upload.suggestHint')} onClick={() => runAdjust(adjust, { useAi: true })}>
                      {t('upload.suggest')}
                    </button>
                  ) : undefined
                }
              >
                <Input
                  value={name}
                  maxLength={80}
                  onChange={(e) => {
                    setName(e.target.value)
                    setNameTouched(true)
                  }}
                />
              </Field>

              <Field label={t('upload.finish')}>
                <SegmentedControl
                  aria-label={t('upload.finish')}
                  value={adjust.finish ?? preview.finish}
                  onValueChange={(v) => runAdjust({ ...adjust, finish: v as TextureFinish })}
                  options={TEXTURE_FINISHES.map((f) => ({ value: f, label: g.term(`finish.${f}`) }))}
                  block
                  size="sm"
                />
              </Field>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-table font-medium text-fg">{t('upload.grain')}</span>
                  <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => startManual({ quarters: (adjust.quarters + 1) % 4 })}>
                    {t('upload.rotate')}
                  </Button>
                </div>
                <Switch
                  checked={adjust.autoRotate}
                  onCheckedChange={(on) => runAdjust(on ? { ...adjust, autoRotate: true, base: null, quarters: 0, fine: 0 } : { ...adjust, autoRotate: false, base: preview.analysis.rotatedDeg })}
                  label={t('upload.autoRotate')}
                  size="sm"
                />
                <Field label={t('upload.fine')}>
                  <Slider value={adjust.fine} min={-15} max={15} step={0.5} onValueChange={(v) => startManual({ fine: v })} format={(v) => `${fmt.number(v, { maxDecimals: 1 })}°`} />
                </Field>
              </div>

              <Field label={t('upload.scale')} hint={t('upload.scaleHint')}>
                <div className="flex items-center gap-3">
                  <Slider className="flex-1" value={scaleMm ?? preview.scaleMm} min={40} max={1600} step={10} onValueChange={(v) => setScaleMm(v)} />
                  <NumberField className="w-32" value={scaleMm ?? preview.scaleMm} onChange={(v) => setScaleMm(v === null ? null : Math.max(10, Math.min(5000, v)))} min={10} max={5000} unit="mm" />
                </div>
              </Field>

              <Field label={t('upload.seam')} hint={t('upload.seamHint')}>
                <SegmentedControl
                  aria-label={t('upload.seam')}
                  value={adjust.seam}
                  onValueChange={(v) => runAdjust({ ...adjust, seam: v as TextureSeamMethod })}
                  options={[
                    { value: 'feather', label: t('upload.seamFeather') },
                    { value: 'mirror', label: t('upload.seamMirror') },
                  ]}
                  size="sm"
                />
              </Field>

              {warnings.length ? (
                <div className="flex flex-col gap-2">
                  {warnings.map((w) => (
                    <Notice key={w} size="compact" tone={AI_WARNINGS.has(w) ? 'neutral' : 'warning'}>
                      {t(`upload.warnings.${w}`)}
                    </Notice>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 rounded-panel border border-divider bg-sunken p-4">
                <Checkbox checked={createColor} onCheckedChange={(v) => setCreateColor(v === true)} label={t('upload.createColor')} />
                {createColor ? (
                  <div className="flex flex-col gap-3 pl-7">
                    <p className="text-table text-fg-muted">
                      {t('upload.offeredIn', { lines: linesSummary })}{' '}
                      {lines.length > 1 ? (
                        <button type="button" className="font-medium text-accent hover:text-accent-hover" onClick={() => setShowLines((s) => !s)} aria-expanded={showLines}>
                          {t('upload.chooseLines')}
                        </button>
                      ) : null}
                    </p>
                    {showLines ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {lines.map((l) => (
                          <Checkbox
                            key={l.id}
                            checked={selectedLines.includes(l.id)}
                            onCheckedChange={(v) => setLineIds(v === true ? [...selectedLines, l.id] : selectedLines.filter((id) => id !== l.id))}
                            label={l.name}
                          />
                        ))}
                      </div>
                    ) : null}
                    <Field label={t('upload.surcharge', { color: refColorName })} hint={t('upload.surchargeHint')}>
                      <NumberField className="w-36" value={surcharge} onChange={setSurcharge} min={-50} max={500} step={1} bigStep={10} unit="%" />
                    </Field>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {error && preview ? (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
