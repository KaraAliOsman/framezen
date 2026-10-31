import { useMemo, useRef, useState } from 'react'
import { CircleCheck, Info, RotateCcw, RulerDimensionLine, Tag, TriangleAlert } from 'lucide-react'
import type { Catalog, Line, Pauta, TypologyId } from '@framezen/engine'
import { sanitizePauta, TYPOLOGIES } from '@framezen/engine'
import { TYPOLOGY_ICON_LABELS, TypologyIcon } from '@framezen/documents'
import { ApiRequestError, humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { formatMMUnit, formatNumber, normalizeSearch } from '../../../lib/format'
import { Button, Card, EmptyState, NumberField, SaveIndicator, Select, Skeleton, toastUndo } from '../../../ui'
import { usePatchLine, type LinePatch } from '../api'
import { BRAND_KIND_LABEL, LINE_KIND_LABEL, MATERIAL_LABEL, ROLE_LABEL, monogramOrder, sourceSentence } from '../model/labels'
import type { PriceFocus } from '../model/prices'
import { completePricesFocus, completePricesLabel, readinessByLine, READINESS_COPY, type LineReadiness } from '../model/readiness'
import {
  PAUTA_FIELDS,
  REINFORCEMENT_FIELDS,
  factoryOf,
  pautaExample,
  pautaMax,
  pautaPayload,
  samePauta,
  pautaValue,
  presentKeys,
  setPautaValue,
  type PautaKey,
  type ReinforcementKey,
} from '../model/pauta'
import { Monogram, ReadinessBadge, ReadinessDot, Swatch } from '../parts'
import { useAutosave } from '../useAutosave'
import { PautaDiagram } from './PautaDiagram'

const ICON_FOR_KIND: Record<Line['kind'], TypologyId> = { casement: 'tilt_turn', sliding: 'sliding_2' }
const TYPOLOGY_ORDER = new Map<string, number>(TYPOLOGIES.map((t, i) => [t.id, i]))

export function LinesTab({
  catalog,
  loading,
  onCompletePrices,
}: {
  catalog: Catalog | undefined
  loading: boolean
  /** Abre la pestaña Precios con lo que le falta a la línea. */
  onCompletePrices?: (focus: PriceFocus, line: Line) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const lines = catalog?.lines ?? []
  // Se recalcula con los precios del taller: cargar un precio cambia el estado al instante.
  const readiness = useMemo(() => readinessByLine(catalog), [catalog])
  const brands = useMemo(() => new Map((catalog?.brands ?? []).map((b) => [b.id, b])), [catalog])
  // Mismas iniciales que en Marcas (el catálogo del taller trae solo las activas).
  const monogramSiblings = useMemo(() => monogramOrder(catalog?.brands ?? []), [catalog])
  const groups = useMemo(() => {
    const map = new Map<string, Line[]>()
    for (const line of lines) map.set(line.brandId, [...(map.get(line.brandId) ?? []), line])
    return [...map].map(([brandId, list]) => ({
      brandId,
      list: [...list].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es', { numeric: true })),
    }))
  }, [lines])
  const line = lines.find((l) => l.id === selectedId) ?? groups[0]?.list[0]

  if (loading || !catalog) {
    return (
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  }
  if (!line) {
    return (
      <Card>
        <EmptyState size="compact" sketch="casement" title="Aún no tienes líneas activas" description="Activa una marca de perfiles en la pestaña Marcas y sus líneas aparecen aquí con su pauta." />
      </Card>
    )
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Teléfono y tableta: selector compacto */}
      <div className="lg:hidden">
        <Select
          aria-label="Línea"
          value={line.id}
          onValueChange={setSelectedId}
          options={groups.flatMap((g) =>
            g.list.map((l) => ({
              value: l.id,
              label: l.name,
              description: `${brands.get(g.brandId)?.name ?? ''} · ${readiness.get(l.id) ? READINESS_COPY[readiness.get(l.id)!.state].label : LINE_KIND_LABEL[l.kind]}`,
            })),
          )}
        />
      </div>
      {/* Escritorio: lista por marca */}
      <nav aria-label="Líneas" className="sticky top-4 hidden max-h-[calc(100dvh-160px)] flex-col gap-4 overflow-y-auto pr-1 lg:flex scrollbar-quiet">
        {groups.map((group) => {
          const brand = brands.get(group.brandId)
          return (
            <div key={group.brandId} className="flex flex-col gap-1">
              <p className="flex items-center gap-2 px-2 pb-1 text-meta font-medium text-paper-600">
                {brand ? <Monogram brand={brand} siblings={monogramSiblings} size={18} /> : null}
                {brand?.name ?? group.brandId}
              </p>
              {group.list.map((l) => {
                const active = l.id === line.id
                const state = readiness.get(l.id)?.state ?? 'warnings'
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-120',
                      active ? 'bg-paper-0 shadow-[inset_0_0_0_1px_var(--paper-200)]' : 'hover:bg-paper-100',
                    )}
                  >
                    <TypologyIcon typologyId={ICON_FOR_KIND[l.kind]} size={24} strokeWidth={1.25} className={active ? 'text-ink-600' : 'text-paper-600'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-paper-900">{l.name}</span>
                      <span className="block truncate text-meta text-paper-600">
                        {LINE_KIND_LABEL[l.kind]} · {l.typologyIds.length} {l.typologyIds.length === 1 ? 'tipología' : 'tipologías'}
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
  brandKind?: keyof typeof BRAND_KIND_LABEL
  onCompletePrices?: (focus: PriceFocus, line: Line) => void
}) {
  const colors = line.colorIds.map((id) => catalog.colors.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const facts = [MATERIAL_LABEL[line.material], LINE_KIND_LABEL[line.kind], line.depth ? `${formatNumber(line.depth)} mm` : null, line.chambers ? `${line.chambers} cámaras` : null].filter(Boolean)
  const description = addsInformation(line.description, facts.join(' ')) ? line.description : null
  const source = sourceSentence(line)
  const typologies = line.typologyIds
    .filter((t): t is TypologyId => t in TYPOLOGY_ICON_LABELS)
    .sort((a, b) => (TYPOLOGY_ORDER.get(a) ?? 99) - (TYPOLOGY_ORDER.get(b) ?? 99))
  const roles = Object.entries(line.profiles).filter(([, id]) => id) as [keyof typeof ROLE_LABEL, string][]
  const profileById = useMemo(() => new Map(catalog.profiles.map((p) => [p.id, p])), [catalog.profiles])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3 rounded-lg border border-paper-200 bg-paper-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] text-paper-600">
              {brandName}
              {brandKind && brandKind !== 'profiles' ? ` · ${BRAND_KIND_LABEL[brandKind]}` : ''}
            </p>
            <h2 className="mt-0.5 text-h3 font-semibold tracking-[-0.01em] text-paper-900">{line.name}</h2>
            <p className="mt-0.5 text-paper-600">{facts.join(' · ')}</p>
          </div>
          {readiness ? <ReadinessBadge readiness={readiness} /> : null}
        </div>
        {description ? <p className="text-paper-900">{description}</p> : null}
        {readiness ? <ReadinessPanel line={line} catalog={catalog} readiness={readiness} onCompletePrices={onCompletePrices} /> : null}
        <div className="flex flex-col gap-2 border-t border-paper-200 pt-3 text-[13px] leading-[18px] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-paper-600">{source ? <>Fuente: {source}</> : null}</p>
          {colors.length ? (
            <div className="flex shrink-0 items-center gap-1" aria-label={`Colores: ${colors.map((c) => c.name).join(', ')}`}>
              {colors.slice(0, 9).map((c) => (
                <span key={c.id} title={c.name}>
                  <Swatch color={c} size={16} />
                </span>
              ))}
              {colors.length > 9 ? <span className="ml-1 text-meta text-paper-600">+{colors.length - 9}</span> : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold text-paper-900">
          Tipologías que fabrica <span className="font-normal text-paper-600">· {typologies.length}</span>
        </h3>
        {typologies.length ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {typologies.map((t) => (
              <li key={t} className="flex flex-col items-center gap-2 rounded-md border border-paper-200 bg-paper-0 px-2 pt-3 pb-2 text-center">
                <TypologyIcon typologyId={t} size={44} strokeWidth={1.25} className="text-paper-900" />
                <span className="text-meta leading-tight text-paper-600">{TYPOLOGY_ICON_LABELS[t]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-paper-600">Sin tipologías asignadas: el diseñador igual te deja dibujar cualquier ventana con esta línea.</p>
        )}
      </section>

      <PautaEditor line={line} catalog={catalog} />

      {roles.length ? (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold text-paper-900">Perfiles por función</h3>
          <ul className="grid gap-x-6 gap-y-1 rounded-lg border border-paper-200 bg-paper-0 px-4 py-3 sm:grid-cols-2">
            {roles.map(([role, id]) => {
              const p = profileById.get(id)
              return (
                <li key={role} className="flex items-baseline justify-between gap-3 border-b border-paper-200/70 py-1.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                  <span className="text-paper-600">{ROLE_LABEL[role]}</span>
                  <span className="min-w-0 truncate text-right">
                    <span className="font-mono text-[12px] text-paper-900">{p?.code ?? '—'}</span>
                    {p ? <span className="text-paper-600"> · {p.name}</span> : null}
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
  const focus = completePricesFocus(line, readiness)
  const colorName = (id: string) => (catalog.colors.find((c) => c.id === id)?.name ?? id).toLocaleLowerCase('es-CL')
  const readyColors = readiness.readyColors.map(colorName)
  const { state } = readiness
  const Icon = state === 'ready' ? CircleCheck : state === 'warnings' ? TriangleAlert : RulerDimensionLine
  const headline =
    state === 'ready'
      ? readyColors.length && readyColors.length < line.colorIds.length
        ? `Lista para cotizar en ${joinWords(readyColors)}`
        : 'Lista para cotizar'
      : readiness.headline
  // En «lista» el detalle de que todo tiene precio sobra: el titular ya lo dice.
  const details = readiness.details.filter((d) => !(state === 'ready' && d.startsWith('Todos sus perfiles')))
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between',
        state === 'ready' ? 'border-ok-600/20 bg-ok-50' : state === 'warnings' ? 'border-warn-600/25 bg-warn-50' : 'border-paper-200 bg-paper-50',
      )}
    >
      <div className="flex min-w-0 gap-2.5">
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={cn('mt-0.5 size-[18px] shrink-0', state === 'ready' ? 'text-ok-600' : state === 'warnings' ? 'text-warn-600' : 'text-paper-600')}
        />
        <div className="min-w-0">
          <p className={cn('font-medium', state === 'ready' ? 'text-ok-800' : state === 'warnings' ? 'text-warn-800' : 'text-paper-900')}>{headline}</p>
          {details.length ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-[13px] leading-[18px] text-paper-600">
              {details.slice(0, 4).map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">{READINESS_COPY[state].help}</p>
          )}
        </div>
      </div>
      {focus && onCompletePrices ? (
        <Button size="sm" variant={state === 'ready' ? 'secondary' : 'primary'} icon={Tag} onClick={() => onCompletePrices(focus, line)} className="shrink-0 self-start">
          {completePricesLabel(readiness)}
        </Button>
      ) : null}
    </div>
  )
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

/** La descripción solo se muestra si dice algo que los datos de la línea no dicen ya. */
export function addsInformation(description: string | undefined, facts: string): boolean {
  if (!description?.trim()) return false
  const known = normalizeSearch(facts)
  const words = normalizeSearch(description)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && w !== 'mm')
  return words.some((w) => !known.includes(w))
}

type DraftKey = PautaKey | `reinforcement.${ReinforcementKey}`

interface PautaDraft {
  pauta: Pauta
  doorPauta?: Partial<Pauta>
  sashInPauta?: Partial<Pauta>
}

function PautaEditor({ line, catalog }: { line: Line; catalog: Catalog }) {
  // Lo que viene del catálogo (con los ajustes que ya hubiera) y la pauta de fábrica.
  const loaded = useRef<PautaDraft>({ pauta: line.pauta, doorPauta: line.doorPauta, sashInPauta: line.sashInPauta })
  const factory = useRef<PautaDraft>(factoryOf(line))
  const [draft, setDraft] = useState<PautaDraft>(loaded.current)
  const [focus, setFocus] = useState<DraftKey | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const patchLine = usePatchLine()
  const autosave = useAutosave<LinePatch>(async (patch) => {
    try {
      await patchLine.mutateAsync({ id: line.id, patch })
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 404 || error.status === 405)) {
        setUnavailable(true)
        return
      }
      throw error
    }
  }, 700, `line:${line.id}`)

  const save = (next: PautaDraft) => {
    setDraft(next)
    autosave.schedule({
      pauta: pautaPayload(next.pauta, loaded.current.pauta),
      ...(next.doorPauta || loaded.current.doorPauta ? { doorPauta: pautaPayload(next.doorPauta ?? {}, loaded.current.doorPauta) } : {}),
    })
  }
  // Vaciar un campo = volver al valor de fábrica.
  const valueOr = (value: number | null, key: DraftKey, base: Partial<Pauta> | undefined) => (value === null ? (pautaValue(base, key) ?? null) : value)
  const setBase = (key: DraftKey, value: number | null) =>
    save({ ...draft, pauta: setPautaValue(draft.pauta, key, valueOr(value, key, factory.current.pauta)) as Pauta })
  const setDoor = (key: DraftKey, value: number | null) =>
    save({ ...draft, doorPauta: setPautaValue(draft.doorPauta ?? {}, key, valueOr(value, key, factory.current.doorPauta)) })

  const shownPauta = useMemo(() => sanitizePauta(draft.pauta).pauta, [draft.pauta])
  const example = useMemo(() => pautaExample(catalog, line, { pauta: draft.pauta, doorPauta: draft.doorPauta, sashInPauta: draft.sashInPauta }), [catalog, line, draft])
  const frameProfile = catalog.profiles.find((p) => p.id === line.profiles.frame || p.id === line.profiles.sliding_frame)
  const adjusted = !samePauta(draft.pauta, factory.current.pauta) || !samePauta(draft.doorPauta, factory.current.doorPauta)
  const highlighted = focus && !focus.startsWith('reinforcement.') ? (focus as PautaKey) : null
  const doorKeys = presentKeys(draft.doorPauta)
  const doorSteel = REINFORCEMENT_FIELDS.filter((f) => draft.doorPauta?.reinforcement?.[f.key] !== undefined)

  const restore = () => {
    const before = draft
    setDraft(factory.current)
    autosave.schedule({ pauta: null, doorPauta: null, sashInPauta: null })
    toastUndo(`Volviste a la pauta de fábrica de ${line.name}.`, () => save(before))
  }

  return (
    <section className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-200 px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="font-semibold text-paper-900">Pauta de corte</h3>
          <p className="mt-0.5 max-w-xl text-[13px] leading-[18px] text-paper-600">
            Los descuentos con que el motor calcula cada corte, vidrio y refuerzo. Pasa el cursor por un valor para verlo en el dibujo.
          </p>
        </div>
        {(!unavailable && autosave.status !== 'idle') || adjusted ? (
        <div className="flex items-center gap-2">
          {!unavailable && autosave.status !== 'idle' ? <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} /> : null}
          {adjusted ? (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={restore}>
              Pauta de fábrica
            </Button>
          ) : null}
        </div>
        ) : null}
      </header>

      {unavailable ? (
        <p className="flex items-start gap-2 border-b border-warn-600/20 bg-warn-50 px-5 py-2.5 text-[13px] leading-[18px] text-warn-800">
          <Info aria-hidden className="mt-px size-4 shrink-0" strokeWidth={1.75} />
          Todavía no podemos guardar cambios de pauta desde aquí. Pruébalos: el ejemplo se recalcula con tus valores, pero al salir vuelve la pauta del catálogo.
        </p>
      ) : line.completeness === 'verified' && adjusted ? (
        <p className="flex items-start gap-2 border-b border-paper-200 bg-paper-50 px-5 py-2.5 text-[13px] leading-[18px] text-paper-600">
          <Info aria-hidden className="mt-px size-4 shrink-0 text-ink-600" strokeWidth={1.75} />
          La pauta de fábrica de esta línea está verificada en taller. Con tus ajustes, revisa la primera ventana que cortes.
        </p>
      ) : null}

      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-paper-200 bg-paper-50 p-2">
            <PautaDiagram pauta={shownPauta} frameFace={frameProfile?.face} highlight={highlighted} />
          </div>
          {example ? (
            <div className="overflow-hidden rounded-md border border-paper-200">
              <p className="border-b border-paper-200 bg-paper-50 px-3 py-2 text-[13px] text-paper-600">
                Ejemplo: <span className="font-medium text-paper-900">{example.title}</span> de {formatNumber(example.width)} × {formatNumber(example.height)} mm
              </p>
              <table className="w-full text-table">
                <tbody>
                  {example.measures.map((m) => {
                    const hit = focus ? m.uses.includes(focus) : false
                    return (
                      <tr key={m.id} className={cn('border-b border-paper-200/70 transition-colors duration-160 last:border-b-0', hit && 'bg-ink-50')}>
                        <th scope="row" className="px-3 py-1.5 text-left font-normal">
                          <span className="block text-paper-900">{m.label}</span>
                          <span className="block text-meta text-paper-600">{m.rule}</span>
                        </th>
                        <td className={cn('px-3 py-1.5 text-right whitespace-nowrap tabular', hit ? 'font-semibold text-ink-700' : 'text-paper-900')}>
                          {m.size ? `${formatNumber(m.size.width, 1)} × ${formatNumber(m.size.height, 1)}` : formatMMUnit(m.value)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <FieldList
            fields={PAUTA_FIELDS.map((f) => ({ key: f.key as DraftKey, label: f.label, help: f.help, rule: f.rule }))}
            source={draft.pauta}
            onChange={setBase}
            onFocusKey={setFocus}
            focus={focus}
          />
          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-semibold text-paper-900">Refuerzos (acero)</h4>
            <FieldList
              fields={REINFORCEMENT_FIELDS.map((f) => ({ key: `reinforcement.${f.key}` as DraftKey, label: f.label, help: f.help }))}
              source={draft.pauta}
              onChange={setBase}
              onFocusKey={setFocus}
              focus={focus}
              optional
            />
          </div>
          {doorKeys.length || doorSteel.length ? (
            <div className="flex flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-paper-900">Puertas</h4>
              <p className="-mt-1 text-[13px] leading-[18px] text-paper-600">En puertas cambian solo estos valores; el resto es igual a la ventana.</p>
              <FieldList
                fields={[
                  ...PAUTA_FIELDS.filter((f) => doorKeys.includes(f.key)).map((f) => ({ key: f.key as DraftKey, label: f.label, help: f.help })),
                  ...doorSteel.map((f) => ({ key: `reinforcement.${f.key}` as DraftKey, label: f.label, help: f.help })),
                ]}
                source={draft.doorPauta ?? {}}
                scope="pauta-puerta"
                onChange={setDoor}
                onFocusKey={setFocus}
                focus={null}
              />
            </div>
          ) : null}
          {draft.sashInPauta ? (
            <p className="rounded-md bg-paper-50 px-3 py-2 text-[13px] leading-[18px] text-paper-600">
              La hoja que abre hacia adentro usa su propio perfil
              {draft.sashInPauta.beadDeduction !== undefined ? `, con junquillo = hoja − ${formatNumber(draft.sashInPauta.beadDeduction, 1)} mm` : ''}
              {draft.sashInPauta.reinforcement?.sash !== undefined ? ` y refuerzo = corte − ${formatNumber(draft.sashInPauta.reinforcement.sash, 1)} mm` : ''}.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function FieldList({
  fields,
  source,
  onChange,
  onFocusKey,
  focus,
  optional,
  scope = 'pauta',
}: {
  /** Prefijo de los ids (la pauta de puertas repite claves de la base). */
  scope?: string
  fields: { key: DraftKey; label: string; help: string; rule?: string }[]
  source: Partial<Pauta>
  onChange: (key: DraftKey, value: number | null) => void
  onFocusKey: (key: DraftKey | null) => void
  focus: DraftKey | null
  optional?: boolean
}) {
  return (
    <ul className="flex flex-col divide-y divide-paper-200/70 rounded-md border border-paper-200">
      {fields.map((f) => {
        const value = pautaValue(source, f.key)
        return (
          <li
            key={f.key}
            onMouseEnter={() => onFocusKey(f.key)}
            onMouseLeave={() => onFocusKey(null)}
            className={cn('flex items-center justify-between gap-3 px-3 py-2 transition-colors duration-160', focus === f.key && 'bg-ink-50/70')}
          >
            <label htmlFor={`${scope}-${f.key}`} className="min-w-0 cursor-pointer">
              <span className="block font-medium text-paper-900">{f.label}</span>
              <span className="block text-meta text-paper-600">{f.help}</span>
            </label>
            <NumberField
              id={`${scope}-${f.key}`}
              value={value ?? null}
              onChange={(v) => onChange(f.key, v)}
              onFocus={() => onFocusKey(f.key)}
              onBlur={() => onFocusKey(null)}
              step={0.5}
              bigStep={5}
              min={0}
              max={pautaMax(f.key)}
              placeholder={optional ? '—' : undefined}
              className="w-[104px] shrink-0"
            />
          </li>
        )
      })}
    </ul>
  )
}
