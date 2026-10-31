import { useMemo, useRef, useState } from 'react'
import type { Brand, BrandSettings, Catalog, MaterialCost } from '@framezen/engine'
import { DEFAULT_PRICING, formatCLP, formatMeters, formatPct } from '@framezen/engine'
import { useSettings } from '../../../lib/hooks'
import { formatMMUnit, formatNumber } from '../../../lib/format'
import { cn } from '../../../lib/cn'
import { Badge, NumberField, SaveIndicator, Sheet, SheetContent } from '../../../ui'
import { usePatchBrand, type BrandPatch, type CatalogBrandSummary } from '../api'
import { barExample, brandExample } from '../model/brandExample'
import { DISCOUNT_FAMILIES, type DiscountFamily } from '../model/labels'
import { Monogram } from '../parts'
import { useAutosave } from '../useAutosave'

export function BrandSettingsSheet({
  summary,
  siblings,
  catalog,
  onOpenChange,
}: {
  summary: CatalogBrandSummary | null
  /** Todas las marcas (para el mismo monograma que en la lista). */
  siblings?: readonly Brand[]
  catalog: Catalog | undefined
  onOpenChange: (open: boolean) => void
}) {
  // Conserva la última marca mientras la hoja se cierra (animación de salida).
  const last = useRef(summary)
  if (summary) last.current = summary
  const shown = summary ?? last.current
  return (
    <Sheet open={Boolean(summary)} onOpenChange={onOpenChange}>
      {shown ? (
        <SheetContent
          width={580}
          title={
            <span className="flex items-center gap-2.5">
              <Monogram brand={shown.brand} siblings={siblings} size={28} />
              Mis precios · {shown.brand.name}
            </span>
          }
          description="Tus condiciones con esta marca. Se aplican al cotizar desde ahora y al recalcular."
        >
          <BrandSettingsForm key={shown.brand.id} summary={shown} catalog={catalog} />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

const FAMILY_ROWS: { key: keyof MaterialCost; label: string }[] = [
  { key: 'profiles', label: 'Perfiles' },
  { key: 'reinforcement', label: 'Refuerzos' },
  { key: 'hardware', label: 'Herrajes' },
  { key: 'glass', label: 'Vidrio' },
  { key: 'accessories', label: 'Accesorios' },
]

function BrandSettingsForm({ summary, catalog }: { summary: CatalogBrandSummary; catalog: Catalog | undefined }) {
  const settingsQuery = useSettings()
  const patch = usePatchBrand()
  const [draft, setDraft] = useState<BrandSettings>(summary.settings)
  const changes = useRef<BrandPatch['settings']>({})
  const autosave = useAutosave<BrandPatch['settings']>((value) => patch.mutateAsync({ id: summary.brand.id, patch: { settings: value } }), 500, `brand:${summary.brand.id}`)

  const update = (next: Partial<BrandSettings>, sent: NonNullable<BrandPatch['settings']>) => {
    setDraft((d) => ({ ...d, ...next, discounts: { ...d.discounts, ...next.discounts } }))
    const prev = changes.current ?? {}
    changes.current = { ...prev, ...sent, discounts: { ...prev.discounts, ...sent.discounts } }
    autosave.schedule(changes.current)
  }

  const setDiscount = (key: DiscountFamily, value: number | null) => {
    const v = Math.min(100, Math.max(0, value ?? 0))
    update({ discounts: { ...draft.discounts, [key]: v } }, { discounts: { [key]: v } })
  }

  const pricing = settingsQuery.data?.pricing ?? DEFAULT_PRICING
  const orgKerf = settingsQuery.data?.cut.kerf ?? 4
  const example = useMemo(
    () => (catalog ? brandExample(catalog, draft, pricing, settingsQuery.data?.defaults) : null),
    [catalog, draft, pricing, settingsQuery.data?.defaults],
  )
  const bar = useMemo(() => barExample(draft.trim, Math.max(draft.kerf, orgKerf)), [draft.trim, draft.kerf, orgKerf])
  const sample = useMemo(() => sampleProfile(catalog, summary.brand.id), [catalog, summary.brand.id])
  const sameDiscount = DISCOUNT_FAMILIES.every((f) => draft.discounts[f.key] === draft.discounts.profiles)

  return (
    <div className="flex flex-col gap-7">
      <div className="-mt-1 flex items-center justify-between gap-3">
        <p className="text-[13px] text-paper-600">Se guarda solo mientras escribes.</p>
        <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} />
      </div>

      {example ? <ExampleCard example={example} marginPct={pricing.marginPct} /> : (
        <div className="rounded-md border border-dashed border-paper-200 bg-paper-50 px-4 py-4 text-[13px] leading-[18px] text-paper-600">
          {summary.enabled
            ? 'Esta marca no trae líneas de ventanas: sus descuentos se aplican a los artículos que uses de ella en cualquier ventana.'
            : 'Activa la marca para ver aquí cuánto cuesta una ventana típica con tus condiciones.'}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold text-paper-900">Descuentos de compra</h3>
          <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">Lo que te descuenta tu distribuidor sobre la lista. Tu costo = lista × (1 − descuento).</p>
        </div>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {DISCOUNT_FAMILIES.map((family) => (
            <label key={family.key} className="flex items-center justify-between gap-3 rounded-md border border-paper-200 px-3 py-2">
              <span className="min-w-0">
                <span className="block font-medium text-paper-900">{family.label}</span>
                <span className="block truncate text-meta text-paper-600">{family.help}</span>
              </span>
              <NumberField
                aria-label={`Descuento en ${family.label.toLowerCase()}`}
                value={draft.discounts[family.key] ?? 0}
                onChange={(v) => setDiscount(family.key, v)}
                unit="%"
                min={0}
                max={100}
                step={1}
                bigStep={5}
                className="w-24 shrink-0"
              />
            </label>
          ))}
          {!sameDiscount && draft.discounts.profiles > 0 ? (
            <button
              type="button"
              onClick={() => {
                const v = draft.discounts.profiles
                const all = { profiles: v, reinforcement: v, hardware: v, glass: v, accessories: v }
                update({ discounts: all }, { discounts: all })
              }}
              className="flex items-center justify-center rounded-md border border-dashed border-paper-350/60 px-3 py-2 text-[13px] font-medium text-ink-600 transition-colors duration-120 hover:border-ink-500 hover:bg-ink-50"
            >
              Usar {formatPct(draft.discounts.profiles)} en todas las familias
            </button>
          ) : null}
        </div>
        {sample && draft.discounts.profiles > 0 ? (
          <p className="text-[13px] leading-[18px] text-paper-600">
            Por ejemplo, la barra de {sample.name} ({sample.code}) cuesta {formatCLP(sample.price)} de lista y te queda en{' '}
            <strong className="font-medium text-paper-900">{formatCLP(Math.round(sample.price * (1 - draft.discounts.profiles / 100)))}</strong>.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold text-paper-900">Margen en esta marca</h3>
          <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">
            Suma o resta puntos a tu margen general ({formatPct(pricing.marginPct)}) solo en ventanas de {summary.brand.name}. Déjalo en 0 si no lo necesitas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <NumberField
            aria-label="Ajuste de margen en puntos"
            value={draft.marginAdjust ?? 0}
            onChange={(v) => {
              const value = v === null || v === 0 ? null : Math.max(-50, Math.min(50, v))
              update({ marginAdjust: value ?? undefined }, { marginAdjust: value })
            }}
            unit="pts"
            min={-50}
            max={50}
            step={1}
            bigStep={5}
            className="w-28"
          />
          <span className="text-[13px] text-paper-600">
            Margen efectivo: <strong className="font-medium text-paper-900 tabular">{formatPct(Math.max(0, pricing.marginPct + (draft.marginAdjust ?? 0)))}</strong>
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold text-paper-900">Corte de barras</h3>
          <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">
            El despunte se pierde al inicio de cada barra y el disco en cada corte. Cambian cuántas piezas salen de una barra y lo que compras.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-paper-900">Despunte</span>
            <NumberField
              aria-label="Despunte"
              value={draft.trim}
              onChange={(v) => update({ trim: Math.max(0, Math.min(500, v ?? 0)) }, { trim: Math.max(0, Math.min(500, v ?? 0)) })}
              min={0}
              max={500}
              step={5}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-paper-900">Corte de sierra</span>
            <NumberField
              aria-label="Corte de sierra"
              value={draft.kerf}
              onChange={(v) => update({ kerf: Math.max(0, Math.min(20, v ?? 0)) }, { kerf: Math.max(0, Math.min(20, v ?? 0)) })}
              min={0}
              max={20}
              step={1}
            />
          </label>
        </div>
        <BarDiagram bar={bar} />
        <p className="text-[13px] leading-[18px] text-paper-600">
          De una barra de {formatMeters(bar.barLength)} salen <strong className="font-medium text-paper-900">{bar.pieces} piezas de {formatMMUnit(bar.piece)}</strong> y
          sobran {formatMMUnit(bar.remainder)}.
          {orgKerf > draft.kerf ? ` Usamos el disco de ${formatMMUnit(orgKerf)} de Ajustes › Taller porque es mayor: así nunca falta material.` : null}
        </p>
      </section>
    </div>
  )
}

function sampleProfile(catalog: Catalog | undefined, brandId: string) {
  if (!catalog) return null
  const lineIds = new Set(catalog.lines.filter((l) => l.brandId === brandId).map((l) => l.id))
  const order = ['frame', 'sash', 'sliding_frame', 'sliding_sash']
  const candidates = catalog.profiles.filter((p) => lineIds.has(p.lineId) && Object.values(p.priceByColor).some((v) => v > 0))
  candidates.sort((a, b) => (order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99))
  const p = candidates[0]
  if (!p) return null
  const price = p.priceByColor.blanco ?? Object.values(p.priceByColor).find((v) => v > 0) ?? 0
  return { code: p.code, name: p.name.toLowerCase(), price }
}

function ExampleCard({ example, marginPct }: { example: NonNullable<ReturnType<typeof brandExample>>; marginPct: number }) {
  const { list, mine } = example
  const savedMaterial = list.materialsTotal - mine.materialsTotal
  const priceDrop = list.unitNet > 0 ? ((list.unitNet - mine.unitNet) / list.unitNet) * 100 : 0
  const missing = mine.warnings.filter((w) => w.code === 'price_missing')
  return (
    <section aria-label="Ejemplo en vivo" className="overflow-hidden rounded-lg border border-paper-200">
      <header className="flex items-start justify-between gap-3 bg-paper-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-meta font-medium text-ink-700">Ejemplo en vivo</p>
          <p className="mt-0.5 font-medium text-paper-900">{example.title}</p>
          <p className="text-[13px] text-paper-600">
            {example.lineName} · {example.colorName} · {example.glassName}
          </p>
        </div>
        {savedMaterial > 0 ? (
          <Badge tone="ok" className="mt-0.5">
            −{formatPct(priceDrop)} en el precio
          </Badge>
        ) : null}
      </header>
      <table className="w-full text-table">
        <thead>
          <tr className="border-y border-paper-200 text-meta text-paper-600">
            <th scope="col" className="px-4 py-1.5 text-left font-medium">Material por ventana</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">Lista</th>
            <th scope="col" className="px-4 py-1.5 text-right font-medium">Con tus descuentos</th>
          </tr>
        </thead>
        <tbody>
          {FAMILY_ROWS.filter((r) => list.materials[r.key] > 0 || mine.materials[r.key] > 0).map((row) => (
            <tr key={row.key} className="border-b border-paper-200/70">
              <th scope="row" className="px-4 py-1.5 text-left font-normal text-paper-900">{row.label}</th>
              <td className="px-3 py-1.5 text-right text-paper-600 tabular">{formatCLP(list.materials[row.key])}</td>
              <td className={cn('px-4 py-1.5 text-right tabular', mine.materials[row.key] < list.materials[row.key] ? 'font-medium text-ok-800' : 'text-paper-900')}>
                {formatCLP(mine.materials[row.key])}
              </td>
            </tr>
          ))}
          <tr className="border-b border-paper-200">
            <th scope="row" className="px-4 py-1.5 text-left font-medium text-paper-900">Total material</th>
            <td className="px-3 py-1.5 text-right text-paper-600 tabular">{formatCLP(list.materialsTotal)}</td>
            <td className="px-4 py-1.5 text-right font-medium text-paper-900 tabular">{formatCLP(mine.materialsTotal)}</td>
          </tr>
          <tr className="bg-paper-50">
            <th scope="row" className="px-4 py-2.5 text-left font-semibold text-paper-900">Precio de venta</th>
            <td className="px-3 py-2.5 text-right text-paper-600 tabular">{formatCLP(list.unitNet)}</td>
            <td className="px-4 py-2.5 text-right text-lead font-semibold text-paper-900 tabular">{formatCLP(mine.unitNet)}</td>
          </tr>
        </tbody>
      </table>
      <p className="border-t border-paper-200 px-4 py-2.5 text-[13px] leading-[18px] text-paper-600">
        {savedMaterial > 0
          ? `Tu precio de venta sale de tu costo: con estos descuentos ahorras ${formatCLP(savedMaterial)} de material por ventana y cotizas más competitivo manteniendo tu margen de ${formatPct(mine.targetMarginPct)}.`
          : `Sin descuentos, cotizas con el precio de lista y tu margen de ${formatPct(marginPct)}. Neto, sin IVA.`}
        {missing.length ? ` ${missing[0].message}` : ''}
      </p>
    </section>
  )
}

/** Barra de 5,8 m dibujada con despunte, piezas, cortes de disco y sobrante. */
function BarDiagram({ bar }: { bar: ReturnType<typeof barExample> }) {
  const W = 520
  const H = 34
  const sx = (mm: number) => (mm / bar.barLength) * W
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label={`Barra de ${formatNumber(bar.barLength)} mm con ${bar.pieces} piezas`}>
      <defs>
        <pattern id="fz-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--paper-350)" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width={W - 1} height={H} rx="3" fill="var(--paper-0)" stroke="var(--paper-350)" />
      {bar.trim > 0 ? <rect x="1" y="1" width={Math.max(2, sx(bar.trim))} height={H - 1} fill="url(#fz-hatch)" /> : null}
      {bar.offsets.map((offset, i) => (
        <g key={i}>
          <rect x={sx(offset) + 1} y="4" width={Math.max(1, sx(bar.piece) - 2)} height={H - 7} rx="2" fill="var(--ink-50)" stroke="var(--ink-500)" strokeWidth="1" />
          <text x={sx(offset + bar.piece / 2)} y={H / 2 + 4} textAnchor="middle" fontSize="11" fill="var(--ink-700)" className="tabular">
            {formatNumber(bar.piece)}
          </text>
          <rect x={sx(offset + bar.piece)} y="1" width={Math.max(1.5, sx(bar.kerf))} height={H - 1} fill="var(--bad-600)" opacity="0.7" />
        </g>
      ))}
      {bar.remainder > 0 ? (
        <rect x={W - sx(bar.remainder)} y="1" width={Math.max(1, sx(bar.remainder) - 1)} height={H - 1} fill="url(#fz-hatch)" opacity="0.8" />
      ) : null}
      <g fontSize="10.5" fill="var(--paper-600)">
        <text x="0" y={H + 14}>{bar.trim > 0 ? `despunte ${formatNumber(bar.trim)}` : 'sin despunte'}</text>
        <text x={W / 2} y={H + 14} textAnchor="middle" fill="var(--bad-600)">
          disco {formatNumber(bar.kerf, 1)} mm por corte
        </text>
        <text x={W} y={H + 14} textAnchor="end">sobra {formatNumber(bar.remainder)}</text>
      </g>
    </svg>
  )
}

