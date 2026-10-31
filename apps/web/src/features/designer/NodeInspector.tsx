/**
 * Inspector del paño seleccionado: apertura, bisagras, sentido, vidrio y relleno, división y
 * medidas de la división; en correderas, tipo y sentido de la hoja. Mismas acciones que la barra
 * contextual del lienzo, con más espacio y etiquetas.
 */
import type { ReactNode } from 'react'
import { openingDirection, openingLabel, setNodeSize, type Catalog, type WindowDesign } from '@framezen/engine'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { Button } from '../../ui/Button'
import { MeasureField } from './parts/MeasureField'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Tooltip } from '../../ui/Tooltip'
import {
  DIRECTIONAL,
  HINGED,
  OPENING_PRESETS,
  applyOpeningPreset,
  canRemoveDivision,
  clearNodeGlass,
  equalizeSplit,
  frenchHost,
  isPresetActive,
  nodeGlassId,
  nodeTitle,
  removeDivision,
  resolveSelection,
  setDirection,
  setFill,
  setHinge,
  setNodeGlass,
  setPanelDirection,
  setPanelKind,
  splitAction,
  toggleFrench,
  type Change,
} from './lib/actions'
import { glassName } from './lib/catalog'
import { GlassPicker } from './parts/CatalogPickers'
import { EqualizeGlyph, FrenchGlyph, MergeGlyph, OpeningGlyph, SlideGlyph, SplitGlyph } from './parts/Glyphs'
import { SettingsSection } from './WindowSettings'

export interface NodeInspectorProps {
  design: WindowDesign
  catalog: Catalog
  nodeId: string | null
  onChange: (next: WindowDesign, label: string) => void
  className?: string
}

function Tile({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'flex h-11 items-center justify-center rounded-sm border text-paper-600 outline-none transition-[background-color,border-color,color] duration-120',
          'hover:border-paper-350/60 hover:text-paper-900 focus-visible:shadow-[0_0_0_2px_var(--paper-0),0_0_0_4px_var(--ink-500)]',
          active ? 'border-ink-500 bg-ink-50 text-ink-700' : 'border-paper-200 bg-paper-0',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant="secondary" onClick={onClick} className="justify-start gap-1.5 px-2">
      {children}
      <span className="truncate">{label}</span>
    </Button>
  )
}

