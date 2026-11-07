import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { DEFAULT_CUT, sanitizeCut, type CutSettings } from '@dekopen/engine'
import type { OrgSettings } from '@dekopen/shared'
import { useCatalog, useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useFormat, useT } from '../../../lib/i18n'
import { NumberField, Skeleton } from '../../../ui'
import { SawDiagram, SawLetter } from '../../workshop/diagram/SawDiagram'
import { sawPlan, sawSampleOf, type SawParam, type SawSample } from '../../workshop/diagram/sawModel'
import { LoadError } from '../components/LoadError'
import { FieldGroup, SaveError, SectionHeader } from '../components/SectionHeader'
import { SettingRow } from '../components/SettingRow'
import es from '../i18n/es'
import { combineStatus, useAutosave } from '../lib/useAutosave'

type NumberingPatch = Pick<OrgSettings, 'nextQuoteNumber' | 'nextWorkOrderNumber'>

/** Taller: barra, sierra, despuntes, retazos y numeración, con el banco de corte dibujado. */
export function WorkshopSection() {
  const t = useT(es)
  const fmt = useFormat()
  const settings = useSettings()
  const catalog = useCatalog()
  const update = useUpdateSettings()
  const cutSave = useAutosave<{ cut: CutSettings }>((patch) => update.mutateAsync(patch), { key: 'settings:cut' })
  const numberSave = useAutosave<Partial<NumberingPatch>>((patch) => update.mutateAsync(patch), { delay: 900, key: 'settings:numbers' })
  const [cut, setCut] = useState<CutSettings | null>(null)
  const [numbers, setNumbers] = useState<NumberingPatch | null>(null)
  const [active, setActive] = useState<SawParam | null>(null)
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
  const sample = useMemo(() => sawSampleOf(catalog.data, settings.data?.defaults?.lineId), [catalog.data, settings.data?.defaults?.lineId])
  const plan = useMemo(() => (sample && deferred ? sawPlan(sample, deferred) : null), [sample, deferred])

  if (!cut || !numbers) {
    return (
      <div>
        <SectionHeader title={t('workshop.title')} description={t('workshop.descriptionShort')} />
        {settings.isError && !settings.data ? (
          <LoadError title={t('workshop.loadError')} error={settings.error} onRetry={() => void settings.refetch()} />
        ) : (
          <>
            <Skeleton className="mb-8 h-40" />
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

  const row = (param: SawParam, title: string, description: ReactNode, control: ReactNode, htmlFor?: string) => (
    <div className="py-3 first:pt-0 last:pb-0" onFocus={() => setActive(param)} onBlur={() => setActive(null)} onPointerEnter={() => setActive(param)} onPointerLeave={() => setActive(null)}>
      <SettingRow
        className="!py-0"
        htmlFor={htmlFor}
        title={
          <span className="inline-flex items-center gap-2">
            <SawLetter param={param} active={active === param} />
            {title}
          </span>
        }
        description={description}
      >
        {control}
      </SettingRow>
    </div>
  )

  const stock = sample?.stockLength ?? null
  const stockDiffers = stock !== null && cut.barLength !== stock

  return (
    <div>
      <SectionHeader
        title={t('workshop.title')}
        description={t('workshop.description')}
        status={combineStatus(cutSave.status, numberSave.status)}
        savedAt={numberSave.savedAt ?? cutSave.savedAt}
      />
      <SaveError message={cutSave.error ?? numberSave.error} />

      <div className="flex flex-col gap-10">
        {sample ? (
          <div className="@container flex flex-col gap-5">
            <SawDiagram cut={deferred ?? cut} sample={sample} active={active} onActive={setActive} />
            {plan ? <LiveResult sample={sample} plan={plan} cut={cut} /> : null}
          </div>
        ) : catalog.isPending ? (
          <Skeleton className="h-72" />
        ) : (
          <p className="rounded-sm bg-sunken px-4 py-3 text-table text-fg-muted">{t('workshop.saw.noLine')}</p>
        )}

        <FieldGroup title={t('workshop.cut.title')} description={t('workshop.cut.description')} bodyClassName="@container">
          {row(
            'barLength',
            t('workshop.barLength.title'),
            stockDiffers && sample ? t('workshop.barLength.differs', { code: sample.code, stock: fmt.mm(stock, { unit: true }) }) : t('workshop.barLength.catalog'),
            <NumberField id="cut-bar" value={cut.barLength} onChange={(v) => v !== null && change({ barLength: v })} min={1000} max={12000} step={100} bigStep={500} decimals={0} className="w-40" />,
            'cut-bar',
          )}
          {row(
            'kerf',
            t('workshop.kerf.title'),
            t('workshop.kerf.description'),
            <NumberField id="cut-kerf" value={cut.kerf} onChange={(v) => v !== null && change({ kerf: v })} min={0} max={20} step={0.5} bigStep={1} className="w-40" />,
            'cut-kerf',
          )}
          {row(
            'trimStart',
            t('workshop.trim.startTitle'),
            t('workshop.trim.description'),
            <NumberField id="cut-trim-start" aria-label={t('workshop.trim.startAria')} value={cut.trimStart} onChange={(v) => v !== null && change({ trimStart: v })} min={0} max={500} step={5} bigStep={50} className="w-40" />,
            'cut-trim-start',
          )}
          {row(
            'trimEnd',
            t('workshop.trim.endTitle'),
            t('workshop.trim.endDescription'),
            <NumberField id="cut-trim-end" aria-label={t('workshop.trim.endAria')} value={cut.trimEnd} onChange={(v) => v !== null && change({ trimEnd: v })} min={0} max={500} step={5} bigStep={50} className="w-40" />,
            'cut-trim-end',
          )}
          {row(
            'minReusable',
            t('workshop.reuse.title'),
            t('workshop.reuse.description'),
            <NumberField id="cut-reuse" value={cut.minReusable} onChange={(v) => v !== null && change({ minReusable: v })} min={0} max={6000} step={50} bigStep={250} decimals={0} className="w-40" />,
            'cut-reuse',
          )}
        </FieldGroup>

        {sample ? <FromLine sample={sample} row={row} /> : null}

        <FieldGroup title={t('workshop.numbering.title')} description={t('workshop.numbering.description')} bodyClassName="@container">
          <SettingRow title={t('workshop.numbering.nextQuote')} htmlFor="next-quote" description={t('workshop.numbering.nextQuoteHint', { number: fmt.docNumber(numbers.nextQuoteNumber) })}>
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
          <SettingRow title={t('workshop.numbering.nextOt')} htmlFor="next-ot" description={t('workshop.numbering.nextOtHint', { number: fmt.docNumber(numbers.nextWorkOrderNumber) })}>
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
        </FieldGroup>
      </div>
    </div>
  )
}

/** Efecto en vivo de los ajustes sobre el marco de muestra. */
function LiveResult({ sample, plan, cut }: { sample: SawSample; plan: ReturnType<typeof sawPlan>; cut: CutSettings }) {
  const t = useT(es)
  const fmt = useFormat()
  const rest = plan.geo?.remainder ?? 0
  const cells: [string, string][] = [
    [t('workshop.saw.bars'), fmt.number(plan.count)],
    [t('workshop.saw.yield'), fmt.pct(plan.yieldPct, 1)],
    [plan.geo?.reusable ? t('workshop.saw.offcut') : t('workshop.saw.rest'), fmt.mm(rest, { unit: true })],
    [t('workshop.saw.along', { angle: fmt.number(sample.miter, { maxDecimals: 1 }) }), fmt.mm(Math.round(plan.kerfAlong * 10) / 10, { unit: true })],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-divider pt-4 @2xl:grid-cols-4" aria-live="polite" aria-label={t('workshop.saw.liveAria', { kerf: fmt.mm(cut.kerf, { unit: true }) })}>
      {cells.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-table text-fg-muted">{label}</dt>
          <dd className="figure m-0 text-h3 font-medium text-fg-strong">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Lo que no se edita aquí: ángulos, soldadura y acero salen de la línea, con su procedencia. */
function FromLine({ sample, row }: { sample: SawSample; row: (param: SawParam, title: string, description: ReactNode, control: ReactNode) => ReactNode }) {
  const t = useT(es)
  const fmt = useFormat()
  const origin = (o: SawSample['weldOrigin']) => t(`workshop.saw.origin.${o ?? 'own'}`)
  const value = (text: string) => <p className="figure m-0 text-h4 font-medium text-fg-strong">{text}</p>
  return (
    <FieldGroup
      title={t('workshop.saw.lineTitle', { line: sample.lineName })}
      description={
        <>
          {t('workshop.saw.lineHelp')}{' '}
          <Link to="/catalogo?tab=lineas" className="font-medium text-accent hover:underline">
            {t('workshop.saw.lineLink')}
          </Link>
        </>
      }
      bodyClassName="@container"
    >
      {row('miter', t('workshop.saw.miter'), `${t('workshop.saw.miterHelp')} ${origin(sample.cutOrigin)}`, value(`${fmt.number(sample.miter, { maxDecimals: 1 })}°`))}
      {row('weld', t('workshop.saw.weld'), origin(sample.weldOrigin), value(sample.weld !== null ? t('workshop.saw.weldValue', { mm: fmt.mm(sample.weld) }) : t('workshop.saw.noData')))}
      {row(
        'steel',
        t('workshop.saw.steel'),
        sample.steel ? `${sample.steel.code} · ${origin(sample.cutOrigin)}` : t('workshop.saw.noSteel'),
        value(sample.steel ? t('workshop.saw.steelValue', { mm: fmt.mm(Math.round((sample.steel.pieceLength - sample.steel.length) * 10) / 10) }) : t('workshop.saw.noData')),
      )}
    </FieldGroup>
  )
}
