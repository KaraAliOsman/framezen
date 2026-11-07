/**
 * Ajustes de la ventana completa. Primero lo que se toca en cada ventana: medidas, tipología, línea,
 * color y vidrio (más sistema, hojas y rieles en una corredera). Lo ocasional queda plegado al final:
 * accesorios y contorno, forma del marco y lo que agregue quien la usa (`folds`). Cada control aplica
 * al instante con su etiqueta de deshacer; nada es obligatorio y nada bloquea (el motor avisa si algo
 * no calza).
 */
import { useId, useMemo, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link, useInRouterContext } from 'react-router'
import {
  INSECT_SCREEN_TYPES,
  ROLLER_SHUTTER_OPERATIONS,
  ROLLER_SHUTTER_TYPES,
  collectLeaves,
  isSemicircularArch,
  regularChamfer,
  setColor,
  setExtras,
  setGlass,
  setLine,
  setShape,
  setSize,
  type Catalog,
  type InsectScreenType,
  type RollerShutterOperation,
  type RollerShutterType,
  type Shape,
  type WindowDesign,
  type WindowExtras,
  isAssembly,
  lineFrameAddons,
  matchTypology,
  type FrameAddon,
  type FrameAddonKind,
} from '@dekopen/engine'
import { cn } from '../../lib/cn'
import { useFormat, useGlossary, useT } from '../../lib/i18n'
import { Button } from '../../ui/Button'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Select } from '../../ui/Select'
import { Switch } from '../../ui/Switch'
import { Tooltip } from '../../ui/Tooltip'
import { IconInsectScreen, IconRollerShutter, IconSill } from '../../ui/icons'
import { AssemblySettings } from './AssemblySettings'
import es from './i18n/es'
import { changeTypology, unitTypologies } from './lib/assembly'
import { setPanelCount, setRails, setSystem, type Change } from './lib/actions'
import { findLine, glassName, lineColors } from './lib/catalog'
import { undoLabel, type UndoKey, type UndoLabel } from './lib/undo'
import { GlassPicker, LinePicker } from './parts/CatalogPickers'
import { ColorPicker } from './parts/ColorPicker'
import { Fold } from './parts/Fold'
import { ShapeGlyph, type ShapeGlyphKind } from './parts/Glyphs'
import { MeasureField } from './parts/MeasureField'
import { SearchPicker } from './parts/SearchPicker'

export interface WindowSettingsProps {
  design: WindowDesign
  catalog: Catalog
  /** Cambio + texto del paso en el idioma actual + clave estable (ver `undoText`). */
  onChange: (next: WindowDesign, label: string, undo?: UndoLabel) => void
  className?: string
  /** Paño elegido en el lienzo: en un conjunto, su unidad pasa a ser la activa. */
  selectedNodeId?: string | null
  /** Justo después de lo esencial (avisos, igualar con las demás ventanas). */
  below?: ReactNode
  /** Más pliegues, después de accesorios y forma. */
  folds?: ReactNode
}

