/**
 * Qué camino de realidad aumentada tiene este equipo. Es la única decisión del AR y es pura: las pruebas le
 * pasan el entorno de cada teléfono.
 *
 * - iPhone/iPad en Safari (o Chrome iOS, que usa el mismo motor): AR Quick Look con un USDZ generado aquí.
 * - Android con Chrome y ARCore: sesión WebXR en la misma página, con el modelo generado aquí.
 * - Android sin WebXR: Scene Viewer, pero esa app descarga el modelo desde una URL https pública (un blob
 *   no le sirve), así que solo aplica si alguien lo aloja (`canHost`).
 * - Navegador dentro de otra app (WhatsApp, Instagram): ninguno de los anteriores funciona; se pide abrir
 *   el enlace en el navegador del teléfono.
 * - Escritorio: QR para seguir en el teléfono.
 */
export type ArMode = 'quick-look' | 'webxr' | 'scene-viewer' | 'open-in-browser' | 'qr' | 'unsupported'

export interface ArEnvironment {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** `<a>.relList.supports('ar')`. */
  anchorSupportsAr: boolean
  /** `window.webkit.messageHandlers`: vista web incrustada en iOS. */
  embeddedWebKit: boolean
  /** `navigator.xr.isSessionSupported('immersive-ar')`. */
  webXrAr: boolean
  secureContext: boolean
  /** Hay quien publique el GLB en una URL https (necesario para Scene Viewer). */
  canHost: boolean
}

const IN_APP = /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|TikTok|Snapchat/i
/** Navegadores de iOS con vista incrustada que sí entregan el enlace `rel="ar"` al sistema. */
const IOS_BROWSERS = /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//

export function isIos(env: Pick<ArEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  // iPadOS se presenta como Mac; lo delata el tacto.
  return /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
}

export function isAndroid(env: Pick<ArEnvironment, 'userAgent'>): boolean {
  return /Android/i.test(env.userAgent)
}

export function decideArMode(env: ArEnvironment): ArMode {
  if (isIos(env)) {
    if (IN_APP.test(env.userAgent)) return 'open-in-browser'
    if (env.embeddedWebKit) return IOS_BROWSERS.test(env.userAgent) ? 'quick-look' : 'open-in-browser'
    return env.anchorSupportsAr ? 'quick-look' : 'unsupported'
  }
  if (isAndroid(env)) {
    if (IN_APP.test(env.userAgent) || /; wv\)/.test(env.userAgent)) return 'open-in-browser'
    if (env.secureContext && env.webXrAr) return 'webxr'
    return env.canHost ? 'scene-viewer' : 'unsupported'
  }
  return 'qr'
}

/** Lee el entorno real. Nunca lanza: lo que no se puede averiguar cuenta como que no está. */
export async function readArEnvironment(canHost: boolean): Promise<ArEnvironment> {
  const nav = navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }
  let webXrAr = false
  try {
    webXrAr = (await nav.xr?.isSessionSupported('immersive-ar')) ?? false
  } catch {
    webXrAr = false
  }
  const anchor = document.createElement('a')
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    anchorSupportsAr: Boolean(anchor.relList?.supports?.('ar')),
    embeddedWebKit: Boolean((window as unknown as { webkit?: { messageHandlers?: unknown } }).webkit?.messageHandlers),
    webXrAr,
    secureContext: window.isSecureContext,
    canHost,
  }
}

/** Enlace que abre Scene Viewer con caída a la misma página si el teléfono no lo tiene. */
export function sceneViewerIntent(fileUrl: string, options: { title?: string; fallbackUrl: string; wall?: boolean }): string {
  const query = new URLSearchParams({ file: fileUrl, mode: 'ar_preferred', resizable: 'false' })
  if (options.title) query.set('title', options.title)
  if (options.wall) query.set('enable_vertical_placement', 'true')
  return [
    `intent://arvr.google.com/scene-viewer/1.0?${query.toString()}#Intent`,
    'scheme=https',
    'package=com.google.android.googlequicksearchbox',
    'action=android.intent.action.VIEW',
    `S.browser_fallback_url=${encodeURIComponent(options.fallbackUrl)}`,
    'end;',
  ].join(';')
}

/** Fragmento de Quick Look: tamaño real, sin que un pellizco la escale. */
export function quickLookHref(blobUrl: string): string {
  return `${blobUrl}#allowsContentScaling=0`
}

const AR_PARAM = 'ar'

/** Enlace para seguir en el teléfono: la misma página, marcada con la ventana que se quiere ver. */
export function arShareUrl(pageUrl: string, itemId?: string): string {
  const url = new URL(pageUrl)
  url.searchParams.set(AR_PARAM, itemId ?? '1')
  return url.toString()
}

/** Ventana pedida por el QR (`?ar=<id>`), para abrirla directo al llegar al teléfono. */
export function arItemFromUrl(pageUrl: string): string | null {
  return new URL(pageUrl).searchParams.get(AR_PARAM)
}
