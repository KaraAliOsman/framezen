/**
 * Cambiar color o vidrio de todas las ventanas en un clic (con «Deshacer»):
 * - `MatchOthers`: bajo los ajustes de la ventana, cuando las demás tienen otro color o vidrio.
 * - `AllWindowsSection`: en la pestaña Cotización, para cambiarlas todas de una vez.
 * Los colores se muestran con su muestra realista (foliado con veta, metalizado o liso).
 */
import { useMemo } from 'react'
import { CopyCheck } from 'lucide-react'
import type { Catalog, Color } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { getFormatter, translate, useT } from '../../../lib/i18n'
import { ColorSwatch, ColorSwatchGroup, Field, InspectorSection } from '../../../ui'
import { GlassPicker } from '../../designer/parts/CatalogPickers'
import es from '../i18n/es'
import { applyColorToAll, applyGlassToAll, lineHasColor, sharedValue } from '../model/bulk'
import { ql } from '../model/history'
import type { QuoteEditor } from '../model/store'
import { useEditor, useEditorShallow, useSelectedItem } from './context'
import { colorSwatch } from './names'
import { toastUndo } from './toasts'

const colorName = (catalog: Catalog, id: string | undefined) => (id ? catalog.colors.find((c) => c.id === id)?.name : undefined)
const glassName = (catalog: Catalog, id: string | undefined) => (id ? catalog.glass.find((g) => g.id === id)?.name : undefined)

/** «Nogal» o, bicolor, «Nogal / blanco» (exterior / interior). Los nombres del catálogo no se traducen. */
function colorLabel(catalog: Catalog, colorId: string, colorInId?: string): string {
  const out = colorName(catalog, colorId) ?? translate(es, 'bulk.someColor')
  return colorInId ? translate(es, 'bulk.colorPair', { out, in: colorName(catalog, colorInId) ?? translate(es, 'bulk.other') }) : out
}

export function applyColor(editor: QuoteEditor, colorId: string, colorInId?: string) {
  const { catalog } = editor.get()
  const name = colorLabel(catalog, colorId, colorInId)
  let skipped: string[] = []
  const done = editor.commit(ql('history.applyAll', { name }), (doc) => {
    const result = applyColorToAll(doc, catalog, colorId, colorInId)
    skipped = result.skipped
    return result.doc
  })
  if (!done && !skipped.length) return
  const extra = skipped.length ? ` ${translate(es, 'bulk.skipped', { refs: getFormatter().list(skipped), count: skipped.length, name })}` : ''
  if (done) toastUndo(`${translate(es, 'bulk.allDone', { name })}${extra}`, () => editor.undo())
  else toastUndo(`${translate(es, 'bulk.nothing')}${extra}`, () => undefined)
}

export function applyGlass(editor: QuoteEditor, glassId: string) {
  const { catalog } = editor.get()
  const name = glassName(catalog, glassId) ?? translate(es, 'bulk.someGlass')
  const done = editor.commit(ql('history.applyAll', { name }), (doc) => applyGlassToAll(doc, glassId).doc)
  if (done) toastUndo(translate(es, 'bulk.glassDone', { name }), () => editor.undo())
}

/** ¿Algún paño lleva un vidrio distinto al general? */
function hasPaneGlass(design: { root?: unknown }): boolean {
  return JSON.stringify(design.root ?? null).includes('"glassId"')
}

const chip =
  'inline-flex h-8 max-w-full items-center gap-1.5 rounded-sm border border-divider-strong bg-surface px-2.5 text-table font-medium text-fg-strong transition-[background-color,transform] duration-100 ease-out hover:bg-hover active:scale-[0.98] touch:h-10'

