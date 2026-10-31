/**
 * Puesta a punto opcional (SPEC §4): 3 pasos saltables — marcas, empresa y logo, precios base —
 * con una cotización de muestra que se va armando con tus datos. «Saltar» siempre visible; cada
 * cambio se guarda solo; al terminar vas directo a tu primera cotización.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, FilePlus2 } from 'lucide-react'
import { DEFAULT_PRICING, formatCLP, sanitizePricing, type PricingSettings } from '@framezen/engine'
import { humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { firstName } from '../../lib/format'
import { useCatalog, useCreateQuote, useSettings, useUpdateSettings } from '../../lib/hooks'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { FramezenLogo } from '../../ui/FramezenLogo'
import { Input } from '../../ui/Input'
import { MoneyField } from '../../ui/MoneyField'
import { NumberField } from '../../ui/NumberField'
import { SaveIndicator } from '../../ui/SaveIndicator'
import { Slider } from '../../ui/Slider'
import { toast } from '../../ui/Toaster'
import { formatRut, rutHint } from '../clients/rut'
import { AccentField } from '../settings/components/AccentField'
import { DocPreview } from '../settings/components/DocPreview'
import { LogoField } from '../settings/components/LogoField'
import { useSaveOrg, type OrgPatch } from '../settings/lib/accountApi'
import { buildPreviewDoc, DEFAULT_PREFS } from '../settings/lib/previewDoc'
import { priceExample, PRICING_EXAMPLE } from '../settings/lib/pricingExample'
import { combineStatus, useAutosave } from '../settings/lib/useAutosave'
import { BrandPicker } from './BrandPicker'

const STEPS = [
  { id: 'marcas', label: 'Tus marcas', title: '¿Con qué marcas trabajas?', text: 'Activa las que usas: sus líneas, perfiles y precios quedan listos para cotizar. Las demás siguen en el catálogo por si las necesitas.' },
  { id: 'empresa', label: 'Tu empresa', title: 'Tu empresa y tu logo', text: 'Así te presentas en cada cotización. Mira cómo cambia a la derecha.' },
  { id: 'precios', label: 'Tus precios', title: 'Tus precios base', text: 'Con tu margen y tu mano de obra, el precio de cada ventana sale solo. Lo afinas cuando quieras en Ajustes.' },
] as const

interface CompanyDraft {
  name: string
  rut: string
  phone: string
  city: string
  logo: string | null
  accent: string | null
}

export default function WelcomePage() {
  usePageTitle('Bienvenida')
  const me = useSession()
  const navigate = useNavigate()
  const settings = useSettings()
  const catalog = useCatalog()
  const updateSettings = useUpdateSettings()
  const saveOrg = useSaveOrg()
  const createQuote = useCreateQuote()
  // Mismas colas que Ajustes › Empresa y Precios: un cambio sin guardar sigue vivo entre pantallas.
  const orgSave = useAutosave<OrgPatch>(saveOrg, { key: 'org' })
  const pricingSave = useAutosave<{ pricing: PricingSettings }>((patch) => updateSettings.mutateAsync(patch), { key: 'settings:pricing' })
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [leaving, setLeaving] = useState(false)
  const [company, setCompany] = useState<CompanyDraft>(() => {
    const org = { ...me.org, ...orgSave.unsaved() }
    return {
      name: org.name ?? '',
      rut: org.rut ?? '',
      phone: org.phone ?? '',
      city: org.city ?? '',
      logo: org.logo ?? null,
      accent: org.accent ?? null,
    }
  })
  const [pricing, setPricing] = useState<PricingSettings | null>(null)
  const latestPricing = useRef<PricingSettings | null>(null)

  useEffect(() => {
    if (settings.data && !latestPricing.current) {
      latestPricing.current = sanitizePricing(pricingSave.unsaved()?.pricing ?? settings.data.pricing)
      setPricing(latestPricing.current)
    }
  }, [settings.data, pricingSave.unsaved])

  const setField = <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => {
    setCompany((c) => ({ ...c, [key]: value }))
    if (key === 'name' && !String(value ?? '').trim()) return
    orgSave.queue({ [key]: value } as OrgPatch)
  }

  const changePricing = (patch: Partial<PricingSettings>) => {
    const next = { ...(latestPricing.current ?? DEFAULT_PRICING), ...patch }
    latestPricing.current = next
    setPricing(next)
    pricingSave.queue({ pricing: next })
  }

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1)
    setStep(Math.max(0, Math.min(STEPS.length - 1, to)))
    void orgSave.flush()
    void pricingSave.flush()
  }

  /** Termina (o salta) la puesta a punto: nunca bloquea aunque algo falle. */
  const leave = async (createFirst: boolean) => {
    setLeaving(true)
    await Promise.allSettled([orgSave.flush(), pricingSave.flush()])
    await saveOrg({ onboarded: true }).catch(() => undefined)
    if (!createFirst) {
      navigate('/inicio', { replace: true })
      return
    }
    createQuote.mutate(
      {},
      {
        onSuccess: (quote) => navigate(`/cotizaciones/${quote.id}`, { replace: true }),
        onError: (error) => {
          toast.error(humanError(error))
          navigate('/inicio', { replace: true })
        },
      },
    )
  }

  const deferredCompany = useDeferredValue(company)
  const deferredPricing = useDeferredValue(pricing ?? settings.data?.pricing ?? DEFAULT_PRICING)
  const preview = useMemo(
    () =>
      buildPreviewDoc({
        org: {
          name: deferredCompany.name || me.org.name,
          rut: deferredCompany.rut || undefined,
          phone: deferredCompany.phone || undefined,
          city: deferredCompany.city || undefined,
          email: me.org.email,
          logo: deferredCompany.logo ?? undefined,
          accent: deferredCompany.accent ?? undefined,
        },
        pricing: deferredPricing,
        prefs: settings.data?.documents ?? DEFAULT_PREFS,
        catalog: catalog.data,
        defaults: settings.data?.defaults,
        number: settings.data?.nextQuoteNumber,
        items: 2,
      }),
    [deferredCompany, deferredPricing, me.org.name, me.org.email, settings.data, catalog.data],
  )
  const example = useMemo(
    () => priceExample(catalog.data, deferredPricing, PRICING_EXAMPLE, { defaults: settings.data?.defaults }),
    [catalog.data, deferredPricing, settings.data?.defaults],
  )

  const current = STEPS[step]
  const last = step === STEPS.length - 1
  const status = combineStatus(orgSave.status, pricingSave.status)

  return (
    <div className="flex min-h-dvh flex-col bg-paper-50">
      <header className="sticky top-0 z-20 border-b border-paper-200 bg-paper-50">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <FramezenLogo size="sm" />
          <ol className="hidden items-center gap-1 md:flex" aria-label="Pasos">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden className="h-px w-6 bg-paper-200" /> : null}
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors duration-120',
                    i === step ? 'bg-paper-0 text-paper-900 shadow-[inset_0_0_0_1px_var(--paper-200)]' : 'text-paper-600 hover:text-paper-900',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-5 items-center justify-center rounded-full text-[11px] tabular',
                      i < step ? 'bg-ink-600 text-paper-0' : i === step ? 'bg-paper-900 text-paper-0' : 'border border-paper-350 text-paper-600',
                    )}
                  >
                    {i < step ? <Check aria-hidden strokeWidth={2.5} className="size-3" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <SaveIndicator status={status} className="max-sm:hidden" />
            <button
              type="button"
              onClick={() => void leave(false)}
              disabled={leaving}
              className="inline-flex h-8 items-center rounded-sm px-2.5 text-[13px] font-medium text-paper-600 transition-colors duration-120 hover:bg-paper-100 hover:text-paper-900"
            >
              Saltar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid grid-cols-1 w-full max-w-[1280px] flex-1 gap-10 px-4 pt-8 pb-28 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-14 lg:pb-16">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-paper-600 md:hidden">
            Paso {step + 1} de {STEPS.length} · {current.label}
          </p>
          {step === 0 ? (
            <p className="mb-1 text-[13px] font-medium text-ink-600 max-md:mt-3">Hola, {firstName(me.user.name)}. Dejemos tu taller a punto: son 3 pasos opcionales.</p>
          ) : null}
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={current.id}
              custom={direction}
              initial={{ opacity: 0, x: direction * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -16 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            >
              <h1 className="text-h2 font-semibold tracking-[-0.015em] text-balance text-paper-900 sm:text-h1">{current.title}</h1>
              <p className="mt-2 max-w-xl text-paper-600">{current.text}</p>
              <div className="mt-8">
                {step === 0 ? <BrandPicker /> : null}
                {step === 1 ? <CompanyStep company={company} setField={setField} flush={() => void orgSave.flush()} /> : null}
                {step === 2 ? (
                  <PricingStep
                    pricing={pricing ?? settings.data?.pricing ?? DEFAULT_PRICING}
                    onChange={changePricing}
                    examplePrice={example.price.unitNet}
                    exampleName={example.name}
                    sample={example.sample}
                  />
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-paper-200 bg-paper-50 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-6 lg:static lg:mt-10 lg:border-t lg:bg-transparent lg:px-0 lg:pt-6 lg:pb-0">
            <div>
              {step > 0 ? (
                <Button variant="ghost" icon={ArrowLeft} onClick={() => go(step - 1)}>
                  Atrás
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {!last ? (
                <Button variant="ghost" onClick={() => go(step + 1)} className="max-sm:hidden">
                  Omitir este paso
                </Button>
              ) : null}
              {last ? (
                <Button variant="primary" size="lg" icon={FilePlus2} onClick={() => void leave(true)} loading={leaving}>
                  Crear mi primera cotización
                </Button>
              ) : (
                <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => go(step + 1)}>
                  Siguiente
                </Button>
              )}
            </div>
          </div>
        </div>

        <aside className="min-w-0" aria-label="Vista previa">
          <div className="lg:sticky lg:top-24">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="text-[13px] font-medium text-paper-900">Tu cotización, así va quedando</p>
              <p className="text-meta text-paper-600">{preview.sample ? 'Precios de ejemplo' : 'Con tus precios'}</p>
            </div>
            <DocPreview data={preview.data} template={settings.data?.documents?.quoteTemplate} crop={0.72} />
          </div>
        </aside>
      </main>
    </div>
  )
}

function CompanyStep({
  company,
  setField,
  flush,
}: {
  company: CompanyDraft
  setField: <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => void
  flush: () => void
}) {
  const hint = rutHint(company.rut)
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de tu taller" className="sm:col-span-2" hint={!company.name.trim() ? 'Escribe un nombre: mientras tanto usamos el anterior.' : undefined}>
          <Input value={company.name} onChange={(e) => setField('name', e.target.value)} onBlur={flush} size="lg" autoComplete="organization" />
        </Field>
        <Field label="RUT" optional hint={hint ? <span className="text-warn-800">{hint}</span> : undefined}>
          <Input
            value={company.rut}
            onChange={(e) => setField('rut', e.target.value)}
            onBlur={() => {
              const formatted = formatRut(company.rut)
              if (formatted !== company.rut) setField('rut', formatted)
              flush()
            }}
            placeholder="76.123.456-7"
          />
        </Field>
        <Field label="Teléfono" optional>
          <Input value={company.phone} onChange={(e) => setField('phone', e.target.value)} onBlur={flush} type="tel" placeholder="+56 9 1234 5678" autoComplete="tel" />
        </Field>
        <Field label="Ciudad" optional>
          <Input value={company.city} onChange={(e) => setField('city', e.target.value)} onBlur={flush} placeholder="Concepción" autoComplete="address-level2" />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-paper-900">Logo</span>
        <LogoField value={company.logo} onChange={(logo) => setField('logo', logo)} compact />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-paper-900">Color de tus documentos</span>
        <AccentField value={company.accent} onChange={(accent) => setField('accent', accent)} compact />
      </div>
    </div>
  )
}

function PricingStep({
  pricing,
  onChange,
  examplePrice,
  exampleName,
  sample,
}: {
  pricing: PricingSettings
  onChange: (patch: Partial<PricingSettings>) => void
  examplePrice: number
  exampleName: string
  sample: boolean
}) {
  const margin = pricing.marginMode === 'margin'
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="ob-margin" className="font-medium text-paper-900">
            {margin ? 'Tu margen' : 'Tu recargo'}
          </label>
          <span className="text-[13px] text-paper-600">{margin ? 'sobre el precio de venta' : 'sobre el costo'}</span>
        </div>
        <p className="mt-1 text-[13px] leading-[19px] text-paper-600">
          {margin
            ? `De cada $100 que cobras, $${Math.round(pricing.marginPct)} son tu ganancia. La mayoría de los talleres usa entre 30 % y 45 %.`
            : `A lo que te cuesta le sumas un ${Math.round(pricing.marginPct)} %.`}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Slider aria-label="Margen" value={pricing.marginPct} onValueChange={(marginPct) => onChange({ marginPct })} min={0} max={margin ? 70 : 150} step={1} className="flex-1" />
          <NumberField id="ob-margin" value={pricing.marginPct} onChange={(v) => onChange({ marginPct: v ?? 0 })} min={0} max={margin ? 95 : 500} step={1} bigStep={5} unit="%" className="w-24" />
        </div>
      </div>
      <div>
        <label htmlFor="ob-labor" className="font-medium text-paper-900">
          Mano de obra por m²
        </label>
        <p className="mt-1 text-[13px] leading-[19px] text-paper-600">Lo que te cuesta fabricar y armar cada metro cuadrado de ventana.</p>
        <MoneyField id="ob-labor" value={pricing.laborPerM2} onChange={(v) => onChange({ laborPerM2: v ?? 0 })} suffix="por m²" className="mt-3 max-w-xs" />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-paper-200 bg-paper-0 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[13px] text-paper-600">Con esto, una {exampleName.toLowerCase()} de 1.500 × 1.200 mm queda en</p>
          {sample ? <p className="text-meta text-paper-600">Calculado con precios de ejemplo.</p> : null}
        </div>
        <p className="shrink-0 text-h3 font-semibold text-paper-900 tabular">
          {formatCLP(examplePrice)}
          <span className="ml-1 text-[12px] font-normal text-paper-600">+ IVA</span>
        </p>
      </div>
    </div>
  )
}
