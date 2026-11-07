import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Maximize2, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import type { Catalog, CutSettings } from '@dekopen/engine'
import {
  auditCutPlan,
  availableCutParts,
  barPieceIds,
  CutOptimizationDocument,
  CutOrderDocument,
  cutIssueText,
  filterCutParts,
  parseCutParts,
  unbackedLines,
  workshopI18n,
  type CutPartKind,
  type WorkshopDocData,
  type WorkshopPaper,
} from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { T, useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Button, KPI, Notice, NumberField, Popover, PopoverContent, PopoverTrigger, SegmentedControl, Select, StatStrip, Switch } from '../../../ui'
import es from '../i18n/es'
import { barKey, planSignature } from '../model/cutLayout'
import { BROWSER_PRINT_LIMITS, PREVIEW_LIMITS, browserPrintNotice, previewFooter } from '../model/preview'
import { CutGroup, type WindowMeta } from './CutBars'
import { DocumentPreview, DocumentToolbar } from './DocumentPreview'
import { SawMode, sawSteps } from './SawMode'
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

type Mode = 'barras' | 'hoja' | 'orden'

export function CutsTab({
  orderId,
  data: allData,
  paper,
  catalog,
  windows,
  simulation,
  actions,
}: {
  /** Dónde se recuerdan las barras marcadas: la OT, o la cotización si aún no tiene. */
  orderId: string
  data: WorkshopDocData
  paper: WorkshopPaper
  catalog?: Catalog
  windows: ReadonlyMap<string, WindowMeta>
  simulation: CutSimulation
  actions: ReturnType<typeof useDocumentActions>
}) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const [mode, setMode] = useState<Mode>('barras')
  const [large, setLarge] = useLargeBars()
  const [groupKey, setGroupKey] = useState<string>('all')
  const [focusRef, setFocusRef] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const available = useMemo(() => availableCutParts(allData), [allData])
  const partsParam = params.get('parts')
  const parts = useMemo(() => parseCutParts(partsParam).filter((part) => available.includes(part)), [partsParam, available])
  const setParts = (next: readonly CutPartKind[]) => {
    const p = new URLSearchParams(params)
    if (next.length === 0 || next.length === available.length) p.delete('parts')
    else p.set('parts', next.join(','))
    setParams(p, { replace: true })
  }
  const data = useMemo(() => filterCutParts(allData, parts), [allData, parts])
  const opt = data.optimization
  // La firma es la del plan completo: filtrar no borra las marcas de lo ya cortado.
  const marks = useCutMarks(orderId, planSignature(allData.optimization.groups))
  const totalBars = opt.groups.reduce((s, gr) => s + gr.bars.length, 0)
  const cutBars = opt.groups.reduce((s, gr) => s + gr.bars.filter((b, i) => marks.has(barKey(gr, i, b))).length, 0)
  const groups = groupKey === 'all' ? opt.groups : opt.groups.filter((gr) => gr.key === groupKey)
  const offcutTotal = opt.offcuts.reduce((s, o) => s + o.length, 0)
  const simulated = Object.keys(simulation.values).length > 0
  const [sawOpen, setSawOpen] = useState(false)
  const ids = useMemo(() => barPieceIds(data), [data])
  const steps = useMemo(() => sawSteps(opt.groups, ids, barKey), [opt.groups, ids])
  // La auditoría de sierra: lo que no se puede cortar se dice antes de llegar a la máquina.
  const issues = useMemo(() => auditCutPlan(allData).filter((i) => i.code !== 'special_bar'), [allData])
  const unbacked = useMemo(() => unbackedLines(data.catalog, data.windows), [data])
  const docI18n = workshopI18n({ locale: t.locale })
  const orderElement = useMemo(() => <CutOrderDocument data={allData} paper={paper} parts={parts} />, [allData, paper, parts])
  const orderPreview = useMemo(() => <CutOrderDocument data={allData} paper={paper} parts={parts} maxSteps={PREVIEW_LIMITS.cutBars} />, [allData, paper, parts])
  const element = useMemo(() => <CutOptimizationDocument data={allData} paper={paper} parts={parts} />, [allData, paper, parts])
  // Con cientos de unidades son miles de barras: la vista previa dibuja las primeras (el resumen va completo).
  const previewElement = useMemo(() => <CutOptimizationDocument data={allData} paper={paper} parts={parts} maxBars={PREVIEW_LIMITS.cutBars} />, [allData, paper, parts])
  // Vista, impresión y PDF del servidor salen con el mismo filtro.
  const filtered = parts.length ? { params: { parts: parts.join(',') }, fileSuffix: parts.map((part) => t(`cuts.parts.${part}`)).join('-') } : {}
  const orderRequest = { kind: 'cut-order' as const, element: orderElement, serverOnly: browserPrintNotice(opt.totalPieces, BROWSER_PRINT_LIMITS.cutBars, 'bars', t.locale), ...filtered }
  const request = { kind: 'cuts' as const, element, serverOnly: browserPrintNotice(totalBars, BROWSER_PRINT_LIMITS.cutBars, 'bars', t.locale), ...filtered }
  const toolbar = mode === 'orden' ? { title: t('cuts.orderTitle'), description: t('cuts.orderHint'), request: orderRequest } : mode === 'hoja' ? { title: t('cuts.sheetTitle'), description: t('cuts.sheetHint'), request } : { title: t('cuts.barsTitle'), request }

  useEffect(() => {
    if (groupKey !== 'all' && !opt.groups.some((gr) => gr.key === groupKey)) setGroupKey('all')
  }, [opt.groups, groupKey])

  const colorName = (id?: string) => (id ? (catalog?.colors.find((c) => c.id === id)?.name ?? id) : t('cuts.noColor'))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <div className="-mb-4">
          <DocumentToolbar
            title={toolbar.title}
            description={toolbar.description}
            options={
              <>
                <CutSettingsPopover simulation={simulation} />
                <Button icon={Maximize2} onClick={() => setSawOpen(true)} disabled={steps.length === 0}>
                  {t('cuts.sawMode')}
                </Button>
              </>
            }
            onPrint={() => actions.print(toolbar.request)}
            onDownload={() => void actions.download(toolbar.request)}
            downloading={actions.busy === toolbar.request.kind}
          />
        </div>
        {/* En el teléfono el taller viene a ver las barras: estas cifras ya están en cada perfil. */}
        <StatStrip className="gap-x-10 max-sm:hidden">
          <KPI variant="plain" label={t('cuts.bars')} value={fmt.number(opt.totalBars)} />
          <KPI variant="plain" label={t('cuts.pieces')} value={fmt.number(opt.totalPieces)} />
          <KPI variant="plain" label={t('cuts.yield')} value={fmt.pct(opt.yieldPct, 1)} />
          <KPI variant="plain" label={t('cuts.offcuts')} value={fmt.number(opt.offcuts.length)} hint={opt.offcuts.length ? fmt.mm(offcutTotal, { unit: true }) : undefined} />
        </StatStrip>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl<Mode>
            aria-label={t('cuts.mode')}
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'barras', label: t('cuts.modeBars') },
              { value: 'hoja', label: t('cuts.modeSheet') },
              { value: 'orden', label: t('cuts.modeOrder') },
            ]}
          />
          {available.length > 1 ? <PartFilter available={available} parts={parts} onChange={setParts} /> : null}
        </div>
      </div>

      {simulated ? <SimulationNotice simulation={simulation} /> : null}

      {opt.warnings.length > 0 ? (
        <Notice tone="warning" size="compact">
          <ul className="space-y-0.5">
            {opt.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`}>{g.warning(w)}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {issues.length > 0 ? (
        <Notice tone="danger" size="compact" title={t('cuts.reviewTitle')}>
          <ul className="space-y-0.5">
            {issues.slice(0, 8).map((issue, i) => (
              <li key={`${issue.code}-${i}`}>{cutIssueText(issue, docI18n)}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {unbacked.length > 0 ? (
        <Notice tone="warning" size="compact" title={t('cuts.unbackedTitle')}>
          <ul className="space-y-0.5">
            {unbacked.map((line) => (
              <li key={line.name}>
                <strong className="font-medium text-fg-strong">{line.name}</strong>: {t(`cuts.origin.${line.origin}`)}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {mode === 'orden' ? (
        <DocumentPreview element={orderPreview} paper={paper} label={t('cuts.orderTitle')} />
      ) : mode === 'hoja' ? (
        <DocumentPreview
          element={previewElement}
          paper={paper}
          label={t('cuts.sheetPreview')}
          footer={previewFooter(Math.min(totalBars, PREVIEW_LIMITS.cutBars), totalBars, 'bars', t.locale)}
        />
      ) : opt.groups.length === 0 ? (
        <p className="py-12 text-center text-fg-muted">{t('cuts.none')}</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('cuts.highlight')}>
              {[...windows.values()].map((w) => {
                const active = focusRef === w.ref
                return (
                  <button
                    key={w.ref}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFocusRef(active ? null : w.ref)}
                    className={cn(
                      'code-id inline-flex h-7 items-center rounded-xs px-2 text-table font-medium transition-colors duration-100 touch:h-10 touch:px-3',
                      active ? 'bg-inverse text-fg-inverse' : focusRef ? 'text-fg-muted hover:bg-hover hover:text-fg' : 'text-fg-strong hover:bg-hover',
                    )}
                    title={w.name}
                  >
                    {w.ref}
                  </button>
                )
              })}
              {focusRef ? (
                <Button size="sm" variant="ghost" icon={X} onClick={() => setFocusRef(null)}>
                  {t('cuts.seeAll')}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-table text-fg-muted tabular" aria-live="polite">
                {cutBars > 0 ? (
                  <>
                    <T ns={es} k="cuts.cutCount" values={{ b: <strong className="font-medium text-fg-strong" />, cut: fmt.number(cutBars), total: totalBars }} />
                    <button type="button" onClick={marks.clear} className="ml-2 font-medium text-accent hover:underline">
                      {t('cuts.unmark')}
                    </button>
                  </>
                ) : (
                  t('cuts.tapHint')
                )}
              </span>
              <span title={t('cuts.largeHint')}>
                <Switch size="sm" label={t('cuts.large')} checked={large} onCheckedChange={setLarge} />
              </span>
              {opt.groups.length > 1 ? (
                <Select
                  size="sm"
                  aria-label={t('cuts.profile')}
                  className="w-60"
                  value={groupKey}
                  onValueChange={setGroupKey}
                  options={[
                    { value: 'all', label: t('cuts.allProfiles', { count: opt.groups.length }) },
                    ...opt.groups.map((gr) => ({ value: gr.key, label: `${gr.code} · ${colorName(gr.colorId)}`, description: gr.name })),
                  ]}
                />
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-8">
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
                ids={ids.get(group.key)}
                large={large}
              />
            ))}
          </div>
        </>
      )}
      <SawMode open={sawOpen} onOpenChange={setSawOpen} steps={steps} catalog={catalog} cut={data.cut} isDone={marks.has} onDone={marks.setMany} />
    </div>
  )
}

/** Todo, o los tipos de pieza elegidos: se pueden sumar («Hojas» y «Junquillos»). */
function PartFilter({ available, parts, onChange }: { available: readonly CutPartKind[]; parts: readonly CutPartKind[]; onChange: (next: CutPartKind[]) => void }) {
  const t = useT(es)
  const chip = (active: boolean) =>
    cn('inline-flex h-7 items-center rounded-xs px-2 text-table font-medium transition-colors duration-100 touch:h-10 touch:px-3', active ? 'bg-inverse text-fg-inverse' : 'text-fg hover:bg-hover hover:text-fg-strong')
  return (
    <div role="group" aria-label={t('cuts.parts.label')} className="flex flex-wrap items-center gap-1">
      <button type="button" aria-pressed={parts.length === 0} onClick={() => onChange([])} className={chip(parts.length === 0)}>
        {t('cuts.parts.all')}
      </button>
      {available.map((part) => {
        const active = parts.includes(part)
        return (
          <button key={part} type="button" aria-pressed={active} onClick={() => onChange(active ? parts.filter((p) => p !== part) : available.filter((p) => p === part || parts.includes(p)))} className={chip(active)}>
            {t(`cuts.parts.${part}`)}
          </button>
        )
      })}
    </div>
  )
}

const FIELD_RANGE: Record<CutField, { min: number; max: number; step: number; decimals: number }> = {
  barLength: { min: 1000, max: 12000, step: 100, decimals: 0 },
  kerf: { min: 0, max: 20, step: 0.5, decimals: 1 },
  trimStart: { min: 0, max: 500, step: 5, decimals: 0 },
  trimEnd: { min: 0, max: 500, step: 5, decimals: 0 },
  minReusable: { min: 0, max: 5000, step: 50, decimals: 0 },
}

function CutSettingsPopover({ simulation }: { simulation: CutSimulation }) {
  const t = useT(es)
  const simulated = Object.keys(simulation.values).length > 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon={SlidersHorizontal} aria-label={t('cuts.settings')}>
          {t('cuts.settings')}
          {simulated ? <span aria-hidden className="size-1.5 rounded-full bg-accent" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,360px)] p-4">
        <div className="mb-3">
          <h3 className="text-h4 font-medium text-fg-strong">{t('cuts.settings')}</h3>
          <p className="mt-0.5 text-table text-fg-muted">{t('cuts.settingsHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          {(Object.keys(FIELD_RANGE) as CutField[]).map((field) => {
            const range = FIELD_RANGE[field]
            const changed = simulation.values[field] !== undefined
            const id = `cut-${field}`
            return (
              <div key={field} className={cn('flex flex-col gap-1', field === 'barLength' && 'col-span-2')}>
                <label htmlFor={id} className="flex items-center gap-1.5 text-table font-medium text-fg">
                  {t(`cuts.field.${field}`)}
                  {changed ? <span role="img" aria-label={t('cuts.simulated')} className="size-1.5 rounded-full bg-accent" /> : null}
                </label>
                <NumberField
                  id={id}
                  value={simulation.effective[field]}
                  onChange={(v) => simulation.set(field, v)}
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  bigStep={range.step * 10}
                  decimals={range.decimals}
                />
                {field === 'barLength' ? <span className="text-meta text-fg-muted">{t('cuts.field.barLengthHint')}</span> : null}
                {field === 'kerf' ? <span className="text-meta text-fg-muted">{t('cuts.field.kerfHint')}</span> : null}
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={simulation.reset} disabled={!simulated}>
            {t('cuts.reset')}
          </Button>
          {simulation.saveDefault ? (
            <Button size="sm" onClick={simulation.saveDefault} disabled={!canSave(simulation)} loading={simulation.saving}>
              {t('cuts.saveDefault')}
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
  const t = useT(es)
  const fmt = useFormat()
  const parts: string[] = []
  const v = simulation.values
  if (v.barLength !== undefined) parts.push(t('cuts.sim.bar', { value: fmt.number(v.barLength) }))
  if (v.kerf !== undefined) parts.push(t('cuts.sim.kerf', { value: fmt.number(v.kerf, { maxDecimals: 1 }) }))
  if (v.trimStart !== undefined || v.trimEnd !== undefined)
    parts.push(t('cuts.sim.trim', { start: fmt.number(simulation.effective.trimStart), end: fmt.number(simulation.effective.trimEnd) }))
  if (v.minReusable !== undefined) parts.push(t('cuts.sim.reusable', { value: fmt.number(v.minReusable) }))
  return (
    <Notice
      tone="accent"
      size="compact"
      action={
        <div className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="ghost" onClick={simulation.reset}>
            {t('cuts.reset')}
          </Button>
          {simulation.saveDefault && canSave(simulation) ? (
            <Button size="xs" onClick={simulation.saveDefault} loading={simulation.saving}>
              {t('cuts.saveDefault')}
            </Button>
          ) : null}
        </div>
      }
    >
      <T ns={es} k="cuts.simulation" values={{ b: <strong className="font-semibold text-fg-strong" />, parts: parts.join(' · ') }} />
    </Notice>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Letra grande (modo taller), recordada en este equipo
// ─────────────────────────────────────────────────────────────────────────────

const LARGE_KEY = 'fz-taller-letra-grande'

function useLargeBars(): [boolean, (on: boolean) => void] {
  // Junto a la sierra se usa la tableta: en pantallas táctiles parte en grande hasta que se elija otra cosa.
  const [large, setLarge] = useState(() => {
    try {
      const stored = localStorage.getItem(LARGE_KEY)
      return stored === null ? Boolean(window.matchMedia?.('(pointer: coarse)').matches) : stored === '1'
    } catch {
      return false
    }
  })
  const update = useCallback((on: boolean) => {
    setLarge(on)
    try {
      localStorage.setItem(LARGE_KEY, on ? '1' : '0')
    } catch {
      // almacenamiento bloqueado: vale solo para esta visita
    }
  }, [])
  return [large, update]
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
    // `version` fuerza la relectura tras guardar.
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
  const setMany = useCallback(
    (list: readonly string[], on: boolean) => {
      const next = new Set(keys)
      for (const key of list) {
        if (on) next.add(key)
        else next.delete(key)
      }
      persist(next)
    },
    [keys, persist],
  )
  return { has, toggle, clear, setMany, size: keys.size }
}
