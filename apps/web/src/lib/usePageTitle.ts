import { useEffect } from 'react'

/** Título de la pestaña: «Cotizaciones · Framezen». */
export function usePageTitle(title: string | undefined | null): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} · Framezen`
    return () => {
      document.title = previous
    }
  }, [title])
}
