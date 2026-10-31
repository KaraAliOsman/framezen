/**
 * Centro del editor: segmentado Diseño | Documento.
 * Diseño = lienzo interactivo de la ventana seleccionada. Documento = vista previa en vivo.
 */
import { useRef, useState } from 'react'
import { AppWindow, Download, FileText, Link2, Mail, MessageCircle, Plus, Redo2, SlidersHorizontal, Undo2 } from 'lucide-react'
import { designName, formatSize } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { Button, IconButton, SaveIndicator, SegmentedControl, Kbd, useToastArea } from '../../../ui'
import { DesignCanvas } from '../../designer'
import { useEditor, useEditorShallow, useEditorState, useEditorUi, useSelectedItem } from './context'
import { DocumentPreview, TemplatePicker } from './DocumentPreview'
import { editorSaveLabel } from './saveLabel'
import { useQuoteActions } from './useQuoteActions'
import { useShareState } from './useQuoteStage'
import { CanvasBoundary, DocumentBoundary } from './ZoneBoundary'

export function HistoryButtons({ size = 'sm' }: { size?: 'sm' | 'md' }) {
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
        label={undoLabel ? `Deshacer: ${undoLabel}` : 'Nada que deshacer'}
        shortcut="mod+z"
        disabled={!undoLabel}
        onClick={() => editor.undo()}
      />
      <IconButton
        icon={Redo2}
        size={size}
        label={redoLabel ? `Rehacer: ${redoLabel}` : 'Nada que rehacer'}
        shortcut="shift+mod+z"
        disabled={!redoLabel}
        onClick={() => editor.redo()}
      />
    </div>
  )
}

