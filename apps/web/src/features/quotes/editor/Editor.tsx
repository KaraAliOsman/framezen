/**
 * Editor de cotización (SPEC §5): tres zonas en escritorio, lista + hojas en el teléfono.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import type { TypologyId, WindowDesign } from '@framezen/engine'
import { usePageTitle } from '../../../lib/usePageTitle'
import { Sheet, SheetContent } from '../../../ui'
import { useAssistantPanelState, useAssistantPlace } from '../../assistant/dock'
import { defaultGlassId, TypologyPicker } from '../../designer'
import { CenterStage } from './CenterStage'
import { useEditor, useEditorShallow, useEditorState, useEditorUi, useMediaQuery } from './context'
import { Inspector, ItemInspector, QuoteInspector } from './Inspector'
import { ItemsColumn } from './ItemsColumn'
import { MobileEditor } from './MobileEditor'
import { PriceDriftNotice } from './PriceDriftNotice'
import { SendDialog } from './SendDialog'
import { TotalsFooter } from './TotalsFooter'
import { useAssistantBridge, useEditorShortcuts, useLeaveGuard } from './useEditorWiring'
import { InspectorBoundary } from './ZoneBoundary'

export function Editor() {
  const desktop = useMediaQuery('(min-width: 1024px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  // Con Marco abierto en escritorio, su panel (368 px + margen) tiene su propio espacio: nunca
  // tapa el lienzo ni el inspector. Si no caben las tres columnas, el inspector pasa a hoja.
  const roomy = useMediaQuery('(min-width: 1720px)')
  const marcoOpen = useAssistantPanelState() === 'open'
  // Bajo xl Marco se acopla en la columna de ventanas (data-assistant-place="items"): no pide columna propia.
  const marcoPlace = useAssistantPlace()
  const marcoReserve = marcoOpen && marcoPlace !== 'items'
  const inspectorColumn = wide && (!marcoOpen || roomy)
  // En la vista Documento el inspector (ajustes de la ventana) sobra: su ancho es para la hoja.
  const docView = useEditorState((s) => s.view === 'document')
  const title = useEditorState((s) => (s.doc.title.trim() ? s.doc.title.trim() : `Cotización N° ${s.meta.number}`))
  usePageTitle(title)
  useEditorShortcuts()
  useAssistantBridge()
  useLeaveGuard()

  return (
    <>
      {desktop ? (
        <div className="flex h-full min-h-0 flex-col">
          <PriceDriftNotice />
          <div className="flex min-h-0 flex-1">
            <ItemsColumn className="w-[264px] shrink-0 xl:w-[280px]" />
            <CenterStage className="min-w-0 flex-1" showInspectorToggle={!inspectorColumn} />
            {docView ? null : inspectorColumn ? (
              <InspectorBoundary className="w-[320px] shrink-0 border-l border-paper-200">
                <Inspector className="w-[320px] shrink-0" />
              </InspectorBoundary>
            ) : (
              <InspectorSheet />
            )}
            {marcoReserve ? <div aria-hidden data-assistant-dock="" className="w-[var(--fz-assistant-inset,380px)] shrink-0 border-l border-paper-200 bg-paper-50" /> : null}
          </div>
          <TotalsFooter />
        </div>
      ) : (
        <MobileEditor />
      )}
      <PickerHost />
      <SendDialog />
    </>
  )
}

function InspectorSheet() {
  const open = useEditorUi((s) => s.inspectorOpen)
  const setUi = useEditorUi((s) => s.set)
  const hasItem = useEditorState((s) => !!s.selectedItemId)
  return (
    <Sheet open={open} onOpenChange={(o) => setUi({ inspectorOpen: o })}>
      <SheetContent title={hasItem ? 'Ventana' : 'Cotización'} side="right" width={360} modal={false} className="right-[var(--fz-assistant-inset,0px)]!">
        <div className="-m-5">
          <InspectorBoundary>{hasItem ? <ItemInspector /> : <QuoteInspector />}</InspectorBoundary>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Galería de tipologías: hereda línea, color y vidrio de la ventana elegida (o de la última). En
 * una cotización vacía usa la línea y el color de tus ajustes y el termopanel de siempre
 * (DVH 4+12+4 incoloro, o el DVH más común de tu catálogo).
 */
function PickerHost() {
  const editor = useEditor()
  const open = useEditorUi((s) => s.pickerOpen)
  const setUi = useEditorUi((s) => s.set)
  const { catalog, defaults } = useEditorShallow((s) => {
    const ref = s.doc.items.find((i) => i.id === s.selectedItemId) ?? s.doc.items[s.doc.items.length - 1]
    const settings = s.settings.defaults
    return {
      catalog: s.catalog,
      defaults: ref
        ? `${ref.design.lineId}|${ref.design.colorId}|${ref.design.glassId}|${settings?.lineId ?? ''}`
        : `${settings?.lineId ?? ''}|${settings?.colorId ?? ''}|${defaultGlassId(s.catalog, settings?.glassId ?? undefined)}|`,
    }
  })
  const [lineId, colorId, glassId, fallbackLineId] = defaults.split('|')
  const fresh = (useLocation().state as { nueva?: boolean } | null)?.nueva === true

  // Una cotización recién creada abre la galería de inmediato (agregar = tipología, medidas, Enter).
  useEffect(() => {
    const state = editor.get()
    const recent = Date.now() - new Date(state.meta.createdAt).getTime() < 60_000
    if (state.doc.items.length === 0 && state.past.length === 0 && (fresh || recent)) setUi({ pickerOpen: true })
  }, [editor, setUi, fresh])

  return (
    <TypologyPicker
      open={open}
      onOpenChange={(o) => setUi({ pickerOpen: o })}
      catalog={catalog}
      defaults={{ lineId: lineId || undefined, colorId: colorId || undefined, glassId: glassId || undefined, fallbackLineId: fallbackLineId || undefined }}
      onCreate={(design: WindowDesign, meta: { typologyId: TypologyId; qty: number }) => {
        editor.addItem({ design, qty: meta.qty })
        editor.setView('design')
        setUi({ pickerOpen: false })
      }}
    />
  )
}
