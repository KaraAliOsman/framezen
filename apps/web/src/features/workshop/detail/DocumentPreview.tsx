import { useDeferredValue, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { WORKSHOP_PAPER_SIZES, type WorkshopPaper } from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Button, Spinner } from '../../../ui'
import es from '../i18n/es'

const PX_PER_MM = 96 / 25.4

/** Ancho de papel en px de pantalla (Carta ≈ 816 px). */
export function paperWidthPx(paper: WorkshopPaper): number {
  return WORKSHOP_PAPER_SIZES[paper].width * PX_PER_MM
}

/** Escala para que la hoja quepa en `available` px (nunca agranda). */
export function previewZoom(available: number, paper: WorkshopPaper): number {
  if (!(available > 0)) return 0.5
  return Math.max(0.25, Math.min(1, available / paperWidthPx(paper)))
}

const PREVIEW_CSS = `
.fz-docpreview .fzw-sheet { content-visibility: auto; contain-intrinsic-size: auto 1056px; }
.fz-docpreview .fzw-sheet:last-child { margin-bottom: 0; }
`

/**
 * Vista previa de un documento de taller: las hojas tal como se imprimen, escaladas al
 * ancho disponible. El documento se calcula en segundo plano para no trabar la pantalla.
 */
export function DocumentPreview({
  element,
  paper,
  label,
  footer,
  className,
}: {
  /** Debe venir memorizado (useMemo) para no recalcular en cada render. */
  element: ReactElement
  paper: WorkshopPaper
  label: string
  footer?: ReactNode
  className?: string
}) {
  const t = useT(es)
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const deferred = useDeferredValue(element)
  const stale = deferred !== element

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const zoom = previewZoom(width, paper)
  return (
    <div className={cn('relative rounded-panel bg-sunken px-3 py-4 sm:px-6 sm:py-6', className)}>
      <style>{PREVIEW_CSS}</style>
      <div ref={frame} role="region" aria-label={label} className="fz-docpreview mx-auto w-full overflow-hidden">
        {/* Los documentos se imprimen en claro: la hoja conserva el papel blanco también en el tema oscuro. */}
        <div data-theme="light" style={{ zoom }} className={cn('transition-opacity duration-140', stale && 'opacity-60')}>
          {deferred}
        </div>
      </div>
      {stale ? (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-xs bg-raised px-2 py-1 text-meta text-fg-muted shadow-float">
          <Spinner size={12} /> {t('doc.updating')}
        </span>
      ) : null}
      {footer ? <div className="mt-4 text-center text-table text-fg-muted">{footer}</div> : null}
    </div>
  )
}

/**
 * Cabecera de una pestaña de documento: qué es, opciones y acciones. Las acciones van a la
 * derecha si caben junto a un título legible (~360 px); si no, bajan a su propia fila.
 */
export function DocumentToolbar({
  title,
  description,
  options,
  onPrint,
  onDownload,
  downloading,
  disabled,
  quiet,
}: {
  title: ReactNode
  description?: ReactNode
  options?: ReactNode
  onPrint: () => void
  onDownload: () => void
  downloading?: boolean
  disabled?: boolean
  /** Sin botón primario (cuando la vista ya tiene uno, p. ej. «Descargar OT» en la cabecera). */
  quiet?: boolean
}) {
  const t = useT(es)
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-[min(100%,260px)] flex-[1_1_360px]">
        <h2 className="text-h3 font-medium text-pretty text-fg-strong">{title}</h2>
        {description ? <p className="mt-0.5 max-w-2xl text-pretty text-fg-muted">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {options}
        <Button icon={FileDown} onClick={onDownload} loading={downloading} disabled={disabled}>
          {t('doc.download')}
        </Button>
        <Button variant={quiet ? 'secondary' : 'primary'} icon={Printer} onClick={onPrint} disabled={disabled}>
          {t('doc.print')}
        </Button>
      </div>
    </div>
  )
}
