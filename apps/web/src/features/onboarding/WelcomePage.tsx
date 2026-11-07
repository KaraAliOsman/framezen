/**
 * Puesta a punto: de la cuenta recién creada a una cotización real en menos de un minuto. Cuatro
 * pasos saltables (taller, cliente, ventana, margen) con valores por defecto listos: Enter avanza.
 * A la derecha, la cotización de verdad se arma con lo que la persona escribe y con el motor. Al
 * final se crean el cliente y la cotización y se abre el editor. Nunca bloquea: si algo falla al
 * guardar, se sigue igual.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { DEFAULT_PRICING, quoteTotals, sanitizePricing, type PricingSettings } from '@dekopen/engine'
import { isLocale, type Locale, type Me, type OrgSettings } from '@dekopen/shared'
import { LanguageSelect } from '../../app/shell/LanguageMenu'
import { humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { firstName } from '../../lib/format'
import { useCatalog, useCreateClient, useCreateQuote, useSettings, useUpdateSettings } from '../../lib/hooks'
import { useGlossary, useLocale, useT } from '../../lib/i18n'
import { qk } from '../../lib/queryClient'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, DekopenLogo, Meter, SaveIndicator, Skeleton, toast } from '../../ui'
import { DocPreview } from '../settings/components/DocPreview'
import { useSaveOrg, type OrgPatch } from '../settings/lib/accountApi'
import { DEFAULT_PREFS } from '../settings/lib/previewDoc'
import { combineStatus, useAutosave } from '../settings/lib/useAutosave'
import { clearDraft, loadDraft, quoteItemFrom, resolveWindow, saveDraft, type ClientDraft, type FirstQuoteDraft, type WindowDraft } from './draft'
import es from './i18n/es'
import { buildLiveDoc } from './liveDoc'
import { ClientStep, CompanyStep, PriceStep, WindowStep, type CompanyDraft, type RegionPatch } from './steps'

const STEPS = ['taller', 'cliente', 'ventana', 'precio'] as const
type StepId = (typeof STEPS)[number]

/** Qué hoja se ve en cada paso: con una sola ventana, la primera ya trae todo, incluido el total. */
const STEP_PAGE: Record<StepId, number | 'last'> = { taller: 1, cliente: 1, ventana: 1, precio: 1 }

