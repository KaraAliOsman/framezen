import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { Crop, ImageUp, Maximize, ScanLine, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Button, Dialog, DialogContent, Spinner, Switch, toastUndo } from '../../../ui'
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
const CHECKER =
  'bg-paper-0 [background-image:linear-gradient(45deg,var(--paper-100)_25%,transparent_25%,transparent_75%,var(--paper-100)_75%),linear-gradient(45deg,var(--paper-100)_25%,transparent_25%,transparent_75%,var(--paper-100)_75%)] [background-size:16px_16px] [background-position:0_0,8px_8px]'

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
      setNotice('Ese archivo no es una imagen. Prueba con un PNG, JPG, WEBP o SVG.')
      return
    }
    setBusy(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      if (isSvg(dataUrl)) {
        if (dataUrlBytes(dataUrl) > MAX_LOGO_BYTES) {
          setNotice('Ese SVG pesa más de 1 MB. Prueba exportarlo simplificado o súbelo como PNG.')
          return
        }
        onChange(dataUrl)
        return
      }
      setCropSrc(dataUrl)
    } catch {
      setNotice('No pudimos leer ese archivo. Prueba con otro o vuelve a exportarlo.')
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
    toastUndo('Quitaste el logo', () => onChange(previous))
  }

  return (
    <div className="flex flex-col gap-2">
      <input id={id} ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => void handleFile(e.target.files?.[0])} />
      {value ? (
        <div className={cn('flex items-center gap-4 rounded-md border border-paper-200 p-3', compact ? 'flex-wrap' : '')}>
          <div className={cn('grid shrink-0 place-items-center rounded-sm border border-paper-200 p-2', CHECKER, compact ? 'h-16 w-32' : 'h-20 w-44')}>
            <img src={value} alt="Logo actual" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Button size="sm" icon={ImageUp} onClick={pick} loading={busy}>
              Cambiar
            </Button>
            {!isSvg(value) ? (
              <Button size="sm" variant="ghost" icon={Crop} onClick={() => setCropSrc(value)}>
                Recortar
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" icon={Trash2} onClick={remove}>
              Quitar
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
            'group flex w-full items-center gap-4 rounded-md border border-dashed px-4 text-left transition-colors duration-120',
            compact ? 'py-3' : 'py-5',
            dragging ? 'border-ink-500 bg-ink-50/60' : 'border-paper-350/70 bg-paper-0 hover:border-paper-600 hover:bg-paper-50',
          )}
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-paper-100 text-paper-600 group-hover:text-paper-900">
            {busy ? <Spinner size={18} /> : <ImageUp aria-hidden strokeWidth={1.75} className="size-5" />}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-paper-900">Sube tu logo</span>
            <span className="block text-[13px] leading-[18px] text-paper-600">
              Arrástralo aquí o elige un archivo. PNG, JPG, WEBP o SVG; lo dejamos liviano y bien recortado.
            </span>
          </span>
        </button>
      )}
      {notice ? (
        <p role="status" className="text-[13px] leading-[18px] text-warn-800">
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
    const t = setTimeout(() => setPreview(exportLogo(img, crop, { removeWhite, maxSide: 420 })), 90)
    return () => clearTimeout(t)
  }, [img, crop, removeWhite])

  const full = img ? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight } : null

  return (
    <Dialog open={Boolean(src)} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title="Ajusta tu logo"
        description="Arrastra las esquinas para dejar solo el logo. Lo que quede fuera del recuadro no se usa."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!img || !crop} onClick={() => img && crop && onConfirm(exportLogo(img, crop, { removeWhite }))}>
              Usar este logo
            </Button>
          </>
        }
      >
        {failed ? (
          <p className="text-paper-600">No pudimos abrir esa imagen. Prueba con otro archivo (PNG o JPG).</p>
        ) : !img || !crop ? (
          <div className="grid h-64 place-items-center text-paper-600">
            <Spinner size={20} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <CropStage img={img} crop={crop} onChange={setCrop} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" icon={ScanLine} onClick={() => auto && setCrop(auto)}>
                  Ajustar al logo
                </Button>
                <Button size="sm" variant="ghost" icon={Maximize} onClick={() => full && setCrop(full)}>
                  Imagen completa
                </Button>
              </div>
              <Switch
                checked={removeWhite}
                onCheckedChange={setRemoveWhite}
                label="Quitar fondo blanco"
                description="Útil si tu logo viene en JPG con fondo."
              />
            </div>
            <div>
              <p className="mb-2 text-[13px] font-medium text-paper-900">Así se verá</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex h-20 items-center justify-center rounded-md border border-paper-200 bg-paper-0 px-4">
                  {preview ? <img src={preview} alt="Vista previa sobre papel" className="max-h-12 max-w-full object-contain" /> : null}
                </div>
                <div className={cn('flex h-20 items-center justify-center rounded-md border border-paper-200 px-4', CHECKER)}>
                  {preview ? <img src={preview} alt="Vista previa con transparencia" className="max-h-12 max-w-full object-contain" /> : null}
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
    let t = d.box.y
    let r = d.box.x + d.box.w
    let b = d.box.y + d.box.h
    if (d.mode === 'move') {
      l = clamp(l + dx, 0, W - d.box.w)
      t = clamp(t + dy, 0, H - d.box.h)
      r = l + d.box.w
      b = t + d.box.h
    } else {
      if (d.mode.includes('w')) l = clamp(l + dx, 0, r - min)
      if (d.mode.includes('e')) r = clamp(r + dx, l + min, W)
      if (d.mode.includes('n')) t = clamp(t + dy, 0, b - min)
      if (d.mode.includes('s')) b = clamp(b + dy, t + min, H)
    }
    onChange({ x: Math.round(l), y: Math.round(t), w: Math.round(r - l), h: Math.round(b - t) })
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
  const dot = 'size-3 rounded-[2px] border border-ink-600 bg-paper-0 shadow-[0_1px_2px_rgb(31_28_24/0.2)]'

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
          aria-label="Zona del logo: muévela con las flechas; Alt y flechas cambian su tamaño"
          aria-valuetext={`${Math.round(crop.w)} × ${Math.round(crop.h)} px`}
          onPointerDown={start('move')}
          onKeyDown={onKey}
          className="absolute cursor-move outline outline-1 outline-paper-0 focus-visible:outline-2 focus-visible:outline-ink-500"
          style={{
            left: crop.x * k,
            top: crop.y * k,
            width: crop.w * k,
            height: crop.h * k,
            boxShadow: '0 0 0 9999px rgb(31 28 24 / 0.5), inset 0 0 0 1px var(--ink-600)',
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
