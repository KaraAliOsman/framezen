/**
 * Planes de DEKOPEN. Fuente única para landing, facturación y permisos.
 * Precios en CLP netos (+ IVA). Los límites son suaves: nunca se pierde trabajo
 * ni se interrumpe una tarea a medias; lo que no incluye el plan se muestra con
 * su explicación y un botón para mejorar.
 */

export type PlanCode = 'trial' | 'taller' | 'pro' | 'empresa' | 'empresa2x'

export type Feature =
  | 'assistant' // Marco con IA
  | 'client3d' // vista 3D en el portal del cliente
  | 'purchasing' // órdenes de compra a proveedores
  | 'cnc' // exportación para sierras/CNC
  | 'roles' // roles y permisos por persona
  | 'stations' // tablero de estaciones de producción
  | 'field' // terreno: medición e instalación en el teléfono
  | 'multiBranch' // varias sucursales
  | 'custom_templates' // plantillas de documentos propias (a mano o con IA)
  | 'texture_upload' // subir texturas propias (foils) e integrarlas

export interface Plan {
  code: PlanCode
  name: string
  tagline: string
  /** Precio mensual neto CLP pagando mes a mes. */
  monthly: number
  /** Precio mensual neto CLP pagando el año completo. */
  yearlyMonthly: number
  /** null = sin límite. */
  seats: number | null
  aiCredits: number // por mes
  features: Feature[]
  /** Topes por organización y persona (suaves: se explican, nunca cortan un trabajo a medias). */
  limits: PlanLimits
  highlights: string[]
  recommended?: boolean
}

export interface PlanLimits {
  /** Asistentes activos (sin archivar) por organización. Taller: 1, solo con comandos locales. */
  assistants: number
  /** Turnos con IA por persona y día (los comandos locales no cuentan; 0 = sin IA). */
  aiTurnsPerUserDay: number
  /** Créditos de IA que la organización puede gastar por día (protege el saldo del mes). */
  aiCreditsPerOrgDay: number
}

export const TRIAL_DAYS = 14
export const TRIAL_CREDITS = 500

/** La prueba tiene las funciones de Pro con topes diarios acordes a sus 500 créditos. */
export const TRIAL_LIMITS: PlanLimits = { assistants: 3, aiTurnsPerUserDay: 60, aiCreditsPerOrgDay: 200 }

export const PLANS: Record<Exclude<PlanCode, 'trial'>, Plan> = {
  taller: {
    code: 'taller',
    name: 'Taller',
    tagline: 'Para quien cotiza, corta y fabrica.',
    monthly: 39990,
    yearlyMonthly: 35990,
    seats: 1,
    aiCredits: 0,
    features: [],
    limits: { assistants: 1, aiTurnsPerUserDay: 0, aiCreditsPerOrgDay: 0 },
    highlights: [
      'Cotizaciones ilimitadas con todas las marcas',
      'Diseñador de ventanas con precio',
      'Diseños de cotización editables',
      'Portal del cliente con aceptación en línea',
      'OT, optimización de cortes, vidrios, materiales y montaje',
    ],
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    tagline: 'Oficina y taller trabajando juntos.',
    monthly: 69990,
    yearlyMonthly: 59990,
    seats: 3,
    aiCredits: 2000,
    features: ['assistant', 'client3d', 'purchasing', 'cnc', 'custom_templates', 'texture_upload'],
    limits: { assistants: 3, aiTurnsPerUserDay: 150, aiCreditsPerOrgDay: 400 },
    highlights: [
      'Todo lo de Taller',
      'Hasta 3 personas',
      'Marco, tu asistente con IA (2.000 créditos/mes)',
      'Vista 3D para el cliente',
      'Órdenes de compra y exportación para sierras',
    ],
    recommended: true,
  },
  empresa: {
    code: 'empresa',
    name: 'Empresa',
    tagline: 'Fábrica con equipos y estaciones.',
    monthly: 129990,
    yearlyMonthly: 99990,
    seats: null,
    aiCredits: 6000,
    features: ['assistant', 'client3d', 'purchasing', 'cnc', 'custom_templates', 'texture_upload', 'roles', 'stations', 'field', 'multiBranch'],
    limits: { assistants: 8, aiTurnsPerUserDay: 300, aiCreditsPerOrgDay: 1200 },
    highlights: [
      'Todo lo de Pro',
      'Personas ilimitadas con roles',
      'Tablero de producción por estaciones',
      'Marco con 6.000 créditos/mes',
    ],
  },
  empresa2x: {
    code: 'empresa2x',
    name: 'Empresa 2×',
    tagline: 'Alto volumen con IA a fondo.',
    monthly: 149990,
    yearlyMonthly: 129990,
    seats: null,
    aiCredits: 12000,
    features: ['assistant', 'client3d', 'purchasing', 'cnc', 'custom_templates', 'texture_upload', 'roles', 'stations', 'field', 'multiBranch'],
    limits: { assistants: 15, aiTurnsPerUserDay: 500, aiCreditsPerOrgDay: 2400 },
    highlights: ['Todo lo de Empresa', 'Marco con 12.000 créditos/mes'],
  },
}