export function SettingsSection({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2 pb-5 last:pb-0', className)}>
      <div className="flex min-h-5 items-baseline justify-between gap-3">
        <h3 className="text-table font-medium text-fg-strong">{title}</h3>
        {aside ? <div className="min-w-0 truncate text-meta text-fg-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** Fila etiqueta + control compacto (corredera, accesorios); `stacked` pone la etiqueta arriba para opciones largas. */
function Row({ label, children, htmlFor, stacked = false }: { label: ReactNode; children: ReactNode; htmlFor?: string; stacked?: boolean }) {
  return (
    <div className={stacked ? 'flex flex-col gap-1.5' : 'grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3'}>
      <label htmlFor={htmlFor} className="text-meta text-fg-muted">
        {label}
      </label>
      {children}
    </div>
  )
}

const SHAPE_KINDS: ShapeGlyphKind[] = ['rect', 'arch', 'arch_segmental', 'round', 'oval', 'pentagon', 'octagon', 'gable', 'trapezoid', 'triangle']

/** Forma del selector a partir del diseño (el arco distingue medio punto de rebajado). */
export function shapeKindOf(design: WindowDesign): ShapeGlyphKind {
  const shape = design.shape
  if (!shape || shape.kind === 'rect') return 'rect'
  if (shape.kind === 'arch') return isSemicircularArch(shape.rise, design.width) ? 'arch' : 'arch_segmental'
  return shape.kind
}

/** Forma por defecto al elegirla (proporciones típicas del rubro, ajustadas a la ventana). */
export function defaultShape(kind: ShapeGlyphKind, design: WindowDesign): Shape | undefined {
  const { width: w, height: h } = design
  switch (kind) {
    case 'arch':
      return { kind: 'arch', rise: Math.round(Math.min(w / 2, h) * 10) / 10 }
    case 'arch_segmental':
      return { kind: 'arch', rise: Math.max(10, Math.min(h, Math.round(w / 50) * 10)) }
    case 'trapezoid':
      return { kind: 'trapezoid', leftHeight: Math.round(h / 2), rightHeight: h }
    case 'triangle':
      return { kind: 'triangle', apex: 'center' }
    case 'round':
      return { kind: 'round' }
    case 'oval':
      return { kind: 'oval' }
    case 'pentagon':
      return { kind: 'pentagon' }
    case 'octagon':
      return { kind: 'octagon' }
    case 'gable': {
      const shoulder = h - w / 2 >= h * 0.3 ? h - w / 2 : h * 0.6
      return { kind: 'gable', shoulderHeight: Math.round(Math.min(h - 1, Math.max(1, shoulder))) }
    }
    default:
      return undefined
  }
}

function isDoorish(design: WindowDesign): boolean {
  const root = design.root
  // La elevadora lleva umbral siempre (el motor lo decide): el interruptor es para puertas de abatir.
  if (!root || root.type === 'sliding') return false
  return collectLeaves(root).some((l) => l.opening?.kind === 'door' || l.opening?.use === 'balcony' || l.opening?.use === 'entrance')
}

/** Un conjunto tiene su propio panel; una ventana suelta, el de siempre con la opción de unirle otra. */
export function WindowSettings(props: WindowSettingsProps) {
  if (isAssembly(props.design)) return <AssemblySettings {...props} />
  return <SingleWindowSettings {...props} />
}

/** Premarco, ensanche y vierteaguas: solo los que trae la línea, cortados y cobrados como perfil. */
function FrameAddonsSection({ design, catalog, onChange }: Pick<WindowSettingsProps, 'design' | 'catalog' | 'onChange'>) {
  const t = useT(es)
  const options = lineFrameAddons(design.lineId, catalog)
  if (!options.length) return null
  const list = design.extras?.frameAddons ?? []
  const save = (next: FrameAddon[]) => {
    const changed = setExtras(design, { frameAddons: next.length ? next : undefined })
    if (changed === design) return
    const step = undoLabel('frameAddon')
    onChange(changed, step.label, step.undo)
  }
  const replace = (kind: FrameAddonKind, addon: FrameAddon | null) => save([...list.filter((a) => a.kind !== kind), ...(addon ? [addon] : [])])
  return (
    <div className="flex flex-col gap-3 border-t border-divider pt-3">
      {options.map(({ kind, profiles }) => {
        const current = list.find((a) => a.kind === kind)
        const profile = profiles.find((p) => p.id === current?.profileId)
        const sides = current?.sides ?? (['left', 'right', 'top'] as const)
        return (
          <div key={kind} className="flex flex-col gap-1.5" data-frame-addon={kind}>
            <Switch
              size="sm"
              label={t(`settings.addon.${kind}`)}
              description={profile ? `${profile.code} · ${profile.name}` : undefined}
              checked={Boolean(current)}
              onCheckedChange={(on) => replace(kind, on ? { kind, profileId: profiles[0].id } : null)}
            />
            {current && profiles.length > 1 ? (
              <Select<string>
                size="sm"
                aria-label={t(`settings.addon.${kind}`)}
                value={current.profileId}
                onValueChange={(profileId) => replace(kind, { ...current, profileId })}
                options={profiles.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              />
            ) : null}
            {current && kind === 'extension' ? (
              <div role="group" aria-label={t('settings.addonSides')} className="grid grid-cols-4 gap-1">
                {(['left', 'right', 'top', 'bottom'] as const).map((side) => {
                  const active = sides.includes(side)
                  return (
                    <Button
                      key={side}
                      size="sm"
                      variant={active ? 'secondary' : 'ghost'}
                      aria-pressed={active}
                      onClick={() => {
                        const next = active ? sides.filter((s) => s !== side) : [...sides, side]
                        if (next.length) replace(kind, { ...current, sides: [...next] })
                      }}
                    >
                      {t(`settings.addonSide.${side}`)}
                    </Button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** Tipología: lo que la línea fabrica. Una ventana modificada a mano no calza con ninguna y se dice. */
function TypologySection({ design, catalog, onChange }: Pick<WindowSettingsProps, 'design' | 'catalog' | 'onChange'>) {
  const t = useT(es)
  const g = useGlossary()
  const options = unitTypologies(findLine(catalog, design.lineId), catalog)
  if (!options.length) return null
  return (
    <SettingsSection title={t('settings.typology')}>
      <SearchPicker
        aria-label={t('settings.typology')}
        placeholder={t('settings.typologyCustom')}
        value={matchTypology(design)}
        onChange={(id) => {
          const step = undoLabel('typology')
          onChange(changeTypology(design, id), step.label, step.undo)
        }}
        groups={[{ id: 't', items: options.map((x) => ({ value: x.id, label: g.typology(x.id), keywords: x.tags })) }]}
      />
    </SettingsSection>
  )
}

function SingleWindowSettings({ design, catalog, onChange, className, below, folds }: WindowSettingsProps) {
  const uid = useId()
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const inRouter = useInRouterContext()
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
  const shapeKind = shapeKindOf(design)
  const canShape = !sliding
  const colorName = (id?: string) => catalog.colors.find((c) => c.id === id)?.name
  const extras = design.extras ?? {}
  const screen: InsectScreenType | null = extras.insectScreen?.type ?? (extras.screen ? 'fixed' : null)
  const shutter = extras.rollerShutter ?? null

  const emit = (next: WindowDesign, key: UndoKey, params?: UndoLabel['params']) => {
    if (next === design) return
    const step = undoLabel(key, params)
    onChange(next, step.label, step.undo)
  }
  const apply = (change: Change | null) => {
    if (change) onChange(change.design, change.label, change.undo)
  }
  const patchExtras = (patch: Partial<WindowExtras>, key: UndoKey) => emit(setExtras(design, patch), key)
  const shapeName = shapeKind === 'arch_segmental' ? g.shape('arch', { segmental: true }) : g.shape(shapeKind)
  const fitted = [
    shutter ? t('settings.shutter') : null,
    screen ? t('settings.screen') : null,
    extras.sill ? t('settings.sill') : null,
    extras.threshold ? t('settings.threshold') : null,
    ...(extras.frameAddons ?? []).map((a) => t(`settings.addon.${a.kind}`)),
  ].filter(Boolean)

  return (
    <div className={cn('flex flex-col', className)}>
      <SettingsSection title={t('settings.size')} aside={<span className="dim">{fmt.area((design.width * design.height) / 1e6 || 0)}</span>}>
        <div className="flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-meta text-fg-muted">{t('settings.width')}</span>
            <MeasureField
              aria-label={t('settings.width')}
              data-item-width=""
              value={design.width}
              min={100}
              max={20000}
              onChange={(width) => width && emit(setSize(design, { width }), 'width')}
              onSizeInput={(s) => emit(setSize(design, s), 'size')}
            />
          </label>
          <span aria-hidden className="dim pb-2.5 text-fg-faint">
            ×
          </span>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-meta text-fg-muted">{t('settings.height')}</span>
            <MeasureField
              aria-label={t('settings.height')}
              value={design.height}
              min={100}
              max={20000}
              onChange={(height) => height && emit(setSize(design, { height }), 'height')}
              onSizeInput={(s) => emit(setSize(design, s), 'size')}
            />
          </label>
        </div>
      </SettingsSection>

      <TypologySection design={design} catalog={catalog} onChange={onChange} />

      <SettingsSection title={t('settings.line')} aside={line ? catalog.brands.find((b) => b.id === line.brandId)?.name : undefined}>
        <LinePicker
          catalog={catalog}
          value={design.lineId || undefined}
          currentKind={sliding ? 'sliding' : root ? 'casement' : undefined}
          onChange={(lineId) => {
            const name = findLine(catalog, lineId)?.name
            emit(setLine(design, lineId, catalog), name ? 'lineNamed' : 'line', name ? { name } : undefined)
          }}
        />
        {line?.completeness === 'partial' ? <p className="text-meta text-fg-muted">{t('settings.linePartial')}</p> : null}
      </SettingsSection>

      <SettingsSection
        title={t('settings.color')}
        aside={
          inRouter ? (
            <Link to="/catalogo?tab=colores" className="inline-flex items-center gap-0.5 rounded-xs text-meta text-fg-muted underline-offset-2 hover:text-accent-ink hover:underline">
              {t('settings.manageColors')}
              <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-3" />
            </Link>
          ) : undefined
        }
      >
        {colors.length ? (
          <>
            <div className="flex flex-col gap-1.5">
              {bicolor ? <span className="text-meta font-medium text-fg-muted">{t('settings.exterior')}</span> : null}
              <ColorPicker
                aria-label={bicolor ? t('settings.exteriorAria') : t('settings.colorAria')}
                value={design.colorId}
                colors={colors}
                onChange={(id) => emit(setColor(design, id, bicolor ? design.colorInId : undefined), 'color', { name: colorName(id) ?? '' })}
              />
            </div>
            {bicolor ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-fg-muted">{t('settings.interior')}</span>
                <ColorPicker
                  aria-label={t('settings.interiorAria')}
                  value={design.colorInId}
                  colors={colors}
                  onChange={(id) => emit(setColor(design, design.colorId, id), 'colorIn', { name: colorName(id) ?? '' })}
                />
              </div>
            ) : null}
            <Switch
              size="sm"
              label={t('settings.bicolor')}
              description={bicolor ? t('settings.bicolorHint') : undefined}
              checked={bicolor}
              onCheckedChange={(on) => {
                if (on) {
                  const other = colors.find((c) => c.id !== design.colorId && /blanc|white/i.test(`${c.id} ${c.name}`)) ?? colors.find((c) => c.id !== design.colorId)
                  if (other) emit(setColor(design, design.colorId, other.id), 'bicolor')
                } else emit(setColor(design, design.colorId), 'monocolor')
              }}
            />
          </>
        ) : (
          <p className="text-meta text-fg-muted">{t('settings.noColors')}</p>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.glass')} aside={ownGlass ? t('settings.ownGlass', { count: ownGlass }) : undefined}>
        <GlassPicker
          id={`${uid}-glass`}
          catalog={catalog}
          value={design.glassId || undefined}
          onChange={(glassId) => {
            const name = glassName(catalog, glassId)
            emit(setGlass(design, null, glassId), name ? 'glassNamed' : 'glass', name ? { name } : undefined)
          }}
          aria-describedby={ownGlass ? `${uid}-glass-hint` : undefined}
        />
        {ownGlass ? (
          <p id={`${uid}-glass-hint`} className="text-meta text-fg-muted">
            {t('settings.ownGlassHint')}
          </p>
        ) : null}
      </SettingsSection>

      {sliding && root?.type === 'sliding' && root.system !== 'vertical' ? (
        <SettingsSection
          title={t('settings.sliding')}
          aside={t('settings.slidingAside', {
            panels: g.t('sliding.panels', { count: root.panels.length }),
            rails: root.rails === 1 ? t('settings.mono') : g.t('sliding.rails', { count: root.rails }),
          })}
        >
          <Row stacked label={t('settings.system')}>
            <SegmentedControl
              aria-label={t('settings.systemAria')}
              size="sm"
              block
              value={root.system === 'lift_slide' ? 'lift_slide' : 'standard'}
              onValueChange={(v) => apply(setSystem(design, v))}
              options={[
                { value: 'standard', label: t('settings.systemStandard') },
                { value: 'lift_slide', label: t('settings.systemLift') },
              ]}
            />
          </Row>
          <Row label={t('settings.panels')}>
            <SegmentedControl
              aria-label={t('settings.panelsAria')}
              size="sm"
              block
              value={String(Math.min(6, Math.max(2, root.panels.length)))}
              onValueChange={(v) => apply(setPanelCount(design, Number(v)))}
              options={['2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))}
            />
          </Row>
          <Row label={t('settings.rails')}>
            <SegmentedControl
              aria-label={t('settings.railsAria')}
              size="sm"
              block
              value={String(root.rails)}
              onValueChange={(v) => apply(setRails(design, Number(v) as 1 | 2 | 3))}
              options={[
                { value: '1', label: t('settings.railMono') },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
              ]}
            />
          </Row>
        </SettingsSection>
      ) : null}

      {below}

      <div className="mt-1 flex flex-col" data-settings-more="">
        <Fold title={t('settings.accessories')} summary={fitted.join(', ')}>
          <div className="flex flex-col gap-3">
            <AccessoryRow icon={<IconRollerShutter aria-hidden strokeWidth={1.75} className="size-4" />}>
              <Switch
                size="sm"
                label={t('settings.shutter')}
                checked={Boolean(shutter)}
                onCheckedChange={(on) => patchExtras({ rollerShutter: on ? { type: 'monoblock', operation: 'strap' } : undefined }, on ? 'shutterOn' : 'shutterOff')}
              />
            </AccessoryRow>
            {shutter ? (
              <div className="ml-7 grid gap-2">
                <Row label={t('settings.shutterType')}>
                  <Select<RollerShutterType>
                    size="sm"
                    aria-label={t('settings.shutterTypeAria')}
                    value={shutter.type}
                    onValueChange={(type) => patchExtras({ rollerShutter: { ...shutter, type } }, 'shutterType')}
                    options={ROLLER_SHUTTER_TYPES.map((v) => ({ value: v, label: g.t(`accessory.rollerShutterType.${v}`) }))}
                  />
                </Row>
                <Row stacked label={t('settings.shutterOperation')}>
                  <SegmentedControl<RollerShutterOperation>
                    aria-label={t('settings.shutterOperationAria')}
                    size="sm"
                    block
                    value={shutter.operation}
                    onValueChange={(operation) => patchExtras({ rollerShutter: { ...shutter, operation } }, 'shutterOperation')}
                    options={ROLLER_SHUTTER_OPERATIONS.map((v) => ({ value: v, label: g.t(`accessory.rollerShutterOperation.${v}`) }))}
                  />
                </Row>
              </div>
            ) : null}

            <AccessoryRow icon={<IconInsectScreen aria-hidden strokeWidth={1.75} className="size-4" />}>
              <Switch
                size="sm"
                label={t('settings.screen')}
                checked={Boolean(screen)}
                onCheckedChange={(on) => patchExtras(on ? { insectScreen: { type: 'fixed' } } : { insectScreen: undefined, screen: undefined }, on ? 'screenOn' : 'screenOff')}
              />
            </AccessoryRow>
            {screen ? (
              <div className="ml-7">
                <Row label={t('settings.screenType')}>
                  <Select<InsectScreenType>
                    size="sm"
                    aria-label={t('settings.screenTypeAria')}
                    value={screen}
                    onValueChange={(type) => patchExtras({ insectScreen: { type } }, 'screenType')}
                    options={INSECT_SCREEN_TYPES.map((v) => ({ value: v, label: g.t(`accessory.insectScreenType.${v}`) }))}
                  />
                </Row>
              </div>
            ) : null}

            <AccessoryRow icon={<IconSill aria-hidden strokeWidth={1.75} className="size-4" />}>
              <Switch
                size="sm"
                label={t('settings.sill')}
                description={t('settings.sillHint')}
                checked={Boolean(extras.sill)}
                onCheckedChange={(on) => patchExtras({ sill: on }, on ? 'sillOn' : 'sillOff')}
              />
            </AccessoryRow>

            {isDoorish(design) || extras.threshold ? (
              <AccessoryRow icon={<span aria-hidden className="block h-0.5 w-4 rounded-full bg-current" />}>
                <Switch
                  size="sm"
                  label={t('settings.threshold')}
                  description={t('settings.thresholdHint')}
                  checked={Boolean(extras.threshold)}
                  onCheckedChange={(on) => patchExtras({ threshold: on }, on ? 'thresholdOn' : 'thresholdOff')}
                />
              </AccessoryRow>
            ) : null}
          </div>
          <FrameAddonsSection design={design} catalog={catalog} onChange={onChange} />
        </Fold>

        {canShape ? (
          <Fold title={t('settings.shape')} summary={shapeName}>
            <div role="radiogroup" aria-label={t('settings.shapeAria')} className="grid grid-cols-5 gap-1">
              {SHAPE_KINDS.map((kind) => {
                const name = kind === 'arch_segmental' ? g.shape('arch', { segmental: true }) : g.shape(kind)
                const active = shapeKind === kind
                return (
                  <Tooltip key={kind} content={name}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={name}
                      onClick={() => {
                        if (active) return
                        emit(setShape(design, defaultShape(kind, design)), kind === 'rect' ? 'shapeRect' : 'shape', kind === 'rect' ? undefined : { shape: kind })
                      }}
                      className={cn(
                        'flex h-10 items-center justify-center rounded-sm border text-fg-muted transition-[background-color,border-color,color] duration-100 touch:h-11',
                        active ? 'border-accent text-accent-ink' : 'border-divider bg-surface hover:border-divider-strong hover:text-fg-strong',
                      )}
                    >
                      <ShapeGlyph kind={kind} size={20} />
                    </button>
                  </Tooltip>
                )
              })}
            </div>
            {design.shape?.kind === 'arch' ? (
              <Row label={t('settings.archRise')}>
                <div className="flex items-center gap-2">
                  <MeasureField
                    aria-label={t('settings.archRise')}
                    className="min-w-0 flex-1"
                    value={design.shape.rise}
                    min={10}
                    max={design.height}
                    onChange={(rise) => rise && emit(setShape(design, { kind: 'arch', rise }), 'archRise')}
                  />
                </div>
              </Row>
            ) : null}
            {design.shape?.kind === 'trapezoid' ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-meta text-fg-muted">{t('settings.leftHeight')}</span>
                  <MeasureField
                    aria-label={t('settings.leftHeight')}
                    value={design.shape.leftHeight}
                    min={10}
                    max={design.height}
                    onChange={(h) => h && design.shape?.kind === 'trapezoid' && emit(setShape(design, { ...design.shape, leftHeight: h }), 'trapezoidLeft')}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-meta text-fg-muted">{t('settings.rightHeight')}</span>
                  <MeasureField
                    aria-label={t('settings.rightHeight')}
                    value={design.shape.rightHeight}
                    min={10}
                    max={design.height}
                    onChange={(h) => h && design.shape?.kind === 'trapezoid' && emit(setShape(design, { ...design.shape, rightHeight: h }), 'trapezoidRight')}
                  />
                </label>
              </div>
            ) : null}
            {design.shape?.kind === 'triangle' ? (
              <SegmentedControl
                aria-label={t('settings.apex')}
                size="sm"
                block
                value={design.shape.apex}
                onValueChange={(apex) => emit(setShape(design, { kind: 'triangle', apex }), 'triangleApex')}
                options={[
                  { value: 'left', label: t('common.left') },
                  { value: 'center', label: t('common.center') },
                  { value: 'right', label: t('common.right') },
                ]}
              />
            ) : null}
            {design.shape?.kind === 'octagon' ? (
              <Row label={t('settings.chamfer')}>
                <MeasureField
                  aria-label={t('settings.chamferAria')}
                  value={design.shape.chamfer ?? null}
                  placeholder={`${t('settings.chamferRegular')} · ${fmt.mm(regularChamfer(design.width, design.height))}`}
                  min={10}
                  max={Math.min(design.width, design.height) / 2}
                  onChange={(chamfer) => emit(setShape(design, chamfer ? { kind: 'octagon', chamfer } : { kind: 'octagon' }), 'octagonChamfer')}
                />
              </Row>
            ) : null}
            {design.shape?.kind === 'gable' ? (
              <Row label={t('settings.shoulder')}>
                <MeasureField
                  aria-label={t('settings.shoulder')}
                  value={design.shape.shoulderHeight}
                  min={10}
                  max={design.height - 1}
                  onChange={(shoulderHeight) => shoulderHeight && emit(setShape(design, { kind: 'gable', shoulderHeight }), 'gableShoulder')}
                />
              </Row>
            ) : null}
          </Fold>
        ) : null}
        {folds}
      </div>
    </div>
  )
}

function AccessoryRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-fg-muted">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
