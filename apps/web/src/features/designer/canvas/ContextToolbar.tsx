/**
 * Barra contextual flotante del paño seleccionado: apertura, bisagras, sentido, dividir, unión
 * francesa, quitar división y vidrio. En correderas: hoja fija o móvil y sentido. Cada botón
 * dibuja el resultado con la convención del rubro y aplica el cambio de inmediato (se deshace).
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, FlipHorizontal2 } from 'lucide-react'
import { openingDirection, type Catalog, type WindowDesign } from '@framezen/engine'
import type { DrawingView } from '@framezen/documents'
import { cn } from '../../../lib/cn'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../../ui/DropdownMenu'
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { Tooltip } from '../../../ui/Tooltip'
import {
  DIRECTIONAL,
  HINGED,
  OPENING_PRESETS,
  applyOpeningPreset,
  canRemoveDivision,
  clearNodeGlass,
  equalizeSplit,
  flipHinge,
  frenchHost,
  isPresetActive,
  nodeGlassId,
  removeDivision,
  setDirection,
  setFill,
  setNodeGlass,
  setPanelDirection,
  setPanelKind,
  splitAction,
  toggleFrench,
  type Change,
  type OpeningPreset,
  type Selection,
} from '../lib/actions'
import { glassName } from '../lib/catalog'
import { glassPickerGroups } from '../parts/CatalogPickers'
import { EqualizeGlyph, FrenchGlyph, GlassGlyph, MergeGlyph, OpeningGlyph, SlideGlyph, SplitGlyph, SwingGlyph } from '../parts/Glyphs'
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
const sideWord = (side: 'left' | 'right') => (side === 'left' ? 'izquierda' : 'derecha')

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
} & Omit<React.ComponentProps<'button'>, 'children' | 'onClick'>) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        onClick={onClick}
        className={cn(
          'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-0.5 rounded-sm px-1 text-paper-600 outline-none',
          'transition-[background-color,color,transform] duration-120 ease-out active:scale-[0.96]',
          'hover:bg-paper-100 hover:text-paper-900 focus-visible:shadow-[0_0_0_2px_var(--ink-500)] data-[state=open]:bg-paper-100 data-[state=open]:text-paper-900',
          'aria-pressed:bg-ink-50 aria-pressed:text-ink-700 aria-pressed:hover:bg-ink-100 touch:h-10 touch:min-w-10',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-paper-200" />
}

/** Presets tal como se ven: en vista exterior las bisagras se espejan para quien mira. */
function visiblePresets(view: DrawingView): { preset: OpeningPreset; glyphHinge: 'left' | 'right'; label: string }[] {
  const mirror = view === 'exterior'
  return OPENING_PRESETS.map((preset) => {
    if (preset.kind !== 'casement' || !preset.hinge) return { preset, glyphHinge: 'left' as const, label: preset.label }
    // El botón «bisagras a la izquierda» muestra lo que ves; en exterior eso es la derecha interior.
    const visual = preset.hinge
    const real = mirror ? flip(visual) : visual
    return { preset: { ...preset, hinge: real }, glyphHinge: visual, label: `Abatible, bisagras a la ${sideWord(visual)}` }
  })
}