export const PLAN_ORDER: Exclude<PlanCode, 'trial'>[] = ['taller', 'pro', 'empresa', 'empresa2x']

/** La prueba tiene las funciones de Pro. */
export function planFeatures(code: PlanCode): Feature[] {
  return code === 'trial' ? PLANS.pro.features : PLANS[code].features
}

export function planSeats(code: PlanCode): number | null {
  return code === 'trial' ? PLANS.pro.seats : PLANS[code].seats
}

export function hasFeature(code: PlanCode, feature: Feature): boolean {
  return planFeatures(code).includes(feature)
}

export function planLimits(code: PlanCode): PlanLimits {
  return code === 'trial' ? TRIAL_LIMITS : PLANS[code].limits
}

/** Uso de tokens de una llamada al modelo (`inputTokens` incluye los que vinieron de caché). */
export interface TokenUsage {
  inputTokens: number
  cachedInputTokens?: number
  outputTokens: number
}

/**
 * Créditos de una llamada: ceil((entrada sin caché + 0,02 × entrada en caché + 2 × salida) / 1.000).
 * La salida incluye el razonamiento del modelo. Los comandos locales cuestan 0. El peso de la caché
 * sale de medir turnos reales: con 0,1, la lista de herramientas (ya en caché) pesaba más que todo
 * lo demás y un crédito valía menos de la mitad que en una llamada sin caché.
 */
export function creditsForUsage(usage: TokenUsage): number {
  const input = Math.max(0, Math.floor(usage.inputTokens || 0))
  const cached = Math.min(input, Math.max(0, Math.floor(usage.cachedInputTokens || 0)))
  const output = Math.max(0, Math.floor(usage.outputTokens || 0))
  const weighted = input - cached + 0.02 * cached + 2 * output
  return weighted > 0 ? Math.ceil(weighted / 1000 - 1e-9) : 0
}

export const FEATURE_COPY: Record<Feature, { title: string; plan: Exclude<PlanCode, 'trial'>; why: string }> = {
  assistant: { title: 'Marco con IA', plan: 'pro', why: 'Marco arma cotizaciones completas a partir de un mensaje, una foto o una lista de medidas.' },
  client3d: { title: 'Vista 3D para el cliente', plan: 'pro', why: 'Tu cliente gira la ventana, la ve en su color y la abre antes de aprobar.' },
  purchasing: { title: 'Órdenes de compra', plan: 'pro', why: 'Convierte los materiales de una OT en pedidos por proveedor en un clic.' },
  cnc: { title: 'Exportación para sierras', plan: 'pro', why: 'Envía la lista de cortes optimizada directo a tu sierra o centro de corte.' },
  roles: { title: 'Roles y permisos', plan: 'empresa', why: 'Cada persona ve lo suyo: cotizadores sin costos, taller sin precios.' },
  stations: { title: 'Estaciones de producción', plan: 'empresa', why: 'Sigue cada ventana por corte, soldadura, armado y vidriado.' },
  field: { title: 'Terreno', plan: 'empresa', why: 'Mide vanos e instala con el teléfono; todo vuelve a la obra.' },
  multiBranch: { title: 'Varias sucursales', plan: 'empresa', why: 'Separa obras y números por sucursal con un solo catálogo.' },
  custom_templates: {
    title: 'Plantillas propias',
    plan: 'pro',
    why: 'Crea tus propios diseños de cotización y catálogo, a mano o pidiéndoselos al asistente.',
  },
  texture_upload: {
    title: 'Texturas propias',
    plan: 'pro',
    why: 'Sube la foto de tu foil y tus ventanas se dibujan con esa veta real en cotizaciones y portal.',
  },
}

export type Role = 'owner' | 'estimator' | 'workshop' | 'operator' | 'installer'

export const ROLE_COPY: Record<Role, { name: string; description: string }> = {
  owner: { name: 'Dueño', description: 'Ve y hace todo, incluidos costos, plan y equipo.' },
  estimator: { name: 'Cotizador', description: 'Crea y envía cotizaciones. No ve costos ni márgenes.' },
  workshop: { name: 'Jefe de taller', description: 'Gestiona OT, cortes, vidrios y materiales. No ve precios de venta.' },
  operator: { name: 'Operario', description: 'Ve sus tareas de producción y marca avances.' },
  installer: { name: 'Instalador', description: 'Ve instalaciones asignadas, checklist y fotos.' },
}
