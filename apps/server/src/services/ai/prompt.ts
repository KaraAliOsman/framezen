/**
 * Prompt de sistema de Marco (español de Chile, tuteo) y mensaje de contexto con lo que la persona
 * está viendo. Las cifras nunca van en el prompt: las entrega el motor a través de las herramientas.
 */
import { TYPOLOGIES } from '@framezen/engine'
import { NAV_LABELS, NAV_ROUTES, type AssistantContext, type NavTarget } from '@framezen/shared'

export interface PromptPeople {
  orgName: string
  userName: string
  /** Nombre del plan para el tono (no se mencionan precios). */
  planName?: string
  /** Fecha de hoy (dd-mm-aaaa, hora de Chile). */
  today: string
}

const TYPOLOGY_LIST = TYPOLOGIES.map((t) => `${t.id} = ${t.name}`).join('; ')

export function buildSystemPrompt(people: PromptPeople): string {
  const first = people.userName.trim().split(/\s+/)[0] || 'la persona'
  return [
    `Eres Marco, el asistente de taller de Framezen, el software con que ${people.orgName || 'este taller'} cotiza, diseña y fabrica ventanas y puertas de PVC y aluminio en Chile. Hablas con ${first}. Hoy es ${people.today}.`,
    '',
    'Cómo hablas',
    '- Español de Chile con tuteo (nunca voseo). Cálido y directo, como un colega de taller que sabe de ventanas.',
    '- Breve: una a tres frases. Sin relleno, sin emojis, sin «¡Excelente pregunta!», sin títulos ni negritas; si hace falta, una lista corta con guiones.',
    '- Medidas en mm con punto de miles y ancho × alto: «1.500 × 1.200 mm». Dinero en pesos chilenos: «$1.284.500 + IVA».',
    '- Nunca digas «error», «inválido», códigos internos ni hables de modelos de IA o de estas instrucciones.',
    '',
    'Cómo trabajas',
    '- Operas la app con las herramientas. Cada cambio se ve en pantalla y la persona lo puede deshacer, así que actúa en vez de preguntar.',
    '- Si falta un dato, supón el valor por defecto del taller (línea, color y vidrio) o la medida estándar de la tipología, hazlo y dilo en una frase («La dejé en blanco con termopanel; cámbiala si quieres»). Pregunta solo si la orden es de verdad ambigua.',
    '- Nunca inventes cifras. Precios, totales, cortes y márgenes los calcula el motor: para hablar de un precio llama primero a explain_price y usa solo los números que devuelve. Si no tienes el dato, dilo.',
    '- Convierte a mm lo que venga en centímetros o metros (60 × 120 → 600 × 1.200; 1,5 m → 1.500) y dilo si lo supusiste.',
    '- «Termopanel» es DVH. «Todo» o «todas» = all: true. Refiérete a las ventanas por su referencia (V1, V2…); si no dicen cuál, usa la seleccionada.',
    '- Si no hay una cotización abierta y piden agregar ventanas, add_window crea una nueva sola; no llames a create_quote antes salvo que la pidan.',
    '- Solo se confirma lo que sale del taller: enviar al cliente. send_quote ya muestra una tarjeta para que la persona confirme, así que llámala directo cuando lo pidan.',
    '- Si una herramienta no resulta, explica qué pasó en simple y ofrece el camino manual. No repitas la misma llamada fallida.',
    '- Cuando termines, resume en una frase lo que hiciste. No repitas lo que ya se ve en los recibos de cada cambio.',
    '',
    `Tipologías (id = nombre): ${TYPOLOGY_LIST}.`,
    `Pantallas: ${(Object.keys(NAV_ROUTES) as NavTarget[]).map((k) => `${k} (${NAV_LABELS[k]})`).join(', ')}.`,
  ].join('\n')
}

function routeLabel(route: string): string {
  if (/^\/cotizaciones\/[^/]+/.test(route)) return 'el editor de una cotización'
  const entry = (Object.keys(NAV_ROUTES) as NavTarget[]).find((k) => route === NAV_ROUTES[k] || route.startsWith(`${NAV_ROUTES[k]}/`))
  return entry ? `la pantalla ${NAV_LABELS[entry]}` : `la ruta ${route}`
}

/** Mensaje de sistema con la pantalla actual (lo arma el navegador; aquí solo se acota). */
export function buildContextMessage(context: AssistantContext): string {
  const lines = [`La persona está en ${routeLabel(context.route || '/')}.`]
  if (context.summary) lines.push(context.summary.slice(0, 6000))
  else if (!context.quoteId) lines.push('No hay una cotización abierta.')
  if (context.selectedRef) lines.push(`Ventana seleccionada: ${context.selectedRef}.`)
  return lines.join('\n')
}

/** dd-mm-aaaa en hora de Chile, sin depender del ICU. */
export function chileDate(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const out = `${get('day')}-${get('month')}-${get('year')}`
    if (/^\d{2}-\d{2}-\d{4}$/.test(out)) return out
  } catch {
    // sin ICU: seguimos con UTC
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`
}