export function EditorSaveIndicator({ className }: { className?: string }) {
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
  const editor = useEditor()
  const view = useEditorState((s) => s.view)
  const setUi = useEditorUi((s) => s.set)
  const docView = view === 'document'
  // Avisos del editor (arriba): centrados sobre el lienzo, bajo su cabecera y la fila Interior | Exterior.
  const stageRef = useRef<HTMLElement>(null)
  useToastArea(stageRef)

  return (
    <section
      ref={stageRef}
      aria-label={docView ? 'Documento para el cliente' : 'Diseño de la ventana'}
      className={cn('@container flex min-h-0 min-w-0 flex-col bg-paper-50', className)}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-paper-200 bg-paper-50 px-3">
        <SegmentedControl
          aria-label="Vista"
          value={view}
          onValueChange={(v) => editor.setView(v)}
          className="shrink-0"
          options={[
            { value: 'design', label: 'Diseño', icon: AppWindow },
            { value: 'document', label: 'Documento', icon: FileText },
          ]}
        />
        {/* El centro cede espacio: el selector de plantilla se encoge antes de tocar los botones. */}
        <div className="min-w-0 flex-1">{docView ? <TemplatePicker /> : <SelectedSummary />}</div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <HistoryButtons />
          {showInspectorToggle && !docView ? (
            <IconButton icon={SlidersHorizontal} size="sm" variant="secondary" label="Ajustes de la ventana" onClick={() => setUi({ inspectorOpen: true })} />
          ) : null}
        </div>
      </div>
      {docView ? <DocumentToolbar /> : null}
      <div className="relative min-h-0 flex-1">
        {docView ? (
          <DocumentBoundary>
            <DocumentPreview />
          </DocumentBoundary>
        ) : (
          <CanvasBoundary>
            <DesignStage />
          </CanvasBoundary>
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
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-paper-200 bg-paper-0 px-3">
      <SegmentedControl
        size="sm"
        aria-label="Escala del documento"
        value={zoom}
        onValueChange={(v) => setUi({ docZoom: v })}
        className="shrink-0"
        options={[
          { value: 'fit', label: 'Ajustar al ancho' },
          { value: 'actual', label: '100 %' },
        ]}
      />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button size="sm" icon={Download} onClick={() => void actions.downloadPdf()} loading={actions.busy === 'pdf'} title="Descargar PDF" className={iconClass}>
          {label('Descargar PDF')}
        </Button>
        <Button size="sm" icon={Link2} onClick={() => void copy()} title="Copiar enlace" className={iconClass}>
          {label('Copiar enlace')}
        </Button>
        {share.whatsappHref ? (
          <Button asChild size="sm" className={iconClass}>
            <a href={share.whatsappHref} target="_blank" rel="noreferrer" title="WhatsApp">
              <MessageCircle aria-hidden strokeWidth={1.75} />
              {label('WhatsApp')}
            </a>
          </Button>
        ) : (
          <Button size="sm" icon={MessageCircle} onClick={actions.openSend} title="WhatsApp" className={iconClass}>
            {label('WhatsApp')}
          </Button>
        )}
        {share.mailtoHref ? (
          <Button asChild size="sm" className={iconClass}>
            <a href={share.mailtoHref} title="Correo">
              <Mail aria-hidden strokeWidth={1.75} />
              {label('Correo')}
            </a>
          </Button>
        ) : (
          <Button size="sm" icon={Mail} onClick={actions.openSend} title="Correo" className={iconClass}>
            {label('Correo')}
          </Button>
        )}
      </div>
    </div>
  )
}

function SelectedSummary() {
  const { item } = useSelectedItem()
  if (!item) return null
  return (
    <p className="truncate text-[13px] text-paper-600">
      <span className="font-semibold text-paper-900">{item.ref}</span>
      <span className="mx-1.5 text-paper-350">·</span>
      {item.name?.trim() || designName(item.design)}
      <span className="mx-1.5 text-paper-350 max-2xl:hidden">·</span>
      <span className="tabular max-2xl:hidden">{formatSize(item.design.width, item.design.height)}</span>
    </p>
  )
}

function DesignStage() {
  const editor = useEditor()
  const { item } = useSelectedItem()
  const { catalog, selectedNodeId, count } = useEditorShallow((s) => ({ catalog: s.catalog, selectedNodeId: s.selectedNodeId, count: s.doc.items.length }))
  const setUi = useEditorUi((s) => s.set)
  const [view, setView] = useState<'interior' | 'exterior'>('interior')

  if (!item) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="flex max-w-sm flex-col items-center text-center">
          <EmptyBlueprint />
          <h2 className="mt-5 text-h3 font-semibold tracking-[-0.01em] text-paper-900">{count ? 'Elige una ventana de la lista' : 'Diseña la primera ventana'}</h2>
          <p className="mt-1.5 text-paper-600">
            {count ? 'O agrega otra: tipología, medidas y Enter.' : 'Elige la tipología, escribe ancho × alto y presiona Enter. El precio aparece al instante.'}
          </p>
          <Button variant="primary" size="lg" icon={Plus} className="mt-5" onClick={() => setUi({ pickerOpen: true })}>
            Agregar ventana
            <Kbd combo="a" tone="inverse" className="ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div data-quote-canvas className="absolute inset-0">
      <DesignCanvas
        key={item.id}
        design={item.design}
        catalog={catalog}
        onChange={(next, label) => editor.updateDesign(item.id, () => next, label ? `${label} (${item.ref})` : undefined)}
        selectedNodeId={selectedNodeId}
        onSelect={(id) => editor.selectNode(id)}
        view={view}
        onViewChange={setView}
        className="h-full w-full"
      />
    </div>
  )
}

/** Plano en trazo fino (estado vacío del lienzo): marco con cotas, sin relleno. */
function EmptyBlueprint() {
  return (
    <svg width="168" height="132" viewBox="0 0 168 132" fill="none" aria-hidden className="text-paper-350">
      <rect x="34" y="14" width="100" height="96" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="42" y="22" width="84" height="80" rx="1" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
      <line x1="84" y1="22" x2="84" y2="102" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M34 122 H134" stroke="var(--ink-600)" strokeWidth="1" />
      <path d="M31 125 L37 119 M131 125 L137 119" stroke="var(--ink-600)" strokeWidth="1" />
      <path d="M20 14 V110" stroke="var(--ink-600)" strokeWidth="1" />
      <path d="M17 17 L23 11 M17 113 L23 107" stroke="var(--ink-600)" strokeWidth="1" />
      <text x="84" y="131" textAnchor="middle" fontSize="8" fill="var(--ink-700)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        ancho
      </text>
      <text x="12" y="64" textAnchor="middle" fontSize="8" fill="var(--ink-700)" transform="rotate(-90 12 64)">
        alto
      </text>
    </svg>
  )
}
