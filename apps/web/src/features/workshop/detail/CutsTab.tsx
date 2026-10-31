import { useCallback, useEffect, useMemo, useState } from 'react'
import { RotateCcw, SlidersHorizontal, TriangleAlert, X } from 'lucide-react'
import type { Catalog, CutSettings } from '@framezen/engine'
import { CutOptimizationDocument, type WorkshopDocData, type WorkshopPaper } from '@framezen/documents'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import {
  Button,
  NumberField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
} from '../../../ui'
import { barKey, planSignature } from '../model/cutLayout'
import { BROWSER_PRINT_LIMITS, PREVIEW_LIMITS, browserPrintNotice, previewFooter } from '../model/preview'
import { CutGroup, type WindowMeta } from './CutBars'
import { DocumentPreview, DocumentToolbar } from './DocumentPreview'
import type { useDocumentActions } from './useDocumentActions'

export type CutField = 'barLength' | 'kerf' | 'trimStart' | 'trimEnd' | 'minReusable'

export interface CutSimulation {
  /** Valores simulados (solo los que cambian). */
  values: Partial<CutSettings>
  /** Valores efectivos para mostrar en los campos. */
  effective: CutSettings
  set: (field: CutField, value: number | null) => void
  reset: () => void
  /** Guarda disco, despuntes y retazo mínimo como predeterminados del taller. */
  saveDefault?: () => void
  saving?: boolean
}

type Mode = 'barras' | 'hoja'

