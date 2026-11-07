/**
 * Barra flotante de lo elegido en la hoja: mover, ocultar, duplicar, salto de hoja y lo propio de cada
 * sección (diseño, columnas, tamaño del dibujo, datos). Es la misma en una plantilla y en una
 * cotización: emite `DocOp` y quien la aloja decide dónde se guardan.
 */
import { forwardRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Copy, EyeOff, FilePlus2, GripVertical, ImageIcon, ListChecks, Settings2 } from 'lucide-react'
import {
  DRAWING_SIZES,
  ITEM_DRAWING_SIZES,
  LAYOUT_RULES,
  LETTERHEAD_LAYOUTS,
  LOGO_SIZES,
  resolveDocSettings,
  sectionLabel,
  variantLabel,
  type DocOp,
  type DocSection,
  type DocTemplate,
  type ItemsOptions,
} from '@dekopen/shared'
import { useLocale, useT } from '../../../lib/i18n'
import { IconButton, Popover, PopoverContent, PopoverTrigger, SegmentedControl, Select } from '../../../ui'
import { ItemFields } from '../editor/DocControls'
import { PagePanel } from '../editor/PagePanel'
import { SectionInspector, isOptionField } from '../editor/SectionInspector'
import { isRequired } from '../editor/SectionsPanel'
import es from '../i18n/es'
import { sectionVariants } from '../model/sectionForm'
import { IDENTITY_ID, PAGE_CHROME_ID, canDuplicate, stepOp, type CanvasScope } from './model'

export interface SectionBarProps {
  template: DocTemplate
  scope: CanvasScope
  /** Id elegido: una sección, el encabezado o la cabecera y pie. */
  selectedId: string
  readOnly: boolean
  onOps: (ops: DocOp[], mergeKey?: string) => void
  onDragStart: (event: ReactPointerEvent) => void
  /** Abre la elección de imagen del logo. */
  onChangeLogo: () => void
  style?: React.CSSProperties
}

const Divider = () => <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-divider" />

function Panel({ label, icon, children, wide }: { label: string; icon: typeof Settings2; children: ReactNode; wide?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton icon={icon} size="sm" label={label} />
      </PopoverTrigger>
      <PopoverContent flush align="end" className={wide ? 'scrollbar-quiet max-h-[min(70vh,560px)] w-[336px] overflow-y-auto' : 'w-[300px] p-3'}>
        {children}
      </PopoverContent>
    </Popover>
  )
}

export const SectionBar = forwardRef<HTMLDivElement, SectionBarProps>(function SectionBar({ template, scope, selectedId, readOnly, onOps, onDragStart, onChangeLogo, style }, ref) {
  const t = useT(es)
  const { locale } = useLocale()
  const section = template.sections.find((s) => s.id === selectedId) ?? null

  const shell = (children: ReactNode) => (
    <div ref={ref} role="toolbar" aria-label={t('canvas.sectionBar')} data-selection-bar="" data-canvas-overlay="" style={style} className="scrollbar-quiet fixed z-40 flex h-10 max-w-[calc(100vw-16px)] items-center gap-0.5 overflow-x-auto rounded-sm bg-raised px-1 shadow-float">
      {children}
    </div>
  )

  if (selectedId === IDENTITY_ID) {
    const settings = resolveDocSettings(template.settings)
    const set = (patch: Record<string, unknown>) => onOps([{ op: 'setDocSettings', patch } as DocOp])
    return shell(
      <>
        <span className="truncate px-1.5 text-table font-medium text-fg-strong">{t('canvas.identity')}</span>
        <Divider />
        <Select size="sm" className="w-32" aria-label={t('doc.letterhead')} value={settings.letterhead} disabled={readOnly} onValueChange={(letterhead) => set({ letterhead })} options={LETTERHEAD_LAYOUTS.map((v) => ({ value: v, label: t(`doc.letterheads.${v}`) }))} />
        <Select size="sm" className="w-28" aria-label={t('doc.logoSize')} value={settings.logoSize} disabled={readOnly} onValueChange={(logoSize) => set({ logoSize })} options={LOGO_SIZES.map((v) => ({ value: v, label: t(`doc.sizes.${v}`) }))} />
        <Divider />
        <IconButton icon={ImageIcon} size="sm" label={t('canvas.changeLogo')} disabled={readOnly} onClick={onChangeLogo} />
        <IconButton icon={EyeOff} size="sm" label={settings.showLogo ? t('canvas.hideEl', { name: t('options.showLogo') }) : t('canvas.showEl', { name: t('options.showLogo') })} aria-pressed={!settings.showLogo} disabled={readOnly} onClick={() => set({ showLogo: !settings.showLogo })} />
      </>,
    )
  }

  if (selectedId === PAGE_CHROME_ID) {
    return shell(
      <>
        <span className="truncate px-1.5 text-table font-medium text-fg-strong">{t('canvas.pageChrome')}</span>
        <Divider />
        <Panel label={t('canvas.settings')} icon={Settings2} wide>
          <PagePanel template={template} readOnly={readOnly} onOps={onOps} />
        </Panel>
      </>,
    )
  }

  if (!section) return null
  return shell(<Controls section={section} template={template} scope={scope} readOnly={readOnly} onOps={onOps} onDragStart={onDragStart} locale={locale} />)
})

