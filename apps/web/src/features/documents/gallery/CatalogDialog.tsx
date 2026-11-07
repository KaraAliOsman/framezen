/**
 * Generar el catálogo de productos en PDF: líneas a incluir, título de portada y plantilla. El PDF lo
 * arma el servidor (mismo renderizador); si no puede, se imprime desde el navegador.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { FileDown } from 'lucide-react'
import { CatalogDocument } from '@dekopen/documents'
import type { DocLocale, DocTemplateRecord } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useCatalog, useMe, useSettings } from '../../../lib/hooks'
import { useT } from '../../../lib/i18n'
import { Button, Checkbox, Dialog, DialogContent, Field, Input, Select, toast } from '../../../ui'
import { catalogDocFromCatalog, toDocOrg } from '../model/docData'
import { withDefaultPrefs } from '../model/prefs'
import { downloadPdf, fileSlug, printDocument } from '../output'
import es from '../i18n/es'

export function CatalogDialog({ open, onOpenChange, templates, defaultId }: { open: boolean; onOpenChange: (open: boolean) => void; templates: DocTemplateRecord[]; defaultId: string }) {
  const t = useT(es)
  const catalog = useCatalog()
  const settings = useSettings()
  const me = useMe()
  const lines = catalog.data?.lines ?? []
  const partial = useMemo(() => new Set(lines.filter((l) => l.completeness === 'partial').map((l) => l.id)), [lines])
  const [excluded, setExcluded] = useState<Set<string> | null>(null)
  const skip = excluded ?? (partial.size < lines.length ? partial : new Set<string>())
  const lineIds = lines.map((l) => l.id).filter((id) => !skip.has(id))
  const [title, setTitle] = useState('')
  const [templateId, setTemplateId] = useState(defaultId)
  const [busy, setBusy] = useState(false)
  const brands = new Map((catalog.data?.brands ?? []).map((b) => [b.id, b.name]))
  const chosen = templates.find((r) => r.id === templateId) ?? templates.find((r) => r.id === defaultId) ?? templates[0]

  const download = async () => {
    if (!catalog.data || !settings.data || !me.data) return
    setBusy(true)
    const coverTitle = title.trim() || t('catalog.defaultTitle')
    const query = new URLSearchParams({ template: chosen?.id ?? defaultId })
    if (lineIds.length !== lines.length || lineIds.some((id) => partial.has(id))) query.set('lines', lineIds.join(','))
    if (title.trim()) query.set('title', title.trim().slice(0, 120))
    const ok = await downloadPdf(`/api/catalog/pdf?${query.toString()}`, `${fileSlug(`${coverTitle} ${me.data.org.name}`)}.pdf`)
    if (ok) {
      toast.success(t('catalog.downloaded'))
      setBusy(false)
      onOpenChange(false)
      return
    }
    try {
      const ctx = { catalog: catalog.data, pricing: settings.data.pricing, cut: settings.data.cut, org: toDocOrg(me.data.org), defaults: settings.data.defaults, prefs: withDefaultPrefs(settings.data.documents) }
      const data = { ...catalogDocFromCatalog(ctx, { lineIds }), title: coverTitle }
      await printDocument(
        <CatalogDocument data={data} template={chosen?.id} spec={chosen && !chosen.builtin ? chosen.template : undefined} locale={(settings.data.locale ?? 'es') as DocLocale} currency={settings.data.currency} taxLabel={settings.data.taxLabel} />,
        { title: coverTitle },
      )
      toast.info(t('catalog.printFallback'), { id: 'pdf-fallback' })
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={t('catalog.title')}
        description={t('catalog.description')}
        footer={
          <Button variant="primary" icon={FileDown} loading={busy} disabled={!lineIds.length} onClick={() => void download()}>
            {t('catalog.download')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('catalog.template')}>
              <Select value={chosen?.id} onValueChange={setTemplateId} options={templates.map((r) => ({ value: r.id, label: r.name }))} />
            </Field>
            <Field label={t('catalog.coverTitle')}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('catalog.defaultTitle')} maxLength={120} />
            </Field>
          </div>
          {lines.length ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-table font-medium text-fg">
                  {t('catalog.lines')} <span className="num font-normal text-fg-muted">· {t('catalog.summary', { lines: lineIds.length })}</span>
                </span>
                <button type="button" className="rounded-xs text-table font-medium text-accent hover:text-accent-hover" onClick={() => setExcluded(skip.size ? new Set() : new Set(lines.map((l) => l.id)))}>
                  {skip.size ? t('catalog.all') : t('catalog.none')}
                </button>
              </div>
              <ul className="scrollbar-quiet flex max-h-72 flex-col overflow-y-auto rounded-panel border border-divider">
                {lines.map((line) => (
                  <li key={line.id} className="border-b border-divider px-3 py-2 last:border-b-0">
                    <Checkbox
                      checked={!skip.has(line.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(skip)
                        if (v) next.delete(line.id)
                        else next.add(line.id)
                        setExcluded(next)
                      }}
                      label={line.name}
                      description={`${brands.get(line.brandId) ?? ''} · ${t(`catalog.kind.${line.kind === 'sliding' ? 'sliding' : 'casement'}`)}${partial.has(line.id) ? ` · ${t('catalog.partial')}` : ''}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-panel bg-sunken px-3 py-3 text-table text-fg-muted">
              {t('catalog.noLines')}{' '}
              <Link to="/catalogo" className="font-medium text-accent hover:text-accent-hover">
                {t('catalog.goCatalog')}
              </Link>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
