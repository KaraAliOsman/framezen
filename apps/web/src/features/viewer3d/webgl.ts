let cached: boolean | undefined

/**
 * ¿Puede este navegador crear un contexto WebGL? Se consulta una vez y se recuerda.
 * El contexto de prueba se libera de inmediato.
 */
export function isWebGLAvailable(): boolean {
  if (cached !== undefined) return cached
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const context = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null
    cached = Boolean(context && typeof window.WebGLRenderingContext !== 'undefined')
    context?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}

/** Solo para pruebas: olvida el resultado guardado. */
export function resetWebGLCacheForTests() {
  cached = undefined
}