function Controls({ section, template, scope, readOnly, onOps, onDragStart, locale }: { section: DocSection; template: DocTemplate; scope: CanvasScope; readOnly: boolean; onOps: SectionBarProps['onOps']; onDragStart: SectionBarProps['onDragStart']; locale: string }) {
  const t = useT(es)
  const up = stepOp(template, section.id, -1)
  const down = stepOp(template, section.id, 1)
  const required = isRequired(template, section)
  const movable = section.type !== 'cover'
  const variants = sectionVariants(section.type)
  const variant = (section.options as { variant?: string }).variant
  const setOption = (options: Record<string, unknown>) => onOps([{ op: 'updateSectionOptions', sectionId: section.id, options }])
  const items = section.type === 'items' ? (section.options as ItemsOptions) : null
  const columns = (section.options as { columns?: number }).columns
  const rule = section.type === 'items' || section.type === 'gallery' || section.type === 'product_cards' ? (LAYOUT_RULES[section.type] as Record<string, { columns: readonly number[] }>)[variant ?? ''] : undefined
  const sizes = items ? (LAYOUT_RULES.items[items.variant].sizes?.[items.columns] ?? DRAWING_SIZES) : []
  const swatch = (section.options as { swatchSize?: string }).swatchSize

  return (
    <>
      {movable && !readOnly ? (
        <button
          type="button"
          aria-label={t('canvas.drag')}
          title={t('canvas.drag')}
          onPointerDown={onDragStart}
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-xs text-fg-muted hover:bg-hover hover:text-fg-strong active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      ) : null}
      <span className="max-w-40 shrink-0 truncate px-1 text-table font-medium text-fg-strong">{section.title?.trim() || sectionLabel(section.type, locale)}</span>
      {readOnly ? null : (
        <>
          <Divider />
          {movable ? (
            <>
              <IconButton icon={ArrowUp} size="sm" label={t('canvas.moveUp')} disabled={!up} onClick={() => up && onOps([up])} />
              <IconButton icon={ArrowDown} size="sm" label={t('canvas.moveDown')} disabled={!down} onClick={() => down && onOps([down])} />
              <Divider />
            </>
          ) : null}
          {variants.length > 1 ? (
            <Select<string>
              size="sm"
              className="w-32"
              aria-label={t('inspector.variant')}
              value={variant ?? ''}
              onValueChange={(next) => setOption({ variant: next })}
              options={variants.map((v) => ({ value: v, label: variantLabel(v, locale) }))}
            />
          ) : null}
          {rule && rule.columns.length > 1 && columns ? (
            <SegmentedControl
              size="sm"
              aria-label={t('options.columns')}
              value={String(columns)}
              onValueChange={(v) => setOption({ columns: Number(v) })}
              options={rule.columns.map((c) => ({ value: String(c), label: String(c) }))}
              className="shrink-0"
            />
          ) : null}
          {items ? (
            <Select<string>
              size="sm"
              className="w-28"
              aria-label={t('options.drawingSize')}
              value={items.drawingSize}
              onValueChange={(drawingSize) => onOps([{ op: 'setItemDisplay', patch: { drawingSize } } as DocOp])}
              options={ITEM_DRAWING_SIZES.filter((v) => v === 'none' || (sizes as readonly string[]).includes(v)).map((v) => ({ value: v, label: t(`values.drawingSize.${v}`) }))}
            />
          ) : null}
          {swatch ? (
            <SegmentedControl
              size="sm"
              aria-label={t('options.swatchSize')}
              value={swatch}
              onValueChange={(swatchSize) => setOption({ swatchSize })}
              options={(['s', 'm', 'l'] as const).map((v) => ({ value: v, label: v.toUpperCase() }))}
              className="shrink-0"
            />
          ) : null}
          {items ? (
            <Panel label={t('doc.itemData')} icon={ListChecks}>
              <ItemFields items={items} readOnly={false} onOps={onOps} />
            </Panel>
          ) : null}
          {canDuplicate(scope, template, section) ? <IconButton icon={Copy} size="sm" label={t('canvas.duplicate')} onClick={() => onOps([{ op: 'duplicateSection', sectionId: section.id }])} /> : null}
          {section.type !== 'cover' && section.type !== 'page_break' ? (
            <IconButton icon={FilePlus2} size="sm" label={t('inspector.pageBreak')} aria-pressed={section.pageBreak === 'before'} onClick={() => onOps([{ op: 'updateSection', sectionId: section.id, patch: { pageBreak: section.pageBreak === 'before' ? 'auto' : 'before' } }])} />
          ) : null}
          {required ? null : <IconButton icon={EyeOff} size="sm" label={t('canvas.hide')} onClick={() => onOps([{ op: 'toggleSection', sectionId: section.id, enabled: false }])} />}
          {isOptionField(section) ? (
            <Panel label={t('canvas.settings')} icon={Settings2} wide>
              <SectionInspector template={template} section={section} readOnly={false} scope={scope} onOps={onOps} />
            </Panel>
          ) : null}
        </>
      )}
    </>
  )
}
