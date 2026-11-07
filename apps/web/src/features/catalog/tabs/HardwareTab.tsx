import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ArrowUpRight, Package, type LucideIcon } from 'lucide-react'
import type { AccessoryRule, Catalog, ColorVariants, ExtraKind, HardwareRule, Item, Line, OpeningKind } from '@dekopen/engine'
import { INSECT_SCREEN_TYPES, ROLLER_SHUTTER_OPERATIONS, ROLLER_SHUTTER_TYPES } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT, type GlossaryHelpers } from '../../../lib/i18n'
import { EmptyState, Select, Skeleton } from '../../../ui'
import { IconInsectScreen, IconOpeningSliding, IconRollerShutter, IconSill, OPENING_ICONS } from '../../../ui/icons'
import es from '../i18n/es'
import { itemUnitLabel } from '../model/prices'
import { SectionTitle } from '../parts'

type T = ReturnType<typeof useT<typeof es>>
type Fmt = ReturnType<typeof useFormat>

/** Orden de las aperturas en la tabla (de la más común a la más especial). */
const OPENING_ORDER: OpeningKind[] = ['fixed', 'casement', 'tilt_turn', 'tilt', 'awning', 'door', 'pivot_v', 'pivot_h', 'tilt_slide', 'parallel_slide', 'folding']
const EXTRA_ORDER: ExtraKind[] = ['rollerShutter', 'insectScreen', 'sill', 'threshold']
const EXTRA_ICON: Record<ExtraKind, LucideIcon> = { rollerShutter: IconRollerShutter, insectScreen: IconInsectScreen, sill: IconSill, threshold: IconSill }

function openingsKey(rule: HardwareRule): string {
  return [...rule.openings].sort((a, b) => OPENING_ORDER.indexOf(a) - OPENING_ORDER.indexOf(b)).join('+')
}

function openingsText(rule: HardwareRule, line: Line, t: T, g: GlossaryHelpers): string {
  if (!rule.openings.length) return line.kind === 'sliding' ? t('hardware.movingSash') : t('hardware.anySash')
  return rule.openings.map((o) => g.opening(o)).join(', ')
}

function range(min: number | undefined, max: number | undefined, t: T, fmt: Fmt): string | null {
  const mm = (n: number) => fmt.mm(Math.round(n), { unit: true })
  if (min === undefined && max === undefined) return null
  if (min !== undefined && max !== undefined) return t('hardware.rangeBoth', { min: fmt.mm(Math.round(min)), max: mm(max) })
  if (min !== undefined) return t('hardware.rangeFrom', { min: mm(min) })
  return t('hardware.rangeTo', { max: mm(max!) })
}

function sizeText(rule: HardwareRule, t: T, fmt: Fmt): string {
  const height = range(rule.minHeight, rule.maxHeight, t, fmt)
  const width = range(rule.minWidth, rule.maxWidth, t, fmt)
  const parts = [height && t('hardware.height', { range: height }), width && t('hardware.width', { range: width })].filter(Boolean)
  return parts.length ? parts.join(' · ') : t('hardware.anySize')
}

/**
 * Variantes por color de una regla, para el tooltip: «Winchester, Nogal: Manilla recta marrón».
 * Sin variantes (o si sus artículos ya no están), nada.
 */
export function variantsText(rule: ColorVariants, items: ReadonlyMap<string, Item>, colorNames: ReadonlyMap<string, string>): string | undefined {
  if (!rule.byColor) return undefined
  const groups = new Map<string, string[]>()
  for (const [colorId, itemId] of Object.entries(rule.byColor)) {
    const name = items.get(itemId)?.name
    if (name) groups.set(name, [...(groups.get(name) ?? []), colorNames.get(colorId) ?? colorId])
  }
  return groups.size ? [...groups].map(([name, colors]) => `${colors.join(', ')}: ${name}`).join('\n') : undefined
}

function qtyText(rule: HardwareRule, t: T, fmt: Fmt): string {
  const base = fmt.number(rule.qty, { maxDecimals: 2 })
  return rule.perStep ? t('hardware.qtyStep', { qty: base, step: fmt.number(rule.perStep.qty, { maxDecimals: 2 }), mm: fmt.mm(rule.perStep.stepMm, { unit: true }) }) : base
}

