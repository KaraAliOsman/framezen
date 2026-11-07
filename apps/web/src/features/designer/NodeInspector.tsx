/**
 * Inspector del paño seleccionado: primero la apertura (frecuentes y especiales), bisagras, sentido,
 * manilla del oscilobatiente, deslizamiento (osciloparalela y paralela), pliegue, eje del pivote y
 * uso de la hoja (ventana, balconera, acceso); plegados, vidrio y relleno, y división y unión
 * (travesaño, francesa con su hoja pasiva, plegable). En correderas, tipo y sentido de la hoja.
 * Mismas acciones que la barra contextual del lienzo, con más espacio y etiquetas.
 */
import type { ReactNode } from 'react'
import { isAssembly, isDoorLeaf, openingDirection, setNodeSize, type Catalog, type PaneFill, type WindowDesign } from '@dekopen/engine'
import { cn } from '../../lib/cn'
import { useFormat, useGlossary, useT } from '../../lib/i18n'
import { Button } from '../../ui/Button'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Slider } from '../../ui/Slider'
import { Tooltip } from '../../ui/Tooltip'
import es from './i18n/es'
import { scopeOf } from './lib/assembly'
import {
  DIRECTIONAL,
  HINGED,
  OPENING_PRESETS,
  PIVOT_KINDS,
  SLIDE_KINDS,
  USE_KINDS,
  applyOpeningPreset,
  canRemoveDivision,
  clearNodeGlass,
  equalizeSplit,
  frenchHost,
  isPresetActive,
  nodeGlassId,
  nodeTitle,
  presetLabel,
  removeDivision,
  resolveSelection,
  setDirection,
  setFill,
  setFoldSide,
  setHinge,
  setJointAction,
  setLeafUse,
  setLeafZocalo,
  setNodeGlass,
  setPanelDirection,
  setPanelKind,
  setPassive,
  setPivot,
  setSequence,
  setSlide,
  splitAction,
  type Change,
} from './lib/actions'
import { glassName } from './lib/catalog'
import { openingName } from './lib/text'
import { undoLabel, type UndoLabel } from './lib/undo'
import { GlassPicker } from './parts/CatalogPickers'
import { Fold } from './parts/Fold'
import { EqualizeGlyph, MergeGlyph, OpeningGlyph, PassiveGlyph, SlideGlyph, SplitGlyph } from './parts/Glyphs'
import { MeasureField } from './parts/MeasureField'
import { SettingsSection } from './WindowSettings'

export interface NodeInspectorProps {
  design: WindowDesign
  catalog: Catalog
  nodeId: string | null
  /** Cambio + texto del paso en el idioma actual + clave estable (ver `undoText`). */
  onChange: (next: WindowDesign, label: string, undo?: UndoLabel) => void
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
          'flex h-11 items-center justify-center rounded-sm border text-fg-muted transition-[background-color,border-color,color] duration-100',
          active ? 'border-accent text-accent-ink' : 'border-divider bg-surface hover:border-divider-strong hover:text-fg-strong',
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

/**
 * Fila etiqueta + control (ancho fijo de etiqueta para que todo alinee). Con opciones de texto largo
 * (tres opciones, «Gira primero / Oscila primero», alemán, turco) la etiqueta va arriba y el control
 * usa todo el ancho: nunca se corta una opción.
 */
function Row({ label, children, hint, stacked = false }: { label: ReactNode; children: ReactNode; hint?: ReactNode; stacked?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={stacked ? 'flex flex-col gap-1.5' : 'grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3'}>
        <span className="text-meta text-fg-muted">{label}</span>
        {children}
      </div>
      {hint ? <p className={cn('text-meta text-fg-muted', !stacked && 'pl-25')}>{hint}</p> : null}
    </div>
  )
}

/** En un conjunto el inspector trabaja sobre la unidad del paño elegido. */
export function NodeInspector({ design, catalog, nodeId, onChange, className }: NodeInspectorProps) {
  if (!isAssembly(design)) return <NodeInspectorBody design={design} catalog={catalog} nodeId={nodeId} onChange={onChange} className={className} />
  const scope = scopeOf(design, nodeId, catalog)
  return <NodeInspectorBody design={scope.design} catalog={catalog} nodeId={scope.nodeId} onChange={(next, label, undo) => onChange(scope.lift(next), label, undo)} className={className} />
}

function NodeInspectorBody({ design, catalog, nodeId, onChange, className }: NodeInspectorProps) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const selection = resolveSelection(design, nodeId)
  const apply = (change: Change | null) => {
    if (change) onChange(change.design, change.label, change.undo)
  }
  const sides = [
    { value: 'left' as const, label: t('common.left') },
    { value: 'right' as const, label: t('common.right') },
  ]

