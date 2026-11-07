/**
 * Mensajes del servidor (partes tipadas) → entradas de la vista del panel. Puro y determinista.
 * Los mensajes de herramienta y las notas de sistema se pliegan en la respuesta del asistente que
 * los rodea, así la conversación se lee como un diálogo con su línea de actividad.
 */
import type { Message, MessagePart, ToolRun } from '@dekopen/shared'
import type { ActivityView, ChatEntry, NoticeView } from '../types'

const at = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

function activityFromCall(part: Extract<MessagePart, { type: 'tool_call' }>, runs: Record<string, ToolRun>): ActivityView {
  const run = part.toolRunId ? runs[part.toolRunId] : undefined
  return {
    id: part.toolCallId,
    ...(part.toolRunId ? { toolRunId: part.toolRunId } : {}),
    tool: part.tool,
    risk: part.risk,
    status: run?.status ?? part.status,
    ...(part.summary ? { summary: part.summary } : {}),
    ...(run?.error ? { error: run.error.message } : {}),
  }
}

/** Aplica las partes de un mensaje sobre una entrada (texto, actividad, propuestas, avisos). */
export function applyParts(entry: ChatEntry, parts: readonly MessagePart[], runs: Record<string, ToolRun>): ChatEntry {
  let text = entry.text
  const textParts = [...(entry.parts ?? (entry.text ? [entry.text] : []))]
  const approvalAt = { ...entry.approvalAt }
  const activity = [...(entry.activity ?? [])]
  const approvals = [...(entry.approvals ?? [])]
  const notices: NoticeView[] = [...(entry.notices ?? [])]
  let interpretation = entry.interpretation
  const attachments = [...(entry.attachments ?? [])]
  for (const part of parts) {
    switch (part.type) {
      case 'text':
        text = text ? `${text}\n\n${part.text}` : part.text
        textParts.push(part.text)
        break
      case 'tool_call': {
        if (part.risk !== 'read' && part.status === 'proposed' && part.toolRunId) {
          if (!approvals.includes(part.toolRunId)) {
            approvals.push(part.toolRunId)
            approvalAt[part.toolRunId] = textParts.length
          }
          break
        }
        const view = { ...activityFromCall(part, runs), at: textParts.length }
        const index = activity.findIndex((a) => a.id === view.id)
        if (index >= 0) activity[index] = { ...activity[index], ...view, at: activity[index].at ?? view.at }
        else activity.push(view)
        break
      }
      case 'tool_result': {
        const index = activity.findIndex((a) => a.id === part.toolCallId)
        const patch: Partial<ActivityView> = {
          ...(part.summary ? { summary: part.summary } : {}),
          ...(part.ok ? {} : { status: 'failed' as const, error: part.error?.message }),
        }
        if (index >= 0) activity[index] = { ...activity[index], ...patch }
        else activity.push({ id: part.toolCallId, tool: part.tool, status: part.ok ? 'executed' : 'failed', at: textParts.length, ...patch })
        break
      }
      case 'approval':
        if (!approvals.includes(part.toolRunId)) {
          approvals.push(part.toolRunId)
          approvalAt[part.toolRunId] = textParts.length
        }
        break
      case 'notice':
        // El mismo aviso ya llegó como evento durante el turno: no se repite al cerrar el mensaje.
        if (notices.some((n) => n.code === part.code && n.text === part.text)) break
        notices.push({ id: `${entry.id}:${part.code}:${notices.length}`, level: part.level, code: part.code, text: part.text })
        break
      case 'local_plan':
        interpretation = part.plan.interpretation
        break
      case 'attachment':
        attachments.push({ name: part.name, kind: part.kind })
        break
    }
  }
  return {
    ...entry,
    text,
    ...(textParts.length ? { parts: textParts } : {}),
    ...(activity.length ? { activity } : {}),
    ...(approvals.length ? { approvals, approvalAt } : {}),
    ...(notices.length ? { notices } : {}),
    ...(interpretation ? { interpretation } : {}),
    ...(attachments.length ? { attachments } : {}),
  }
}

/** Una entrada a partir de un mensaje (persona o asistente). */
export function entryFromMessage(message: Message, runs: Record<string, ToolRun>): ChatEntry {
  const role = message.role === 'user' ? 'user' : 'assistant'
  const base: ChatEntry = {
    id: message.id,
    role,
    text: '',
    at: at(message.createdAt),
    seq: message.seq,
    status: 'done',
    source: message.source,
    ...(message.credits !== undefined ? { credits: message.credits } : {}),
  }
  return applyParts(base, message.parts, runs)
}

/** Lista de mensajes → entradas (las herramientas y notas se pliegan en la respuesta vecina). */
export function entriesFromMessages(messages: readonly Message[], toolRuns: readonly ToolRun[]): ChatEntry[] {
  const runs = Object.fromEntries(toolRuns.map((r) => [r.id, r]))
  const out: ChatEntry[] = []
  for (const message of [...messages].sort((a, b) => a.seq - b.seq)) {
    if (message.role === 'tool' || message.role === 'system_note') {
      const last = out[out.length - 1]
      if (last && last.role === 'assistant') out[out.length - 1] = applyParts(last, message.parts, runs)
      else out.push({ ...entryFromMessage(message, runs), role: 'assistant' })
      continue
    }
    if (message.role === 'assistant') {
      const last = out[out.length - 1]
      // Varias respuestas seguidas del mismo turno (texto → herramienta → texto) se leen como una.
      if (last && last.role === 'assistant' && last.source === message.source) {
        out[out.length - 1] = {
          ...applyParts(last, message.parts, runs),
          credits: (last.credits ?? 0) + (message.credits ?? 0) || undefined,
        }
        continue
      }
    }
    out.push(entryFromMessage(message, runs))
  }
  // Los mensajes de la persona resueltos con un comando local muestran el «Entendí» en la respuesta.
  return out
}