/** Condiciones extra de un herraje: hoja activa o pasiva, secuencia y sistema de corredera. */
function hardwareQualifiers(rule: HardwareRule, g: GlossaryHelpers): string[] {
  const out: string[] = []
  if (rule.leaf) out.push(g.term(`leafRole.${rule.leaf}`))
  if (rule.sequence) out.push(g.term(`sequence.${rule.sequence}`))
  if (rule.systems?.includes('lift_slide')) out.push(g.term('sliding.system.lift_slide'))
  return out
}

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value)
}

/** Nombre de una variante de extra («Motor», «Plisado», «Monoblock…») en el idioma de la interfaz. */
function variantLabel(extra: ExtraKind | undefined, value: string, g: GlossaryHelpers): string {
  if (extra === 'rollerShutter') {
    if (isOneOf(ROLLER_SHUTTER_TYPES, value)) return g.term(`accessory.rollerShutterType.${value}`)
    if (isOneOf(ROLLER_SHUTTER_OPERATIONS, value)) return g.term(`accessory.rollerShutterOperation.${value}`)
  }
  if (extra === 'insectScreen' && isOneOf(INSECT_SCREEN_TYPES, value)) return g.term(`accessory.insectScreenType.${value}`)
  return value
}

/** Qué herrajes y accesorios lleva cada línea, según apertura y tamaño de la hoja. */
export function HardwareTab({ catalog, loading, onEditPrice }: { catalog: Catalog | undefined; loading: boolean; onEditPrice: (item: Item) => void }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const brands = useMemo(() => new Map((catalog?.brands ?? []).map((b) => [b.id, b.name])), [catalog])
  const lines = useMemo(
    () =>
      [...(catalog?.lines ?? [])].sort(
        (a, b) =>
          (brands.get(a.brandId) ?? '').localeCompare(brands.get(b.brandId) ?? '', 'es') || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'es', { numeric: true }),
      ),
    [catalog, brands],
  )
  const [lineId, setLineId] = useState<string | undefined>(undefined)
  // Por defecto, la primera línea verificada (la que más se usa para cotizar).
  const line = lines.find((l) => l.id === lineId) ?? lines.find((l) => l.completeness === 'verified') ?? lines[0]
  const items = useMemo(() => new Map((catalog?.items ?? []).map((i) => [i.id, i])), [catalog])
  const colorNames = useMemo(() => new Map((catalog?.colors ?? []).map((c) => [c.id, c.name])), [catalog])

  if (loading || !catalog) return <Skeleton className="h-80 rounded-md" />
  if (!line) {
    return <EmptyState size="compact" title={t('hardware.emptyTitle')} description={t('hardware.emptyDescription')} />
  }

  const hardware = [...line.hardwareRules].sort(
    (a, b) =>
      OPENING_ORDER.indexOf(a.openings[0] ?? 'fixed') - OPENING_ORDER.indexOf(b.openings[0] ?? 'fixed') ||
      openingsKey(a).localeCompare(openingsKey(b)) ||
      (a.minHeight ?? a.minWidth ?? 0) - (b.minHeight ?? b.minWidth ?? 0),
  )
  const missingHw = hardware.filter((r) => !(items.get(r.itemId)?.price ?? 0)).length
  const missingAcc = line.accessoryRules.filter((r) => !(items.get(r.itemId)?.price ?? 0)).length

  // Herrajes agrupados por apertura (cada grupo con su ícono y su nombre del glosario).
  const hwGroups: RuleGroup[] = []
  for (const rule of hardware) {
    const key = openingsKey(rule)
    let group = hwGroups.find((entry) => entry.key === key)
    if (!group) {
      const first = rule.openings[0]
      group = {
        key,
        title: openingsText(rule, line, t, g),
        icon: first ? OPENING_ICONS[first] : line.kind === 'sliding' ? IconOpeningSliding : Package,
        rows: [],
      }
      hwGroups.push(group)
    }
    const item = items.get(rule.itemId)
    group.rows.push({
      id: rule.id,
      item,
      variants: variantsText(rule, items, colorNames),
      qualifiers: hardwareQualifiers(rule, g),
      cells: [sizeText(rule, t, fmt), qtyText(rule, t, fmt)],
    })
  }

  // Accesorios: los de toda ventana y, aparte, los extras (persiana, mosquitero…) que solo se cotizan si la ventana los lleva.
  const accRow = (rule: AccessoryRule): RuleRow => ({
    id: rule.id,
    item: items.get(rule.itemId),
    variants: variantsText(rule, items, colorNames),
    qualifiers: rule.variants?.length ? [t('hardware.onlyVariants', { variants: fmt.list(rule.variants.map((v) => variantLabel(rule.extra, v, g)), 'disjunction') })] : [],
    cells: [t('hardware.perQty', { qty: fmt.number(rule.qty, { maxDecimals: 2 }), per: t(`hardware.per.${rule.per}`) })],
  })
  const accGroups: RuleGroup[] = []
  const always = line.accessoryRules.filter((rule) => !rule.extra)
  if (always.length) accGroups.push({ key: 'always', title: t('hardware.everyWindow'), icon: Package, rows: always.map(accRow) })
  for (const extra of EXTRA_ORDER) {
    const rules = line.accessoryRules.filter((rule) => rule.extra === extra)
    if (rules.length) accGroups.push({ key: extra, title: g.term(`accessory.${extra}`), icon: EXTRA_ICON[extra], rows: rules.map(accRow), extra: true })
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle title={t('hardware.title')} />
        <Select
          aria-label={t('hardware.lineLabel')}
          value={line.id}
          onValueChange={setLineId}
          className="sm:w-72"
          options={lines.map((l) => ({ value: l.id, label: l.name, description: t('common.lineAndBrand', { brand: brands.get(l.brandId) ?? '', kind: g.term(`lineKind.${l.kind}`) }) }))}
        />
      </div>

      <RuleSection
        title={t('hardware.hardwareTitle')}
        subtitle={missingHw ? t('hardware.rulesMissing', { count: hardware.length, missing: fmt.number(missingHw) }) : t('hardware.rules', { count: hardware.length })}
        empty={t('hardware.hardwareEmpty')}
        groups={hwGroups}
        headers={[{ label: t('hardware.colSize'), nowrap: true }, { label: t('hardware.colQty') }]}
        onEditPrice={onEditPrice}
      />

      <RuleSection
        title={t('hardware.accessoriesTitle')}
        subtitle={missingAcc ? t('hardware.rulesMissing', { count: line.accessoryRules.length, missing: fmt.number(missingAcc) }) : t('hardware.rules', { count: line.accessoryRules.length })}
        empty={t('hardware.accessoriesEmpty')}
        groups={accGroups}
        headers={[{ label: t('hardware.colQty') }]}
        onEditPrice={onEditPrice}
        note={accGroups.some((group) => group.extra) ? t('hardware.extrasTitle') : undefined}
      />
    </div>
  )
}