export function NodeInspector({ design, catalog, nodeId, onChange, className }: NodeInspectorProps) {
  const selection = resolveSelection(design, nodeId)
  const apply = (change: Change | null) => {
    if (change) onChange(change.design, change.label)
  }

  if (!selection || !nodeId) {
    return (
      <div className={cn('rounded-md border border-dashed border-paper-200 px-4 py-5 text-center', className)}>
        <p className="text-[13px] text-paper-600">Elige un paño en el dibujo para cambiar su apertura, su vidrio o dividirlo.</p>
      </div>
    )
  }

  const title = nodeTitle(design, nodeId)

  if (selection.kind === 'leaf') {
    const node = selection.node
    const opening = node.opening ?? { kind: 'fixed' }
    const glass = nodeGlassId(design, node.id)
    const french = frenchHost(design, node.id)
    const fill = node.fill ?? 'glass'
    return (
      <div className={cn('flex flex-col', className)}>
        <SettingsSection title={title} aside={openingLabel(opening)}>
          <div role="group" aria-label="Apertura" className="grid grid-cols-7 gap-1">
            {OPENING_PRESETS.map((preset) => (
              <Tile key={preset.id} label={preset.label} active={isPresetActive(preset, opening)} onClick={() => apply(applyOpeningPreset(design, node.id, preset))}>
                <OpeningGlyph kind={preset.kind} hinge={preset.hinge ?? (isPresetActive(preset, opening) ? (opening.hinge ?? 'left') : 'left')} away={preset.kind === 'awning'} size={22} />
              </Tile>
            ))}
          </div>
          {HINGED.includes(opening.kind) ? (
            <div className="grid grid-cols-[88px_1fr] items-center gap-3">
              <span className="text-[12px] text-paper-600">Bisagras</span>
              <SegmentedControl
                aria-label="Lado de las bisagras (vista interior)"
                size="sm"
                block
                value={opening.hinge ?? 'left'}
                onValueChange={(h) => apply(setHinge(design, node.id, h))}
                options={[
                  { value: 'left', label: 'Izquierda' },
                  { value: 'right', label: 'Derecha' },
                ]}
              />
            </div>
          ) : null}
          {DIRECTIONAL.includes(opening.kind) ? (
            <div className="grid grid-cols-[88px_1fr] items-center gap-3">
              <span className="text-[12px] text-paper-600">Abre hacia</span>
              <SegmentedControl
                aria-label="Hacia dónde abre"
                size="sm"
                block
                value={openingDirection(opening)}
                onValueChange={(d) => apply(setDirection(design, node.id, d))}
                options={[
                  { value: 'in', label: 'Adentro' },
                  { value: 'out', label: 'Afuera' },
                ]}
              />
            </div>
          ) : null}
        </SettingsSection>

        <SettingsSection title="Relleno y vidrio" aside={glass.own ? 'Vidrio propio' : 'El de la ventana'}>
          <SegmentedControl
            aria-label="Relleno"
            size="sm"
            block
            value={fill}
            onValueChange={(f) => apply(setFill(design, node.id, f))}
            options={[
              { value: 'glass', label: 'Vidrio' },
              { value: 'panel', label: 'Panel ciego' },
            ]}
          />
          {fill === 'glass' ? (
            <GlassPicker
              catalog={catalog}
              value={glass.glassId}
              onChange={(glassId) => apply(setNodeGlass(design, node.id, glassId, catalog))}
              inherit={{ label: 'Igual que la ventana', hint: glassName(catalog, design.glassId), active: !glass.own, onSelect: () => apply(clearNodeGlass(design, node.id)) }}
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title="División">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton label="Vertical en 2" onClick={() => apply(splitAction(design, node.id, 'vertical', 2))}>
              <SplitGlyph dir="vertical" parts={2} size={18} />
            </ActionButton>
            <ActionButton label="Vertical en 3" onClick={() => apply(splitAction(design, node.id, 'vertical', 3))}>
              <SplitGlyph dir="vertical" parts={3} size={18} />
            </ActionButton>
            <ActionButton label="Horizontal en 2" onClick={() => apply(splitAction(design, node.id, 'horizontal', 2))}>
              <SplitGlyph dir="horizontal" parts={2} size={18} />
            </ActionButton>
            <ActionButton label="Horizontal en 3" onClick={() => apply(splitAction(design, node.id, 'horizontal', 3))}>
              <SplitGlyph dir="horizontal" parts={3} size={18} />
            </ActionButton>
            {french ? (
              <ActionButton label={french.joint === 'french' ? 'Con travesaño fijo' : 'Unión francesa'} onClick={() => apply(toggleFrench(design, french.id))}>
                <FrenchGlyph size={18} />
              </ActionButton>
            ) : null}
            {canRemoveDivision(design, node.id) ? (
              <ActionButton label="Quitar división" onClick={() => apply(removeDivision(design, node.id))}>
                <MergeGlyph size={18} />
              </ActionButton>
            ) : null}
          </div>
        </SettingsSection>
      </div>
    )
  }

  if (selection.kind === 'panel') {
    const panel = selection.panel
    const glass = nodeGlassId(design, panel.id)
    const mode = panel.kind === 'fixed' ? 'fixed' : (panel.direction ?? (selection.index === 0 ? 'right' : 'left'))
    return (
      <div className={cn('flex flex-col', className)}>
        <SettingsSection title={title} aside={panel.kind === 'fixed' ? 'Fija' : 'Móvil'}>
          <div role="group" aria-label="Tipo de hoja" className="grid grid-cols-3 gap-1">
            <Tile label="Hoja fija" active={mode === 'fixed'} onClick={() => apply(setPanelKind(design, panel.id, 'fixed'))}>
              <SlideGlyph mode="fixed" size={22} />
            </Tile>
            <Tile label="Móvil, abre a la izquierda" active={mode === 'left'} onClick={() => apply(setPanelDirection(design, panel.id, 'left'))}>
              <SlideGlyph mode="left" size={22} />
            </Tile>
            <Tile label="Móvil, abre a la derecha" active={mode === 'right'} onClick={() => apply(setPanelDirection(design, panel.id, 'right'))}>
              <SlideGlyph mode="right" size={22} />
            </Tile>
          </div>
          <p className="text-[12px] leading-4 text-paper-600">Sentido visto desde el interior.</p>
        </SettingsSection>
        <SettingsSection title="Vidrio" aside={glass.own ? 'Vidrio propio' : 'El de la ventana'}>
          <GlassPicker
            catalog={catalog}
            value={glass.glassId}
            onChange={(glassId) => apply(setNodeGlass(design, panel.id, glassId, catalog))}
            inherit={{ label: 'Igual que la ventana', hint: glassName(catalog, design.glassId), active: !glass.own, onSelect: () => apply(clearNodeGlass(design, panel.id)) }}
          />
        </SettingsSection>
      </div>
    )
  }

  if (selection.kind === 'split') {
    const node = selection.node
    const vertical = node.dir === 'vertical'
    const sizes = node.sizes
    return (
      <div className={cn('flex flex-col', className)}>
        <SettingsSection title={title} aside={`${node.children.length} paños`}>
          <div className="flex flex-col gap-2">
            {node.children.map((child, i) => (
              <label key={child.id} className="grid grid-cols-[88px_1fr] items-center gap-3">
                <span className="text-[12px] text-paper-600">{vertical ? `Ancho ${i + 1}` : `Alto ${i + 1}`}</span>
                <MeasureField
                  aria-label={vertical ? `Ancho del paño ${i + 1}` : `Alto del paño ${i + 1}`}
                  value={typeof sizes[i] === 'number' ? (sizes[i] as number) : null}
                  placeholder="Automático"
                  min={50}
                  max={20000}
                  onChange={(mm) => {
                    if (!mm) return
                    const next = setNodeSize(design, node.id, i, mm)
                    if (next !== design) onChange(next, 'Medida del paño')
                  }}
                />
              </label>
            ))}
          </div>
          <p className="text-[12px] leading-4 text-paper-600">Medidas a ejes. Al cambiar una, se ajusta la vecina.</p>
        </SettingsSection>
        <SettingsSection title="Unión">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton label="Partes iguales" onClick={() => apply(equalizeSplit(design, node.id))}>
              <EqualizeGlyph size={18} className={vertical ? undefined : 'rotate-90'} />
            </ActionButton>
            {vertical ? (
              <ActionButton label={node.joint === 'french' ? 'Travesaño fijo' : 'Unión francesa'} onClick={() => apply(toggleFrench(design, node.id))}>
                <FrenchGlyph size={18} />
              </ActionButton>
            ) : null}
            <ActionButton label="Quitar división" onClick={() => apply(removeDivision(design, node.id))}>
              <MergeGlyph size={18} />
            </ActionButton>
          </div>
        </SettingsSection>
      </div>
    )
  }

  // Raíz de corredera.
  const root = selection.node
  return (
    <div className={cn('flex flex-col', className)}>
      <SettingsSection title="Corredera" aside={`${root.panels.length} hojas`}>
        <p className="text-[12px] leading-4 text-paper-600">
          Elige una hoja en el dibujo para hacerla fija o móvil. Ancho de cada hoja ≈ {formatNumber(design.width / Math.max(1, root.panels.length), 0)} mm.
        </p>
      </SettingsSection>
    </div>
  )
}
