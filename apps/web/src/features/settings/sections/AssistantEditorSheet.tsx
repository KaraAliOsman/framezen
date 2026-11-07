/**
 * Editor de asistente de respaldo (Ajustes). El editor completo vive en el panel del asistente
 * (BOT-UI, con el diseñador de avatar animado); este se abre solo si ese no responde, para que
 * «Editar» y «Nuevo asistente» nunca queden sin efecto. Crear pide un botón; editar se guarda solo.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import {
  ASSISTANT_LIMITS,
  ASSISTANT_MODES,
  ASSISTANT_TONES,
  AVATAR_PALETTE_IDS,
  AVATAR_PALETTES,
  AVATAR_SHAPES,
  DEFAULT_ASSISTANT_SCOPES,
  DEFAULT_AVATAR,
  LOCALE_META,
  LOCALES,
  TOOL_SCOPES,
  normalizeAvatarSpec,
  type AssistantLanguage,
  type AssistantMode,
  type AssistantPatchBody,
  type AssistantProfile,
  type AssistantTone,
  type AvatarSpec,
  type ToolScope,
} from '@dekopen/shared'
import { ApiRequestError, humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { Button, Checkbox, Field, Input, RadioCards, SaveIndicator, SegmentedControl, Select, Sheet, SheetContent, Switch, Textarea, toast, useShortcutText } from '../../../ui'
import { AssistantMark } from '../components/AssistantMark'
import { SaveError } from '../components/SectionHeader'
import es from '../i18n/es'
import { notifyAssistantsChanged } from '../lib/assistantBridge'
import { useCreateAssistant, usePatchAssistant, useAssistantStatus } from '../lib/assistantsApi'
import { useAutosave } from '../lib/useAutosave'

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

function fromProfile(profile: AssistantProfile | undefined): Draft {
  return {
    name: profile?.name ?? '',
    avatar: normalizeAvatarSpec(profile?.avatar ?? DEFAULT_AVATAR),
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

/** Lo que cambió respecto del perfil, en la forma del PATCH (sin `version`). */
export function draftPatch(draft: Draft, keys: readonly (keyof Draft)[]): Omit<AssistantPatchBody, 'version'> {
  const out: Omit<AssistantPatchBody, 'version'> = {}
  for (const key of keys) {
    if (key === 'tone' || key === 'instructions') out.personality = { tone: draft.tone, instructions: draft.instructions }
    else if (key === 'name') out.name = draft.name.trim()
    else (out as Record<string, unknown>)[key] = draft[key]
  }
  return out
}

