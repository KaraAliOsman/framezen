/**
 * Planes de Framezen. Fuente única para landing, facturación y permisos.
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
  highlights: string[]
  recommended?: boolean
}

export const TRIAL_DAYS = 14
export const TRIAL_CREDITS = 500

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
    highlights: [
      'Cotizaciones ilimitadas con todas las marcas',
      'Diseñador de ventanas y precio al instante',
      'Documentos que venden: 4 diseños editables',
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
    features: ['assistant', 'client3d', 'purchasing', 'cnc'],
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
    features: ['assistant', 'client3d', 'purchasing', 'cnc', 'roles', 'stations', 'field', 'multiBranch'],
    highlights: [
      'Todo lo de Pro',
      'Personas ilimitadas con roles',
      'Tablero de producción por estaciones',
      'Terreno: medición e instalación desde el teléfono',
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
    features: ['assistant', 'client3d', 'purchasing', 'cnc', 'roles', 'stations', 'field', 'multiBranch'],
    highlights: ['Todo lo de Empresa', 'Marco con 12.000 créditos/mes', 'Soporte prioritario'],
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

export const FEATURE_COPY: Record<Feature, { title: string; plan: Exclude<PlanCode, 'trial'>; why: string }> = {
  assistant: { title: 'Marco con IA', plan: 'pro', why: 'Marco arma cotizaciones completas a partir de un mensaje, una foto o una lista de medidas.' },
  client3d: { title: 'Vista 3D para el cliente', plan: 'pro', why: 'Tu cliente gira la ventana, la ve en su color y la abre antes de aprobar.' },
  purchasing: { title: 'Órdenes de compra', plan: 'pro', why: 'Convierte los materiales de una OT en pedidos por proveedor en un clic.' },
  cnc: { title: 'Exportación para sierras', plan: 'pro', why: 'Envía la lista de cortes optimizada directo a tu sierra o centro de corte.' },
  roles: { title: 'Roles y permisos', plan: 'empresa', why: 'Cada persona ve lo suyo: cotizadores sin costos, taller sin precios.' },
  stations: { title: 'Estaciones de producción', plan: 'empresa', why: 'Sigue cada ventana por corte, soldadura, armado y vidriado.' },
  field: { title: 'Terreno', plan: 'empresa', why: 'Mide vanos e instala con el teléfono; todo vuelve a la obra.' },
  multiBranch: { title: 'Varias sucursales', plan: 'empresa', why: 'Separa obras y números por sucursal con un solo catálogo.' },
}

export type Role = 'owner' | 'estimator' | 'workshop' | 'operator' | 'installer'

export const ROLE_COPY: Record<Role, { name: string; description: string }> = {
  owner: { name: 'Dueño', description: 'Ve y hace todo, incluidos costos, plan y equipo.' },
  estimator: { name: 'Cotizador', description: 'Crea y envía cotizaciones. No ve costos ni márgenes.' },
  workshop: { name: 'Jefe de taller', description: 'Gestiona OT, cortes, vidrios y materiales. No ve precios de venta.' },
  operator: { name: 'Operario', description: 'Ve sus tareas de producción y marca avances.' },
  installer: { name: 'Instalador', description: 'Ve instalaciones asignadas, checklist y fotos.' },
}
