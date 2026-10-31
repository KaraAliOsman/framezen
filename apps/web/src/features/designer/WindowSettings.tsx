/**
 * Ajustes de la ventana completa: medidas, línea (agrupada por marca), color exterior/interior,
 * vidrio general, forma y extras. Cada control aplica al instante con un texto para deshacer;
 * nada es obligatorio y nada bloquea (el motor avisa si algo no calza).
 */
import { useId, useMemo, type ReactNode } from 'react'
import {
  collectLeaves,
  setColor,
  setGlass,
  setLine,
  setShape,
  setSize,
  type Catalog,
  type Shape,
  type WindowDesign,
} from '@framezen/engine'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { ColorSwatchGroup } from '../../ui/ColorSwatch'
import { MeasureField } from './parts/MeasureField'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Switch } from '../../ui/Switch'
import { setPanelCount, setRails } from './lib/actions'
import { findLine, glassName, lineColors } from './lib/catalog'
import { GlassPicker, LinePicker } from './parts/CatalogPickers'

export interface WindowSettingsProps {
  design: WindowDesign
  catalog: Catalog
  onChange: (next: WindowDesign, label: string) => void
  className?: string
}

export function SettingsSection({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2.5 border-b border-paper-200 py-4 first:pt-0 last:border-b-0 last:pb-0', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-paper-900">{title}</h3>
        {aside ? <div className="min-w-0 truncate text-[12px] text-paper-600">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

type ShapeKind = Shape['kind']

const SHAPE_OPTIONS: { value: ShapeKind; label: string }[] = [
  { value: 'rect', label: 'Recta' },
  { value: 'arch', label: 'Arco' },
  { value: 'trapezoid', label: 'Irregular' },
  { value: 'triangle', label: 'Triángulo' },
]

function defaultShape(kind: ShapeKind, design: WindowDesign): Shape | undefined {
  switch (kind) {
    case 'arch':
      return { kind: 'arch', rise: Math.min(design.width / 2, design.height) }
    case 'trapezoid':
      return { kind: 'trapezoid', leftHeight: Math.round(design.height / 2), rightHeight: design.height }
    case 'triangle':
      return { kind: 'triangle', apex: 'center' }
    default:
      return undefined
  }
}

export function WindowSettings({ design, catalog, onChange, className }: WindowSettingsProps) {
  const uid = useId()
  const line = findLine(catalog, design.lineId)
  const colors = lineColors(catalog, design.lineId)
  const bicolor = Boolean(design.colorInId && design.colorInId !== design.colorId)
  const root = design.root
  const sliding = root?.type === 'sliding'
  const ownGlass = useMemo(() => {
    if (!root) return 0
    if (root.type === 'sliding') return root.panels.filter((p) => p.glassId && p.glassId !== design.glassId).length
    return collectLeaves(root).filter((l) => l.glassId && l.glassId !== design.glassId).length
  }, [root, design.glassId])
  const leaves = root && root.type !== 'sliding' ? collectLeaves(root) : []
  const hasDoor = leaves.some((l) => l.opening?.kind === 'door')
  const shapeKind: ShapeKind = design.shape?.kind ?? 'rect'
  const canShape = !sliding
  const colorName = (id?: string) => catalog.colors.find((c) => c.id === id)?.name

  const emit = (next: WindowDesign, label: string) => {
    if (next !== design) onChange(next, label)
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <SettingsSection title="Medidas" aside={`${formatNumber(((design.width * design.height) / 1e6) || 0, 2)} m²`}>
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12px] text-paper-600">Ancho</span>
            <MeasureField
              aria-label="Ancho"
              value={design.width}
              min={100}
              max={20000}
              onChange={(width) => width && emit(setSize(design, { width }), 'Cambiar ancho')}
              onSizeInput={(s) => emit(setSize(design, s), 'Cambiar medidas')}
            />
          </label>
          <span aria-hidden className="mt-5 text-paper-350">
            ×
          </span>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12px] text-paper-600">Alto</span>
            <MeasureField
              aria-label="Alto"
              value={design.height}
              min={100}
              max={20000}
              onChange={(height) => height && emit(setSize(design, { height }), 'Cambiar alto')}
              onSizeInput={(s) => emit(setSize(design, s), 'Cambiar medidas')}
            />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title="Línea" aside={line ? catalog.brands.find((b) => b.id === line.brandId)?.name : undefined}>
        <LinePicker
          catalog={catalog}
          value={design.lineId || undefined}
          currentKind={sliding ? 'sliding' : root ? 'casement' : undefined}
          onChange={(lineId) => {
            const name = findLine(catalog, lineId)?.name
            emit(setLine(design, lineId, catalog), name ? `Línea ${name}` : 'Cambiar línea')
          }}
        />
        {line?.completeness === 'partial' ? (
          <p className="text-[12px] leading-4 text-paper-600">Esta línea tiene datos parciales: se cotiza igual y te avisamos lo que falte.</p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Color" aside={bicolor ? `${colorName(design.colorId) ?? ''} / ${colorName(design.colorInId) ?? ''}` : colorName(design.colorId)}>
        <div className="flex flex-col gap-1.5">
          {bicolor ? <span className="text-[12px] text-paper-600">Exterior</span> : null}
          <ColorSwatchGroup
            aria-label={bicolor ? 'Color exterior' : 'Color'}
            value={design.colorId}
            colors={colors}
            onValueChange={(id) => emit(setColor(design, id, bicolor ? design.colorInId : undefined), `Color ${colorName(id) ?? ''}`.trim())}
          />
        </div>
        {bicolor ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-paper-600">Interior</span>
            <ColorSwatchGroup
              aria-label="Color interior"
              value={design.colorInId}
              colors={colors}
              onValueChange={(id) => emit(setColor(design, design.colorId, id), `Interior ${colorName(id) ?? ''}`.trim())}
            />
          </div>
        ) : null}
        <Switch
          size="sm"
          label="Interior de otro color"
          checked={bicolor}
          onCheckedChange={(on) => {
            if (on) {
              const other = colors.find((c) => c.id !== design.colorId && /blanc|white/i.test(`${c.id} ${c.name}`)) ?? colors.find((c) => c.id !== design.colorId)
              if (other) emit(setColor(design, design.colorId, other.id), 'Bicolor')
            } else emit(setColor(design, design.colorId), 'Un solo color')
          }}
        />
      </SettingsSection>

      <SettingsSection title="Vidrio" aside={ownGlass ? `${ownGlass} ${ownGlass === 1 ? 'paño' : 'paños'} con vidrio propio` : undefined}>
        <GlassPicker
          id={`${uid}-glass`}
          catalog={catalog}
          value={design.glassId || undefined}
          onChange={(glassId) => emit(setGlass(design, null, glassId), `Vidrio ${glassName(catalog, glassId) ?? ''}`.trim())}
          aria-describedby={ownGlass ? `${uid}-glass-hint` : undefined}
        />
        {ownGlass ? (
          <p id={`${uid}-glass-hint`} className="text-[12px] leading-4 text-paper-600">
            Al cambiarlo aquí, todos los paños quedan con este vidrio.
          </p>
        ) : null}
      </SettingsSection>

      {sliding && root?.type === 'sliding' ? (
        <SettingsSection title="Corredera" aside={`${root.panels.length} hojas · ${root.rails === 1 ? 'monorriel' : `${root.rails} rieles`}`}>
          <div className="grid grid-cols-[64px_1fr] items-center gap-x-3 gap-y-2">
            <span className="text-[12px] text-paper-600">Hojas</span>
            <SegmentedControl
              aria-label="Número de hojas"
              size="sm"
              block
              value={String(Math.min(4, Math.max(2, root.panels.length)))}
              onValueChange={(v) => {
                const change = setPanelCount(design, Number(v))
                if (change) onChange(change.design, change.label)
              }}
              options={['2', '3', '4'].map((v) => ({ value: v, label: v }))}
            />
            <span className="text-[12px] text-paper-600">Rieles</span>
            <SegmentedControl
              aria-label="Rieles"
              size="sm"
              block
              value={String(root.rails)}
              onValueChange={(v) => {
                const change = setRails(design, Number(v) as 1 | 2 | 3)
                if (change) onChange(change.design, change.label)
              }}
              options={[
                { value: '1', label: 'Mono' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
              ]}
            />
          </div>
        </SettingsSection>
      ) : null}

      {canShape ? (
        <SettingsSection title="Forma">
          <SegmentedControl
            aria-label="Forma"
            size="sm"
            block
            value={shapeKind}
            onValueChange={(kind) => emit(setShape(design, defaultShape(kind, design)), kind === 'rect' ? 'Forma recta' : `Forma: ${SHAPE_OPTIONS.find((o) => o.value === kind)?.label.toLowerCase()}`)}
            options={SHAPE_OPTIONS}
          />
          {design.shape?.kind === 'arch' ? (
            <label className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-paper-600">Flecha del arco</span>
              <MeasureField
                aria-label="Flecha del arco"
                className="w-32"
                value={design.shape.rise}
                min={10}
                max={design.height}
                onChange={(rise) => rise && emit(setShape(design, { kind: 'arch', rise }), 'Flecha del arco')}
              />
            </label>
          ) : null}
          {design.shape?.kind === 'trapezoid' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-paper-600">Alto izquierdo</span>
                <MeasureField
                  aria-label="Alto izquierdo"
                  value={design.shape.leftHeight}
                  min={10}
                  max={design.height}
                  onChange={(h) => h && design.shape?.kind === 'trapezoid' && emit(setShape(design, { ...design.shape, leftHeight: h }), 'Altura izquierda')}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] text-paper-600">Alto derecho</span>
                <MeasureField
                  aria-label="Alto derecho"
                  value={design.shape.rightHeight}
                  min={10}
                  max={design.height}
                  onChange={(h) => h && design.shape?.kind === 'trapezoid' && emit(setShape(design, { ...design.shape, rightHeight: h }), 'Altura derecha')}
                />
              </label>
            </div>
          ) : null}
          {design.shape?.kind === 'triangle' ? (
            <SegmentedControl
              aria-label="Vértice del triángulo"
              size="sm"
              block
              value={design.shape.apex}
              onValueChange={(apex) => emit(setShape(design, { kind: 'triangle', apex }), 'Vértice del triángulo')}
              options={[
                { value: 'left', label: 'Izquierda' },
                { value: 'center', label: 'Centro' },
                { value: 'right', label: 'Derecha' },
              ]}
            />
          ) : null}
          {shapeKind !== 'rect' && leaves.some((l) => l.opening?.kind !== 'fixed') ? (
            <p className="text-[12px] leading-4 text-warn-800">Las formas especiales se fabrican como paño fijo.</p>
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection title="Extras">
        <div className="flex flex-col gap-2.5">
          <Switch
            size="sm"
            label="Mosquitero"
            checked={Boolean(design.extras?.screen)}
            onCheckedChange={(on) => onChange({ ...design, extras: { ...design.extras, screen: on } }, on ? 'Con mosquitero' : 'Sin mosquitero')}
          />
          <Switch
            size="sm"
            label="Botaguas"
            checked={Boolean(design.extras?.sill)}
            onCheckedChange={(on) => onChange({ ...design, extras: { ...design.extras, sill: on } }, on ? 'Con botaguas' : 'Sin botaguas')}
          />
          {hasDoor ? (
            <Switch
              size="sm"
              label="Umbral bajo"
              description="Si no, la puerta lleva marco completo."
              checked={Boolean(design.extras?.threshold)}
              onCheckedChange={(on) => onChange({ ...design, extras: { ...design.extras, threshold: on } }, on ? 'Umbral bajo' : 'Marco completo')}
            />
          ) : null}
        </div>
      </SettingsSection>
    </div>
  )
}
