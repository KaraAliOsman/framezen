import { describe, expect, it } from 'vitest'
import {
  ALL_SECTION_VARIANTS,
  DOC_ISSUE_CODES,
  DOC_LOCALES,
  DOC_PRESET_IDS,
  DOC_TEXT_FIELDS,
  PALETTE_ROLES,
  SECTION_TONES,
  SECTION_TYPES,
  TEMPLATE_MESSAGES,
  docIssueMessage,
  interpolateTemplateText,
  sectionLabel,
  templateMessages,
  variantLabel,
  type DocIssue,
} from '../../src/templates'

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else Object.assign(out, flatten(v, key))
  }
  return out
}

const params = (text: string) => [...text.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort()

describe('diccionario de plantillas en 7 idiomas', () => {
  const es = flatten(TEMPLATE_MESSAGES.es)

  it('todas las traducciones tienen exactamente las mismas llaves y parámetros que el español', () => {
    for (const locale of DOC_LOCALES) {
      const tr = flatten(TEMPLATE_MESSAGES[locale])
      expect(Object.keys(tr).sort(), locale).toEqual(Object.keys(es).sort())
      for (const [key, text] of Object.entries(tr)) {
        expect(text.trim().length, `${locale}:${key}`).toBeGreaterThan(0)
        expect(params(text), `${locale}:${key}`).toEqual(params(es[key]))
      }
    }
  })

  it('cubre todos los códigos, secciones, variantes, fondos, campos, roles y diseños', () => {
    const m = templateMessages('es')
    for (const code of DOC_ISSUE_CODES) expect(m.issues[code], code).toBeTruthy()
    for (const type of SECTION_TYPES) expect(m.sections[type], type).toBeTruthy()
    for (const v of ALL_SECTION_VARIANTS) expect((m.variants as Record<string, string>)[v], v).toBeTruthy()
    for (const tone of SECTION_TONES) expect(m.tones[tone]).toBeTruthy()
    for (const field of DOC_TEXT_FIELDS) expect(m.textFields[field]).toBeTruthy()
    for (const role of PALETTE_ROLES) expect(m.paletteRoles[role]).toBeTruthy()
    for (const id of DOC_PRESET_IDS) expect(m.presets[id].name).toBeTruthy()
    expect(Object.keys(m.variants).sort()).toEqual([...ALL_SECTION_VARIANTS].sort())
  })

  it('los idiomas no españoles están realmente traducidos', () => {
    for (const locale of DOC_LOCALES.filter((l) => l !== 'es')) {
      const tr = flatten(TEMPLATE_MESSAGES[locale])
      const identical = Object.keys(es).filter((k) => tr[k] === es[k] && !/^(pageSizes|variants\.lookbook|presets\.(luz|patrimonio|sistema|habitar)\.name|issues\.(none)|locales\.)/.test(k) && es[k].length > 20)
      expect(identical, locale).toEqual([])
    }
  })

  it('arma mensajes traducidos con etiquetas legibles', () => {
    const lowContrast: DocIssue = { severity: 'error', code: 'low_contrast', path: [], params: { fg: 'muted', bg: 'surface', ratio: 3.1, min: 4.5 }, message: '' }
    expect(docIssueMessage(lowContrast)).toBe('Poco contraste entre «Texto secundario» y «Fondo suave» (3.1:1; mínimo 4.5:1).')
    expect(docIssueMessage(lowContrast, 'de')).toBe('Zu wenig Kontrast zwischen „Sekundärtext“ und „Dezenter Hintergrund“ (3.1:1; mindestens 4.5:1).')
    const notAllowed: DocIssue = { severity: 'error', code: 'section_not_allowed', path: [], params: { section: 'families', kind: 'quote' }, message: '' }
    expect(docIssueMessage(notAllowed)).toBe('La sección «Familias de productos» no está disponible en cotizaciones.')
    expect(docIssueMessage(notAllowed, 'tr')).toBe('“Ürün aileleri” bölümü tekliflerde kullanılamaz.')
    expect(docIssueMessage({ severity: 'error', code: 'unsafe_text', path: [], params: { reason: 'url' }, message: '' }, 'fr')).toBe('Ce texte ne peut pas contenir de liens ni d’adresses web.')
    expect(docIssueMessage({ severity: 'error', code: 'font_role', path: [], params: { font: 'DM Serif Display', role: 'body' }, message: '' }, 'it')).toBe('Il font DM Serif Display non si può usare per il testo.')
    expect(docIssueMessage({ severity: 'error', code: 'invalid_value', path: [], message: '' }, 'xx')).toBe('Valor no válido.')
  })

  it('etiquetas con respaldo y sin cadena de prototipos', () => {
    expect(sectionLabel('items', 'pt')).toBe('Itens')
    expect(sectionLabel('constructor', 'es')).toBe('constructor')
    expect(variantLabel('per_page', 'en')).toBe('One per page')
    expect(interpolateTemplateText('{a} y {b}', { a: 1 })).toBe('1 y {b}')
  })
})
