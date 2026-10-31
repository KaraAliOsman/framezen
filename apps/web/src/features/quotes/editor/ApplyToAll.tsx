/**
 * Cambiar color o vidrio de todas las ventanas en un clic (con «Deshacer»):
 * - `MatchOthers`: bajo los ajustes de la ventana, cuando las demás tienen otro color o vidrio.
 * - `AllWindowsSection`: en la pestaña Cotización, para cambiarlas todas de una vez.
 */
import { useMemo } from 'react'
import { CopyCheck } from 'lucide-react'
import type { Catalog, Color } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { ColorSwatch, ColorSwatchGroup, Field } from '../../../ui'
import { GlassPicker } from '../../designer/parts/CatalogPickers'
import { applyColorToAll, applyGlassToAll, lineHasColor, refsText, sharedValue } from '../model/bulk'
import type { QuoteEditor } from '../model/store'
import { useEditor, useEditorShallow, useSelectedItem } from './context'
import { toastUndo } from './toasts'

const colorName = (catalog: Catalog, id: string | undefined) => (id ? catalog.colors.find((c) => c.id === id)?.name : undefined)
const glassName = (catalog: Catalog, id: string | undefined) => (id ? catalog.glass.find((g) => g.id === id)?.name : undefined)

function colorLabel(catalog: Catalog, colorId: string, colorInId?: string): string {
  const out = colorName(catalog, colorId) ?? 'Ese color'
  return colorInId ? `${out} / ${(colorName(catalog, colorInId) ?? 'otro').toLowerCase()}` : out
}

export function applyColor(editor: QuoteEditor, colorId: string, colorInId?: string) {
  const { catalog } = editor.get()
  const name = colorLabel(catalog, colorId, colorInId)
  let skipped: string[] = []
  const done = editor.commit(`${name} en todas`, (doc) => {
    const result = applyColorToAll(doc, catalog, colorId, colorInId)
    skipped = result.skipped
    return result.doc
  })
  if (!done && !skipped.length) return
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  const extra = skipped.length ? ` ${refsText(skipped)} ${skipped.length === 1 ? 'quedó igual: su línea no viene' : 'quedaron igual: su línea no viene'} en ${lower}.` : ''
  if (done) toastUndo(`Todas las ventanas en ${lower}.${extra}`, () => editor.undo())
  else toastUndo(`Nada que cambiar.${extra}`, () => undefined)
}

export function applyGlass(editor: QuoteEditor, glassId: string) {
  const { catalog } = editor.get()
  const name = glassName(catalog, glassId) ?? 'Ese vidrio'
  const done = editor.commit(`${name} en todas`, (doc) => applyGlassToAll(doc, glassId).doc)
  if (done) toastUndo(`Todas las ventanas con ${name}.`, () => editor.undo())
}

/** ¿Algún paño lleva un vidrio distinto al general? */
function hasPaneGlass(design: { root?: unknown }): boolean {
  return JSON.stringify(design.root ?? null).includes('"glassId"')
}

const chip =
  'inline-flex h-8 max-w-full items-center gap-1.5 rounded-sm border border-paper-200 bg-paper-0 px-2.5 text-[13px] font-medium text-paper-900 transition-[background-color,transform] duration-120 ease-out hover:bg-paper-100 active:scale-[0.98] touch:h-10'

/** Sugerencia en línea: «Igual en las demás» cuando alguna ventana tiene otro color o vidrio. */
export function MatchOthers({ className }: { className?: string }) {
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
  const color = catalog.colors.find((c) => c.id === colorId)
  const glass = glassName(catalog, glassId)
  return (
    <div className={cn('rounded-md border border-paper-200 bg-paper-50 px-3 py-2.5', className)}>
      <p className="flex items-center gap-1.5 text-[13px] text-paper-600">
        <CopyCheck aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0 text-ink-600" />
        {colorDiffers && glassDiffers ? 'Otras ventanas tienen otro color y vidrio.' : colorDiffers ? 'Otras ventanas tienen otro color.' : 'Otras ventanas tienen otro vidrio.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {colorDiffers ? (
          <button type="button" className={chip} onClick={() => applyColor(editor, colorId, colorInId)}>
            {color ? <ColorSwatch hex={color.hex} size="sm" /> : null}
            <span className="truncate">{colorLabel(catalog, colorId, colorInId)} en todas</span>
          </button>
        ) : null}
        {glassDiffers && glass ? (
          <button type="button" className={chip} onClick={() => applyGlass(editor, glassId)}>
            <span className="truncate">{glass} en todas</span>
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
  const editor = useEditor()
  const { catalog, count, lineKey, color, glass } = useEditorShallow((s) => ({
    catalog: s.catalog,
    count: s.doc.items.length,
    lineKey: [...new Set(s.doc.items.map((i) => i.design.lineId))].join('|'),
    color: sharedValue(s.doc, (d) => (d.colorInId ? undefined : d.colorId)),
    glass: sharedValue(s.doc, (d) => (hasPaneGlass(d) ? undefined : d.glassId)),
  }))
  const colors = useMemo(() => colorsForItems(catalog, lineKey ? lineKey.split('|') : []), [catalog, lineKey])
  if (count < 2) return null
  return (
    <section className="border-b border-paper-200 px-4 py-4">
      <h3 className="text-[13px] font-semibold text-paper-900">Todas las ventanas</h3>
      <p className="mt-0.5 mb-3 text-meta text-paper-600">Cambia las {count} de una vez. Se puede deshacer.</p>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-paper-900">
          Color <span className="font-normal text-paper-600">· {color ? colorName(catalog, color) : 'distintos'}</span>
        </span>
        <ColorSwatchGroup aria-label="Color de todas las ventanas" value={color ?? ''} onValueChange={(id) => applyColor(editor, id)} colors={colors} />
      </div>
      <Field label="Vidrio" className="mt-4">
        <GlassPicker catalog={catalog} value={glass} onChange={(id) => applyGlass(editor, id)} aria-label="Vidrio de todas las ventanas" />
      </Field>
      {!glass ? <p className="mt-1.5 text-meta text-paper-600">Hoy llevan vidrios distintos.</p> : null}
    </section>
  )
}
