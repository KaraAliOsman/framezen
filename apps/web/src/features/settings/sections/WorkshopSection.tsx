import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_CUT, formatMM, optimizeCuts, sanitizeCut, type Bar, type CutSettings } from '@framezen/engine'
import type { OrgSettings } from '@framezen/shared'
import { cn } from '../../../lib/cn'
import { useSettings, useUpdateSettings } from '../../../lib/hooks'
import { NumberField, Skeleton } from '../../../ui'
import { LoadError } from '../components/LoadError'
import { SectionHeader } from '../components/SectionHeader'
import { SettingRow } from '../components/SettingRow'
import { combineStatus, useAutosave } from '../lib/useAutosave'

/** Piezas de muestra: marco de una corredera 1.500 × 1.200 y de una ventana 900 de ancho. */
const SAMPLE_PIECES = [
  { key: 'marco', length: 1506, qty: 2, label: 'V1 · arr/aba', ref: 'V1' },
  { key: 'marco', length: 1206, qty: 2, label: 'V1 · izq/der', ref: 'V1' },
  { key: 'marco', length: 906, qty: 2, label: 'V2 · arr/aba', ref: 'V2' },
]

export function sampleBars(cut: CutSettings): Bar[] {
  try {
    return optimizeCuts(SAMPLE_PIECES, cut).groups[0]?.bars.slice(0, 2) ?? []
  } catch {
    return []
  }
}

type NumberingPatch = Pick<OrgSettings, 'nextQuoteNumber' | 'nextWorkOrderNumber'>

