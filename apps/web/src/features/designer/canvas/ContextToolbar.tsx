/**
 * Barra contextual flotante del paño seleccionado: apertura (las frecuentes a la vista, las
 * especiales en «Más aperturas»), bisagras, sentido, deslizamiento, pliegue, dividir, unión
 * francesa o plegable, quitar división y vidrio. En correderas: hoja fija o móvil y sentido. Cada
 * botón dibuja el resultado con la convención del rubro y aplica el cambio de inmediato (se
 * deshace). Barra accesible: las flechas recorren los controles.
 */
import { useState, type ComponentProps, type ReactNode } from 'react'
import { ChevronDown, FlipHorizontal2 } from 'lucide-react'
import { findNode, openingDirection, type Catalog, type WindowDesign, type PaneFill } from '@dekopen/engine'
import type { DrawingView } from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../../ui/DropdownMenu'
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from '../../../ui/Toolbar'
import { Tooltip } from '../../../ui/Tooltip'
import es from '../i18n/es'
import {
  DIRECTIONAL,
  HINGED,
  OPENING_PRESETS,
  SLIDE_KINDS,
  applyOpeningPreset,
  canRemoveDivision,
  clearNodeGlass,
  equalizeSplit,
  flipHinge,
  frenchHost,
  isPresetActive,
  nodeGlassId,
  presetLabel,
  removeDivision,
  setDirection,
  setFill,
  setFoldSide,
  setNodeGlass,
  setPanelDirection,
  setPanelKind,
  setSlide,
  splitAction,
  toggleFold,
  toggleFrench,
  type Change,
  type OpeningPreset,
  type Selection,
} from '../lib/actions'
import { glassName } from '../lib/catalog'
import { glassPickerGroups } from '../parts/CatalogPickers'
import { EqualizeGlyph, FoldGlyph, FrenchGlyph, GlassGlyph, MergeGlyph, OpeningGlyph, SlideGlyph, SplitGlyph, SwingGlyph } from '../parts/Glyphs'
import { PickerList } from '../parts/SearchPicker'

export interface ContextToolbarProps {
  design: WindowDesign
  catalog: Catalog
  selection: Selection
  view: DrawingView
  /** Travesaño activo cuando la selección es una división. */
  mullionIndex?: number | null
  onApply: (change: Change | null) => void
  compact?: boolean
}

const flip = (side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left')

const toolClass = cn(
  'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-0.5 rounded-sm px-1 text-fg-muted outline-none',
  'transition-[background-color,color,transform] duration-100 ease-out active:scale-[0.96]',
  'hover:bg-hover hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus data-[state=open]:bg-hover data-[state=open]:text-fg-strong',
  'aria-pressed:bg-accent-subtle aria-pressed:text-accent-ink aria-pressed:hover:bg-accent-subtle-strong touch:h-10 touch:min-w-10',
)

export function ToolButton({
  label,
  shortcut,
  active,
  onClick,
  children,
  className,
  ...rest
}: {
  label: string
  shortcut?: string
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
} & Omit<ComponentProps<'button'>, 'children' | 'onClick'>) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <ToolbarButton asChild>
        <button type="button" aria-label={label} aria-pressed={active === undefined ? undefined : active} onClick={onClick} className={cn(toolClass, className)} {...rest}>
          {children}
        </button>
      </ToolbarButton>
    </Tooltip>
  )
}

/** Presets tal como se ven: en vista exterior las bisagras se espejan para quien mira. */
function visiblePresets(view: DrawingView, tier: OpeningPreset['tier']): { preset: OpeningPreset; glyphHinge: 'left' | 'right'; label: string }[] {
  const mirror = view === 'exterior'
  return OPENING_PRESETS.filter((p) => p.tier === tier).map((preset) => {
    if (preset.kind !== 'casement' || !preset.hinge) return { preset, glyphHinge: 'left' as const, label: presetLabel(preset) }
    // El botón «bisagras a la izquierda» muestra lo que ves; en exterior eso es la derecha interior.
    const visual = preset.hinge
    const real = mirror ? flip(visual) : visual
    return { preset: { ...preset, hinge: real }, glyphHinge: visual, label: presetLabel(preset, visual) }
  })
}

