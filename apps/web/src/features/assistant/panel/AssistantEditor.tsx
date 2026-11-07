/**
 * Editor de asistentes en tres pestañas: quién es (personaje, color, ojos, accesorio), cómo trabaja
 * (personalidad, modo al abrir, idioma) y qué puede hacer (ámbitos, quién lo usa, memoria). Respeta el tope del plan (lo dice y ofrece mejorar, nunca
 * un muro) y la versión (si alguien más lo editó, se carga su versión y se avisa).
 *
 * Se exporta para Ajustes › Asistentes (UI-SETTINGS) como `AssistantEditorDialog`.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ASSISTANT_LANGUAGES,
  ASSISTANT_LIMITS,
  ASSISTANT_MODES,
  ASSISTANT_TONES,
  DEFAULT_ASSISTANT_SCOPES,
  DEFAULT_AVATAR,
  LOCALE_META,
  TOOL_SCOPES,
  normalizeAvatarSpec,
  type AssistantLanguage,
  type AssistantMode,
  type AssistantProfile,
  type AssistantTone,
  type AvatarSpec,
  type Locale,
  type ToolScope,
} from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../../lib/api'
import { useT } from '../../../lib/i18n'
import { Button, Checkbox, Dialog, DialogContent, Field, Input, Notice, RadioCards, SegmentedControl, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, toast, toastUndo } from '../../../ui'
import { AvatarDesigner, randomAvatar } from '../avatar'
import es from '../i18n/es'
import { assistantApi } from '../v2/client'
import { assistantKeys, useAssistants } from '../v2/queries'

interface Draft {
  name: string
  avatar: AvatarSpec
  tone: AssistantTone
  instructions: string
  defaultMode: AssistantMode
  scopes: ToolScope[]
  language: AssistantLanguage
  visibility: 'private' | 'shared'
  memoryEnabled: boolean
  isDefault: boolean
}

function draftOf(profile: AssistantProfile | undefined, fallbackName: string): Draft {
  return {
    name: profile?.name ?? fallbackName,
    // Un asistente nuevo nace con su propio aspecto (no otro círculo antracita idéntico al de los demás).
    avatar: profile ? normalizeAvatarSpec(profile.avatar) : randomAvatar(DEFAULT_AVATAR),
    tone: profile?.personality.tone ?? 'friendly',
    instructions: profile?.personality.instructions ?? '',
    defaultMode: profile?.defaultMode ?? 'supervised',
    scopes: profile?.scopes ?? [...DEFAULT_ASSISTANT_SCOPES],
    language: profile?.language ?? 'auto',
    visibility: profile?.visibility ?? 'shared',
    memoryEnabled: profile?.memoryEnabled ?? true,
    isDefault: profile?.isDefault ?? false,
  }
}

export interface AssistantEditorDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** Sin id = crear uno nuevo. */
  assistantId?: string
  /** Tras guardar o crear (por ejemplo, para elegirlo en el panel). */
  onSaved?(profile: AssistantProfile): void
  mobile?: boolean
}