/** Sugerencia en línea: «Igual en las demás» cuando alguna ventana tiene otro color o vidrio. */
export function MatchOthers({ className }: { className?: string }) {
  const t = useT(es)
  const editor = useEditor()
  const { item } = useSelectedItem()
  // Solo primitivos en el selector (comparación superficial estable).
  const { catalog, colorDiffers, glassDiffers } = useEditorShallow((s) => {
    const current = s.doc.items.find((i) => i.id === s.selectedItemId)?.design
    const others = s.doc.items.filter((i) => i.id !== s.selectedItemId).map((i) => i.design)
    return {
      catalog: s.catalog,
      colorDiffers: !!current && others.some((d) => (d.colorId !== current.colorId || d.colorInId !== current.colorInId) && lineHasColor(s.catalog, d, current.colorId)),
      glassDiffers: !!current && others.some((d) => d.glassId !== current.glassId || hasPaneGlass(d)),
    }
  })
  if (!item || (!colorDiffers && !glassDiffers)) return null
  const { colorId, colorInId, glassId } = item.design
  const color = colorSwatch(catalog.colors.find((c) => c.id === colorId))
  const colorIn = colorInId ? colorSwatch(catalog.colors.find((c) => c.id === colorInId)) : undefined
  const glass = glassName(catalog, glassId)
  return (
    <div className={cn('pt-1', className)}>
      <p className="flex items-center gap-1.5 text-table text-fg-muted">
        <CopyCheck aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0 text-accent-ink" />
        {colorDiffers && glassDiffers ? t('bulk.differsBoth') : colorDiffers ? t('bulk.differsColor') : t('bulk.differsGlass')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {colorDiffers ? (
          <button type="button" className={chip} onClick={() => applyColor(editor, colorId, colorInId)}>
            {color ? <ColorSwatch hex={color.hex} image={color.image} hexIn={colorIn && !colorIn.image ? colorIn.hex : undefined} size="sm" /> : null}
            <span className="truncate">{t('bulk.inAll', { name: colorLabel(catalog, colorId, colorInId) })}</span>
          </button>
        ) : null}
        {glassDiffers && glass ? (
          <button type="button" className={chip} onClick={() => applyGlass(editor, glassId)}>
            <span className="truncate">{t('bulk.inAll', { name: glass })}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Colores que fabrica al menos una línea de la cotización (en el orden del catálogo). */
function colorsForItems(catalog: Catalog, lineIds: string[]): Color[] {
  const lines = catalog.lines.filter((l) => lineIds.includes(l.id))
  if (!lines.length || lines.some((l) => !l.colorIds?.length)) return catalog.colors
  const allowed = new Set(lines.flatMap((l) => l.colorIds))
  const list = catalog.colors.filter((c) => allowed.has(c.id))
  return list.length ? list : catalog.colors
}

/** Pestaña Cotización: color y vidrio para todas las ventanas a la vez. */
export function AllWindowsSection() {
  const t = useT(es)
  const editor = useEditor()
  const { catalog, count, lineKey, color, glass } = useEditorShallow((s) => ({
    catalog: s.catalog,
    count: s.doc.items.length,
    lineKey: [...new Set(s.doc.items.map((i) => i.design.lineId))].join('|'),
    color: sharedValue(s.doc, (d) => (d.colorInId ? undefined : d.colorId)),
    glass: sharedValue(s.doc, (d) => (hasPaneGlass(d) ? undefined : d.glassId)),
  }))
  const colors = useMemo(
    () => colorsForItems(catalog, lineKey ? lineKey.split('|') : []).map((c) => ({ id: c.id, name: c.name, ...colorSwatch(c)! })),
    [catalog, lineKey],
  )
  if (count < 2) return null
  return (
    <InspectorSection title={t('bulk.allTitle')} collapsible defaultOpen={false}>
      <div className="flex flex-col gap-2">
        <span className="text-table font-medium text-fg">
          {t('bulk.color')} <span className="font-normal text-fg-muted">· {color ? colorName(catalog, color) : t('bulk.colorMixed')}</span>
        </span>
        <ColorSwatchGroup aria-label={t('bulk.colorAria')} value={color ?? ''} onValueChange={(id) => applyColor(editor, id)} colors={colors} size="lg" />
      </div>
      <Field label={t('bulk.glass')}>
        <GlassPicker catalog={catalog} value={glass} onChange={(id) => applyGlass(editor, id)} aria-label={t('bulk.glassAria')} />
      </Field>
      {!glass ? <p className="-mt-1.5 text-meta text-fg-muted">{t('bulk.glassMixed')}</p> : null}
    </InspectorSection>
  )
}
