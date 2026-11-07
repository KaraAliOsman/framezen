import type { Catalog, Line, Pauta } from '@dekopen/engine'
import type { DocumentPrefs } from '@dekopen/shared'
import type { DocClient, DocOrg } from '../../base/types'

/** Catálogo mínimo y genérico para muestras (marcas y precios de ejemplo). */

const PAUTA: Pauta = { weld: 3, frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20 }

const casementLine: Line = {
  id: 'sample-c60',
  brandId: 'sample-brand',
  name: 'Serie 60',
  kind: 'casement',
  material: 'pvc',
  description: 'Practicable de 60 mm, 4 cámaras y doble burlete',
  depth: 60,
  chambers: 4,
  pauta: PAUTA,
  profiles: {},
  colorIds: ['white', 'anthracite', 'walnut', 'golden-oak'],
  typologyIds: [
    'fixed',
    'casement',
    'tilt_turn',
    'awning',
    'casement_double',
    'fixed_casement',
    'casement_transom',
    'door',
    'door_transom',
  ],
  hardwareRules: [],
  accessoryRules: [],
  source: 'plantilla genérica',
  completeness: 'partial',
}

const slidingLine: Line = {
  id: 'sample-s70',
  brandId: 'sample-brand',
  name: 'Corredera 70',
  kind: 'sliding',
  material: 'pvc',
  description: 'Corredera de 70 mm con felpa y carro doble',
  depth: 70,
  chambers: 3,
  pauta: { ...PAUTA, frameDeduction: 52 },
  profiles: {},
  colorIds: ['white', 'anthracite', 'walnut'],
  typologyIds: ['sliding_2', 'sliding_2_fixed', 'sliding_3', 'sliding_4'],
  hardwareRules: [],
  accessoryRules: [],
  source: 'plantilla genérica',
  completeness: 'partial',
}

export const SAMPLE_CATALOG: Catalog = {
  colors: [
    { id: 'white', name: 'Blanco', hex: '#F6F5F1', code: 'BL' },
    { id: 'anthracite', name: 'Antracita', hex: '#383E42', code: 'AN' },
    { id: 'walnut', name: 'Nogal', hex: '#5B3A22', code: 'NO' },
    { id: 'golden-oak', name: 'Roble dorado', hex: '#A8692E', code: 'RD' },
    { id: 'black', name: 'Negro', hex: '#0E0E10', code: 'NE' },
  ],
  brands: [{ id: 'sample-brand', name: 'Marca de ejemplo', kind: 'profiles', country: 'Chile', monogram: 'ME' }],
  lines: [casementLine, slidingLine],
  profiles: [],
  items: [],
  glass: [
    { id: 'dvh-4-12-4', name: 'Termopanel 4-12-4', kind: 'dvh', thickness: 20, composition: '4 incoloro + 12 cámara + 4 incoloro', pricePerM2: 38000 },
    { id: 'lam-33', name: 'Laminado 3+3 empavonado', kind: 'laminated', thickness: 6, pricePerM2: 42000 },
    { id: 'mono-4', name: 'Simple incoloro 4 mm', kind: 'mono', thickness: 4, pricePerM2: 14000 },
  ],
  brandSettings: [],
}

export const SAMPLE_ORG: DocOrg = {
  name: 'Taller de ejemplo',
  legalName: 'Taller de ejemplo SpA',
  rut: '76.000.000-0',
  address: 'Dirección de ejemplo',
  city: 'Ciudad',
  phone: '+56 9 0000 0000',
  email: 'contacto@ejemplo.cl',
  website: 'ejemplo.cl',
  accent: '#2747C2',
}

/** Cliente ficticio de la muestra. RUT de prueba conocido (12.345.678-5), nunca uno que pueda ser de una persona real. */
export const SAMPLE_CLIENT: DocClient = {
  name: 'Cliente de ejemplo',
  rut: '12.345.678-5',
  email: 'cliente@ejemplo.cl',
  phone: '+56 9 0000 0000',
  address: 'Dirección de ejemplo',
  city: 'Ciudad',
}

export const SAMPLE_PREFS: DocumentPrefs = {
  quoteTemplate: 'esencial',
  catalogTemplate: 'vitrina',
  font: 'instrument',
  showUnitPrice: true,
  showArea: true,
  showGlass: true,
  showLine: true,
  showColorSwatch: true,
  showExteriorView: true,
  paper: 'letter',
  intro: '',
  conditions:
    '- Incluye medición en obra, fabricación, transporte e instalación con sellado perimetral.\n- No incluye albañilería, pintura ni reparación de vanos.\n- Las medidas finales se confirman en la visita técnica; si cambian, ajustamos el precio antes de fabricar.',
  paymentTerms: '50% al aceptar, 50% contra entrega',
  warranty: '10 años en perfiles de PVC, 5 años en herrajes y 2 años en la instalación. No cubre golpes ni mal uso.',
  validityDays: 15,
  leadTimeText: 'Fabricación e instalación en 15 días hábiles desde el pago del anticipo.',
  signatureName: 'Javiera Soto, ventas',
  footer: 'Transferencias: Banco Estado · Cuenta corriente 12345678 · Ventanas del Maule SpA',
}
