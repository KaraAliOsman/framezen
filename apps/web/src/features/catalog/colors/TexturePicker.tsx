import { useState } from 'react'
import { BUILTIN_TEXTURE_IDS, BUILTIN_TEXTURES, type TextureAsset, type TextureRef } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { SegmentedControl } from '../../../ui'
import es from './i18n/es'
import { appearanceOfRef, type ColorAppearance } from './model'
import { TextureSwatch } from './TextureSwatch'

export interface TexturePickerProps {
  value: TextureRef | null
  /** `hex` = color promedio de la textura elegida (para el respaldo plano). */
  onChange: (ref: TextureRef | null, hex?: string) => void
  uploads: readonly TextureAsset[]
  /** Ofrecer «Liso, sin textura». */
  allowNone?: boolean
  /** Color plano para la opción «Liso». */
  flatHex?: string
  'aria-label': string
}

const sameRef = (a: TextureRef | null, b: TextureRef | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && (a.kind === 'builtin' ? a.id === (b as typeof a).id : a.assetId === (b as Extract<TextureRef, { kind: 'upload' }>).assetId))

/** Galería para elegir textura: las tuyas (subidas) y la biblioteca DEKOPEN, con muestras reales. */
export function TexturePicker({ value, onChange, uploads, allowNone, flatHex = '#F5F5F0', ...aria }: TexturePickerProps) {
  const t = useT(es)
  const { locale } = useLocale()
  const [tab, setTab] = useState<'mine' | 'library'>(value?.kind === 'builtin' || !uploads.length ? 'library' : 'mine')

  const option = (key: string, label: string, appearance: ColorAppearance, ref: TextureRef | null, hex?: string) => {
    const selected = sameRef(value, ref)
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => onChange(ref, hex)}
        className={cn(
          'group flex min-w-0 flex-col items-stretch gap-1.5 rounded-panel p-1.5 text-left transition-colors duration-100 ease-out',
          selected ? 'bg-accent-subtle shadow-[0_0_0_2px_var(--dk-accent)]' : 'hover:bg-hover',
        )}
      >
        <TextureSwatch appearance={appearance} fill viewMm={260} />
        <span className={cn('line-clamp-2 text-meta', selected ? 'font-medium text-accent-ink' : 'text-fg')}>{label}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        aria-label={t('textures.title')}
        value={tab}
        onValueChange={(v) => setTab(v as 'mine' | 'library')}
        size="sm"
        options={[
          { value: 'mine', label: `${t('picker.mine')} · ${uploads.length}` },
          { value: 'library', label: t('picker.library') },
        ]}
      />
      <div role="radiogroup" aria-label={aria['aria-label']} className="grid grid-cols-3 gap-1 sm:grid-cols-4">
        {allowNone ? option('none', t('picker.none'), { hex: flatHex, source: 'flat', finish: 'smooth', scaleMm: 300 }, null) : null}
        {tab === 'mine'
          ? uploads.map((u) => {
              const ref: TextureRef = { kind: 'upload', assetId: u.id, scaleMm: u.meta.scaleMm, finish: u.meta.finish }
              return option(u.id, u.name, appearanceOfRef(ref, u.meta.palette.average, new Map([[u.id, u]])), ref, u.meta.palette.average)
            })
          : BUILTIN_TEXTURE_IDS.map((id) => {
              const b = BUILTIN_TEXTURES[id]
              const ref: TextureRef = { kind: 'builtin', id }
              return option(id, b.names[locale], appearanceOfRef(ref, b.hex), ref, b.hex)
            })}
      </div>
      {tab === 'mine' && !uploads.length ? <p className="text-table text-fg-muted">{t('picker.emptyMine')}</p> : null}
    </div>
  )
}
