/**
 * Marcas en los documentos: decisiones del taller para todas sus cotizaciones, también con un estilo
 * DEKOPEN sin duplicar. Los logos son imágenes que sube cada taller (el repositorio no trae ninguno) y
 * una marca sin logo no se escribe en texto: se omite y aquí se avisa.
 */
import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { BRAND_PLACEMENTS, BRAND_SIZES, LINE_DETAILS, resolveDocSettings, type DocSettings, type DocumentPrefs } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useCatalog, useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useT } from '../../../lib/i18n'
import { IconButton, Input, InspectorSection, Notice, SegmentedControl, Switch, toast } from '../../../ui'
import es from '../i18n/es'
import { ImageField } from './ImageField'

type DocumentsPatch = { settings?: Record<string, unknown>; brandLogos?: Record<string, string | null>; hardwareLogos?: DocumentPrefs['hardwareLogos'] }

export function BrandsPanel({ readOnly }: { readOnly: boolean }) {
  const t = useT(es)
  const settings = useSettings()
  const catalog = useCatalog()
  const update = useUpdateSettings()
  const [hardwareName, setHardwareName] = useState('')
  const documents = settings.data?.documents
  const resolved = resolveDocSettings(documents?.settings)
  const logos = documents?.brandLogos ?? {}
  const hardware = documents?.hardwareLogos ?? []
  // Solo marcas de perfil: el catálogo trae también las de vidrio y las genéricas.
  const brands = useMemo(() => (catalog.data?.brands ?? []).filter((b) => (b.kind === 'profiles' || b.kind === 'mixed') && !/gen[eé]ric|ejemplo/i.test(b.name)), [catalog.data])
  const save = (patch: DocumentsPatch) => update.mutate({ documents: patch } as never, { onError: (error) => toast.error(humanError(error)) })
  const set = (patch: Partial<DocSettings>) => save({ settings: patch })
  const missing = brands.filter((b) => !logos[b.id])

  return (
    <div>
      <InspectorSection title={t('brands.show')}>
        <div className="flex flex-col gap-3">
          <p className="text-meta text-fg-muted">{t('brands.scope')}</p>
          <Switch size="sm" checked={resolved.brandProfile} disabled={readOnly} onCheckedChange={(brandProfile) => set({ brandProfile })} label={t('brands.profile')} />
          <Switch size="sm" checked={resolved.brandHardware} disabled={readOnly} onCheckedChange={(brandHardware) => set({ brandHardware })} label={t('brands.hardware')} />
          <div className="flex flex-col gap-1.5">
            <span className="text-table text-fg-muted">{t('brands.placement')}</span>
            <SegmentedControl aria-label={t('brands.placement')} size="sm" block value={resolved.brandPlacement} onValueChange={(brandPlacement) => !readOnly && set({ brandPlacement })} options={BRAND_PLACEMENTS.map((v) => ({ value: v, label: t(`brands.placements.${v}`), disabled: readOnly }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-table text-fg-muted">{t('brands.size')}</span>
            <SegmentedControl aria-label={t('brands.size')} size="sm" block value={resolved.brandSize} onValueChange={(brandSize) => !readOnly && set({ brandSize })} options={BRAND_SIZES.map((v) => ({ value: v, label: t(`doc.sizes.${v}`), disabled: readOnly }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-table text-fg-muted">{t('brands.lineDetail')}</span>
            <SegmentedControl aria-label={t('brands.lineDetail')} size="sm" block value={resolved.lineDetail} onValueChange={(lineDetail) => !readOnly && set({ lineDetail })} options={LINE_DETAILS.map((v) => ({ value: v, label: t(`brands.lineDetails.${v}`), disabled: readOnly }))} />
            <p className="text-meta text-fg-muted">{t(`brands.lineDetailHint.${resolved.lineDetail}`)}</p>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title={t('brands.profileLogos')}>
        <div className="flex flex-col gap-3">
          {resolved.brandProfile && missing.length ? (
            <Notice tone="warning" size="compact">
              {t('brands.missing', { list: missing.map((b) => b.name).join(', ') })}
            </Notice>
          ) : null}
          {brands.map((brand) => (
            <ImageField logo key={brand.id} label={brand.name} value={logos[brand.id] || undefined} readOnly={readOnly} onChange={(id) => save({ brandLogos: { [brand.id]: id } })} />
          ))}
          {brands.length === 0 ? <p className="text-meta text-fg-muted">{t('brands.noBrands')}</p> : null}
        </div>
      </InspectorSection>

      <InspectorSection title={t('brands.hardwareLogos')}>
        <div className="flex flex-col gap-3">
          {hardware.map((h) => (
            <div key={h.id} className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <ImageField logo label={h.name} value={h.assetId} readOnly={readOnly} onChange={(assetId) => assetId && save({ hardwareLogos: hardware.map((x) => (x.id === h.id ? { ...x, assetId } : x)) })} />
              </div>
              <IconButton icon={X} size="sm" label={t('brands.remove', { name: h.name })} disabled={readOnly} onClick={() => save({ hardwareLogos: hardware.filter((x) => x.id !== h.id) })} />
            </div>
          ))}
          {!readOnly && hardware.length < 6 ? (
            <AddHardware
              name={hardwareName}
              onName={setHardwareName}
              onPick={(assetId) => {
                save({ hardwareLogos: [...hardware, { id: `h${Date.now().toString(36)}`, name: hardwareName.trim(), assetId }] })
                setHardwareName('')
              }}
            />
          ) : null}
        </div>
      </InspectorSection>
      <p className="px-4 py-3 text-meta text-fg-muted">{t('brands.rights')}</p>
    </div>
  )
}

function AddHardware({ name, onName, onPick }: { name: string; onName: (v: string) => void; onPick: (assetId: string) => void }) {
  const t = useT(es)
  return (
    <div className="flex flex-col gap-2">
      <Input size="sm" value={name} maxLength={60} placeholder={t('brands.hardwareName')} aria-label={t('brands.hardwareName')} onChange={(e) => onName(e.target.value)} />
      {name.trim() ? (
        <ImageField logo label={t('brands.hardwareLogo')} onChange={(id) => id && onPick(id)} />
      ) : (
        <span className="inline-flex items-center gap-1 text-meta text-fg-muted">
          <Plus aria-hidden strokeWidth={2} className="size-3" />
          {t('brands.hardwareAdd')}
        </span>
      )}
    </div>
  )
}