/** Taller: barra, sierra, despuntes, retazos y numeración. */
export function WorkshopSection() {
  const settings = useSettings()
  const update = useUpdateSettings()
  const cutSave = useAutosave<{ cut: CutSettings }>((patch) => update.mutateAsync(patch), { key: 'settings:cut' })
  const numberSave = useAutosave<Partial<NumberingPatch>>((patch) => update.mutateAsync(patch), { delay: 900, key: 'settings:numbers' })
  const [cut, setCut] = useState<CutSettings | null>(null)
  const [numbers, setNumbers] = useState<NumberingPatch | null>(null)
  const latest = useRef<CutSettings | null>(null)

  useEffect(() => {
    if (!settings.data) return
    // Si saliste con un cambio sin guardar (sin conexión), lo sigues viendo al volver.
    if (!latest.current) {
      latest.current = sanitizeCut(cutSave.unsaved()?.cut ?? settings.data.cut)
      setCut(latest.current)
    }
    setNumbers(
      (n) => n ?? { nextQuoteNumber: settings.data.nextQuoteNumber, nextWorkOrderNumber: settings.data.nextWorkOrderNumber, ...numberSave.unsaved() },
    )
  }, [settings.data, cutSave.unsaved, numberSave.unsaved])

  const change = (patch: Partial<CutSettings>) => {
    const next = { ...(latest.current ?? DEFAULT_CUT), ...patch }
    latest.current = next
    setCut(next)
    cutSave.queue({ cut: next })
  }

  const changeNumber = (key: keyof NumberingPatch, value: number | null) => {
    if (value === null) return
    const n = Math.max(1, Math.round(value))
    setNumbers((current) => (current ? { ...current, [key]: n } : current))
    numberSave.queue({ [key]: n })
  }

  const deferred = useDeferredValue(cut)
  const bars = useMemo(() => (deferred ? sampleBars(deferred) : []), [deferred])

  if (!cut || !numbers) {
    return (
      <div>
        <SectionHeader title="Taller" description="Cómo cortas: barra, sierra, despuntes y retazos." />
        {settings.isError && !settings.data ? (
          <LoadError title="No pudimos cargar los ajustes del taller" error={settings.error} onRetry={() => void settings.refetch()} />
        ) : (
          <>
            <Skeleton className="mb-6 h-40" />
            <div className="space-y-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <SectionHeader
        title="Taller"
        description="Cómo cortas en tu taller. Con esto optimizamos las barras de cada OT y calculamos lo que sobra."
        status={combineStatus(cutSave.status, numberSave.status)}
        savedAt={numberSave.savedAt ?? cutSave.savedAt}
      />
      {cutSave.error || numberSave.error ? (
        <p role="alert" className="mb-5 rounded-md border border-bad-600/20 bg-bad-50 px-3 py-2 text-[13px] text-bad-800">
          {cutSave.error ?? numberSave.error}
        </p>
      ) : null}

      <BarPreview bars={bars} cut={cut} />

      <div className="@container mt-8">
        <SettingRow title="Largo de barra" htmlFor="cut-bar" description="El largo de las barras que compras. Casi todas las marcas venden de 5.800 mm.">
          <NumberField id="cut-bar" value={cut.barLength} onChange={(v) => v !== null && change({ barLength: v })} min={1000} max={12000} step={100} bigStep={500} decimals={0} className="w-40" />
        </SettingRow>
        <SettingRow title="Corte de sierra" htmlFor="cut-kerf" description="Lo que se come el disco en cada corte. Si no lo sabes, deja 4 mm.">
          <NumberField id="cut-kerf" value={cut.kerf} onChange={(v) => v !== null && change({ kerf: v })} min={0} max={20} step={0.5} bigStep={1} className="w-40" />
        </SettingRow>
        <SettingRow
          title="Despunte"
          description="Lo que cortas al inicio y al final de cada barra para dejar los extremos limpios. Muchos talleres usan 0 al final."
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-meta text-paper-600">Al inicio</span>
              <NumberField aria-label="Despunte al inicio" value={cut.trimStart} onChange={(v) => v !== null && change({ trimStart: v })} min={0} max={500} step={5} bigStep={50} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-meta text-paper-600">Al final</span>
              <NumberField aria-label="Despunte al final" value={cut.trimEnd} onChange={(v) => v !== null && change({ trimEnd: v })} min={0} max={500} step={5} bigStep={50} />
            </label>
          </div>
        </SettingRow>
        <SettingRow
          title="Retazo reutilizable"
          htmlFor="cut-reuse"
          description="Desde este largo, lo que sobra se guarda como retazo para usarlo en la próxima obra. Lo más corto se considera pérdida."
        >
          <NumberField id="cut-reuse" value={cut.minReusable} onChange={(v) => v !== null && change({ minReusable: v })} min={0} max={6000} step={50} bigStep={250} decimals={0} className="w-40" />
        </SettingRow>
      </div>

      <div className="mt-10">
        <h3 className="border-b border-paper-200 pb-2 text-[13px] font-semibold tracking-[0.01em] text-paper-900">Numeración</h3>
        <p className="mt-2 max-w-2xl text-[13px] leading-[19px] text-paper-600">
          ¿Vienes de otro sistema o de una planilla? Escribe el número que sigue al último que usaste y continuamos desde ahí. Si ese número
          ya está ocupado, saltamos solos al siguiente libre.
        </p>
        <div className="@container mt-5">
          <SettingRow title="Próxima cotización" htmlFor="next-quote" description={`La siguiente que crees será la N° ${numbers.nextQuoteNumber}.`}>
            <NumberField
              id="next-quote"
              value={numbers.nextQuoteNumber}
              onChange={(v) => changeNumber('nextQuoteNumber', v)}
              min={1}
              max={9_999_999}
              step={1}
              bigStep={10}
              decimals={0}
              unit={null}
              className="w-40"
              inputClassName="text-left"
            />
          </SettingRow>
          <SettingRow title="Próxima orden de trabajo" htmlFor="next-ot" description={`La siguiente OT será la N° ${numbers.nextWorkOrderNumber}.`}>
            <NumberField
              id="next-ot"
              value={numbers.nextWorkOrderNumber}
              onChange={(v) => changeNumber('nextWorkOrderNumber', v)}
              min={1}
              max={9_999_999}
              step={1}
              bigStep={10}
              decimals={0}
              unit={null}
              className="w-40"
              inputClassName="text-left"
            />
          </SettingRow>
        </div>
      </div>
    </div>
  )
}

/** Dos barras de muestra cortadas con tus ajustes, dibujadas a escala. */
function BarPreview({ bars, cut }: { bars: Bar[]; cut: CutSettings }) {
  return (
    <figure className="rounded-lg border border-paper-200 bg-paper-0 p-4 sm:p-5">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-paper-900">Así cortamos con tus ajustes</span>
        <span className="text-meta text-paper-600">Marcos de dos ventanas · barra de {formatMM(cut.barLength)} mm</span>
      </figcaption>
      <div className="flex flex-col gap-4">
        {bars.map((bar, i) => (
          <BarRow key={i} bar={bar} cut={cut} index={i} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-meta text-paper-600">
        <Legend className="bg-ink-100 ring-1 ring-ink-600/40 ring-inset">Pieza</Legend>
        <Legend className="bg-paper-900">Corte de sierra</Legend>
        <Legend className="bg-[repeating-linear-gradient(135deg,var(--paper-350)_0_2px,transparent_2px_5px)]">Despunte y pérdida</Legend>
        <Legend className="bg-ok-50 ring-1 ring-ok-600/40 ring-inset">Retazo para guardar</Legend>
      </div>
    </figure>
  )
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('inline-block h-2.5 w-4 rounded-[2px]', className)} />
      {children}
    </span>
  )
}

function BarRow({ bar, cut, index }: { bar: Bar; cut: CutSettings; index: number }) {
  const L = bar.barLength || cut.barLength
  const pct = (mm: number) => `${(Math.max(0, mm) / L) * 100}%`
  const lastEnd = bar.cuts.length ? Math.max(...bar.cuts.map((c) => c.offset + c.length)) : cut.trimStart
  const remainderStart = L - cut.trimEnd - bar.remainder
  const reusable = bar.remainder >= cut.minReusable && bar.remainder > 0
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-meta text-paper-600">
        <span>Barra {index + 1}</span>
        <span className="tabular">
          Aprovechamiento <span className="font-medium text-paper-900">{bar.yieldPct.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %</span>
        </span>
      </div>
      <div className="relative h-11 overflow-hidden rounded-[3px] border border-paper-350/60 bg-paper-100" role="img" aria-label={`Barra ${index + 1}: ${bar.cuts.length} piezas, sobran ${formatMM(bar.remainder)} mm`}>
        {cut.trimStart > 0 ? <Hatch left={0} width={pct(cut.trimStart)} /> : null}
        {bar.cuts.map((c, i) => (
          <div key={i}>
            <div
              className="absolute inset-y-1 flex flex-col items-center justify-center overflow-hidden rounded-[2px] bg-ink-100 px-1 text-center ring-1 ring-ink-600/40 ring-inset"
              style={{ left: pct(c.offset), width: pct(c.length) }}
            >
              <span className="text-[12px] leading-none font-semibold text-ink-700 tabular">{formatMM(c.length)}</span>
              <span className="mt-0.5 truncate text-[10px] leading-none text-ink-700/80 max-sm:hidden">{c.label}</span>
            </div>
            {cut.kerf > 0 ? <div className="absolute inset-y-0 bg-paper-900" style={{ left: pct(c.offset + c.length), width: `max(1px, ${pct(cut.kerf)})` }} /> : null}
          </div>
        ))}
        {bar.remainder > 0 ? (
          reusable ? (
            <div
              className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-[2px] bg-ok-50 px-1 ring-1 ring-ok-600/40 ring-inset"
              style={{ left: pct(Math.max(lastEnd + cut.kerf, remainderStart)), width: pct(bar.remainder) }}
            >
              <span className="truncate text-[11px] font-medium text-ok-800 tabular">Retazo {formatMM(bar.remainder)}</span>
            </div>
          ) : (
            <Hatch left={pct(Math.max(lastEnd + cut.kerf, remainderStart))} width={pct(bar.remainder)} />
          )
        ) : null}
        {cut.trimEnd > 0 ? <Hatch left={pct(L - cut.trimEnd)} width={pct(cut.trimEnd)} /> : null}
      </div>
    </div>
  )
}

function Hatch({ left, width }: { left: string | number; width: string }) {
  return (
    <div
      aria-hidden
      className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--paper-350)_0_2px,transparent_2px_5px)] opacity-70"
      style={{ left, width }}
    />
  )
}
