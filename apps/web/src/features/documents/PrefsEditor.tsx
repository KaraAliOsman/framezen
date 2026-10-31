import { useId, type ReactNode } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import type { DocumentPrefs } from '@framezen/shared'
import { cn } from '../../lib/cn'
import { Field, Input, NumberField, SegmentedControl, Switch, Textarea, Tooltip } from '../../ui'
import { SUGGESTED_TEXTS } from './model/prefs'

export type PrefsPatch = Partial<DocumentPrefs>

const FONTS: { value: DocumentPrefs['font']; name: string; hint: string; family: string }[] = [
  { value: 'instrument', name: 'Instrument', hint: 'Moderna y clara', family: "'Instrument Sans Variable', sans-serif" },
  { value: 'serif', name: 'Fraunces', hint: 'Editorial, con serifa', family: "'Fraunces Variable', Georgia, serif" },
  { value: 'grotesk', name: 'Inter Tight', hint: 'Compacta y técnica', family: "'Inter Tight Variable', sans-serif" },
]

/** Colores sobrios que se leen bien impresos (todos con contraste AA sobre blanco). */
export const ACCENTS: { hex: string; name: string }[] = [
  { hex: '#2747C2', name: 'Tinta' },
  { hex: '#1F1C18', name: 'Grafito' },
  { hex: '#24434D', name: 'Petróleo' },
  { hex: '#2F7D4F', name: 'Bosque' },
  { hex: '#A35F00', name: 'Ocre' },
  { hex: '#8A2219', name: 'Vino' },
  { hex: '#5B3A22', name: 'Nogal' },
]

const SHOW: { key: keyof Pick<DocumentPrefs, 'showUnitPrice' | 'showArea' | 'showGlass' | 'showLine' | 'showColorSwatch' | 'showExteriorView'>; label: string; hint: string }[] = [
  { key: 'showUnitPrice', label: 'Precio por unidad', hint: 'Además del total de cada ventana' },
  { key: 'showArea', label: 'Metros cuadrados', hint: 'Por ventana y en el total' },
  { key: 'showGlass', label: 'Vidrio', hint: 'Tipo y espesor' },
  { key: 'showLine', label: 'Línea de perfiles', hint: 'Por ejemplo, PVC PRO6004' },
  { key: 'showColorSwatch', label: 'Muestra de color', hint: 'Un cuadrito con el color real' },
  { key: 'showExteriorView', label: 'Vista exterior', hint: 'Dibujo visto desde la calle' },
]

