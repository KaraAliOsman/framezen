/**
 * Portal del cliente /c/:token (público, sin el marco de la app). Es lo que ve el cliente final:
 * la cotización con la marca del taller, cada ventana con su dibujo, medidas y precio, totales,
 * condiciones, PDF, vista 3D (si el plan la incluye), «Aceptar» y «Pedir cambios».
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Download, Globe, Mail, MessageCircle, PenLine, Phone } from 'lucide-react'
import { paymentSchedule } from '@framezen/documents'
import type { AcceptResult } from '../../lib/api'
import { ApiRequestError, humanError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatArea, formatCLP, formatLongDate, formatNumber, initials } from '../../lib/format'
import { usePublicQuote } from '../../lib/hooks'
import { qk } from '../../lib/queryClient'
import { FramezenMark } from '../../ui/FramezenLogo'
import { Skeleton } from '../../ui/Skeleton'
import { AcceptDialog, brandButton, ChangesDialog, outlineButton, View3DDialog } from './PortalDialogs'
import { PortalItemCard } from './PortalItemCard'
import {
  brandColors,
  conditionLines,
  contactLinks,
  isAccepted,
  pdfFileName,
  portalItems,
  validUntil,
  visibleExtras,
  type PortalData,
  type PortalItem,
} from './portalModel'
import { useLightTheme } from './useLightTheme'

export default function PortalPage() {
  const { token = '' } = useParams()
  useLightTheme()
  const portal = usePublicQuote(token)
  const data = portal.data as PortalData | undefined

  useEffect(() => {
    const previous = document.title
    document.title = data ? `Cotización N° ${data.quote.number} · ${data.org.name}` : 'Cotización'
    return () => {
      document.title = previous
    }
  }, [data])

  if (portal.isPending) return <PortalSkeleton />
  if (portal.isError || !data) return <PortalMissing error={portal.error} onRetry={() => void portal.refetch()} />
  return <Portal data={data} token={token} />
}

function Portal({ data, token }: { data: PortalData; token: string }) {
  const queryClient = useQueryClient()
  const { quote, org, documents, catalog, features } = data
  const colors = brandColors(org.accent)
  const items = useMemo(() => portalItems(data), [data])
  const extras = visibleExtras(quote.extras)
  const totals = quote.totals
  const total = totals?.total ?? items.reduce((a, i) => a + i.totalNet, 0)
  const units = items.reduce((a, i) => a + i.qty, 0)
  const area = items.reduce((a, i) => a + i.area * i.qty, 0)
  const can3d = (features ?? []).includes('client3d')
  const accepted = isAccepted(quote.status) && Boolean(quote.acceptedBy)
  const until = validUntil(quote, documents.validityDays)
  const expired = until ? until.getTime() < Date.now() && !accepted : false
  const label = `Cotización N° ${quote.number}${data.revisionLabel ? ` · versión ${data.revisionLabel}` : ''}`
  const steps = paymentSchedule(documents.paymentTerms, total)
  const contacts = contactLinks(org, quote.number)

  const [acceptOpen, setAcceptOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [changesSent, setChangesSent] = useState(false)
  const [view3d, setView3d] = useState<PortalItem | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const onAccepted = (result: AcceptResult) => {
    queryClient.setQueryData<PortalData>(qk.portal(token), (prev) =>
      prev ? { ...prev, quote: { ...prev.quote, status: result.status, acceptedBy: result.acceptedBy ?? prev.quote.acceptedBy } } : prev,
    )
  }

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(token)}/pdf`)
      if (res.ok && (res.headers.get('content-type') ?? '').includes('pdf')) {
        const url = URL.createObjectURL(await res.blob())
        const a = document.createElement('a')
        a.href = url
        a.download = pdfFileName(quote.number, data.revisionLabel)
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        return
      }
      window.print()
    } catch {
      window.print()
    } finally {
      setPdfBusy(false)
    }
  }

  const style = {
    '--brand': colors.accent,
    '--brand-on': colors.onAccent,
    '--brand-ink': colors.ink,
    '--brand-soft': colors.soft,
  } as CSSProperties

  // Los diálogos se montan fuera de esta raíz (portal de Radix): los colores van también en <html>.
  useEffect(() => {
    const root = document.documentElement.style
    const vars = { '--brand': colors.accent, '--brand-on': colors.onAccent, '--brand-ink': colors.ink, '--brand-soft': colors.soft }
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v)
    return () => {
      for (const k of Object.keys(vars)) root.removeProperty(k)
    }
  }, [colors.accent, colors.onAccent, colors.ink, colors.soft])

  const actions = (
    <div className="flex flex-col gap-2">
      {accepted ? (
        <p className="flex h-11 items-center justify-center gap-2 rounded-sm bg-ok-50 font-medium text-ok-800">
          <CircleCheck aria-hidden strokeWidth={1.75} className="size-[18px]" />
          Cotización aceptada
        </p>
      ) : (
        <button type="button" onClick={() => setAcceptOpen(true)} className={cn(brandButton, 'h-11 w-full text-lead')}>
          Aceptar cotización
        </button>
      )}
      <button type="button" onClick={() => setChangesOpen(true)} className={cn(outlineButton, 'h-11 w-full')}>
        <PenLine aria-hidden strokeWidth={1.75} className="size-4" />
        {accepted ? 'Escribir al taller' : 'Pedir cambios'}
      </button>
    </div>
  )

  return (
    <div style={style} className="min-h-dvh bg-paper-50 text-paper-900">
      <div aria-hidden className="h-[3px] bg-[var(--brand)] print:hidden" />
      <header className="sticky top-0 z-30 border-b border-paper-200 bg-paper-0 print:static">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {org.logo ? (
              <img src={org.logo} alt={org.name} className="h-9 w-auto max-w-[150px] object-contain sm:max-w-[200px]" />
            ) : (
              <span
                aria-hidden
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm bg-[var(--brand)] text-[13px] font-semibold text-[var(--brand-on)]"
              >
                {initials(org.name)}
              </span>
            )}
            <span className={cn('truncate font-semibold tracking-[-0.01em]', org.logo && 'max-sm:sr-only')}>{org.name}</span>
          </div>
          <button type="button" onClick={() => void downloadPdf()} disabled={pdfBusy} className={cn(outlineButton, 'h-9 shrink-0 px-3 text-[13px] print:hidden')}>
            <Download aria-hidden strokeWidth={1.75} className="size-4" />
            <span className="max-sm:sr-only">Descargar PDF</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8 pb-36 sm:px-6 sm:pt-12 lg:pb-20">
        <section aria-labelledby="portal-title" className="max-w-3xl">
          <p className="text-[13px] font-medium text-[var(--brand-ink)]">{label}</p>
          <h1 id="portal-title" className="mt-1.5 text-h2 font-semibold tracking-[-0.015em] text-balance sm:text-[36px] sm:leading-[44px]">
            {quote.title || `Cotización N° ${quote.number}`}
          </h1>
          <p className="mt-2 text-[13px] leading-[19px] text-paper-600 sm:text-base">
            {[
              quote.client?.name ? `Para ${quote.client.name}` : null,
              quote.sentAt ? formatLongDate(quote.sentAt) : null,
              until && !accepted ? `válida hasta el ${formatLongDate(until)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {accepted && quote.acceptedBy ? (
            <div role="status" className="mt-5 flex items-start gap-3 rounded-md border border-ok-600/25 bg-ok-50 px-4 py-3">
              <CircleCheck aria-hidden strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-ok-600" />
              <p className="text-[13px] leading-[19px] text-ok-800">
                <span className="block font-medium">Aceptada por {quote.acceptedBy.name}</span>
                {formatLongDate(quote.acceptedBy.at)}
                {quote.acceptedBy.rut ? ` · RUT ${quote.acceptedBy.rut}` : ''}. {org.name} ya tiene el aviso.
              </p>
            </div>
          ) : null}
          {changesSent && !accepted ? (
            <p role="status" className="mt-5 rounded-md border border-paper-200 bg-paper-0 px-4 py-3 text-[13px] text-paper-900">
              Enviaste tu pedido de cambios. {org.name} te responderá con una versión nueva de esta cotización.
            </p>
          ) : null}
          {expired ? (
            <p role="status" className="mt-5 rounded-md border border-warn-600/25 bg-warn-50 px-4 py-3 text-[13px] leading-[19px] text-warn-800">
              La vigencia de esta cotización terminó el {formatLongDate(until!)}. Puedes aceptarla igual: {org.name} te confirmará si los precios se
              mantienen.
            </p>
          ) : null}
          {documents.intro ? <p className="mt-6 text-base leading-[24px] whitespace-pre-line text-paper-900">{documents.intro}</p> : null}
        </section>

        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-h3 font-semibold tracking-[-0.01em]">{items.length === 1 ? 'Tu ventana' : 'Tus ventanas'}</h2>
              <p className="text-[13px] whitespace-nowrap text-paper-600 tabular">
                {formatNumber(units)} {units === 1 ? 'ventana' : 'ventanas'} · {formatArea(area)}
              </p>
            </div>
            {items.map((item) => (
              <PortalItemCard key={item.id} item={item} catalog={catalog} can3d={can3d} onOpen3d={setView3d} />
            ))}
          </div>

          <aside className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="flex flex-col gap-4 lg:sticky lg:top-24">
              <section aria-label="Resumen" className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
                <div className="px-5 pt-5">
                  <p className="text-[13px] text-paper-600">Total</p>
                  <p className="mt-0.5 text-[34px] leading-[40px] font-semibold tracking-[-0.02em] text-paper-900 tabular">{formatCLP(total)}</p>
                  <p className="text-[13px] text-paper-600">IVA incluido</p>
                </div>
                <dl className="mt-4 border-t border-paper-200 px-5 py-3 text-[13px] leading-[18px]">
                  {totals ? (
                    <>
                      {/* Sin descuento ni extras, «Ventanas» repetiría el neto. */}
                      {totals.discount > 0 || extras.length ? (
                        <Row label={units === 1 ? 'Ventana' : 'Ventanas'} value={formatCLP(totals.subtotal)} />
                      ) : null}
                      {totals.discount > 0 ? <Row label={`Descuento ${formatNumber(totals.discountPct, 1)} %`} value={`−${formatCLP(totals.discount)}`} tone="ok" /> : null}
                      {extras.map((e) => (
                        <Row key={e.label} label={e.label} value={formatCLP(e.amount)} />
                      ))}
                      <Row label="Neto" value={formatCLP(totals.net)} strong={totals.discount > 0 || extras.length > 0} />
                      <Row label="IVA" value={formatCLP(totals.iva)} />
                    </>
                  ) : null}
                </dl>
                <div className="border-t border-paper-200 bg-paper-50 p-4 print:hidden">{actions}</div>
              </section>

              {contacts.length ? (
                <section aria-labelledby="portal-contact" className="rounded-lg border border-paper-200 bg-paper-0 p-5 print:hidden">
                  <h2 id="portal-contact" className="text-[13px] font-medium text-paper-900">
                    ¿Dudas? Habla con {org.name}
                  </h2>
                  <ul className="mt-3 flex flex-col gap-1">
                    {contacts.map((c) => {
                      const Icon = c.kind === 'whatsapp' ? MessageCircle : c.kind === 'phone' ? Phone : c.kind === 'email' ? Mail : Globe
                      return (
                        <li key={c.kind}>
                          <a
                            href={c.href}
                            target={c.kind === 'whatsapp' || c.kind === 'web' ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="-mx-2 flex h-9 items-center gap-2.5 rounded-sm px-2 text-[13px] text-paper-900 transition-colors duration-120 hover:bg-paper-100 touch:h-11"
                          >
                            <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-[var(--brand-ink)]" />
                            <span className="truncate">{c.label}</span>
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          </aside>

          <section aria-labelledby="portal-conditions" className="rounded-lg border border-paper-200 bg-paper-0 p-5 break-inside-avoid sm:p-6 lg:col-start-1 lg:row-start-2 lg:self-start">
            <h2 id="portal-conditions" className="text-h3 font-semibold tracking-[-0.01em]">
              Condiciones
            </h2>
            <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {documents.paymentTerms ? (
                <Condition title="Forma de pago">
                  {steps ? (
                    <ul className="flex flex-col gap-1">
                      {steps.map((s) => (
                        <li key={s.label} className="flex items-baseline justify-between gap-3">
                          <span>
                            {formatNumber(s.pct)} % {s.label.toLowerCase()}
                          </span>
                          <span className="tabular text-paper-900">{formatCLP(s.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    documents.paymentTerms
                  )}
                </Condition>
              ) : null}
              {documents.leadTimeText ? <Condition title="Plazo">{documents.leadTimeText}</Condition> : null}
              {documents.warranty ? <Condition title="Garantía">{documents.warranty}</Condition> : null}
              {until ? <Condition title="Vigencia">Hasta el {formatLongDate(until)}</Condition> : null}
            </div>
            {conditionLines(documents.conditions).length ? (
              <ul className="mt-5 flex flex-col gap-1.5 border-t border-paper-200 pt-4 text-[13px] leading-[19px] text-paper-600">
                {conditionLines(documents.conditions).map((l, i) =>
                  l.bullet ? (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-paper-350" />
                      {l.text}
                    </li>
                  ) : (
                    <li key={i}>{l.text}</li>
                  ),
                )}
              </ul>
            ) : null}
          </section>
        </div>

        <footer className="mt-14 flex flex-col gap-3 border-t border-paper-200 pt-6 text-meta text-paper-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {[org.legalName || org.name, org.rut ? `RUT ${org.rut}` : null, [org.address, org.city].filter(Boolean).join(', ') || null].filter(Boolean).join(' · ')}
          </p>
          <p className="inline-flex items-center gap-1.5 print:hidden">
            <FramezenMark size={12} />
            Cotización hecha con framezen
          </p>
        </footer>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-200 bg-paper-0 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(31_28_24/0.06)] lg:hidden print:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-meta text-paper-600">Total IVA incluido</p>
            <p className="text-h3 font-semibold whitespace-nowrap text-paper-900 tabular">{formatCLP(total)}</p>
          </div>
          {accepted ? (
            <button type="button" onClick={() => setChangesOpen(true)} className={cn(outlineButton, 'h-11 shrink-0 px-4 whitespace-nowrap')}>
              Escribir al taller
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setChangesOpen(true)} className={cn(outlineButton, 'h-11 px-3 text-base whitespace-nowrap')}>
                Pedir cambios
              </button>
              <button type="button" onClick={() => setAcceptOpen(true)} className={cn(brandButton, 'h-11 px-4 text-base whitespace-nowrap')}>
                Aceptar
              </button>
            </div>
          )}
        </div>
      </div>

      <AcceptDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        token={token}
        orgName={org.name}
        quoteLabel={label}
        total={total}
        itemsCount={items.length}
        paymentTerms={documents.paymentTerms}
        defaultName={quote.client?.name}
        revision={quote.revision}
        onAccepted={onAccepted}
      />
      <ChangesDialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        token={token}
        orgName={org.name}
        defaultName={quote.client?.name}
        onSent={() => setChangesSent(true)}
      />
      <View3DDialog item={view3d} catalog={catalog} onOpenChange={(open) => !open && setView3d(null)} />
    </div>
  )
}

function Condition({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[13px] font-medium text-paper-900">{title}</h3>
      <div className="mt-1 text-[13px] leading-[19px] text-paper-600">{children}</div>
    </div>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'ok' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1', strong && 'mt-1 border-t border-paper-200 pt-2 font-medium text-paper-900')}>
      <dt className={cn('min-w-0', !strong && 'text-paper-600')}>{label}</dt>
      <dd className={cn('shrink-0 tabular', tone === 'ok' ? 'text-ok-600' : 'text-paper-900')}>{value}</dd>
    </div>
  )
}

function PortalSkeleton() {
  return (
    <div className="min-h-dvh bg-paper-50" aria-busy="true" aria-label="Cargando la cotización">
      <div className="h-16 border-b border-paper-200 bg-paper-0" />
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-10 w-full max-w-lg" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
          <Skeleton className="h-80" />
        </div>
      </div>
    </div>
  )
}

function PortalMissing({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const missing = error instanceof ApiRequestError && (error.status === 404 || error.status === 410)
  return (
    <div className="grid min-h-dvh place-items-center bg-paper-50 px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <FramezenMark size={28} className="text-paper-900" />
        <div className="space-y-1.5">
          <h1 className="text-h3 font-semibold tracking-[-0.01em]">{missing ? 'No encontramos esta cotización' : 'No pudimos abrir la cotización'}</h1>
          <p className="text-paper-600">
            {missing ? 'Puede que el enlace esté incompleto o que la cotización se haya reemplazado por una nueva. Pide a quien te la envió un enlace nuevo.' : humanError(error)}
          </p>
        </div>
        {!missing ? (
          <button type="button" onClick={onRetry} className={cn(outlineButton, 'h-10 px-4')}>
            Reintentar
          </button>
        ) : null}
      </div>
    </div>
  )
}
