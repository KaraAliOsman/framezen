/**
 * Panel de un conjunto. El conjunto se arma en el dibujo (el «+» de cada borde y el control de cada
 * unión); aquí queda lo que mide, darlo vuelta y la ventana elegida, que se edita igual que una
 * suelta. Las uniones también están en un pliegue, con lo que falta dicho en cada una.
 */
import { useEffect, useMemo, useState } from 'react'
import { FlipHorizontal2, FlipVertical2, Trash2 } from 'lucide-react'
import {
  assemblyUnits,
  computeBom,
  computeLayout,
  invertAssembly,
  mapUnitDesigns,
  mirrorAssembly,
  parseUnitNodeId,
  removeUnit,
  setAssemblyAlign,
  setColor,
  setGlass,
  updateUnit,
  type WindowDesign,
} from '@dekopen/engine'
import { AssemblyPlan } from '@dekopen/documents'
import { cn } from '../../lib/cn'
import { useFormat, useLocale, useT } from '../../lib/i18n'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { SegmentedControl } from '../../ui/SegmentedControl'
import es from './i18n/es'
import { JointEditor } from './JointEditor'
import { useMediaQuery } from './lib/hooks'
import { undoLabel, type UndoKey } from './lib/undo'
import { Fold } from './parts/Fold'
import { SettingsSection, WindowSettings, type WindowSettingsProps } from './WindowSettings'

export function AssemblySettings({ design, catalog, onChange, className, selectedNodeId, below, folds }: WindowSettingsProps) {
  const t = useT(es)
  const fmt = useFormat()
  const { locale } = useLocale()
  const units = assemblyUnits(design)
  const [activeId, setActiveId] = useState<string | undefined>(units[0]?.id)
  const active = units.find((u) => u.id === activeId) ?? units[0]
  useEffect(() => {
    if (selectedNodeId) setActiveId(parseUnitNodeId(selectedNodeId).unitId)
  }, [selectedNodeId])
  // La planta ya se ve en el lienzo; en pantalla angosta el lienzo no la muestra y va aquí.
  const narrow = useMediaQuery('(max-width: 599px)')
  const layout = useMemo(() => computeLayout(design, catalog), [design, catalog])
  const warnings = useMemo(() => computeBom(design, catalog).warnings.filter((w) => w.code === 'assembly_joint_missing' || w.code === 'assembly_mixed_systems'), [design, catalog])
  const asm = layout.assembly
  const plan = asm?.plan
  const root = design.assembly?.root
  const kind = design.assembly?.kind ?? 'flat'

  const emit = (next: WindowDesign, key: UndoKey) => {
    if (next === design) return
    const step = undoLabel(key)
    onChange(next, step.label, step.undo)
  }
  const differentHeights = root?.dir === 'row' && new Set(units.map((u) => u.design.height)).size > 1

  return (
    <div className={cn('flex flex-col', className)} data-assembly-settings="">
      <SettingsSection title={t(`assembly.kind.${kind}`)} aside={<span className="dim">{fmt.size(design.width, design.height)}</span>}>
        {plan ? (
          <div className="flex flex-col gap-1">
            {narrow ? <AssemblyPlan plan={plan} width={296} height={176} locale={locale} className="w-full rounded-sm bg-sunken" /> : null}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-meta">
              <dt className="text-fg-muted">{t('assembly.span')}</dt>
              <dd className="dim text-right text-fg-strong">{fmt.mm(plan.span)}</dd>
              <dt className="text-fg-muted">{t('assembly.projection')}</dt>
              <dd className="dim text-right text-fg-strong">{fmt.mm(plan.projection)}</dd>
              <dt className="text-fg-muted">{t('assembly.developed')}</dt>
              <dd className="dim text-right text-fg-strong">{fmt.mm(plan.developed)}</dd>
              {plan.radius ? (
                <>
                  <dt className="text-fg-muted">{t('assembly.radius')}</dt>
                  <dd className="dim text-right text-fg-strong">{fmt.mm(plan.radius)}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
        <div className={cn('grid gap-1.5', plan ? 'grid-cols-2' : 'grid-cols-1')}>
          <Button size="sm" variant="secondary" icon={FlipHorizontal2} onClick={() => emit(mirrorAssembly(design, catalog), 'assemblyMirror')}>
            {t('assembly.mirror')}
          </Button>
          {plan ? (
            <Button size="sm" variant="secondary" icon={FlipVertical2} onClick={() => emit(invertAssembly(design, catalog), 'assemblyInvert')}>
              {t('assembly.invert')}
            </Button>
          ) : null}
        </div>
        {warnings.length ? (
          <ul className="flex flex-col gap-1">
            {warnings.map((w, i) => (
              <li key={i} className={cn('text-meta', w.level === 'error' ? 'font-medium text-danger' : 'text-fg-muted')}>
                {w.message}
              </li>
            ))}
          </ul>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('assembly.units')}>
        <div className="flex items-center gap-1">
          <SegmentedControl aria-label={t('assembly.units')} size="sm" block className="min-w-0 flex-1" value={active?.id ?? ''} onValueChange={setActiveId} options={units.map((u) => ({ value: u.id, label: u.id }))} />
          <IconButton size="sm" variant="ghost" icon={Trash2} label={t('assembly.remove', { unit: active?.id ?? '' })} onClick={() => active && emit(removeUnit(design, active.id, catalog), 'assemblyRemove')} />
        </div>
        {differentHeights ? (
          <SegmentedControl
            aria-label={t('assembly.align')}
            size="sm"
            block
            value={root?.align ?? 'start'}
            onValueChange={(v) => root && emit(setAssemblyAlign(design, root.id, v as 'start' | 'center' | 'end', catalog), 'assemblyJoint')}
            options={[
              { value: 'start', label: t('assembly.alignTop') },
              { value: 'center', label: t('assembly.alignCenter') },
              { value: 'end', label: t('assembly.alignBottom') },
            ]}
          />
        ) : null}
      </SettingsSection>

      {active ? (
        <WindowSettings
          design={active.design}
          catalog={catalog}
          onChange={(next, label, undo) => onChange(updateUnit(design, active.id, next, catalog), label, undo)}
          below={
            <>
              {units.length > 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mb-3 justify-start px-1"
                  onClick={() => emit(mapUnitDesigns(design, (u) => setGlass(setColor(u, active.design.colorId, active.design.colorInId), null, active.design.glassId)), 'assemblyUnit')}
                >
                  {t('assembly.applyAll')}
                </Button>
              ) : null}
              {below}
            </>
          }
          folds={
            <>
              {asm?.joints.length ? (
                <Fold title={t('assembly.joints')} summary={asm.joints.length}>
                  {asm.joints.map((j) => (
                    <div key={j.id} className="flex flex-col gap-2 border-t border-divider pt-3 first:border-t-0 first:pt-0" data-joint-row={j.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-table font-medium text-fg-strong">{t('assembly.joint', { label: j.label })}</span>
                        {j.length > 0 ? <span className="dim text-meta text-fg-muted">{j.length} mm</span> : null}
                      </div>
                      <JointEditor joint={j} design={design} catalog={catalog} onEmit={emit} />
                    </div>
                  ))}
                </Fold>
              ) : null}
              {folds}
            </>
          }
        />
      ) : null}
    </div>
  )
}
