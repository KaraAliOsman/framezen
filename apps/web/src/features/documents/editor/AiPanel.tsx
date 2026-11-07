/**
 * «Pedir a la IA»: la persona describe la plantilla; la IA propone una completa (JSON validado en el
 * servidor, nunca HTML). La propuesta se muestra como cambios legibles + antes/después; nada se
 * aplica hasta que la persona acepta, y aplicar es un solo paso de deshacer.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import {
  DOC_LOCALES,
  LOCALE_META,
  docIssueMessage,
  fontPairLabel,
  paletteRoleLabel,
  sectionLabel,
  type DocIssue,
  type DocLocale,
  type DocTemplate,
  type DocTemplateGenerateResponse,
  type DocTemplateKind,
} from '@dekopen/shared'
import { useQueryClient } from '@tanstack/react-query'
import { ApiRequestError, humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import { qk } from '../../../lib/queryClient'
import { Badge, Button, Notice, PlanGate, Select, Textarea } from '../../../ui'
import { templatesApi } from '../api'
import { diffTemplates, type TemplateChange } from '../model/diff'
import es from '../i18n/es'

export interface AiProposal {
  template: DocTemplate
  changes: TemplateChange[]
  credits: number
  issues: DocIssue[]
}

export interface AiPanelProps {
  kind: DocTemplateKind
  /** Plantilla de partida (la que se edita o el estilo elegido). */
  base: DocTemplate
  /** Id con que el servidor carga la base (plantilla propia guardada o estilo). */
  baseId?: string
  canGenerate: boolean
  /** Muestra la propuesta como antes/después con este componente (miniaturas). */
  renderThumb?: (template: DocTemplate) => ReactNode
  onApply?: (proposal: AiProposal) => void
  onSaveAsNew?: (proposal: AiProposal) => void
  className?: string
  autoFocus?: boolean
}

const EXAMPLES = ['minimal', 'cover', 'brand', 'technical'] as const

