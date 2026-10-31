/**
 * Marco, el asistente de Framezen: contrato de herramientas y modo local.
 *
 * - `ASSISTANT_TOOLS`: definiciones estilo OpenAI (JSON Schema) de las operaciones que Marco puede
 *   hacer en la app. El servidor se las pasa al modelo; el navegador las ejecuta sobre el estado
 *   real (puente del editor), así todo se ve y se puede deshacer.
 * - `parseLocalCommand(text, context)`: intérprete determinista de frases comunes en español de
 *   Chile, sin IA. Lo usan el servidor (plan Taller o sin clave) y el navegador (sin conexión).
 *
 * Nada aquí calcula cifras: los precios los da siempre el motor.
 */
import type { OpeningKind, TypologyId } from '@framezen/engine'
import type { AssistantRequest, AssistantResponse } from './api'

// ── Herramientas ─────────────────────────────────────────────────────────────

export const ASSISTANT_TOOL_NAMES = [
  'create_quote',
  'open_quote',
  'add_window',
  'update_window',
  'duplicate_window',
  'remove_window',
  'set_discount',
  'set_title',
  'set_client',
  'explain_price',
  'show_document',
  'send_quote',
  'navigate',
  'search',
] as const

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number]

/** Llamada a herramienta tal como viaja en `AssistantMessage.toolCalls`. */
export interface AssistantToolCall {
  id: string
  name: string
  /** JSON con los argumentos. */
  arguments: string
}

export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array'
  description?: string
  enum?: readonly (string | number)[]
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  items?: JsonSchema
  minimum?: number
  maximum?: number
  additionalProperties?: boolean
}

export interface AssistantToolDefinition {
  type: 'function'
  function: { name: AssistantToolName; description: string; parameters: JsonSchema }
}

/** Todas las tipologías de la galería (mismo orden que el motor). */
export const TYPOLOGY_IDS = [
  'fixed',
  'casement',
  'casement_out',
  'tilt_turn',
  'tilt',
  'awning',
  'casement_double',
  'fixed_casement',
  'fixed_tilt_turn',
  'casement_transom',
  'fixed_awning_bottom',
  'fixed_3',
  'casement_fixed_casement',
  'door',
  'door_double',
  'door_sidelight',
  'door_transom',
  'arch',
  'trapezoid',
  'triangle',
  'sliding_2',
  'sliding_2_fixed',
  'sliding_3',
  'sliding_3_rail',
  'sliding_4',
  'sliding_mono',
] as const satisfies readonly TypologyId[]

export const OPENING_KINDS = ['fixed', 'casement', 'tilt_turn', 'tilt', 'awning', 'door'] as const satisfies readonly OpeningKind[]

/** Destinos de navegación y su ruta. */
export const NAV_ROUTES = {
  inicio: '/inicio',
  cotizaciones: '/cotizaciones',
  clientes: '/clientes',
  taller: '/taller',
  catalogo: '/catalogo',
  documentos: '/documentos',
  ajustes: '/ajustes/empresa',
  empresa: '/ajustes/empresa',
  precios: '/ajustes/precios',
  plan: '/ajustes/plan',
  equipo: '/ajustes/equipo',
} as const

export type NavTarget = keyof typeof NAV_ROUTES

export const NAV_LABELS: Record<NavTarget, string> = {
  inicio: 'Inicio',
  cotizaciones: 'Cotizaciones',
  clientes: 'Clientes',
  taller: 'Taller',
  catalogo: 'Catálogo',
  documentos: 'Documentos',
  ajustes: 'Ajustes',
  empresa: 'Ajustes de empresa',
  precios: 'Ajustes de precios',
  plan: 'Plan y facturación',
  equipo: 'Equipo',
}

// Argumentos de cada herramienta (el navegador los recibe ya normalizados con `coerceToolArgs`).

/** A qué ventanas aplica: referencias («V2», «#1» = primera, «#-1» = última) o todas. Sin nada = la seleccionada. */
export interface ItemTarget {
  ref?: string
  items?: string[]
  all?: boolean
}
export interface CreateQuoteArgs {
  title?: string
  client?: string
}
export interface OpenQuoteArgs {
  number?: number
  query?: string
}
export interface AddWindowArgs {
  typology?: TypologyId | string
  width?: number
  height?: number
  qty?: number
  line?: string
  color?: string
  color_in?: string
  glass?: string
  location?: string
  name?: string
}
export interface UpdateWindowArgs extends ItemTarget {
  width?: number
  height?: number
  line?: string
  color?: string
  color_in?: string
  glass?: string
  /** Paño al que aplica la apertura: 1 = primero (izquierda/arriba), -1 = último. */
  pane?: number
  opening?: OpeningKind
  hinge?: 'left' | 'right'
  direction?: 'in' | 'out'
  qty?: number
  location?: string
  name?: string
  typology?: TypologyId | string
}
export interface DuplicateWindowArgs {
  ref?: string
  copies?: number
}
export type RemoveWindowArgs = ItemTarget
export interface SetDiscountArgs {
  percent: number
}
export interface SetTitleArgs {
  title: string
}
export interface SetClientArgs {
  name?: string
  email?: string
  phone?: string
  rut?: string
  /** Quitar el cliente de la cotización. */
  clear?: boolean
}
export interface ExplainPriceArgs {
  ref?: string
}
export interface ShowDocumentArgs {
  view?: 'document' | 'design'
}
export interface SendQuoteArgs {
  channel?: 'link' | 'email' | 'whatsapp'
  to?: string
  message?: string
}
export interface NavigateArgs {
  to: NavTarget
}
export interface SearchArgs {
  query: string
  kind?: 'quotes' | 'clients' | 'all'
}

export interface AssistantToolArgs {
  create_quote: CreateQuoteArgs
  open_quote: OpenQuoteArgs
  add_window: AddWindowArgs
  update_window: UpdateWindowArgs
  duplicate_window: DuplicateWindowArgs
  remove_window: RemoveWindowArgs
  set_discount: SetDiscountArgs
  set_title: SetTitleArgs
  set_client: SetClientArgs
  explain_price: ExplainPriceArgs
  show_document: ShowDocumentArgs
  send_quote: SendQuoteArgs
  navigate: NavigateArgs
  search: SearchArgs
}

/** Herramientas que operan sobre la cotización abierta (si no hay, el navegador la crea o la espera). */
export const EDITOR_TOOLS: readonly AssistantToolName[] = [
  'add_window',
  'update_window',
  'duplicate_window',
  'remove_window',
  'set_discount',
  'set_title',
  'set_client',
  'explain_price',
  'show_document',
  'send_quote',
]

/** Efectos externos: piden tu visto bueno antes de ejecutarse. */
export const APPROVAL_TOOLS: readonly AssistantToolName[] = ['send_quote']

const target = {
  ref: { type: 'string', description: 'Una ventana: «V2». También «#1» (primera) o «#-1» (última).' },
  items: { type: 'array', items: { type: 'string' }, description: 'Varias ventanas: ["V1", "V3"].' },
  all: { type: 'boolean', description: 'true = todas las ventanas de la cotización.' },
} satisfies Record<string, JsonSchema>

const design = {
  width: { type: 'number', description: 'Ancho exterior en mm (convierte cm o m a mm).', minimum: 100, maximum: 20000 },
  height: { type: 'number', description: 'Alto exterior en mm.', minimum: 100, maximum: 20000 },
  line: { type: 'string', description: 'Línea o serie de perfiles por su nombre («PRO6004», «Serie 70»). Omitir = la por defecto.' },
  color: { type: 'string', description: 'Color (exterior si es bicolor) por su nombre: «blanco», «nogal», «antracita».' },
  color_in: { type: 'string', description: 'Color interior solo si es bicolor.' },
  glass: { type: 'string', description: 'Vidrio por su nombre o tipo: «termopanel» (DVH), «DVH 5+12+5», «laminado», «templado», «simple», «low-e».' },
  location: { type: 'string', description: 'Ambiente: «Living», «Dormitorio principal», «Baño».' },
} satisfies Record<string, JsonSchema>

