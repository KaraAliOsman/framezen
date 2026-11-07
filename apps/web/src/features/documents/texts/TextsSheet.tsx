/**
 * Textos comerciales de la empresa (presentación, condiciones, pago, garantía, plazo, vigencia,
 * firma y pie): se usan en todas las plantillas y cada cotización puede cambiarlos. Se guardan solos
 * en `OrgSettings.documents` (PATCH /api/settings) con deshacer por campo.
 */
import { useEffect, useRef, useState } from 'react'
import { PenLine } from 'lucide-react'
import type { DocumentPrefs } from '@dekopen/shared'
import { useMe, useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useLocale, useT } from '../../../lib/i18n'
import { Field, Input, Notice, NumberField, SaveIndicator, Sheet, SheetContent, Skeleton, Textarea } from '../../../ui'
import { useAutosave } from '../../catalog/useAutosave'
import { suggestedDocText, type DocSuggestedField } from '@dekopen/documents'
import { withDefaultPrefs } from '../model/prefs'
import es from '../i18n/es'

/** `null` borra un texto opcional (firma, pie) en el servidor. */
type TextPatch = Partial<Pick<DocumentPrefs, 'intro' | 'conditions' | 'paymentTerms' | 'warranty' | 'leadTimeText' | 'validityDays' | 'includes' | 'excludes'>> & { signatureName?: string | null; footer?: string | null }

export function TextsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(es)
  const { locale } = useLocale()
  const settings = useSettings()
  const me = useMe()
  const update = useUpdateSettings()
  const [draft, setDraft] = useState<DocumentPrefs | null>(null)
  const pending = useRef<TextPatch>({})
  const autosave = useAutosave<TextPatch>((patch) => update.mutateAsync({ documents: patch as unknown as DocumentPrefs }), 700, 'documents:texts')
  const canEdit = me.data?.role === 'owner' || !me.data?.billing.features?.includes('roles')

  useEffect(() => {
    if (open && settings.data) setDraft(withDefaultPrefs(settings.data.documents))
    // Al abrir se parte de lo guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings.data?.documents === undefined])

  const change = (patch: TextPatch) => {
    setDraft((d) => (d ? ({ ...d, ...patch, signatureName: patch.signatureName === null ? undefined : (patch.signatureName ?? d.signatureName), footer: patch.footer === null ? undefined : (patch.footer ?? d.footer) } as DocumentPrefs) : d))
    pending.current = { ...pending.current, ...patch }
    autosave.schedule(pending.current)
  }

  const prefs = draft
  // Ayuda explícita: solo con el campo vacío y solo si el taller la pide. Los compromisos vienen en blanco.
  const help = (field: DocSuggestedField) =>
    canEdit && prefs && !prefs[field]?.trim() ? (
      <button type="button" onClick={() => change({ [field]: suggestedDocText(field, locale) })} className="inline-flex items-center gap-1 rounded-xs text-meta font-medium text-accent hover:text-accent-hover">
        <PenLine aria-hidden className="size-3" strokeWidth={1.75} />
        {t('texts.useSuggested')}
      </button>
    ) : undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t('texts.title')} description={t('texts.description')} width={480} footer={<SaveIndicator status={autosave.status} savedAt={autosave.savedAt} />}>
        {!prefs ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {!canEdit ? <Notice tone="neutral" size="compact">{t('texts.readOnly')}</Notice> : null}
            <Notice tone="neutral" size="compact">
              {t('texts.empty')}
            </Notice>
            <Field label={t('texts.paymentTerms')} hint={t('texts.paymentHint')} aside={help('paymentTerms')}>
              <Input value={prefs.paymentTerms} readOnly={!canEdit} onChange={(e) => change({ paymentTerms: e.target.value })} maxLength={1000} />
            </Field>
            <Field label={t('texts.warranty')} aside={help('warranty')}>
              <Textarea value={prefs.warranty} readOnly={!canEdit} onChange={(e) => change({ warranty: e.target.value })} rows={2} maxLength={2000} />
            </Field>
            <Field label={t('texts.leadTimeText')} aside={help('leadTimeText')}>
              <Input value={prefs.leadTimeText} readOnly={!canEdit} onChange={(e) => change({ leadTimeText: e.target.value })} maxLength={500} />
            </Field>
            <div className="grid grid-cols-[140px_1fr] items-start gap-3">
              <Field label={t('texts.validityDays')}>
                <NumberField
                  value={prefs.validityDays > 0 ? prefs.validityDays : null}
                  disabled={!canEdit}
                  onChange={(v) => change({ validityDays: v === null ? 0 : Math.min(365, Math.max(1, Math.round(v))) })}
                  unit={t('texts.days')}
                  min={1}
                  max={365}
                  step={1}
                  bigStep={5}
                  decimals={0}
                />
              </Field>
              <p className="pt-7 text-meta text-fg-muted">{t('texts.validityHint')}</p>
            </div>
            <Field label={t('texts.includes')} aside={help('includes')}>
              <Textarea value={prefs.includes ?? ''} readOnly={!canEdit} onChange={(e) => change({ includes: e.target.value })} rows={2} maxLength={2000} />
            </Field>
            <Field label={t('texts.excludes')} aside={help('excludes')}>
              <Textarea value={prefs.excludes ?? ''} readOnly={!canEdit} onChange={(e) => change({ excludes: e.target.value })} rows={2} maxLength={2000} />
            </Field>
            <Field label={t('texts.conditions')} hint={t('texts.conditionsHint')} aside={help('conditions')}>
              <Textarea value={prefs.conditions} readOnly={!canEdit} onChange={(e) => change({ conditions: e.target.value })} rows={5} maxLength={8000} />
            </Field>
            <Field label={t('texts.intro')} hint={t('texts.introHint')} optional>
              <Textarea value={prefs.intro} readOnly={!canEdit} onChange={(e) => change({ intro: e.target.value })} rows={3} maxLength={4000} />
            </Field>
            <Field label={t('texts.signatureName')} optional>
              <Input value={prefs.signatureName ?? ''} readOnly={!canEdit} onChange={(e) => change({ signatureName: e.target.value || null })} placeholder={t('texts.signaturePlaceholder')} maxLength={120} />
            </Field>
            <Field label={t('texts.footer')} optional hint={t('texts.footerHint')}>
              <Input value={prefs.footer ?? ''} readOnly={!canEdit} onChange={(e) => change({ footer: e.target.value || null })} placeholder={t('texts.footerPlaceholder')} maxLength={500} />
            </Field>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
