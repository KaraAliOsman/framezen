/**
 * Centro del editor sobre el fondo hundido: Diseño | Documento, deshacer y 3D arriba; debajo el
 * dibujo de la ventana elegida, centrado y sin cuadrícula, o el documento en vivo para el cliente.
 */
import { useRef, useState } from 'react'
import { AppWindow, Box, Download, FileText, Link2, Mail, MessageCircle, PenLine, Plus, Redo2, SlidersHorizontal, Undo2 } from 'lucide-react'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Button, EmptyState, IconButton, SaveIndicator, SegmentedControl, Toolbar, ToolbarSeparator, useToastArea } from '../../../ui'
import { cachedLayout, DesignCanvas } from '../../designer'
import { IconCutBars } from '../../../ui/icons'
import { Window3DLazy } from '../../viewer3d/lazy'
import es from '../i18n/es'
import { undoText } from '../model/history'
import { useEditor, useEditorShallow, useEditorState, useEditorUi, useSelectedItem } from './context'
import { DocumentLanguagePicker, DocumentPreview } from './DocumentPreview'
import { TemplateGalleryButton } from './TemplateGallery'
import { designUndoLabel } from './names'
import { editorSaveLabel } from './saveLabel'
import { useQuoteActions } from './useQuoteActions'
import { useQuoteWorkOrder } from './useQuoteStage'
import { useShareState } from './useQuoteStage'
import { CanvasBoundary, DocumentBoundary } from './ZoneBoundary'

export function HistoryButtons({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const t = useT(es)
  const editor = useEditor()
  const { undoLabel, redoLabel } = useEditorShallow((s) => ({
    undoLabel: s.past[s.past.length - 1]?.label ?? null,
    redoLabel: s.future[0]?.label ?? null,
  }))
  return (
    <div className="flex items-center">
      <IconButton
        icon={Undo2}
        size={size}
        label={undoLabel ? t('stage.undo', { label: undoText(undoLabel, t.locale) }) : t('stage.nothingUndo')}
        shortcut="mod+z"
        disabled={!undoLabel}
        onClick={() => editor.undo()}
      />
      <IconButton
        icon={Redo2}
        size={size}
        label={redoLabel ? t('stage.redo', { label: undoText(redoLabel, t.locale) }) : t('stage.nothingRedo')}
        shortcut="shift+mod+z"
        disabled={!redoLabel}
        onClick={() => editor.redo()}
      />
    </div>
  )
}

export function EditorSaveIndicator({ className }: { className?: string }) {
  useT(es) // se vuelve a dibujar al cambiar el idioma (la etiqueta propia se traduce aquí)
  const save = useEditorShallow((s) => ({
    status: s.save.status,
    savedAt: s.save.savedAt,
    dirty: s.save.dirty,
    message: s.save.message,
    retrying: s.save.retrying,
    local: s.save.local,
  }))
  // Con cambios esperando la pausa de escritura no mostramos nada (evita parpadeos).
  const status = save.status === 'idle' && !save.dirty && save.savedAt ? 'saved' : save.status
  return <SaveIndicator status={status} savedAt={save.savedAt} label={editorSaveLabel({ ...save, status })} className={className} />
}

export function CenterStage({ className, showInspectorToggle }: { className?: string; showInspectorToggle?: boolean }) {
  const t = useT(es)
  const editor = useEditor()
  const view = useEditorState((s) => s.view)
  const hasWindows = useEditorState((s) => s.doc.items.length > 0)
  const actions = useQuoteActions()
  const { order } = useQuoteWorkOrder()
  const setUi = useEditorUi((s) => s.set)
  const docView = view === 'document'
  const session = useSession()
  const can3d = (session.billing?.features ?? []).includes('client3d')
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  // Avisos del editor (arriba): centrados sobre el lienzo, bajo su barra.
  const stageRef = useRef<HTMLElement>(null)
  useToastArea(stageRef)

  return (
    <section ref={stageRef} aria-label={docView ? t('stage.document') : t('stage.design')} className={cn('@container flex min-h-0 min-w-0 flex-col', className)}>
      <Toolbar aria-label={t('stage.view')} variant="plain" className="h-12 shrink-0 gap-3 px-3">
        <SegmentedControl
          size="sm"
          aria-label={t('stage.view')}
          value={view}
          onValueChange={(v) => editor.setView(v)}
          className="shrink-0"
          options={[
            { value: 'design', label: t('stage.viewDesign'), icon: AppWindow },
            { value: 'document', label: t('stage.viewDocument'), icon: FileText },
          ]}
        />
        {hasWindows ? (
          <Button size="sm" variant="ghost" icon={IconCutBars} className="shrink-0" onClick={() => void actions.openCuts(order)}>
            {t('stage.viewCuts')}
          </Button>
        ) : null}
        {/* El centro cede espacio: los selectores se encogen antes de tocar los botones. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {docView ? (
            <>
              <TemplateGalleryButton className="min-w-0 shrink" />
              {/* Con la columna de ajustes a la vista, el idioma vive ahí; sin ella, queda a mano en la barra. */}
              {showInspectorToggle ? <DocumentLanguagePicker className="min-w-0 shrink" /> : null}
            </>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!docView && can3d ? (
            <>
              <IconButton
                icon={mode === '3d' ? PenLine : Box}
                size="sm"
                label={mode === '3d' ? t('stage.show2d') : t('stage.show3d')}
                aria-pressed={mode === '3d'}
                onClick={() => setMode((m) => (m === '3d' ? '2d' : '3d'))}
              />
              <ToolbarSeparator className="@max-[440px]:hidden" />
            </>
          ) : null}
          {/* Con el escenario angosto, Ctrl+Z sigue a mano: lo que no se corta es el resto de la barra. */}
          <div className="@max-[440px]:hidden">
            <HistoryButtons />
          </div>
          {showInspectorToggle ? (
            <IconButton
              icon={SlidersHorizontal}
              size="sm"
              variant="secondary"
              label={docView ? t('doc.settings') : t('stage.inspector')}
              onClick={() => setUi({ inspectorOpen: true, inspectorTab: 'item' })}
            />
          ) : null}
        </div>
      </Toolbar>
      {docView ? <DocumentToolbar /> : null}
      <div className="relative min-h-0 flex-1">
        {docView ? (
          <DocumentBoundary>
            <DocumentPreview />
          </DocumentBoundary>
        ) : (
          <CanvasBoundary>{mode === '3d' && can3d ? <Stage3D /> : <DesignStage />}</CanvasBoundary>
        )}
      </div>
    </section>
  )
}

