/**
 * Tema de la plantilla: paleta de 9 roles con contraste verificado (WCAG) y reparación automática,
 * pares de fuentes de la lista cerrada con muestra real, y los tokens acotados (densidad, escala,
 * esquinas, líneas, uso del acento, dibujos, fotos, etiquetas). Cada control emite una DocOp.
 */
import { useEffect, useId, useState } from 'react'
import { Check, Contrast, Palette, TriangleAlert } from 'lucide-react'
import {
  ACCENT_USAGES,
  DENSITIES,
  DOC_FONT_PAIRS,
  DOC_HEADING_WEIGHTS,
  DRAWING_STYLES,
  IMAGE_TREATMENTS,
  LABEL_CASES,
  PALETTE_ROLES,
  RADII,
  RULE_STYLES,
  TYPE_SCALES,
  checkPaletteContrast,
  fontPairLabel,
  formatContrast,
  nearestFontWeight,
  normalizeHex,
  paletteRoleLabel,
  repairPaletteContrast,
  type DocFontId,
  type DocOp,
  type DocTemplate,
  type PaletteRole,
} from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useLocale, useT } from '../../../lib/i18n'
import { Button, InspectorSection, Notice, SegmentedControl, Select } from '../../../ui'
import { fontFamilyCss } from '../fonts'
import es from '../i18n/es'

export interface ThemePanelProps {
  template: DocTemplate
  readOnly: boolean
  brandAccent?: string
  onOps: (ops: DocOp[], mergeKey?: string) => void
}

