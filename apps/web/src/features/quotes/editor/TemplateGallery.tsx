/**
 * Galería de diseños del documento: cada diseño dibujado con **esta cotización** (sus ventanas,
 * su cliente, sus totales), no con un ejemplo. La primera hoja se dibuja solo cuando la tarjeta
 * entra en pantalla y con las primeras ventanas, para que abrir la galería sea instantáneo.
 * Elegir cambia solo el diseño de esta cotización (con deshacer); tus precios y textos no se tocan.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  getDocPreset,
  isDocPresetId,
  presetDescription,
  presetName,
  QUOTE_PRESET_IDS,
  type DocTemplate,
  type Locale,
} from '@dekopen/shared'
import type { QuoteDocData } from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { Dialog, DialogContent, Skeleton } from '../../../ui'
import es from '../i18n/es'
import { DOCUMENT_FONT_CSS, previewPageWidth, QuotePreview, type TemplateChoice } from '../lib/document'
import { ql } from '../model/history'
import { useEditor, useEditorUi } from './context'
import { useDocLocale, useDocTemplateId, useOrgTemplateId, useQuoteDocData, useQuoteTemplates } from './DocumentPreview'
import { TemplateThumb } from './TemplateThumb'

/** Cuántas ventanas se dibujan en cada miniatura (la hoja real las muestra todas). */
const THUMB_ITEMS = 3

interface Entry {
  id: string
  name: string
  description: string
  template: DocTemplate | undefined
  choice: TemplateChoice
  own: boolean
}

/** Los diseños DEKOPEN y las plantillas propias de la organización, en el idioma de la interfaz. */
export function useTemplateEntries(locale: Locale): { presets: Entry[]; own: Entry[] } {
  const t = useT(es)
  const list = useQuoteTemplates()
  return useMemo(() => {
    const presets = QUOTE_PRESET_IDS.map<Entry>((id) => ({
      id,
      name: presetName(id, locale),
      description: presetDescription(id, locale),
      template: getDocPreset(id),
      choice: id,
      own: false,
    }))
    const own = (list.data?.templates ?? []).map<Entry>((record) => ({
      id: record.id,
      name: record.name,
      description: t('doc.templateOwn'),
      template: record.template,
      choice: record.template,
      own: true,
    }))
    return { presets, own }
  }, [list.data, locale, t])
}

/** Dibuja solo cuando el elemento entra (o está por entrar) en pantalla. */
function useVisible<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '160px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  return [ref, visible]
}

/** Primera hoja del documento a escala del ancho disponible. */
const LivePage = memo(function LivePage({ data, entry, locale }: { data: QuoteDocData; entry: Entry; locale: Locale }) {
  const [ref, visible] = useVisible<HTMLDivElement>()
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const pageWidth = previewPageWidth(data, entry.choice)
  // Proporción de la hoja (carta 1 : 1,294 · A4 1 : 1,414).
  const ratio = pageWidth >= 780 ? 1.414 : 1.294
  const thumbData = useMemo(() => ({ ...data, items: data.items.slice(0, THUMB_ITEMS) }) as QuoteDocData, [data])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="overflow-hidden rounded-xs bg-white shadow-raised">
      <div ref={boxRef} className="relative w-full overflow-hidden" style={{ aspectRatio: `1 / ${ratio}` }}>
        {visible && width > 0 ? (
          <div
            aria-hidden
            inert
            className="pointer-events-none absolute top-0 left-0 origin-top-left select-none"
            style={{ width: pageWidth, height: pageWidth * ratio, overflow: 'hidden', transform: `scale(${width / pageWidth})` }}
          >
            <QuotePreview data={thumbData} template={entry.choice} locale={locale} />
          </div>
        ) : (
          <>
            <Skeleton className="absolute inset-0 rounded-none" />
            {/* Mientras llega la hoja, el esquema vectorial del diseño: nunca un hueco en blanco. */}
            <TemplateThumb template={entry.template} className="absolute inset-0 size-full opacity-60" />
          </>
        )}
      </div>
    </div>
  )
})

