/**
 * Lista de secciones del documento: orden (arrastrar o Alt+↑/↓), visibilidad (ojo), menú por fila y
 * «Agregar sección» con los tipos permitidos para el tipo de documento. Cada cambio es una DocOp.
 */
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  FileSignature,
  GalleryHorizontalEnd,
  GripVertical,
  Info,
  LayoutGrid,
  Layers,
  Lock,
  Mail,
  MoreHorizontal,
  Palette,
  PanelTop,
  Plus,
  ScrollText,
  Scissors,
  ShieldCheck,
  Table2,
  Trash2,
  Type,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { closingOrderViolation,
  REQUIRED_SECTIONS,
  SECTION_META,
  sectionLabel,
  sectionTypesFor,
  variantLabel,
  type DocOp,
  type DocSection,
  type DocSectionType,
  type DocTemplate,
} from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, IconButton, Tooltip } from '../../../ui'
import { IconGlazing, IconHandle, IconQuoteDocument, IconTemplate } from '../../../ui/icons'
import es from '../i18n/es'


/** El total va al final: mover una sección no puede dejar nada más después de él. */
function breaksClosing(sections: readonly DocSection[], index: number, delta: -1 | 1): boolean {
  const next = [...sections]
  const [moved] = next.splice(index, 1)
  next.splice(index + delta, 0, moved)
  return closingOrderViolation(next) >= 0
}

export const SECTION_ICONS: Record<DocSectionType, LucideIcon> = {
  cover: PanelTop,
  letter: Mail,
  client_strip: Users,
  project_summary: ClipboardList,
  items: IconQuoteDocument,
  options_comparison: Layers,
  technical_specs: Info,
  finishes_board: Palette,
  totals: CircleDollarSign,
  payment: Wallet,
  terms: ScrollText,
  warranty: ShieldCheck,
  about_us: Users,
  gallery: GalleryHorizontalEnd,
  acceptance: FileSignature,
  custom_text: Type,
  page_break: Scissors,
  intro: BookOpen,
  families: IconTemplate,
  product_cards: LayoutGrid,
  matrix: Table2,
  finishes: Palette,
  glass: IconGlazing,
  hardware: IconHandle,
  contact: Mail,
}

export function isRequired(template: DocTemplate, section: DocSection): boolean {
  const req = REQUIRED_SECTIONS[template.kind]
  if (req.all.includes(section.type)) return template.sections.filter((s) => s.type === section.type && s.enabled).length <= 1 && section.enabled
  if (req.any.includes(section.type)) return template.sections.filter((s) => req.any.includes(s.type) && s.enabled).length <= 1 && section.enabled
  return false
}

export interface SectionsPanelProps {
  template: DocTemplate
  selectedId: string | null
  readOnly: boolean
  onSelect: (id: string) => void
  onOps: (ops: DocOp[], mergeKey?: string) => void
}