  if (!selection || !nodeId) {
    return (
      <div className={cn('py-3', className)}>
        <p className="text-table text-fg-muted">{t('inspector.empty')}</p>
      </div>
    )
  }

  const title = nodeTitle(design, nodeId)

  if (selection.kind === 'leaf') {
    const node = selection.node
    const opening = node.opening ?? { kind: 'fixed' }
    const kind = opening.kind
    const glass = nodeGlassId(design, node.id)
    const host = frenchHost(design, node.id)
    const fill = node.fill ?? 'glass'
    const frequent = OPENING_PRESETS.filter((p) => p.tier === 'frequent')
    const special = OPENING_PRESETS.filter((p) => p.tier === 'special')
    const pivot = typeof opening.pivot === 'number' ? opening.pivot : 0.5
    const tile = (preset: (typeof OPENING_PRESETS)[number]) => (
      <Tile key={preset.id} label={presetLabel(preset)} active={isPresetActive(preset, opening)} onClick={() => apply(applyOpeningPreset(design, node.id, preset))}>
        <OpeningGlyph kind={preset.kind} hinge={preset.hinge ?? (isPresetActive(preset, opening) ? (opening.hinge ?? 'left') : 'left')} slide={opening.slide} away={preset.kind === 'awning'} size={22} />
      </Tile>
    )
    return (
      <div className={cn('flex flex-col', className)}>
        <SettingsSection title={t('inspector.opening')} aside={openingName(opening)}>
          <div role="group" aria-label={t('inspector.opening')} className="flex flex-col gap-1.5">
            <div className="grid grid-cols-6 gap-1">{frequent.map(tile)}</div>
            <div className="grid grid-cols-6 gap-1">{special.map(tile)}</div>
          </div>
          {HINGED.includes(kind) ? (
            <Row label={t('inspector.hinges')}>
              <SegmentedControl aria-label={t('inspector.hingesAria')} size="sm" block value={opening.hinge ?? 'left'} onValueChange={(h) => apply(setHinge(design, node.id, h))} options={sides} />
            </Row>
          ) : null}
          {DIRECTIONAL.includes(kind) ? (
            <Row label={t('inspector.opensTo')}>
              <SegmentedControl
                aria-label={t('inspector.opensToAria')}
                size="sm"
                block
                value={openingDirection(opening)}
                onValueChange={(d) => apply(setDirection(design, node.id, d))}
                options={[
                  { value: 'in', label: t('common.inside') },
                  { value: 'out', label: t('common.outside') },
                ]}
              />
            </Row>
          ) : null}
          {kind === 'tilt_turn' ? (
            <Row stacked label={t('inspector.sequence')} hint={g.t(opening.sequence === 'tilt_first' ? 'sequenceHint.tilt_first' : 'sequenceHint.turn_first')}>
              <SegmentedControl
                aria-label={t('inspector.sequenceAria')}
                size="sm"
                block
                value={opening.sequence === 'tilt_first' ? 'tilt_first' : 'turn_first'}
                onValueChange={(s) => apply(setSequence(design, node.id, s))}
                options={[
                  { value: 'turn_first', label: t('inspector.turnFirst') },
                  { value: 'tilt_first', label: t('inspector.tiltFirst') },
                ]}
              />
            </Row>
          ) : null}
          {SLIDE_KINDS.includes(kind) ? (
            <Row label={t('inspector.slidesTo')} hint={g.t(`openingHint.${kind as 'tilt_slide' | 'parallel_slide'}`)}>
              <SegmentedControl aria-label={t('inspector.slidesToAria')} size="sm" block value={opening.slide ?? 'right'} onValueChange={(s) => apply(setSlide(design, node.id, s))} options={sides} />
            </Row>
          ) : null}
          {kind === 'folding' ? (
            <Row label={t('inspector.foldsTo')}>
              <SegmentedControl aria-label={t('inspector.foldsToAria')} size="sm" block value={opening.hinge ?? 'left'} onValueChange={(s) => apply(setFoldSide(design, node.id, s))} options={sides} />
            </Row>
          ) : null}
          {PIVOT_KINDS.includes(kind) ? (
            <Row label={t('inspector.pivotAxis')}>
              <div className="flex items-center gap-2">
                <Slider
                  aria-label={t('inspector.pivotAxisAria')}
                  className="min-w-0 flex-1"
                  value={Math.round(pivot * 100)}
                  min={5}
                  max={95}
                  step={1}
                  onValueChange={(v) => apply(setPivot(design, node.id, v / 100))}
                  format={(v) => <span className="text-table">{Math.abs(v - 50) < 1 ? t('inspector.pivotCentered') : fmt.pct(v)}</span>}
                />
              </div>
            </Row>
          ) : null}
          {USE_KINDS.includes(kind) ? (
            <Row stacked label={t('inspector.use')} hint={opening.use ? t('inspector.useHint') : undefined}>
              <SegmentedControl
                aria-label={t('inspector.useAria')}
                size="sm"
                block
                value={opening.use ?? 'window'}
                onValueChange={(u) => apply(setLeafUse(design, node.id, u))}
                options={[
                  { value: 'window', label: t('inspector.useWindow') },
                  { value: 'balcony', label: t('inspector.useBalcony') },
                  { value: 'entrance', label: t('inspector.useEntrance') },
                ]}
              />
            </Row>
          ) : null}
        </SettingsSection>

        <Fold title={t('inspector.fillAndGlass')} summary={fill === 'glass' ? (glass.own ? t('inspector.ownGlass') : t('inspector.windowGlass')) : fill === 'panel' ? t('toolbar.fillPanel') : t('toolbar.fillLouver')}>
          <SegmentedControl
            aria-label={t('inspector.fill')}
            size="sm"
            block
            value={fill}
            onValueChange={(f) => apply(setFill(design, node.id, f as PaneFill))}
            options={[
              { value: 'glass', label: t('toolbar.fillGlass') },
              { value: 'panel', label: t('toolbar.fillPanel') },
              ...(fill === 'louver' ? [{ value: 'louver', label: t('toolbar.fillLouver') }] : []),
            ]}
          />
          {fill === 'glass' ? (
            <GlassPicker
              catalog={catalog}
              value={glass.glassId}
              onChange={(glassId) => apply(setNodeGlass(design, node.id, glassId, catalog))}
              inherit={{ label: t('toolbar.sameAsWindow'), hint: glassName(catalog, design.glassId), active: !glass.own, onSelect: () => apply(clearNodeGlass(design, node.id)) }}
            />
          ) : null}
          {node.opening.kind !== 'fixed' && isDoorLeaf(node.opening) ? (
            <Row label={t('inspector.zocalo')}>
              <MeasureField
                aria-label={t('inspector.zocalo')}
                value={node.zocalo?.height ?? null}
                min={0}
                max={2000}
                placeholder={t('inspector.zocaloNone')}
                onChange={(height) => apply(setLeafZocalo(design, node.id, height ? height : undefined))}
              />
            </Row>
          ) : null}
        </Fold>

        <Fold title={t('inspector.division')}>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['vertical', 2],
              ['vertical', 3],
              ['horizontal', 2],
              ['horizontal', 3],
            ] as const).map(([dir, parts]) => (
              <ActionButton key={`${dir}-${parts}`} label={t('toolbar.splitItem', { dir, parts })} onClick={() => apply(splitAction(design, node.id, dir, parts))}>
                <SplitGlyph dir={dir} parts={parts} size={18} />
              </ActionButton>
            ))}
            {canRemoveDivision(design, node.id) ? (
              <ActionButton label={t('inspector.remove')} onClick={() => apply(removeDivision(design, node.id))}>
                <MergeGlyph size={18} />
              </ActionButton>
            ) : null}
          </div>
          {host ? <JointControls design={design} splitId={host.id} apply={apply} /> : null}
        </Fold>
      </div>
    )
  }

  if (selection.kind === 'panel') {
    const panel = selection.panel
    const glass = nodeGlassId(design, panel.id)
    const mode = panel.kind === 'fixed' ? 'fixed' : (panel.direction ?? (selection.index === 0 ? 'right' : 'left'))
    return (
      <div className={cn('flex flex-col', className)}>
        <SettingsSection title={title} aside={panel.kind === 'fixed' ? t('inspector.panelFixed') : t('inspector.panelMoving')}>
          <div role="group" aria-label={t('toolbar.panelGroup')} className="grid grid-cols-3 gap-1">
            <Tile label={t('inspector.panelTileFixed')} active={mode === 'fixed'} onClick={() => apply(setPanelKind(design, panel.id, 'fixed'))}>
              <SlideGlyph mode="fixed" size={22} />
            </Tile>
            <Tile label={t('inspector.panelTileMoving', { side: 'left' })} active={mode === 'left'} onClick={() => apply(setPanelDirection(design, panel.id, 'left'))}>
              <SlideGlyph mode="left" size={22} />
            </Tile>
            <Tile label={t('inspector.panelTileMoving', { side: 'right' })} active={mode === 'right'} onClick={() => apply(setPanelDirection(design, panel.id, 'right'))}>
              <SlideGlyph mode="right" size={22} />
            </Tile>
          </div>
          <p className="text-meta text-fg-muted">{t('inspector.panelHint')}</p>
        </SettingsSection>
        <SettingsSection title={t('settings.glass')} aside={glass.own ? t('inspector.ownGlass') : t('inspector.windowGlass')}>
          <GlassPicker
            catalog={catalog}
            value={glass.glassId}
            onChange={(glassId) => apply(setNodeGlass(design, panel.id, glassId, catalog))}
            inherit={{ label: t('toolbar.sameAsWindow'), hint: glassName(catalog, design.glassId), active: !glass.own, onSelect: () => apply(clearNodeGlass(design, panel.id)) }}
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
        <SettingsSection title={title} aside={t('inspector.panes', { count: node.children.length })}>
          <div className="flex flex-col gap-2">
            {node.children.map((child, i) => (
              <label key={child.id} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
                <span className="text-meta text-fg-muted">{vertical ? t('inspector.paneWidth', { n: i + 1 }) : t('inspector.paneHeight', { n: i + 1 })}</span>
                <MeasureField
                  aria-label={vertical ? t('inspector.paneWidthAria', { n: i + 1 }) : t('inspector.paneHeightAria', { n: i + 1 })}
                  value={typeof sizes[i] === 'number' ? (sizes[i] as number) : null}
                  placeholder={t('common.automatic')}
                  min={50}
                  max={20000}
                  onChange={(mm) => {
                    if (!mm) return
                    const next = setNodeSize(design, node.id, i, mm)
                    if (next === design) return
                    const step = undoLabel('paneSize')
                    onChange(next, step.label, step.undo)
                  }}
                />
              </label>
            ))}
          </div>
          <p className="text-meta text-fg-muted">{t('inspector.axesHint')}</p>
        </SettingsSection>
        <SettingsSection title={t('inspector.joint')}>
          {vertical ? <JointControls design={design} splitId={node.id} apply={apply} /> : null}
          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton label={t('inspector.equalize')} onClick={() => apply(equalizeSplit(design, node.id))}>
              <EqualizeGlyph size={18} className={vertical ? undefined : 'rotate-90'} />
            </ActionButton>
            <ActionButton label={t('inspector.remove')} onClick={() => apply(removeDivision(design, node.id))}>
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
      <SettingsSection title={t('node.sliding')} aside={g.t('sliding.panels', { count: root.panels.length })}>
        <p className="text-meta text-fg-muted">{t('inspector.slidingRoot', { width: fmt.mm(design.width / Math.max(1, root.panels.length), { unit: true }) })}</p>
      </SettingsSection>
    </div>
  )
}

