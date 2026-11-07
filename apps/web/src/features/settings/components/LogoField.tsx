import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { Crop, ImageUp, Maximize, ScanLine, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Button, Dialog, DialogContent, Spinner, Switch, toastUndo } from '../../../ui'
import es from '../i18n/es'
import {
  dataUrlBytes,
  detectContent,
  exportLogo,
  loadImage,
  MAX_LOGO_BYTES,
  readFileAsDataUrl,
  type Box,
} from '../lib/image'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif'
/** Damero para ver la transparencia (sigue el tema). */
const CHECKER =
  'bg-surface [background-image:linear-gradient(45deg,var(--dk-hover)_25%,transparent_25%,transparent_75%,var(--dk-hover)_75%),linear-gradient(45deg,var(--dk-hover)_25%,transparent_25%,transparent_75%,var(--dk-hover)_75%)] [background-size:16px_16px] [background-position:0_0,8px_8px]'

function isSvg(dataUrl: string): boolean {
  return dataUrl.startsWith('data:image/svg')
}

export interface LogoFieldProps {
  value?: string | null
  onChange: (value: string | null) => void
  /** Más compacto (puesta a punto). */
  compact?: boolean
  id?: string
}

/**
 * Logo de la empresa: subir (o arrastrar), recortar con vista previa, quitar el fondo blanco y
 * guardar liviano. Quitar se deshace con un toque.
 */