export function SectionsPanel({ template, selectedId, readOnly, onSelect, onOps }: SectionsPanelProps) {
  const t = useT(es)
  const { locale } = useLocale()
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const sections = template.sections
  const label = (s: DocSection) => s.title?.trim() || sectionLabel(s.type, locale)

  const move = (s: DocSection, delta: -1 | 1) => {
    const index = sections.findIndex((x) => x.id === s.id)
    const target = sections[index + delta]
    if (!target || target.type === 'cover' || s.type === 'cover') return
    onOps([delta < 0 ? { op: 'moveSection', sectionId: s.id, beforeId: target.id } : { op: 'moveSection', sectionId: s.id, afterId: target.id }])
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, s: DocSection, index: number) => {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      if (!readOnly) move(s, event.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const next = sections[index + (event.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        onSelect(next.id)
        listRef.current?.querySelector<HTMLButtonElement>(`[data-row="${next.id}"]`)?.focus()
      }
    }
  }

  const onDragOver = (event: DragEvent<HTMLLIElement>, s: DocSection) => {
    if (!dragId || dragId === s.id || s.type === 'cover') return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setDropAt({ id: s.id, after: event.clientY > rect.top + rect.height / 2 })
  }
  const onDrop = (event: DragEvent<HTMLLIElement>) => {
    event.preventDefault()
    if (dragId && dropAt && dragId !== dropAt.id) {
      onOps([dropAt.after ? { op: 'moveSection', sectionId: dragId, afterId: dropAt.id } : { op: 'moveSection', sectionId: dragId, beforeId: dropAt.id }])
    }
    setDragId(null)
    setDropAt(null)
  }

  const allowed = sectionTypesFor(template.kind)
  const count = (type: DocSectionType) => sections.filter((s) => s.type === type).length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 px-4">
        <h2 className="text-table font-semibold text-fg-strong">{t('sections.title')}</h2>
        <span className="num text-meta text-fg-muted">{sections.length}</span>
      </div>
      <ul ref={listRef} className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label={t('sections.title')}>
        {sections.map((s, index) => {
          const Icon = SECTION_ICONS[s.type]
          const selected = s.id === selectedId
          const required = isRequired(template, s)
          const draggable = !readOnly && s.type !== 'cover'
          const variant = (s.options as { variant?: string }).variant
          return (
            <li
              key={s.id}
              className={cn('relative', dropAt?.id === s.id && (dropAt.after ? 'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent' : 'before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-accent'))}
              draggable={draggable}
              onDragStart={(event) => {
                setDragId(s.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', s.id)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropAt(null)
              }}
              onDragOver={(event) => onDragOver(event, s)}
              onDrop={onDrop}
            >
              <div
                className={cn(
                  'group flex h-11 items-center gap-1 rounded-sm pr-1 transition-colors duration-100',
                  selected ? 'edge-accent bg-surface shadow-xs' : 'hover:bg-hover',
                  dragId === s.id && 'opacity-50 shadow-float',
                )}
              >
                <span aria-hidden className={cn('flex w-5 shrink-0 justify-center text-fg-faint', draggable ? 'cursor-grab opacity-0 group-hover:opacity-100' : 'opacity-0')}>
                  <GripVertical className="size-3.5" strokeWidth={1.75} />
                </span>
                <button
                  type="button"
                  data-row={s.id}
                  onClick={() => onSelect(s.id)}
                  onKeyDown={(event) => onKeyDown(event, s, index)}
                  aria-current={selected || undefined}
                  title={draggable ? t('sections.reorderHint') : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xs py-1 text-left"
                >
                  <Icon aria-hidden className={cn('size-4 shrink-0', s.enabled ? 'text-fg-muted' : 'text-fg-faint')} strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-base', s.enabled ? 'text-fg-strong' : 'text-fg-faint line-through decoration-fg-faint/60')}>{label(s)}</span>
                    <span className="block truncate text-meta text-fg-muted">
                      {!s.enabled ? t('sections.hidden') : variant ? variantLabel(variant, locale) : sectionLabel(s.type, locale)}
                      {s.pageBreak === 'before' && s.enabled ? ` · ${t('sections.newPage')}` : ''}
                    </span>
                  </span>
                </button>
                {required ? (
                  <Tooltip content={t('sections.required')}>
                    <span className="flex size-8 shrink-0 items-center justify-center text-fg-faint" aria-label={t('sections.required')}>
                      <Lock className="size-3.5" strokeWidth={1.75} />
                    </span>
                  </Tooltip>
                ) : (
                  <IconButton
                    icon={s.enabled ? Eye : EyeOff}
                    size="sm"
                    label={s.enabled ? t('sections.hide', { name: label(s) }) : t('sections.show', { name: label(s) })}
                    aria-pressed={!s.enabled}
                    disabled={readOnly}
                    className={cn(s.enabled && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                    onClick={() => onOps([{ op: 'toggleSection', sectionId: s.id, enabled: !s.enabled }])}
                  />
                )}
                {!readOnly ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton icon={MoreHorizontal} size="sm" label={t('sections.actions', { name: label(s) })} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem icon={ArrowUp} disabled={index === 0 || s.type === 'cover' || sections[index - 1]?.type === 'cover' || breaksClosing(sections, index, -1)} onSelect={() => move(s, -1)}>
                        {t('sections.moveUp')}
                      </DropdownMenuItem>
                      <DropdownMenuItem icon={ArrowDown} disabled={index === sections.length - 1 || s.type === 'cover' || breaksClosing(sections, index, 1)} onSelect={() => move(s, 1)}>
                        {t('sections.moveDown')}
                      </DropdownMenuItem>
                      <DropdownMenuItem icon={Copy} disabled={count(s.type) >= SECTION_META[s.type].max} onSelect={() => onOps([{ op: 'duplicateSection', sectionId: s.id }])}>
                        {t('sections.duplicate')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem icon={Trash2} disabled={required} onSelect={() => onOps([{ op: 'removeSection', sectionId: s.id }])}>
                        {t('sections.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      {!readOnly ? (
        <div className="shrink-0 border-t border-divider p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="subtle" icon={Plus} className="w-full justify-center">
                {t('sections.add')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="max-h-[min(70vh,560px)] w-[300px] overflow-y-auto">
              {allowed
                .filter((type) => type !== 'cover' || !sections.some((s) => s.type === 'cover'))
                .map((type) => {
                  const Icon = SECTION_ICONS[type]
                  const full = count(type) >= SECTION_META[type].max
                  return (
                    <DropdownMenuItem
                      key={type}
                      icon={Icon}
                      disabled={full}
                      onSelect={() => onOps([{ op: 'addSection', section: { type } }])}
                      className="h-auto items-start py-2 touch:h-auto [&>svg]:mt-0.5"
                    >
                      <span className="block whitespace-normal">
                        <span className="block text-base text-fg-strong">{sectionLabel(type, locale)}</span>
                        <span className="block text-meta text-fg-muted">{full ? t('sections.limitReached') : t(`sections.describe.${type}`)}</span>
                      </span>
                    </DropdownMenuItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="mt-2 text-meta text-fg-muted">{t('sections.addHint')}</p>
        </div>
      ) : null}
    </div>
  )
}