export function AssistantEditorSheet({ open, assistant, onOpenChange }: { open: boolean; assistant?: AssistantProfile; onOpenChange: (open: boolean) => void }) {
  const t = useT(es)
  const panelKeys = useShortcutText('mod+j')
  const creating = !assistant
  const status = useAssistantStatus({ enabled: open })
  const create = useCreateAssistant()
  const patch = usePatchAssistant()
  const [draft, setDraft] = useState<Draft>(() => fromProfile(assistant))
  const draftRef = useRef(draft)
  const versionRef = useRef(assistant?.version ?? 1)
  const idRef = useRef(assistant?.id)

  // Al abrir (o cambiar de asistente) partimos de lo guardado.
  useEffect(() => {
    if (!open) return
    draftRef.current = fromProfile(assistant)
    setDraft(draftRef.current)
    versionRef.current = assistant?.version ?? 1
    idRef.current = assistant?.id
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o cambiar de asistente.
  }, [open, assistant?.id])

  const autosave = useAutosave<Omit<AssistantPatchBody, 'version'>>(
    async (body) => {
      const id = idRef.current
      if (!id) return
      try {
        const saved = await patch.mutateAsync({ id, patch: { ...body, version: versionRef.current } })
        versionRef.current = saved.version
        notifyAssistantsChanged()
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 409) throw new ApiRequestError(409, 'version_conflict', t('editor.conflict'))
        throw error
      }
    },
    { key: assistant ? `assistant:${assistant.id}` : undefined, delay: 700 },
  )

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    const next = { ...draftRef.current, [key]: value }
    draftRef.current = next
    setDraft(next)
    // El nombre vacío no se guarda: mientras lo reescribes, queda el anterior.
    if (!creating && (key !== 'name' || String(value).trim())) autosave.queue(draftPatch(next, [key]))
  }

  const allowedModes = status.data?.modes?.length ? status.data.modes : ASSISTANT_MODES
  const nameMissing = !draft.name.trim()

  const submit = () => {
    if (nameMissing) return
    create.mutate(
      {
        name: draft.name.trim(),
        avatar: draft.avatar,
        personality: { tone: draft.tone, instructions: draft.instructions },
        defaultMode: draft.defaultMode,
        scopes: draft.scopes,
        language: draft.language,
        visibility: draft.visibility,
        memoryEnabled: draft.memoryEnabled,
        isDefault: draft.isDefault,
      },
      {
        onSuccess: (profile) => {
          notifyAssistantsChanged()
          toast.success(t('editor.created', { name: profile.name }))
          onOpenChange(false)
        },
        onError: (error) => toast.error(error instanceof ApiRequestError && error.status === 402 ? t('editor.planLimit') : humanError(error)),
      },
    )
  }

  const toneOptions = useMemo(() => ASSISTANT_TONES.map((tone) => ({ value: tone, label: t(`tones.${tone}`) })), [t])
  const languageOptions = useMemo(
    () => [{ value: 'auto' as AssistantLanguage, label: t('assistants.languageAuto'), description: t('editor.languageAutoHint') }, ...LOCALES.map((l) => ({ value: l as AssistantLanguage, label: LOCALE_META[l].label }))],
    [t],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={creating ? t('editor.createTitle') : t('editor.editTitle', { name: assistant?.name ?? '' })}
        description={t('editor.description')}
        width={520}
        footer={
          creating ? (
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={submit} loading={create.isPending} disabled={nameMissing}>
                {t('editor.create')}
              </Button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} />
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {t('editor.done')}
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-6">
          <SaveError message={autosave.error} className="mb-0" />

          <section className="flex items-center gap-4 rounded-md border border-divider bg-sunken p-4">
            <AssistantMark spec={draft.avatar} size={64} title={draft.name || t('editor.previewTitle')} />
            <div className="min-w-0 flex-1">
              <Field label={t('editor.name')} hint={t('editor.nameHint')}>
                <Input value={draft.name} maxLength={ASSISTANT_LIMITS.nameMax} onChange={(e) => set('name', e.target.value)} placeholder={t('editor.namePlaceholder')} />
              </Field>
            </div>
          </section>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-table font-medium text-fg">{t('editor.appearance')}</legend>
            <div role="radiogroup" aria-label={t('editor.palette')} className="flex flex-wrap gap-2">
              {AVATAR_PALETTE_IDS.map((id) => {
                const selected = draft.avatar.palette === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t(`palettes.${id}`)}
                    title={t(`palettes.${id}`)}
                    onClick={() => set('avatar', { ...draft.avatar, palette: id, colors: undefined })}
                    className={cn(
                      'inline-flex size-8 items-center justify-center rounded-sm transition-transform duration-100 ease-out active:scale-95',
                      selected ? 'ring-2 ring-fg-strong ring-offset-2 ring-offset-raised' : 'hover:scale-105',
                    )}
                    style={{ background: AVATAR_PALETTES[id].body }}
                  >
                    {selected ? <Check aria-hidden strokeWidth={2.25} className="size-4" style={{ color: AVATAR_PALETTES[id].eye }} /> : null}
                  </button>
                )
              })}
            </div>
            <Select
              aria-label={t('editor.shape')}
              value={draft.avatar.shape}
              onValueChange={(shape) => set('avatar', { ...draft.avatar, shape })}
              options={AVATAR_SHAPES.map((shape) => ({ value: shape, label: t(`shapes.${shape}`) }))}
              className="w-56"
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-table font-medium text-fg">{t('editor.personality')}</legend>
            <Field label={t('editor.tone')}>
              <Select value={draft.tone} onValueChange={(tone) => set('tone', tone)} options={toneOptions} className="w-56" />
            </Field>
            <Field
              label={t('editor.instructions')}
              optional
              hint={t('editor.instructionsHint')}
              aside={<span className="tabular">{t('editor.counter', { used: draft.instructions.length, max: ASSISTANT_LIMITS.instructionsMax })}</span>}
            >
              <Textarea
                value={draft.instructions}
                maxLength={ASSISTANT_LIMITS.instructionsMax}
                onChange={(e) => set('instructions', e.target.value)}
                placeholder={t('editor.instructionsPlaceholder')}
                rows={4}
              />
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-table font-medium text-fg">{t('editor.mode')}</legend>
            <RadioCards
              aria-label={t('editor.mode')}
              value={draft.defaultMode}
              onValueChange={(mode) => set('defaultMode', mode)}
              columns={1}
              options={ASSISTANT_MODES.map((mode) => ({
                value: mode,
                title: t(`modes.${mode}.name`),
                description: t(`modes.${mode}.description`),
                disabled: !allowedModes.includes(mode),
              }))}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-table font-medium text-fg">{t('editor.scopes')}</legend>
            <p className="-mt-1 text-table text-fg-muted">{t('editor.scopesHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TOOL_SCOPES.map((scope) => (
                <Checkbox
                  key={scope}
                  label={t(`scopes.${scope}`)}
                  checked={draft.scopes.includes(scope)}
                  onCheckedChange={(checked) => set('scopes', checked ? [...new Set([...draft.scopes, scope])] : draft.scopes.filter((s) => s !== scope))}
                />
              ))}
            </div>
            {draft.scopes.length === 0 ? <p className="text-table text-warning">{t('editor.scopesNone')}</p> : null}
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-table font-medium text-fg">{t('editor.behaviour')}</legend>
            <Field label={t('editor.language')}>
              <Select value={draft.language} onValueChange={(language) => set('language', language)} options={languageOptions} className="w-64" />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-table font-medium text-fg">{t('editor.visibility')}</span>
              <SegmentedControl
                aria-label={t('editor.visibility')}
                value={draft.visibility}
                onValueChange={(visibility) => set('visibility', visibility)}
                options={[
                  { value: 'shared', label: t('editor.visibilityShared') },
                  { value: 'private', label: t('editor.visibilityPrivate') },
                ]}
              />
            </div>
            <Switch checked={draft.memoryEnabled} onCheckedChange={(on) => set('memoryEnabled', on)} label={t('editor.memory')} description={t('editor.memoryHint')} />
            <Switch checked={draft.isDefault} onCheckedChange={(on) => set('isDefault', on)} label={t('editor.default')} description={t('editor.defaultHint', { keys: panelKeys })} />
          </fieldset>
        </div>
      </SheetContent>
    </Sheet>
  )
}