export function CutsTab({
  orderId,
  data,
  paper,
  catalog,
  windows,
  simulation,
  actions,
}: {
  orderId: string
  data: WorkshopDocData
  paper: WorkshopPaper
  catalog?: Catalog
  windows: ReadonlyMap<string, WindowMeta>
  simulation: CutSimulation
  actions: ReturnType<typeof useDocumentActions>
}) {
  const [mode, setMode] = useState<Mode>('barras')
  const [groupKey, setGroupKey] = useState<string>('all')
  const [focusRef, setFocusRef] = useState<string | null>(null)
  const opt = data.optimization
  const marks = useCutMarks(orderId, planSignature(opt.groups))
  const totalBars = opt.groups.reduce((s, g) => s + g.bars.length, 0)
  const cutBars = opt.groups.reduce((s, g) => s + g.bars.filter((b, i) => marks.has(barKey(g, i, b))).length, 0)
  const groups = groupKey === 'all' ? opt.groups : opt.groups.filter((g) => g.key === groupKey)
  const offcutTotal = opt.offcuts.reduce((s, o) => s + o.length, 0)
  const simulated = Object.keys(simulation.values).length > 0
  const element = useMemo(() => <CutOptimizationDocument data={data} paper={paper} />, [data, paper])
  // Con cientos de unidades son miles de barras: la vista previa dibuja las primeras (el resumen va completo).
  const previewElement = useMemo(
    () => <CutOptimizationDocument data={data} paper={paper} maxBars={PREVIEW_LIMITS.cutBars} />,
    [data, paper],
  )
  const request = { kind: 'cuts' as const, element, serverOnly: browserPrintNotice(totalBars, BROWSER_PRINT_LIMITS.cutBars, 'barras') }

  useEffect(() => {
    if (groupKey !== 'all' && !opt.groups.some((g) => g.key === groupKey)) setGroupKey('all')
  }, [opt.groups, groupKey])

  const colorName = (id?: string) => (id ? (catalog?.colors.find((c) => c.id === id)?.name ?? id) : 'sin color')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex sm:flex-wrap sm:items-end">
          <Stat label="Barras a sacar" value={formatNumber(opt.totalBars)} />
          <Stat label="Piezas" value={formatNumber(opt.totalPieces)} />
          <Stat label="Aprovechamiento" value={`${formatNumber(opt.yieldPct, 1)} %`} />
          <Stat
            label="Retazos para guardar"
            value={formatNumber(opt.offcuts.length)}
            hint={opt.offcuts.length ? `${formatNumber(offcutTotal)} mm` : undefined}
          />
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<Mode>
            aria-label="Cómo ver los cortes"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'barras', label: 'Barras' },
              { value: 'hoja', label: 'Hoja para imprimir' },
            ]}
          />
          <CutSettingsPopover simulation={simulation} />
        </div>
      </div>

      {simulated ? <SimulationNotice simulation={simulation} /> : null}

      {opt.warnings.length > 0 ? (
        <div role="note" className="flex gap-2.5 rounded-md border border-warn-600/25 bg-warn-50 px-3.5 py-2.5 text-[13px] text-warn-800">
          <TriangleAlert aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-0.5">
            {opt.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === 'hoja' ? (
        <div>
          <DocumentToolbar
            title="Optimización de cortes"
            description="Barras a escala con cada pieza y su ventana, para la sierra. Se lee a un metro."
            onPrint={() => actions.print(request)}
            onDownload={() => void actions.download(request)}
            downloading={actions.busy === 'cuts'}
          />
          <DocumentPreview
            element={previewElement}
            paper={paper}
            label="Vista previa de la optimización de cortes"
            footer={previewFooter(Math.min(totalBars, PREVIEW_LIMITS.cutBars), totalBars, 'barras')}
          />
        </div>
      ) : opt.groups.length === 0 ? (
        <div className="rounded-lg border border-paper-200 bg-paper-0 px-6 py-12 text-center text-paper-600">
          Esta OT no tiene perfiles para cortar.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Resaltar una ventana">
              {[...windows.values()].map((w) => {
                const active = focusRef === w.ref
                return (
                  <button
                    key={w.ref}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFocusRef(active ? null : w.ref)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-1.5 text-[13px] font-medium transition-colors duration-120 touch:h-9',
                      active
                        ? 'border-paper-900 bg-paper-900 text-paper-0'
                        : focusRef
                          ? 'border-paper-200 bg-paper-0 text-paper-600 hover:text-paper-900'
                          : 'border-paper-200 bg-paper-0 text-paper-900 hover:border-paper-350',
                    )}
                    title={w.name}
                  >
                    <span aria-hidden className="size-3.5 rounded-full border border-paper-900/30" style={{ background: w.tint }} />
                    {w.ref}
                  </button>
                )
              })}
              {focusRef ? (
                <Button size="sm" variant="ghost" icon={X} onClick={() => setFocusRef(null)}>
                  Ver todas
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-paper-600 tabular" aria-live="polite">
                {cutBars > 0 ? (
                  <>
                    <strong className="font-semibold text-ok-600">{cutBars}</strong> de {totalBars} barras cortadas
                    <button type="button" onClick={marks.clear} className="ml-2 font-medium text-ink-600 hover:text-ink-700">
                      Desmarcar
                    </button>
                  </>
                ) : (
                  'Toca el número de una barra al cortarla'
                )}
              </span>
              {opt.groups.length > 1 ? (
                <Select
                  size="sm"
                  aria-label="Perfil a mostrar"
                  className="w-60"
                  value={groupKey}
                  onValueChange={setGroupKey}
                  options={[
                    { value: 'all', label: `Todos los perfiles (${opt.groups.length})` },
                    ...opt.groups.map((g) => ({ value: g.key, label: `${g.code} · ${colorName(g.colorId)}`, description: g.name })),
                  ]}
                />
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <CutGroup
                key={group.key}
                group={group}
                catalog={catalog}
                cut={data.cut}
                windows={windows}
                focusRef={focusRef}
                onFocusRef={setFocusRef}
                isCut={marks.has}
                onToggleCut={marks.toggle}
                barKeyOf={barKey}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-paper-600">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-h2 font-semibold tracking-[-0.01em] text-paper-900 tabular">{value}</span>
        {hint ? <span className="text-[13px] text-paper-600 tabular">{hint}</span> : null}
      </dd>
    </div>
  )
}

const FIELD_COPY: Record<CutField, { label: string; hint?: string; min: number; max: number; step: number; decimals: number }> = {
  barLength: { label: 'Largo de barra', hint: 'Simula otro largo para todos los perfiles.', min: 1000, max: 12000, step: 100, decimals: 0 },
  kerf: { label: 'Disco de sierra', hint: 'Lo que se come cada corte.', min: 0, max: 20, step: 0.5, decimals: 1 },
  trimStart: { label: 'Despunte al inicio', min: 0, max: 500, step: 5, decimals: 0 },
  trimEnd: { label: 'Despunte al final', min: 0, max: 500, step: 5, decimals: 0 },
  minReusable: { label: 'Guardar retazos desde', min: 0, max: 5000, step: 50, decimals: 0 },
}

function CutSettingsPopover({ simulation }: { simulation: CutSimulation }) {
  const simulated = Object.keys(simulation.values).length > 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon={SlidersHorizontal} aria-label="Ajustes de corte">
          Ajustes de corte
          {simulated ? <span aria-hidden className="size-1.5 rounded-full bg-ink-600" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,340px)] p-4">
        <div className="mb-3">
          <h3 className="font-semibold text-paper-900">Ajustes de corte</h3>
          <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">
            Se aplican al instante en esta OT, sin cambiar tus ajustes. Si te convencen, guárdalos.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          {(Object.keys(FIELD_COPY) as CutField[]).map((field) => {
            const copy = FIELD_COPY[field]
            const changed = simulation.values[field] !== undefined
            const id = `cut-${field}`
            return (
              <div key={field} className={cn('flex flex-col gap-1', field === 'barLength' && 'col-span-2')}>
                <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-paper-900">
                  {copy.label}
                  {changed ? <span aria-label="Simulado" className="size-1.5 rounded-full bg-ink-600" /> : null}
                </label>
                <NumberField
                  id={id}
                  value={simulation.effective[field]}
                  onChange={(v) => simulation.set(field, v)}
                  min={copy.min}
                  max={copy.max}
                  step={copy.step}
                  bigStep={copy.step * 10}
                  decimals={copy.decimals}
                />
                {copy.hint ? <span className="text-meta text-paper-600">{copy.hint}</span> : null}
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-paper-200 pt-3">
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={simulation.reset} disabled={!simulated}>
            Volver a mis ajustes
          </Button>
          {simulation.saveDefault ? (
            <Button size="sm" onClick={simulation.saveDefault} disabled={!canSave(simulation)} loading={simulation.saving}>
              Guardar como predeterminado
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function canSave(simulation: CutSimulation): boolean {
  return (['kerf', 'trimStart', 'trimEnd', 'minReusable'] as const).some((f) => simulation.values[f] !== undefined)
}

function SimulationNotice({ simulation }: { simulation: CutSimulation }) {
  const parts: string[] = []
  const v = simulation.values
  if (v.barLength !== undefined) parts.push(`barras de ${formatNumber(v.barLength)} mm`)
  if (v.kerf !== undefined) parts.push(`disco de ${formatNumber(v.kerf, 1)} mm`)
  if (v.trimStart !== undefined || v.trimEnd !== undefined)
    parts.push(`despunte ${formatNumber(simulation.effective.trimStart)} + ${formatNumber(simulation.effective.trimEnd)} mm`)
  if (v.minReusable !== undefined) parts.push(`retazos desde ${formatNumber(v.minReusable)} mm`)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-100 bg-ink-50 px-3.5 py-2.5 text-[13px] text-ink-700 sm:flex-row sm:items-center sm:justify-between">
      <p>
        <strong className="font-semibold">Simulación:</strong> {parts.join(' · ')}. Tus ajustes guardados no cambian.
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={simulation.reset}>
          Volver a mis ajustes
        </Button>
        {simulation.saveDefault && canSave(simulation) ? (
          <Button size="sm" onClick={simulation.saveDefault} loading={simulation.saving}>
            Guardar como predeterminado
          </Button>
        ) : null}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Barras marcadas como cortadas (en este equipo, por OT y plan de corte)
// ─────────────────────────────────────────────────────────────────────────────

type StoredMarks = Record<string, string[]>

const MAX_PLANS = 4

function storageKey(orderId: string) {
  return `fz:cortes:${orderId}`
}

function readStore(orderId: string): StoredMarks {
  try {
    const raw = localStorage.getItem(storageKey(orderId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as StoredMarks) : {}
  } catch {
    return {}
  }
}

/**
 * Barras marcadas como cortadas, guardadas en este equipo por OT y por plan de corte: si
 * cambia el plan (otro disco, otra barra, la cotización cambió) las marcas viejas no se
 * aplican, y una simulación no pisa las marcas del plan real.
 */
export function useCutMarks(orderId: string, sig: string) {
  const [version, setVersion] = useState(0)
  const keys = useMemo(() => {
    const list = readStore(orderId)[sig]
    return new Set(Array.isArray(list) ? list : [])
  }, [orderId, sig, version])

  const persist = useCallback(
    (next: Set<string>) => {
      try {
        const store = readStore(orderId)
        delete store[sig]
        if (next.size > 0) store[sig] = [...next]
        const entries = Object.entries(store).slice(-MAX_PLANS)
        if (entries.length === 0) localStorage.removeItem(storageKey(orderId))
        else localStorage.setItem(storageKey(orderId), JSON.stringify(Object.fromEntries(entries)))
      } catch {
        // almacenamiento lleno o bloqueado: no se recuerdan las marcas
      }
      setVersion((v) => v + 1)
    },
    [orderId, sig],
  )

  const has = useCallback((key: string) => keys.has(key), [keys])
  const toggle = useCallback(
    (key: string) => {
      const next = new Set(keys)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      persist(next)
    },
    [keys, persist],
  )
  const clear = useCallback(() => persist(new Set()), [persist])
  return { has, toggle, clear, size: keys.size }
}