export function AssistantEditorDialog({ open, onOpenChange, assistantId, onSaved }: AssistantEditorDialogProps) {
  const t = useT(es)
  const client = useQueryClient()
  const assistants = useAssistants(open)
  const profile = assistantId ? assistants.data?.items.find((a) => a.id === assistantId) : undefined
  const creating = !assistantId
  const [draft, setDraft] = useState<Draft>(() => draftOf(profile, ''))
  const [version, setVersion] = useState<number | undefined>(profile?.version)
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [notice, setNotice] = useState<'conflict' | 'limit' | null>(null)
  const [tab, setTab] = useState('look')
  const limit = assistants.data?.limit
  const used = assistants.data?.used ?? 0
  const atLimit = creating && limit !== undefined && used >= limit
  const readOnly = Boolean(profile && !profile.canEdit)

  // Al abrir (o al llegar el perfil), el borrador parte del perfil guardado.
  useEffect(() => {
    if (!open) return
    setDraft(draftOf(profile, creating ? '' : t('defaultName')))
    setVersion(profile?.version)
    setNotice(null)
    setNameError(false)
    setTab('look')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.id, profile?.version])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    const name = draft.name.trim()
    if (!name) {
      setNameError(true)
      setTab('look')
      return
    }
    setSaving(true)
    const body = {
      name: name.slice(0, ASSISTANT_LIMITS.nameMax),
      avatar: draft.avatar,
      personality: { tone: draft.tone, instructions: draft.instructions.slice(0, ASSISTANT_LIMITS.instructionsMax) },
      defaultMode: draft.defaultMode,
      scopes: draft.scopes,
      language: draft.language,
      visibility: draft.visibility,
      memoryEnabled: draft.memoryEnabled,
      isDefault: draft.isDefault,
    }
    try {
      const saved = creating ? await assistantApi.assistants.create(body) : await assistantApi.assistants.patch(assistantId!, { ...body, version: version ?? 1 })
      await client.invalidateQueries({ queryKey: assistantKeys.assistants })
      void client.invalidateQueries({ queryKey: assistantKeys.status })
      toast.success(creating ? t('editor.created', { name: saved.name }) : t('editor.saved', { name: saved.name }))
      onSaved?.(saved)
      onOpenChange(false)
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 409 || error.code === 'version_conflict')) {
        setNotice('conflict')
        await client.invalidateQueries({ queryKey: assistantKeys.assistants })
      } else if (error instanceof ApiRequestError && (error.status === 402 || error.code === 'plan_limit')) {
        setNotice('limit')
      } else {
        toast.error(humanError(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!profile) return
    try {
      await assistantApi.assistants.remove(profile.id)
      await client.invalidateQueries({ queryKey: assistantKeys.assistants })
      onOpenChange(false)
      toastUndo(t('editor.archived', { name: profile.name }), () => {
        void assistantApi.assistants.restore(profile.id).then(() => client.invalidateQueries({ queryKey: assistantKeys.assistants }), () => undefined)
      })
    } catch (error) {
      toast.error(humanError(error))
    }
  }

  const languageOptions = ASSISTANT_LANGUAGES.map((l) => ({ value: l, label: l === 'auto' ? t('editor.languageAuto') : LOCALE_META[l as Locale].label }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        title={creating ? t('editor.titleNew') : t('editor.titleEdit', { name: profile?.name ?? draft.name })}
        description={t('editor.description')}
        preventOutsideClose
        footer={
          <>
            {!creating && profile?.canEdit && !profile.isDefault && (
              <Button variant="ghost" className="mr-auto" onClick={() => void archive()}>
                {t('editor.archive')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('editor.cancel')}
            </Button>
            <Button variant="primary" loading={saving} disabled={readOnly || atLimit} onClick={() => void save()}>
              {creating ? t('editor.create') : t('editor.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {assistants.isError && <Notice tone="neutral" size="compact">{t('editor.unavailable')}</Notice>}
          {(atLimit || notice === 'limit') && (
            <Notice
              tone="warning"
              action={
                <Button asChild size="xs" variant="ghost">
                  <Link to="/ajustes/plan" onClick={() => onOpenChange(false)}>
                    {t('editor.seePlan')}
                  </Link>
                </Button>
              }
            >
              {t('editor.limit', { limit: limit ?? 0 })}
            </Notice>
          )}
          {notice === 'conflict' && <Notice tone="warning">{t('editor.conflict')}</Notice>}
          {readOnly && <Notice tone="neutral" size="compact">{t('editor.readOnly')}</Notice>}

          <Field label={t('editor.name')} hint={t('editor.nameHint')} error={nameError ? t('editor.nameRequired') : undefined} className="max-w-sm">
            <Input
              value={draft.name}
              maxLength={ASSISTANT_LIMITS.nameMax}
              disabled={readOnly}
              autoFocus={creating}
              onChange={(e) => {
                set('name', e.target.value)
                if (e.target.value.trim()) setNameError(false)
              }}
            />
          </Field>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="look">{t('editor.sections.look')}</TabsTrigger>
              <TabsTrigger value="behavior">{t('editor.sections.behavior')}</TabsTrigger>
              <TabsTrigger value="access">{t('editor.sections.access')}</TabsTrigger>
            </TabsList>

            <TabsContent value="look">
              <AvatarDesigner value={draft.avatar} onChange={(avatar) => set('avatar', normalizeAvatarSpec(avatar))} name={draft.name || t('defaultName')} disabled={readOnly} />
            </TabsContent>

            <TabsContent value="behavior">
              <fieldset className="max-w-2xl space-y-4" disabled={readOnly}>
                <div>
                  <p className="mb-2 text-table font-medium text-fg-muted">{t('editor.tone')}</p>
                  <RadioCards<AssistantTone>
                    aria-label={t('editor.tone')}
                    columns={2}
                    value={draft.tone}
                    onValueChange={(tone) => set('tone', tone)}
                    options={ASSISTANT_TONES.map((tone) => ({ value: tone, title: t(`editor.tones.${tone}`), description: t(`editor.toneHints.${tone}`) }))}
                  />
                </div>
                <Field
                  label={t('editor.instructions')}
                  hint={t('editor.instructionsHint')}
                  aside={<span className="text-meta text-fg-muted tabular">{t('editor.counter', { count: draft.instructions.length, max: ASSISTANT_LIMITS.instructionsMax })}</span>}
                >
                  <Textarea
                    rows={3}
                    value={draft.instructions}
                    maxLength={ASSISTANT_LIMITS.instructionsMax}
                    placeholder={t('editor.instructionsPlaceholder')}
                    onChange={(e) => set('instructions', e.target.value)}
                  />
                </Field>
                <div>
                  <p className="mb-2 text-table font-medium text-fg-muted">{t('editor.defaultMode')}</p>
                  <SegmentedControl<AssistantMode>
                    block
                    value={draft.defaultMode}
                    onValueChange={(mode) => set('defaultMode', mode)}
                    aria-label={t('editor.defaultMode')}
                    options={ASSISTANT_MODES.map((m) => ({ value: m, label: t(`modes.${m}`) }))}
                  />
                  <p className="mt-1.5 text-meta text-fg-muted">{t(`modes.${draft.defaultMode}Hint`)}</p>
                </div>
                <Field label={t('editor.language')}>
                  <Select value={draft.language} onValueChange={(language) => set('language', language)} options={languageOptions} />
                </Field>
              </fieldset>
            </TabsContent>

            <TabsContent value="access">
              <fieldset className="max-w-2xl space-y-4" disabled={readOnly}>
                <div>
                  <p className="text-table font-medium text-fg-muted">{t('editor.scopes')}</p>
                  <p className="mb-2 text-meta text-fg-muted">{t('editor.scopesHint')}</p>
                  <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {TOOL_SCOPES.map((scope) => (
                      <Checkbox
                        key={scope}
                        label={t(`editor.scope.${scope}`)}
                        checked={draft.scopes.includes(scope)}
                        onCheckedChange={(on) => set('scopes', on ? [...new Set([...draft.scopes, scope])] : draft.scopes.filter((s) => s !== scope))}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-table font-medium text-fg-muted">{t('editor.visibility')}</p>
                  <RadioCards<'shared' | 'private'>
                    aria-label={t('editor.visibility')}
                    columns={2}
                    value={draft.visibility}
                    onValueChange={(visibility) => set('visibility', visibility)}
                    options={[
                      { value: 'shared', title: t('editor.visibilityShared'), description: t('editor.visibilitySharedHint') },
                      { value: 'private', title: t('editor.visibilityPrivate'), description: t('editor.visibilityPrivateHint') },
                    ]}
                  />
                </div>
                <Switch label={t('editor.memory')} description={t('editor.memoryHint')} checked={draft.memoryEnabled} onCheckedChange={(on) => set('memoryEnabled', on)} />
                <Switch label={t('editor.isDefault')} checked={draft.isDefault} onCheckedChange={(on) => set('isDefault', on)} />
              </fieldset>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
