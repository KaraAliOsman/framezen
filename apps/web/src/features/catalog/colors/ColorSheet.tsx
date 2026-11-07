import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Archive, ArrowRight } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { CatalogColorView, CustomColorPatchBody, TextureAsset, TextureRef } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useT } from '../../../lib/i18n'
import {
  Button,
  Checkbox,
  Field,
  Input,
  Notice,
  NumberField,
  SaveIndicator,
  SegmentedControl,
  Select,
  Sheet,
  SheetContent,
  toast,
  toastUndo,
  type SaveStatus,
} from '../../../ui'
import { useArchiveColor, useCreateColor, usePatchColor, useRestoreColor } from './api'
import es from './i18n/es'
import { appearanceOf, factorToPct, pctToFactor } from './model'
import { TexturePicker } from './TexturePicker'
import { TextureSwatch } from './TextureSwatch'
import { WindowPreview } from './WindowPreview'

export interface ColorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: Catalog | undefined
  uploads: readonly TextureAsset[]
  /** Color propio a editar (si no, se crea uno nuevo). */
  color?: CatalogColorView | null
  /** Valores iniciales al crear (desde una textura o la biblioteca). */
  initial?: { name?: string; hex?: string; texture?: TextureRef | null }
}

interface FormState {
  name: string
  code: string
  hex: string
  texture: TextureRef | null
  priceMode: 'surcharge' | 'manual'
  surcharge: number | null
  priceBaseColorId: string | undefined
  lineIds: string[]
}

const HEX = /^#[0-9a-f]{6}$/i

function initialState(color: CatalogColorView | null | undefined, initial: ColorSheetProps['initial'], catalog: Catalog | undefined): FormState {
  const allLines = (catalog?.lines ?? []).map((l) => l.id)
  if (color) {
    return {
      name: color.name,
      code: color.code ?? '',
      hex: color.hex,
      texture: color.texture ?? null,
      priceMode: color.priceFactor !== undefined ? 'surcharge' : 'manual',
      surcharge: factorToPct(color.priceFactor) ?? 0,
      priceBaseColorId: color.priceBaseColorId,
      lineIds: color.lineIds,
    }
  }
  return {
    name: initial?.name ?? '',
    code: '',
    hex: initial?.hex ?? '#A76B32',
    texture: initial?.texture ?? null,
    priceMode: 'surcharge',
    surcharge: 0,
    priceBaseColorId: undefined,
    lineIds: allLines,
  }
}

/** Diferencias del formulario con lo guardado (solo lo que cambió viaja en el PATCH). */
function patchOf(saved: CatalogColorView, form: FormState): CustomColorPatchBody {
  const body: CustomColorPatchBody = {}
  if (form.name.trim() && form.name.trim() !== saved.name) body.name = form.name.trim()
  if (HEX.test(form.hex) && form.hex.toUpperCase() !== saved.hex.toUpperCase()) body.hex = form.hex
  if (form.code.trim() !== (saved.code ?? '')) body.code = form.code.trim() ? form.code.trim() : null
  if (JSON.stringify(form.texture ?? null) !== JSON.stringify(saved.texture ?? null)) body.texture = form.texture
  const factor = form.priceMode === 'surcharge' ? pctToFactor(form.surcharge ?? 0) : undefined
  if (factor !== saved.priceFactor) body.priceFactor = factor ?? null
  const base = form.priceMode === 'surcharge' ? form.priceBaseColorId : undefined
  if ((base ?? null) !== (saved.priceBaseColorId ?? null)) body.priceBaseColorId = base ?? null
  if (form.lineIds.join('|') !== saved.lineIds.join('|')) body.lineIds = form.lineIds
  return body
}

/**
 * Crear o editar un color propio: nombre, textura (biblioteca o propia), color de respaldo,
 * precio (recargo sobre un color de referencia o precios propios) y líneas que lo ofrecen. Al
 * editar se guarda solo; al crear, un botón. Archivar se deshace desde el aviso.
 */