/**
 * Barra de la vista Documento (SPEC §5): escala de la hoja y las cuatro acciones para el cliente.
 * Si el enlace ya muestra esta cotización, copiar, WhatsApp y correo van directo; si no, abren
 * «Enviar al cliente», que crea la versión siguiente.
 */
function DocumentToolbar() {
  const t = useT(es)
  const zoom = useEditorUi((s) => s.docZoom)
  const setUi = useEditorUi((s) => s.set)
  const actions = useQuoteActions()
  const share = useShareState()
  // Copiar nunca crea una versión nueva: copia el enlace vigente o abre «Enviar al cliente».
  const copy = actions.copyLink

  // Bajo ~670 px de ancho quedan solo los iconos (con su nombre accesible y tooltip nativo).
  const label = (text: string) => <span className="@max-2xl:sr-only">{text}</span>
  const iconClass = '@max-2xl:px-2'

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 px-3">
      <SegmentedControl
        size="sm"
        aria-label={t('doc.zoom')}
        value={zoom}
        onValueChange={(v) => setUi({ docZoom: v })}
        className="shrink-0"
        options={[
          { value: 'fit', label: t('doc.fit') },
          { value: 'actual', label: t('doc.actual') },
        ]}
      />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button size="sm" icon={Download} onClick={() => void actions.downloadPdf()} loading={actions.busy === 'pdf'} title={t('doc.pdf')} className={iconClass}>
          {label(t('doc.pdf'))}
        </Button>
        <Button size="sm" icon={Link2} onClick={() => void copy()} title={t('doc.copy')} className={iconClass}>
          {label(t('doc.copy'))}
        </Button>
        {share.whatsappHref ? (
          <Button asChild size="sm" className={iconClass}>
            <a href={share.whatsappHref} target="_blank" rel="noreferrer" title={t('doc.whatsapp')}>
              <MessageCircle aria-hidden strokeWidth={1.75} />
              {label(t('doc.whatsapp'))}
            </a>
          </Button>
        ) : (
          <Button size="sm" icon={MessageCircle} onClick={actions.openSend} title={t('doc.whatsapp')} className={iconClass}>
            {label(t('doc.whatsapp'))}
          </Button>
        )}
        {share.mailtoHref ? (
          <Button asChild size="sm" className={iconClass}>
            <a href={share.mailtoHref} title={t('doc.mail')}>
              <Mail aria-hidden strokeWidth={1.75} />
              {label(t('doc.mail'))}
            </a>
          </Button>
        ) : (
          <Button size="sm" icon={Mail} onClick={actions.openSend} title={t('doc.mail')} className={iconClass}>
            {label(t('doc.mail'))}
          </Button>
        )}
      </div>
    </div>
  )
}

function EmptyStage() {
  const t = useT(es)
  const count = useEditorState((s) => s.doc.items.length)
  const setUi = useEditorUi((s) => s.set)
  return (
    <div className="grid h-full place-items-center p-8">
      <EmptyState
        title={count ? t('stage.chooseItem') : t('stage.firstItem')}
        description={count ? t('stage.chooseItemHint') : t('stage.firstItemHint')}
        action={
          <Button variant={count ? 'secondary' : 'primary'} icon={Plus} shortcut="a" onClick={() => setUi({ pickerOpen: true })}>
            {t('items.add')}
          </Button>
        }
      />
    </div>
  )
}

function DesignStage() {
  const editor = useEditor()
  const { item } = useSelectedItem()
  const { catalog, selectedNodeId } = useEditorShallow((s) => ({ catalog: s.catalog, selectedNodeId: s.selectedNodeId }))
  const [view, setView] = useState<'interior' | 'exterior'>('interior')

  if (!item) return <EmptyStage />

  return (
    <div data-quote-canvas className="absolute inset-0">
      <DesignCanvas
        key={item.id}
        design={item.design}
        catalog={catalog}
        onChange={(next, label, ...rest: unknown[]) => editor.updateDesign(item.id, () => next, designUndoLabel(label, rest[0], item.ref))}
        selectedNodeId={selectedNodeId}
        onSelect={(id) => editor.selectNode(id)}
        view={view}
        onViewChange={setView}
        className="h-full w-full bg-sunken!"
      />
    </div>
  )
}

/** Vista 3D de la ventana elegida (plan con visor 3D): misma geometría y colores que el dibujo. */
function Stage3D() {
  const { item } = useSelectedItem()
  const catalog = useEditorState((s) => s.catalog)
  if (!item) return <EmptyStage />
  const layout = cachedLayout(item.design, catalog)
  // Sin geometría (diseño a medio armar) se queda en el dibujo, que sabe mostrar el aviso.
  if (!layout) return <DesignStage />
  return (
    <div className="absolute inset-0 p-4">
      <Window3DLazy key={item.id} layout={layout} design={item.design} catalog={catalog} height="100%" className="h-full w-full rounded-md" />
    </div>
  )
}