/** Nota atenuada con las variantes por color en el tooltip (y para lectores de pantalla). */
function VariantNote({ text, className }: { text: string; className?: string }) {
  const t = useT(es)
  return (
    <span className={cn('shrink-0 text-meta text-fg-muted', className)} title={text}>
      {t('hardware.variesByColor')}
      <span className="sr-only">: {text}</span>
    </span>
  )
}

interface RuleRow {
  id: string
  item: Item | undefined
  /** Artículo que se usa en otros colores de ventana (tooltip); vacío = el mismo en todos. */
  variants?: string
  /** Condiciones extra («Hoja pasiva», «Solo motor»…). */
  qualifiers: string[]
  cells: string[]
}

interface RuleGroup {
  key: string
  title: string
  icon: LucideIcon
  rows: RuleRow[]
  /** Extra de la ventana (persiana, mosquitero…): solo se cotiza si la ventana lo lleva. */
  extra?: boolean
}

/** Columna de datos. `nowrap`: nunca parte línea (medidas). El resto parte línea solo si la tabla es angosta. */
interface RuleColumn {
  label: string
  nowrap?: boolean
}

function RuleSection({
  title,
  subtitle,
  empty,
  groups,
  headers,
  onEditPrice,
  note,
}: {
  title: string
  subtitle: string
  empty: string
  groups: RuleGroup[]
  headers: RuleColumn[]
  onEditPrice: (item: Item) => void
  note?: ReactNode
}) {
  const t = useT(es)
  const fmt = useFormat()
  const columns = headers.length + 2
  return (
    <section className="@container">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-2">
        <h3 className="text-h4 font-medium text-fg-strong">{title}</h3>
        <span className="text-table text-fg-muted">{subtitle}</span>
      </header>
      {groups.length === 0 ? (
        <p className="py-2 text-table text-fg-muted">{empty}</p>
      ) : (
        <div className="scrollbar-quiet -mx-3 overflow-x-auto rounded-panel bg-plate px-3 shadow-plate">
          <table className="w-full min-w-[600px] text-table">
            <thead>
              <tr className="h-9 border-b border-divider text-table text-fg-muted">
                <th scope="col" className="pr-4 text-left font-normal">
                  {t('hardware.colItem')}
                </th>
                {headers.map((h) => (
                  <th key={h.label} scope="col" className="px-3 text-left font-normal whitespace-nowrap">
                    {h.label}
                  </th>
                ))}
                <th scope="col" className="pl-4 text-right font-normal">
                  {t('hardware.colPrice')}
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, gi) => {
                const Icon = group.icon
                const firstExtra = group.extra && !groups.slice(0, gi).some((other) => other.extra)
                return (
                  <Fragment key={group.key}>
                    {firstExtra && note ? (
                      <tr className="border-b border-divider">
                        <td colSpan={columns} className="pt-4 pb-1.5 text-table text-fg-muted">
                          {note}
                        </td>
                      </tr>
                    ) : null}
                    <tr className="h-10 border-b border-divider">
                      <th scope="colgroup" colSpan={columns} className="pt-2 text-left font-medium text-fg-strong">
                        <span className="flex items-center gap-2">
                          <Icon aria-hidden className="size-4 text-fg-muted" strokeWidth={1.75} />
                          <span className="truncate">{group.title}</span>
                          <span className="font-normal text-fg-faint tabular">· {t('hardware.sashGroupCount', { count: group.rows.length })}</span>
                        </span>
                      </th>
                    </tr>
                    {group.rows.map((row) => {
                      const price = row.item?.price ?? 0
                      return (
                        <tr key={row.id} className="h-9 border-b border-divider last:border-b-0">
                          {/* El artículo se lleva el espacio que sobra: es lo que se lee. En tablas angostas el código va debajo del nombre. */}
                          <td className="w-full max-w-0 min-w-[220px] py-1 pr-4 @min-[1000px]:min-w-[260px]">
                            <span className="flex min-w-0 flex-col-reverse @min-[1000px]:flex-row @min-[1000px]:items-baseline @min-[1000px]:gap-2">
                              {/* «Cambia con el color»: junto al código en tablas angostas (no le quita espacio al nombre) y tras el nombre en las anchas. */}
                              {row.item?.code || row.variants ? (
                                <span className="flex min-w-0 items-baseline gap-1.5 @min-[1000px]:shrink-0">
                                  {row.item?.code ? <span title={row.item.code} className="code-id truncate text-meta text-fg-muted @min-[1000px]:w-[5.5rem]">{row.item.code}</span> : null}
                                  {row.variants ? <VariantNote text={row.variants} className="@min-[1000px]:hidden" /> : null}
                                </span>
                              ) : null}
                              <span className="flex min-w-0 items-baseline gap-1.5">
                                <span className="truncate text-fg" title={row.item?.name}>
                                  {row.item?.name ?? t('hardware.gone')}
                                </span>
                                {row.variants ? <VariantNote text={row.variants} className="hidden @min-[1000px]:inline" /> : null}
                                {row.qualifiers.map((q) => (
                                  <span key={q} className="shrink-0 text-meta text-fg-muted">
                                    {q}
                                  </span>
                                ))}
                              </span>
                            </span>
                          </td>
                          {row.cells.map((cell, i) => (
                            <td
                              key={i}
                              className={cn('px-3 py-1 text-fg tabular', headers[i]?.nowrap ? 'whitespace-nowrap' : '@min-[800px]:whitespace-nowrap')}
                            >
                              {cell}
                            </td>
                          ))}
                          <td className="pl-4 text-right whitespace-nowrap">
                            {row.item ? (
                              <button
                                type="button"
                                onClick={() => onEditPrice(row.item!)}
                                className={cn('group inline-flex min-h-8 items-center gap-1 rounded-xs tabular hover:text-accent-ink', price > 0 ? 'text-fg' : 'text-warning')}
                                title={t('hardware.changePrice', { unit: itemUnitLabel(row.item, t.locale) })}
                              >
                                {price > 0 ? fmt.money(price) : t('common.noPrice')}
                                <ArrowUpRight aria-hidden className="size-3.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100" strokeWidth={1.75} />
                              </button>
                            ) : (
                              <span className="text-fg-muted">{t('common.noneDash')}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