function GlassButton({ design, catalog, nodeId, leaf, onApply }: { design: WindowDesign; catalog: Catalog; nodeId: string; leaf?: { fill: PaneFill }; onApply: (c: Change | null) => void }) {
  const t = useT(es)
  const { locale } = useLocale()
  const [open, setOpen] = useState(false)
  const current = nodeGlassId(design, nodeId)
  const name = glassName(catalog, current.glassId)
  const panel = leaf?.fill === 'panel'
  const label = panel ? t('toolbar.fillPanel') : name ? (current.own ? t('toolbar.glassNamed', { name }) : t('toolbar.glassInherited', { name })) : t('toolbar.glassPane')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <ToolbarButton asChild>
            <button type="button" aria-label={label} className={cn(toolClass, 'gap-1.5 px-2 text-table', current.own && !panel && 'text-accent-ink')}>
              <GlassGlyph size={18} />
              <span className="max-w-28 truncate font-medium">{panel ? t('toolbar.fillPanel') : (name ?? t('toolbar.glass'))}</span>
              <ChevronDown aria-hidden strokeWidth={1.75} className="size-3.5 opacity-70" />
            </button>
          </ToolbarButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent flush side="top" align="center" className="w-80" data-canvas-ui="">
        {leaf ? (
          <div className="border-b border-divider p-2">
            <SegmentedControl
              aria-label={t('toolbar.fill')}
              size="sm"
              block
              value={leaf.fill}
              onValueChange={(fill) => onApply(setFill(design, nodeId, fill))}
              options={[
                { value: 'glass', label: t('toolbar.fillGlass') },
                { value: 'panel', label: t('toolbar.fillPanel') },
              ]}
            />
          </div>
        ) : null}
        <PickerList
          key={locale}
          value={current.glassId}
          groups={glassPickerGroups(catalog)}
          searchPlaceholder={t('toolbar.searchGlass')}
          emptyText={t('toolbar.noGlass')}
          leadingItem={{
            value: '__inherit__',
            label: t('toolbar.sameAsWindow'),
            hint: glassName(catalog, design.glassId),
            active: !current.own,
            onSelect: () => {
              onApply(clearNodeGlass(design, nodeId))
              setOpen(false)
            },
          }}
          onSelect={(glassId) => {
            const change = setNodeGlass(design, nodeId, glassId, catalog)
            const filled = panel && change ? setFill(change.design, nodeId, 'glass') : null
            onApply(filled && change ? { ...change, design: filled.design } : change)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function SplitMenu({ design, nodeId, onApply }: { design: WindowDesign; nodeId: string; onApply: (c: Change | null) => void }) {
  const t = useT(es)
  const items: { dir: 'vertical' | 'horizontal'; parts: 2 | 3; shortcut: string }[] = [
    { dir: 'vertical', parts: 2, shortcut: 'v' },
    { dir: 'vertical', parts: 3, shortcut: 'shift+v' },
    { dir: 'horizontal', parts: 2, shortcut: 'h' },
    { dir: 'horizontal', parts: 3, shortcut: 'shift+h' },
  ]
  return (
    <DropdownMenu>
      <Tooltip content={t('toolbar.split')}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton asChild>
            <button type="button" aria-label={t('toolbar.split')} className={cn(toolClass, 'px-1.5')}>
              <SplitGlyph dir="vertical" parts={2} size={18} />
              <ChevronDown aria-hidden strokeWidth={1.75} className="size-3.5 opacity-70" />
            </button>
          </ToolbarButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="center" side="top" className="min-w-52" data-canvas-ui="">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-meta font-medium text-fg-muted">{t('toolbar.splitTitle')}</DropdownMenuLabel>
        {items.map((it) => (
          <DropdownMenuItem key={`${it.dir}-${it.parts}`} shortcut={it.shortcut} onSelect={() => onApply(splitAction(design, nodeId, it.dir, it.parts))}>
            <span className="flex items-center gap-2">
              <SplitGlyph dir={it.dir} parts={it.parts} size={18} className="text-fg-muted" />
              {t('toolbar.splitItem', { dir: it.dir, parts: it.parts })}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** «Más aperturas»: puerta, pivotantes, osciloparalela y paralela. Muestra la activa si es una de ellas. */
function MoreOpenings({ design, nodeId, view, onApply }: { design: WindowDesign; nodeId: string; view: DrawingView; onApply: (c: Change | null) => void }) {
  const t = useT(es)
  const node = findNode(design, nodeId)
  const opening = (node?.type === 'leaf' ? node.opening : undefined) ?? { kind: 'fixed' as const }
  const specials = visiblePresets(view, 'special')
  const active = specials.find((s) => isPresetActive(s.preset, opening))
  const away = (dir: 'in' | 'out') => (dir === 'in') !== (view === 'interior')
  return (
    <DropdownMenu>
      <Tooltip content={active ? active.label : t('toolbar.moreOpenings')}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton asChild>
            <button type="button" aria-label={t('toolbar.moreOpenings')} aria-pressed={active ? true : undefined} className={cn(toolClass, 'px-1')}>
              {active ? <OpeningGlyph kind={active.preset.kind} hinge={opening.hinge ?? 'left'} slide={opening.slide} away={away(openingDirection(opening))} size={20} /> : <OpeningGlyph kind="pivot_v" size={20} />}
              <ChevronDown aria-hidden strokeWidth={1.75} className="size-3.5 opacity-70" />
            </button>
          </ToolbarButton>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="center" side="top" className="min-w-56" data-canvas-ui="">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-meta font-medium text-fg-muted">{t('toolbar.moreOpeningsTitle')}</DropdownMenuLabel>
        {specials.map(({ preset, label }) => (
          <DropdownMenuItem key={preset.id} onSelect={() => onApply(applyOpeningPreset(design, nodeId, preset))}>
            <span className="flex items-center gap-2">
              <OpeningGlyph kind={preset.kind} size={20} className={isPresetActive(preset, opening) ? 'text-accent-ink' : 'text-fg-muted'} />
              <span className={isPresetActive(preset, opening) ? 'font-medium text-fg-strong' : undefined}>{label}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ContextToolbar({ design, catalog, selection, view, mullionIndex, onApply, compact }: ContextToolbarProps) {
  const t = useT(es)
  const mirror = view === 'exterior'
  let content: ReactNode = null
  let label = t('toolbar.pane')

  if (selection.kind === 'leaf') {
    const node = selection.node
    const opening = node.opening ?? { kind: 'fixed' }
    const hinge = opening.hinge ?? 'left'
    const visualHinge = mirror ? flip(hinge) : hinge
    const dir = openingDirection(opening)
    const toward = (dir === 'in') === (view === 'interior')
    const host = frenchHost(design, node.id)
    const slide = opening.slide ?? 'right'
    const visualSlide = mirror ? flip(slide) : slide
    const foldSide = opening.hinge ?? 'left'
    const visualFold = mirror ? flip(foldSide) : foldSide
    content = (
      <>
        <ToolbarGroup aria-label={t('toolbar.openingGroup')}>
          {visiblePresets(view, 'frequent').map(({ preset, glyphHinge, label: text }) => {
            const active = isPresetActive(preset, opening)
            const presetDir = preset.kind === 'awning' ? 'out' : 'in'
            const away = (presetDir === 'in') !== (view === 'interior')
            return (
              <ToolButton key={preset.id} label={text} active={active} onClick={() => onApply(applyOpeningPreset(design, node.id, preset))}>
                <OpeningGlyph kind={preset.kind} hinge={preset.kind === 'casement' ? glyphHinge : active ? visualHinge : 'left'} away={away} size={20} />
              </ToolButton>
            )
          })}
          <MoreOpenings design={design} nodeId={node.id} view={view} onApply={onApply} />
        </ToolbarGroup>
        {HINGED.includes(opening.kind) || DIRECTIONAL.includes(opening.kind) || SLIDE_KINDS.includes(opening.kind) || opening.kind === 'folding' ? <ToolbarSeparator /> : null}
        {HINGED.includes(opening.kind) ? (
          <ToolButton label={t('toolbar.flipHinge', { side: flip(visualHinge) })} onClick={() => onApply(flipHinge(design, node.id))}>
            <FlipHorizontal2 aria-hidden strokeWidth={1.75} className="size-[18px]" />
          </ToolButton>
        ) : null}
        {DIRECTIONAL.includes(opening.kind) ? (
          <ToolButton label={dir === 'in' ? t('toolbar.directionIn') : t('toolbar.directionOut')} onClick={() => onApply(setDirection(design, node.id, dir === 'in' ? 'out' : 'in'))}>
            <SwingGlyph toward={toward} size={20} />
          </ToolButton>
        ) : null}
        {SLIDE_KINDS.includes(opening.kind) ? (
          <ToolButton label={t('toolbar.slideSide', { side: visualSlide })} onClick={() => onApply(setSlide(design, node.id, flip(slide)))}>
            <SlideGlyph mode={visualSlide} size={20} />
          </ToolButton>
        ) : null}
        {opening.kind === 'folding' ? (
          <ToolButton label={t('toolbar.foldSide', { side: visualFold })} onClick={() => onApply(setFoldSide(design, node.id, flip(foldSide)))}>
            <SlideGlyph mode={visualFold} size={20} />
          </ToolButton>
        ) : null}
        <ToolbarSeparator />
        <SplitMenu design={design} nodeId={node.id} onApply={onApply} />
        {host ? (
          <>
            <ToolButton label={t('toolbar.french')} active={host.joint === 'french'} onClick={() => onApply(toggleFrench(design, host.id))}>
              <FrenchGlyph size={20} />
            </ToolButton>
            <ToolButton label={t('toolbar.fold')} active={host.joint === 'fold'} onClick={() => onApply(toggleFold(design, host.id))}>
              <FoldGlyph size={20} />
            </ToolButton>
          </>
        ) : null}
        {canRemoveDivision(design, node.id) ? (
          <ToolButton label={t('toolbar.remove')} shortcut="delete" onClick={() => onApply(removeDivision(design, node.id))}>
            <MergeGlyph size={20} />
          </ToolButton>
        ) : null}
        <ToolbarSeparator />
        <GlassButton design={design} catalog={catalog} nodeId={node.id} leaf={{ fill: node.fill ?? 'glass' }} onApply={onApply} />
      </>
    )
  } else if (selection.kind === 'panel') {
    const panel = selection.panel
    const realDir = panel.direction === 'left' || panel.direction === 'right' ? panel.direction : selection.index === 0 ? 'right' : 'left'
    const visualDir = mirror ? flip(realDir) : realDir
    label = t('toolbar.panel', { n: selection.index + 1 })
    content = (
      <>
        <ToolbarGroup aria-label={t('toolbar.panelGroup')}>
          <ToolButton label={t('undo.panelFixed')} active={panel.kind === 'fixed'} onClick={() => onApply(setPanelKind(design, panel.id, 'fixed'))}>
            <SlideGlyph mode="fixed" size={20} />
          </ToolButton>
          {(['left', 'right'] as const).map((visual) => {
            const real = mirror ? flip(visual) : visual
            return (
              <ToolButton
                key={visual}
                label={t('toolbar.panelMoving', { side: visual })}
                active={panel.kind === 'moving' && visualDir === visual}
                onClick={() => onApply(setPanelDirection(design, panel.id, real))}
              >
                <SlideGlyph mode={visual} size={20} />
              </ToolButton>
            )
          })}
        </ToolbarGroup>
        <ToolbarSeparator />
        <GlassButton design={design} catalog={catalog} nodeId={panel.id} onApply={onApply} />
      </>
    )
  } else if (selection.kind === 'split') {
    const node = selection.node
    const index = mullionIndex ?? null
    label = t('toolbar.mullion', { dir: node.dir })
    content = (
      <>
        <ToolButton label={t('toolbar.equalize')} onClick={() => onApply(equalizeSplit(design, node.id))}>
          <EqualizeGlyph size={20} className={node.dir === 'horizontal' ? 'rotate-90' : undefined} />
        </ToolButton>
        {node.dir === 'vertical' ? (
          <>
            <ToolButton label={t('toolbar.french')} active={node.joint === 'french'} onClick={() => onApply(toggleFrench(design, node.id))}>
              <FrenchGlyph size={20} />
            </ToolButton>
            <ToolButton label={t('toolbar.fold')} active={node.joint === 'fold'} onClick={() => onApply(toggleFold(design, node.id))}>
              <FoldGlyph size={20} />
            </ToolButton>
          </>
        ) : null}
        <ToolButton label={index !== null ? t('toolbar.removeThis', { dir: node.dir }) : t('toolbar.remove')} shortcut="delete" onClick={() => onApply(removeDivision(design, node.id, index ?? undefined))}>
          <MergeGlyph size={20} className={node.dir === 'horizontal' ? 'rotate-90' : undefined} />
        </ToolButton>
      </>
    )
  } else {
    return null
  }

  return (
    <Toolbar variant="floating" aria-label={label} data-canvas-ui="" className={cn('gap-0.5', compact && 'scrollbar-quiet max-w-full overflow-x-auto')}>
      {content}
    </Toolbar>
  )
}
