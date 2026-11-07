/**
 * Efectos de un turno en el navegador: instrucciones de interfaz (`ui`) y entidades que cambiaron
 * en el servidor (`affected`). Solo destinos registrados (nunca URLs libres) y solo recargas: el
 * navegador no repite cambios, los vuelve a pedir.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { AffectedEntity, UiAction, UiNavTarget } from '@dekopen/shared'
import { qk } from '../../../lib/queryClient'
import type { QuoteEditorBridge } from '../bridge'

/** Rutas de cada destino de navegación (slugs en español, como el resto de la app). */
export function navPath(to: UiNavTarget, id?: string): string {
  const enc = (value: string) => encodeURIComponent(value)
  switch (to) {
    case 'home':
      return '/inicio'
    case 'quotes':
      return '/cotizaciones'
    case 'quote':
      return id ? `/cotizaciones/${enc(id)}` : '/cotizaciones'
    case 'clients':
      return '/clientes'
    case 'client':
      return id ? `/clientes/${enc(id)}` : '/clientes'
    case 'workshop':
      return '/taller'
    case 'work_order':
      return id ? `/taller/${enc(id)}` : '/taller'
    case 'catalog':
      return '/catalogo'
    case 'documents':
      return '/documentos'
    case 'template':
      return id ? `/documentos?plantilla=${enc(id)}` : '/documentos'
    case 'settings':
    case 'company':
      return '/ajustes/empresa'
    case 'pricing':
      return '/ajustes/precios'
    case 'plan':
      return '/ajustes/plan'
    case 'team':
      return '/ajustes/equipo'
    case 'assistants':
      return '/ajustes/asistentes'
  }
}

/** PDF de cortes de una OT o de una cotización, con solo las piezas pedidas. */
function cutsPdf(action: Extract<UiAction, { kind: 'download_cuts' }>): { url: string; fileName: string } {
  const parts = action.parts?.length ? `parts=${action.parts.map(encodeURIComponent).join(',')}` : ''
  const suffix = action.parts?.length ? `-${action.parts.join('-')}` : ''
  if (action.workOrderId) return { url: `/api/work-orders/${encodeURIComponent(action.workOrderId)}/pdf?doc=cuts${parts ? `&${parts}` : ''}`, fileName: `cortes${suffix}.pdf` }
  return { url: `/api/quotes/${encodeURIComponent(action.quoteId ?? '')}/cuts/pdf${parts ? `?${parts}` : ''}`, fileName: `cortes${suffix}.pdf` }
}

export interface UiEffectsEnv {
  navigate(path: string): void
  getEditor(): QuoteEditorBridge | null
  waitForEditor(quoteId: string, timeoutMs: number): Promise<QuoteEditorBridge>
  setLocale(locale: Extract<UiAction, { kind: 'set_locale' }>['locale']): void
  setTheme(theme: Extract<UiAction, { kind: 'set_theme' }>['theme']): void
  setZoom(percent: number): void
  downloadCuts(url: string, fileName: string): Promise<void>
  openAssistantEditor(): void
  openMemory(): void
}

async function withEditor(env: UiEffectsEnv, quoteId: string | undefined, run: (bridge: QuoteEditorBridge) => void): Promise<void> {
  const current = env.getEditor()
  if (current && (!quoteId || current.quoteId === quoteId)) return run(current)
  if (!quoteId) return
  env.navigate(navPath('quote', quoteId))
  try {
    run(await env.waitForEditor(quoteId, 10_000))
  } catch {
    // El editor tardó: la persona ya está en la cotización.
  }
}

