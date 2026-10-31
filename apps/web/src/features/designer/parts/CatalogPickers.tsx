/**
 * Selectores del catálogo: línea (agrupada por marca, con búsqueda) y vidrio (agrupado por tipo).
 */
import { useMemo } from 'react'
import { AppWindow, PanelsLeftRight } from 'lucide-react'
import type { Catalog, Line, LineKind } from '@framezen/engine'
import { brandName, findLine, glassGroups, lineDetail, linesByBrand } from '../lib/catalog'
import { GlassGlyph } from './Glyphs'
import { SearchPicker, type PickerGroup } from './SearchPicker'

export function LineIcon({ kind }: { kind: LineKind }) {
  const Icon = kind === 'sliding' ? PanelsLeftRight : AppWindow
  return <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-paper-600" />
}

export function lineGroups(catalog: Catalog, filter?: (line: Line) => boolean, currentKind?: LineKind): PickerGroup[] {
  return linesByBrand(catalog, filter).map((g) => ({
    id: g.brandId,
    heading: g.brandName,
    items: g.lines.map((line) => ({
      value: line.id,
      label: line.name,
      hint: line.description || lineDetail(line),
      keywords: [line.kind === 'sliding' ? 'corredera' : 'practicable'],
      leading: <LineIcon kind={line.kind} />,
      badge:
        currentKind && line.kind !== currentKind ? (
          <span className="shrink-0 rounded-xs bg-paper-100 px-1.5 text-[11px] leading-[18px] text-paper-600">
            {line.kind === 'sliding' ? 'A corredera' : 'A practicable'}
          </span>
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
  const groups = useMemo(() => lineGroups(catalog, filter, currentKind), [catalog, filter, currentKind])
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
      placeholder={catalog.lines.length ? 'Elige una línea' : 'Sin líneas en tu catálogo'}
      searchPlaceholder="Buscar línea o marca…"
      emptyText="Ninguna línea coincide."
      aria-label={aria['aria-label'] ?? 'Línea'}
      aria-describedby={aria['aria-describedby']}
      display={
        line ? (
          <>
            <LineIcon kind={line.kind} />
            <span className={brand && showBrand ? 'max-w-[72%] shrink-0 truncate' : 'min-w-0 truncate'}>{line.name}</span>
            {brand && showBrand ? <span className="min-w-0 truncate text-paper-600">· {brand}</span> : null}
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
  const groups = useMemo(() => glassPickerGroups(catalog), [catalog])
  const glass = catalog.glass.find((g) => g.id === value)
  const shown = inherit?.active ? inherit.label : glass?.name
  return (
    <SearchPicker
      id={id}
      value={value}
      onChange={onChange}
      groups={groups}
      size={size}
      className={className}
      placeholder={catalog.glass.length ? 'Elige un vidrio' : 'Sin vidrios en tu catálogo'}
      searchPlaceholder="Buscar vidrio…"
      emptyText="Ningún vidrio coincide."
      aria-label={aria['aria-label'] ?? 'Vidrio'}
      aria-describedby={aria['aria-describedby']}
      leadingItem={inherit ? { value: '__inherit__', label: inherit.label, hint: inherit.hint, active: inherit.active, onSelect: inherit.onSelect } : undefined}
      display={
        shown ? (
          <>
            <GlassGlyph size={16} className="shrink-0 text-paper-600" />
            <span className="truncate">{shown}</span>
          </>
        ) : undefined
      }
    />
  )
}