export const ASSISTANT_TOOLS: readonly AssistantToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_quote',
      description: 'Crea una cotización nueva y la abre en el editor.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Nombre de la obra: «Casa Pérez · Concepción».' },
          client: { type: 'string', description: 'Nombre del cliente (se busca y, si no existe, se crea).' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_quote',
      description: 'Abre una cotización existente por su número o buscando por obra o cliente.',
      parameters: {
        type: 'object',
        properties: {
          number: { type: 'integer', description: 'Número de la cotización (N° 412 → 412).' },
          query: { type: 'string', description: 'Texto a buscar en obra o cliente si no hay número.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_window',
      description:
        'Agrega una ventana o puerta a la cotización abierta (si no hay una abierta, crea una). Medidas ancho × alto en mm. Lo que no se indique usa los valores por defecto del taller.',
      parameters: {
        type: 'object',
        properties: {
          typology: { type: 'string', enum: TYPOLOGY_IDS, description: 'Tipología de la galería.' },
          ...design,
          qty: { type: 'integer', description: 'Unidades iguales (por defecto 1).', minimum: 1, maximum: 500 },
          name: { type: 'string', description: 'Nombre opcional: «Ventana living».' },
        },
        required: ['typology', 'width', 'height'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_window',
      description:
        'Cambia una, varias o todas las ventanas: medidas, línea, color, vidrio, apertura de un paño, cantidad, ambiente o tipología. Sin ref/items/all aplica a la ventana seleccionada.',
      parameters: {
        type: 'object',
        properties: {
          ...target,
          ...design,
          pane: { type: 'integer', description: 'Paño para la apertura: 1 = primero (izquierda o arriba), 2 = segundo, -1 = último.' },
          opening: { type: 'string', enum: OPENING_KINDS, description: 'Apertura del paño: fixed, casement (abatible), tilt_turn (oscilobatiente), tilt (oscilante), awning (proyectante), door.' },
          hinge: { type: 'string', enum: ['left', 'right'], description: 'Lado de las bisagras visto desde el interior.' },
          direction: { type: 'string', enum: ['in', 'out'], description: 'Hacia dónde abre la hoja.' },
          qty: { type: 'integer', minimum: 1, maximum: 500 },
          name: { type: 'string' },
          typology: { type: 'string', enum: TYPOLOGY_IDS, description: 'Rehace la ventana con otra tipología conservando medidas, línea, color y vidrio.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'duplicate_window',
      description: 'Duplica una ventana (sin ref, la seleccionada). La copia queda al final con la referencia siguiente.',
      parameters: {
        type: 'object',
        properties: { ref: target.ref, copies: { type: 'integer', minimum: 1, maximum: 20, description: 'Cuántas copias (por defecto 1).' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_window',
      description: 'Quita una o varias ventanas (se puede deshacer).',
      parameters: { type: 'object', properties: { ...target }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_discount',
      description: 'Aplica un descuento porcentual a toda la cotización (0 lo quita).',
      parameters: {
        type: 'object',
        properties: { percent: { type: 'number', minimum: 0, maximum: 100, description: 'Porcentaje: 5 = 5 %.' } },
        required: ['percent'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_title',
      description: 'Cambia el nombre de la obra de la cotización.',
      parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_client',
      description: 'Asigna el cliente de la cotización: lo busca por nombre y, si no existe, lo crea con los datos dados.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          rut: { type: 'string' },
          clear: { type: 'boolean', description: 'true = quitar el cliente.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_price',
      description: 'Devuelve el desglose del precio de una ventana calculado por el motor (materiales, merma, mano de obra, margen). Úsala siempre antes de hablar de cifras.',
      parameters: { type: 'object', properties: { ref: target.ref }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_document',
      description: 'Muestra la vista previa del documento de la cotización (o vuelve al diseño).',
      parameters: {
        type: 'object',
        properties: { view: { type: 'string', enum: ['document', 'design'], description: 'Por defecto document.' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_quote',
      description: 'Envía la cotización al cliente por correo, WhatsApp o enlace. Es un efecto externo: la persona lo confirma antes en pantalla.',
      parameters: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['email', 'whatsapp', 'link'] },
          to: { type: 'string', description: 'Correo del destinatario si es por correo.' },
          message: { type: 'string', description: 'Mensaje breve para el cliente.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Lleva a una pantalla de la app.',
      parameters: {
        type: 'object',
        properties: { to: { type: 'string', enum: Object.keys(NAV_ROUTES) } },
        required: ['to'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Busca cotizaciones o clientes (sin tildes ni mayúsculas) y devuelve los resultados.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, kind: { type: 'string', enum: ['quotes', 'clients', 'all'] } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
]

export function isAssistantTool(name: string): name is AssistantToolName {
  return (ASSISTANT_TOOL_NAMES as readonly string[]).includes(name)
}

// ── Contrato extendido del chat (compatible con AssistantRequest/AssistantResponse) ──

/** Lo que el navegador cuenta de la pantalla, además de lo mínimo del contrato. */
export interface AssistantContext extends Omit<AssistantRequest['context'], never> {
  /** Ref de la ventana seleccionada («V2»). */
  selectedRef?: string
  /** Refs de las ventanas de la cotización abierta, en orden. */
  refs?: string[]
  /** 'local' fuerza el intérprete sin IA. */
  prefer?: 'auto' | 'local'
}

export interface AssistantChatRequest extends AssistantRequest {
  context: AssistantContext
}

export type AssistantLocalReason = 'plan' | 'no_key' | 'no_credits' | 'ai_error' | 'offline' | 'forced'

export interface AssistantChatResponse extends AssistantResponse {
  /** Por qué se respondió en modo local (para un aviso discreto). */
  reason?: AssistantLocalReason
  /** Aviso breve para mostrar en el panel («Te quedaste sin créditos…»). */
  notice?: string
  /** Supuestos del modo local que conviene decir («Tomé 60 × 120 como centímetros»). */
  notes?: string[]
}

/** GET /api/assistant/status — modo y saldo antes del primer mensaje. */
export interface AssistantStatus {
  mode: 'ai' | 'local'
  reason?: AssistantLocalReason
  creditsLeft: number
  creditsIncluded: number
}

/** 1 crédito por cada 1.000 tokens, mínimo 1. */
export function creditsForTokens(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 1
  return Math.max(1, Math.ceil(tokens / 1000))
}

// ── Argumentos: lectura tolerante ───────────────────────────────────────────

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseNumberToken(value.trim().replace(/\s*(mm|%)$/i, ''))
    return parsed === null ? undefined : parsed
  }
  return undefined
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed.slice(0, 300) : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : undefined
}

function compact<T extends object>(obj: T): T {
  for (const key of Object.keys(obj) as (keyof T)[]) if (obj[key] === undefined) delete obj[key]
  return obj
}

function refList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value.map(str).filter((v): v is string => Boolean(v))
    return list.length ? list : undefined
  }
  const single = str(value)
  return single ? single.split(/[,\s]+/).filter(Boolean) : undefined
}

/**
 * Lee los argumentos de una llamada (JSON del modelo o del intérprete) y los normaliza: números
 * como texto → número, enums desconocidos fuera, textos recortados. Nunca lanza.
 */
export function coerceToolArgs<N extends AssistantToolName>(name: N, raw: unknown): AssistantToolArgs[N] {
  let input: Record<string, unknown> = {}
  if (typeof raw === 'string') {
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : {}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed as Record<string, unknown>
    } catch {
      input = {}
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) input = raw as Record<string, unknown>

  const int = (v: unknown) => {
    const n = num(v)
    return n === undefined ? undefined : Math.round(n)
  }
  const targetOf = (): ItemTarget => compact({ ref: str(input.ref), items: refList(input.items), all: bool(input.all) })
  const designOf = () =>
    compact({
      width: num(input.width),
      height: num(input.height),
      line: str(input.line),
      color: str(input.color),
      color_in: str(input.color_in),
      glass: str(input.glass),
      location: str(input.location),
      name: str(input.name),
    })

  let out: unknown
  switch (name) {
    case 'create_quote':
      out = compact({ title: str(input.title), client: str(input.client) })
      break
    case 'open_quote':
      out = compact({ number: int(input.number), query: str(input.query) })
      break
    case 'add_window':
      out = compact({ typology: str(input.typology), ...designOf(), qty: int(input.qty) })
      break
    case 'update_window':
      out = compact({
        ...targetOf(),
        ...designOf(),
        pane: int(input.pane),
        opening: oneOf(input.opening, OPENING_KINDS),
        hinge: oneOf(input.hinge, ['left', 'right'] as const),
        direction: oneOf(input.direction, ['in', 'out'] as const),
        qty: int(input.qty),
        typology: str(input.typology),
      })
      break
    case 'duplicate_window':
      out = compact({ ref: str(input.ref), copies: int(input.copies) })
      break
    case 'remove_window':
      out = targetOf()
      break
    case 'set_discount':
      out = { percent: Math.min(100, Math.max(0, num(input.percent) ?? 0)) }
      break
    case 'set_title':
      out = { title: str(input.title) ?? '' }
      break
    case 'set_client':
      out = compact({ name: str(input.name), email: str(input.email), phone: str(input.phone), rut: str(input.rut), clear: bool(input.clear) })
      break
    case 'explain_price':
      out = compact({ ref: str(input.ref) })
      break
    case 'show_document':
      out = compact({ view: oneOf(input.view, ['document', 'design'] as const) })
      break
    case 'send_quote':
      out = compact({ channel: oneOf(input.channel, ['link', 'email', 'whatsapp'] as const), to: str(input.to), message: str(input.message) })
      break
    case 'navigate':
      out = { to: oneOf(input.to, Object.keys(NAV_ROUTES) as NavTarget[]) ?? navTargetFrom(str(input.to) ?? '') ?? 'inicio' }
      break
    case 'search':
      out = compact({ query: str(input.query) ?? '', kind: oneOf(input.kind, ['quotes', 'clients', 'all'] as const) })
      break
    default:
      out = input
  }
  return out as AssistantToolArgs[N]
}

// ── Texto: plegado sin tildes que conserva posiciones ───────────────────────

const SPECIAL_FOLD: Record<string, string> = {
  '×': 'x',
  '*': 'x',
  ' ': ' ',
  ' ': ' ',
  '–': '-',
  '—': '-',
  '«': '"',
  '»': '"',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '\t': ' ',
  '\r': ' ',
}

/**
 * Minúsculas sin tildes, carácter por carácter: el resultado mide lo mismo que el original, así
 * una posición encontrada en el texto plegado sirve para recortar el original (nombres, títulos).
 */
export function foldSpanish(text: string): string {
  let out = ''
  for (const ch of text) {
    const special = SPECIAL_FOLD[ch]
    if (special !== undefined) {
      out += special
      continue
    }
    const lower = ch.toLowerCase()
    const base = lower.length === ch.length ? lower.normalize('NFD').slice(0, ch.length) : ch
    out += base.length === ch.length ? base : ch
  }
  return out
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
}
const NUMBER_WORD_RE = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')

/** «1.500» → 1500, «1,5» → 1.5, «1.5» → 1.5, «1,500» → 1500, «60» → 60. null si no es número. */
export function parseNumberToken(token: string): number | null {
  const t = token.trim()
  if (!t) return null
  const word = NUMBER_WORDS[foldSpanish(t)]
  if (word !== undefined) return word
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  if (/^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, ''))
  if (/^\d+,\d+$/.test(t)) return Number(t.replace(',', '.'))
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  return null
}

/** «1.500», «1.234,5» (formato chileno, sin depender del ICU). */
export function formatMillimeters(mm: number): string {
  const rounded = Math.round(mm * 10) / 10
  const [int, dec] = Math.abs(rounded).toString().split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${rounded < 0 ? '−' : ''}${grouped}${dec ? `,${dec}` : ''}`
}

// ── Intérprete local ────────────────────────────────────────────────────────

export interface LocalCommandContext {
  route?: string
  /** Hay una cotización abierta en el editor. */
  quoteOpen?: boolean
  /** Ref de la ventana seleccionada. */
  selectedRef?: string
  /** Refs de la cotización abierta, en orden. */
  refs?: string[]
  /** Nombres de colores, vidrios y líneas del catálogo (mejoran el reconocimiento). */
  colors?: string[]
  glasses?: string[]
  lines?: string[]
}

export type LocalCommandResult =
  | { toolCalls: AssistantToolCall[]; notes?: string[] }
  | { reply: string; suggestions?: string[] }

export const LOCAL_EXAMPLES = [
  'Agrega una corredera de 1.500 × 1.200 blanca con termopanel',
  'Dos oscilobatientes de 60 × 120',
  'Duplica la V2',
  'Cambia todo a nogal',
  'Descuento 5 %',
  'Abre la cotización 412',
]

const HELP_REPLY =
  'Puedo armar y cambiar tus cotizaciones. Prueba con «agrega una corredera de 1500 x 1200 blanca con termopanel», «duplica la V2», «cambia todo a nogal», «descuento 5 %» o «abre la cotización 412».'

const UNKNOWN_REPLY =
  'No te entendí del todo. Sin IA entiendo frases como «agrega una corredera de 1500 x 1200», «ancho 1800 en la V1», «duplica la V2» o «descuento 5 %».'

/** ¿Pide deshacer lo último? (lo resuelve el panel con el recibo más reciente). */
export function isUndoCommand(text: string): boolean {
  return /^\s*(deshace(r|lo)?|deshaz(lo)?|deshacelo|vuelve atras|volver atras|revierte(lo)?|revertir|anula(lo)?|no,? eso no|ctrl\s*\+?\s*z)\s*[.!]*\s*$/.test(foldSpanish(text))
}

let localCallCounter = 0
function call<N extends AssistantToolName>(name: N, args: AssistantToolArgs[N]): AssistantToolCall {
  localCallCounter = (localCallCounter + 1) % 1_000_000
  return { id: `local_${Date.now().toString(36)}_${localCallCounter}`, name, arguments: JSON.stringify(args) }
}

/** Texto plegado + original, con posiciones compartidas. */
interface Clause {
  raw: string
  t: string
}

function blank(t: string, start: number, end: number): string {
  return t.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + t.slice(end)
}

const COMMAND_START = new RegExp(
  String.raw`^(?:(?:agrega|agregar|agregue|anade|anadir|suma|sumale|mete|incluye|inserta|crea|crear|pon|ponle|ponla|ponlo|poner|cambia|cambiar|cambiale|cambiala|cambialo|deja|dejala|duplica|duplicar|duplicala|copia|copiala|clona|repite|elimina|eliminar|borra|borrar|quita|quitale|quitar|saca|aplica|aplicale|dale|descuento|abre|abrir|ve|ir|anda|vamos|llevame|muestra|muestrame|mostrar|busca|buscar|buscame|explica|explicame|envia|enviala|enviasela|manda|mandala|mandasela|titulo|cliente|nueva|nuevo|otra|otro|sube|baja|haz|hazla|hazme|modifica|ajusta|actualiza|convierte)\b` +
    String.raw`|(?:una?|otra|otro|${'dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez'}|\d{1,2})\s+(?:ventanas?\s+|puertas?\s+)?(?:correderas?|oscilo[a-z]*|abatibles?|proyectantes?|oscilantes?|fijos?|puertas?|ventanas?|panos?|banderolas?|balconeras?|ventanal(?:es)?|monorriel)\b)`,
)

/** Divide «agrega una corredera … y aplica 5 % de descuento» en dos órdenes. */
function splitClauses(raw: string): Clause[] {
  const t = foldSpanish(raw)
  const cuts: number[] = []
  const re = /(\s*[;\n]+\s*|\.\s+|,\s*(?:y\s+)?|\s+y\s+(?:luego\s+|despues\s+|tambien\s+)?|\s+(?:luego|despues|ademas)\s+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(t))) {
    const end = match.index + match[0].length
    const rest = t.slice(end)
    const hard = /[;\n]/.test(match[0]) || /^\.\s/.test(match[0])
    if (hard || COMMAND_START.test(rest)) cuts.push(match.index, end)
  }
  const clauses: Clause[] = []
  let start = 0
  for (let i = 0; i < cuts.length; i += 2) {
    clauses.push({ raw: raw.slice(start, cuts[i]), t: t.slice(start, cuts[i]) })
    start = cuts[i + 1]
  }
  clauses.push({ raw: raw.slice(start), t: t.slice(start) })
  return clauses.filter((c) => c.t.trim().length > 0)
}

// Medidas -------------------------------------------------------------------

const NUM = String.raw`\d+(?:[.,]\d+)*`
const UNIT = String.raw`(?:mm|milimetros?|cm|centimetros?|mts?|metros?|m)\b\.?`

function unitFactor(unit: string | undefined): number | null {
  if (!unit) return null
  const u = unit.replace(/\.$/, '')
  if (u === 'mm' || u.startsWith('milimetro')) return 1
  if (u === 'cm' || u.startsWith('centimetro')) return 10
  return 1000
}

/** Sin unidad: < 10 son metros, < 400 centímetros, desde 400 milímetros. */
function inferFactor(maxValue: number): { factor: number; label: string | null } {
  if (maxValue < 10) return { factor: 1000, label: 'metros' }
  if (maxValue < 400) return { factor: 10, label: 'centímetros' }
  return { factor: 1, label: null }
}

const mm1 = (n: number) => Math.round(n * 10) / 10

interface SizeResult {
  width?: number
  height?: number
  notes: string[]
  /** Texto plegado con las medidas borradas (para no confundirlas con cantidades). */
  rest: string
}

export function parseSpokenSize(text: string): SizeResult {
  let t = foldSpanish(text)
  const notes: string[] = []
  let width: number | undefined
  let height: number | undefined

  const pair = new RegExp(String.raw`(${NUM})\s*(${UNIT})?\s*(?:x|por)\s*(${NUM})\s*(${UNIT})?`).exec(t)
  if (pair) {
    const a = parseNumberToken(pair[1])
    const b = parseNumberToken(pair[3])
    if (a !== null && b !== null) {
      const fa = unitFactor(pair[2]?.trim()) ?? unitFactor(pair[4]?.trim())
      const fb = unitFactor(pair[4]?.trim()) ?? fa
      if (fa !== null && fb !== null) {
        width = mm1(a * fa)
        height = mm1(b * fb)
      } else {
        const { factor, label } = inferFactor(Math.max(a, b))
        width = mm1(a * factor)
        height = mm1(b * factor)
        if (label) notes.push(`Tomé ${pair[1]} × ${pair[3]} como ${label}: ${formatMillimeters(width)} × ${formatMillimeters(height)} mm.`)
      }
      t = blank(t, pair.index, pair.index + pair[0].length)
    }
  }

  const single = (labelRe: string): { value: number; note?: string } | null => {
    const before = new RegExp(String.raw`\b(?:${labelRe})\s*(?:de|a|en|:|=|es)?\s*(${NUM})\s*(${UNIT})?`).exec(t)
    const after = new RegExp(String.raw`(${NUM})\s*(${UNIT})?\s*(?:de\s+)?(?:${labelRe})\b`).exec(t)
    const m = before ?? after
    if (!m) return null
    const value = parseNumberToken(m[1])
    if (value === null) return null
    t = blank(t, m.index, m.index + m[0].length)
    const factor = unitFactor(m[2]?.trim())
    if (factor !== null) return { value: mm1(value * factor) }
    const inferred = inferFactor(value)
    const mm = mm1(value * inferred.factor)
    return { value: mm, note: inferred.label ? `Tomé ${m[1]} como ${inferred.label}: ${formatMillimeters(mm)} mm.` : undefined }
  }

  if (width === undefined) {
    const w = single('ancho|anchura|de ancho')
    if (w) {
      width = w.value
      if (w.note) notes.push(w.note)
    }
  }
  if (height === undefined) {
    const h = single('alto|altura|de alto')
    if (h) {
      height = h.value
      if (h.note) notes.push(h.note)
    }
  }
  // «una corredera de 1500» → solo ancho.
  if (width === undefined && height === undefined) {
    const lone = new RegExp(String.raw`\b(?:de|mide|medida)\s+(${NUM})\s*(${UNIT})?(?!\s*(?:%|por\s*ciento|unidades|u\b))`).exec(t)
    if (lone) {
      const value = parseNumberToken(lone[1])
      const explicitFactor = unitFactor(lone[2]?.trim())
      if (value !== null && (value >= 30 || explicitFactor !== null)) {
        const factor = explicitFactor ?? inferFactor(value).factor
        width = mm1(value * factor)
        t = blank(t, lone.index, lone.index + lone[0].length)
      }
    }
  }
  return { width, height, notes, rest: t }
}

// Tipologías ----------------------------------------------------------------

const TYPOLOGY_PATTERNS: [RegExp, TypologyId][] = [
  [/\b(3|tres)\s+rieles\b|\btriple\s+riel\b|\btelescopica(s)?\b/, 'sliding_3_rail'],
  [/\bmono\s*-?\s*r?riel(es)?\b|\bun\s+riel\b/, 'sliding_mono'],
  [/\bcorredera(s)?\s+(de\s+)?(4|cuatro)\s+hojas\b/, 'sliding_4'],
  [/\bcorredera(s)?\s+(de\s+)?(3|tres)\s+hojas\b/, 'sliding_3'],
  [/\bcorredera(s)?\s+(de\s+)?(una|1)\s+hoja\b|\bcorredera(s)?\s+(con|y|\+|mas)\s+(un\s+)?(pano\s+)?fijo\b|\bhoja\s*(\+|y|con|mas)\s*fijo\b/, 'sliding_2_fixed'],
  [/\bcorredera(s)?\b|\bdeslizante(s)?\b|\bcorrediza(s)?\b/, 'sliding_2'],
  [/\bpuerta(s)?\s+(con\s+)?(un\s+)?(fijo\s+)?lateral(es)?\b|\bpuerta(s)?\s+(con|y|\+|mas)\s+(un\s+)?fijo\b/, 'door_sidelight'],
  [/\bpuerta(s)?\s+(con\s+)?sobreluz\b/, 'door_transom'],
  [/\bpuerta(s)?\s+(de\s+)?(2|dos)\s+hojas\b|\bpuerta(s)?\s+doble(s)?\b|\bdoble\s+puerta\b|\bpuerta(s)?\s+frances(a|as)\b/, 'door_double'],
  [/\bpuerta(s)?\b|\bbalconera(s)?\b/, 'door'],
  [/\babatible(s)?\s*(\+|y|con|mas)\s*fijo\s*(\+|y|con|mas)\s*abatible(s)?\b/, 'casement_fixed_casement'],
  [/\babatible(s)?\s+(con\s+)?sobreluz\b/, 'casement_transom'],
  [/\bfijo\s*(\+|y|con|mas)\s*oscilo\s*-?\s*batiente(s)?\b|\boscilo\s*-?\s*batiente(s)?\s*(\+|y|con|mas)\s*fijo\b/, 'fixed_tilt_turn'],
  [/\bfijo\s*(\+|y|con|mas)\s*(abatible|batiente)\b|\b(abatible|batiente)\s*(\+|y|con|mas)\s*fijo\b/, 'fixed_casement'],
  [/\bfijo\s*(\+|y|con|mas)\s*proyectante\b|\bproyectante\s+(abajo|inferior)\b/, 'fixed_awning_bottom'],
  [/\b(3|tres)\s+panos\s+fijos\b|\bventanal\s+fijo\b/, 'fixed_3'],
  [/\b(abatible|batiente)(s)?\s+(de\s+)?(2|dos)\s+hojas\b|\b(abatible|ventana)(s)?\s+(de\s+)?(doble\s+hoja|frances(a|as))\b|\bdoble\s+hoja\b/, 'casement_double'],
  [/\b(abatible|batiente)(s)?\s+(hacia\s+)?(afuera|fuera|al\s+exterior|exterior(es)?)\b/, 'casement_out'],
  [/\boscilo\s*-?\s*batiente(s)?\b|\boscilo\b/, 'tilt_turn'],
  [/\boscilante(s)?\b|\bbanderola(s)?\b/, 'tilt'],
  [/\bproyectante(s)?\b|\bproyectable(s)?\b/, 'awning'],
  [/\babatible(s)?\b|\babatir\b|\bbatiente(s)?\b/, 'casement'],
  [/\bmedio\s+punto\b|\barco(s)?\b/, 'arch'],
  [/\btrapecio(s)?\b|\birregular(es)?\b/, 'trapezoid'],
  [/\btriangul(o|os|ar|ares)\b|\bfronton\b/, 'triangle'],
  [/\b(pano(s)?\s+)?fijo(s)?\b/, 'fixed'],
]

/** Tipologías de una sola hoja que equivalen a una apertura. */
const SIMPLE_OPENING: Partial<Record<TypologyId, OpeningKind>> = {
  fixed: 'fixed',
  casement: 'casement',
  tilt_turn: 'tilt_turn',
  tilt: 'tilt',
  awning: 'awning',
  door: 'door',
}

export function detectTypology(text: string): { id: TypologyId; index: number; length: number } | null {
  const t = foldSpanish(text)
  for (const [re, id] of TYPOLOGY_PATTERNS) {
    const m = re.exec(t)
    if (m) return { id, index: m.index, length: m[0].length }
  }
  return null
}

// Colores, vidrios, líneas ---------------------------------------------------

const BUILTIN_COLORS = [
  'blanco',
  'nogal oscuro',
  'nogal claro',
  'nogal',
  'antracita',
  'negro mate',
  'negro',
  'roble dorado',
  'roble gris',
  'roble natural',
  'roble',
  'grafito',
  'winchester',
  'caoba',
  'gris',
  'titanio',
  'bronce',
  'embero',
  'colonial',
  'wengue',
  'lenga',
  'peltre',
  'anteak',
  'golden oak',
  'mate',
]
const COLOR_ALIASES: Record<string, string> = { 'golden oak': 'roble dorado' }

function inflections(word: string): string[] {
  // «blanco» → blanca, blancos, blancas; aplica a la última palabra.
  const parts = word.split(' ')
  const last = parts.pop() ?? ''
  const head = parts.length ? `${parts.join(' ')} ` : ''
  const forms = new Set([word])
  if (/o$/.test(last)) for (const end of ['a', 'os', 'as']) forms.add(head + last.slice(0, -1) + end)
  else if (/[aeiou]$/.test(last)) forms.add(`${word}s`)
  else forms.add(`${word}es`)
  return [...forms]
}

interface Vocabulary {
  /** forma plegada → nombre a devolver */
  colors: [string, string][]
  lines: [string, string][]
}

function buildVocabulary(context: LocalCommandContext): Vocabulary {
  const colors = new Map<string, string>()
  for (const name of context.colors ?? []) {
    const folded = foldSpanish(name).trim()
    if (folded) for (const form of inflections(folded)) colors.set(form, name)
  }
  for (const name of BUILTIN_COLORS) {
    for (const form of inflections(name)) if (!colors.has(form)) colors.set(form, COLOR_ALIASES[name] ?? name)
  }
  const lines = new Map<string, string>()
  for (const name of context.lines ?? []) {
    const folded = foldSpanish(name).trim()
    if (folded.length >= 3) lines.set(folded, name)
  }
  const byLength = (a: [string, string], b: [string, string]) => b[0].length - a[0].length
  return { colors: [...colors].sort(byLength), lines: [...lines].sort(byLength) }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function findColor(t: string, vocab: Vocabulary, from = 0): { name: string; index: number; length: number } | null {
  let best: { name: string; index: number; length: number } | null = null
  for (const [form, name] of vocab.colors) {
    const re = new RegExp(String.raw`(?:^|[^a-z0-9])(${escapeRe(form)})(?![a-z0-9])`, 'g')
    re.lastIndex = from
    const m = re.exec(t)
    if (m) {
      const index = m.index + m[0].length - m[1].length
      if (!best || index < best.index || (index === best.index && form.length > best.length)) best = { name, index, length: form.length }
    }
  }
  return best
}

interface ColorResult {
  color?: string
  colorIn?: string
}

function parseColors(t: string, vocab: Vocabulary): ColorResult {
  const outside = /\b(por\s+fuera|exterior|afuera)\b/.exec(t)
  const inside = /\b(por\s+dentro|interior|adentro)\b/.exec(t)
  const first = findColor(t, vocab)
  if (!first) return {}
  const second = findColor(t, vocab, first.index + first.length)
  if (second && (outside || inside || /\bbicolor\b/.test(t) || /\//.test(t.slice(first.index, second.index + 1)))) {
    // «nogal por fuera y blanco por dentro» / «blanco por dentro, nogal por fuera» / «bicolor nogal/blanco»
    if (inside && outside && inside.index < outside.index && first.index < inside.index + 20 && first.index < outside.index) {
      return { color: second.name, colorIn: first.name }
    }
    if (inside && !outside && first.index > inside.index) return { color: second.name, colorIn: first.name }
    return { color: first.name, colorIn: second.name }
  }
  return { color: first.name }
}

const GLASS_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/\b(?:dvh|termo\s*panel|thermo\s*panel|doble\s+vidri(?:o|ado)(?:\s+hermetico)?)\s*(?:de\s+)?(\d{1,2}\s*\+\s*\d{1,2}\s*\+\s*\d{1,2})/, (m) => `DVH ${m[1].replace(/\s/g, '')}`],
  [/\b(low\s*-?\s*e|lowe|baja\s+emisividad)\b/, () => 'low-e'],
  [/\b(termo\s*panel(es)?|thermo\s*panel(es)?|dvh|doble\s+vidri(o|ado)|doble\s+hermetico|vidrio\s+doble)\b/, () => 'termopanel'],
  [/\blaminado(s)?\s*(\d\s*\+\s*\d)?/, (m) => (m[2] ? `laminado ${m[2].replace(/\s/g, '')}` : 'laminado')],
  [/\b(vidrio\s+de\s+)?seguridad\b/, () => 'laminado'],
  [/\btemplado(s)?\b/, () => 'templado'],
  [/\b(empavonado|satinado|esmerilado|opaco|catedral)\b/, (m) => m[1]],
  [/\b(vidrio\s+)?(simple|monolitico|incoloro|transparente)(\s+(de\s+)?(\d)\s*mm)?\b/, (m) => (m[5] ? `simple ${m[5]} mm` : 'simple')],
  [/\breflectivo\b/, () => 'reflectivo'],
]

function parseGlass(t: string): string | undefined {
  for (const [re, pick] of GLASS_PATTERNS) {
    const m = re.exec(t)
    if (m) return pick(m)
  }
  const generic = /\bvidrio\s+([a-z0-9+]+(?:\s+[a-z0-9+]+)?)/.exec(t)
  if (generic && !/^(de|del|a|en|con|y|para)\b/.test(generic[1])) return generic[1]
  return undefined
}

function parseLine(c: Clause, vocab: Vocabulary): string | undefined {
  // Primero los nombres exactos del catálogo (los más largos ganan: «Serie 60 Practicable»).
  for (const [form, name] of vocab.lines) {
    if (new RegExp(String.raw`(?:^|[^a-z0-9])${escapeRe(form)}(?![a-z0-9])`).test(c.t)) return name
  }
  const m = /\b(linea|serie|perfil(?:es)?)\s+(?:de\s+)?([a-z0-9][a-z0-9.+-]*(?:\s+[a-z0-9][a-z0-9.+-]*){0,3})/.exec(c.t)
  if (!m) return undefined
  // Hasta 4 palabras, cortando en la primera que ya es otra cosa (color, vidrio, preposición).
  const stop = /^(de|del|en|con|y|para|a|al|la|el|las|los|por|termopanel|thermopanel|dvh|laminado|templado|simple|vidrio|blanc[oa]s?|nogal|antracita|negr[oa]s?)$/
  const start = m.index + m[0].length - m[2].length
  let end = start
  let kept = 0
  for (const w of m[2].matchAll(/\S+/g)) {
    if (stop.test(w[0]) || (kept > 0 && findColor(w[0], vocab)?.index === 0)) break
    end = start + (w.index ?? 0) + w[0].length
    kept++
  }
  if (!kept) return undefined
  const value = c.raw.slice(start, end).trim()
  return /^\d/.test(value) && m[1] === 'serie' ? `Serie ${value}` : value
}

// Ambientes -----------------------------------------------------------------

const ROOMS =
  'living comedor|living|comedor|cocina|bano|dormitorio|pieza|habitacion|logia|terraza|pasillo|hall|escalera|oficina|estudio|entrada|acceso|lavanderia|quincho|patio|bodega|garage|garaje|sala de estar|sala|estar|walk-in|closet|segundo piso|primer piso|fachada|balcon'
const ROOM_QUALIFIER = String.raw`(?:\s+(?:principal|de\s+servicio|de\s+visitas?|de\s+los\s+ninos|de\s+ninos|matrimonial|grande|chic[oa]|\d|uno|dos|tres|norte|sur|oriente|poniente|del\s+segundo\s+piso))?`

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function parseLocation(c: Clause): string | undefined {
  const room = new RegExp(String.raw`\b(?:${ROOMS})${ROOM_QUALIFIER}\b`).exec(c.t)
  if (room) return capitalize(c.raw.slice(room.index, room.index + room[0].length).trim().replace(/\s+/g, ' '))
  const explicit = /\b(?:ambiente|ubicacion|recinto)\s*(?::|=|es|en)?\s*([a-z][a-z ]{1,30}?)(?=\s*(?:,|;|$|\by\b|\bcon\b|\bde\s+\d))/.exec(c.t)
  if (!explicit) return undefined
  const start = explicit.index + explicit[0].length - explicit[1].length
  return capitalize(c.raw.slice(start, start + explicit[1].length).trim().replace(/\s+/g, ' '))
}

// Referencias ---------------------------------------------------------------

interface TargetResult extends ItemTarget {
  found: boolean
}

function parseTarget(t: string): TargetResult {
  if (/\b(todas|todos|todo|toda la (obra|cotizacion)|cada (una|ventana))\b/.test(t)) return { all: true, found: true }
  const range = /\bv\s*-?\s*(\d{1,3})\s*(?:a|al|hasta)\s*(?:la\s+)?v\s*-?\s*(\d{1,3})\b/.exec(t)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (b >= a && b - a < 60) {
      const items = Array.from({ length: b - a + 1 }, (_, i) => `V${a + i}`)
      return { items, found: true }
    }
  }
  const refs = [
    ...t.matchAll(/\b(?:v|ventana|item)\s*-?\s*(?:n(?:ro|o|°|º)?\.?\s*)?(\d{1,3})\b(?!\s*(?:hojas?|panos?|rieles?|veces|copias|unidades|mm|cm|m\b|metros?|x\s*\d|por\s+\d|[.,]\d))/g),
  ].map((m) => `V${Number(m[1])}`)
  const unique = [...new Set(refs)]
  if (unique.length === 1) return { ref: unique[0], found: true }
  if (unique.length > 1) return { items: unique, found: true }
  if (/\b(la\s+)?(ultima|ultimo)\b/.test(t)) return { ref: '#-1', found: true }
  if (/\b(la\s+)?(primera|primero)\b/.test(t) && !/\bpano\b|\bhoja\b/.test(t)) return { ref: '#1', found: true }
  const ordinal = /\bla\s+(segunda|tercera|cuarta|quinta)\b(?!\s+(hoja|pano))/.exec(t)
  if (ordinal) return { ref: `#${['segunda', 'tercera', 'cuarta', 'quinta'].indexOf(ordinal[1]) + 2}`, found: true }
  return { found: false }
}

// Cantidades y porcentajes ---------------------------------------------------

function wordOrNumber(s: string): number | null {
  return parseNumberToken(s)
}

function parseQty(rest: string, typologyIndex: number | null): number | undefined {
  const explicit =
    /\b(?:cantidad|unidades)\s*(?:de|:|=|a)?\s*(\d{1,3}|[a-z]+)\b/.exec(rest) ??
    new RegExp(String.raw`\b(\d{1,3}|${NUMBER_WORD_RE})\s+(?:unidades|u\b|piezas|iguales)`).exec(rest) ??
    /\b(?:x|por)\s*(\d{1,2})\b(?!\s*(?:%|por\s*ciento))/.exec(rest) ??
    new RegExp(String.raw`\bque\s+sean\s+(\d{1,3}|${NUMBER_WORD_RE})\b`).exec(rest)
  if (explicit) {
    const n = wordOrNumber(explicit[1])
    if (n !== null && n >= 1 && n <= 500) return Math.round(n)
  }
  if (typologyIndex !== null) {
    const before = rest.slice(Math.max(0, typologyIndex - 24), typologyIndex)
    const m = new RegExp(String.raw`(?:^|\s)(\d{1,3}|${NUMBER_WORD_RE})\s+(?:ventanas?\s+|puertas?\s+)?$`).exec(before)
    if (m) {
      const n = wordOrNumber(m[1])
      if (n !== null && n >= 1 && n <= 500) return Math.round(n)
    }
  }
  return undefined
}

/**
 * Porcentaje de descuento pedido. Nunca recorta a 100: un número que no cabe en 0–100 o que
 * parece un monto en pesos se devuelve como duda para preguntar, no como descuento.
 * - 'over100': «150 %» (no existe un descuento así).
 * - 'amount': «descuento de 20.000», «de 50000 pesos», «de $20.000», «de 20 lucas», «de 20 mil».
 */
type PercentReading = number | 'over100' | 'amount' | null

function parsePercent(t: string): PercentReading {
  const explicit = new RegExp(String.raw`(\d+(?:[.,]\d+)*|${NUMBER_WORD_RE})\s*(?:%|por\s*ciento|porciento)`).exec(t)
  if (explicit) {
    const n = parseNumberToken(explicit[1])
    if (n === null) return null
    return n > 100 ? 'over100' : Math.max(0, n)
  }
  // Sin «%»: solo vale un número simple entre 0 y 100. Pesos, «$», «mil», «lucas» o punto de
  // miles indican un monto: el descuento del documento es porcentual, así que se pregunta.
  const loose = new RegExp(
    String.raw`\b(?:descuento|dcto|dscto|desc)\.?\s*(?:de(?:l)?|:|=|a(?:l)?)?\s*(?:un\s+)?(\$\s*)?(\d+(?:[.,]\d+)*|${NUMBER_WORD_RE})(\s*(?:pesos?|clp|lucas?|mil|k))?\b`,
  ).exec(t)
  if (!loose) return null
  const [, currency, token, money] = loose
  if (currency || money || /^\d{1,3}([.,]\d{3})+$/.test(token)) return 'amount'
  const n = parseNumberToken(token)
  if (n === null) return /^\d/.test(token) ? 'amount' : null
  return n > 100 ? 'amount' : Math.max(0, n)
}

const DISCOUNT_AMOUNT_REPLY =
  'El descuento se aplica en porcentaje y eso parece un monto en pesos. ¿Cuánto es en %? Por ejemplo: «descuento 5 %».'
const DISCOUNT_OVER_REPLY = 'Un descuento no puede pasar de 100 %. ¿Cuánto aplico? Por ejemplo: «descuento 5 %».'

// Navegación ----------------------------------------------------------------

const NAV_WORDS: [RegExp, NavTarget][] = [
  [/\b(ajustes|configuracion)\s+de\s+precios?\b|\bmargen(es)?\b|\bmano de obra\b/, 'precios'],
  [/\b(plan|planes|facturacion|suscripcion|mi plan|pagos?)\b/, 'plan'],
  [/\b(equipo|usuarios|personas|invitar)\b/, 'equipo'],
  [/\b(datos de (la )?empresa|mi empresa|empresa|logo)\b/, 'empresa'],
  [/\b(ajustes|configuracion|preferencias|opciones)\b/, 'ajustes'],
  [/\b(inicio|home|portada|escritorio|resumen)\b/, 'inicio'],
  [/\b(cotizaciones|presupuestos|mis cotizaciones)\b/, 'cotizaciones'],
  [/\b(clientes|mis clientes)\b/, 'clientes'],
  [/\b(taller|produccion|ordenes de trabajo|ots|fabricacion)\b/, 'taller'],
  [/\b(catalogo|marcas|perfiles|lineas|lista de precios|mis precios)\b/, 'catalogo'],
  [/\b(documentos|plantillas|disenos de documentos?)\b/, 'documentos'],
]

function navTargetFrom(text: string): NavTarget | undefined {
  const t = foldSpanish(text)
  for (const [re, to] of NAV_WORDS) if (re.test(t)) return to
  return undefined
}

const NAV_VERB = /\b(ir|ve|vete|vamos|anda|llevame|lleva|abre|abreme|abrir|muestra|muestrame|mostrar|ver|quiero ver|entra|entrar|pasa a|cambia a)\b/

// Cliente, título -----------------------------------------------------------

function sliceRaw(c: Clause, start: number, end = c.raw.length): string {
  return c.raw
    .slice(start, end)
    .trim()
    .replace(/^["'«“]+|["'»”.,;:!?]+$/g, '')
    .trim()
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const PHONE_RE = /(\+?56\s*)?9\s*\d{4}\s*\d{4}\b/
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/

function parseClientValue(c: Clause, start: number): SetClientArgs | null {
  const segment = c.raw.slice(start)
  const email = EMAIL_RE.exec(segment)?.[0]
  const phone = PHONE_RE.exec(segment)?.[0]?.replace(/\s+/g, ' ')
  const rut = RUT_RE.exec(segment)?.[0]
  const t = c.t.slice(start)
  const stop = /\s*(?:,|;|\bcon\s+(?:correo|mail|email|telefono|fono|rut)\b|\bcorreo\b|\bmail\b|\bemail\b|\btelefono\b|\bfono\b|\brut\b|\by\s+(?:agrega|aplica|pon|cambia|duplica|descuento))/.exec(t)
  const nameEnd = stop ? stop.index : t.length
  let name = sliceRaw(c, start, start + nameEnd)
  if (email) name = name.replace(email, '').trim()
  if (phone) name = name.replace(phone, '').trim()
  if (rut) name = name.replace(rut, '').trim()
  name = name.replace(/^(es|a|al|para|:|=)\s+/i, '').trim()
  if (!name && !email) return null
  return compact({ name: name || undefined, email, phone, rut })
}

// Clasificación de cada orden ------------------------------------------------

const ADD_VERB =
  /\b(agrega(r|me|le)?|agregue|anade|anadir|anademe|suma(r|le)?|mete(r|le)?|incluye|incluir|inserta(r)?|crea(r)?|nueva|nuevo|otra|otro|quiero|necesito|cotiza(r|me)?|dame|hazme|arma(r|me)?|pon(er|me)?|ponle\s+una?|falta(n)?)\b/
const UPDATE_VERB =
  /\b(cambia(r|la|lo|le|las|los)?|cambiale|cambialas|pon(le|la|lo|las|los|er)?|deja(la|lo|las|los|r)?|haz(la|lo|las)|modifica(r|la|lo)?|ajusta(r|la|lo)?|actualiza(r|la|lo)?|sube|subele|baja|bajale|aumenta|reduce|achica|agranda|pasa(la|lo|las|los)?|convierte(la|lo)?|que\s+sea(n)?|que\s+tenga(n)?|que\s+abra(n)?|ahora)\b/
const DUPLICATE_VERB = /\b(duplica(r|la|lo|las)?|copia(r|la|lo)?|clona(r|la|lo)?|repite|repetir|repitela)\b|\b(otra|otro|una|uno)\s+igual(es)?\b/
const REMOVE_VERB = /\b(elimina(r|la|lo|las|los)?|borra(r|la|lo|las|los)?|quita(r|la|lo|las|los)?|saca(r|la|lo|las|los)?|remueve)\b/

function parsePane(t: string): number | undefined {
  const n = /\b(?:pano|hoja)\s*(?:n(?:ro|o|°|º)?\.?\s*)?(\d)\b(?!\s*hojas)/.exec(t)
  if (n) return Number(n[1])
  const hingeTalk = /bisagra|abr[ae]n?\s+(?:hacia\s+)?(?:a\s+)?la|manilla/.test(t)
  if (!hingeTalk && /\b(pano|hoja|lado)\s+(izquierd[oa]|de\s+la\s+izquierda)\b|\bel\s+de\s+la\s+izquierda\b/.test(t)) return 1
  if (!hingeTalk && /\b(pano|hoja|lado)\s+(derech[oa]|de\s+la\s+derecha)\b|\bel\s+de\s+la\s+derecha\b/.test(t)) return -1
  if (/\b(pano|hoja)\s+(central|del\s+medio|de\s+al\s+medio)\b/.test(t)) return 2
  if (/\b(pano|hoja)\s+(de\s+arriba|superior)\b/.test(t)) return 1
  if (/\b(pano|hoja)\s+(de\s+abajo|inferior)\b/.test(t)) return -1
  const ord = /\b(primer|segundo|tercer|cuarto)\s+(pano|hoja)\b/.exec(t)
  if (ord) return ['primer', 'segundo', 'tercer', 'cuarto'].indexOf(ord[1]) + 1
  return undefined
}

function parseOpeningDetails(t: string): Pick<UpdateWindowArgs, 'hinge' | 'direction'> {
  const out: Pick<UpdateWindowArgs, 'hinge' | 'direction'> = {}
  if (/\bhacia\s+(afuera|fuera|el\s+exterior)\b|\babra(n)?\s+(hacia\s+)?afuera\b/.test(t)) out.direction = 'out'
  else if (/\bhacia\s+(adentro|dentro|el\s+interior)\b|\babra(n)?\s+(hacia\s+)?adentro\b/.test(t)) out.direction = 'in'
  const hinge = /\b(?:bisagras?|abra|abre|abran|gire)\s+(?:a|al|hacia)\s+(?:la\s+|el\s+lado\s+)?(izquierd[oa]|derech[oa])\b/.exec(t)
  if (hinge) out.hinge = hinge[1].startsWith('izq') ? 'left' : 'right'
  const handle = /\bmanilla\s+(?:a|al|hacia)\s+(?:la\s+)?(izquierd[oa]|derech[oa])\b/.exec(t)
  if (!out.hinge && handle) out.hinge = handle[1].startsWith('izq') ? 'right' : 'left'
  return out
}

interface ClauseOutcome {
  calls: AssistantToolCall[]
  notes: string[]
  reply?: string
}

function parseClause(c: Clause, context: LocalCommandContext, vocab: Vocabulary): ClauseOutcome {
  const t = c.t
  const notes: string[] = []
  const calls: AssistantToolCall[] = []
  const done = (): ClauseOutcome => ({ calls, notes })
  const answer = (reply: string): ClauseOutcome => ({ calls, notes, reply })
  if (!t.trim()) return done()

  // Saludo, ayuda, cortesía.
  if (/^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ola)\b[\s,.!¡]*(marco)?[\s,.!]*$/.test(t)) return answer(`Hola. ${HELP_REPLY}`)
  if (/\b(ayuda|que puedes hacer|que sabes hacer|como funciona(s)?|que haces)\b/.test(t)) return answer(HELP_REPLY)
  if (/^\s*(gracias|muchas gracias|vale|ok|oka|okey|listo|perfecto|genial|buena|bacan|super)\b[\s.!]*$/.test(t)) return answer('De nada. Aquí estoy si necesitas algo más.')
  if (isUndoCommand(c.raw)) return answer('Para deshacer, usa «Deshacer» en el último cambio o Ctrl+Z en el editor.')

  // Enviar (efecto externo: el navegador pide el visto bueno).
  if (/\b(envia(la|sela|selo|r|le)?|manda(la|sela|selo|r|le)?|enviar|mandar|comparte(la)?|compartir)\b/.test(t)) {
    const channel = /\b(whatsapp|wsp|wasap|whats|wa)\b/.test(t)
      ? 'whatsapp'
      : /\b(correo|mail|email|e-mail)\b/.test(t) || EMAIL_RE.test(c.raw)
        ? 'email'
        : /\b(enlace|link|url)\b/.test(t)
          ? 'link'
          : undefined
    calls.push(call('send_quote', compact({ channel, to: EMAIL_RE.exec(c.raw)?.[0] })))
    return done()
  }

  // Descuento.
  if (/\b(descuento|dcto|dscto|rebaja)\b/.test(t)) {
    const pct = parsePercent(t)
    if (pct === 'amount' || pct === 'over100') {
      const reply = pct === 'amount' ? DISCOUNT_AMOUNT_REPLY : DISCOUNT_OVER_REPLY
      // Si otra parte del mensaje trae cambios, la duda viaja como nota: el descuento no se pierde en silencio.
      notes.push(reply)
      return answer(reply)
    }
    if (pct === null && /\b(sin|quita(r|le)?|saca(r|le)?|elimina(r)?|borra(r)?|nada de)\b/.test(t)) {
      calls.push(call('set_discount', { percent: 0 }))
      return done()
    }
    if (pct !== null) {
      calls.push(call('set_discount', { percent: pct }))
      return done()
    }
    return answer('¿Qué descuento aplico? Por ejemplo: «descuento 5 %».')
  }
  const percentOnly = /^\s*(?:aplica(?:le)?|dale|pon(?:le)?)?\s*(?:un\s+)?(\d+(?:[.,]\d+)*)\s*(?:%|por\s*ciento)\s*$/.exec(t)
  if (percentOnly) {
    const n = parseNumberToken(percentOnly[1])
    if (n !== null && n > 100) {
      notes.push(DISCOUNT_OVER_REPLY)
      return answer(DISCOUNT_OVER_REPLY)
    }
    if (n !== null) {
      calls.push(call('set_discount', { percent: n }))
      return done()
    }
  }

  // Cotización nueva (puede traer cliente, título y hasta una ventana).
  const create =
    /\b(?:nueva|nuevo|crea(?:r|me)?|empieza|empezar|inicia(?:r)?|haz(?:me)?|arma(?:r|me)?|abre|abreme)\s+(?:una\s+)?(?:nueva\s+)?(?:cotizacion|cot|presupuesto)\b|\b(?:cotizacion|presupuesto)\s+nuev[oa]\b/.exec(t)
  let createEnd = 0
  if (create) {
    createEnd = create.index + create[0].length
    const after = t.slice(createEnd)
    const args: CreateQuoteArgs = {}
    const stopRe = /\s*(?:,|;|\bcon\s+(?:una|un|dos|tres|cuatro|\d)\b|\by\s+(?:agrega|aplica|pon|una|un)\b|\b(?:una|un|dos|tres)\s+(?:corredera|ventana|puerta|oscilo|abatible|proyectante|fijo))/
    const named = /^\s*(?:llamada|que\s+se\s+llame|con\s+(?:el\s+)?(?:titulo|nombre))\s+/.exec(after)
    const forClient = /^\s*(?:para|de|a\s+nombre\s+de)\s+(?:el\s+cliente\s+|la\s+clienta\s+|el\s+|la\s+)?/.exec(after)
    const pick = (offset: number) => {
      const s = createEnd + offset
      const stop = stopRe.exec(t.slice(s))
      return sliceRaw(c, s, stop ? s + stop.index : undefined)
    }
    if (named) args.title = pick(named[0].length) || undefined
    else if (forClient) {
      const value = pick(forClient[0].length)
      if (value && !detectTypology(value) && parseSpokenSize(value).width === undefined && !/^(el|la)\s/.test(foldSpanish(value))) args.client = value
    }
    calls.push(call('create_quote', compact(args)))
    const remainder = blank(t, 0, createEnd)
    if (!detectTypology(remainder) && parseSpokenSize(remainder).width === undefined) return done()
  }

  if (!create) {
    // Título de la obra.
    const title =
      /\b(?:cambia(?:r)?\s+el\s+(?:titulo|nombre(?:\s+de\s+la\s+obra)?)\s+(?:a|por)|ponle\s+(?:de\s+)?(?:titulo|nombre)|titulo(?:\s+de\s+la\s+obra)?|nombre\s+de\s+la\s+obra|llamala|llamalo|renombra(?:la|lo)?(?:\s+(?:como|a))?|la\s+obra\s+(?:se\s+llama|es))\s*(?::|=|es|a)?\s*/.exec(t)
    if (title) {
      const value = sliceRaw(c, title.index + title[0].length)
      if (value) {
        calls.push(call('set_title', { title: value }))
        return done()
      }
    }

    // Cliente.
    if (/\b(sin\s+cliente|quita(r)?\s+el\s+cliente|saca(r)?\s+el\s+cliente)\b/.test(t)) {
      calls.push(call('set_client', { clear: true }))
      return done()
    }
    const client = /\b(?:el\s+)?(?:cliente|clienta)\s*(?:es|sera|:|=)?\s*|\ba\s+nombre\s+de\s+|\basigna(?:r|le)?\s+(?:el\s+cliente\s+)?|\bpara\s+(?:el\s+cliente|la\s+clienta)\s+/.exec(t)
    if (client && !/\bclientes\b/.test(t) && !/\b(busca|buscar|encuentra)\b/.test(t)) {
      const value = parseClientValue(c, client.index + client[0].length)
      if (value) {
        calls.push(call('set_client', value))
        return done()
      }
    }

    // Precio.
    if (
      /\b(explica(me|r)?|desglose|desglosa(me)?|detalle|por\s*que|de\s+donde\s+sale|como\s+se\s+calcula|cuanto\s+(cuesta|sale|vale)|precio\s+de)\b/.test(t) &&
      /\b(precio|cuesta|sale|vale|caro|cara|costo|calcula|desglose|desglosa(me)?)\b/.test(t)
    ) {
      const target = parseTarget(t)
      calls.push(call('explain_price', compact({ ref: target.ref ?? target.items?.[0] })))
      return done()
    }

    // Documento o diseño.
    if (/\b(documento|vista\s+previa|pdf|como\s+se\s+ve\s+la\s+cotizacion|imprimir|impresion)\b/.test(t) && /\b(muestra(me)?|ver|abre|abrir|ensena(me)?|vista|como|pdf|imprimir|impresion)\b/.test(t)) {
      calls.push(call('show_document', { view: 'document' }))
      return done()
    }
    if (/\b(vuelve|volver|ver|muestra(me)?)\s+(al\s+|el\s+)?(diseno|dibujo|lienzo|editor)\b/.test(t)) {
      calls.push(call('show_document', { view: 'design' }))
      return done()
    }

    // Abrir una cotización por número o por obra/cliente.
    const quoteNumber = /\b(?:cotizacion|cot|presupuesto|coti)\.?\s*(?:n(?:ro|o|°|º|umero)?\.?\s*|#\s*)?(\d{1,7})\b|(?:^|\s)#\s*(\d{1,7})\b|\bn(?:ro|°|º)\.?\s*(\d{1,7})\b/.exec(t)
    if (quoteNumber && !parseTarget(t).found && /\b(abre|abrir|abreme|ve|ir|anda|vamos|llevame|muestra(me)?|ver|trae(me)?|cotizacion|cot|presupuesto|coti)\b/.test(t)) {
      calls.push(call('open_quote', { number: Number(quoteNumber[1] ?? quoteNumber[2] ?? quoteNumber[3]) }))
      return done()
    }
    const openBy = /\b(?:abre|abreme|abrir|muestra(?:me)?|trae(?:me)?)\s+(?:la\s+)?(?:cotizacion|presupuesto)\s+(?:de|del|para)\s+/.exec(t)
    if (openBy) {
      const query = sliceRaw(c, openBy.index + openBy[0].length)
      if (query) {
        calls.push(call('open_quote', { query }))
        return done()
      }
    }

    // Búsqueda.
    const search = /\b(?:busca(?:me)?|buscar|encuentra(?:me)?|encontrar|donde\s+esta(?:n)?)\s+(?:a\s+)?(?:(?:la|el|las|los|una|un)\s+)?(cotizacion(?:es)?|presupuestos?|clientes?|clienta)?\s*(?:de\s+la|de\s+los|de|del|que\s+se\s+llam(?:e|en|a)|llamad[oa]s?|a)?\s*/.exec(t)
    if (search) {
      const query = sliceRaw(c, search.index + search[0].length)
      const kindWord = search[1] ?? ''
      if (query) {
        calls.push(call('search', { query, kind: /client/.test(kindWord) ? 'clients' : /cotiz|presup/.test(kindWord) ? 'quotes' : 'all' }))
        return done()
      }
    }

    // Navegación.
    const nav = navTargetFrom(t)
    if (nav && (NAV_VERB.test(t) || t.trim().split(/\s+/).length <= 2) && !detectTypology(t) && !parseTarget(t).found && !/\b(ancho|alto|altura|medidas?|color|vidrio)\b/.test(t)) {
      calls.push(call('navigate', { to: nav }))
      return done()
    }
  }

  // Ventanas: duplicar, quitar, cambiar o agregar.
  const size = parseSpokenSize(c.raw)
  const w = createEnd ? blank(size.rest, 0, createEnd) : size.rest
  const target = parseTarget(w)

  if (!create && DUPLICATE_VERB.test(w)) {
    const copiesM =
      new RegExp(String.raw`\b(\d{1,2}|${NUMBER_WORD_RE})\s+(?:veces|copias)\b`).exec(w) ??
      /\bx\s*(\d{1,2})\b/.exec(w) ??
      new RegExp(String.raw`\b(${NUMBER_WORD_RE}|\d{1,2})\s+(?:mas|iguales)\b`).exec(w)
    const copies = copiesM ? (parseNumberToken(copiesM[1]) ?? 1) : 1
    calls.push(call('duplicate_window', compact({ ref: target.ref ?? target.items?.[0], copies: copies > 1 ? Math.min(20, copies) : undefined })))
    return done()
  }

  if (!create && REMOVE_VERB.test(w) && (target.found || /\b(esta|esa|la\s+seleccionada|seleccionada|ventana|puerta)\b/.test(w))) {
    calls.push(call('remove_window', compact({ ref: target.ref, items: target.items, all: target.all })))
    return done()
  }

  const typology = detectTypology(w)
  const colors = parseColors(w, vocab)
  const glass = parseGlass(w)
  const line = parseLine({ raw: c.raw, t: w }, vocab)
  const location = parseLocation({ raw: c.raw, t: w })
  const opening = parseOpeningDetails(w)
  const pane = parsePane(w)
  const hasSize = size.width !== undefined || size.height !== undefined
  const bothSizes = size.width !== undefined && size.height !== undefined

  const hasAddVerb = ADD_VERB.test(w)
  const hasUpdateVerb = UPDATE_VERB.test(w)
  const genericWindow = /\b(ventana|ventanas|ventanal|ventanales)\b/.test(w)
  // «paño 2» no es una cantidad ni un artículo.
  const wq = w.replace(/\b(?:pano|hoja)\s*(?:n(?:ro|o|°|º)?\.?\s*)?\d\b/g, (m) => ' '.repeat(m.length))
  const articleBeforeTypology =
    typology !== null &&
    new RegExp(String.raw`(?:^|\s)(?:una?|unas|unos|otra|otro|otras|\d{1,3}|${NUMBER_WORD_RE})\s+(?:ventanas?\s+|puertas?\s+)?$`).test(wq.slice(Math.max(0, typology.index - 24), typology.index))
  const addShape =
    create !== null ||
    (typology !== null && articleBeforeTypology) ||
    (hasAddVerb && (typology !== null || bothSizes || (genericWindow && !target.all)))
  const strongTarget = Boolean(target.ref || target.items)
  const simpleOpening = typology ? SIMPLE_OPENING[typology.id] : undefined
  const qty = parseQty(wq, addShape ? (typology?.index ?? null) : null)
  const hasChange =
    hasSize ||
    colors.color !== undefined ||
    glass !== undefined ||
    line !== undefined ||
    typology !== null ||
    pane !== undefined ||
    opening.direction !== undefined ||
    opening.hinge !== undefined ||
    qty !== undefined ||
    (location !== undefined && /\b(para|en|del|de\s+la|ambiente)\b/.test(w))

  const isUpdate =
    !create &&
    hasChange &&
    (strongTarget ||
      (target.all && !addShape) ||
      (pane !== undefined && simpleOpening !== undefined && !addShape) ||
      (hasUpdateVerb && !addShape) ||
      (!addShape && !typology && !genericWindow && !bothSizes && (hasSize || colors.color !== undefined || glass !== undefined)))

  if (isUpdate) {
    const args: UpdateWindowArgs = compact({
      ref: target.ref,
      items: target.items,
      all: target.all,
      width: size.width,
      height: size.height,
      color: colors.color,
      color_in: colors.colorIn,
      glass,
      line,
      qty,
      location: /\b(para|en|del|de\s+la|ambiente)\b/.test(w) ? location : undefined,
      hinge: opening.hinge,
      direction: opening.direction,
    })
    if (typology) {
      if (simpleOpening && pane !== undefined) {
        args.pane = pane
        args.opening = simpleOpening
      } else if (simpleOpening && typology.id !== 'door') args.opening = simpleOpening
      else args.typology = typology.id
    } else if (pane !== undefined && (opening.hinge || opening.direction)) args.pane = pane
    calls.push(call('update_window', args))
    notes.push(...size.notes)
    return done()
  }

  if (strongTarget && !hasChange && !addShape) {
    return answer('¿Qué le cambio? Por ejemplo: «ancho 1800 en la V1», «cambia la V2 a nogal» o «la V3 con laminado».')
  }

  if (addShape || typology || (genericWindow && hasSize) || bothSizes) {
    const args: AddWindowArgs = compact({
      typology: typology?.id,
      width: size.width,
      height: size.height,
      qty: qty !== undefined && qty > 1 ? qty : undefined,
      line,
      color: colors.color,
      color_in: colors.colorIn,
      glass,
      location,
    })
    calls.push(call('add_window', args))
    notes.push(...size.notes)
    return done()
  }

  return answer(UNKNOWN_REPLY)
}

/**
 * Intérprete local: convierte frases comunes en llamadas a herramientas, sin IA. Si no entiende,
 * responde con una ayuda breve (nunca un error). Varias órdenes en un mensaje → varias llamadas.
 */
export function parseLocalCommand(text: string, context: LocalCommandContext = {}): LocalCommandResult {
  const input = (text ?? '')
    .slice(0, 2000)
    .replace(/^\s*marco\s*[,:]?\s*/i, '')
    .replace(/\b(por\s*favor|porfa(vor)?|porfis|please)\b/gi, (m) => ' '.repeat(m.length))
  if (!input.trim()) return { reply: HELP_REPLY, suggestions: LOCAL_EXAMPLES.slice(0, 3) }
  const vocab = buildVocabulary(context)
  const calls: AssistantToolCall[] = []
  const notes: string[] = []
  let firstReply: string | undefined
  for (const clause of splitClauses(input)) {
    const outcome = parseClause(clause, context, vocab)
    calls.push(...outcome.calls)
    notes.push(...outcome.notes)
    if (outcome.reply && firstReply === undefined) firstReply = outcome.reply
  }
  if (calls.length > 0) return notes.length ? { toolCalls: calls, notes } : { toolCalls: calls }
  return { reply: firstReply ?? UNKNOWN_REPLY, suggestions: LOCAL_EXAMPLES.slice(0, 3) }
}