export function PrefsEditor({
  prefs,
  orgAccent,
  onChange,
  showTexts = true,
  children,
}: {
  prefs: DocumentPrefs
  orgAccent?: string
  onChange: (patch: PrefsPatch, mergeKey?: string) => void
  /** En el catálogo de productos no hay textos comerciales. */
  showTexts?: boolean
  children?: ReactNode
}) {
  const colorInput = useId()
  const accent = prefs.accent ?? orgAccent ?? ACCENTS[0].hex
  const palette = orgAccent && !ACCENTS.some((a) => a.hex.toLowerCase() === orgAccent.toLowerCase()) ? [{ hex: orgAccent, name: 'Tu marca' }, ...ACCENTS] : ACCENTS
  const custom = !palette.some((a) => a.hex.toLowerCase() === accent.toLowerCase())
  const textsChanged = (Object.keys(SUGGESTED_TEXTS) as (keyof typeof SUGGESTED_TEXTS)[]).some((k) => prefs[k] !== SUGGESTED_TEXTS[k])

  return (
    <div className="flex flex-col gap-7">
      {children}

      <Group title="Estilo">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipografía">
          {FONTS.map((font) => {
            const active = prefs.font === font.value
            return (
              <button
                key={font.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ font: font.value })}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-md border px-2.5 pt-2 pb-2 text-left transition-colors duration-120',
                  active ? 'border-ink-500 bg-ink-50/60 shadow-[inset_0_0_0_1px_var(--ink-500)]' : 'border-paper-200 hover:border-paper-350/70',
                )}
              >
                <span className="text-[26px] leading-none text-paper-900" style={{ fontFamily: font.family, fontWeight: font.value === 'serif' ? 500 : 600 }}>
                  Aa
                </span>
                <span className="text-[13px] font-medium text-paper-900">{font.name}</span>
                <span className="text-meta leading-tight text-paper-600">{font.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-paper-900">Color de acento</span>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Color de acento">
            {palette.map((a) => {
              const active = a.hex.toLowerCase() === accent.toLowerCase()
              return (
                <Tooltip key={a.hex} content={a.name}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={a.name}
                    onClick={() => onChange({ accent: a.name === 'Tu marca' ? undefined : a.hex })}
                    className={cn(
                      'relative inline-flex size-8 items-center justify-center rounded-full transition-transform duration-120 active:scale-95',
                      active ? 'ring-2 ring-paper-900 ring-offset-2 ring-offset-paper-0' : 'ring-1 ring-black/10',
                    )}
                    style={{ background: a.hex }}
                  >
                    {active ? <Check aria-hidden className="size-4 text-white" strokeWidth={2.5} /> : null}
                  </button>
                </Tooltip>
              )
            })}
            <label
              htmlFor={colorInput}
              className={cn(
                'relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] text-paper-600 hover:text-paper-900',
                custom ? 'border-paper-900 text-paper-900' : 'border-paper-200',
              )}
            >
              <span aria-hidden className={cn('size-3.5 rounded-full', custom ? 'ring-1 ring-black/10' : 'border border-dashed border-paper-350')} style={custom ? { background: accent } : undefined} />
              Otro
              <input
                id={colorInput}
                type="color"
                value={accent}
                onChange={(e) => onChange({ accent: e.target.value.toUpperCase() }, 'accent')}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Elegir otro color"
              />
            </label>
          </div>
          <p className="text-meta text-paper-600">Títulos, líneas y el total. Usa el color de tu marca para que el documento se reconozca.</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-paper-900">Papel</span>
          <SegmentedControl
            aria-label="Papel"
            size="sm"
            value={prefs.paper}
            onValueChange={(paper) => onChange({ paper })}
            options={[
              { value: 'letter', label: 'Carta' },
              { value: 'a4', label: 'A4' },
            ]}
          />
        </div>
      </Group>

      {showTexts ? (
        <>
          <Group title="Qué mostrar">
            <div className="flex flex-col gap-3">
              {SHOW.map((s) => (
                <Switch key={s.key} checked={prefs[s.key]} onCheckedChange={(v) => onChange({ [s.key]: v })} label={s.label} description={s.hint} size="sm" />
              ))}
            </div>
          </Group>

          <Group
            title="Textos"
            hint="También puedes escribir directo sobre el documento."
            action={
              textsChanged ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...SUGGESTED_TEXTS })}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xs text-[13px] font-medium whitespace-nowrap text-ink-600 hover:text-ink-700"
                >
                  <RotateCcw aria-hidden className="size-3.5" strokeWidth={1.75} />
                  Textos sugeridos
                </button>
              ) : null
            }
          >
            <Field label="Presentación">
              <Textarea value={prefs.intro} onChange={(e) => onChange({ intro: e.target.value }, 'intro')} rows={3} />
            </Field>
            <Field label="Condiciones" hint="Una por línea. Empieza con «-» para que salgan como lista.">
              <Textarea value={prefs.conditions} onChange={(e) => onChange({ conditions: e.target.value }, 'conditions')} rows={4} />
            </Field>
            <Field label="Forma de pago" hint="Con porcentajes («50 % al aceptar, 50 % contra entrega») calculamos las cuotas.">
              <Input value={prefs.paymentTerms} onChange={(e) => onChange({ paymentTerms: e.target.value }, 'paymentTerms')} />
            </Field>
            <Field label="Garantía">
              <Textarea value={prefs.warranty} onChange={(e) => onChange({ warranty: e.target.value }, 'warranty')} rows={2} />
            </Field>
            <Field label="Plazo de entrega">
              <Input value={prefs.leadTimeText} onChange={(e) => onChange({ leadTimeText: e.target.value }, 'leadTimeText')} />
            </Field>
            <div className="grid grid-cols-[120px_1fr] items-start gap-3">
              <Field label="Vigencia">
                <NumberField value={prefs.validityDays} onChange={(v) => onChange({ validityDays: Math.max(0, Math.round(v ?? 0)) }, 'validityDays')} unit="días" min={0} max={365} step={1} bigStep={5} decimals={0} />
              </Field>
              <p className="pt-7 text-meta leading-4 text-paper-600">{prefs.validityDays > 0 ? 'La fecha de vencimiento se calcula sola desde el día de envío.' : 'Sin vencimiento.'}</p>
            </div>
            <Field label="Firma" optional>
              <Input value={prefs.signatureName ?? ''} onChange={(e) => onChange({ signatureName: e.target.value || undefined }, 'signatureName')} placeholder="Javiera Soto, ventas" />
            </Field>
            <Field label="Pie de página" optional hint="Datos de transferencia, redes o lo que quieras al final de cada hoja.">
              <Input value={prefs.footer ?? ''} onChange={(e) => onChange({ footer: e.target.value || undefined }, 'footer')} placeholder="Banco · Cuenta corriente · RUT" />
            </Field>
          </Group>
        </>
      ) : null}
    </div>
  )
}

function Group({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 border-b border-paper-200 pb-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-[0.01em] text-paper-900">{title}</h3>
          {hint ? <p className="text-meta text-paper-600">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
