/**
 * Límites de error locales del editor: si el lienzo, la vista Documento o el inspector fallan al
 * dibujarse, se pierde solo esa zona (con un aviso y acciones que siguen funcionando, como eliminar
 * la ventana) y el resto del editor sigue en pie. Se reintentan al cambiar de ventana o de diseño
 * (p. ej. al deshacer el cambio que rompió el dibujo).
 */
import type { ReactNode } from 'react'
import { Trash2, Undo2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Button, ErrorBoundary, ZoneError } from '../../../ui'
import { useEditor, useEditorState } from './context'
import { removeWithUndo } from './useEditorWiring'

/** Diseño de la ventana seleccionada (cambia de referencia con cada edición, deshacer incluido). */
function useSelectedDesign() {
  return useEditorState((s) => s.doc.items.find((i) => i.id === s.selectedItemId)?.design)
}

/** Acciones que funcionan aunque el dibujo falle: deshacer el último cambio y eliminar la ventana. */
function ItemActions({ itemId }: { itemId: string | null | undefined }) {
  const editor = useEditor()
  const canUndo = useEditorState((s) => s.past.length > 0)
  return (
    <>
      {canUndo ? (
        <Button size="sm" variant="ghost" icon={Undo2} onClick={() => editor.undo()}>
          Deshacer
        </Button>
      ) : null}
      {itemId ? (
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeWithUndo(editor, itemId)}>
          Eliminar esta ventana
        </Button>
      ) : null}
    </>
  )
}

/** Lienzo de la ventana: si falla, aviso «No pudimos dibujar esta ventana» y la lista sigue usable. */
export function CanvasBoundary({ children }: { children: ReactNode }) {
  const itemId = useEditorState((s) => s.selectedItemId)
  const design = useSelectedDesign()
  return (
    <ErrorBoundary
      label="lienzo"
      resetKeys={[itemId, design]}
      fallback={({ reset }) => (
        <ZoneError
          title="No pudimos dibujar esta ventana"
          description="Tus datos están a salvo. Puedes deshacer el último cambio, elegir otra ventana de la lista o eliminar esta."
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
  const doc = useEditorState((s) => s.doc)
  const settings = useEditorState((s) => s.settings)
  return (
    <ErrorBoundary
      label="documento"
      resetKeys={[doc, settings]}
      fallback={({ reset }) => (
        <ZoneError
          title="No pudimos mostrar el documento"
          description="Tus datos están a salvo. Puedes seguir editando las ventanas; reintenta en un momento."
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
  const itemId = useEditorState((s) => s.selectedItemId)
  const design = useSelectedDesign()
  return (
    <ErrorBoundary
      label="inspector"
      resetKeys={[itemId, design]}
      fallback={({ reset }) => (
        <aside aria-label="Inspector" className={cn('flex min-h-0 flex-col bg-paper-0', className)}>
          <ZoneError
            title="No pudimos mostrar los ajustes de esta ventana"
            description="Tus datos están a salvo. Reintenta, elige otra ventana o elimínala."
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
