import { useLayoutEffect, useRef, useState } from 'react'
import { documentTemplateFontCss } from '../../documents/fonts'
import { DocumentStyles, PAPER_SIZE, QuoteDocument, themeFromPrefs, type QuoteDocData } from '@dekopen/documents'
import type { QuoteTemplateId } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import es from '../i18n/es'

export interface DocPreviewProps {
  data: QuoteDocData
  template?: QuoteTemplateId
  /** Fracción de la hoja a mostrar (1 = completa). */
  crop?: number
  /** Hoja que se ve: 1 = portada (por defecto), 'last' = la del total. */
  page?: number | 'last'
  className?: string
  label?: string
}

/**
 * Primera hoja de la cotización real (paquete documents) escalada al ancho disponible.
 * Es una vista previa: no se puede editar ni enfocar por dentro. Los documentos siempre son claros.
 */
export function DocPreview({ data, template = 'esencial', crop = 1, page = 1, className, label }: DocPreviewProps) {
  const t = useT(es)
  const ref = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [top, setTop] = useState(0)
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

  // Las hojas quedan apiladas y medidas; la vista se corre hasta la que toca (el resto queda recortado).
  useLayoutEffect(() => {
    const root = sheet.current
    if (!root) return
    const place = () => {
      const pages = root.querySelectorAll<HTMLElement>('.dkd-page')
      const target = page === 'last' ? pages[pages.length - 1] : (pages[page - 1] ?? pages[0])
      setTop(target?.offsetTop ?? 0)
    }
    place()
    const observer = new MutationObserver(place)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [page, width])

  const scale = width > 0 ? width / paper.width : 0
  const theme = themeFromPrefs(data.prefs, data.org.accent)

  return (
    <figure
      ref={ref}
      aria-label={label ?? t('preview.label')}
      data-theme="light"
      className={cn('relative w-full overflow-hidden rounded-xs bg-white shadow-raised ring-1 ring-divider', className)}
      style={{ height: scale ? Math.round(paper.height * crop * scale) : undefined, aspectRatio: scale ? undefined : `${paper.width} / ${paper.height * crop}` }}
    >
      {scale ? (
        <div
          ref={sheet}
          inert
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 origin-top-left select-none [&_.dkd-page]:!rounded-none [&_.dkd-page]:!shadow-none"
          style={{ width: paper.width, transform: `scale(${scale}) translateY(${-top}px)` }}
        >
          <style>{documentTemplateFontCss()}</style>
          <DocumentStyles theme={theme} />
          <QuoteDocument data={data} template={template} measure />
        </div>
      ) : null}
      {crop < 1 ? <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-white/0 to-white" /> : null}
    </figure>
  )
}
