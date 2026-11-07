/** Configuración de página: papel, márgenes (presets o a medida), cabecera, pie y numeración. */
import { useId, type ReactNode } from 'react'
import {
  PAGE_FOOTERS,
  PAGE_HEADERS,
  PAGE_MARGIN_PRESETS,
  PAGE_MARGIN_RANGE_MM,
  PAGE_NUMBER_ALIGNS,
  PAGE_NUMBER_STYLES,
  PAGE_SIZES,
  docJsonEqual,
  type DocOp,
  type DocTemplate,
} from '@dekopen/shared'
import { useT } from '../../../lib/i18n'
import { InspectorSection, NumberField, SegmentedControl, Select, Switch } from '../../../ui'
import es from '../i18n/es'

type MarginPreset = keyof typeof PAGE_MARGIN_PRESETS | 'custom'

export function PagePanel({ template, readOnly, onOps }: { template: DocTemplate; readOnly: boolean; onOps: (ops: DocOp[], mergeKey?: string) => void }) {
  const t = useT(es)
  const page = template.page
  const preset: MarginPreset = (Object.keys(PAGE_MARGIN_PRESETS) as (keyof typeof PAGE_MARGIN_PRESETS)[]).find((k) => docJsonEqual(PAGE_MARGIN_PRESETS[k], page.margins)) ?? 'custom'
  const ids = { header: useId(), footer: useId(), numbers: useId() }
  const set = (patch: Record<string, unknown>, mergeKey?: string) => onOps([{ op: 'setPage', patch } as DocOp], mergeKey)

  return (
    <div>
      <InspectorSection title={t('pageSetup.size')}>
        <SegmentedControl
          aria-label={t('pageSetup.size')}
          block
          size="sm"
          value={page.size}
          onValueChange={(size) => !readOnly && set({ size })}
          options={PAGE_SIZES.map((s) => ({ value: s, label: t(`pageSetup.sizes.${s}`), disabled: readOnly }))}
        />
      </InspectorSection>
      <InspectorSection title={t('pageSetup.margins')}>
        <SegmentedControl<MarginPreset>
          aria-label={t('pageSetup.margins')}
          block
          size="sm"
          value={preset}
          onValueChange={(v) => !readOnly && v !== 'custom' && set({ margins: PAGE_MARGIN_PRESETS[v] })}
          options={(['narrow', 'normal', 'wide', 'custom'] as const).map((v) => ({ value: v, label: t(`pageSetup.marginPresets.${v}`), disabled: readOnly || v === 'custom' }))}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side} className="flex flex-col gap-1">
              <span className="text-meta text-fg-muted">{t(`pageSetup.marginSide.${side}`)}</span>
              <NumberField
                value={page.margins[side]}
                onChange={(v) => {
                  if (v === null || v === undefined) return
                  const mm = Math.min(PAGE_MARGIN_RANGE_MM.max, Math.max(PAGE_MARGIN_RANGE_MM.min, Math.round(v)))
                  set({ margins: { [side]: mm } }, `margin:${side}`)
                }}
                unit="mm"
                min={PAGE_MARGIN_RANGE_MM.min}
                max={PAGE_MARGIN_RANGE_MM.max}
                step={1}
                bigStep={5}
                decimals={0}
                disabled={readOnly}
              />
            </label>
          ))}
        </div>
      </InspectorSection>
      <InspectorSection title={t('pageSetup.header')}>
        <div className="flex flex-col gap-3">
          <Row id={ids.header} label={t('pageSetup.header')}>
            <Select id={ids.header} size="sm" className="w-44" value={page.header} disabled={readOnly} onValueChange={(header) => set({ header })} options={PAGE_HEADERS.map((v) => ({ value: v, label: t(`pageSetup.headers.${v}`) }))} />
          </Row>
          <Row id={ids.footer} label={t('pageSetup.footer')}>
            <Select id={ids.footer} size="sm" className="w-44" value={page.footer} disabled={readOnly} onValueChange={(footer) => set({ footer })} options={PAGE_FOOTERS.map((v) => ({ value: v, label: t(`pageSetup.footers.${v}`) }))} />
          </Row>
          <Row id={ids.numbers} label={t('pageSetup.pageNumbers')}>
            <Select id={ids.numbers} size="sm" className="w-44" value={page.pageNumbers} disabled={readOnly} onValueChange={(pageNumbers) => set({ pageNumbers })} options={PAGE_NUMBER_STYLES.map((v) => ({ value: v, label: t(`pageSetup.pageNumberStyles.${v}`) }))} />
          </Row>
          {page.pageNumbers !== 'none' ? (
            <SegmentedControl
              aria-label={t('pageSetup.align')}
              block
              size="sm"
              value={page.pageNumberAlign}
              onValueChange={(pageNumberAlign) => !readOnly && set({ pageNumberAlign })}
              options={PAGE_NUMBER_ALIGNS.map((v) => ({ value: v, label: t(`pageSetup.aligns.${v}`), disabled: readOnly }))}
            />
          ) : null}
          <Switch size="sm" checked={page.chromeOnCover} disabled={readOnly} onCheckedChange={(chromeOnCover) => set({ chromeOnCover })} label={t('pageSetup.chromeOnCover')} />
        </div>
      </InspectorSection>
    </div>
  )
}

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-table text-fg-muted">
        {label}
      </label>
      {children}
    </div>
  )
}