function Card({ entry, data, locale, selected, isOrgDefault, onPick }: { entry: Entry; data: QuoteDocData; locale: Locale; selected: boolean; isOrgDefault: boolean; onPick: () => void }) {
  const t = useT(es)
  return (
    <li>
      <button
        type="button"
        data-template-id={entry.id}
        aria-pressed={selected}
        onClick={onPick}
        className="group flex h-full w-full flex-col gap-2.5 text-left outline-none"
      >
        <div
          className={cn(
            'rounded-md bg-sunken p-4 transition-colors duration-100 group-hover:bg-hover group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus',
            selected && 'outline-2 -outline-offset-2 outline-accent',
          )}
        >
          <LivePage data={data} entry={entry} locale={locale} />
        </div>
        <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="min-w-0 truncate text-base font-medium text-fg-strong">{entry.name}</span>
            {selected ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-table text-fg-muted">
                <Check aria-hidden strokeWidth={2} className="size-3.5" />
                {t('doc.gallery.current')}
              </span>
            ) : isOrgDefault ? (
              <span className="shrink-0 text-table text-fg-muted">{t('doc.gallery.orgDefault')}</span>
            ) : null}
          </span>
          <span className="line-clamp-2 text-table text-fg-muted">{entry.description}</span>
        </span>
      </button>
    </li>
  )
}

export function TemplateGalleryDialog() {
  const t = useT(es)
  const editor = useEditor()
  const open = useEditorUi((s) => s.templateGalleryOpen)
  const setUi = useEditorUi((s) => s.set)
  const { locale: uiLocale } = useLocale()
  const { locale } = useDocLocale()
  const orgId = useOrgTemplateId()
  const value = useDocTemplateId()
  const { presets, own } = useTemplateEntries(uiLocale)
  const data = useQuoteDocData()

  const pick = (entry: Entry) => {
    editor.setDocumentOverride({ templateId: entry.id === orgId ? null : entry.id }, ql('history.template', { name: entry.name }))
    setUi({ templateGalleryOpen: false })
  }
  const group = (title: string, entries: Entry[]) =>
    entries.length ? (
      <section aria-label={title} className="pb-5">
        <h3 className="mb-2.5 text-meta font-medium text-fg-muted">{title}</h3>
        <ul role="list" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {entries.map((entry) => (
            <Card key={entry.id} entry={entry} data={data} locale={locale} selected={entry.id === value} isOrgDefault={entry.id === orgId} onPick={() => pick(entry)} />
          ))}
        </ul>
      </section>
    ) : null

  return (
    <Dialog open={open} onOpenChange={(o) => setUi({ templateGalleryOpen: o })}>
      {open ? (
        <DialogContent size="xl" title={t('doc.gallery.title')} description={t('doc.gallery.description')} className="h-[min(760px,calc(100dvh-32px))]">
          <style>{DOCUMENT_FONT_CSS()}</style>
          <div className="scrollbar-quiet -mx-6 -mb-1 min-h-0 flex-1 overflow-y-auto px-6">
            {group(t('doc.templatesOwn'), own)}
            {group(t('doc.templatesPreset'), presets)}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/** Botón que muestra el diseño en uso y abre la galería (reemplaza al selector de lista). */
export function TemplateGalleryButton({ className, block = false }: { className?: string; block?: boolean }) {
  const t = useT(es)
  const { locale } = useLocale()
  const setUi = useEditorUi((s) => s.set)
  const value = useDocTemplateId()
  const list = useQuoteTemplates()
  const name = isDocPresetId(value) ? presetName(value, locale) : (list.data?.templates.find((r) => r.id === value)?.name ?? value)
  const template = isDocPresetId(value) ? getDocPreset(value) : list.data?.templates.find((r) => r.id === value)?.template
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t('doc.gallery.openAria', { name })}
      onClick={() => setUi({ templateGalleryOpen: true })}
      className={cn(
        'inline-flex h-8 min-w-0 items-center gap-2 rounded-control border border-control bg-surface pr-2 pl-1.5 text-left text-table text-fg shadow-xs outline-none transition-[border-color,box-shadow] duration-100',
        'hover:border-control-hover focus-visible:border-focus focus-visible:shadow-[0_0_0_3px_var(--dk-focus-ring)] touch:h-11',
        block ? 'w-full' : 'w-52 max-w-full',
        className,
      )}
    >
      <TemplateThumb template={template} className="h-5 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <ChevronsUpDown aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0 text-fg-muted" />
    </button>
  )
}
