/**
 * Límites de error locales del editor: si el lienzo, la vista Documento o el inspector fallan al
 * dibujarse, se pierde solo esa zona (con un aviso y acciones que siguen funcionando, como eliminar
 * la ventana) y el resto del editor sigue en pie. Se reintentan al cambiar de ventana o de diseño
 * (p. ej. al deshacer el cambio que rompió el dibujo).
 */
import type { ReactNode } from 'react'
import { Trash2, Undo2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Button, ErrorBoundary, ZoneError } from '../../../ui'
import es from '../i18n/es'
import { useEditor, useEditorState } from './context'
import { removeWithUndo } from './useEditorWiring'

/** Diseño de la ventana seleccionada (cambia de referencia con cada edición, deshacer incluido). */
function useSelectedDesign() {
  return useEditorState((s) => s.doc.items.find((i) => i.id === s.selectedItemId)?.design)
}

/** Acciones que funcionan aunque el dibujo falle: deshacer el último cambio y eliminar la ventana. */
function ItemActions({ itemId }: { itemId: string | null | undefined }) {
  const t = useT(es)
  const editor = useEditor()
  const canUndo = useEditorState((s) => s.past.length > 0)
  return (
    <>
      {canUndo ? (
        <Button size="sm" variant="ghost" icon={Undo2} onClick={() => editor.undo()}>
          {t('zones.undo')}
        </Button>
      ) : null}
      {itemId ? (
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeWithUndo(editor, itemId)}>
          {t('zones.removeItem')}
        </Button>
      ) : null}
    </>
  )
}

/** Lienzo de la ventana: si falla, aviso «No pudimos dibujar esta ventana» y la lista sigue usable. */
export function CanvasBoundary({ children }: { children: ReactNode }) {
  const t = useT(es)
  const itemId = useEditorState((s) => s.selectedItemId)
  const design = useSelectedDesign()
  return (
    <ErrorBoundary
      label="lienzo"
      resetKeys={[itemId, design]}
      fallback={({ reset }) => (
        <ZoneError
          title={t('zones.canvasTitle')}
          description={t('zones.canvasBody')}
          onRetry={reset}
          actions={<ItemActions itemId={itemId} />}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

/** Vista Documento: si falla, el resto del editor (ventanas, totales, envío) sigue funcionando. */
export function DocumentBoundary({ children }: { children: ReactNode }) {
  const t = useT(es)
  const doc = useEditorState((s) => s.doc)
  const settings = useEditorState((s) => s.settings)
  return (
    <ErrorBoundary
      label="documento"
      resetKeys={[doc, settings]}
      fallback={({ reset }) => (
        <ZoneError
          title={t('zones.documentTitle')}
          description={t('zones.documentBody')}
          onRetry={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

/** Inspector (columna o hoja): si falla, conserva su lugar con un aviso y acciones sobre la ventana. */
export function InspectorBoundary({ children, className }: { children: ReactNode; className?: string }) {
  const t = useT(es)
  const itemId = useEditorState((s) => s.selectedItemId)
  const design = useSelectedDesign()
  return (
    <ErrorBoundary
      label="inspector"
      resetKeys={[itemId, design]}
      fallback={({ reset }) => (
        <aside aria-label={t('inspector.aria')} className={cn('flex min-h-0 flex-col bg-surface', className)}>
          <ZoneError
            title={t('zones.inspectorTitle')}
            description={t('zones.inspectorBody')}
            onRetry={reset}
            actions={<ItemActions itemId={itemId} />}
          />
        </aside>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
