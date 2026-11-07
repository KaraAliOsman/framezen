/**
 * Compositor del asistente: textarea que crece de 1 a 6 líneas con texto fantasma del autocompletado
 * (Tab o → lo aceptan), lista de sugerencias encima (↑↓, Enter elige, Esc cierra) y, debajo, lo que
 * va a pasar al pulsar Enter: «Entendí: …» (comando local, gratis) o «Preguntar a {asistente}» (IA). Dictado en el idioma de la interfaz. Nunca se deshabilita mientras el asistente
 * trabaja: escribir algo nuevo corta lo anterior.
 */
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, Blinds, CalendarDays, Compass, CornerDownLeft, FileText, Hash, History, LayoutTemplate, Languages, MessageSquare, Mic, Paperclip, ShieldCheck, Square, SunMoon, TriangleAlert, UserRound, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AvatarSpec, TurnAttachment } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { floatingClass, Kbd, KbdHint, Tooltip } from '../../../ui'
import { IconFoil, IconFrame, IconGlass, IconProfileSection, IconSash } from '../../../ui/icons'
import es from '../i18n/es'
import { recordUse } from '../local/frecency'
import { isConfident, type LocalInterpreter, type LocalParse, type Suggestion, type SuggestionKind } from '../local/interpreter'
import { emitBotReaction } from '../avatar/reactions'
import { useAssistantPanel } from '../store'
import { useDictation } from '../useDictation'
import { useAttachments } from '../attachments/useAttachments'
import type { AttachmentView } from '../attachments/types'
import { AttachmentDrafts } from './Attachments'
import { BotFace } from './BotFace'

export interface ComposerHandle {
  focus(): void
  element(): HTMLTextAreaElement | null
  /** Archivos que llegaron de otra parte (soltados sobre el panel). */
  addFiles(files: Iterable<File>): void
}

export interface ComposerProps {
  value: string
  onChange(value: string): void
  /** Enter: con el plan local ya interpretado (o forzando la IA). */
  onSubmit(text: string, options: { parse: LocalParse; forceAi?: boolean; attachments?: TurnAttachment[]; attachmentViews?: AttachmentView[] }): void
  onStop(): void
  busy: boolean
  interpreter: LocalInterpreter
  name: string
  avatar: AvatarSpec
  /** ¿Hay IA? undefined = se intentará. */
  ai: boolean | undefined
  /** Selector de modo, junto a los controles del campo. */
  modeControl?: ReactNode
  compact?: boolean
  onFocusChange?(focused: boolean): void
}