export function AiPanel({ kind, base, baseId, canGenerate, renderThumb, onApply, onSaveAsNew, className, autoFocus }: AiPanelProps) {
  const t = useT(es)
  const { locale } = useLocale()
  const plan = usePlan()
  const client = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [docLocale, setDocLocale] = useState<DocLocale>(locale as DocLocale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<AiProposal | null>(null)
  const abort = useRef<AbortController | null>(null)

  const generate = async () => {
    const text = prompt.trim()
    if (text.length < 3 || busy) return
    setBusy(true)
    setError(null)
    setProposal(null)
    const controller = new AbortController()
    abort.current = controller
    try {
      const res: DocTemplateGenerateResponse = await templatesApi.generate({ kind, prompt: text, ...(baseId ? { baseTemplateId: baseId } : {}), locale: docLocale }, controller.signal)
      // La IA gastó créditos (también si la propuesta no sirvió): el indicador del plan se pone al día.
      void client.invalidateQueries({ queryKey: qk.me })
      if (!res.ok) {
        setError(res.reason === 'truncated' ? t('ai.truncated') : t('ai.invalid'))
        return
      }
      const template: DocTemplate = { ...res.template, id: base.id }
      setProposal({ template, changes: diffTemplates(base, template), credits: res.credits, issues: res.issues })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof ApiRequestError && err.status === 503) setError(t('ai.unavailable'))
      else setError(humanError(err))
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const hasAi = plan?.has('assistant') && plan.has('custom_templates')
  if (plan && !hasAi) {
    return (
      <div className={cn('p-4', className)}>
        <PlanGate feature="custom_templates" variant="card" preview={false} />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3 p-4', className)}>
      {!proposal ? (
        <>
          <p className="text-table text-fg-muted">{t('ai.intro')}</p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 1200))}
            placeholder={t('ai.placeholder')}
            rows={4}
            autoFocus={autoFocus}
            disabled={busy || !canGenerate}
            aria-label={t('ai.title')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void generate()
              }
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((key) => (
              <button
                key={key}
                type="button"
                disabled={busy || !canGenerate}
                onClick={() => setPrompt((p) => (p.trim() ? `${p.trim()}. ${t(`ai.examples.${key}`)}` : t(`ai.examples.${key}`)))}
                className="h-7 rounded-xs border border-divider px-2 text-table text-fg-muted transition-colors duration-100 hover:border-divider-strong hover:text-fg disabled:opacity-50"
              >
                {t(`ai.examples.${key}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-table text-fg-muted">
              {t('ai.language')}
              <Select size="sm" className="w-36" value={docLocale} onValueChange={(v) => setDocLocale(v as DocLocale)} options={DOC_LOCALES.map((l) => ({ value: l, label: LOCALE_META[l].label }))} />
            </label>
          </div>
          {!canGenerate ? <Notice tone="neutral" size="compact">{t('ai.unavailable')}</Notice> : null}
          {error ? (
            <Notice tone="warning" size="compact">
              {error}
            </Notice>
          ) : null}
          <div className="flex items-center justify-end gap-3">
            {busy ? (
              <Button size="sm" variant="ghost" icon={X} onClick={() => abort.current?.abort()}>
                {t('ai.cancel')}
              </Button>
            ) : null}
          </div>
          <Button variant="primary" loading={busy} disabled={!canGenerate || prompt.trim().length < 3} onClick={() => void generate()} shortcut="mod+enter">
            {busy ? t('ai.generating') : t('ai.generate')}
          </Button>
        </>
      ) : (
        <ProposalView proposal={proposal} base={base} locale={locale} renderThumb={renderThumb} onApply={onApply} onSaveAsNew={onSaveAsNew} onDiscard={() => setProposal(null)} />
      )}
    </div>
  )
}

function ProposalView({
  proposal,
  base,
  locale,
  renderThumb,
  onApply,
  onSaveAsNew,
  onDiscard,
}: {
  proposal: AiProposal
  base: DocTemplate
  locale: string
  renderThumb?: (template: DocTemplate) => ReactNode
  onApply?: (p: AiProposal) => void
  onSaveAsNew?: (p: AiProposal) => void
  onDiscard: () => void
}) {
  const t = useT(es)
  const lines = useMemo(() => proposal.changes.map((c) => describeChange(c, t, locale)), [proposal.changes, t, locale])
  const warnings = proposal.issues.filter((i) => i.severity === 'warning').slice(0, 3)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h4 font-medium text-fg-strong">{t('ai.resultTitle')}</h3>
        <Badge tone="accent" size="sm">
          {t('ai.changes', { count: proposal.changes.length })}
        </Badge>
      </div>
      {renderThumb ? (
        <div className="grid grid-cols-2 gap-2">
          <figure className="flex flex-col gap-1">
            <div className="overflow-hidden rounded-xs border border-divider bg-sunken p-1.5">{renderThumb(base)}</div>
            <figcaption className="text-meta text-fg-muted">{t('ai.before')}</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <div className="overflow-hidden rounded-xs border border-accent-line bg-sunken p-1.5">{renderThumb(proposal.template)}</div>
            <figcaption className="text-meta font-medium text-accent-ink">{t('ai.after')}</figcaption>
          </figure>
        </div>
      ) : null}
      {proposal.changes.length ? (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-sm border border-divider bg-sunken p-2.5">
          {lines.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-table text-fg">
              <ArrowRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={2} />
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Notice tone="neutral" size="compact">
          {t('ai.noChanges')}
        </Notice>
      )}
      {warnings.length ? (
        <ul className="text-meta text-fg-muted">
          {warnings.map((w, i) => (
            <li key={i}>{w.message || docIssueMessage(w, locale)}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {onApply ? (
          <Button variant="primary" icon={Check} disabled={!proposal.changes.length} onClick={() => onApply(proposal)}>
            {t('ai.apply')}
          </Button>
        ) : null}
        {onSaveAsNew ? (
          <Button variant={onApply ? 'secondary' : 'primary'} onClick={() => onSaveAsNew(proposal)}>
            {t('ai.applyAsNew')}
          </Button>
        ) : null}
        <Button variant="ghost" icon={RotateCcw} onClick={onDiscard}>
          {t('ai.discard')}
        </Button>
      </div>
    </div>
  )
}

type Tr = ReturnType<typeof useT<typeof es>>

/** Una línea legible por cambio (en el idioma de la interfaz). */
export function describeChange(change: TemplateChange, t: Tr, locale: string): ReactNode {
  switch (change.kind) {
    case 'name':
      return t('ai.change.name', { before: change.before, after: change.after })
    case 'color':
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {t('ai.change.color', { role: paletteRoleLabel(change.role, locale) })}
          <Chip hex={change.before} />
          <ArrowRight aria-hidden className="size-3 text-fg-faint" />
          <Chip hex={change.after} />
        </span>
      )
    case 'fonts':
      return t('ai.change.fonts', { after: fontPairLabel(change.after) })
    case 'theme': {
      const label = t(`theme.${change.key}` as 'theme.density')
      const k = `theme.values.${change.key}.${change.after}`
      const after = t.has(k) ? t(k as 'theme.values.density.airy') : String(change.after)
      return t('ai.change.theme', { key: label, after })
    }
    case 'page':
      return t('ai.change.page', { key: t(`ai.pageKeys.${change.key}`) })
    case 'sectionAdded':
    case 'sectionRemoved':
    case 'sectionShown':
    case 'sectionHidden':
    case 'sectionChanged':
      return t(`ai.change.${change.kind}`, { section: change.section.title?.trim() || sectionLabel(change.section.type, locale) })
    case 'order':
      return t('ai.change.order')
  }
}

function Chip({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className="inline-block size-3 rounded-xs border border-divider-strong" style={{ background: hex }} />
      <span className="code-id text-meta text-fg-muted">{hex}</span>
    </span>
  )
}
