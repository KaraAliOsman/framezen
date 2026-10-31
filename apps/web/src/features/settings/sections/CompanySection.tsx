import { useDeferredValue, useMemo, useState } from 'react'
import { DEFAULT_PRICING } from '@framezen/engine'
import type { Org } from '@framezen/shared'
import { useSession } from '../../../lib/auth'
import { useCatalog, useSettings } from '../../../lib/hooks'
import { Field, Input } from '../../../ui'
import { formatRut, rutHint } from '../../clients/rut'
import { AccentField } from '../components/AccentField'
import { DocPreview } from '../components/DocPreview'
import { LogoField } from '../components/LogoField'
import { FieldGroup, SectionHeader } from '../components/SectionHeader'
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

function emailHint(value: string): string | null {
  const v = value.trim()
  if (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null
  return 'Este correo parece incompleto. Lo guardamos igual; revísalo para que tus clientes puedan responderte.'
}

/** Empresa: datos que salen en tus documentos, logo y color de marca. */
export function CompanySection() {
  const me = useSession()
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
      }),
    [deferred, me.org.name, settings.data, catalog.data],
  )

  const rutWarning = rutHint(draft.rut)

  return (
    <div>
      <SectionHeader
        title="Empresa"
        description="Así te presentas en cada cotización y documento. Todo se guarda solo."
        status={autosave.status}
        savedAt={autosave.savedAt}
      />
      {autosave.error ? (
        <p role="alert" className="mb-5 rounded-md border border-bad-600/20 bg-bad-50 px-3 py-2 text-[13px] text-bad-800">
          {autosave.error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-9">
          <FieldGroup title="Identidad" description="El nombre de fantasía va grande; la razón social y el RUT, en letra chica.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nombre de fantasía"
                className="sm:col-span-2"
                hint={!draft.name.trim() ? 'Tu empresa necesita un nombre: mientras tanto usamos el anterior.' : undefined}
              >
                <Input value={draft.name} onChange={(e) => set('name', e.target.value)} onBlur={() => void autosave.flush()} autoComplete="organization" />
              </Field>
              <Field label="Razón social" optional>
                <Input value={draft.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="Ventanas del Sur SpA" />
              </Field>
              <Field label="RUT de la empresa" optional>
                <Input
                  value={draft.rut}
                  onChange={(e) => set('rut', e.target.value)}
                  onBlur={() => {
                    const formatted = formatRut(draft.rut)
                    if (formatted !== draft.rut) setDraft((d) => ({ ...d, rut: formatted }))
                    void autosave.flush()
                  }}
                  placeholder="76.123.456-7"
                  inputMode="text"
                  aria-invalid={undefined}
                />
              </Field>
              {rutWarning ? (
                <p role="status" className="-mt-2 text-[13px] leading-[18px] text-warn-800 sm:col-span-2">
                  {rutWarning}
                </p>
              ) : null}
            </div>
          </FieldGroup>

          <FieldGroup title="Contacto" description="Tus clientes te escriben y te llaman con estos datos.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dirección" optional className="sm:col-span-2">
                <Input value={draft.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" placeholder="Av. Los Carrera 1450" />
              </Field>
              <Field label="Ciudad" optional>
                <Input value={draft.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" placeholder="Concepción" />
              </Field>
              <Field label="Teléfono" optional>
                <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" />
              </Field>
              <Field label="Correo" optional hint={emailHint(draft.email) ?? undefined}>
                <Input value={draft.email} onChange={(e) => set('email', e.target.value)} type="email" autoComplete="email" placeholder="ventas@tutaller.cl" />
              </Field>
              <Field label="Sitio web" optional>
                <Input value={draft.website} onChange={(e) => set('website', e.target.value)} type="url" autoComplete="url" placeholder="tutaller.cl" />
              </Field>
            </div>
          </FieldGroup>

          <FieldGroup title="Marca" description="Tu logo y tu color en el encabezado, los títulos y la caja de totales.">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-paper-900">Logo</span>
                <LogoField value={draft.logo} onChange={(logo) => set('logo', logo)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-paper-900">Color de marca</span>
                <AccentField value={draft.accent} onChange={(accent) => set('accent', accent)} />
              </div>
            </div>
          </FieldGroup>
        </div>

        <aside className="min-w-0">
          <div className="xl:sticky xl:top-6">
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-paper-900">Así la ve tu cliente</p>
              <p className="text-meta text-paper-600">Vista previa en vivo</p>
            </div>
            <DocPreview data={preview.data} template={settings.data?.documents?.quoteTemplate} className="mx-auto max-w-[420px] xl:max-w-none" />
            <p className="mt-2.5 text-meta text-paper-600">
              Cotización de ejemplo con tus datos{preview.sample ? ' y precios de ejemplo' : ' y tus precios'}. El diseño se cambia en Documentos.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
