import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { DOC_PRESETS, presetName, resolveDocTemplateRef, type DocPresetId, type DocTemplateKind } from '@dekopen/shared'
import { useSettings } from '../../../lib/hooks'
import { useT } from '../../../lib/i18n'
import { buttonClass, Skeleton } from '../../../ui'
import { LoadError } from '../components/LoadError'
import { SectionHeader } from '../components/SectionHeader'
import es from '../i18n/es'
import { useOrgTemplates } from '../lib/libraryApi'

const KINDS: { kind: DocTemplateKind; field: 'quoteTemplate' | 'catalogTemplate' }[] = [
  { kind: 'quote', field: 'quoteTemplate' },
  { kind: 'catalog', field: 'catalogTemplate' },
]

/** Plantillas: cuál está en uso. Se eligen y se editan en Documentos. */
export function TemplatesSection() {
  const t = useT(es)
  const settings = useSettings()
  const orgTemplates = useOrgTemplates()

  const nameOf = (kind: DocTemplateKind, ref: unknown) => {
    const id = resolveDocTemplateRef(ref, kind).id
    if (id in DOC_PRESETS) return presetName(id as DocPresetId, t.locale)
    return orgTemplates.data?.find((tpl) => tpl.id === id)?.name ?? t('templates.ownTemplate')
  }

  return (
    <div className="max-w-xl">
      <SectionHeader
        title={t('templates.title')}
        description={t('templates.here')}
        aside={
          <Link to="/documentos" className={buttonClass('secondary', 'md')}>
            {t('templates.openGallery')}
            <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-4" />
          </Link>
        }
      />
      {settings.isError && !settings.data ? (
        <LoadError title={t('templates.loadError')} error={settings.error} onRetry={() => void settings.refetch()} />
      ) : !settings.data ? (
        <Skeleton className="h-24" />
      ) : (
        <dl className="divide-y divide-divider">
          {KINDS.map(({ kind, field }) => (
            <div key={kind} data-template-kind={kind} className="flex items-baseline justify-between gap-4 py-3 first:pt-0">
              <dt className="text-fg-strong">{t(`templates.kind.${kind}.title`)}</dt>
              <dd className="min-w-0 truncate text-fg-muted">{t.rich('templates.current', { name: nameOf(kind, settings.data?.documents?.[field]), b: <span className="text-fg" /> })}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
