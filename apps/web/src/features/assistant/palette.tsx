/**
 * Filas del asistente para la paleta ⌘K (la monta el shell): el comando local que se entendió
 * («Hacer: corredera 2 hojas · 1.500 × 1.200 mm») y las sugerencias del autocompletado, que abren el
 * panel con el texto listo para completar.
 */
import { useMemo } from 'react'
import { CornerDownLeft, Zap } from 'lucide-react'
import { useT } from '../../lib/i18n'
import type { CommandGroup } from '../../ui'
import { useAssistantStore } from '../../lib/stores'
import es from './i18n/es'
import { isConfident } from './local/interpreter'
import { useLocalInterpreter } from './local/useInterpreter'
import { useAssistantPanel } from './store'
import { assistantName, pickAssistant, useAssistantStatus, useAssistants } from './v2/queries'

/** Grupo «Comandos de {asistente}» para la paleta, o null si no hay nada útil para `query`. */
export function useAssistantCommandRows(query: string, enabled: boolean): CommandGroup | null {
  const t = useT(es)
  const assistants = useAssistants(enabled)
  const status = useAssistantStatus(enabled)
  const interpreter = useLocalInterpreter(enabled, assistants.data?.items)
  const name = assistantName(pickAssistant(assistants.data?.items, useAssistantPanel.getState().assistantId))
  return useMemo(() => {
    const text = query.trim()
    if (!enabled || text.length < 2) return null
    if (status.data?.ai.available !== false) {
      return {
        heading: t('palette.heading', { name }),
        items: [{ id: 'assistant-ask', label: t('palette.ask', { name, text }), icon: CornerDownLeft, keywords: [text], onSelect: () => useAssistantStore.getState().ask(text) }],
      }
    }
    const parse = interpreter.parse(text)
    const items: CommandGroup['items'] = []
    if (isConfident(parse) && parse.plan?.length) {
      items.push({
        id: 'assistant-run',
        label: t('palette.run', { text: parse.interpretation }),
        icon: CornerDownLeft,
        keywords: [text],
        onSelect: () => useAssistantStore.getState().ask(text),
      })
    }
    for (const item of interpreter.complete(text, text.length).items.slice(0, 4)) {
      items.push({
        id: `assistant-${item.id}`,
        label: item.label,
        hint: item.detail,
        icon: Zap,
        keywords: [text],
        onSelect: () => {
          useAssistantPanel.getState().setDraft(item.insert)
          useAssistantPanel.getState().setMinimized(false)
          useAssistantStore.getState().setOpen(true)
        },
      })
    }
    return items.length ? { heading: t('palette.heading', { name }), items } : null
  }, [enabled, interpreter, name, query, status.data?.ai.available, t])
}
