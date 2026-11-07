/**
 * Panel derecho del acceso: una ventana real dibujada por el motor (catálogo de ejemplo, no datos de
 * nadie) a gran tamaño, en su muro y sin texto. Se carga aparte y solo en pantallas anchas: el
 * teléfono no descarga el motor para entrar.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { WindowDrawing } from '@dekopen/documents'
import { useLocale } from '../../lib/i18n'
import { sampleWindow, type SampleWindowSpec } from '../../ui/SampleWindow'

export type AuthArtSpec = SampleWindowSpec

export default function AuthArt({ art }: { art: AuthArtSpec }) {
  const { locale } = useLocale()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const sample = useMemo(() => {
    try {
      return sampleWindow(art)
    } catch {
      return null
    }
  }, [art])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className="flex h-full items-center justify-center p-12 xl:p-20">
      {sample && size.width > 0 ? (
        <div className="fz-rise">
          <WindowDrawing
            layout={sample.layout}
            design={sample.design}
            catalog={sample.catalog}
            dimensions="none"
            symbols={false}
            detail="high"
            width={size.width - 160}
            height={size.height - 160}
            locale={locale}
          />
        </div>
      ) : null}
    </div>
  )
}
