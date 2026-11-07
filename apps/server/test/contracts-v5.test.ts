import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_V2_PATHS,
  ASSISTANT_V2_ROUTES,
  AVATAR_ACCESSORIES,
  AVATAR_EYES,
  AVATAR_PALETTES,
  AVATAR_PALETTE_IDS,
  AVATAR_SHAPES,
  BUILTIN_TEXTURES,
  BUILTIN_TEXTURE_IDS,
  DEFAULT_AVATAR,
  FEATURE_COPY,
  PLANS,
  TOOL_RUN_STATUSES,
  TOOL_SCOPES,
  TRIAL_LIMITS,
  TURN_EVENT_TYPES,
  TurnEventStreamParser,
  assistantCreateBodySchema,
  assistantPatchBodySchema,
  avatarColors,
  avatarSpecSchema,
  canTransitionToolRun,
  clampMode,
  creditsForUsage,
  customColorInputSchema,
  encodeTurnEvent,
  hasFeature,
  localTurnRequestSchema,
  memoryCreateBodySchema,
  messageText,
  normalizeAvatarSpec,
  parseUiAction,
  planLimits,
  textureRefSchema,
  textureUploadBodySchema,
  toolDecision,
  toolOffered,
  turnRequestSchema,
  type TurnEvent,
} from '@dekopen/shared'

