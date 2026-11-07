import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react'
import type { Catalog, Color } from '@dekopen/engine'
import { BUILTIN_TEXTURE_IDS, BUILTIN_TEXTURES, type BuiltinTextureId, type CatalogColorView, type TextureAsset, type TextureRef } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useLocale, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Input,
  PlanGate,
  SegmentedControl,
  Sheet,
  SheetContent,
  Skeleton,
  toast,
  toastUndo,
} from '../../../ui'
import { IconFoil } from '../../../ui/icons'
import { texturesApi, useCustomColors, usePatchColor, useRefreshTextures, useRestoreColor, useTextures } from './api'
import { ColorSheet, type ColorSheetProps } from './ColorSheet'
import es from './i18n/es'
import { appearanceOf, appearanceOfRef, factorToPct, type ColorAppearance } from './model'
import { TexturePicker } from './TexturePicker'
import { TextureSwatch } from './TextureSwatch'
import { UploadSheet } from './UploadSheet'

export interface ColorsTabProps {
  catalog: Catalog | undefined
  loading: boolean
}

const GRID = 'grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'

function Section({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-h4 font-medium text-fg-strong">{title}</h2>
          {description ? <p className="mt-1 text-table text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** Tarjeta de material: muestra cuadrada grande, nombre y una línea de datos. */
function MaterialCard({
  appearance,
  name,
  meta,
  badge,
  onOpen,
  menu,
  selected,
}: {
  appearance: ColorAppearance
  name: string
  meta?: ReactNode
  badge?: ReactNode
  onOpen?: () => void
  menu?: ReactNode
  selected?: boolean
}) {
  const body = (
    <>
      <TextureSwatch appearance={appearance} fill />
      <div className="flex min-w-0 flex-col gap-0.5 pt-2 text-left">
        <span className="truncate text-fg-strong">{name}</span>
        {meta ? <span className="truncate text-meta text-fg-muted">{meta}</span> : null}
        {badge ? <span className="mt-0.5 flex flex-wrap gap-1">{badge}</span> : null}
      </div>
    </>
  )
  return (
    <div className={cn('group relative min-w-0', selected && 'rounded-sm ring-2 ring-accent ring-offset-2 ring-offset-canvas')}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex w-full flex-col rounded-sm">
          {body}
        </button>
      ) : (
        <div className="flex flex-col">{body}</div>
      )}
      {menu ? <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100">{menu}</div> : null}
    </div>
  )
}

/** Colores, texturas y biblioteca de foliados del catálogo (pestaña «Colores y texturas»). */
export function ColorsTab({ catalog, loading }: ColorsTabProps) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const { locale } = useLocale()
  const plan = usePlan()
  const canUpload = plan?.has('texture_upload') ?? false
  const textures = useTextures()
  const colors = useCustomColors()
  const patchColor = usePatchColor()
  const restoreColor = useRestoreColor()
  const refreshTextures = useRefreshTextures()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const [editor, setEditor] = useState<{ color?: CatalogColorView | null; initial?: ColorSheetProps['initial'] } | null>(null)
  const [pickerFor, setPickerFor] = useState<Color | null>(null)
  const [textureTab, setTextureTab] = useState<'mine' | 'library'>('mine')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [dragging, setDragging] = useState(false)

  const uploads = useMemo(() => textures.data?.items ?? [], [textures.data])
  const uploadsMap = useMemo(() => new Map(uploads.map((u) => [u.id, u])), [uploads])
  const own = colors.data?.items ?? []
  const active = own.filter((c) => !c.archived)
  const archived = own.filter((c) => c.archived)
  const overrides = colors.data?.overrides ?? {}

  const usage = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const line of catalog?.lines ?? []) for (const id of line.colorIds) map.set(id, [...(map.get(id) ?? []), line.name])
    return map
  }, [catalog])
  const ownIds = new Set(own.map((c) => c.id))
  const baseColors = (catalog?.colors ?? []).filter((c) => !ownIds.has(c.id))
  const baseUsed = baseColors.filter((c) => usage.has(c.id))
  const baseUnused = baseColors.filter((c) => !usage.has(c.id))

  const priceLabel = (c: CatalogColorView) => {
    const pct = factorToPct(c.priceFactor)
    if (pct === null) return t('card.priceManual')
    if (pct === 0) return t('card.priceSame')
    return pct > 0 ? t('card.priceSurcharge', { pct: fmt.pct(pct, 1) }) : t('card.priceDiscount', { pct: fmt.pct(-pct, 1) })
  }

  const finishBadge = (finish: keyof typeof BUILTIN_TEXTURES[BuiltinTextureId] | string) => (
    <span className="text-meta text-fg-muted">{g.term(`finish.${finish}` as 'finish.smooth')}</span>
  )

  function openUpload(file?: File | null) {
    setDroppedFile(file ?? null)
    setUploadOpen(true)
  }

  async function setBaseTexture(color: Color, texture: TextureRef | null, label?: string) {
    try {
      await patchColor.mutateAsync({ id: color.id, body: { texture } })
      toast.success(texture ? t('toast.textureApplied', { color: color.name, texture: label ?? '' }) : t('toast.textureReset', { color: color.name }))
      setPickerFor(null)
    } catch (err) {
      toast.error(humanError(err))
    }
  }

  async function deleteTexture(asset: TextureAsset) {
    try {
      const res = await texturesApi.remove(asset.id)
      refreshTextures(res.colors > 0)
      const detail = res.colors > 0 ? ` ${t('toast.textureDeletedColors', { count: res.colors })}` : ''
      toastUndo(`${t('toast.textureDeleted', { name: asset.name })}${detail}`, () => {
        void texturesApi.restore(asset.id).then(() => refreshTextures(res.colors > 0))
      })
    } catch (err) {
      toast.error(humanError(err))
    }
  }

  async function renameTexture(id: string, name: string) {
    setRenaming(null)
    const clean = name.trim()
    if (!clean || clean === uploadsMap.get(id)?.name) return
    try {
      await texturesApi.patch(id, { name: clean.slice(0, 80) })
      refreshTextures()
      toast.success(t('toast.textureRenamed'))
    } catch (err) {
      toast.error(humanError(err))
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file && canUpload) openUpload(file)
  }

  if (loading || !catalog) {
    return (
      <div className="flex flex-col gap-6" aria-busy>
        <Skeleton className="h-6 w-56" />
        <div className={GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-sm" />
          ))}
        </div>
      </div>
    )
  }

  const uploadZone = (
    <button
      type="button"
      onClick={() => openUpload()}
      className={cn(
        'flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-sm px-2 text-center transition-colors duration-100 ease-out',
        dragging ? 'bg-accent-subtle' : 'bg-sunken hover:bg-hover',
      )}
    >
      <span className="text-table font-medium text-fg-strong">{t('tab.upload')}</span>
      <span className="text-meta text-fg-muted">{t('upload.dropFormats')}</span>
    </button>
  )

  const textureGrid = (
    <div className={GRID}>
      {canUpload ? uploadZone : null}
      {uploads.map((asset) => {
        const ref: TextureRef = { kind: 'upload', assetId: asset.id, scaleMm: asset.meta.scaleMm, finish: asset.meta.finish }
        const appearance = appearanceOfRef(ref, asset.meta.palette.average, uploadsMap)
        const editingName = renaming?.id === asset.id
        return (
          <div key={asset.id} className="group relative min-w-0">
            <TextureSwatch appearance={appearance} fill name={asset.name} />
            <div className="flex min-w-0 flex-col gap-0.5 pt-2">
              {editingName ? (
                <Input
                  size="sm"
                  autoFocus
                  value={renaming.name}
                  maxLength={80}
                  aria-label={t('menu.rename')}
                  onChange={(e) => setRenaming({ id: asset.id, name: e.target.value })}
                  onBlur={() => void renameTexture(asset.id, renaming.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void renameTexture(asset.id, renaming.name)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <span className="truncate text-fg-strong">{asset.name}</span>
              )}
              <span className="truncate text-meta text-fg-muted">{t('textures.scale', { size: fmt.mm(asset.meta.scaleMm, { unit: true }) })}</span>
              </div>
            <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} label={t('card.actions', { name: asset.name })} size="xs" variant="secondary" className="shadow-xs" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem icon={Plus} onSelect={() => setEditor({ initial: { name: asset.name, hex: asset.meta.palette.average, texture: ref } })}>
                    {t('menu.createColor')}
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={Pencil} onSelect={() => setRenaming({ id: asset.id, name: asset.name })}>
                    {t('menu.rename')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={Trash2} danger onSelect={() => void deleteTexture(asset)}>
                    {t('menu.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      })}
    </div>
  )

  const libraryGrid = (
    <div className={GRID}>
      {BUILTIN_TEXTURE_IDS.map((id) => {
        const b = BUILTIN_TEXTURES[id]
        const ref: TextureRef = { kind: 'builtin', id }
        return (
          <MaterialCard
            key={id}
            appearance={appearanceOfRef(ref, b.hex)}
            name={b.names[locale]}
            meta={[b.ral, t('textures.scale', { size: fmt.mm(b.scaleMm, { unit: true }) })].filter(Boolean).join(' · ')}
            badge={finishBadge(b.finish)}
            onOpen={() => setEditor({ initial: { name: b.names[locale], hex: b.hex, texture: ref } })}
          />
        )
      })}
    </div>
  )

  const baseCard = (color: Color, unused = false) => {
    const lines = usage.get(color.id) ?? []
    const overridden = Boolean(overrides[color.id])
    return (
      <MaterialCard
        key={color.id}
        appearance={appearanceOf(color, uploadsMap)}
        name={color.name}
        meta={unused ? t('lines.unusedDescription') : t('card.lineCount', { count: lines.length }) + (lines.length ? ` · ${lines.slice(0, 2).join(', ')}${lines.length > 2 ? '…' : ''}` : '')}
        badge={overridden ? <span className="text-meta text-fg-muted">{t('card.ownTexture')}</span> : null}
        menu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={MoreHorizontal} label={t('card.actions', { name: color.name })} size="xs" variant="secondary" className="shadow-xs" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={IconFoil} onSelect={() => setPickerFor(color)}>
                {t('menu.useMyTexture')}
              </DropdownMenuItem>
              {overridden ? (
                <DropdownMenuItem icon={RotateCcw} onSelect={() => void setBaseTexture(color, null)}>
                  {t('menu.resetTexture')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <h2 className="sr-only">{t('tab.title')}</h2>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="subtle" icon={Plus} onClick={() => setEditor({ color: null })}>
            {t('tab.newColor')}
          </Button>
          {canUpload ? (
            <Button variant="primary" icon={Upload} onClick={() => openUpload()}>
              {t('tab.upload')}
            </Button>
          ) : null}
        </div>
      </div>

      <Section title={t('own.title')}>
        {colors.isLoading ? (
          <div className={GRID}>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-sm" />
            ))}
          </div>
        ) : active.length ? (
          <div className={GRID}>
            {active.map((c) => (
              <MaterialCard
                key={c.id}
                appearance={appearanceOf({ name: c.name, hex: c.hex, texture: c.texture }, uploadsMap)}
                name={c.name}
                meta={[c.code, t('card.lineCount', { count: c.lineIds.length })].filter(Boolean).join(' · ')}
                badge={
                  <>
                    {finishBadge(c.texture?.finish ?? appearanceOf({ name: c.name, hex: c.hex, texture: c.texture }, uploadsMap).finish)}
                    <span className="text-meta text-fg-muted">{priceLabel(c)}</span>
                  </>
                }
                onOpen={() => setEditor({ color: c })}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-fg-strong">{t('own.emptyTitle')}</p>
              <p className="mt-1 max-w-xl text-table text-fg-muted">{t('own.emptyDescription')}</p>
            </div>
          </div>
        )}
        {archived.length ? (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => setShowArchived((s) => !s)} aria-expanded={showArchived} className="self-start text-table font-medium text-fg-muted hover:text-fg">
              {t('own.archived', { count: archived.length })}
            </button>
            {showArchived ? (
              <ul className="flex flex-col divide-y divide-divider">
                {archived.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <TextureSwatch appearance={appearanceOf({ name: c.name, hex: c.hex, texture: c.texture }, uploadsMap)} size={28} />
                    <span className="min-w-0 flex-1 truncate text-fg">{c.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={RotateCcw}
                      onClick={() =>
                        restoreColor.mutate(c.id, {
                          onSuccess: (res) => toast.success(t('toast.colorRestored', { name: res.color.name })),
                          onError: (err) => toast.error(humanError(err)),
                        })
                      }
                    >
                      {t('own.restore')}
                    </Button>
                  </li>
                ))}
                <li className="py-2 text-meta text-fg-muted">{t('own.archivedHint')}</li>
              </ul>
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title={t('lines.title')} description={t('lines.description')}>
        <div className={GRID}>{baseUsed.map((c) => baseCard(c))}</div>
      </Section>

      <div
        onDragOver={(e) => {
          if (!canUpload) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Section
          title={t('textures.title')}
          description={t('textures.description')}
          actions={
            <SegmentedControl
              aria-label={t('textures.title')}
              value={textureTab}
              onValueChange={(v) => setTextureTab(v as 'mine' | 'library')}
              size="sm"
              options={[
                { value: 'mine', label: t('textures.mine') },
                { value: 'library', label: t('textures.library') },
              ]}
            />
          }
        >
          {textureTab === 'library' ? (
            libraryGrid
          ) : canUpload ? (
            uploads.length || textures.isLoading ? (
              textureGrid
            ) : (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-center">
                {uploadZone}
                <div className="max-w-md">
                  <p className="font-medium text-fg-strong">{t('textures.emptyTitle')}</p>
                  <p className="mt-1 text-table text-fg-muted">{t('textures.emptyDescription')}</p>
                </div>
              </div>
            )
          ) : (
            <PlanGate feature="texture_upload" allowed={false}>
              {uploads.length ? textureGrid : libraryGrid}
            </PlanGate>
          )}
        </Section>
      </div>

      {baseUnused.length ? (
        <Section title={t('lines.unusedTitle')} description={t('lines.unusedDescription')}>
          <div className={GRID}>{baseUnused.map((c) => baseCard(c, true))}</div>
        </Section>
      ) : null}

      <UploadSheet
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open)
          if (!open) setDroppedFile(null)
        }}
        catalog={catalog}
        initialFile={droppedFile}
        onSaved={() => setTextureTab('mine')}
      />
      <ColorSheet open={editor !== null} onOpenChange={(open) => !open && setEditor(null)} catalog={catalog} uploads={uploads} color={editor?.color ?? null} initial={editor?.initial} />
      <Sheet open={pickerFor !== null} onOpenChange={(open) => !open && setPickerFor(null)}>
        <SheetContent
          title={t('picker.title', { name: pickerFor?.name ?? '' })}
          description={t('picker.description')}
          width={560}
          footer={
            pickerFor && overrides[pickerFor.id] ? (
              <Button variant="ghost" icon={RotateCcw} onClick={() => void setBaseTexture(pickerFor, null)}>
                {t('menu.resetTexture')}
              </Button>
            ) : null
          }
        >
          {pickerFor ? (
            <TexturePicker
              aria-label={t('picker.title', { name: pickerFor.name })}
              value={(pickerFor.texture as TextureRef | undefined) ?? null}
              uploads={uploads}
              onChange={(ref) => {
                if (!ref) return
                const label = ref.kind === 'upload' ? (uploadsMap.get(ref.assetId)?.name ?? '') : BUILTIN_TEXTURES[ref.id].names[locale]
                void setBaseTexture(pickerFor, ref, label)
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
