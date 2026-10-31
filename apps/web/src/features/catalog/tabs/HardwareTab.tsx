import { useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { AccessoryRule, Catalog, ColorVariants, HardwareRule, Item, Line, OpeningKind } from '@framezen/engine'
import { formatCLP } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import { Card, EmptyState, Select, Skeleton } from '../../../ui'
import { LINE_KIND_LABEL } from '../model/labels'
import { itemUnitLabel } from '../model/prices'
import { SectionTitle } from '../parts'

const OPENING_LABEL: Record<OpeningKind, string> = {
  fixed: 'Paño fijo',
  casement: 'Abatir',
  tilt_turn: 'Oscilobatiente',
  tilt: 'Oscilante',
  awning: 'Proyectante',
  door: 'Puerta',
}

const PER_LABEL: Record<AccessoryRule['per'], string> = {
  window: 'por ventana',
  sash: 'por hoja',
  mullion: 'por travesaño',
  glass_m: 'por metro de vidrio',
  frame_m: 'por metro de marco',
  reinforcement_m: 'por metro de refuerzo',
  perimeter_m: 'por metro de perímetro',
}

function openingsText(rule: HardwareRule, line: Line): string {
  if (!rule.openings.length) return line.kind === 'sliding' ? 'Hoja móvil' : 'Toda hoja que abre'
  return rule.openings.map((o) => OPENING_LABEL[o] ?? o).join(', ')
}

function range(min?: number, max?: number): string | null {
  if (min === undefined && max === undefined) return null
  if (min !== undefined && max !== undefined) return `${formatNumber(Math.round(min))}–${formatNumber(Math.round(max))} mm`
  if (min !== undefined) return `desde ${formatNumber(Math.round(min))} mm`
  return `hasta ${formatNumber(Math.round(max!))} mm`
}

function sizeText(rule: HardwareRule): string {
  const parts = [range(rule.minHeight, rule.maxHeight) && `alto ${range(rule.minHeight, rule.maxHeight)}`, range(rule.minWidth, rule.maxWidth) && `ancho ${range(rule.minWidth, rule.maxWidth)}`].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Cualquier medida'
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

function qtyText(rule: HardwareRule): string {
  const base = formatNumber(rule.qty, 2)
  return rule.perStep ? `${base} + ${formatNumber(rule.perStep.qty, 2)} cada ${formatNumber(rule.perStep.stepMm)} mm` : base
}

/** Qué herrajes y accesorios lleva cada línea, según apertura y tamaño de la hoja. */
export function HardwareTab({
  catalog,
  loading,
  onEditPrice,
}: {
  catalog: Catalog | undefined
  loading: boolean
  onEditPrice: (item: Item) => void
}) {
  const brands = useMemo(() => new Map((catalog?.brands ?? []).map((b) => [b.id, b.name])), [catalog])
  const lines = useMemo(
    () =>
      [...(catalog?.lines ?? [])].sort(
        (a, b) =>
          (brands.get(a.brandId) ?? '').localeCompare(brands.get(b.brandId) ?? '', 'es') ||
          a.kind.localeCompare(b.kind) ||
          a.name.localeCompare(b.name, 'es', { numeric: true }),
      ),
    [catalog, brands],
  )
  const [lineId, setLineId] = useState<string | undefined>(undefined)
  // Por defecto, la primera línea verificada (la que más se usa para cotizar).
  const line = lines.find((l) => l.id === lineId) ?? lines.find((l) => l.completeness === 'verified') ?? lines[0]
  const items = useMemo(() => new Map((catalog?.items ?? []).map((i) => [i.id, i])), [catalog])
  const colorNames = useMemo(() => new Map((catalog?.colors ?? []).map((c) => [c.id, c.name])), [catalog])

  if (loading || !catalog) return <Skeleton className="h-80 rounded-lg" />
  if (!line) {
    return (
      <Card>
        <EmptyState size="compact" sketch="tilt_turn" title="Activa una marca de perfiles" description="Aquí verás qué herrajes y accesorios lleva cada línea, según la apertura y el tamaño de la hoja." />
      </Card>
    )
  }

  const hardware = [...line.hardwareRules].sort((a, b) => openingsText(a, line).localeCompare(openingsText(b, line), 'es') || (a.minHeight ?? 0) - (b.minHeight ?? 0))
  const missingHw = hardware.filter((r) => !(items.get(r.itemId)?.price ?? 0)).length
  const missingAcc = line.accessoryRules.filter((r) => !(items.get(r.itemId)?.price ?? 0)).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle
          title="Herrajes y accesorios por línea"
          description="Lo que el motor agrega solo a cada ventana: según la apertura y el alto o ancho de la hoja. Si un artículo no tiene precio, se cotiza en $0 y te avisamos."
        />
        <Select
          aria-label="Línea"
          value={line.id}
          onValueChange={setLineId}
          className="sm:w-72"
          options={lines.map((l) => ({ value: l.id, label: `${l.name}`, description: `${brands.get(l.brandId) ?? ''} · ${LINE_KIND_LABEL[l.kind]}` }))}
        />
      </div>

      <RuleSection
        title="Herrajes"
        subtitle={`${formatNumber(hardware.length)} reglas${missingHw ? ` · ${missingHw} sin precio` : ''}`}
        empty="Esta línea no trae reglas de herrajes propias: el motor usa los herrajes genéricos de Framezen."
        rows={hardware.map((rule) => {
          const item = items.get(rule.itemId)
          return {
            id: rule.id,
            item,
            itemId: rule.itemId,
            variants: variantsText(rule, items, colorNames),
            cells: [openingsText(rule, line), sizeText(rule), qtyText(rule)],
          }
        })}
        headers={[{ label: 'Apertura', wide: true }, { label: 'Tamaño de hoja', nowrap: true }, { label: 'Cantidad' }]}
        onEditPrice={onEditPrice}
      />

      <RuleSection
        title="Accesorios"
        subtitle={`${formatNumber(line.accessoryRules.length)} reglas${missingAcc ? ` · ${missingAcc} sin precio` : ''}`}
        empty="Esta línea no trae accesorios por regla."
        rows={line.accessoryRules.map((rule) => ({
          id: rule.id,
          item: items.get(rule.itemId),
          itemId: rule.itemId,
          variants: variantsText(rule, items, colorNames),
          cells: [`${formatNumber(rule.qty, 2)} ${PER_LABEL[rule.per] ?? ''}`],
        }))}
        headers={[{ label: 'Cantidad' }]}
        onEditPrice={onEditPrice}
      />
    </div>
  )
}

/** Nota atenuada con las variantes por color en el tooltip (y para lectores de pantalla). */
function VariantNote({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('shrink-0 text-meta leading-4 text-paper-600', className)} title={text}>
      · cambia con el color<span className="sr-only">: {text}</span>
    </span>
  )
}

