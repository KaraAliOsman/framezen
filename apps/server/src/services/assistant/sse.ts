/**
 * Respuesta SSE de un turno (`text/event-stream` con `TurnEvent` codificados por
 * `encodeTurnEvent`). Si la persona cierra la conexión, la señal se aborta: el bucle deja de
 * llamar al modelo, libera la reserva de créditos y no ejecuta herramientas nuevas.
 * Un comentario `: ping` cada 15 s mantiene viva la conexión a través de proxies.
 */
import { encodeTurnEvent, type TurnEvent } from '@dekopen/shared'

export type TurnRunner = (emit: (event: TurnEvent) => void, signal: AbortSignal) => Promise<void>

const PING_MS = 15_000

export function sseStream(requestSignal: AbortSignal | undefined, run: TurnRunner, onError: (error: unknown, emit: (event: TurnEvent) => void) => void): ReadableStream<Uint8Array> {
  const abort = new AbortController()
  const onRequestAbort = () => abort.abort()
  if (requestSignal?.aborted) abort.abort()
  else requestSignal?.addEventListener('abort', onRequestAbort, { once: true })
  const encoder = new TextEncoder()
  let closed = false
  let seq = 0
  let ping: ReturnType<typeof setInterval> | undefined

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          closed = true
        }
      }
      const emit = (event: TurnEvent) => write(encodeTurnEvent(event, ++seq))
      ping = setInterval(() => write(': ping\n\n'), PING_MS)
      void run(emit, abort.signal)
        .catch((error: unknown) => onError(error, emit))
        .finally(() => {
          if (ping) clearInterval(ping)
          requestSignal?.removeEventListener('abort', onRequestAbort)
          if (!closed) {
            closed = true
            try {
              controller.close()
            } catch {
              // ya cerrado por quien lee
            }
          }
        })
    },
    cancel() {
      closed = true
      if (ping) clearInterval(ping)
      abort.abort()
    },
  })
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
} as const
