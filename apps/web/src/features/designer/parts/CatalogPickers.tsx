/**
 * Selectores del catálogo: línea (agrupada por marca, con búsqueda) y vidrio (agrupado por tipo,
 * con su composición). Los nombres del catálogo no se traducen; los grupos y textos de ayuda sí.
 */
import { useMemo } from 'react'
import { AppWindow, PanelsLeftRight } from 'lucide-react'
import type { Catalog, Line, LineKind } from '@dekopen/engine'
import { translate, useLocale, useT } from '../../../lib/i18n'
import es from '../i18n/es'
import { brandName, findLine, glassComposition, glassGroups, lineDetail, linesByBrand } from '../lib/catalog'
import { GlassGlyph } from './Glyphs'
import { SearchPicker, type PickerGroup } from './SearchPicker'

export function LineIcon({ kind }: { kind: LineKind }) {
  const Icon = kind === 'sliding' ? PanelsLeftRight : AppWindow
  return <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
}

/** ¿La línea trae precio de marco? Si no, cotizarla deja el total por confirmar: se dice antes de elegirla. */
function linePriced(line: Line, catalog: Catalog): boolean {
  const frameId = line.profiles?.frame ?? line.profiles?.sliding_frame
  const frame = catalog.profiles?.find((p) => p.id === frameId)
  return Object.values(frame?.priceByColor ?? {}).some((price) => price > 0)
}

export function lineGroups(catalog: Catalog, filter?: (line: Line) => boolean, currentKind?: LineKind): PickerGroup[] {
  return linesByBrand(catalog, filter).map((g) => ({
    id: g.brandId,
    heading: g.brandName,
    items: g.lines.map((line) => ({
      value: line.id,
      label: line.name,
      hint: line.description || lineDetail(line),
      keywords: [line.kind === 'sliding' ? 'corredera sliding' : 'practicable casement', lineDetail(line)],
      leading: <LineIcon kind={line.kind} />,
      badge:
        currentKind && line.kind !== currentKind ? (
          <span className="shrink-0 rounded-xs bg-hover px-1.5 py-0.5 text-micro text-fg-muted">
            {translate(es, line.kind === 'sliding' ? 'pickers.toSliding' : 'pickers.toCasement')}
          </span>
        ) : !linePriced(line, catalog) ? (
          <span className="shrink-0 text-micro text-fg-muted">{translate(es, 'pickers.noPrices')}</span>
        ) : undefined,
    })),
  }))
}

export function glassPickerGroups(catalog: Catalog): PickerGroup[] {
  return glassGroups(catalog).map((g) => ({
    id: g.kind,
    heading: g.label,
    items: g.items.map((glass) => ({
      value: glass.id,
      label: glass.name,
      hint: glass.composition || (glass.thickness ? `${glass.thickness} mm` : undefined),
      keywords: [glassComposition(glass) ?? ''],
    })),
  }))
}

export interface LinePickerProps {
  catalog: Catalog
  value: string | undefined
  onChange: (lineId: string) => void
  /** Solo estas líneas (p. ej. las que fabrican la tipología elegida). */
  filter?: (line: Line) => boolean
  /** Marca las líneas de otro tipo («A corredera»): cambiar convierte el diseño. */
  currentKind?: LineKind
  /** Muestra la marca junto al nombre en el botón (por defecto no: suele ir como dato aparte). */
  showBrand?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

export function LinePicker({ catalog, value, onChange, filter, currentKind, showBrand = false, size, className, id, ...aria }: LinePickerProps) {
  const t = useT(es)
  const { locale } = useLocale()
  // El idioma entra en la memoria: los grupos llevan textos traducidos (tipo de línea, cámaras).
  const groups = useMemo(() => lineGroups(catalog, filter, currentKind), [catalog, filter, currentKind, locale])
  const line = findLine(catalog, value)
  const brand = brandName(catalog, line?.brandId)
  return (
    <SearchPicker
      id={id}
      value={value}
      onChange={onChange}
      groups={groups}
      size={size}
      className={className}
      placeholder={catalog.lines.length ? t('pickers.linePlaceholder') : t('pickers.noLines')}
      searchPlaceholder={t('pickers.searchLine')}
      emptyText={t('pickers.noLineMatch')}
      aria-label={aria['aria-label'] ?? t('pickers.line')}
      aria-describedby={aria['aria-describedby']}
      display={
        line ? (
          <>
            <LineIcon kind={line.kind} />
            <span className={brand && showBrand ? 'max-w-[72%] shrink-0 truncate' : 'min-w-0 truncate'}>{line.name}</span>
            {brand && showBrand ? <span className="min-w-0 truncate text-fg-muted">· {brand}</span> : null}
          </>
        ) : undefined
      }
    />
  )
}

export interface GlassPickerProps {
  catalog: Catalog
  value: string | undefined
  onChange: (glassId: string) => void
  /** Opción «Igual que la ventana» (vidrio por paño). */
  inherit?: { label: string; hint?: string; active: boolean; onSelect: () => void }
  size?: 'sm' | 'md' | 'lg'
  className?: string
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

export function GlassPicker({ catalog, value, onChange, inherit, size, className, id, ...aria }: GlassPickerProps) {
  const t = useT(es)
  const { locale } = useLocale()
  const groups = useMemo(() => glassPickerGroups(catalog), [catalog, locale])
  const glass = catalog.glass.find((g) => g.id === value)
  const shown = inherit?.active ? inherit.label : glass?.name
  const composition = !inherit?.active && glass ? glassComposition(glass) : null
  return (
    <SearchPicker
      id={id}
      value={value}
      onChange={onChange}
      groups={groups}
      size={size}
      className={className}
      placeholder={catalog.glass.length ? t('pickers.glassPlaceholder') : t('pickers.noGlass')}
      searchPlaceholder={t('pickers.searchGlass')}
      emptyText={t('pickers.noGlassMatch')}
      aria-label={aria['aria-label'] ?? t('pickers.glass')}
      aria-describedby={aria['aria-describedby']}
      leadingItem={inherit ? { value: '__inherit__', label: inherit.label, hint: inherit.hint, active: inherit.active, onSelect: inherit.onSelect } : undefined}
      display={
        shown ? (
          <>
            <GlassGlyph size={16} className="shrink-0 text-fg-muted" />
            <span className="min-w-0 truncate">{shown}</span>
            {composition && !glass?.name.includes(composition) ? <span className="dim shrink-0 text-meta text-fg-muted">{composition}</span> : null}
          </>
        ) : undefined
      }
    />
  )
}