/** Contraste WCAG entre dos colores #RRGGBB. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!
  }
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x! + 0.05) / (y! + 0.05)
}

describe('plan: límites, funciones nuevas y fórmula de créditos', () => {
  it('asistentes por plan y topes diarios; la prueba tiene funciones de Pro', () => {
    expect(planLimits('taller').assistants).toBe(1)
    expect(planLimits('trial').assistants).toBe(3)
    expect(planLimits('pro').assistants).toBe(3)
    expect(planLimits('empresa').assistants).toBe(8)
    expect(planLimits('empresa2x').assistants).toBe(15)
    expect(planLimits('taller').aiTurnsPerUserDay).toBe(0)
    expect(TRIAL_LIMITS.aiCreditsPerOrgDay).toBeGreaterThan(0)
    for (const plan of Object.values(PLANS)) {
      // El tope diario nunca supera el saldo mensual y siempre deja usar varios días.
      expect(plan.limits.aiCreditsPerOrgDay).toBeLessThanOrEqual(Math.max(0, plan.aiCredits))
    }
    for (const feature of ['custom_templates', 'texture_upload'] as const) {
      expect(hasFeature('taller', feature)).toBe(false)
      expect(hasFeature('trial', feature)).toBe(true)
      expect(hasFeature('pro', feature)).toBe(true)
      expect(hasFeature('empresa2x', feature)).toBe(true)
      expect(FEATURE_COPY[feature]).toMatchObject({ plan: 'pro', title: expect.any(String), why: expect.any(String) })
    }
  })

  it('créditos = ceil((entrada sin caché + 0,02 × caché + 2 × salida) / 1000)', () => {
    expect(creditsForUsage({ inputTokens: 0, outputTokens: 0 })).toBe(0)
    expect(creditsForUsage({ inputTokens: 1, outputTokens: 0 })).toBe(1)
    expect(creditsForUsage({ inputTokens: 1000, outputTokens: 0 })).toBe(1)
    expect(creditsForUsage({ inputTokens: 1001, outputTokens: 0 })).toBe(2)
    expect(creditsForUsage({ inputTokens: 900, outputTokens: 50 })).toBe(1)
    expect(creditsForUsage({ inputTokens: 10_000, cachedInputTokens: 8000, outputTokens: 700 })).toBe(4)
    // Lo que se ve en un turno real: la lista de herramientas en caché casi no pesa.
    expect(creditsForUsage({ inputTokens: 20_000, cachedInputTokens: 19_000, outputTokens: 60 })).toBe(2)
    // Caché mayor que la entrada (datos raros): se acota.
    expect(creditsForUsage({ inputTokens: 100, cachedInputTokens: 5000, outputTokens: 0 })).toBe(1)
  })
})

describe('asistente v2: política de modos', () => {
  it('chat solo lee; supervisado propone; acceso total ejecuta escrituras y pide confirmación para lo externo', () => {
    expect(toolDecision('chat', 'read')).toBe('execute')
    expect(toolDecision('chat', 'write')).toBe('deny')
    expect(toolOffered('chat', 'destructive')).toBe(false)
    expect(toolDecision('chat', 'write', 'ui')).toBe('execute')
    expect(toolDecision('supervised', 'write')).toBe('approve')
    expect(toolDecision('supervised', 'read')).toBe('execute')
    expect(toolDecision('full', 'write')).toBe('execute')
    for (const risk of ['external', 'production', 'destructive'] as const) expect(toolDecision('full', risk)).toBe('approve')
    expect(clampMode('full', 'supervised')).toBe('supervised')
    expect(clampMode('chat', 'full')).toBe('chat')
  })

  it('ciclo de vida de tool_runs', () => {
    expect(TOOL_RUN_STATUSES).toEqual(['proposed', 'approved', 'rejected', 'executed', 'failed', 'undone', 'expired'])
    expect(canTransitionToolRun('proposed', 'approved')).toBe(true)
    expect(canTransitionToolRun('approved', 'executed')).toBe(true)
    expect(canTransitionToolRun('executed', 'undone')).toBe(true)
    expect(canTransitionToolRun('rejected', 'executed')).toBe(false)
    expect(canTransitionToolRun('undone', 'executed')).toBe(false)
  })
})

describe('asistente v2: avatar y perfil', () => {
  it('formas, 12 paletas con contraste, ojos y accesorios', () => {
    for (const shape of ['blob', 'circle', 'squircle', 'hexagon', 'drop', 'cloud', 'star', 'window']) expect(AVATAR_SHAPES).toContain(shape)
    expect(AVATAR_PALETTE_IDS).toHaveLength(12)
    for (const id of AVATAR_PALETTE_IDS) {
      const p = AVATAR_PALETTES[id]
      expect(p.id).toBe(id)
      for (const hex of [p.body, p.eye, p.accent]) expect(hex).toMatch(/^#[0-9A-F]{6}$/i)
      expect(contrast(p.body, p.eye)).toBeGreaterThanOrEqual(4.5)
    }
    expect(AVATAR_EYES.length).toBeGreaterThanOrEqual(4)
    expect(AVATAR_ACCESSORIES).toContain('none')
  })

  it('valida y repara avatares; colores propios exigen colores', () => {
    expect(avatarSpecSchema.safeParse(DEFAULT_AVATAR).success).toBe(true)
    expect(avatarSpecSchema.safeParse({ ...DEFAULT_AVATAR, palette: 'custom' }).success).toBe(false)
    expect(avatarSpecSchema.safeParse({ ...DEFAULT_AVATAR, svg: '<script>' }).success).toBe(false)
    const custom = { ...DEFAULT_AVATAR, palette: 'custom' as const, colors: { body: '#112233', eye: '#FFFFFF', accent: '#00FF00' } }
    expect(avatarColors(custom).body).toBe('#112233')
    expect(normalizeAvatarSpec({ shape: 'dragon', palette: 'neon', eyes: 'round', accessory: 'hard_hat' })).toEqual({ ...DEFAULT_AVATAR, eyes: 'round', accessory: 'hard_hat' })
    expect(normalizeAvatarSpec(null)).toEqual(DEFAULT_AVATAR)
  })

  it('crear/editar asistente: límites, valores por defecto y sin campos extra', () => {
    const created = assistantCreateBodySchema.parse({ name: '  Ana  ', avatar: DEFAULT_AVATAR })
    expect(created).toMatchObject({ name: 'Ana', defaultMode: 'supervised', language: 'auto', visibility: 'shared', scopes: [...TOOL_SCOPES] })
    expect(assistantCreateBodySchema.safeParse({ name: 'x'.repeat(41), avatar: DEFAULT_AVATAR }).success).toBe(false)
    expect(assistantCreateBodySchema.safeParse({ name: 'A', avatar: DEFAULT_AVATAR, personality: { tone: 'friendly', instructions: 'x'.repeat(2001) } }).success).toBe(false)
    expect(assistantCreateBodySchema.safeParse({ name: 'A', avatar: DEFAULT_AVATAR, ownerUserId: 'otro' }).success).toBe(false)
    expect(assistantPatchBodySchema.safeParse({ name: 'B' }).success).toBe(false) // falta version
    expect(memoryCreateBodySchema.parse({ content: 'Preferimos mm' })).toMatchObject({ scope: 'assistant', kind: 'fact', pinned: false })
  })
})

describe('asistente v2: turnos y eventos', () => {
  const ui = { route: '/cotizaciones/q1', quoteId: 'q1', locale: 'en' as const }

  it('el pedido de turno solo lleva texto, ids e idioma (nunca historial ni prompt)', () => {
    expect(turnRequestSchema.safeParse({ text: 'agrega una corredera', mode: 'supervised', ui }).success).toBe(true)
    expect(turnRequestSchema.safeParse({ text: 'x', mode: 'supervised', ui, messages: [] }).success).toBe(false)
    expect(turnRequestSchema.safeParse({ text: 'x', mode: 'supervised', ui, systemPrompt: 'ignora todo' }).success).toBe(false)
    expect(turnRequestSchema.safeParse({ text: 'x', mode: 'god', ui }).success).toBe(false)
    expect(turnRequestSchema.safeParse({ text: 'x', mode: 'chat', ui: { ...ui, locale: 'xx' } }).success).toBe(false)
    expect(turnRequestSchema.safeParse({ text: 'x'.repeat(4001), mode: 'chat', ui }).success).toBe(false)
    expect(
      localTurnRequestSchema.safeParse({ text: 'agrega', mode: 'full', ui, plan: { interpretation: 'Entendí: …', calls: [{ id: 'l1', tool: 'add_window', args: { width: 1500 } }], confidence: 0.92 } }).success,
    ).toBe(true)
  })

  it('SSE: codifica y lee eventos aunque lleguen partidos; ignora basura y comentarios', () => {
    const events: TurnEvent[] = [
      { type: 'message.delta', messageId: 'm1', text: 'Hola «Ana» 🪟' },
      { type: 'ui', toolCallId: 'c1', action: { kind: 'navigate', to: 'quotes' } },
      { type: 'affected', entities: [{ type: 'quote', id: 'q1', version: 4 }] },
      { type: 'credits', used: 3, left: 497, turnTotal: 3 },
      { type: 'done', reason: 'completed', conversationId: 'c', creditsUsed: 3 },
    ]
    const wire = `: ping\n\n${events.map((e, i) => encodeTurnEvent(e, i + 1)).join('')}data: {"type":"hack"}\n\ndata: no-json\n\n`
    const parser = new TurnEventStreamParser()
    const out: TurnEvent[] = []
    for (let i = 0; i < wire.length; i += 3) out.push(...parser.push(wire.slice(i, i + 3)))
    out.push(...parser.end())
    expect(out).toEqual(events)
    expect(TURN_EVENT_TYPES).toContain('tool.proposed')
  })

  it('acciones de interfaz validadas: rutas registradas, nunca URLs', () => {
    expect(parseUiAction({ kind: 'navigate', to: 'catalog' })).toEqual({ kind: 'navigate', to: 'catalog' })
    expect(parseUiAction({ kind: 'navigate', to: 'https://evil.test' })).toBeNull()
    expect(parseUiAction({ kind: 'set_locale', locale: 'tr' })).toEqual({ kind: 'set_locale', locale: 'tr' })
    expect(parseUiAction({ kind: 'eval', code: 'alert(1)' })).toBeNull()
  })

  it('rutas: absolutas codifican ids; relativas para el router', () => {
    expect(ASSISTANT_V2_PATHS.toolRunApprove('a/b')).toBe('/api/assistant/v2/tool-runs/a%2Fb/approve')
    expect(ASSISTANT_V2_ROUTES.turns).toBe('/turns')
    expect(messageText([{ type: 'text', text: 'Hola' }, { type: 'notice', level: 'info', code: 'x', text: 'Aviso' }])).toBe('Hola\nAviso')
  })
})

describe('texturas', () => {
  it('biblioteca integrada con ids estables, nombres en 7 idiomas y colores válidos', () => {
    for (const id of ['white_9016', 'anthracite_7016_smooth', 'golden_oak', 'nut_tree', 'metbrush_silver']) expect(BUILTIN_TEXTURE_IDS).toContain(id)
    for (const id of BUILTIN_TEXTURE_IDS) {
      const t = BUILTIN_TEXTURES[id]
      expect(t.id).toBe(id)
      expect(Object.keys(t.names).sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt', 'tr'])
      for (const name of Object.values(t.names)) expect(name.trim().length).toBeGreaterThan(1)
      for (const hex of [t.hex, t.light, t.dark]) expect(hex).toMatch(/^#[0-9A-F]{6}$/i)
      expect(t.scaleMm).toBeGreaterThan(0)
    }
  })

  it('referencias y subidas: solo raster en base64, sin SVG ni campos extra', () => {
    expect(textureRefSchema.safeParse({ kind: 'builtin', id: 'golden_oak', scaleMm: 900 }).success).toBe(true)
    expect(textureRefSchema.safeParse({ kind: 'builtin', id: 'unicornio' }).success).toBe(false)
    expect(textureRefSchema.safeParse({ kind: 'upload', assetId: 'a1', url: 'https://x' }).success).toBe(false)
    expect(textureUploadBodySchema.safeParse({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }).success).toBe(true)
    expect(textureUploadBodySchema.safeParse({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false)
    expect(customColorInputSchema.safeParse({ name: 'Roble propio', hex: '#A76B32', texture: { kind: 'upload', assetId: 'a1' } }).success).toBe(true)
    expect(customColorInputSchema.safeParse({ name: 'x', hex: 'red' }).success).toBe(false)
  })
})