export function LogoField({ value, onChange, compact, id }: LogoFieldProps) {
  const t = useT(es)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = () => inputRef.current?.click()

  const handleFile = async (file: File | undefined) => {
    setNotice(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice(t('logo.notImage'))
      return
    }
    setBusy(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      if (isSvg(dataUrl)) {
        if (dataUrlBytes(dataUrl) > MAX_LOGO_BYTES) {
          setNotice(t('logo.svgTooBig'))
          return
        }
        onChange(dataUrl)
        return
      }
      setCropSrc(dataUrl)
    } catch {
      setNotice(t('logo.readFailed'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void handleFile(e.dataTransfer.files?.[0])
  }

  const remove = () => {
    const previous = value ?? null
    onChange(null)
    toastUndo(t('logo.removed'), () => onChange(previous))
  }

  return (
    <div className="flex flex-col gap-2">
      <input id={id} ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => void handleFile(e.target.files?.[0])} />
      {value ? (
        <div className={cn('flex items-center gap-4 rounded-md border border-divider p-3', compact ? 'flex-wrap' : '')}>
          <div className={cn('grid shrink-0 place-items-center rounded-sm border border-divider p-2', CHECKER, compact ? 'h-16 w-32' : 'h-20 w-44')}>
            <img src={value} alt={t('logo.current')} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Button size="sm" icon={ImageUp} onClick={pick} loading={busy}>
              {t('logo.change')}
            </Button>
            {!isSvg(value) ? (
              <Button size="sm" variant="ghost" icon={Crop} onClick={() => setCropSrc(value)}>
                {t('logo.crop')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" icon={Trash2} onClick={remove}>
              {t('logo.remove')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'group flex w-full items-center gap-4 rounded-md border border-dashed px-4 text-left transition-colors duration-100 ease-out',
            compact ? 'py-3' : 'py-5',
            dragging ? 'border-focus bg-accent-subtle' : 'border-control bg-surface hover:border-control-hover hover:bg-sunken',
          )}
        >
          <span className="inline-flex shrink-0 items-center justify-center text-fg-muted transition-colors duration-100 group-hover:text-fg">
            {busy ? <Spinner size={18} /> : <ImageUp aria-hidden strokeWidth={1.75} className="size-5" />}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-fg-strong">{t('logo.upload')}</span>
            <span className="block text-table text-fg-muted">{t('logo.uploadHint')}</span>
          </span>
        </button>
      )}
      {notice ? (
        <p role="status" className="text-table text-warning">
          {notice}
        </p>
      ) : null}
      <LogoCropDialog
        src={cropSrc}
        onOpenChange={(open) => {
          if (!open) setCropSrc(null)
        }}
        onConfirm={(dataUrl) => {
          onChange(dataUrl)
          setCropSrc(null)
        }}
      />
    </div>
  )
}

// ── Recorte ──────────────────────────────────────────────────────────────────

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

function LogoCropDialog({ src, onOpenChange, onConfirm }: { src: string | null; onOpenChange: (open: boolean) => void; onConfirm: (dataUrl: string) => void }) {
  const t = useT(es)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Box | null>(null)
  const [auto, setAuto] = useState<Box | null>(null)
  const [removeWhite, setRemoveWhite] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!src) return
    let alive = true
    setImg(null)
    setCrop(null)
    setPreview(null)
    setFailed(false)
    setRemoveWhite(false)
    loadImage(src)
      .then((image) => {
        if (!alive) return
        const box = detectContent(image)
        setImg(image)
        setAuto(box)
        setCrop(box)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [src])

  useEffect(() => {
    if (!img || !crop) return
    const timer = setTimeout(() => setPreview(exportLogo(img, crop, { removeWhite, maxSide: 420 })), 90)
    return () => clearTimeout(timer)
  }, [img, crop, removeWhite])

  const full = img ? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight } : null

  return (
    <Dialog open={Boolean(src)} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={t('logo.cropTitle')}
        description={t('logo.cropDescription')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={!img || !crop} onClick={() => img && crop && onConfirm(exportLogo(img, crop, { removeWhite }))}>
              {t('logo.useThis')}
            </Button>
          </>
        }
      >
        {failed ? (
          <p className="text-fg-muted">{t('logo.openFailed')}</p>
        ) : !img || !crop ? (
          <div className="grid h-64 place-items-center text-fg-muted">
            <Spinner size={20} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <CropStage img={img} crop={crop} onChange={setCrop} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" icon={ScanLine} onClick={() => auto && setCrop(auto)}>
                  {t('logo.fit')}
                </Button>
                <Button size="sm" variant="ghost" icon={Maximize} onClick={() => full && setCrop(full)}>
                  {t('logo.full')}
                </Button>
              </div>
              <Switch checked={removeWhite} onCheckedChange={setRemoveWhite} label={t('logo.removeWhite')} description={t('logo.removeWhiteHint')} />
            </div>
            <div>
              <p className="mb-2 text-table font-medium text-fg-strong">{t('logo.willLook')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div data-theme="light" className="flex h-20 items-center justify-center rounded-md border border-divider bg-white px-4">
                  {preview ? <img src={preview} alt={t('logo.onPaper')} className="max-h-12 max-w-full object-contain" /> : null}
                </div>
                <div className={cn('flex h-20 items-center justify-center rounded-md border border-divider px-4', CHECKER)}>
                  {preview ? <img src={preview} alt={t('logo.onTransparent')} className="max-h-12 max-w-full object-contain" /> : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CropStage({ img, crop, onChange }: { img: HTMLImageElement; crop: Box; onChange: (box: Box) => void }) {
  const t = useT(es)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(560)
  const drag = useRef<{ mode: DragMode; x: number; y: number; box: Box } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setAvail(el.clientWidth || 560)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const W = img.naturalWidth
  const H = img.naturalHeight
  const k = Math.min(avail / W, 300 / H, 3)
  const dw = Math.round(W * k)
  const dh = Math.round(H * k)
  const min = Math.max(8, Math.round(Math.min(W, H) * 0.04))

  const start = (mode: DragMode) => (e: PointerEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { mode, x: e.clientX, y: e.clientY, box: crop }
  }

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / k
    const dy = (e.clientY - d.y) / k
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
    let l = d.box.x
    let top = d.box.y
    let r = d.box.x + d.box.w
    let b = d.box.y + d.box.h
    if (d.mode === 'move') {
      l = clamp(l + dx, 0, W - d.box.w)
      top = clamp(top + dy, 0, H - d.box.h)
      r = l + d.box.w
      b = top + d.box.h
    } else {
      if (d.mode.includes('w')) l = clamp(l + dx, 0, r - min)
      if (d.mode.includes('e')) r = clamp(r + dx, l + min, W)
      if (d.mode.includes('n')) top = clamp(top + dy, 0, b - min)
      if (d.mode.includes('s')) b = clamp(b + dy, top + min, H)
    }
    onChange({ x: Math.round(l), y: Math.round(top), w: Math.round(r - l), h: Math.round(b - top) })
  }

  const end = () => {
    drag.current = null
  }

  const onKey = (e: KeyboardEvent) => {
    const step = Math.max(1, Math.round((e.shiftKey ? 0.05 : 0.01) * Math.max(W, H)))
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const dir = delta[e.key]
    if (!dir) return
    e.preventDefault()
    if (e.altKey) {
      // Alt + flechas: cambia el tamaño.
      onChange({ ...crop, w: Math.min(W - crop.x, Math.max(min, crop.w + dir[0])), h: Math.min(H - crop.y, Math.max(min, crop.h + dir[1])) })
    } else {
      onChange({ ...crop, x: Math.min(W - crop.w, Math.max(0, crop.x + dir[0])), y: Math.min(H - crop.h, Math.max(0, crop.y + dir[1])) })
    }
  }

  const handle = 'absolute size-6 touch-none flex items-center justify-center'
  const dot = 'size-3 rounded-xs border border-accent bg-surface shadow-xs'

  return (
    <div ref={wrapRef} className="w-full">
      <div
        className={cn('relative mx-auto touch-none overflow-hidden rounded-sm select-none', CHECKER)}
        style={{ width: dw, height: dh }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <img src={img.src} alt="" draggable={false} className="absolute inset-0 size-full" />
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('logo.cropArea')}
          aria-valuetext={`${Math.round(crop.w)} × ${Math.round(crop.h)} px`}
          onPointerDown={start('move')}
          onKeyDown={onKey}
          className="absolute cursor-move outline outline-1 outline-white focus-visible:outline-2 focus-visible:outline-focus"
          style={{
            left: crop.x * k,
            top: crop.y * k,
            width: crop.w * k,
            height: crop.h * k,
            boxShadow: '0 0 0 9999px rgb(15 22 24 / 0.5), inset 0 0 0 1px var(--dk-accent)',
          }}
        >
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <span
              key={corner}
              aria-hidden
              onPointerDown={start(corner)}
              className={cn(
                handle,
                corner === 'nw' && '-top-3 -left-3 cursor-nwse-resize',
                corner === 'ne' && '-top-3 -right-3 cursor-nesw-resize',
                corner === 'sw' && '-bottom-3 -left-3 cursor-nesw-resize',
                corner === 'se' && '-right-3 -bottom-3 cursor-nwse-resize',
              )}
            >
              <span className={dot} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
