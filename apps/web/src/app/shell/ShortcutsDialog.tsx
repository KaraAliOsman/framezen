import { useT } from '../../lib/i18n'
import { Dialog, DialogContent, Kbd } from '../../ui'
import es from '../i18n/es'
import { useAssistantName } from './useAssistantName'

type ShortcutKey = keyof typeof es.shortcuts

/** Claves de i18n (no textos): se traducen al dibujar. */
const GROUPS: { title: ShortcutKey; items: { combo: string[]; label: ShortcutKey | 'assistant' }[] }[] = [
  {
    title: 'global',
    items: [
      { combo: ['mod+k'], label: 'palette' },
      { combo: ['/'], label: 'search' },
      { combo: ['mod+j'], label: 'assistant' },
      { combo: ['['], label: 'sidebar' },
      { combo: ['?'], label: 'help' },
      { combo: ['c'], label: 'newQuote' },
    ],
  },
  {
    title: 'quote',
    items: [
      { combo: ['a'], label: 'addWindow' },
      { combo: ['d'], label: 'duplicate' },
      { combo: ['delete'], label: 'remove' },
      { combo: ['1'], label: 'pick' },
      { combo: ['mod+z'], label: 'undo' },
      { combo: ['shift+mod+z'], label: 'redo' },
    ],
  },
  {
    title: 'measures',
    items: [
      { combo: ['up', 'down'], label: 'nudge' },
      { combo: ['enter'], label: 'confirm' },
    ],
  },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(es)
  const assistantName = useAssistantName({ enabled: open })
  const label = (key: ShortcutKey) =>
    key === 'assistant' ? (assistantName ? t('shortcuts.assistant', { name: assistantName }) : t('shortcuts.assistantGeneric')) : t(`shortcuts.${key}`)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('shortcuts.title')} size="md">
        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-meta font-medium text-fg-muted">{t(`shortcuts.${group.title}`)}</h3>
              <ul className="divide-y divide-divider rounded-md border border-divider">
                {group.items.map((item) => (
                  <li key={item.label} className="flex min-h-10 items-center justify-between gap-4 px-3 py-2">
                    <span className="text-fg">{label(item.label)}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.combo.map((c) => (
                        <Kbd key={c} combo={c} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