export function ThemePanel({ template, readOnly, brandAccent, onOps }: ThemePanelProps) {
  const t = useT(es)
  const fmt = useFormat()
  const { locale } = useLocale()
  const theme = template.theme
  const checks = checkPaletteContrast(theme.palette).filter((c) => c.severity === 'error')
  const failing = checks.filter((c) => !c.ok)
  const brand = normalizeHex(brandAccent)
  const pair = DOC_FONT_PAIRS.find((p) => p.heading === theme.fonts.heading && p.body === theme.fonts.body && p.mono === theme.fonts.mono)

  const fixContrast = () => {
    const { palette } = repairPaletteContrast(theme.palette, { locked: ['paper', 'accent'] })
    onOps([{ op: 'setTheme', patch: { palette } }])
  }

  return (
    <div>
      <InspectorSection
        title={t('theme.palette')}
        actions={
          brand && brand !== theme.palette.accent.toUpperCase() && !readOnly ? (
            <Button size="xs" variant="ghost" icon={Palette} onClick={() => onOps([{ op: 'setColor', role: 'accent', value: brand }])}>
              {t('theme.brandAccent')}
            </Button>
          ) : null
        }
      >
        <p className="mb-3 text-table text-fg-muted">{t('theme.paletteHint')}</p>
        <div className="grid grid-cols-1 gap-1.5">
          {PALETTE_ROLES.map((role) => (
            <ColorRow key={role} role={role} value={theme.palette[role]} label={paletteRoleLabel(role, locale)} readOnly={readOnly} onChange={(value) => onOps([{ op: 'setColor', role, value }], `color:${role}`)} />
          ))}
        </div>
        <div className="mt-3">
          {failing.length ? (
            <Notice
              tone="warning"
              size="compact"
              icon={TriangleAlert}
              title={t('theme.contrastIssues', { count: failing.length })}
              action={
                !readOnly ? (
                  <Button size="xs" variant="secondary" icon={Contrast} onClick={fixContrast}>
                    {t('theme.fixContrast')}
                  </Button>
                ) : null
              }
            >
              <ul className="mt-1 space-y-0.5">
                {failing.map((c) => (
                  <li key={`${c.fg}-${c.bg}`} className="num">
                    {t('theme.contrastPair', {
                      fg: paletteRoleLabel(c.fg, locale),
                      bg: paletteRoleLabel(c.bg, locale),
                      ratio: fmt.number(formatContrast(c.ratio), { maxDecimals: 1 }),
                      min: fmt.number(c.min, { maxDecimals: 1 }),
                    })}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : (
            <p className="flex items-center gap-1.5 text-table text-success">
              <Check aria-hidden className="size-4" strokeWidth={2} />
              {t('theme.contrastOk')}
            </p>
          )}
        </div>
      </InspectorSection>

      <InspectorSection title={t('theme.fonts')}>
        <p className="mb-3 text-table text-fg-muted">{t('theme.fontsHint')}</p>
        <div role="radiogroup" aria-label={t('theme.fonts')} className="grid grid-cols-2 gap-2">
          {DOC_FONT_PAIRS.map((p) => {
            const active = pair?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readOnly}
                onClick={() => onOps([{ op: 'setFontPair', pairId: p.id }])}
                className={cn(
                  'flex min-h-[76px] flex-col items-start justify-between gap-1 rounded-sm border px-2.5 py-2 text-left transition-colors duration-100 disabled:cursor-not-allowed',
                  active ? 'border-accent bg-accent-subtle shadow-[inset_0_0_0_1px_var(--dk-accent)]' : 'border-divider hover:border-divider-strong hover:bg-hover',
                )}
              >
                <span className="text-h3 leading-none text-fg-strong" style={{ fontFamily: fontFamilyCss(p.heading as DocFontId), fontWeight: nearestFontWeight(p.heading as DocFontId, 600) }}>
                  Aa
                  <span className="ml-1 text-table" style={{ fontFamily: fontFamilyCss(p.mono as DocFontId) }}>
                    1.234
                  </span>
                </span>
                <span className="line-clamp-2 text-meta text-fg-muted" style={{ fontFamily: fontFamilyCss(p.body as DocFontId) }}>
                  {fontPairLabel(p)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-3">
          <ThemeSelect
            label={t('theme.headingWeight')}
            value={String(theme.headingWeight)}
            options={DOC_HEADING_WEIGHTS.filter((w) => nearestFontWeight(theme.fonts.heading as DocFontId, w) === w).map((w) => ({ value: String(w), label: fmt.number(w) }))}
            readOnly={readOnly}
            onChange={(v) => onOps([{ op: 'setTheme', patch: { headingWeight: Number(v) as DocTemplate['theme']['headingWeight'] } }])}
          />
        </div>
      </InspectorSection>

      <InspectorSection title={t('inspector.drawing')}>
        <Segment
          label={t('theme.drawingStyle')}
          value={theme.drawingStyle}
          values={DRAWING_STYLES}
          labelOf={(v) => t(`theme.values.drawingStyle.${v}`)}
          readOnly={readOnly}
          onChange={(style) => onOps([{ op: 'setDrawingStyle', style }])}
        />
      </InspectorSection>

      <InspectorSection title={t('theme.density')} collapsible defaultOpen>
        <div className="flex flex-col gap-3">
          <Segment label={t('theme.density')} value={theme.density} values={DENSITIES} labelOf={(v) => t(`theme.values.density.${v}`)} readOnly={readOnly} onChange={(density) => onOps([{ op: 'setTheme', patch: { density } }])} />
          <Segment label={t('theme.typeScale')} value={theme.typeScale} values={TYPE_SCALES} labelOf={(v) => t(`theme.values.typeScale.${v}`)} readOnly={readOnly} onChange={(typeScale) => onOps([{ op: 'setTheme', patch: { typeScale } }])} />
          <ThemeSelect label={t('theme.radius')} value={theme.radius} options={RADII.map((v) => ({ value: v, label: t(`theme.values.radius.${v}`) }))} readOnly={readOnly} onChange={(radius) => onOps([{ op: 'setTheme', patch: { radius: radius as DocTemplate['theme']['radius'] } }])} />
          <ThemeSelect label={t('theme.rules')} value={theme.rules} options={RULE_STYLES.map((v) => ({ value: v, label: t(`theme.values.rules.${v}`) }))} readOnly={readOnly} onChange={(rules) => onOps([{ op: 'setTheme', patch: { rules: rules as DocTemplate['theme']['rules'] } }])} />
          <ThemeSelect label={t('theme.accentUsage')} value={theme.accentUsage} options={ACCENT_USAGES.map((v) => ({ value: v, label: t(`theme.values.accentUsage.${v}`) }))} readOnly={readOnly} onChange={(accentUsage) => onOps([{ op: 'setTheme', patch: { accentUsage: accentUsage as DocTemplate['theme']['accentUsage'] } }])} />
          <ThemeSelect label={t('theme.imageTreatment')} value={theme.imageTreatment} options={IMAGE_TREATMENTS.map((v) => ({ value: v, label: t(`theme.values.imageTreatment.${v}`) }))} readOnly={readOnly} onChange={(imageTreatment) => onOps([{ op: 'setTheme', patch: { imageTreatment: imageTreatment as DocTemplate['theme']['imageTreatment'] } }])} />
          <Segment label={t('theme.labelCase')} value={theme.labelCase} values={LABEL_CASES} labelOf={(v) => t(`theme.values.labelCase.${v}`)} readOnly={readOnly} onChange={(labelCase) => onOps([{ op: 'setTheme', patch: { labelCase } }])} />
        </div>
      </InspectorSection>
    </div>
  )
}

function ColorRow({ role, value, label, readOnly, onChange }: { role: PaletteRole; value: string; label: string; readOnly: boolean; onChange: (hex: string) => void }) {
  const t = useT(es)
  const id = useId()
  const [draft, setDraft] = useState(value.toUpperCase())
  useEffect(() => setDraft(value.toUpperCase()), [value])
  const commit = (raw: string) => {
    const hex = normalizeHex(raw.startsWith('#') ? raw : `#${raw}`)
    if (hex && hex !== value.toUpperCase()) onChange(hex)
    else setDraft(value.toUpperCase())
  }
  return (
    <div className="flex h-9 items-center gap-2.5">
      <label className={cn('relative size-7 shrink-0 overflow-hidden rounded-xs border border-divider-strong shadow-xs', !readOnly && 'cursor-pointer')} style={{ background: value }}>
        <span className="sr-only">{t('theme.pick', { role: label })}</span>
        <input
          type="color"
          value={value.toLowerCase()}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          data-role={role}
        />
      </label>
      <label htmlFor={id} className="min-w-0 flex-1 truncate text-table text-fg">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        disabled={readOnly}
        spellCheck={false}
        aria-label={t('theme.hex', { role: label })}
        maxLength={7}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
          if (e.key === 'Escape') setDraft(value.toUpperCase())
        }}
        className="code-id h-8 w-[88px] rounded-sm border border-control bg-surface px-2 text-table text-fg outline-none focus:border-accent focus:ring-[3px] focus:ring-[var(--dk-focus-ring)] disabled:bg-sunken disabled:text-fg-muted"
      />
    </div>
  )
}

function Segment<V extends string>({ label, value, values, labelOf, readOnly, onChange }: { label: string; value: V; values: readonly V[]; labelOf: (v: V) => string; readOnly: boolean; onChange: (v: V) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-table text-fg-muted">{label}</span>
      <SegmentedControl<V> aria-label={label} size="sm" block value={value} onValueChange={(v) => !readOnly && onChange(v)} options={values.map((v) => ({ value: v, label: labelOf(v), disabled: readOnly }))} />
    </div>
  )
}

function ThemeSelect({ label, value, options, readOnly, onChange }: { label: string; value: string; options: { value: string; label: string }[]; readOnly: boolean; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-table text-fg-muted">
        {label}
      </label>
      <Select id={id} size="sm" className="w-40" value={value} onValueChange={onChange} options={options} disabled={readOnly} />
    </div>
  )
}
