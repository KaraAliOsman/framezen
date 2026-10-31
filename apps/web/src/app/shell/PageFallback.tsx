import { Skeleton } from '../../ui/Skeleton'

/** Carga de página dentro del shell: forma quieta de una cabecera y un bloque. */
export function PageFallback() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <Skeleton className="mt-8 h-64 w-full rounded-md" />
    </div>
  )
}