/** Ejecuta una instrucción de interfaz (ya validada con `parseUiAction`). Nunca lanza. */
export async function runUiAction(action: UiAction, env: UiEffectsEnv): Promise<void> {
  try {
    switch (action.kind) {
      case 'navigate':
        env.navigate(navPath(action.to, action.id))
        return
      case 'open_quote':
        await withEditor(env, action.quoteId, (bridge) => {
          if (action.itemId) bridge.selectItem(action.itemId)
        })
        return
      case 'select_item':
        await withEditor(env, action.quoteId, (bridge) => bridge.selectItem(action.itemId))
        return
      case 'highlight': {
        const bridge = env.getEditor()
        if (bridge && bridge.getQuote().items.some((i) => i.id === action.id)) bridge.selectItem(action.id)
        return
      }
      case 'open_document_editor':
        if (action.quoteId) await withEditor(env, action.quoteId, (bridge) => bridge.showDocument())
        else env.navigate(action.templateId ? navPath('template', action.templateId) : navPath('documents'))
        return
      case 'open_template_editor':
        env.navigate(navPath('template', action.templateId))
        return
      case 'open_dialog':
        switch (action.dialog) {
          case 'assistant_editor':
            env.openAssistantEditor()
            return
          case 'memory_manager':
            env.openMemory()
            return
          case 'new_client':
            env.navigate('/clientes?nuevo=1')
            return
          case 'new_quote':
            env.navigate('/cotizaciones?nueva=1')
            return
          case 'texture_upload':
            env.navigate('/catalogo?tab=colores')
            return
          case 'import_prices':
            env.navigate('/catalogo?importar=1')
            return
          case 'send_quote':
            await withEditor(env, action.id, (bridge) => {
              if (bridge.openSend) bridge.openSend()
              else if (bridge.openSendDialog) bridge.openSendDialog()
              else bridge.showDocument()
            })
            return
        }
        return
      case 'set_locale':
        env.setLocale(action.locale)
        return
      case 'set_theme':
        env.setTheme(action.theme)
        return
      case 'set_zoom':
        env.setZoom(action.percent)
        return
      case 'download_quote_pdf':
        await env.downloadCuts(`/api/quotes/${encodeURIComponent(action.quoteId)}/pdf`, `cotizacion-${action.number}.pdf`)
        return
      case 'open_cuts': {
        const parts = action.parts?.length ? `parts=${action.parts.map(encodeURIComponent).join(',')}` : ''
        env.navigate(action.workOrderId ? `/taller/${encodeURIComponent(action.workOrderId)}?pestana=cortes${parts ? `&${parts}` : ''}` : `/cotizaciones/${encodeURIComponent(action.quoteId ?? '')}/cortes${parts ? `?${parts}` : ''}`)
        return
      }
      case 'download_cuts': {
        const { url, fileName } = cutsPdf(action)
        await env.downloadCuts(url, fileName)
        return
      }
      case 'open_work_order':
        env.navigate(`/taller/${encodeURIComponent(action.workOrderId)}${action.tab ? `?pestana=${encodeURIComponent(action.tab)}` : ''}`)
        return
      case 'download_work_order_doc':
        await env.downloadCuts(`/api/work-orders/${encodeURIComponent(action.workOrderId)}/pdf?doc=${encodeURIComponent(action.doc)}`, `${action.doc}-ot-${action.number}.pdf`)
        return
      case 'download_catalog_pdf': {
        const query = new URLSearchParams()
        if (action.lineIds?.length) query.set('lines', action.lineIds.join(','))
        if (action.title) query.set('title', action.title)
        const suffix = query.size ? `?${query}` : ''
        await env.downloadCuts(`/api/catalog/pdf${suffix}`, 'catalogo.pdf')
        return
      }
    }
  } catch {
    // Una instrucción de interfaz nunca rompe el turno.
  }
}

export interface AffectedEnv {
  client: QueryClient
  getEditor(): QuoteEditorBridge | null
  /** Nombre del asistente (paso de deshacer «Cambios de {name}»). */
  assistantName(): string
}

/** Vuelve a pedir lo que cambió. La cotización abierta en el editor se recarga como un solo paso de deshacer. */
export async function refreshAffected(entities: readonly AffectedEntity[], env: AffectedEnv): Promise<void> {
  const { client } = env
  const seen = new Set<string>()
  const jobs: Promise<unknown>[] = []
  const invalidate = (queryKey: readonly unknown[]) => jobs.push(client.invalidateQueries({ queryKey }))
  for (const entity of entities) {
    const key = `${entity.type}:${entity.id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    switch (entity.type) {
      case 'quote': {
        const bridge = env.getEditor()
        const open = Boolean(entity.id && bridge && bridge.quoteId === entity.id)
        if (open && bridge?.refreshFromServer) {
          // Un solo paso de deshacer «Cambios de {asistente}» en el editor abierto.
          jobs.push(bridge.refreshFromServer(env.assistantName()).catch(() => false))
        } else if (open && bridge?.reloadFromServer) {
          jobs.push(bridge.reloadFromServer({ assistantName: env.assistantName(), version: entity.version }).catch(() => undefined))
        }
        if (entity.id) invalidate(qk.quote(entity.id))
        invalidate(['quotes'])
        break
      }
      case 'client':
        invalidate(['clients'])
        if (entity.id) invalidate(qk.client(entity.id))
        break
      case 'work_order':
        invalidate(qk.workOrders)
        if (entity.id) invalidate(qk.workOrder(entity.id))
        break
      case 'catalog':
        invalidate(qk.catalog)
        break
      case 'settings':
        invalidate(qk.settings)
        break
      case 'org':
        invalidate(qk.me)
        break
      case 'template':
        invalidate(['templates'])
        break
      case 'texture':
        invalidate(['textures'])
        invalidate(qk.catalog)
        break
      case 'assistant':
        invalidate(['assistant-v2', 'assistants'])
        break
      case 'memory':
        invalidate(['assistant-v2', 'memories'])
        break
    }
  }
  await Promise.all(jobs)
}