/** Unión de una división vertical: travesaño fijo, francesa (con su hoja pasiva) o plegable. */
function JointControls({ design, splitId, apply }: { design: WindowDesign; splitId: string; apply: (c: Change | null) => void }) {
  const t = useT(es)
  const split = resolveSelection(design, splitId)
  if (!split || split.kind !== 'split' || split.node.dir !== 'vertical') return null
  const joint = split.node.joint ?? 'mullion'
  const canPair = split.node.children.length === 2
  return (
    <div className="flex flex-col gap-2">
      <Row label={t('inspector.joint')} hint={t('inspector.jointHint', { joint })}>
        <SegmentedControl
          aria-label={t('inspector.jointAria')}
          size="sm"
          block
          value={joint}
          onValueChange={(j) => apply(setJointAction(design, splitId, j))}
          options={[
            { value: 'mullion', label: t('inspector.jointMullion') },
            { value: 'french', label: t('inspector.jointFrench'), disabled: !canPair },
            { value: 'fold', label: t('inspector.jointFold') },
          ]}
        />
      </Row>
      {joint === 'french' ? (
        <Row label={t('inspector.passive')}>
          <div role="group" aria-label={t('inspector.passiveAria')} className="grid grid-cols-2 gap-1">
            {(['left', 'right'] as const).map((side) => (
              <Tile key={side} label={side === 'left' ? t('common.left') : t('common.right')} active={(split.node.passive ?? 'left') === side} onClick={() => apply(setPassive(design, splitId, side))}>
                <PassiveGlyph side={side} size={20} />
              </Tile>
            ))}
          </div>
        </Row>
      ) : null}
    </div>
  )
}
