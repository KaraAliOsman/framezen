import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, Send } from 'lucide-react'
import type { Catalog, QuoteSelection } from '@dekopen/engine'
import { Window3DLazy, Window3DWithAr } from '../viewer3d/lazy'
import { api, humanError, type AcceptResult } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useFormat, useGlossary, useT } from '../../lib/i18n'
import { buttonClass } from '../../ui/Button'
import { Checkbox } from '../../ui/Checkbox'
import { Dialog, DialogContent } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { Input, Textarea } from '../../ui/Input'
import { Notice } from '../../ui/Notice'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Sheet, SheetContent } from '../../ui/Sheet'
import { Slider } from '../../ui/Slider'
import { Spinner } from '../../ui/Spinner'
import { useIsPhone } from '../clients/useIsPhone'
import { rutHint } from '../clients/rut'
import { isChileanTaxId } from '../clients/taxId'
import es from './i18n/es'
import { portalItemTitle } from './PortalItemCard'
import { acceptNameError, composeChangesMessage, taxInSentence, type PortalItem } from './portalModel'

/** Máximo que acepta el servidor para «Pedir cambios». */
const CHANGES_MAX = 4000

/** Botón con el color de marca del taller (el portal es su documento de venta, no el de DEKOPEN). */
export const brandButton =
  'relative inline-flex items-center justify-center gap-2 rounded-control bg-[var(--brand)] font-medium whitespace-nowrap text-[var(--brand-on)] ' +
  'transition-[background-color,transform,opacity] duration-100 ease-out hover:bg-[color-mix(in_srgb,var(--brand)_86%,black)] ' +
  'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ' +
  'disabled:pointer-events-none disabled:opacity-60'

