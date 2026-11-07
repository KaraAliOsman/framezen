import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { DEFAULT_PRICING } from '@dekopen/engine'
import type { Org } from '@dekopen/shared'
import { useSession } from '../../../lib/auth'
import { useCatalog, useSettings } from '../../../lib/hooks'
import { useLocale, useT } from '../../../lib/i18n'
import { Field, Input } from '../../../ui'
import { formatRut, rutHint } from '../../clients/rut'
import { AccentField } from '../components/AccentField'
import { DocPreview } from '../components/DocPreview'
import { LogoField } from '../components/LogoField'
import { FieldGroup, SaveError, SectionHeader, WithPreview } from '../components/SectionHeader'
import es from '../i18n/es'
import { useSaveOrg, type OrgPatch } from '../lib/accountApi'
import { buildPreviewDoc, DEFAULT_PREFS } from '../lib/previewDoc'
import { useAutosave } from '../lib/useAutosave'

type OrgDraft = Required<Pick<Org, 'name' | 'legalName' | 'rut' | 'address' | 'city' | 'phone' | 'email' | 'website'>> & {
  logo: string | null
  accent: string | null
}

function fromOrg(org: Org): OrgDraft {
  return {
    name: org.name ?? '',
    legalName: org.legalName ?? '',
    rut: org.rut ?? '',
    address: org.address ?? '',
    city: org.city ?? '',
    phone: org.phone ?? '',
    email: org.email ?? '',
    website: org.website ?? '',
    logo: org.logo ?? null,
    accent: org.accent ?? null,
  }
}

export function looksLikeEmail(value: string): boolean {
  const v = value.trim()
  return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/** Empresa: datos que salen en tus documentos, logo y color de marca. */
export function CompanySection() {
  const me = useSession()
  const t = useT(es)
  const { locale } = useLocale()
  const settings = useSettings()
  const catalog = useCatalog()
  const saveOrg = useSaveOrg()
  const autosave = useAutosave<OrgPatch>(saveOrg, { key: 'org' })
  // Si saliste con un cambio sin guardar (sin conexión), lo sigues viendo al volver.
  const [draft, setDraft] = useState<OrgDraft>(() => fromOrg({ ...me.org, ...autosave.unsaved() } as Org))
  const deferred = useDeferredValue(draft)

  const set = <K extends keyof OrgDraft>(key: K, value: OrgDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    // El nombre no puede quedar vacío: mientras lo reescribes, conservamos el anterior.
    if (key === 'name' && !String(value ?? '').trim()) return
    autosave.queue({ [key]: value } as OrgPatch)
  }

  const preview = useMemo(
    () =>
      buildPreviewDoc({
        org: {
          name: deferred.name || me.org.name,
          legalName: deferred.legalName || undefined,
          rut: deferred.rut || undefined,
          address: deferred.address || undefined,
          city: deferred.city || undefined,
          phone: deferred.phone || undefined,
          email: deferred.email || undefined,
          website: deferred.website || undefined,
          logo: deferred.logo ?? undefined,
          accent: deferred.accent ?? undefined,
        },
        pricing: settings.data?.pricing ?? DEFAULT_PRICING,
        prefs: settings.data?.documents ?? DEFAULT_PREFS,
        catalog: catalog.data,
        defaults: settings.data?.defaults,
        cut: settings.data?.cut,
        number: settings.data?.nextQuoteNumber,
        items: 2,
        locale: settings.data?.locale ?? me.org.locale ?? locale,
      }),
    [deferred, me.org.name, me.org.locale, settings.data, catalog.data, locale],
  )

  const rutWarning = rutHint(draft.rut)

  return (
    <div>
      <SectionHeader title={t('company.title')} description={t('company.description')} status={autosave.status} savedAt={autosave.savedAt} />
      <SaveError message={autosave.error} />
      <WithPreview
        label={t('company.preview.title')}
        preview={
          <>
            <div className="rounded-panel bg-sunken p-4">
              <DocPreview data={preview.data} template={settings.data?.documents?.quoteTemplate} className="mx-auto max-w-80" />
            </div>
            <p className="mt-2.5 text-meta text-fg-muted">
              {t.rich(preview.sample ? 'company.preview.noteSample' : 'company.preview.noteOwn', {
                link: <Link to="/ajustes/plantillas" className="font-medium text-accent-ink hover:underline" />,
              })}
            </p>
          </>
        }
      >
          <FieldGroup title={t('company.identity.title')} description={t('company.identity.description')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('company.fields.name')} className="sm:col-span-2" hint={!draft.name.trim() ? t('company.fields.nameEmpty') : undefined}>
                <Input value={draft.name} onChange={(e) => set('name', e.target.value)} onBlur={() => void autosave.flush()} autoComplete="organization" />
              </Field>
              <Field label={t('company.fields.legalName')} optional>
                <Input value={draft.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder={t('company.fields.legalNamePlaceholder')} />
              </Field>
              <Field label={t('company.fields.rut')} optional>
                <Input
                  value={draft.rut}
                  onChange={(e) => set('rut', e.target.value)}
                  onBlur={() => {
                    const formatted = formatRut(draft.rut)
                    if (formatted !== draft.rut) setDraft((d) => ({ ...d, rut: formatted }))
                    void autosave.flush()
                  }}
                  placeholder={t('company.fields.rutPlaceholder')}
                  inputMode="text"
                />
              </Field>
              {rutWarning ? (
                <p role="status" className="-mt-2 text-table text-warning sm:col-span-2">
                  {rutWarning}
                </p>
              ) : null}
            </div>
          </FieldGroup>

          <FieldGroup title={t('company.contact.title')} description={t('company.contact.description')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('company.fields.address')} optional className="sm:col-span-2">
                <Input value={draft.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" placeholder={t('company.fields.addressPlaceholder')} />
              </Field>
              <Field label={t('company.fields.city')} optional>
                <Input value={draft.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" placeholder={t('company.fields.cityPlaceholder')} />
              </Field>
              <Field label={t('company.fields.phone')} optional>
                <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} type="tel" autoComplete="tel" placeholder={t('company.fields.phonePlaceholder')} />
              </Field>
              <Field label={t('company.fields.email')} optional hint={looksLikeEmail(draft.email) ? undefined : t('company.fields.emailHint')}>
                <Input value={draft.email} onChange={(e) => set('email', e.target.value)} type="email" autoComplete="email" placeholder={t('company.fields.emailPlaceholder')} />
              </Field>
              <Field label={t('company.fields.website')} optional>
                <Input value={draft.website} onChange={(e) => set('website', e.target.value)} type="url" autoComplete="url" placeholder={t('company.fields.websitePlaceholder')} />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title={t('company.brand.title')} description={t('company.brand.description')}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-table font-medium text-fg">{t('company.brand.logo')}</span>
                <LogoField value={draft.logo} onChange={(logo) => set('logo', logo)} />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-table font-medium text-fg">{t('company.brand.accent')}</span>
                <AccentField value={draft.accent} onChange={(accent) => set('accent', accent)} />
              </div>
            </div>
          </FieldGroup>
      </WithPreview>
    </div>
  )
}
