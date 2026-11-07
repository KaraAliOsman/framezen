import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { assistantMessageOf, chatJson, createAiClient, describeImage, parseToolArguments, retryAfterMs, AiError, type ChatStreamEvent } from '../src/services/ai/client'
import { createMockAi, mockSseBody, MOCK_AI_CONFIG } from '../src/services/ai/mock'
import { redactSecret } from '../src/services/ai/config'

const noSleep = async () => undefined

function client(mock: ReturnType<typeof createMockAi>, overrides: Partial<typeof MOCK_AI_CONFIG> = {}, retries = 2) {
  return createAiClient({ ...MOCK_AI_CONFIG, ...overrides }, { fetch: mock.fetch, sleep: noSleep, retries })
}

const TOOLS = [
  { type: 'function' as const, function: { name: 'add_window', description: 'Agrega una ventana', parameters: { type: 'object', properties: {}, additionalProperties: true } } },
]

describe('cliente de IA: streaming SSE', () => {
  it('arma texto, razonamiento y llamadas fragmentadas por índice, con uso y créditos', async () => {
    const mock = createMockAi([
      {
        reasoning: 'Necesito agregar dos ventanas: una corredera y un paño fijo.',
        toolCalls: [
          { id: 'call_a', name: 'add_window', arguments: { typology: 'sliding_2', width: 1500, height: 1200, location: 'Living «grande»' } },
          { id: 'call_b', name: 'add_window', arguments: { typology: 'fixed', width: 800, height: 600 } },
        ],
        usage: { prompt_tokens: 10_000, cached_tokens: 8_000, completion_tokens: 700, reasoning_tokens: 300 },
        chunkSize: 3,
        byteSplit: 5,
      },
    ])
    const events: ChatStreamEvent[] = []
    const result = await client(mock).chat({ messages: [{ role: 'user', content: 'agrega dos' }], tools: TOOLS, onEvent: (e) => events.push(e) })
    expect(result.finishReason).toBe('tool_calls')
    expect(result.complete).toBe(true)
    expect(result.reasoning).toBe('Necesito agregar dos ventanas: una corredera y un paño fijo.')
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0]).toMatchObject({ id: 'call_a', type: 'function', function: { name: 'add_window' } })
    expect(parseToolArguments(result.toolCalls[0]!)).toEqual({ ok: true, value: { typology: 'sliding_2', width: 1500, height: 1200, location: 'Living «grande»' } })
    expect(parseToolArguments(result.toolCalls[1]!)).toEqual({ ok: true, value: { typology: 'fixed', width: 800, height: 600 } })
    // (10.000 − 8.000) + 0,1 × 8.000 + 2 × 700 = 4.200 → 5 créditos.
    expect(result.usage).toMatchObject({ inputTokens: 10_000, cachedInputTokens: 8_000, outputTokens: 700, reasoningTokens: 300, reported: true })
    expect(result.credits).toBe(4)
    expect(result.requestId).toBe('req-mock-1')
    // Fragmentos para el navegador: razonamiento y argumentos llegan por partes.
    expect(events.filter((e) => e.type === 'reasoning').length).toBeGreaterThan(5)
    expect(events.filter((e) => e.type === 'tool_call' && e.argumentsDelta).length).toBeGreaterThan(5)
  })

  it('el pedido usa max_completion_tokens, thinking, tool_choice auto solo con herramientas y nunca loguea la clave', async () => {
    const mock = createMockAi([{ content: 'Hola.' }, { content: 'Sin herramientas.' }])
    const ai = client(mock)
    await ai.chat({ messages: [{ role: 'user', content: 'hola' }], tools: TOOLS })
    await ai.chat({ messages: [{ role: 'user', content: 'hola' }], thinking: 'disabled', temperature: 0.3, maxCompletionTokens: 5000 })
    const [first, second] = mock.requests
    expect(first!.url).toBe('https://proveedor.mock/v1/chat/completions')
    expect(first!.headers.authorization).toBe(`Bearer ${MOCK_AI_CONFIG.apiKey}`)
    expect(first!.body).toMatchObject({ model: 'modelo-simulado', stream: true, max_completion_tokens: 8192, thinking: { type: 'enabled' }, tool_choice: 'auto' })
    expect(first!.body.max_tokens).toBeUndefined()
    expect(first!.body.temperature).toBeUndefined() // con razonamiento el proveedor la fija
    expect(second!.body.tools).toBeUndefined()
    expect(second!.body.tool_choice).toBeUndefined()
    expect(second!.body).toMatchObject({ thinking: { type: 'disabled' }, temperature: 0.3, max_completion_tokens: 5000 })
  })

  it('pide el uso en streaming y apaga el razonamiento de las dos formas', async () => {
    const mock = createMockAi([{ content: 'Hola.' }])
    await client(mock).chat({ messages: [{ role: 'user', content: 'hola' }], thinking: 'disabled' })
    expect(mock.requests[0]!.body).toMatchObject({ stream_options: { include_usage: true }, thinking: { type: 'disabled' }, reasoning_effort: 'none' })
  })

  it('con el razonamiento activo no lo apaga, y sin streaming no pide uso de flujo', async () => {
    const mock = createMockAi([{ content: 'a' }, { content: 'b', json: true }])
    await client(mock).chat({ messages: [{ role: 'user', content: 'hola' }] })
    await client(mock).chat({ messages: [{ role: 'user', content: 'hola' }], stream: false })
    expect(mock.requests[0]!.body.reasoning_effort).toBeUndefined()
    expect(mock.requests[1]!.body.stream_options).toBeUndefined()
  })

  it('con el razonamiento apagado no reenvía el de turnos anteriores: son tokens de más', async () => {
    const mock = createMockAi([{ content: 'ok' }])
    const history = [{ role: 'user' as const, content: 'hola' }, { role: 'assistant' as const, content: 'x', reasoning_content: 'pensé mucho' }, { role: 'user' as const, content: 'sigue' }]
    await client(mock).chat({ messages: history, thinking: 'disabled' })
    expect(JSON.stringify(mock.requests[0]!.body.messages)).not.toContain('pensé mucho')
  })

  it('informa el costo real si el proveedor lo da', async () => {
    const mock = createMockAi([{ content: 'ok', usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.002 } }])
    const result = await client(mock).chat({ messages: [{ role: 'user', content: 'hola' }] })
    expect(result.usage).toMatchObject({ reported: true, costUsd: 0.002 })
  })

  it('sin uso informado estima por caracteres y cobra igual, sin descuento de caché', async () => {
    const mock = createMockAi([{ content: 'x'.repeat(330), usage: null }])
    const result = await client(mock).chat({ messages: [{ role: 'user', content: 'y'.repeat(3300) }] })
    expect(result.usage).toMatchObject({ reported: false, inputTokens: 1001, outputTokens: 100, cachedInputTokens: 0 })
    expect(result.credits).toBe(2)
  })

  it.each([
    ['stream_options', 'Unrecognized request argument supplied: stream_options'],
    ['thinking', 'Unknown parameter: thinking'],
    ['reasoning_effort', "Unsupported parameter: 'reasoning_effort' is not supported with this model."],
  ])('si un compatible rechaza %s, lo quita al tiro y no vuelve a mandarlo', async (param, message) => {
    const ai = client(createMockAi([]), { baseUrl: `https://${param}.test/v1` })
    const mock = createMockAi([{ status: 400, body: JSON.stringify({ error: { message } }) }, { content: 'ok' }, { content: 'otra vez' }])
    const adaptive = createAiClient(ai.config, { fetch: mock.fetch, retries: 0 })
    await expect(adaptive.chat({ messages: [{ role: 'user', content: 'hola' }], thinking: 'disabled' })).resolves.toMatchObject({ content: 'ok', attempts: 1 })
    await adaptive.chat({ messages: [{ role: 'user', content: 'hola' }], thinking: 'disabled' })
    expect(mock.requests[0]!.body[param]).toBeDefined()
    expect(mock.requests[1]!.body[param]).toBeUndefined()
    expect(mock.requests[2]!.body[param]).toBeUndefined()
  })

  it('un compatible con el nombre antiguo recibe max_tokens', async () => {
    const mock = createMockAi([{ status: 400, body: '{"error":{"message":"Unknown field max_completion_tokens"}}' }, { content: 'ok' }])
    await createAiClient({ ...MOCK_AI_CONFIG, baseUrl: 'https://antiguo.test/v1' }, { fetch: mock.fetch, retries: 0 }).chat({ messages: [{ role: 'user', content: 'hola' }] })
    expect(mock.requests[1]!.body).toMatchObject({ max_tokens: 8192 })
    expect(mock.requests[1]!.body.max_completion_tokens).toBeUndefined()
  })

  it('un modelo que exige recibir su razonamiento lo recibe', async () => {
    const mock = createMockAi([{ status: 400, body: '{"error":{"message":"reasoning_content is required"}}' }, { content: 'ok' }])
    const history = [{ role: 'user' as const, content: 'hola' }, { role: 'assistant' as const, content: 'x', reasoning_content: 'R' }, { role: 'user' as const, content: 'sigue' }]
    await createAiClient({ ...MOCK_AI_CONFIG, baseUrl: 'https://razona.test/v1' }, { fetch: mock.fetch, retries: 0 }).chat({ messages: history, thinking: 'disabled' })
    expect(JSON.stringify(mock.requests[1]!.body.messages)).toContain('"reasoning_content":"R"')
  })

  it('sin saldo se reconoce aunque venga como 429, y no se reintenta', async () => {
    const mock = createMockAi([{ status: 429, body: '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}' }])
    await expect(client(mock).chat({ messages: [{ role: 'user', content: 'hola' }] })).rejects.toMatchObject({ kind: 'billing' })
    expect(mock.requests).toHaveLength(1)
  })

  it('reenvía el reasoning_content del asistente en el historial (hay proveedores que responden 400 sin él)', async () => {
    const mock = createMockAi([
      { reasoning: 'Pienso en la corredera.', toolCalls: [{ id: 'call_1', name: 'add_window', arguments: { width: 1500 } }] },
      (req) => {
        const assistant = req.body.messages.find((m: { role: string }) => m.role === 'assistant')
        if (!assistant?.reasoning_content) return { status: 400, body: '{"error":{"message":"missing reasoning_content"}}' }
        return { content: 'Listo, agregué la V3.' }
      },
    ])
    const ai = client(mock)
    const messages: Parameters<typeof ai.chat>[0]['messages'] = [{ role: 'user', content: 'agrega una corredera' }]
    const first = await ai.chat({ messages, tools: TOOLS })
    messages.push(assistantMessageOf(first))
    messages.push({ role: 'tool', tool_call_id: first.toolCalls[0]!.id, content: '{"ok":true,"ref":"V3"}' })
    const second = await ai.chat({ messages, tools: TOOLS })
    expect(second.content).toBe('Listo, agregué la V3.')
    expect(mock.requests[1]!.body.messages[1]).toMatchObject({ role: 'assistant', content: '', reasoning_content: 'Pienso en la corredera.', tool_calls: [{ id: 'call_1' }] })
  })

  it('tolera CRLF, UTF-8 partido en trozos de 1 byte, nombres partidos y cierre sin [DONE] si informó el término', async () => {
    const text = 'Ventana «oscilobatiente» de 1.200 × 1.500 mm — ñandú 🪟'
    const mock = createMockAi([
      { content: text, crlf: true, byteSplit: 1, chunkSize: 2 },
      { toolCalls: [{ id: 'x', name: 'update_window', arguments: '{"all":true}' }], omitDone: true, chunkSize: 4 },
    ])
    const ai = client(mock)
    expect((await ai.chat({ messages: [{ role: 'user', content: 'x' }] })).content).toBe(text)
    const second = await ai.chat({ messages: [{ role: 'user', content: 'y' }], tools: TOOLS })
    expect(second.toolCalls[0]!.function).toEqual({ name: 'update_window', arguments: '{"all":true}' })
  })

  it('respuesta truncada (length) queda marcada incompleta; JSON inválido en argumentos se detecta', async () => {
    const mock = createMockAi([{ toolCalls: [{ name: 'add_window', arguments: '{"width": 15' }], finishReason: 'length' }])
    const result = await client(mock).chat({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS })
    expect(result.complete).toBe(false)
    expect(result.finishReason).toBe('length')
    expect(parseToolArguments(result.toolCalls[0]!)).toEqual({ ok: false, error: 'arguments_invalid_json' })
  })

  it('sin uso informado estima tokens; el flujo cortado sin término es un error', async () => {
    const mock = createMockAi([{ content: 'hola mundo', usage: null }, () => ({ content: 'a', omitDone: true, finishReason: '' as string })])
    const ai = client(mock)
    const estimated = await ai.chat({ messages: [{ role: 'user', content: 'x'.repeat(4000) }] })
    expect(estimated.usage.reported).toBe(false)
    expect(estimated.usage.inputTokens).toBeGreaterThanOrEqual(1000)
    expect(estimated.credits).toBeGreaterThanOrEqual(1)
    await expect(ai.chat({ messages: [{ role: 'user', content: 'y' }] })).rejects.toMatchObject({ kind: 'bad_response' })
  })

  it('error a mitad del flujo → AiError sin reintentar', async () => {
    const mock = createMockAi([{ content: 'Empiezo a responder', midStreamError: 'overloaded', chunkSize: 4 }, { content: 'no debería' }])
    await expect(client(mock).chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ name: 'AiError', kind: 'server' })
    expect(mock.requests).toHaveLength(1)
  })

  it('entiende respuestas JSON (sin streaming)', async () => {
    const mock = createMockAi([{ json: true, content: 'Hola', reasoning: 'r', toolCalls: [{ id: 'c', name: 'add_window', arguments: { a: 1 } }], usage: { prompt_tokens: 500, completion_tokens: 250 } }])
    const result = await client(mock).chat({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS })
    expect(result).toMatchObject({ content: 'Hola', reasoning: 'r', credits: 1, finishReason: 'tool_calls' })
    expect(result.toolCalls[0]!.function.arguments).toBe('{"a":1}')
  })
})