/** Diálogo en escritorio, hoja inferior en el teléfono. */
function Responsive({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const phone = useIsPhone()
  if (phone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" title={title} description={description} footer={footer}>
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} footer={footer} size={size}>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** Confirmación serena: check que aparece en 160 ms (sin rebote) y el texto. */
function Done({ icon, title, children }: { icon: ReactNode; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="fz-pop inline-flex size-12 items-center justify-center rounded-full bg-success-bg text-success">{icon}</span>
      <div>
        {title ? <p className="font-display text-h3 font-medium text-fg-strong">{title}</p> : null}
        {children ? <div className="mx-auto mt-1 max-w-sm text-fg-muted">{children}</div> : null}
      </div>
    </div>
  )
}

// ── Aceptar ──────────────────────────────────────────────────────────────────

export function AcceptDialog({
  open,
  onOpenChange,
  token,
  orgName,
  quoteLabel,
  total,
  currency,
  taxLabel,
  itemsCount,
  paymentTerms,
  defaultName,
  revision,
  selection,
  onAccepted,
  afterAccept,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  orgName: string
  quoteLabel: string
  total: number
  /** Moneda de la cotización (CLP por defecto). */
  currency?: string
  /** Nombre del impuesto del documento («IVA»). */
  taxLabel: string
  itemsCount: number
  paymentTerms?: string
  defaultName?: string
  /** Revisión que se está mostrando: se acepta esa y no una más nueva que el cliente no vio. */
  revision?: number
  /** Opcionales y alternativas elegidos; el servidor recalcula con ellos. */
  selection?: QuoteSelection
  onAccepted: (result: AcceptResult) => void
  /** Acción principal tras aceptar (ir a pagar), si el taller configuró un medio. */
  afterAccept?: { label: string; onClick: () => void }
}) {
  const t = useT(es)
  const fmt = useFormat({ locale: t.locale, currency })
  const chile = isChileanTaxId(currency)
  const [name, setName] = useState(defaultName ?? '')
  const [rut, setRut] = useState('')
  const [declared, setDeclared] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<AcceptResult | null>(null)

  useEffect(() => {
    if (open) {
      setTried(false)
      setError(null)
      setDone(null)
      setName((n) => n || defaultName || '')
    }
  }, [open, defaultName])

  const nameError = acceptNameError(name)
  const rutWarning = chile ? rutHint(rut, t.locale) : null

  const submit = async () => {
    setTried(true)
    if (nameError || !declared) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.portal.accept(token, { name: name.trim(), ...(rut.trim() ? { rut: rut.trim() } : {}), ...(revision ? { revision } : {}), ...(selection ? { selection } : {}), declared })
      setDone(result)
      onAccepted(result)
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  const first = name.trim().split(/\s+/)[0]
  const terms = paymentTerms?.trim().replace(/\.$/, '')

  return (
    <Responsive
      open={open}
      onOpenChange={onOpenChange}
      title={done ? t('accept.doneTitle') : t('accept.title')}
      description={done ? undefined : t('accept.description', { label: quoteLabel, total: fmt.money(total), tax: taxInSentence(taxLabel, t.locale) })}
      footer={
        done ? (
          <>
            <button type="button" className={buttonClass('secondary', 'md', afterAccept ? 'max-sm:flex-1' : undefined)} onClick={() => onOpenChange(false)}>
              {t('accept.close')}
            </button>
            {afterAccept ? (
              <button
                type="button"
                className={cn(brandButton, 'h-10 px-5 touch:h-11 max-sm:flex-[2]')}
                onClick={() => {
                  onOpenChange(false)
                  afterAccept.onClick()
                }}
              >
                {afterAccept.label}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" className={buttonClass('secondary', 'md', 'max-sm:flex-1')} onClick={() => onOpenChange(false)}>
              {t('accept.back')}
            </button>
            <button type="button" className={cn(brandButton, 'h-10 px-5 touch:h-11 max-sm:flex-[2]')} onClick={() => void submit()} disabled={busy} aria-busy={busy || undefined}>
              {busy ? <Spinner /> : null}
              {t('accept.submit')}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <Done
            icon={<CircleCheck aria-hidden strokeWidth={1.75} className="size-6" />}
            title={done.alreadyAccepted ? t('accept.alreadyTitle') : first ? t('accept.done', { name: first }) : t('accept.doneAnonymous')}
          >
            {done.alreadyAccepted ? t('accept.alreadyText', { org: orgName }) : t('accept.doneText', { org: orgName })}
          </Done>
          {done.warnings.map((w) => (
            <Notice key={w} tone="warning" size="compact">
              {w}
            </Notice>
          ))}
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label={t('accept.name')} error={tried && nameError ? t(nameError === 'empty' ? 'accept.nameEmpty' : 'accept.nameShort') : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus placeholder={t('accept.namePlaceholder')} />
          </Field>
          <Field
            label={chile ? t('accept.rut') : t('accept.taxId')}
            optional
            hint={rutWarning ? <span className="text-warning">{rutWarning}</span> : chile ? t('accept.rutHint') : t('accept.taxIdHint')}
          >
            <Input value={rut} onChange={(e) => setRut(e.target.value)} placeholder={chile ? '12.345.678-5' : undefined} inputMode="text" autoComplete="off" />
          </Field>
          <Checkbox
            checked={declared}
            onCheckedChange={(value) => setDeclared(value === true)}
            aria-invalid={tried && !declared ? true : undefined}
            label={t('accept.declaration')}
          />
          {tried && !declared ? (
            <p role="alert" className="-mt-2 text-table text-danger">
              {t('accept.declarationMissing')}
            </p>
          ) : null}
          <p className="text-table text-fg-muted">
            {terms
              ? t('accept.consentTerms', { count: itemsCount, org: orgName, terms })
              : t('accept.consent', { count: itemsCount, org: orgName })}
          </p>
          {error ? (
            <p role="alert" className="text-table text-danger">
              {error}
            </p>
          ) : null}
          <button type="submit" hidden />
        </form>
      )}
    </Responsive>
  )
}

// ── Pedir cambios ────────────────────────────────────────────────────────────

export function ChangesDialog({
  open,
  onOpenChange,
  token,
  orgName,
  defaultName,
  items = [],
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  orgName: string
  defaultName?: string
  /** Ventanas de la cotización («V1 · Corredera 2 hojas») para anotar cambios junto a cada una. */
  items?: { id: string; label: string }[]
  onSent: () => void
}) {
  const t = useT(es)
  const [message, setMessage] = useState('')
  const [perItem, setPerItem] = useState<Record<string, string>>({})
  const [name, setName] = useState(defaultName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [tried, setTried] = useState(false)
  const sentRef = useRef(sent)
  sentRef.current = sent

  // Al volver a abrir después de enviar, empieza en blanco.
  useEffect(() => {
    if (!open) return
    setError(null)
    setTried(false)
    if (sentRef.current) {
      setSent(false)
      setMessage('')
      setPerItem({})
    }
  }, [open])

  const composed = composeChangesMessage(
    message,
    items.map((item) => ({ label: item.label, text: perItem[item.id] ?? '' })),
    Number.POSITIVE_INFINITY,
  )
  const empty = !composed.trim()
  const tooLong = composed.length > CHANGES_MAX

  const submit = async () => {
    setTried(true)
    if (empty || tooLong) return
    setBusy(true)
    setError(null)
    try {
      await api.portal.requestChanges(token, { message: composed, ...(name.trim() ? { name: name.trim() } : {}) })
      setSent(true)
      onSent()
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Responsive
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={sent ? t('changes.sentTitle') : t('changes.title')}
      description={sent ? undefined : t('changes.description', { org: orgName })}
      footer={
        sent ? (
          <button type="button" className={buttonClass('secondary', 'md')} onClick={() => onOpenChange(false)}>
            {t('changes.close')}
          </button>
        ) : (
          <>
            <button type="button" className={buttonClass('secondary', 'md', 'max-sm:flex-1')} onClick={() => onOpenChange(false)}>
              {t('changes.back')}
            </button>
            <button type="button" className={cn(brandButton, 'h-10 px-5 touch:h-11 max-sm:flex-[2]')} onClick={() => void submit()} disabled={busy} aria-busy={busy || undefined}>
              {busy ? <Spinner /> : <Send aria-hidden strokeWidth={1.75} className="size-4" />}
              {t('changes.send')}
            </button>
          </>
        )
      }
    >
      {sent ? (
        <Done icon={<Send aria-hidden strokeWidth={1.75} className="size-5" />}>
          <p className="text-fg">{t('changes.sent', { org: orgName })}</p>
        </Done>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label={t('changes.message')} error={tried && empty ? t('changes.messageEmpty') : undefined}>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} autoFocus placeholder={t('changes.placeholder')} />
          </Field>
          {items.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-table font-medium text-fg-strong">{t('changes.perItem')}</legend>
              <p className="-mt-1 text-table text-fg-muted">{t('changes.perItemHint')}</p>
              <ul className="flex flex-col gap-2.5">
                {items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <label htmlFor={`change-${item.id}`} className="min-w-0 text-table font-medium text-fg sm:w-[42%] sm:truncate">
                      {item.label}
                    </label>
                    <Input
                      id={`change-${item.id}`}
                      size="sm"
                      value={perItem[item.id] ?? ''}
                      onChange={(e) => setPerItem((current) => ({ ...current, [item.id]: e.target.value }))}
                      placeholder={t('changes.perItemPlaceholder')}
                      className="sm:flex-1"
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}
          <Field label={t('changes.name')} optional>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          {tooLong ? (
            <Notice tone="warning" size="compact">
              {t('changes.tooLong', { max: CHANGES_MAX.toLocaleString(t.locale) })}
            </Notice>
          ) : null}
          {error ? (
            <p role="alert" className="text-table text-danger">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Responsive>
  )
}

// ── 3D ───────────────────────────────────────────────────────────────────────

export function View3DDialog({ item, catalog, ar, token, onOpenChange }: { item: PortalItem | null; catalog: Catalog; ar: boolean; token: string; onOpenChange: (open: boolean) => void }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat({ locale: t.locale })
  const phone = useIsPhone()
  const hostGlb = useCallback(async (glb: Blob) => (await api.portal.hostArModel(token, glb)).url, [token])
  const [open, setOpenAmount] = useState(0)
  const [view, setView] = useState<'interior' | 'exterior'>('exterior')
  useEffect(() => {
    if (item) {
      setOpenAmount(0)
      setView('exterior')
    }
  }, [item])
  return (
    <Responsive
      open={Boolean(item)}
      onOpenChange={onOpenChange}
      size="lg"
      title={item ? `${item.ref} · ${portalItemTitle(item, g)}` : t('view3d.title')}
      description={item ? [fmt.size(item.width, item.height), item.lineName, item.colorName].filter(Boolean).join(' · ') : undefined}
    >
      {item?.layout ? (
        <div className="flex flex-col gap-4">
          {ar ? (
            <Window3DWithAr
              layout={item.layout}
              design={item.design}
              catalog={catalog}
              openAmount={open}
              view={view}
              height={phone ? 300 : 400}
              className="overflow-hidden rounded-panel bg-sunken"
              ar={{ title: `${item.ref} · ${portalItemTitle(item, g)}`, itemId: item.id, pageUrl: `${window.location.origin}${window.location.pathname}`, hostGlb, placement: 'wall' }}
            />
          ) : (
            <Window3DLazy
              layout={item.layout}
              design={item.design}
              catalog={catalog}
              openAmount={open}
              view={view}
              height={phone ? 300 : 400}
              className="overflow-hidden rounded-panel bg-sunken"
            />
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex min-w-[220px] flex-1 items-center gap-3 text-table text-fg-muted">
              <span className="shrink-0">{t('view3d.open')}</span>
              <Slider aria-label={t('view3d.openLabel')} value={Math.round(open * 100)} onValueChange={(v) => setOpenAmount(v / 100)} min={0} max={100} step={1} className="flex-1" />
            </label>
            <SegmentedControl
              aria-label={t('view3d.view')}
              value={view}
              onValueChange={setView}
              options={[
                { value: 'exterior', label: t('view3d.fromOutside') },
                { value: 'interior', label: t('view3d.fromInside') },
              ]}
            />
          </div>
        </div>
      ) : null}
    </Responsive>
  )
}