const KIND_ICONS: Record<SuggestionKind, LucideIcon> = {
  command: Zap,
  typology: IconSash,
  color: IconFoil,
  glass: IconGlass,
  line: IconProfileSection,
  client: UserRound,
  quote: FileText,
  navigation: Compass,
  recent: History,
  ref: IconFrame,
  template: LayoutTemplate,
  assistant: MessageSquare,
  locale: Languages,
  theme: SunMoon,
  mode: ShieldCheck,
  accessory: Blinds,
  period: CalendarDays,
  value: Hash,
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(props, ref) {
  const { value, onChange, busy, interpreter, name, ai } = props
  const t = useT(es)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const listId = useId()
  const valueRef = useRef(value)
  valueRef.current = value
  const [focused, setFocused] = useState(false)
  const [caretAtEnd, setCaretAtEnd] = useState(true)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [forcedOpen, setForcedOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const files = useAttachments()
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileNote, setFileNote] = useState('')
  const addFiles = (list: Iterable<File>) => {
    // Leer un archivo necesita al modelo: sin IA se dice antes, no al enviar.
    if (ai === false) {
      setFileNote(t('attachments.needsAi', { name }))
      return
    }
    setFileNote('')
    files.add(list)
  }
  const addFilesRef = useRef(addFiles)
  addFilesRef.current = addFiles
  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus(), element: () => textarea.current, addFiles: (list) => addFilesRef.current(list) }), [])

  const dictation = useDictation({
    onFinal: (text) => {
      if (!text) return
      const current = valueRef.current
      onChange(current ? `${current.replace(/\s+$/, '')} ${text}` : text)
      textarea.current?.focus()
    },
  })

  // El autocompletado y la lectura de comandos son para las cuentas sin IA.
  const localOnly = ai === false
  const parse = useMemo(() => interpreter.parse(localOnly ? value : ''), [interpreter, localOnly, value])
  const completion = useMemo(() => (localOnly && caretAtEnd ? interpreter.complete(value, value.length) : { items: [] as Suggestion[] }), [interpreter, localOnly, value, caretAtEnd])
  const dismissed = dismissedFor === value
  const ghost = !dismissed && focused && caretAtEnd && !dictation.listening ? (completion.ghost ?? '') : ''
  const items = dismissed ? [] : completion.items
  const listOpen = focused && items.length > 0 && (value.trim().length > 0 || forcedOpen) && !dictation.listening
  const itemsKey = items.map((i) => i.id).join('|')

  // La lista cambió: nada activo (no se reordena bajo el cursor ni se ejecuta por sorpresa).
  useEffect(() => setActive(-1), [itemsKey])
  useEffect(() => {
    if (!value) setForcedOpen(false)
  }, [value])

  const syncCaret = () => {
    const el = textarea.current
    if (!el) return
    setCaretAtEnd(el.selectionStart === el.value.length && el.selectionEnd === el.value.length)
  }

  const accept = (next: string, id?: string) => {
    onChange(next)
    if (id) recordUse(id)
    setForcedOpen(false)
    requestAnimationFrame(() => {
      const el = textarea.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.length, next.length)
      setCaretAtEnd(true)
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
    })
  }

  const submit = (forceAi = false) => {
    const text = value.trim()
    if (files.reading || (!text && !files.ready)) return
    setForcedOpen(false)
    emitBotReaction('sent')
    if (files.ready) {
      const taken = files.take()
      props.onSubmit(text, { parse, forceAi: true, attachments: taken.attachments, attachmentViews: taken.views })
      return
    }
    props.onSubmit(text, { parse, forceAi })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown' && (listOpen || (!value && items.length))) {
      event.preventDefault()
      if (!listOpen) setForcedOpen(true)
      setActive((i) => (i + 1 >= items.length ? 0 : i + 1))
      return
    }
    // Campo vacío: ↑ recupera lo último que escribiste, como en una terminal.
    if (event.key === 'ArrowUp' && !value) {
      const last = [...useAssistantPanel.getState().entries].reverse().find((e) => e.role === 'user')
      if (last) {
        event.preventDefault()
        accept(last.text)
      }
      return
    }
    if (event.key === 'ArrowUp' && listOpen && active >= 0) {
      event.preventDefault()
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
      return
    }
    if (event.key === ' ' && event.ctrlKey) {
      event.preventDefault()
      setDismissedFor(null)
      setForcedOpen(true)
      return
    }
    if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
      if (listOpen && active >= 0) {
        event.preventDefault()
        accept(items[active].insert, items[active].id)
        return
      }
      if (ghost) {
        event.preventDefault()
        accept(value + ghost)
        return
      }
      return
    }
    if (event.key === 'ArrowRight' && ghost && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && caretAtEnd) {
      event.preventDefault()
      accept(value + ghost)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (listOpen && active >= 0) {
        accept(items[active].insert, items[active].id)
        return
      }
      submit(event.altKey)
      return
    }
    if (event.key === 'Escape' && (listOpen || ghost)) {
      event.preventDefault()
      event.stopPropagation()
      setDismissedFor(value)
      setForcedOpen(false)
      setActive(-1)
    }
  }

  const shown = dictation.listening && dictation.interim ? `${value ? `${value} ` : ''}${dictation.interim}` : value
  const hasText = value.trim().length > 0
  const canSend = (hasText || files.ready) && !files.reading
  // Con archivos siempre responde el modelo: no hay comando local que valga.
  const confident = localOnly && isConfident(parse) && !files.ready
  const activeId = listOpen && active >= 0 ? `${listId}-${active}` : undefined

  let chip: ReactNode = null
  if (localOnly && hasText && !dictation.listening) {
    if (confident && parse.reply === undefined) {
      chip = (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-table text-fg" data-testid="assistant-understood">
          <CornerDownLeft aria-hidden strokeWidth={2} className="size-3.5 shrink-0 text-fg-muted" />
          <span className="min-w-0 truncate">{t('composer.understood', { text: parse.interpretation })}</span>
        </span>
      )
    } else if (parse.missing.length && !files.ready) {
      // Los avisos del motor ya son preguntas completas («¿Qué tipología? Por ejemplo…»).
      chip = (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-table text-warning" data-testid="assistant-missing">
          <TriangleAlert aria-hidden strokeWidth={2} className="size-3.5 shrink-0" />
          <span className="truncate">{parse.missing[0]}</span>
        </span>
      )
    } else if (confident) {
      chip = (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-table text-fg-muted">
          <CornerDownLeft aria-hidden strokeWidth={2} className="size-3.5 shrink-0" />
          <span className="truncate">{t('composer.understood', { text: parse.interpretation })}</span>
        </span>
      )
    } else {
      chip = <span className="truncate text-table text-fg-muted">{t('composer.noAi')}</span>
    }
  }

  const notes = canSend && !dictation.listening && confident && parse.notes?.length ? parse.notes[0] : ''
  const canAskInstead = canSend && !dictation.listening && confident && parse.reply === undefined && ai !== false && !props.compact

  return (
    <div className="relative shrink-0 px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
      {listOpen && (
        <div className={cn(floatingClass, 'absolute inset-x-3 bottom-full mb-1.5 overflow-hidden p-1')}>
          <ul id={listId} role="listbox" aria-label={t('composer.suggestions')} className="max-h-[264px] overflow-y-auto">
            {items.map((item, i) => {
              const Icon = KIND_ICONS[item.kind]
              return (
                <li
                  key={item.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => accept(item.insert, item.id)}
                  className={cn(
                    'relative flex h-8 cursor-default items-center gap-2 rounded-xs px-2 text-base text-fg',
                    i === active && 'bg-hover',
                  )}
                >
                  <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.detail && <span className="max-w-[45%] shrink-0 truncate text-meta text-fg-muted">{item.detail}</span>}
                  <span className="sr-only">{t(`kinds.${item.kind}`)}</span>
                </li>
              )
            })}
          </ul>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-divider px-2 pt-1.5 pb-0.5 text-meta text-fg-muted">
            <KbdHint keys={<Kbd>↑↓</Kbd>}>{t('composer.keys.navigate')}</KbdHint>
            <KbdHint combo="tab">{t('composer.keys.complete')}</KbdHint>
            <KbdHint combo="enter">{t('composer.keys.choose')}</KbdHint>
            <KbdHint combo="escape">{t('composer.keys.close')}</KbdHint>
          </div>
        </div>
      )}
      <div
        className={cn(
          'rounded-panel border bg-surface transition-[border-color,box-shadow] duration-100',
          'border-control focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--dk-focus-ring)]',
          dictation.listening && 'border-accent shadow-[0_0_0_3px_var(--dk-focus-ring)]',
        )}
      >
        <AttachmentDrafts drafts={files.drafts} onRemove={files.remove} />
        <label htmlFor={`${listId}-input`} className="sr-only">
          {t('composer.label', { name })}
        </label>
        <div ref={scroller} className="scrollbar-quiet max-h-[148px] overflow-y-auto px-3 pt-1.5">
          <div className="grid">
            <div aria-hidden className="pointer-events-none col-start-1 row-start-1 py-1 text-base break-words whitespace-pre-wrap text-transparent touch:text-lead">
              {shown}
              {ghost && <span className="text-fg-faint">{ghost}</span>}
              {'​'}
            </div>
            <textarea
              id={`${listId}-input`}
              ref={textarea}
              value={shown}
              onChange={(e) => {
                if (e.target.value.length > value.length) emitBotReaction('keystroke')
                onChange(e.target.value)
                setDismissedFor(null)
                setCaretAtEnd(e.target.selectionStart === e.target.value.length)
              }}
              onKeyDown={onKeyDown}
              onSelect={syncCaret}
              onPaste={(event) => {
                const pasted = Array.from(event.clipboardData.files)
                if (!pasted.length) return
                event.preventDefault()
                addFiles(pasted)
              }}
              onFocus={() => {
                setFocused(true)
                props.onFocusChange?.(true)
              }}
              onBlur={() => {
                setFocused(false)
                setForcedOpen(false)
                props.onFocusChange?.(false)
              }}
              rows={1}
              role="combobox"
              aria-expanded={listOpen}
              aria-controls={listOpen ? listId : undefined}
              aria-activedescendant={activeId}
              aria-autocomplete={localOnly ? 'both' : 'none'}
              placeholder={dictation.listening ? t('composer.listening') : ai === false ? t('composer.placeholderLocal') : t('composer.placeholder', { name })}
              enterKeyHint="send"
              autoComplete="off"
              spellCheck
              className="col-start-1 row-start-1 h-full min-h-7 resize-none overflow-hidden bg-transparent py-1 text-base text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none touch:text-lead"
            />
          </div>
        </div>
        {localOnly && <div className="flex min-h-6 items-center gap-2 px-3 pt-0.5">{chip}</div>}
        {notes ? (
          <p className="truncate px-3 text-meta text-fg-muted" data-testid="assistant-notes">
            {notes}
          </p>
        ) : null}
        <div className="flex items-center gap-1 px-1.5 pt-0.5 pb-1.5">
          <input
            ref={fileInput}
            type="file"
            multiple
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []))
              // Elegir el mismo archivo otra vez también tiene que avisar.
              event.target.value = ''
            }}
          />
          <Tooltip content={t('attachments.attach')}>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label={t('attachments.attach')}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg touch:size-10"
            >
              <Paperclip aria-hidden strokeWidth={1.75} className="size-4.5" />
            </button>
          </Tooltip>
          {dictation.supported && (
            <Tooltip content={dictation.listening ? t('composer.stopDictation') : t('composer.dictate')}>
              <button
                type="button"
                onClick={dictation.listening ? dictation.stop : dictation.start}
                aria-label={dictation.listening ? t('composer.stopDictation') : t('composer.dictate')}
                aria-pressed={dictation.listening}
                className={cn(
                  'inline-flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-100 touch:size-10',
                  dictation.listening ? 'bg-accent-subtle text-accent-ink' : 'text-fg-muted hover:bg-hover hover:text-fg',
                )}
              >
                <Mic aria-hidden strokeWidth={1.75} className="size-4.5" />
              </button>
            </Tooltip>
          )}
          {props.modeControl}
          <span className="flex-1" />
          {canAskInstead && !busy ? (
            <button
              type="button"
              onClick={() => submit(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-sm px-2 text-meta text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg touch:h-10"
            >
              {t('composer.ask', { name })}
            </button>
          ) : null}
          {busy ? (
            <Tooltip content={t('composer.stop')}>
              <button
                type="button"
                onClick={props.onStop}
                aria-label={t('composer.stop')}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-inverse text-fg-inverse transition-[background-color,transform] duration-100 active:scale-[0.96] touch:size-10"
              >
                <Square aria-hidden strokeWidth={0} fill="currentColor" className="size-3" />
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => submit()}
              disabled={!canSend}
              aria-label={t('composer.send')}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-accent text-fg-on-accent transition-[background-color,transform,opacity] duration-100 hover:bg-accent-hover active:scale-[0.96] disabled:pointer-events-none disabled:bg-hover disabled:text-fg-faint touch:size-10"
            >
              <ArrowUp aria-hidden strokeWidth={2} className="size-4.5" />
            </button>
          )}
        </div>
      </div>
      {dictation.problem || fileNote ? (
        <p role="status" className="mt-1.5 px-1 text-meta text-warning">
          {dictation.problem || fileNote}
        </p>
      ) : null}
      {ghost ? <span className="sr-only">{t('composer.ghostAvailable')}</span> : null}
    </div>
  )
})