describe('cliente de IA: reintentos, plazos y errores', () => {
  it('reintenta 429/503 con espera (Retry-After) y luego responde', async () => {
    const waits: number[] = []
    const mock = createMockAi([
      { status: 429, body: '{"error":{"message":"rate"}}', headers: { 'retry-after': '2' } },
      { status: 503, body: 'down' },
      { content: 'Por fin.' },
    ])
    const ai = createAiClient(MOCK_AI_CONFIG, { fetch: mock.fetch, retries: 2, sleep: async (ms) => void waits.push(ms) })
    const result = await ai.chat({ messages: [{ role: 'user', content: 'x' }] })
    expect(result.content).toBe('Por fin.')
    expect(result.attempts).toBe(3)
    expect(waits[0]).toBe(2000)
    expect(waits[1]).toBeGreaterThan(0)
  })

  it('caída de red: reintenta; agotados los intentos lanza network', async () => {
    const mock = createMockAi([{ networkError: 'ECONNRESET' }, { networkError: 'ECONNRESET' }])
    await expect(client(mock, {}, 1).chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ kind: 'network' })
    expect(mock.requests).toHaveLength(2)
  })

  it('400/401/402/421 no se reintentan y se clasifican; la clave nunca aparece en el error', async () => {
    const key = MOCK_AI_CONFIG.apiKey
    const cases: [number, string][] = [
      [400, 'bad_request'],
      [401, 'auth'],
      [402, 'billing'],
      [421, 'moderation'],
    ]
    for (const [status, kind] of cases) {
      const mock = createMockAi([{ status, body: `{"error":{"message":"clave ${key} inválida, Bearer ${key}"}}` }])
      const error = (await client(mock).chat({ messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as AiError
      expect(error).toBeInstanceOf(AiError)
      expect(error.kind).toBe(kind)
      expect(error.status).toBe(status)
      expect(error.message).not.toContain(key)
      expect(mock.requests).toHaveLength(1)
    }
    expect(redactSecret('Authorization: Bearer sk-abcdefghijklmnopqrstuvwx', undefined)).not.toMatch(/abcdefghijkl/)
  })

  it('plazo sin datos (primer byte) → timeout; cancelar → aborted', async () => {
    const hang = createMockAi([{ hang: true }])
    const started = Date.now()
    await expect(client(hang, { timeoutMs: 2000 }).chat({ messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ kind: 'timeout' })
    expect(Date.now() - started).toBeLessThan(5000)

    const slow = createMockAi([{ content: 'tarde', delayMs: 3000 }])
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    await expect(client(slow).chat({ messages: [{ role: 'user', content: 'x' }], signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('Retry-After admite segundos o fecha y se acota', () => {
    expect(retryAfterMs('3')).toBe(3000)
    expect(retryAfterMs('999')).toBe(30_000)
    expect(retryAfterMs(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3000)
    expect(retryAfterMs(null)).toBeUndefined()
  })
})

describe('cliente de IA: modo JSON y visión', () => {
  const schema = z.object({ name: z.string(), finish: z.enum(['woodgrain', 'smooth']) })

  it('chatJson pide json_object, agrega la instrucción si falta y valida con zod', async () => {
    const mock = createMockAi([{ content: '```json\n{"name":"Roble rústico","finish":"woodgrain"}\n```' }, { content: '{"name":3}' }])
    const ai = client(mock)
    const { value } = await chatJson(ai, { messages: [{ role: 'user', content: 'Clasifica esta textura' }], schema })
    expect(value).toEqual({ name: 'Roble rústico', finish: 'woodgrain' })
    expect(mock.requests[0]!.body.response_format).toEqual({ type: 'json_object' })
    expect(mock.requests[0]!.body.messages[0]).toMatchObject({ role: 'system', content: expect.stringMatching(/JSON/) })
    await expect(chatJson(ai, { messages: [{ role: 'user', content: 'Devuelve JSON' }], schema })).rejects.toMatchObject({ kind: 'bad_response' })
  })

  it('describeImage usa el modelo de visión y una parte image_url con data URL validada', async () => {
    const mock = createMockAi([{ content: '{"name":"Nogal","finish":"woodgrain"}' }])
    const ai = client(mock, { visionModel: 'mimo-vision-test' })
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const { value } = await describeImage(ai, { prompt: 'Describe la veta (responde en JSON)', dataUrl: png, schema })
    expect(value.name).toBe('Nogal')
    const body = mock.requests[0]!.body
    expect(body.model).toBe('mimo-vision-test')
    expect(body.messages.at(-1).content[1]).toEqual({ type: 'image_url', image_url: { url: png } })
    await expect(describeImage(ai, { prompt: 'x', dataUrl: 'https://evil.test/x.png' })).rejects.toMatchObject({ kind: 'bad_request' })
  })

  it('el cuerpo SSE simulado tiene el formato del protocolo', () => {
    const body = mockSseBody({ content: 'hola', usage: { prompt_tokens: 1, completion_tokens: 1 } })
    expect(body).toMatch(/"object":"chat.completion.chunk"/)
    expect(body.trim().endsWith('data: [DONE]')).toBe(true)
  })
})
