import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { BUILTIN_TEXTURE_IDS, BUILTIN_TEXTURES, TEXTURE_PATHS, TEXTURE_UPLOAD_LIMITS, type BuiltinTextureId } from '@dekopen/shared'
import { useFormat, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import { buttonClass, Notice, PlanGate, Skeleton } from '../../../ui'
import { FoilSwatch } from '../components/FoilSwatch'
import { FieldGroup, SectionHeader } from '../components/SectionHeader'
import es from '../i18n/es'
import { isMissingRoute } from '../lib/assistantsApi'
import { useTextureLibrary } from '../lib/libraryApi'

/** Dónde se suben y asignan las texturas (pestaña de TEXUP dentro del catálogo). */
export const COLORS_TAB_PATH = '/catalogo?tab=colores'

const GROUPS: { id: 'wood' | 'solid' | 'special'; ids: BuiltinTextureId[] }[] = [
  { id: 'wood', ids: BUILTIN_TEXTURE_IDS.filter((id) => BUILTIN_TEXTURES[id].finish === 'woodgrain') },
  { id: 'solid', ids: BUILTIN_TEXTURE_IDS.filter((id) => BUILTIN_TEXTURES[id].finish === 'smooth') },
  { id: 'special', ids: BUILTIN_TEXTURE_IDS.filter((id) => BUILTIN_TEXTURES[id].finish === 'textured' || BUILTIN_TEXTURES[id].finish === 'metallic') },
]

/** Texturas: la biblioteca incluida, las propias y el camino a Catálogo › Colores para subir y asignar. */
export function TexturesSection() {
  const t = useT(es)
  const fmt = useFormat()
  const plan = usePlan()
  const library = useTextureLibrary()
  const canUpload = plan?.has('texture_upload') ?? false

  return (
    <div>
      <SectionHeader
        title={t('textures.title')}
        description={t('textures.description')}
        aside={
          <Link to={COLORS_TAB_PATH} className={buttonClass('secondary', 'md')}>
            {t('textures.open')}
            <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-4" />
          </Link>
        }
      />
      <div className="flex flex-col gap-10">
        <FieldGroup
          id="textures-library"
          title={t('textures.library.title')}
          description={t('textures.library.description', { count: BUILTIN_TEXTURE_IDS.length })}
          footer={t('textures.library.footer')}
        >
          <div className="flex flex-col gap-6">
            {GROUPS.map((group) => (
              <div key={group.id}>
                <p className="mb-3 text-table text-fg-muted">{t(`textures.groups.${group.id}`)}</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 2xl:grid-cols-4">
                  {group.ids.map((id) => {
                    const texture = BUILTIN_TEXTURES[id]
                    return (
                      <li key={id} data-texture={id} className="flex min-w-0 items-center gap-3">
                        <FoilSwatch texture={texture} size={44} />
                        <div className="min-w-0">
                          <p className="truncate text-table text-fg-strong">{texture.names[t.locale]}</p>
                          <p className="truncate text-meta text-fg-muted">
                            {texture.ral ?? t(`textures.finish.${texture.finish}`)}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </FieldGroup>

        <FieldGroup
          id="textures-own"
          title={t('textures.own.title')}
          description={t('textures.own.description')}
          aside={
            library.data ? <span className="text-table text-fg-muted tabular">{t('textures.own.count', { count: library.data.total ?? library.data.items.length })}</span> : null
          }
        >
          {!canUpload ? (
            <PlanGate feature="texture_upload" variant="inline" />
          ) : library.isPending ? (
            <div className="flex gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="size-16" />
              ))}
            </div>
          ) : library.isError ? (
            <Notice tone="neutral" size="compact">
              {isMissingRoute(library.error) ? t('textures.own.unavailable') : t('textures.own.loadError')}
            </Notice>
          ) : library.data.items.length ? (
            <ul className="flex flex-wrap gap-3">
              {library.data.items.slice(0, 12).map((texture) => (
                <li key={texture.id} className="w-20">
                  <img
                    src={TEXTURE_PATHS.image(texture.thumbId ?? texture.id)}
                    alt=""
                    loading="lazy"
                    className="size-20 rounded-xs object-cover ring-1 ring-divider"
                  />
                  <p className="mt-1 truncate text-meta text-fg-muted" title={texture.name}>
                    {texture.name}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-table text-fg-muted">{t('textures.own.empty')}</p>
          )}
        </FieldGroup>

        <FieldGroup title={t('textures.how.title')} description={t('textures.how.description')}>
          <ul className="flex max-w-xl flex-col gap-3">
            {(
              [
                ['upload', { size: fmt.number(TEXTURE_UPLOAD_LIMITS.maxBytes / (1024 * 1024)) }],
                ['process', {}],
                ['assign', {}],
              ] as const
            ).map(([key, params]) => (
              <li key={key}>
                <p className="text-fg-strong">{t(`textures.how.steps.${key}.title`)}</p>
                <p className="text-table text-fg-muted">{t(`textures.how.steps.${key}.body`, params)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-xl text-table text-fg-muted">{t('textures.how.ai')}</p>
        </FieldGroup>
      </div>
    </div>
  )
}
