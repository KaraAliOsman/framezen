/**
 * Franja sobre la hoja de una cotización: vista final, secciones ocultas y qué pasa con lo cambiado.
 * Todo cambio queda solo en la cotización; desde aquí se decide llevarlo a la plantilla.
 */
import { useState } from 'react'
import { Eye, MoreHorizontal } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  compactQuoteDocOverrides,
  promoteOverridesToTemplate,
  sectionLabel,
  type DocOp,
  type DocTemplate,
  type DocTemplateRecord,
  type DocumentPrefs,
  type QuoteDocOverridesV2,
} from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../../lib/api'
import { useMe, useUpdateSettings } from '../../../lib/hooks'
import { useLocale, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, toast } from '../../../ui'
import { templateKeys, templatesApi, useTemplateMutations } from '../api'
import es from '../i18n/es'
import { QUOTE_TEXT_FIELDS, normalizeOverrides, templateChangeCount } from './model'

export interface DocScopeProps {
  /** Plantilla sobre la que está la cotización. */
  base: DocTemplate
  /** Su registro si es una plantilla propia (un estilo DEKOPEN no se modifica). */
  record?: DocTemplateRecord
  /** Plantilla con los ajustes de la cotización. */
  resolved: DocTemplate
  overrides: unknown
  final: boolean
  onFinal: (final: boolean) => void
  onOps: (ops: DocOp[]) => void
  onReplace: (next: QuoteDocOverridesV2 | null, label: string) => void
  canSave: boolean
}

export function DocScope({ base, record, resolved, overrides, final, onFinal, onOps, onReplace, canSave }: DocScopeProps) {
  const t = useT(es)
  const { locale } = useLocale()
  const client = useQueryClient()
  const mutations = useTemplateMutations()
  const updateSettings = useUpdateSettings()
  const me = useMe()
  const plan = usePlan()
  const [busy, setBusy] = useState(false)
  const count = templateChangeCount(overrides)
  const hidden = resolved.sections.filter((s) => !s.enabled && s.type !== 'page_break')
  const manager = me.data?.role === 'owner' || !plan?.has('roles')
  const own = record && !record.builtin ? record : undefined
  const allowed = canSave && manager && !plan?.readOnly

  /** Lleva la presentación a la plantilla y los textos a los de la empresa; aquí queda lo demás. */
  const promote = async (asNew: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      const current = normalizeOverrides(overrides)
      const { template, rest } = promoteOverridesToTemplate(base, current)
      const texts = Object.fromEntries(QUOTE_TEXT_FIELDS.flatMap((field) => (current.texts?.[field] !== undefined ? [[field, current.texts[field]]] : [])))
      if (Object.keys(texts).length) {
        await updateSettings.mutateAsync({ documents: texts as unknown as DocumentPrefs })
        const left = Object.fromEntries(Object.entries(rest.texts ?? {}).filter(([field]) => !(field in texts)))
        rest.texts = left
      }
      let next: QuoteDocOverridesV2 = rest
      let message: string
      if (own && !asNew) {
        await templatesApi.save(own.id, template, own.version)
        message = t('scope.saved', { name: own.name })
      } else {
        const name = t('scope.newName', { name: base.name }).slice(0, 80)
        const created = await mutations.create.mutateAsync({ kind: base.kind, template: { ...template, name }, name })
        next = { ...rest, templateId: created.id }
        message = t('scope.savedNew', { name: created.name })
      }
      await client.invalidateQueries({ queryKey: templateKeys.all })
      const compact = compactQuoteDocOverrides(next)
      onReplace(Object.keys(compact).every((k) => k === 'v') ? null : compact, t('scope.saveToTemplate'))
      toast.success(message)
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        void client.invalidateQueries({ queryKey: templateKeys.all })
        toast.warning(t('scope.conflict'))
      } else toast.error(humanError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-8 max-w-[816px] flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3" data-doc-scope="">
      <Button size="xs" variant={final ? 'secondary' : 'ghost'} icon={Eye} aria-pressed={final} onClick={() => onFinal(!final)}>
        {t('canvas.finalView')}
      </Button>
      {hidden.length && !final ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost">
              {t('scope.hidden', { count: hidden.length })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {hidden.map((s) => {
              const name = s.title?.trim() || sectionLabel(s.type, locale)
              return (
                <DropdownMenuItem key={s.id} icon={Eye} onSelect={() => onOps([{ op: 'toggleSection', sectionId: s.id, enabled: true }])}>
                  {t('canvas.showEl', { name })}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {count ? (
        <div className="ml-auto flex items-center gap-1">
          <span className="text-table text-fg-muted">{t('scope.changes', { count })}</span>
          {allowed ? (
            <Button size="xs" variant="secondary" loading={busy} onClick={() => void promote(!own)}>
              {own ? t('scope.saveToTemplate') : t('scope.saveAsNew')}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={MoreHorizontal} size="xs" label={t('scope.more')} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allowed && own ? <DropdownMenuItem onSelect={() => void promote(true)}>{t('scope.saveAsNew')}</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={() => onOps([{ op: 'reset', scope: 'sections' }, { op: 'reset', scope: 'theme' }, { op: 'reset', scope: 'page' }, { op: 'reset', scope: 'settings' }, { op: 'reset', scope: 'items' }, { op: 'reset', scope: 'texts' }])}>{t('scope.discard')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  )
}