interface RuleRow {
  id: string
  item: Item | undefined
  itemId: string
  /** Artículo que se usa en otros colores de ventana (tooltip); vacío = el mismo en todos. */
  variants?: string
  cells: string[]
}

/**
 * Columna de datos. `wide`: columna ancha (aperturas) que parte línea en vez de quitarle espacio al
 * artículo; `nowrap`: nunca parte línea (medidas). El resto parte línea solo si la tabla es angosta.
 * Los cortes usan el ancho de la tabla (container queries), no el de la pantalla: así responden igual
 * con la barra lateral abierta o cerrada.
 */
interface RuleColumn {
  label: string
  wide?: boolean
  nowrap?: boolean
}

function RuleSection({
  title,
  subtitle,
  empty,
  rows,
  headers,
  onEditPrice,
}: {
  title: string
  subtitle: string
  empty: string
  rows: RuleRow[]
  headers: RuleColumn[]
  onEditPrice: (item: Item) => void
}) {
  return (
    <section className="@container overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
      <header className="flex items-baseline justify-between gap-3 border-b border-paper-200 px-4 py-3">
        <h3 className="font-semibold text-paper-900">{title}</h3>
        <span className="text-[13px] text-paper-600">{subtitle}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-paper-600">{empty}</p>
      ) : (
        <div className="scrollbar-quiet overflow-x-auto">
          <table className="w-full min-w-[640px] text-table">
            <thead>
              <tr className="h-9 border-b border-paper-200 bg-paper-50 text-meta text-paper-600">
                <th scope="col" className="px-4 text-left font-medium">
                  Artículo
                </th>
                {headers.map((h) => (
                  <th key={h.label} scope="col" className={cn('px-3 text-left font-medium whitespace-nowrap', h.wide && 'w-[112px] min-w-[112px] @min-[1000px]:w-[180px] @min-[1000px]:min-w-[180px]')}>
                    {h.label}
                  </th>
                ))}
                <th scope="col" className="px-4 text-right font-medium">Precio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const price = row.item?.price ?? 0
                return (
                  <tr key={row.id} className="h-10 border-b border-paper-200 last:border-b-0">
                    {/* El artículo se lleva el espacio que sobra: es lo que se lee. En tablas angostas el código va debajo del nombre. */}
                    <td className="w-full min-w-[220px] max-w-0 px-4 py-1.5 @min-[1000px]:min-w-[260px] @min-[1000px]:py-0">
                      <span className="flex min-w-0 flex-col-reverse @min-[1000px]:flex-row @min-[1000px]:items-baseline @min-[1000px]:gap-2">
                        {/* «Cambia con el color»: junto al código en tablas angostas (no le quita espacio al nombre) y tras el nombre en las anchas. */}
                        {row.item?.code || row.variants ? (
                          <span className="flex min-w-0 items-baseline gap-1.5 @min-[1000px]:shrink-0">
                            {row.item?.code ? (
                              <span className="truncate font-mono text-[11px] leading-4 text-paper-600 @min-[1000px]:text-[12px]">{row.item.code}</span>
                            ) : null}
                            {row.variants ? <VariantNote text={row.variants} className="@min-[1000px]:hidden" /> : null}
                          </span>
                        ) : null}
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-paper-900" title={row.item?.name}>
                            {row.item?.name ?? 'Artículo que ya no está en el catálogo'}
                          </span>
                          {row.variants ? <VariantNote text={row.variants} className="hidden @min-[1000px]:inline" /> : null}
                        </span>
                      </span>
                    </td>
                    {row.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={cn(
                          'px-3 py-1.5 leading-[18px] text-paper-900 tabular @min-[1000px]:py-2',
                          headers[i]?.nowrap ? 'whitespace-nowrap' : !headers[i]?.wide && '@min-[800px]:whitespace-nowrap',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                    <td className="px-4 text-right whitespace-nowrap">
                      {row.item ? (
                        <button
                          type="button"
                          onClick={() => onEditPrice(row.item!)}
                          className={cn(
                            'group inline-flex items-center gap-1 rounded-xs tabular hover:text-ink-700',
                            price > 0 ? 'text-paper-900' : 'text-warn-600',
                          )}
                          title={`Cambiar precio (${itemUnitLabel(row.item)})`}
                        >
                          {price > 0 ? formatCLP(price) : 'Sin precio'}
                          <ArrowUpRight aria-hidden className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.75} />
                        </button>
                      ) : (
                        <span className="text-paper-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
