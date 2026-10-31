import { useEffect, useState } from 'react'
import { Check, Pipette } from 'lucide-react'
import { contrast, isHex, toHex, parseHex } from '@framezen/documents'
import { cn } from '../../../lib/cn'
import { Input } from '../../../ui'

/** Colores sobrios que funcionan bien en papel (todos con contraste AA sobre blanco). */
export const ACCENT_PRESETS: { hex: string; name: string }[] = [
  { hex: '#2747C2', name: 'Tinta' },
  { hex: '#1F5F6B', name: 'Petróleo' },
  { hex: '#2F6B4F', name: 'Bosque' },
  { hex: '#8A2E3B', name: 'Burdeo' },
  { hex: '#B4532A', name: 'Terracota' },
  { hex: '#8A5A00', name: 'Ocre' },
  { hex: '#383E42', name: 'Grafito' },
  { hex: '#1F1C18', name: 'Negro' },
]

export const DEFAULT_ACCENT = '#2747C2'

export function normalizeHex(value: string): string | null {
  const v = value.trim()
  if (!isHex(v)) return null
  return toHex(parseHex(v.startsWith('#') ? v : `#${v}`)).toUpperCase()
}

/** Color de marca: muestras sugeridas, color propio y aviso si se leerá poco sobre papel. */
export function AccentField({ value, onChange, compact }: { value?: string | null; onChange: (hex: string) => void; compact?: boolean }) {
  const current = (value && normalizeHex(value)) || DEFAULT_ACCENT
  const [draft, setDraft] = useState(current)
  useEffect(() => setDraft(current), [current])
  const custom = !ACCENT_PRESETS.some((p) => p.hex === current)
  const ratio = contrast(current, '#FFFFFF')

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Color de marca" className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((preset) => {
          const selected = preset.hex === current
          return (
            <button
              key={preset.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.name}
              title={preset.name}
              onClick={() => onChange(preset.hex)}
              className={cn(
                'relative inline-flex items-center justify-center rounded-full transition-transform duration-120 ease-out active:scale-95',
                compact ? 'size-7' : 'size-8',
                selected ? 'ring-2 ring-paper-900 ring-offset-2 ring-offset-paper-0' : 'hover:scale-105',
              )}
              style={{ background: preset.hex }}
            >
              {selected ? <Check aria-hidden strokeWidth={2.25} className="size-4 text-paper-0" /> : null}
            </button>
          )
        })}
        <label
          className={cn(
            'relative inline-flex cursor-pointer items-center justify-center rounded-full border border-dashed border-paper-350 text-paper-600 hover:border-paper-600 hover:text-paper-900',
            compact ? 'size-7' : 'size-8',
            custom && 'border-solid ring-2 ring-paper-900 ring-offset-2 ring-offset-paper-0',
          )}
          style={custom ? { background: current, borderColor: 'transparent' } : undefined}
          title="Otro color"
        >
          <span className="sr-only">Elegir otro color</span>
          {custom ? <Check aria-hidden strokeWidth={2.25} className="size-4 text-paper-0" /> : <Pipette aria-hidden strokeWidth={1.75} className="size-3.5" />}
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
            aria-label="Código del color"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              const hex = normalizeHex(e.target.value)
              if (hex) onChange(hex)
            }}
            onBlur={() => setDraft(current)}
            spellCheck={false}
            className="ml-1 w-28 font-mono text-[13px] uppercase"
          />
        ) : null}
      </div>
      {ratio < 3 ? (
        <p role="status" className="text-[13px] leading-[18px] text-warn-800">
          Este color es muy claro para títulos sobre papel blanco: en el documento lo oscurecemos un poco para que se lea.
        </p>
      ) : null}
    </div>
  )
}
