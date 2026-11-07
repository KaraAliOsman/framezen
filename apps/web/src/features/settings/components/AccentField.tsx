import { useEffect, useState } from 'react'
import { Check, Pipette } from 'lucide-react'
import { contrast, isHex, parseHex, toHex } from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Input } from '../../../ui'
import es from '../i18n/es'

export type AccentPresetKey = 'ink' | 'petrol' | 'forest' | 'burgundy' | 'terracotta' | 'ochre' | 'graphite' | 'black'

/** Colores sobrios que funcionan bien en papel (todos con contraste AA sobre blanco). */
export const ACCENT_PRESETS: readonly { hex: string; key: AccentPresetKey }[] = [
  { hex: '#2747C2', key: 'ink' },
  { hex: '#1F5F6B', key: 'petrol' },
  { hex: '#2F6B4F', key: 'forest' },
  { hex: '#8A2E3B', key: 'burgundy' },
  { hex: '#B4532A', key: 'terracotta' },
  { hex: '#8A5A00', key: 'ochre' },
  { hex: '#383E42', key: 'graphite' },
  { hex: '#1F1C18', key: 'black' },
]

/** Mismo color por defecto que los documentos (`@dekopen/documents` › DEFAULT_ACCENT). */
export const DEFAULT_ACCENT = '#2747C2'

export function normalizeHex(value: string): string | null {
  const v = value.trim()
  if (!isHex(v)) return null
  return toHex(parseHex(v.startsWith('#') ? v : `#${v}`)).toUpperCase()
}

/** Color de marca: muestras sugeridas, color propio y aviso si se leerá poco sobre papel. */
export function AccentField({ value, onChange, compact }: { value?: string | null; onChange: (hex: string) => void; compact?: boolean }) {
  const t = useT(es)
  // Sin color elegido, cada diseño usa su propia paleta: no marcamos ninguna muestra (marcar la
  // primera haría creer que los documentos salen en ese azul cuando no es así).
  const chosen = (value && normalizeHex(value)) || null
  const current = chosen ?? DEFAULT_ACCENT
  const [draft, setDraft] = useState(chosen ?? '')
  useEffect(() => setDraft(chosen ?? ''), [chosen])
  const custom = chosen !== null && !ACCENT_PRESETS.some((p) => p.hex === chosen)
  const ratio = contrast(current, '#FFFFFF')

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t('accent.label')} className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((preset) => {
          const selected = preset.hex === chosen
          const name = t(`accent.presets.${preset.key}`)
          return (
            <button
              key={preset.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={name}
              title={name}
              onClick={() => onChange(preset.hex)}
              className={cn(
                'relative inline-flex items-center justify-center rounded-sm transition-transform duration-100 ease-out active:scale-95',
                compact ? 'size-7' : 'size-8',
                selected ? 'ring-2 ring-fg-strong ring-offset-2 ring-offset-surface' : 'hover:scale-105',
              )}
              style={{ background: preset.hex }}
            >
              {selected ? <Check aria-hidden strokeWidth={2.25} className="size-4 text-white" /> : null}
            </button>
          )
        })}
        <label
          className={cn(
            'relative inline-flex cursor-pointer items-center justify-center rounded-sm border border-dashed border-control text-fg-muted transition-colors duration-100 hover:border-control-hover hover:text-fg',
            compact ? 'size-7' : 'size-8',
            custom && 'border-solid ring-2 ring-fg-strong ring-offset-2 ring-offset-surface',
          )}
          style={custom ? { background: current, borderColor: 'transparent' } : undefined}
          title={t('accent.other')}
        >
          <span className="sr-only">{t('accent.pickOther')}</span>
          {custom ? <Check aria-hidden strokeWidth={2.25} className="size-4 text-white" /> : <Pipette aria-hidden strokeWidth={1.75} className="size-3.5" />}
          <input
            type="color"
            value={current.toLowerCase()}
            onChange={(e) => {
              const hex = normalizeHex(e.target.value)
              if (hex) onChange(hex)
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        {!compact ? (
          <Input
            aria-label={t('accent.code')}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              const hex = normalizeHex(e.target.value)
              if (hex) onChange(hex)
            }}
            onBlur={() => setDraft(chosen ?? '')}
            placeholder={DEFAULT_ACCENT}
            spellCheck={false}
            className="tabular ml-1 w-28"
          />
        ) : null}
      </div>
      {ratio < 3 ? (
        <p role="status" className="text-table text-warning">
          {t('accent.tooLight')}
        </p>
      ) : null}
    </div>
  )
}
