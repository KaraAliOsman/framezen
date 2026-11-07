import { isQrValue, QrCode } from '@dekopen/documents'
import clsx from 'clsx'
import { Box, Check, Copy, RotateCcw, RotateCw, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../../lib/i18n'
import { buttonClass } from '../../../ui/Button'
import { Dialog, DialogContent } from '../../../ui/Dialog'
import { Spinner } from '../../../ui/Spinner'
import es from '../i18n/es'
import { type ArMode, arShareUrl, decideArMode, quickLookHref, readArEnvironment, sceneViewerIntent } from './capability'
import type { ArPlacement, ArSource } from './export'
import type { ArPhase, ArSessionHandle } from './webxr'

export interface WindowArButtonProps extends ArSource {
  /** Nombre que muestra el visor de AR del sistema. */
  title?: string
  /** Página a abrir en el teléfono (el QR). Por defecto, la actual. */
  pageUrl?: string
  /** Id de la ventana, para que el QR lleve directo a ella (`?ar=<id>`). */
  itemId?: string
  /** Publica el GLB en una URL https. Sin esto Scene Viewer no está disponible: solo WebXR en Android. */
  hostGlb?: (glb: Blob) => Promise<string>
  placement?: ArPlacement
  className?: string
}

const QUICK_LOOK_DELAY_MS = 500

function ArLabel({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <>
      {busy ? <Spinner size={15} /> : <Box size={15} strokeWidth={1.75} aria-hidden />}
      {children}
    </>
  )
}

/**
 * Ver la ventana en el espacio del cliente. El botón decide solo qué camino tiene el equipo; three.js y
 * los exportadores se cargan cuando hacen falta, así montarlo no pesa nada.
 */
export function WindowArButton({ title, pageUrl, itemId, hostGlb, placement = 'floor', className, ...source }: WindowArButtonProps) {
  const t = useT(es)
  const [mode, setMode] = useState<ArMode | null>(null)
  const [dialog, setDialog] = useState<'qr' | 'browser' | 'failed' | null>(null)
  const [quickLookUrl, setQuickLookUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<ArPhase | null>(null)
  const [copied, setCopied] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<ArSessionHandle | null>(null)
  const sourceRef = useRef(source)
  sourceRef.current = source

  const shareUrl = arShareUrl(pageUrl ?? (typeof window === 'undefined' ? 'https://localhost/' : window.location.href), itemId)
  const label = t('ar.button')
  const buttonClasses = clsx(buttonClass('secondary', 'md'), 'gap-1.5', className)

  useEffect(() => {
    let alive = true
    void readArEnvironment(Boolean(hostGlb)).then((env) => {
      if (alive) setMode(decideArMode(env))
    })
    return () => {
      alive = false
    }
  }, [hostGlb])

  // Quick Look exige que el toque caiga en un enlace real: el USDZ se deja listo antes de que llegue.
  useEffect(() => {
    if (mode !== 'quick-look') return
    let url: string | null = null
    let alive = true
    const timer = window.setTimeout(() => {
      setBusy(true)
      void import('./export')
        .then(({ exportForAR }) => exportForAR(sourceRef.current, 'usdz', { placement }))
        .then((asset) => {
          if (!alive) return
          url = URL.createObjectURL(asset.blob)
          setQuickLookUrl(url)
        })
        .catch((error) => {
          console.warn('[viewer3d] No se pudo preparar el USDZ.', error)
          if (alive) setDialog('failed')
        })
        .finally(() => {
          if (alive) setBusy(false)
        })
    }, QUICK_LOOK_DELAY_MS)
    return () => {
      alive = false
      window.clearTimeout(timer)
      if (url) URL.revokeObjectURL(url)
      setQuickLookUrl(null)
    }
  }, [mode, placement, source.layout, source.design])

  useEffect(() => () => sessionRef.current?.end(), [])

  const startWebXr = useCallback(async () => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr
    if (!xr) return setDialog('failed')
    setPhase('loading')
    try {
      // Va primero: el navegador solo la concede dentro del toque, antes de cualquier otra espera.
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: overlayRef.current ? { root: overlayRef.current } : undefined,
      })
      const { runArSession } = await import('./webxr')
      sessionRef.current = await runArSession(session, sourceRef.current, {
        onPhase: setPhase,
        onEnd: () => {
          sessionRef.current = null
          setPhase(null)
        },
        onError: (error) => {
          console.warn('[viewer3d] La sesión de AR falló.', error)
          sessionRef.current?.end()
          setDialog('failed')
        },
      })
    } catch (error) {
      console.warn('[viewer3d] No se pudo abrir la sesión de AR.', error)
      setPhase(null)
      setDialog('failed')
    }
  }, [])

  const startSceneViewer = useCallback(async () => {
    if (!hostGlb) return
    setBusy(true)
    try {
      const { exportForAR } = await import('./export')
      const asset = await exportForAR(sourceRef.current, 'glb', { placement })
      const url = await hostGlb(asset.blob)
      window.location.assign(sceneViewerIntent(url, { title, fallbackUrl: window.location.href, wall: placement === 'wall' }))
    } catch (error) {
      console.warn('[viewer3d] No se pudo abrir Scene Viewer.', error)
      setDialog('failed')
    } finally {
      setBusy(false)
    }
  }, [hostGlb, placement, title])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }, [shareUrl])

  // Sin camino posible el botón no aparece: el 3D sigue ahí y no se promete lo que el equipo no puede.
  if (mode === null || mode === 'unsupported') return null

  const copyButton = (
    <button type="button" onClick={copy} className={clsx(buttonClass('secondary', 'md'), 'w-full gap-1.5')}>
      {copied ? <Check size={15} strokeWidth={1.75} aria-hidden /> : <Copy size={15} strokeWidth={1.75} aria-hidden />}
      {t(copied ? 'ar.copied' : 'ar.copy')}
    </button>
  )

  return (
    <>
      {mode === 'quick-look' ? (
        quickLookUrl ? (
          <a rel="ar" href={quickLookHref(quickLookUrl)} download="ventana.usdz" className={buttonClasses}>
            {/* Quick Look solo responde a un enlace cuyo primer hijo es una imagen. */}
            <img alt="" width={1} height={1} className="absolute h-px w-px opacity-0" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
            <ArLabel>{label}</ArLabel>
          </a>
        ) : (
          <button type="button" disabled className={buttonClasses}>
            <ArLabel busy={busy}>{t('ar.preparing')}</ArLabel>
          </button>
        )
      ) : (
        <button
          type="button"
          disabled={busy || phase !== null}
          onClick={() => {
            if (mode === 'qr') setDialog('qr')
            else if (mode === 'open-in-browser') setDialog('browser')
            else if (mode === 'webxr') void startWebXr()
            else void startSceneViewer()
          }}
          className={buttonClasses}
        >
          <ArLabel busy={busy || phase !== null}>{label}</ArLabel>
        </button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === 'qr' ? (
          <DialogContent size="sm" title={t('ar.qrTitle')} description={t('ar.qrBody')}>
            <div className="flex flex-col items-center gap-4">
              {isQrValue(shareUrl) ? (
                <div className="rounded-panel bg-white p-3">
                  <QrCode value={shareUrl} size={196} label={t('ar.qrTitle')} />
                </div>
              ) : null}
              {copyButton}
            </div>
          </DialogContent>
        ) : dialog === 'browser' ? (
          <DialogContent size="sm" title={t('ar.browserTitle')} description={t('ar.browserBody')}>
            {copyButton}
          </DialogContent>
        ) : dialog === 'failed' ? (
          <DialogContent size="sm" title={t('ar.failedTitle')} description={t('ar.failedBody')}>
            {null}
          </DialogContent>
        ) : null}
      </Dialog>

      {mode === 'webxr' && typeof document !== 'undefined'
        ? createPortal(
            <div ref={overlayRef} className={clsx('fixed inset-0 z-[80] flex-col justify-between p-4 text-white', phase ? 'flex' : 'hidden')}>
              <div className="flex items-start justify-between gap-3">
                <p className="rounded-control bg-black/60 px-3 py-2 text-table">{t(phase === 'loading' ? 'ar.xrLoading' : phase === 'placed' ? 'ar.xrPlaced' : 'ar.xrScan')}</p>
                <button type="button" aria-label={t('ar.xrClose')} onClick={() => sessionRef.current?.end()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/60">
                  <X size={20} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
              {phase === 'placed' ? (
                <div className="flex justify-center gap-3">
                  <button type="button" aria-label={t('ar.xrRotateLeft')} onClick={() => sessionRef.current?.rotate(-15)} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60">
                    <RotateCcw size={20} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button type="button" aria-label={t('ar.xrRotateRight')} onClick={() => sessionRef.current?.rotate(15)} className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60">
                    <RotateCw size={20} strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