export function ColorSheet({ open, onOpenChange, catalog, uploads, color, initial }: ColorSheetProps) {
  const t = useT(es)
  const create = useCreateColor()
  const patch = usePatchColor()
  const archive = useArchiveColor()
  const restore = useRestoreColor()
  const [form, setForm] = useState<FormState>(() => initialState(color, initial, catalog))
  const [saved, setSaved] = useState<CatalogColorView | null>(color ?? null)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lines = catalog?.lines ?? []

  useEffect(() => {
    if (!open) return
    setForm(initialState(color, initial, catalog))
    setSaved(color ?? null)
    setStatus('idle')
    // Solo al abrir (o al cambiar de color): no pisar lo que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, color?.id])

  // Edición: guardado automático 600 ms después del último cambio.
  useEffect(() => {
    if (!open || !saved) return
    const body = patchOf(saved, form)
    if (!Object.keys(body).length) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setStatus('saving')
      patch.mutate(
        { id: saved.id, body },
        {
          onSuccess: (res) => {
            setSaved(res.color)
            setStatus('saved')
          },
          onError: (err) => {
            setStatus('error')
            toast.error(humanError(err))
          },
        },
      )
    }, 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saved, open])

  const set = (change: Partial<FormState>) => setForm((f) => ({ ...f, ...change }))

  const refOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const l of lines.filter((x) => form.lineIds.includes(x.id))) for (const id of l.colorIds) if (!id.startsWith('custom-')) ids.add(id)
    return (catalog?.colors ?? []).filter((c) => ids.has(c.id)).map((c) => ({ value: c.id, label: c.name }))
  }, [lines, form.lineIds, catalog])
  const refName = (form.priceBaseColorId && catalog?.colors.find((c) => c.id === form.priceBaseColorId)?.name) || refOptions[0]?.label || ''

  const uploadsMap = useMemo(() => new Map(uploads.map((u) => [u.id, u])), [uploads])
  const appearance = appearanceOf({ name: form.name, hex: HEX.test(form.hex) ? form.hex : '#808080', texture: form.texture ?? undefined }, uploadsMap)
  const palette = form.texture?.kind === 'upload' ? uploadsMap.get(form.texture.assetId)?.meta.palette : undefined

  async function submit() {
    if (!form.name.trim() || !HEX.test(form.hex)) return
    try {
      const res = await create.mutateAsync({
        name: form.name.trim(),
        hex: form.hex,
        ...(form.code.trim() ? { code: form.code.trim() } : {}),
        ...(form.texture ? { texture: form.texture } : {}),
        lineIds: form.lineIds,
        ...(form.priceMode === 'surcharge' ? { priceFactor: pctToFactor(form.surcharge ?? 0), ...(form.priceBaseColorId ? { priceBaseColorId: form.priceBaseColorId } : {}) } : {}),
      })
      toast.success(t('toast.colorCreated', { name: res.color.name }))
      onOpenChange(false)
    } catch (err) {
      toast.error(humanError(err))
    }
  }

  async function doArchive() {
    if (!saved) return
    try {
      const res = await archive.mutateAsync(saved.id)
      onOpenChange(false)
      toastUndo(t('toast.colorArchived', { name: res.color.name }), () => restore.mutate(saved.id))
    } catch (err) {
      toast.error(humanError(err))
    }
  }

  const editing = Boolean(saved)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={editing ? t('editor.titleEdit') : t('editor.titleNew')}
        description={t('editor.description')}
        width={560}
        footer={
          editing ? (
            <>
              <Button variant="ghost" icon={Archive} onClick={() => void doArchive()} loading={archive.isPending} className="mr-auto">
                {t('editor.archive')}
              </Button>
              <SaveIndicator status={status} />
            </>
          ) : (
            <Button variant="primary" onClick={() => void submit()} loading={create.isPending} disabled={!form.name.trim() || !HEX.test(form.hex)}>
              {t('editor.create')}
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-6">
          {saved?.archived ? <Notice tone="neutral">{t('editor.archivedNotice')}</Notice> : null}
          <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4 rounded-panel border border-divider bg-sunken p-3">
            <TextureSwatch appearance={appearance} size={96} name={form.name || t('editor.preview')} />
            <WindowPreview appearance={appearance} variant="corner" label={t('editor.preview')} className="h-24 w-full" />
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <Field label={t('editor.name')}>
              <Input value={form.name} maxLength={80} placeholder={t('editor.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} autoFocus={!editing} />
            </Field>
            <Field label={t('editor.code')} optional>
              <Input value={form.code} maxLength={20} onChange={(e) => set({ code: e.target.value })} className="code-id" />
            </Field>
          </div>

          <Field label={t('editor.texture')}>
            <TexturePicker
              aria-label={t('editor.texture')}
              value={form.texture}
              uploads={uploads}
              allowNone
              flatHex={HEX.test(form.hex) ? form.hex : undefined}
              onChange={(texture, hex) => set({ texture, ...(hex && (!editing || form.hex === saved?.hex) ? { hex } : {}) })}
            />
          </Field>

          <Field
            label={t('editor.hex')}
            hint={t('editor.hexHint')}
            aside={
              palette ? (
                <span className="inline-flex items-center gap-1.5">
                  {t('editor.fromTexture')}
                  {[palette.dark, palette.base, palette.average, palette.light].map((h) => (
                    <button key={h} type="button" aria-label={h} onClick={() => set({ hex: h })} className="size-5 rounded-xs border border-black/15" style={{ background: h }} />
                  ))}
                </span>
              ) : undefined
            }
          >
            <Input
              value={form.hex}
              maxLength={7}
              onChange={(e) => set({ hex: e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}` })}
              className="code-id"
              prefix={<span aria-hidden className="size-4 rounded-xs border border-black/15" style={{ background: HEX.test(form.hex) ? form.hex : 'transparent' }} />}
            />
          </Field>

          <Field label={t('editor.price')}>
            <div className="flex flex-col gap-3">
              <SegmentedControl
                aria-label={t('editor.price')}
                value={form.priceMode}
                onValueChange={(v) => set({ priceMode: v as FormState['priceMode'] })}
                size="sm"
                options={[
                  { value: 'surcharge', label: t('editor.priceSurcharge') },
                  { value: 'manual', label: t('editor.priceManual') },
                ]}
              />
              {form.priceMode === 'surcharge' ? (
                <div className="flex flex-col gap-2">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <Select
                      aria-label={t('editor.priceRef')}
                      value={form.priceBaseColorId ?? refOptions[0]?.value}
                      onValueChange={(v) => set({ priceBaseColorId: v })}
                      options={refOptions}
                    />
                    <NumberField aria-label={t('editor.priceSurcharge')} value={form.surcharge} onChange={(v) => set({ surcharge: v })} min={-50} max={500} step={1} bigStep={10} unit="%" />
                  </div>
                  <p className="text-table text-fg-muted">{t('editor.priceHint', { color: refName })}</p>
                </div>
              ) : (
                <Notice
                  tone="neutral"
                  size="compact"
                  action={
                    <Link to="/catalogo?tab=precios" className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover">
                      {t('editor.openPrices')}
                      <ArrowRight aria-hidden className="size-3.5" />
                    </Link>
                  }
                >
                  {t('editor.priceManualHint')}
                </Notice>
              )}
            </div>
          </Field>

          <Field
            label={t('editor.lines')}
            aside={
              lines.length > 1 ? (
                <button type="button" className="font-medium text-accent hover:text-accent-hover" onClick={() => set({ lineIds: form.lineIds.length === lines.length ? [] : lines.map((l) => l.id) })}>
                  {t('editor.allLines')}
                </button>
              ) : undefined
            }
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {lines.map((l) => (
                <Checkbox
                  key={l.id}
                  checked={form.lineIds.includes(l.id)}
                  onCheckedChange={(v) => set({ lineIds: v === true ? [...form.lineIds, l.id] : form.lineIds.filter((id) => id !== l.id) })}
                  label={l.name}
                />
              ))}
            </div>
          </Field>
          {!form.lineIds.length ? (
            <Notice tone="warning" size="compact">
              {t('editor.noLines')}
            </Notice>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