export default function WelcomePage() {
  const t = useT(es)
  usePageTitle(t('pageTitle'))
  const me = useSession()
  const navigate = useNavigate()
  const client = useQueryClient()
  const g = useGlossary()
  const { locale, setLocale } = useLocale()
  const settings = useSettings()
  const catalog = useCatalog()
  const updateSettings = useUpdateSettings()
  const saveOrg = useSaveOrg()
  const createQuote = useCreateQuote()
  const createClient = useCreateClient()
  // Mismas colas que Ajustes › Empresa y Precios: un cambio sin guardar sigue vivo entre pantallas.
  const orgSave = useAutosave<OrgPatch>(saveOrg, { key: 'org' })
  const pricingSave = useAutosave<{ pricing: PricingSettings }>((patch) => updateSettings.mutateAsync(patch), { key: 'settings:pricing' })
  const regionSave = useAutosave<RegionPatch>((patch) => updateSettings.mutateAsync(patch), { key: 'settings:region' })
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [leaving, setLeaving] = useState(false)
  const [draft, setDraft] = useState<FirstQuoteDraft>(loadDraft)
  const [company, setCompany] = useState<CompanyDraft>(() => {
    const org = { ...me.org, ...orgSave.unsaved() }
    return { name: org.name ?? '', phone: org.phone ?? '', city: org.city ?? '', logo: org.logo ?? null, accent: org.accent ?? null }
  })
  const [pricing, setPricing] = useState<PricingSettings | null>(null)
  const latestPricing = useRef<PricingSettings | null>(null)
  const [region, setRegion] = useState<RegionPatch>({})
  /** El idioma de los documentos sigue al de la interfaz hasta que la persona lo elige aparte. */
  const docsTouched = useRef(false)

  useEffect(() => {
    if (settings.data && !latestPricing.current) {
      latestPricing.current = sanitizePricing(pricingSave.unsaved()?.pricing ?? settings.data.pricing)
      setPricing(latestPricing.current)
    }
  }, [settings.data, pricingSave.unsaved])

  useEffect(() => saveDraft(draft), [draft])

  const docLocale: Locale = region.locale ?? (isLocale(settings.data?.locale) ? settings.data.locale : isLocale(me.org.locale) ? me.org.locale : 'es')
  const currency = (region.currency ?? settings.data?.currency ?? me.org.currency ?? 'CLP').toUpperCase()
  const taxLabel = region.taxLabel ?? settings.data?.taxLabel ?? 'IVA'
  const currentPricing = pricing ?? settings.data?.pricing ?? DEFAULT_PRICING

  // La interfaz cambia en el selector de idioma: los documentos la siguen si no se eligieron aparte.
  const lastLocale = useRef(locale)
  useEffect(() => {
    if (lastLocale.current === locale) return
    lastLocale.current = locale
    if (!docsTouched.current && locale !== docLocale) changeRegion({ locale })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona al idioma.
  }, [locale])

  const changeRegion = (patch: RegionPatch) => {
    setRegion((r) => ({ ...r, ...patch }))
    regionSave.queue(patch)
    // La moneda manda en todos los montos de la app (formatos y campos): se refleja al instante.
    if (patch.currency) {
      const meNow = client.getQueryData<Me | null>(qk.me)
      if (meNow) client.setQueryData<Me>(qk.me, { ...meNow, org: { ...meNow.org, currency: patch.currency } })
    }
  }

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

  const setClient = (patch: Partial<ClientDraft>) => setDraft((d) => ({ ...d, client: { ...d.client, ...patch } }))
  const setWindow = (patch: Partial<WindowDraft>) => setDraft((d) => ({ ...d, window: { ...d.window, ...patch } }))

  const flushAll = () => Promise.allSettled([orgSave.flush(), pricingSave.flush(), regionSave.flush()])

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1)
    setStep(Math.max(0, Math.min(STEPS.length - 1, to)))
    void flushAll()
  }

  const current: StepId = STEPS[step]
  const last = step === STEPS.length - 1
  const defaults = settings.data?.defaults
  const cut = settings.data?.cut
  const deferredPricing = useDeferredValue(currentPricing)
  const deferredWindow = useDeferredValue(draft.window)
  const resolved = useMemo(() => resolveWindow(catalog.data, deferredPricing, deferredWindow, { defaults, cut }), [catalog.data, deferredPricing, deferredWindow, defaults, cut])
  const totals = useMemo(() => quoteTotals(resolved ? [{ price: resolved.price, area: resolved.price.area }] : [], { discountPct: 0, extras: [], ivaPct: currentPricing.ivaPct }), [resolved, currentPricing.ivaPct])

  const clientName = draft.client.name.trim()
  const title = clientName ? t('client.work', { name: clientName }) : t('client.workFallback')

  /** Termina o salta la puesta a punto. Crear abre la cotización real; si algo falla, se sigue. */
  const leave = async (create: boolean) => {
    setLeaving(true)
    await flushAll()
    await saveOrg({ onboarded: true }).catch(() => undefined)
    if (!create) {
      navigate('/inicio', { replace: true })
      return
    }
    let clientId: string | undefined
    if (clientName) {
      try {
        const created = await createClient.mutateAsync({ name: clientName, ...(draft.client.phone.trim() ? { phone: draft.client.phone.trim() } : {}), ...(draft.client.city.trim() ? { city: draft.client.city.trim() } : {}) })
        clientId = created.id
      } catch {
        toast.error(t('clientFailed', { name: clientName }))
      }
    }
    // Lo elegido queda como línea y color de partida para las próximas ventanas.
    if (resolved) void updateSettings.mutateAsync({ defaults: { lineId: resolved.design.lineId, colorId: resolved.design.colorId } }).catch(() => undefined)
    createQuote.mutate(
      { title, ...(clientId ? { clientId } : {}), items: resolved ? [quoteItemFrom(resolved.design, draft.window.qty)] : [] },
      {
        onSuccess: (quote) => {
          clearDraft()
          toast.success(t('created'))
          navigate(`/cotizaciones/${quote.id}`, { replace: true })
        },
        onError: (error) => {
          toast.error(humanError(error))
          navigate('/inicio', { replace: true })
        },
      },
    )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (last) void leave(true)
    else go(step + 1)
  }

  const deferredCompany = useDeferredValue(company)
  const deferredClient = useDeferredValue(draft.client)
  const doc = useMemo(() => {
    if (!catalog.data) return null
    return buildLiveDoc({
      org: {
        name: deferredCompany.name || me.org.name,
        phone: deferredCompany.phone || undefined,
        city: deferredCompany.city || undefined,
        email: me.org.email,
        logo: deferredCompany.logo ?? undefined,
        accent: deferredCompany.accent ?? undefined,
      },
      client: deferredClient,
      title,
      win: resolved,
      qty: draft.window.qty,
      windowName: g.typology(draft.window.typologyId),
      catalog: catalog.data,
      pricing: deferredPricing,
      prefs: settings.data?.documents ?? DEFAULT_PREFS,
      number: settings.data?.nextQuoteNumber,
    })
  }, [catalog.data, deferredCompany, deferredClient, deferredPricing, resolved, me.org.name, me.org.email, settings.data, draft.window.qty, draft.window.typologyId, title, g, t])

  const status = combineStatus(orgSave.status, pricingSave.status, regionSave.status)
  const heading =
    current === 'taller'
      ? t('step.taller.title', { name: firstName(me.user.name) })
      : current === 'ventana' && clientName
        ? t('step.ventana.titleFor', { name: clientName })
        : t(`step.${current}.title`)

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-canvas text-fg lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]">
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <DekopenLogo size="sm" />
          <div className="flex items-center gap-2">
            <SaveIndicator status={status} className="max-sm:hidden" />
            <LanguageSelect className="max-sm:hidden" />
            <Button variant="ghost" size="sm" onClick={() => void leave(false)} disabled={leaving}>
              {t('skip')}
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center px-4 pt-6 pb-28 sm:px-6 sm:pt-10 lg:pb-10">
          <form onSubmit={submit} noValidate className="flex w-full max-w-130 flex-1 flex-col">
            <div className="flex items-center gap-3">
              <p className="text-table text-fg-muted tabular">{t('stepOf', { n: step + 1, total: STEPS.length })}</p>
              <Meter value={step + 1} max={STEPS.length} aria-label={t('progress')} className="w-20" />
            </div>
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={current}
                custom={direction}
                initial={{ opacity: 0, x: direction * 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -8 }}
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                className="mt-6 flex flex-col"
              >
                <h1 className="font-display text-h2 font-medium text-balance text-fg-strong sm:text-h1">{heading}</h1>
                <p className="mt-2 text-fg-muted">{t(`step.${current}.text`)}</p>
                <div className="mt-8">
                  {current === 'taller' ? (
                    <CompanyStep
                      company={company}
                      setField={setField}
                      flush={() => void orgSave.flush()}
                      docLocale={docLocale}
                      currency={currency}
                      taxLabel={taxLabel}
                      ivaPct={currentPricing.ivaPct}
                      onDocLocale={(value) => {
                        docsTouched.current = true
                        changeRegion({ locale: value })
                      }}
                      onCurrency={(value) => changeRegion({ currency: value })}
                      onTaxLabel={(value) => changeRegion({ taxLabel: value })}
                      onIva={(value) => changePricing({ ivaPct: value })}
                    />
                  ) : null}
                  {current === 'cliente' ? <ClientStep client={draft.client} onChange={setClient} /> : null}
                  {current === 'ventana' ? <WindowStep value={draft.window} onChange={setWindow} catalog={catalog.data} resolved={resolved} defaults={defaults} /> : null}
                  {current === 'precio' ? <PriceStep pricing={currentPricing} onChange={changePricing} totals={totals} qty={draft.window.qty} resolved={resolved} taxLabel={taxLabel} /> : null}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-divider bg-canvas px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-6 lg:static lg:mt-auto lg:border-t-0 lg:bg-transparent lg:px-0 lg:pt-10 lg:pb-0">
              <div>
                {step > 0 ? (
                  <Button type="button" variant="ghost" icon={ArrowLeft} onClick={() => go(step - 1)} disabled={leaving}>
                    {t('back')}
                  </Button>
                ) : null}
              </div>
              <Button type="submit" variant="primary" size="lg" iconRight={last ? undefined : ArrowRight} loading={leaving}>
                {last ? t('create') : t('next')}
              </Button>
            </div>
          </form>
        </main>
      </div>

      <aside aria-label={t('preview.title')} className="min-w-0 bg-sunken max-lg:px-4 max-lg:pt-8 max-lg:pb-28">
        <div className="flex items-center justify-center lg:sticky lg:top-0 lg:h-dvh lg:p-10">
          {doc ? (
            <DocPreview data={doc} template={settings.data?.documents?.quoteTemplate} page={STEP_PAGE[current]} className="w-full max-w-100 xl:max-w-[min(30rem,calc((100dvh-5rem)*0.77))]" label={t('preview.title')} />
          ) : (
            <Skeleton aria-label={t('preview.loading')} className="aspect-[0.77] w-full max-w-100 rounded-xs" />
          )}
        </div>
      </aside>
    </div>
  )
}