function GlassButton({ design, catalog, nodeId, leaf, onApply }: { design: WindowDesign; catalog: Catalog; nodeId: string; leaf?: { fill: 'glass' | 'panel' }; onApply: (c: Change | null) => void }) {
  const [open, setOpen] = useState(false)
  const current = nodeGlassId(design, nodeId)
  const name = glassName(catalog, current.glassId)
  const label = leaf?.fill === 'panel' ? 'Panel ciego' : name ? `Vidrio: ${name}${current.own ? '' : ' (el de la ventana)'}` : 'Vidrio del paño'
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2 text-[13px] text-paper-600 outline-none transition-colors duration-120',
              'hover:bg-paper-100 hover:text-paper-900 focus-visible:shadow-[0_0_0_2px_var(--ink-500)] data-[state=open]:bg-paper-100 data-[state=open]:text-paper-900 touch:h-10',
              current.own && 'text-ink-700',
            )}
          >
            <GlassGlyph size={18} />
            <span className="max-w-28 truncate font-medium">{leaf?.fill === 'panel' ? 'Panel ciego' : (name ?? 'Vidrio')}</span>
            <ChevronDown aria-hidden strokeWidth={1.75} className="size-3.5 opacity-70" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent flush side="top" align="center" className="w-80" data-canvas-ui="">
        {leaf ? (
          <div className="border-b border-paper-200 p-2">
            <SegmentedControl
              aria-label="Relleno del paño"
              size="sm"
              block
              value={leaf.fill}
              onValueChange={(fill) => onApply(setFill(design, nodeId, fill))}
              options={[
                { value: 'glass', label: 'Vidrio' },
                { value: 'panel', label: 'Panel ciego' },
              ]}
            />
          </div>
        ) : null}
        <PickerList
          value={current.glassId}
          groups={glassPickerGroups(catalog)}
          searchPlaceholder="Buscar vidrio…"
          emptyText="Ningún vidrio coincide."
          leadingItem={{
            value: '__inherit__',
            label: 'Igual que la ventana',
            hint: glassName(catalog, design.glassId),
            active: !current.own,
            onSelect: () => {
              onApply(clearNodeGlass(design, nodeId))
              setOpen(false)
            },
          }}
          onSelect={(glassId) => {
            const change = setNodeGlass(design, nodeId, glassId, catalog)
            const filled = leaf?.fill === 'panel' && change ? setFill(change.design, nodeId, 'glass') : null
            onApply(filled ? { design: filled.design, label: change!.label } : change)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function SplitMenu({ design, nodeId, onApply }: { design: WindowDesign; nodeId: string; onApply: (c: Change | null) => void }) {
  const items: { dir: 'vertical' | 'horizontal'; parts: 2 | 3; label: string; shortcut: string }[] = [
    { dir: 'vertical', parts: 2, label: 'Vertical en 2', shortcut: 'v' },
    { dir: 'vertical', parts: 3, label: 'Vertical en 3', shortcut: 'shift+v' },
    { dir: 'horizontal', parts: 2, label: 'Horizontal en 2', shortcut: 'h' },
    { dir: 'horizontal', parts: 3, label: 'Horizontal en 3', shortcut: 'shift+h' },
  ]
  return (
    <DropdownMenu>
      <Tooltip content="Dividir el paño">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Dividir el paño"
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-0.5 rounded-sm px-1.5 text-paper-600 outline-none transition-colors duration-120',
              'hover:bg-paper-100 hover:text-paper-900 focus-visible:shadow-[0_0_0_2px_var(--ink-500)] data-[state=open]:bg-paper-100 data-[state=open]:text-paper-900 touch:h-10',
            )}
          >
            <SplitGlyph dir="vertical" parts={2} size={18} />
            <ChevronDown aria-hidden strokeWidth={1.75} className="size-3.5 opacity-70" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="center" side="top" className="min-w-52" data-canvas-ui="">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-meta font-medium text-paper-600">Dividir en partes iguales</DropdownMenuLabel>
        {items.map((it) => (
          <DropdownMenuItem key={it.label} shortcut={it.shortcut} onSelect={() => onApply(splitAction(design, nodeId, it.dir, it.parts))}>
            <span className="flex items-center gap-2">
              <SplitGlyph dir={it.dir} parts={it.parts} size={18} className="text-paper-600" />
              {it.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ContextToolbar({ design, catalog, selection, view, mullionIndex, onApply, compact }: ContextToolbarProps) {
  const mirror = view === 'exterior'
  let content: ReactNode = null
  let label = 'Paño'

  if (selection.kind === 'leaf') {
    const node = selection.node
    const opening = node.opening ?? { kind: 'fixed' }
    const hinge = opening.hinge ?? 'left'
    const visualHinge = mirror ? flip(hinge) : hinge
    const dir = openingDirection(opening)
    const toward = (dir === 'in') === (view === 'interior')
    const french = frenchHost(design, node.id)
    label = 'Opciones del paño'
    content = (
      <>
        <div role="group" aria-label="Apertura" className="flex items-center gap-0.5">
          {visiblePresets(view).map(({ preset, glyphHinge, label: text }) => {
            const active = isPresetActive(preset, opening)
            const presetDir = preset.kind === 'awning' ? 'out' : 'in'
            const away = (presetDir === 'in') !== (view === 'interior')
            return (
              <ToolButton key={preset.id} label={text} active={active} onClick={() => onApply(applyOpeningPreset(design, node.id, preset))}>
                <OpeningGlyph kind={preset.kind} hinge={preset.kind === 'casement' ? glyphHinge : active ? visualHinge : 'left'} away={away} size={20} />
              </ToolButton>
            )
          })}
        </div>
        {HINGED.includes(opening.kind) || DIRECTIONAL.includes(opening.kind) ? <Divider /> : null}
        {HINGED.includes(opening.kind) ? (
          <ToolButton label={`Bisagras a la ${sideWord(visualHinge === 'left' ? 'right' : 'left')}`} onClick={() => onApply(flipHinge(design, node.id))}>
            <FlipHorizontal2 aria-hidden strokeWidth={1.75} className="size-[18px]" />
          </ToolButton>
        ) : null}
        {DIRECTIONAL.includes(opening.kind) ? (
          <ToolButton
            label={dir === 'in' ? 'Abre hacia adentro · cambiar a afuera' : 'Abre hacia afuera · cambiar a adentro'}
            onClick={() => onApply(setDirection(design, node.id, dir === 'in' ? 'out' : 'in'))}
          >
            <SwingGlyph toward={toward} size={20} />
          </ToolButton>
        ) : null}
        <Divider />
        <SplitMenu design={design} nodeId={node.id} onApply={onApply} />
        {french ? (
          <ToolButton label="Unión francesa (sin travesaño fijo)" active={french.joint === 'french'} onClick={() => onApply(toggleFrench(design, french.id))}>
            <FrenchGlyph size={20} />
          </ToolButton>
        ) : null}
        {canRemoveDivision(design, node.id) ? (
          <ToolButton label="Quitar división" shortcut="delete" onClick={() => onApply(removeDivision(design, node.id))}>
            <MergeGlyph size={20} />
          </ToolButton>
        ) : null}
        <Divider />
        <GlassButton design={design} catalog={catalog} nodeId={node.id} leaf={{ fill: node.fill ?? 'glass' }} onApply={onApply} />
      </>
    )
  } else if (selection.kind === 'panel') {
    const panel = selection.panel
    const realDir = panel.direction ?? (selection.index === 0 ? 'right' : 'left')
    const visualDir = mirror ? flip(realDir) : realDir
    label = `Hoja ${selection.index + 1}`
    content = (
      <>
        <div role="group" aria-label="Tipo de hoja" className="flex items-center gap-0.5">
          <ToolButton label="Hoja fija" active={panel.kind === 'fixed'} onClick={() => onApply(setPanelKind(design, panel.id, 'fixed'))}>
            <SlideGlyph mode="fixed" size={20} />
          </ToolButton>
          {(['left', 'right'] as const).map((visual) => {
            const real = mirror ? flip(visual) : visual
            return (
              <ToolButton
                key={visual}
                label={`Hoja móvil, abre hacia la ${sideWord(visual)}`}
                active={panel.kind === 'moving' && visualDir === visual}
                onClick={() => onApply(setPanelDirection(design, panel.id, real))}
              >
                <SlideGlyph mode={visual} size={20} />
              </ToolButton>
            )
          })}
        </div>
        <Divider />
        <GlassButton design={design} catalog={catalog} nodeId={panel.id} onApply={onApply} />
      </>
    )
  } else if (selection.kind === 'split') {
    const node = selection.node
    const index = mullionIndex ?? null
    label = node.dir === 'vertical' ? 'Opciones del montante' : 'Opciones del travesaño'
    content = (
      <>
        <ToolButton label="Repartir en partes iguales" onClick={() => onApply(equalizeSplit(design, node.id))}>
          <EqualizeGlyph size={20} className={node.dir === 'horizontal' ? 'rotate-90' : undefined} />
        </ToolButton>
        {node.dir === 'vertical' ? (
          <ToolButton label="Unión francesa (sin travesaño fijo)" active={node.joint === 'french'} onClick={() => onApply(toggleFrench(design, node.id))}>
            <FrenchGlyph size={20} />
          </ToolButton>
        ) : null}
        <ToolButton
          label={index !== null ? (node.dir === 'vertical' ? 'Quitar este montante' : 'Quitar este travesaño') : 'Quitar división'}
          shortcut="delete"
          onClick={() => onApply(removeDivision(design, node.id, index ?? undefined))}
        >
          <MergeGlyph size={20} className={node.dir === 'horizontal' ? 'rotate-90' : undefined} />
        </ToolButton>
      </>
    )
  } else {
    return null
  }

  return (
    <div
      role="toolbar"
      aria-label={label}
      data-canvas-ui=""
      className={cn(
        'flex items-center gap-0.5 rounded-md border border-paper-200 bg-paper-0 p-1 shadow-float',
        compact && 'scrollbar-quiet max-w-full overflow-x-auto',
      )}
    >
      {content}
    </div>
  )
}
