/**
 * Reacciones: lo que le pasa al asistente y no es un estado. Una tecla, un fragmento de respuesta, una
 * herramienta que terminó. Son golpes de un frame: no tocan React. Las caras que están a la vista y
 * representan al asistente activo (`reactive`) las reciben.
 */
export type Reaction = 'keystroke' | 'sent' | 'token' | 'message' | 'tool_ok' | 'tool_fail' | 'poke' | 'greet'

type Listener = (kind: Reaction) => void

const listeners = new Set<Listener>()

export function emitBotReaction(kind: Reaction): void {
  for (const listener of listeners) listener(kind)
}

export function onBotReaction(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
