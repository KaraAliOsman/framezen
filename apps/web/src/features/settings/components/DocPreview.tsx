import { useLayoutEffect, useRef, useState } from 'react'
import { DocumentStyles, PAPER_SIZE, QuoteDocument, themeFromPrefs, type QuoteDocData } from '@framezen/documents'
import type { QuoteTemplateId } from '@framezen/shared'
import { cn } from '../../../lib/cn'

export interface DocPreviewProps {
  data: QuoteDocData
  template?: QuoteTemplateId
  /** Fracción de la primera hoja a mostrar (1 = completa). */
  crop?: number
  className?: string
  label?: string
}

/**
 * Primera hoja de la cotización real (paquete documents) escalada al ancho disponible.
 * Es una vista previa: no se puede editar ni enfocar por dentro.
 */
export function DocPreview({ data, template = 'esencial', crop = 1, className, label = 'Vista previa de tu cotización' }: DocPreviewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const paper = PAPER_SIZE[data.prefs.paper] ?? PAPER_SIZE.letter

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = width > 0 ? width / paper.width : 0
  const theme = themeFromPrefs(data.prefs, data.org.accent)

  return (
    <figure
      ref={ref}
      aria-label={label}
      className={cn('relative w-full overflow-hidden rounded-[3px] bg-paper-0 shadow-[0_1px_3px_rgb(31_28_24/0.08),0_12px_32px_-16px_rgb(31_28_24/0.18)] ring-1 ring-paper-200', className)}
      style={{ height: scale ? Math.round(paper.height * crop * scale) : undefined, aspectRatio: scale ? undefined : `${paper.width} / ${paper.height * crop}` }}
    >
      {scale ? (
        <div
          inert
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 origin-top-left select-none [&_.fzd-page]:!rounded-none [&_.fzd-page]:!shadow-none [&_.fzd-page+.fzd-page]:hidden"
          style={{ width: paper.width, transform: `scale(${scale})` }}
        >
          <DocumentStyles theme={theme} />
          <QuoteDocument data={data} template={template} />
        </div>
      ) : null}
    </figure>
  )
}
