import { lazy, Suspense } from 'react'
import type { Window3DProps } from './types'
import { Viewer3DPlaceholder } from './Viewer3DMessage'

const Window3DImpl = lazy(() => import('./Window3D'))

/**
 * Visor 3D con carga diferida: este archivo es liviano y three.js se descarga solo
 * cuando el visor se monta.
 */
export function Window3DLazy(props: Window3DProps) {
  return (
    <Suspense fallback={<Viewer3DPlaceholder className={props.className} height={props.height} />}>
      <Window3DImpl {...props} />
    </Suspense>
  )
}

export default Window3DLazy
