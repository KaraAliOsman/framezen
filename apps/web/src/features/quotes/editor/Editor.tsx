/**
 * Editor de cotización. En escritorio: cabecera en la barra superior (obra, cliente, estado y la acción
 * principal de la etapa), lo que pidió el cliente si hay algo pendiente, y debajo un solo campo
 * hundido con las ventanas y la ventana realista o el documento, el inspector blanco a la derecha y
 * el resumen comercial a todo el ancho, con el total abajo a la derecha. En el teléfono: lista + hojas.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import type { WindowDesign } from '@dekopen/engine'
import { TopbarPortal } from '../../../app/shell/TopbarSlot'
import { useT } from '../../../lib/i18n'
import { usePageTitle } from '../../../lib/usePageTitle'
import { Sheet, SheetContent } from '../../../ui'
import { useAssistantPanelState } from '../../assistant/dock'
import { defaultGlassId, TypologyPicker, type PickerCreateMeta } from '../../designer'
import es from '../i18n/es'
import { DuplicateDialog } from '../DuplicateDialog'
import { CenterStage } from './CenterStage'
import { ClientRequestNotice } from './ClientRequestNotice'
import { DocumentColumn, DocumentSettings } from './DocumentSettings'
import { useEditor, useEditorShallow, useEditorState, useEditorUi, useMediaQuery } from './context'
import { EditorHeader } from './EditorHeader'
import { Inspector, ItemInspector, QuoteInspector } from './Inspector'
import { ItemsColumn } from './ItemsColumn'
import { MobileEditor } from './MobileEditor'
import { PriceDriftNotice } from './PriceDriftNotice'
import { SendDialog } from './SendDialog'
import { TemplateGalleryDialog } from './TemplateGallery'
import { TotalsFooter } from './TotalsFooter'
import { useQuoteActions } from './useQuoteActions'
import { useAssistantBridge, useEditorShortcuts, useLeaveGuard } from './useEditorWiring'
import { InspectorBoundary } from './ZoneBoundary'

export function Editor() {
  const t = useT(es)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  // Con el asistente abierto a la derecha, la hoja entera le cede su lugar (`.fz-sheet-gutter` del
  // shell): cabecera, cuenta y total quedan a la vista. Si no caben las tres columnas, el inspector
  // pasa a hoja. Bajo xl el asistente se acopla en la columna de ventanas y no pide espacio.
  const roomy = useMediaQuery('(min-width: 1720px)')
  const botOpen = useAssistantPanelState() === 'open'
  const inspectorColumn = wide && (!botOpen || roomy)
  // En la vista Documento el inspector de la ventana se reemplaza por los ajustes del documento.
  const docView = useEditorState((s) => s.view === 'document')
  const title = useEditorState((s) => (s.doc.title.trim() ? s.doc.title.trim() : t('page.titleNumber', { number: s.meta.number })))
  usePageTitle(title)
  useEditorShortcuts()
  useAssistantBridge()
  useLeaveGuard()

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {desktop ? (
        <div className="flex h-full min-h-0 flex-col bg-canvas">
          <TopbarPortal fallback={<EditorHeader className="shrink-0 px-3" />}>
            <EditorHeader />
          </TopbarPortal>
          <ClientRequestNotice />
          <PriceDriftNotice />
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 bg-sunken">
                <ItemsColumn className="w-[264px] shrink-0 xl:w-[272px]" />
                <CenterStage className="min-w-0 flex-1" showInspectorToggle={!inspectorColumn} />
                {inspectorColumn ? (
                  <InspectorBoundary className="w-[328px] shrink-0">
                    {docView ? <DocumentColumn className="flex h-full min-h-0 w-[328px] shrink-0 flex-col bg-surface" /> : <Inspector className="h-full w-[328px] shrink-0" />}
                  </InspectorBoundary>
                ) : (
                  <InspectorSheet />
                )}
              </div>
              <TotalsFooter />
            </div>
          </div>
        </div>
      ) : (
        <MobileEditor />
      )}
      <PickerHost />
      <DuplicateHost />
      <SendDialog />
      <TemplateGalleryDialog />
    </>
  )
}

function InspectorSheet() {
  const t = useT(es)
  const open = useEditorUi((s) => s.inspectorOpen)
  const tab = useEditorUi((s) => s.inspectorTab)
  const setUi = useEditorUi((s) => s.set)
  const hasItem = useEditorState((s) => !!s.selectedItemId)
  const docView = useEditorState((s) => s.view === 'document')
  const showItem = hasItem && tab === 'item'
  const title = docView ? t('doc.settings') : showItem ? t('inspector.sheetItem') : t('inspector.sheetQuote')
  return (
    <Sheet open={open} onOpenChange={(o) => setUi({ inspectorOpen: o })}>
      <SheetContent title={title} side="right" width={360} modal={false} className="right-[var(--fz-assistant-inset,0px)]!">
        <div className={docView ? undefined : '-m-5'}>
          <InspectorBoundary>{docView ? <DocumentSettings /> : showItem ? <ItemInspector /> : <QuoteInspector />}</InspectorBoundary>
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
      onCreate={(design: WindowDesign, meta: PickerCreateMeta) => {
        editor.addItem({ design, qty: meta.qty })
        editor.setView('design')
        if (!meta.keepOpen) setUi({ pickerOpen: false })
      }}
      onCreateMany={(entries) => {
        editor.addItems(entries.map(({ design, meta }) => ({ design, qty: meta.qty })))
        editor.setView('design')
        setUi({ pickerOpen: false })
      }}
    />
  )
}

/** «Duplicar para…» desde el menú de la cotización: espera el autoguardado y abre la copia. */
function DuplicateHost() {
  const open = useEditorUi((s) => s.duplicateOpen)
  const setUi = useEditorUi((s) => s.set)
  const actions = useQuoteActions()
  const { id, number, title, clientId } = useEditorShallow((s) => ({ id: s.meta.id, number: s.meta.number, title: s.doc.title, clientId: s.doc.clientId }))
  return <DuplicateDialog source={open ? { id, number, title, clientId } : null} onClose={() => setUi({ duplicateOpen: false })} run={actions.duplicateQuote} />
}
