/**
 * Elegir fotos para una sección (portada, quiénes somos, galería): biblioteca de imágenes de la
 * empresa con subida (se reduce en el navegador y el servidor la recodifica sin metadatos).
 */
import { useRef, useState } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'
import type { DocumentImageRecord } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Button, IconButton, Popover, PopoverContent, PopoverTrigger, Skeleton, Spinner, toast } from '../../../ui'
import { shrinkImage, templatesApi, useDocumentImages } from '../api'
import { useQueryClient } from '@tanstack/react-query'
import { templateKeys } from '../api'
import es from '../i18n/es'

function useUpload() {
  const t = useT(es)
  const client = useQueryClient()
  const [busy, setBusy] = useState(false)
  const upload = async (file: File): Promise<DocumentImageRecord | null> => {
    setBusy(true)
    try {
      const dataUrl = await shrinkImage(file)
      const res = await templatesApi.uploadImage(dataUrl, file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120))
      void client.invalidateQueries({ queryKey: templateKeys.images })
      toast.success(t('toasts.imageUploaded'))
      return res.image
    } catch (error) {
      toast.error(humanError(error))
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, upload }
}

/** Biblioteca de imágenes de la empresa con subida. También se abre directo desde la hoja. */
export function ImageLibrary({ selected, onPick, logo }: { selected: readonly string[]; onPick: (image: DocumentImageRecord) => void; logo?: boolean }) {
  const t = useT(es)
  const images = useDocumentImages()
  const input = useRef<HTMLInputElement>(null)
  const { busy, upload } = useUpload()
  return (
    <div className="flex w-[300px] flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-table font-semibold text-fg-strong">{t('images.library')}</span>
        <Button size="xs" variant="subtle" icon={ImagePlus} loading={busy} onClick={() => input.current?.click()}>
          {logo ? t('images.logoUpload') : t('images.upload')}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const image = await upload(file)
            if (image) onPick(image)
          }}
        />
      </div>
      {images.isLoading ? (
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-xs" />
          ))}
        </div>
      ) : images.data?.images.length ? (
        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
          {images.data.images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onPick(img)}
              className={cn('relative aspect-square overflow-hidden rounded-xs border bg-sunken', selected.includes(img.id) ? 'border-accent ring-2 ring-[var(--dk-focus-ring)]' : 'border-divider hover:border-divider-strong')}
              aria-pressed={selected.includes(img.id)}
              aria-label={img.name ?? t('images.altFallback')}
            >
              {img.thumb ? <img src={img.thumb} alt="" className={cn('size-full', logo ? 'object-contain p-1' : 'object-cover')} /> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-sm bg-sunken px-3 py-3 text-table text-fg-muted">{logo ? t('images.logoEmpty') : t('images.empty')}</p>
      )}
      <p className="text-meta text-fg-muted">{busy ? t('images.uploading') : t('images.formats')}</p>
      {busy ? (
        <div className="flex justify-center">
          <Spinner />
        </div>
      ) : null}
    </div>
  )
}

/** Una foto (portada / quiénes somos). */
export function ImageField({ value, label, readOnly, onChange, note, logo }: { value?: string; label: string; readOnly?: boolean; onChange: (id: string | null) => void; note?: string; logo?: boolean }) {
  const t = useT(es)
  const images = useDocumentImages(Boolean(value))
  const current = images.data?.images.find((i) => i.id === value)
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-table font-medium text-fg">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-divider bg-sunken">
          {current?.thumb ? <img src={current.thumb} alt="" className={cn('size-full', logo ? 'object-contain p-1' : 'object-cover')} /> : <ImagePlus aria-hidden className="size-5 text-fg-faint" strokeWidth={1.5} />}
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-1.5">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary">
                  {logo ? (value ? t('images.logoChange') : t('images.logoChoose')) : value ? t('images.change') : t('images.choose')}
                </Button>
              </PopoverTrigger>
              <PopoverContent flush align="start">
                <ImageLibrary
                  logo={logo}
                  selected={value ? [value] : []}
                  onPick={(img) => {
                    onChange(img.id)
                    setOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            {value ? <IconButton icon={Trash2} size="sm" label={t('images.remove')} onClick={() => onChange(null)} /> : null}
          </div>
        ) : null}
      </div>
      {note && !value ? <p className="text-meta text-fg-muted">{note}</p> : null}
    </div>
  )
}

export interface GalleryImageValue {
  assetId: string
  caption?: string
}

/** Varias fotos con pie (galería). */
export function ImagesField({ value, max, label, readOnly, onChange }: { value: readonly GalleryImageValue[]; max: number; label: string; readOnly?: boolean; onChange: (images: GalleryImageValue[]) => void }) {
  const t = useT(es)
  const images = useDocumentImages(value.length > 0 || !readOnly)
  const byId = new Map((images.data?.images ?? []).map((i) => [i.id, i]))
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-table font-medium text-fg">{label}</span>
        <span className="num text-meta text-fg-muted">
          {value.length}/{max}
        </span>
      </div>
      {value.length ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((img, index) => (
            <li key={img.assetId} className="flex items-center gap-2">
              <div className="size-10 shrink-0 overflow-hidden rounded-xs border border-divider bg-sunken">
                {byId.get(img.assetId)?.thumb ? <img src={byId.get(img.assetId)!.thumb} alt="" className="size-full object-cover" /> : null}
              </div>
              <input
                value={img.caption ?? ''}
                placeholder={t('images.caption')}
                readOnly={readOnly}
                maxLength={200}
                aria-label={t('images.caption')}
                onChange={(e) => onChange(value.map((v, i) => (i === index ? { ...v, caption: e.target.value || undefined } : v)))}
                className="h-8 min-w-0 flex-1 rounded-sm border border-control bg-surface px-2 text-table outline-none focus:border-accent focus:ring-[3px] focus:ring-[var(--dk-focus-ring)]"
              />
              {!readOnly ? <IconButton icon={X} size="xs" label={t('images.remove')} onClick={() => onChange(value.filter((_, i) => i !== index))} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!readOnly && value.length < max ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="subtle" icon={ImagePlus} className="self-start">
              {t('images.add')}
            </Button>
          </PopoverTrigger>
          <PopoverContent flush align="start">
            <ImageLibrary
              selected={value.map((v) => v.assetId)}
              onPick={(img) => {
                if (!value.some((v) => v.assetId === img.id)) onChange([...value, { assetId: img.id }])
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      ) : null}
      <p className="text-meta text-fg-muted">{t('images.max', { max })}</p>
    </div>
  )
}
