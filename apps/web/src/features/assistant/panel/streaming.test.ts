import { describe, expect, it } from 'vitest'
import { entriesFromMessages } from '../v2/messages'
import type { Message, ToolRun } from '@dekopen/shared'
import { hideOpenMarks } from './streaming'

describe('marcado a medio llegar', () => {
  it('no muestra asteriscos sueltos', () => {
    expect(hideOpenMarks('Precio **total')).toBe('Precio ')
    expect(hideOpenMarks('Precio **total** de')).toBe('Precio **total** de')
    expect(hideOpenMarks('La `V1')).toBe('La ')
    expect(hideOpenMarks('La `V1` lista')).toBe('La `V1` lista')
  })
})

describe('orden dentro de una respuesta', () => {
  it('lo dicho y lo hecho se conservan intercalados al reabrir la conversación', () => {
    const base = { conversationId: 'c', source: 'ai', createdAt: '2026-11-06T12:00:00Z' }
    const messages = [
      { ...base, id: 'u', seq: 1, role: 'user', parts: [{ type: 'text', text: 'agrega' }] },
      { ...base, id: 'a1', seq: 2, role: 'assistant', parts: [{ type: 'text', text: 'Agrego la ventana.' }, { type: 'tool_call', toolCallId: 't1', tool: 'add_window', risk: 'write', status: 'executed', summary: 'Agregué V1' }] },
      { ...base, id: 'a2', seq: 3, role: 'assistant', parts: [{ type: 'text', text: 'Listo.' }] },
    ] as unknown as Message[]
    const [, entry] = entriesFromMessages(messages, [] as ToolRun[])
    expect(entry.parts).toEqual(['Agrego la ventana.', 'Listo.'])
    expect(entry.text).toBe('Agrego la ventana.\n\nListo.')
    expect(entry.activity?.[0].at).toBe(1)
  })
})
