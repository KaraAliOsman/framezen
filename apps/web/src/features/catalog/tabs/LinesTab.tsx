import { useMemo, useRef, useState } from 'react'
import { CircleCheck, RotateCcw, RulerDimensionLine, Tag, TriangleAlert } from 'lucide-react'
import type { Catalog, Id, Line, Pauta, TypologyGroup, TypologyId } from '@dekopen/engine'
import { DEFAULT_PRICING, sanitizePauta, TYPOLOGIES } from '@dekopen/engine'
import { lineProvenance } from '@dekopen/catalog'
import { TypologyIcon } from '@dekopen/documents'
import { ApiRequestError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { normalizeSearch } from '../../../lib/format'
import { useSettings } from '../../../lib/hooks'
import { getGlossary, useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Button, EmptyState, Notice, SaveIndicator, SegmentedControl, Select, Skeleton, toastUndo } from '../../../ui'
import { usePatchLine, type LinePatch } from '../api'
import es from '../i18n/es'
import { lineReference } from '../model/brandExample'
import { brandKindLabel, localizedSourceSentence } from '../model/labels'
import {
  factoryOf,
  pautaExample,
  pautaFields,
  pautaMax,
  pautaPayload,
  pautaValue,
  presentKeys,
  reinforcementFields,
  samePauta,
  setPautaValue,
  type PautaKey,
  type ReinforcementKey,
} from '../model/pauta'
import type { PriceFocus } from '../model/prices'
import { completePricesFocus, completePricesLabel, readinessByLine, readinessCopy, readinessText, type LineReadiness } from '../model/readiness'
import { ReadinessBadge, ReadinessDot, Swatch } from '../parts'
import { useAutosave } from '../useAutosave'
import { PautaDiagram } from './PautaDiagram'

const ICON_FOR_KIND: Record<Line['kind'], TypologyId> = { casement: 'tilt_turn', sliding: 'sliding_2' }
const TYPOLOGY_ORDER = new Map<string, number>(TYPOLOGIES.map((t, i) => [t.id, i]))
const TYPOLOGY_GROUP = new Map<string, TypologyGroup>(TYPOLOGIES.map((t) => [t.id, t.group]))
const GROUP_ORDER: TypologyGroup[] = ['window', 'door', 'sliding', 'folding', 'shape']

/** Líneas agrupadas por marca (en el orden del catálogo), cada grupo por tipo y nombre. */
export function groupLines(lines: readonly Line[]): { brandId: Id; list: Line[] }[] {
  const map = new Map<string, Line[]>()
  for (const line of lines) map.set(line.brandId, [...(map.get(line.brandId) ?? []), line])
  return [...map].map(([brandId, list]) => ({
    brandId,
    list: [...list].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es', { numeric: true })),
  }))
}

/** Las líneas en el orden en que se listan (para «la primera que falta» del resumen). */
export function sortLinesForList(catalog: Pick<Catalog, 'lines'>): Line[] {
  return groupLines(catalog.lines).flatMap((group) => group.list)
}

export function LinesTab({
  catalog,
  loading,
  readiness: given,
  selectedId: controlled,
  onSelect,
  onCompletePrices,
}: {
  catalog: Catalog | undefined
  loading: boolean
  /** Completitud por línea (la calcula la página una vez); si falta, se calcula aquí. */
  readiness?: Map<Id, LineReadiness>
  /** Línea abierta (controlada desde la página: «Completar PRO5003» la abre). */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Abre la pestaña Precios con lo que le falta a la línea. */
  onCompletePrices?: (focus: PriceFocus, line: Line) => void
}) {
  const t = useT(es)
  const g = useGlossary()
  const [own, setOwn] = useState<string | null>(null)
  const selectedId = controlled !== undefined ? controlled : own
  const select = (id: string) => {
    setOwn(id)
    onSelect?.(id)
  }
  const lines = catalog?.lines ?? []
  // Se recalcula con los precios del taller: cargar un precio cambia el estado al instante.
  const computed = useMemo(() => (given ? null : readinessByLine(catalog)), [given, catalog])
  const readiness = given ?? computed ?? new Map<Id, LineReadiness>()
  const brands = useMemo(() => new Map((catalog?.brands ?? []).map((b) => [b.id, b])), [catalog])
  const groups = useMemo(() => groupLines(lines), [lines])
  const line = lines.find((l) => l.id === selectedId) ?? groups[0]?.list[0]

  if (loading || !catalog) {
    return (
      <div className="grid gap-6 lg:grid-cols-[264px_1fr]">
        <Skeleton className="h-96 rounded-md" />
        <Skeleton className="h-96 rounded-md" />
      </div>
    )
  }
  if (!line) {
    return <EmptyState size="compact" title={t('lines.emptyTitle')} description={t('lines.emptyDescription')} />
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
      {/* Teléfono y tableta: selector compacto */}
      <div className="lg:hidden">
        <Select
          aria-label={t('lines.selectLabel')}
          value={line.id}
          onValueChange={select}
          options={groups.flatMap((group) =>
            group.list.map((l) => {
              const state = readiness.get(l.id)?.state
              return {
                value: l.id,
                label: l.name,
                description: `${brands.get(group.brandId)?.name ?? ''} · ${state ? readinessCopy(state, t.locale).label : g.term(`lineKind.${l.kind}`)}`,
              }
            }),
          )}
        />
      </div>
      {/* Escritorio: lista por marca */}
      <nav aria-label={t('lines.navLabel')} className="scrollbar-quiet sticky top-4 hidden max-h-[calc(100dvh-160px)] flex-col gap-5 overflow-y-auto pr-1 lg:flex">
        {groups.map((group) => {
          const brand = brands.get(group.brandId)
          return (
            <div key={group.brandId} className="flex flex-col gap-0.5">
              <p className="flex items-center gap-2 px-2 pb-1.5 text-table text-fg-muted">
                <span className="truncate">{brand?.name ?? group.brandId}</span>
              </p>
              {group.list.map((l) => {
                const active = l.id === line.id
                const state = readiness.get(l.id)?.state ?? 'warnings'
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => select(l.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex min-h-10 items-center gap-2.5 rounded-sm px-2 py-1 text-left transition-colors duration-100 ease-out',
                      active ? 'bg-hover' : 'hover:bg-hover/70',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-fg-strong', active && 'font-medium')}>{l.name}</span>
                      <span className="block truncate text-meta text-fg-muted">
                        {t('lines.itemMeta', { kind: g.term(`lineKind.${l.kind}`), count: l.typologyIds.length })}
                      </span>
                    </span>
                    <ReadinessDot state={state} />
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>
      <LineDetail
        key={line.id}
        line={line}
        catalog={catalog}
        readiness={readiness.get(line.id)}
        brandName={brands.get(line.brandId)?.name ?? ''}
        brandKind={brands.get(line.brandId)?.kind}
        onCompletePrices={onCompletePrices}
      />
    </div>
  )
}

function LineDetail({
  line,
  catalog,
  readiness,
  brandName,
  brandKind,
  onCompletePrices,
}: {
  line: Line
  catalog: Catalog
  readiness?: LineReadiness
  brandName: string
  brandKind?: Parameters<typeof brandKindLabel>[0]
  onCompletePrices?: (focus: PriceFocus, line: Line) => void
}) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const settings = useSettings()
  const colors = line.colorIds.map((id) => catalog.colors.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const kindText = g.term(`lineKind.${line.kind}`)
  const materialText = g.term(`material.${line.material}`)
  // La descripción es dato del catálogo (en español): se compara con los datos dichos en español.
  const esGlossary = getGlossary('es')
  const plainFacts = [esGlossary.term(`material.${line.material}`), esGlossary.term(`lineKind.${line.kind}`), line.depth ? `${line.depth} mm` : null, line.chambers ? `${line.chambers}` : null]
    .filter(Boolean)
    .join(' ')
  const description = addsInformation(line.description, plainFacts) ? line.description : null
  const source = localizedSourceSentence(line, t.locale)
  const typologyGroups = useMemo(() => {
    const ids = line.typologyIds.filter((id): id is TypologyId => TYPOLOGY_ORDER.has(id)).sort((a, b) => (TYPOLOGY_ORDER.get(a) ?? 99) - (TYPOLOGY_ORDER.get(b) ?? 99))
    return GROUP_ORDER.map((group) => ({ group, ids: ids.filter((id) => TYPOLOGY_GROUP.get(id) === group) })).filter((entry) => entry.ids.length)
  }, [line.typologyIds])
  const typologyCount = typologyGroups.reduce((sum, entry) => sum + entry.ids.length, 0)
  const roles = Object.entries(line.profiles).filter(([, id]) => id) as [string, string][]
  const profileById = useMemo(() => new Map(catalog.profiles.map((p) => [p.id, p])), [catalog.profiles])
  const pricing = settings.data?.pricing ?? DEFAULT_PRICING
  const defaults = settings.data?.defaults
  // Sin precios de perfiles («Solo medidas») el precio de referencia engañaría: no se muestra.
  const reference = useMemo(
    () => (readiness?.state === 'geometry' ? null : lineReference(catalog, line, pricing, defaults)),
    [catalog, line, pricing, defaults, readiness?.state],
  )

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0">
              <p className="text-table text-fg-muted">
                {brandName}
                {brandKind && brandKind !== 'profiles' ? ` · ${brandKindLabel(brandKind, t.locale)}` : ''}
              </p>
              <h2 className="mt-0.5 font-display text-h2 font-medium text-fg-strong">{line.name}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-fg-muted">
                <span>
                  {materialText} · {kindText}
                </span>
                {line.depth ? (
                  <>
                    <span aria-hidden className="text-fg-faint">
                      ·
                    </span>
                    <span className="dim text-fg">{fmt.mm(line.depth, { unit: true })}</span>
                  </>
                ) : null}
                {line.chambers ? (
                  <>
                    <span aria-hidden className="text-fg-faint">
                      ·
                    </span>
                    <span>{t('lines.chambers', { count: line.chambers })}</span>
                  </>
                ) : null}
              </p>
              {readiness ? (
                <div className="mt-2">
                  <ReadinessBadge readiness={readiness} />
                </div>
              ) : null}
            </div>
          </div>
          {reference ? (
            <div className="flex min-w-0 flex-col items-start sm:items-end sm:text-right">
              <span className="text-meta text-fg-muted">{t('lines.reference')}</span>
              <span className="figure text-h2 font-medium text-fg-strong">{fmt.money(reference.unitNet)}</span>
              <span className="text-meta text-fg-muted">
                {t('lines.referenceValue', { typology: g.typology(reference.typologyId), size: fmt.size(reference.width, reference.height) })} ·{' '}
                {reference.missingPrices ? <span className="text-warning">{t('lines.referenceMissing')}</span> : t('lines.referenceNet')}
              </span>
            </div>
          ) : null}
        </div>
        {description ? <p className="text-fg">{description}</p> : null}
        {readiness ? <ReadinessPanel line={line} catalog={catalog} readiness={readiness} onCompletePrices={onCompletePrices} /> : null}
        {readiness ? <CutProvenance line={line} readiness={readiness} /> : null}
        {source || colors.length ? (
          <div className="flex flex-col gap-2 text-table sm:flex-row sm:items-center sm:justify-between">
            <p className="text-fg-muted">{source ? t('source.label', { source }) : null}</p>
            {colors.length ? (
              <div className="flex shrink-0 items-center gap-1" role="img" aria-label={t('lines.colorsLabel', { names: fmt.list(colors.map((c) => c.name)) })}>
                {colors.slice(0, 9).map((c) => (
                  <span key={c.id} title={c.name}>
                    <Swatch color={c} size={18} />
                  </span>
                ))}
                {colors.length > 9 ? <span className="ml-1 text-meta text-fg-muted">{t('lines.moreColors', { count: colors.length - 9 })}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="flex flex-col gap-3">
        <h3 className="text-h4 font-medium text-fg-strong">
          {t('lines.typologiesTitle')} <span className="font-normal text-fg-muted tabular">· {fmt.number(typologyCount)}</span>
        </h3>
        {typologyGroups.length ? (
          <div className="flex flex-col gap-4">
            {typologyGroups.map(({ group, ids }) => (
              <div key={group} className="flex flex-col gap-2">
                {typologyGroups.length > 1 ? <p className="text-meta font-medium text-fg-muted">{g.term(`typologyGroup.${group}`)}</p> : null}
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 xl:grid-cols-4">
                  {ids.map((id) => (
                    <li key={id} className="flex min-h-8 min-w-0 items-center gap-2.5">
                      <TypologyIcon typologyId={id} size={24} strokeWidth={1.25} className="shrink-0 text-fg-muted" />
                      <span className="truncate text-table text-fg">{g.typology(id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-table text-fg-muted">{t('lines.noTypologies')}</p>
        )}
      </section>

      <PautaEditor line={line} catalog={catalog} />

      {roles.length ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-h4 font-medium text-fg-strong">{t('lines.profilesTitle')}</h3>
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {roles.map(([role, id]) => {
              const p = profileById.get(id)
              return (
                <li key={role} className="flex min-h-9 items-center justify-between gap-3 py-1">
                  <span className="text-fg-muted">{g.profileRole(role)}</span>
                  <span className="min-w-0 truncate text-right">
                    <span className="code-id text-table text-fg-strong">{p?.code ?? t('common.noneDash')}</span>
                    {p ? <span className="text-fg-muted"> · {p.name}</span> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/**
 * Qué le falta a la línea para cotizar una ventana completa con precio, en palabras, con la
 * acción para completarlo. Nunca bloquea: con avisos o solo con medidas, igual se cotiza.
 */
function ReadinessPanel({
  line,
  catalog,
  readiness,
  onCompletePrices,
}: {
  line: Line
  catalog: Catalog
  readiness: LineReadiness
  onCompletePrices?: (focus: PriceFocus, line: Line) => void
}) {
  const t = useT(es)
  const fmt = useFormat()
  const focus = completePricesFocus(line, readiness, t.locale)
  const text = readinessText(readiness, line, catalog, t.locale)
  const { state } = readiness
  const readyColors = readiness.readyColors.map((id) => {
    const name = catalog.colors.find((c) => c.id === id)?.name ?? id
    return t.locale === 'es' ? name.toLocaleLowerCase('es-CL') : name
  })
  const Icon = state === 'ready' ? CircleCheck : state === 'warnings' ? TriangleAlert : RulerDimensionLine
  const headline = state === 'ready' && readyColors.length && readyColors.length < line.colorIds.length ? t('lines.readyIn', { colors: fmt.list(readyColors) }) : text.headline
  // En «lista» el detalle de que todo tiene precio sobra: el titular ya lo dice.
  const allPriced = t('readiness.readyAll')
  const details = text.details.filter((d) => !(state === 'ready' && d === allPriced))
  return (
    <div className="flex flex-col gap-3 border-y border-divider py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-2.5">
        <Icon aria-hidden strokeWidth={1.75} className={cn('mt-0.5 size-[18px] shrink-0', state === 'ready' ? 'text-success' : state === 'warnings' ? 'text-warning' : 'text-fg-muted')} />
        <div className="min-w-0">
          <p className="font-medium text-fg-strong">{headline}</p>
          {details.length ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-table text-fg-muted">
              {details.slice(0, 4).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-table text-fg-muted">{readinessCopy(state, t.locale).help}</p>
          )}
        </div>
      </div>
      {focus && onCompletePrices ? (
        <Button size="sm" variant={state === 'ready' ? 'secondary' : 'primary'} icon={Tag} onClick={() => onCompletePrices(focus, line)} className="shrink-0 self-start">
          {completePricesLabel(readiness, t.locale)}
        </Button>
      ) : null}
    </div>
  )
}

/** De dónde salen los cortes de la línea: fabricante, lista del taller o sin verificar. Nunca se aparenta. */
function CutProvenance({ line, readiness }: { line: Line; readiness: LineReadiness }) {
  const t = useT(es)
  const provenance = lineProvenance(line)
  const origin = readiness.cutOrigin
  const sources = provenance?.sources ?? []
  return (
    <section aria-label={t('provenance.title')} className="flex flex-col gap-1 text-table text-fg-muted">
      <p>
        <span className="font-medium text-fg-strong">{t('provenance.title')}:</span>{' '}
        <span className={origin === 'sin_verificar' ? 'text-warning' : 'text-fg'}>{origin ? t(`provenance.origin.${origin}`) : t('provenance.own')}.</span>{' '}
        {origin ? t(`provenance.help.${origin}`) : t('provenance.helpOwn')}
      </p>
      {readiness.dataWarnings.length ? (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-table text-fg">
          {readiness.dataWarnings.slice(0, 8).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {sources.length ? (
        <p className="text-meta text-fg-muted">
          {t('provenance.sources')}{' '}
          {sources.map((s, i) => (
            <span key={s.id}>
              {i > 0 ? ' · ' : ''}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline hover:text-fg">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  )
}

/** La descripción solo se muestra si dice algo que los datos de la línea no dicen ya. */
export function addsInformation(description: string | undefined, facts: string): boolean {
  if (!description?.trim()) return false
  const known = normalizeSearch(facts)
  const words = normalizeSearch(description)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && w !== 'mm' && !/^camaras?$/.test(w))
  return words.some((w) => !known.includes(w))
}

type DraftKey = PautaKey | `reinforcement.${ReinforcementKey}`

interface PautaDraft {
  pauta: Pauta
  doorPauta?: Partial<Pauta>
  sashInPauta?: Partial<Pauta>
}

function PautaEditor({ line, catalog }: { line: Line; catalog: Catalog }) {
  const t = useT(es)
  const fmt = useFormat()
  // Lo que viene del catálogo (con los ajustes que ya hubiera) y la pauta de fábrica.
  const loaded = useRef<PautaDraft>({ pauta: line.pauta, doorPauta: line.doorPauta, sashInPauta: line.sashInPauta })
  const factory = useRef<PautaDraft>(factoryOf(line))
  const [draft, setDraft] = useState<PautaDraft>(loaded.current)
  const [focus, setFocus] = useState<DraftKey | null>(null)
  const [mode, setMode] = useState<'window' | 'door'>('window')
  const [unavailable, setUnavailable] = useState(false)
  const patchLine = usePatchLine()
  const autosave = useAutosave<LinePatch>(
    async (patch) => {
      try {
        await patchLine.mutateAsync({ id: line.id, patch })
      } catch (error) {
        if (error instanceof ApiRequestError && (error.status === 404 || error.status === 405)) {
          setUnavailable(true)
          return
        }
        throw error
      }
    },
    700,
    `line:${line.id}`,
  )

  const save = (next: PautaDraft) => {
    setDraft(next)
    autosave.schedule({
      pauta: pautaPayload(next.pauta, loaded.current.pauta),
      ...(next.doorPauta || loaded.current.doorPauta ? { doorPauta: pautaPayload(next.doorPauta ?? {}, loaded.current.doorPauta) } : {}),
    })
  }
  // Vaciar un campo = volver al valor de fábrica.
  const valueOr = (value: number | null, key: DraftKey, base: Partial<Pauta> | undefined) => (value === null ? (pautaValue(base, key) ?? null) : value)
  const setBase = (key: DraftKey, value: number | null) => save({ ...draft, pauta: setPautaValue(draft.pauta, key, valueOr(value, key, factory.current.pauta)) as Pauta })
  const setDoor = (key: DraftKey, value: number | null) =>
    save({ ...draft, doorPauta: setPautaValue(draft.doorPauta ?? {}, key, valueOr(value, key, factory.current.doorPauta)) })

  const fields = useMemo(() => pautaFields(t.locale), [t.locale])
  const steelFields = useMemo(() => reinforcementFields(t.locale), [t.locale])
  const shownPauta = useMemo(() => sanitizePauta(draft.pauta).pauta, [draft.pauta])
  const example = useMemo(
    () => pautaExample(catalog, line, { pauta: draft.pauta, doorPauta: draft.doorPauta, sashInPauta: draft.sashInPauta }, t.locale),
    [catalog, line, draft, t.locale],
  )
  const frameProfile = catalog.profiles.find((p) => p.id === line.profiles.frame || p.id === line.profiles.sliding_frame)
  const adjusted = !samePauta(draft.pauta, factory.current.pauta) || !samePauta(draft.doorPauta, factory.current.doorPauta)
  const doorKeys = presentKeys(draft.doorPauta)
  const doorSteel = steelFields.filter((f) => draft.doorPauta?.reinforcement?.[f.key] !== undefined)
  const hasDoor = doorKeys.length > 0 || doorSteel.length > 0
  const isDoorKey = (key: DraftKey) => pautaValue(draft.doorPauta, key) !== undefined
  const doorValues = useMemo(() => ({ ...draft.pauta, ...draft.doorPauta, reinforcement: { ...draft.pauta.reinforcement, ...draft.doorPauta?.reinforcement } }), [draft.pauta, draft.doorPauta])
  const doorShown = useMemo(() => sanitizePauta(doorValues as Pauta).pauta, [doorValues])
  const origins = lineProvenance(line)?.fields
  const originText = (key: string, help: string) => (origins ? `${help} · ${t(`provenance.origin.${origins[`pauta.${key}`]?.origin ?? 'sin_verificar'}`)}` : help)
  const allFields = useMemo(
    () => [
      ...fields.map((f) => ({ key: f.key as DraftKey, label: f.label, help: originText(f.key, f.help) })),
      ...steelFields.map((f) => ({ key: `reinforcement.${f.key}` as DraftKey, label: f.label, help: f.help })),
    ],
    [fields, steelFields, origins, t],
  )

  const restore = () => {
    const before = draft
    setDraft(factory.current)
    autosave.schedule({ pauta: null, doorPauta: null, sashInPauta: null })
    toastUndo(t('pauta.restored', { line: line.name }), () => save(before))
  }

  const sashIn = draft.sashInPauta
  const sashInText = sashIn
    ? (() => {
        const bead = sashIn.beadDeduction !== undefined ? fmt.mm(sashIn.beadDeduction, { unit: true }) : null
        const steel = sashIn.reinforcement?.sash !== undefined ? fmt.mm(sashIn.reinforcement.sash, { unit: true }) : null
        if (bead && steel) return t('pauta.sashInBoth', { bead, steel })
        if (bead) return t('pauta.sashInBead', { bead })
        if (steel) return t('pauta.sashInSteel', { steel })
        return t('pauta.sashIn')
      })()
    : null

  return (
    <section>
      <header>
        {/* La fila tiene alto propio: el estado de guardado aparece mientras se escribe y no mueve el dibujo. */}
        <div className="flex min-h-8 items-center justify-between gap-3">
          <h3 className="min-w-0 text-h4 font-medium text-fg-strong">{t('pauta.title')}</h3>
          {(!unavailable && autosave.status !== 'idle') || adjusted ? (
            <div className="flex shrink-0 items-center gap-2">
              {!unavailable && autosave.status !== 'idle' ? <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} /> : null}
              {adjusted ? (
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={restore}>
                  {t('pauta.restore')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="mt-1 max-w-xl text-table text-fg-muted">{t('pauta.description')}</p>
      </header>

      {unavailable ? (
        <Notice tone="warning" size="compact" className="mt-4">
          {t('pauta.unavailable')}
        </Notice>
      ) : null}

      {hasDoor ? (
        <SegmentedControl<'window' | 'door'>
          size="sm"
          className="mt-5"
          aria-label={t('pauta.title')}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'window', label: t('pauta.windowTitle') },
            { value: 'door', label: t('pauta.doorTitle') },
          ]}
        />
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-panel bg-sunken p-3">
        <PautaDiagram
          pauta={mode === 'door' ? doorShown : shownPauta}
          values={mode === 'door' ? doorValues : draft.pauta}
          fields={allFields}
          frameFace={frameProfile?.face}
          active={focus}
          onActive={setFocus}
          onChange={mode === 'door' ? setDoor : setBase}
          editable={mode === 'door' ? isDoorKey : undefined}
          scope={mode === 'door' ? 'pauta-puerta' : 'pauta'}
        />
      </div>
      {example ? (
        <div className="mt-3">
          <p className="pb-2 text-table text-fg-muted">
            {t.rich('pauta.example', { title: example.title, size: fmt.size(example.width, example.height), b: <span className="font-medium text-fg-strong" /> })}
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 lg:grid-cols-3">
            {example.measures.map((m) => {
              const hit = focus ? m.uses.includes(focus) : false
              return (
                <div key={m.id} title={m.rule} className={cn('-mx-1.5 flex items-baseline justify-between gap-3 rounded-xs px-1.5 py-1 transition-colors duration-140', hit && 'bg-accent-subtle')}>
                  <dt className="min-w-0 truncate text-table text-fg-muted">{m.label}</dt>
                  <dd className={cn('text-table whitespace-nowrap tabular', hit ? 'font-medium text-accent-ink' : 'text-fg-strong')}>{m.size ? fmt.size(m.size.width, m.size.height) : fmt.mm(m.value, { unit: true })}</dd>
                </div>
              )
            })}
          </dl>
        </div>
      ) : null}
      {sashInText ? <p className="mt-3 text-table text-fg-muted">{sashInText}</p> : null}
      {!unavailable && line.completeness === 'verified' && adjusted ? (
        <Notice tone="info" size="compact" className="mt-4">
          {t('pauta.verifiedAdjusted')}
        </Notice>
      ) : null}
    </section>
  )
}
