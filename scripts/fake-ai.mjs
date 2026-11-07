// Proveedor de IA simulado para probar DEKOPEN sin clave real. NO reemplaza una prueba con una API
// real: es un compatible con OpenAI estricto en el contrato, nada más.
//
//   FAKE_AI_PORT=8917 node scripts/fake-ai.mjs
//   AI_BASE_URL=http://localhost:8917/v1 AI_MODEL=simulado AI_API_KEY=sk-simulada npm run ai:check
//
// Acepta cualquier modelo, y GET /v1/models lo deja sin lista para no chocar con AI_MODEL. Como varios
// proveedores reales, en streaming solo informa el uso si se pide con stream_options.include_usage.
//
// Fiel al contrato:
// - Rutas: POST /v1/chat/completions, GET /v1/models, GET /v1/platform/balance.
// - Clave por `api-key` o `Authorization: Bearer`. Cuerpos 401 copiados de la API real.
// - Razonamiento encendido si no se pide lo contrario. Con él encendido exige
//   reasoning_content en cada assistant con tool_calls (si falta, 400).
// - Fragmentos con campos en null, primer delta con content '' y role, finish_reason en un chunk
//   con usage null, y el uso real en un chunk final con choices: [] antes de [DONE].
// - Valida modelo, thinking, max_completion_tokens [1, 131072], temperature [0, 1.5], nombres de
//   herramientas, response_format y que cada tool_call tenga su resultado. tool_choice distinto de
//   auto se ignora.
//
// Supuesto, no documentado: el cuerpo de los errores que no son 401 sigue la misma forma.
//
// Fallos a pedido: POST /__sim/fault {"mode": "...", "times": 1, "retryAfter": 2}
//   401 402 403 400_model 400 421 429 500 503 no_balance (hasta /__sim/reset)
//   hang (nunca responde) hang_mid (se queda callado a mitad) cut (corta el texto)
//   cut_tool (corta a mitad de los argumentos) no_done (cierra sin [DONE]) stream_error
//   bad_args (JSON inválido) leak (la llamada queda dentro del razonamiento, sin tool_calls)
//   length content_filter repetition_truncation slow (2 s entre trozos) empty huge_usage
// GET /__sim/requests lista lo recibido (jamás la clave). POST /__sim/reset limpia todo.
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const port = Number(process.env.FAKE_AI_PORT || process.env.FAKE_MIMO_PORT || 8917)




let faults = []
let noBalance = false
let log = []
const seenPrefixes = new Set()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Respuestas HTTP ──────────────────────────────────────────────────────────

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

const gatewayError = (res, status, message, type, extra = {}) => json(res, status, { error: { message, param: extra.param ?? '', code: String(status), type } }, extra.headers)

function invalidKey(res, platform) {
  if (platform) return json(res, 401, { error: { message: 'Invalid API key.', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } })
  return gatewayError(res, 401, 'Invalid API Key', 'invalid_key', { param: 'Please provide valid API Key' })
}

function keyOf(req) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]
  return { key: bearer ?? req.headers['api-key'], via: bearer ? 'bearer' : req.headers['api-key'] ? 'api-key' : 'none' }
}

const keyIsValid = (key) => typeof key === 'string' && key.startsWith('sk-') && !/rechazada|invalid/.test(key)

// ── Streaming ────────────────────────────────────────────────────────────────

function chunker(res, model, faultMode) {
  const id = `${randomUUID()}_${randomUUID().replaceAll('-', '')}`
  const created = Math.floor(Date.now() / 1000)
  const write = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
  const chunk = (delta, finish = null, extra = {}) =>
    write({ id, choices: [{ delta: { content: null, role: null, tool_calls: null, reasoning_content: null, ...delta }, finish_reason: finish, index: 0 }], created, model, object: 'chat.completion.chunk', ...extra })
  const usageChunk = (usage) => write({ id, choices: [], created, model, object: 'chat.completion.chunk', usage })
  return { chunk, usageChunk, write, id, created, pace: faultMode === 'slow' ? 2000 : 3 }
}

const pieces = (text, size) => {
  const out = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

function usageOf(request, text, reasoning, calls, huge = false) {
  const promptChars = JSON.stringify(request.messages).length + JSON.stringify(request.tools ?? []).length
  const prompt = Math.ceil(promptChars / 4)
  const prefix = JSON.stringify(request.messages[0] ?? '').slice(0, 400)
  const cached = seenPrefixes.has(prefix) ? Math.floor(prompt * 0.7) : 0
  seenPrefixes.add(prefix)
  const reasoningTokens = Math.ceil(reasoning.length / 4)
  const out = reasoningTokens + Math.ceil((text.length + calls.reduce((n, c) => n + c.arguments.length + c.name.length, 0)) / 4)
  if (huge) return { completion_tokens: 40_000_000, prompt_tokens: prompt, total_tokens: prompt + 40_000_000, completion_tokens_details: { reasoning_tokens: 0 }, prompt_tokens_details: { cached_tokens: 0 } }
  return { completion_tokens: out, prompt_tokens: prompt, total_tokens: prompt + out, completion_tokens_details: { reasoning_tokens: reasoningTokens }, prompt_tokens_details: { cached_tokens: cached } }
}

async function streamReply(res, request, reply, thinking, fault) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' })
  const { chunk, usageChunk, pace } = chunker(res, request.model, fault)
  const reasoning = thinking ? (fault === 'leak' ? `Voy a llamar <tool_call>${JSON.stringify(reply.calls[0] ?? {})}</tool_call>` : reply.reasoning) : ''
  const calls = fault === 'leak' ? [] : reply.calls
  const text = fault === 'leak' || fault === 'empty' ? '' : reply.text
  chunk({ content: '', role: 'assistant' })
  for (const part of pieces(reasoning, 12)) {
    chunk({ reasoning_content: part })
    await sleep(pace)
  }
  let sent = 0
  for (const part of pieces(text, 9)) {
    chunk({ content: part })
    sent++
    await sleep(pace)
    if (fault === 'cut' && sent === 3) return res.destroy()
    if (fault === 'hang_mid' && sent === 3) return
    if (fault === 'stream_error' && sent === 3) {
      res.write(`data: ${JSON.stringify({ error: { message: 'internal error', code: '500', type: 'server_error' } })}\n\n`)
      return res.end()
    }
  }
  // Argumentos partidos e intercalados entre llamadas paralelas, como un flujo real.
  const queues = calls.map((call, index) => {
    const args = fault === 'bad_args' ? call.arguments.slice(0, -2) : call.arguments
    return { index, call, parts: pieces(args, 7) }
  })
  queues.forEach(({ index, call }) => chunk({ tool_calls: [{ index, id: `call_${randomUUID().replaceAll('-', '').slice(0, 24)}`, type: 'function', function: { name: call.name, arguments: '' } }] }))
  let fragments = 0
  while (queues.some((q) => q.parts.length)) {
    for (const q of queues) {
      const part = q.parts.shift()
      if (part === undefined) continue
      chunk({ tool_calls: [{ index: q.index, function: { arguments: part } }] })
      fragments++
      await sleep(pace)
      if (fault === 'cut_tool' && fragments === 2) return res.destroy()
    }
  }
  const finish = ['length', 'content_filter', 'repetition_truncation'].includes(fault) ? fault : reply.calls.length ? 'tool_calls' : 'stop'
  chunk({}, finish, { usage: null })
  if (request.stream_options?.include_usage) usageChunk(usageOf(request, text, reasoning, calls, fault === 'huge_usage'))
  if (fault === 'no_done') return res.end()
  res.write('data: [DONE]\n\n')
  res.end()
}

function plainReply(res, request, reply, thinking) {
  const reasoning = thinking ? reply.reasoning : ''
  json(res, 200, {
    id: `${randomUUID()}_${randomUUID().replaceAll('-', '')}`,
    choices: [
      {
        finish_reason: reply.calls.length ? 'tool_calls' : 'stop',
        index: 0,
        message: {
          content: reply.text,
          role: 'assistant',
          tool_calls: reply.calls.length ? reply.calls.map((c) => ({ id: `call_${randomUUID().slice(0, 8)}`, function: { arguments: c.arguments, name: c.name }, type: 'function' })) : null,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
        },
      },
    ],
    created: Math.floor(Date.now() / 1000),
    model: request.model,
    object: 'chat.completion',
    usage: usageOf(request, reply.text, reasoning, reply.calls),
  })
}

// ── Validación ───────────────────────────────────────────────────────────────

function validate(body) {
  if (!Array.isArray(body.messages) || !body.messages.length) return 'messages is required'
  if (typeof body.model !== 'string') return 'model is required'
  const mct = body.max_completion_tokens
  if (mct !== undefined && mct !== null && (!Number.isInteger(mct) || mct < 1 || mct > 131072)) return 'max_completion_tokens must be in [1, 131072]'
  if (body.temperature !== undefined && !(body.temperature >= 0 && body.temperature <= 1.5)) return 'temperature must be in [0, 1.5]'
  if (body.thinking !== undefined && !['enabled', 'disabled'].includes(body.thinking?.type)) return 'thinking.type must be enabled or disabled'
  if (body.response_format && !['text', 'json_object'].includes(body.response_format.type)) return 'response_format.type must be text or json_object'
  for (const tool of body.tools ?? []) {
    if (tool.type !== 'function') return 'tools[].type must be function'
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.function?.name ?? '')) return `invalid tool name: ${tool.function?.name}`
  }
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i]
    if (!['developer', 'system', 'user', 'assistant', 'tool'].includes(m.role)) return `invalid role ${m.role}`
    if (m.role === 'user' && Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'image_url' && !/^(https?:|data:image\/(png|jpeg|gif|webp|bmp);base64,)/.test(part.image_url?.url ?? '')) return 'image_url must be a public URL or a base64 data URL'
      }
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const ids = new Set(m.tool_calls.map((c) => c.id))
      for (let j = i + 1; j <= i + ids.size; j++) {
        const next = body.messages[j]
        if (next?.role !== 'tool' || !ids.has(next.tool_call_id)) return `tool_call_id without a matching tool message after assistant message ${i}`
      }
    }
    if (m.role === 'tool' && !body.messages.slice(0, i).some((a) => a.role === 'assistant' && a.tool_calls?.some((c) => c.id === m.tool_call_id))) return 'tool message without a preceding tool_call'
  }
  const thinking = body.thinking?.type !== 'disabled'
  if (thinking && body.messages.some((m) => m.role === 'assistant' && m.tool_calls?.length && !m.reasoning_content)) {
    return 'reasoning_content is required for assistant messages with tool_calls when thinking is enabled'
  }
  return null
}

// ── Cerebro de guion: entiende español simple y usa solo las herramientas ofrecidas ──────────

const call = (name, args) => ({ name, arguments: JSON.stringify(args) })
const THOUGHT = 'Reviso lo que pidió y qué herramienta corresponde.'

function textOf(content) {
  if (typeof content === 'string') return content
  return (content ?? []).filter((p) => p.type === 'text').map((p) => p.text).join(' ')
}

function resultOf(message) {
  try {
    return JSON.parse(/<tool_result[^>]*>\s*([\s\S]*?)\s*<\/tool_result>/.exec(String(message.content))?.[1] ?? '{}')
  } catch {
    return {}
  }
}

const sizes = (text) => [...text.matchAll(/(\d[\d.]*)\s*(?:x|×|por)\s*(\d[\d.]*)/g)].map((m) => ({ width: Number(m[1].replaceAll('.', '')), height: Number(m[2].replaceAll('.', '')) }))

function brain(body) {
  const messages = body.messages
  const offered = new Set((body.tools ?? []).map((t) => t.function?.name))
  const has = (name) => offered.has(name)

  // Modo JSON: plantillas y clasificación de texturas.
  if (body.response_format?.type === 'json_object') {
    const hasImage = messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'))
    if (hasImage) return { reasoning: THOUGHT, calls: [], text: JSON.stringify({ name: 'Roble rústico', finish: 'woodgrain', scaleMm: 900, confidence: 0.82, similar: [] }) }
    const all = messages.map((m) => textOf(m.content)).join('\n')
    const base = /BASE TEMPLATE \(JSON\):\n(\{[\s\S]*\})/.exec(all)?.[1]
    if (base) {
      try {
        const template = JSON.parse(base.split('\n')[0])
        return { reasoning: THOUGHT, calls: [], text: JSON.stringify({ ...template, name: 'Propuesta sobria', description: 'Diseño sobrio con portada limpia.' }) }
      } catch {
        // Base ilegible: sigue abajo.
      }
    }
    return { reasoning: THOUGHT, calls: [], text: JSON.stringify({ ok: true }) }
  }

  const lastUserIndex = messages.findLastIndex((m) => m.role === 'user')
  const text = textOf(messages[lastUserIndex]?.content).toLowerCase()
  const since = messages.slice(lastUserIndex + 1)
  const called = since.filter((m) => m.role === 'assistant').flatMap((m) => m.tool_calls ?? []).map((c) => c.function.name)
  const last = messages.at(-1)

  if (last?.role === 'tool') {
    const result = resultOf(last)
    const proposal = result.status === 'proposed'
    if (/edita.*(pdf|documento)|(pdf|documento).*edita/.test(text) && called.at(-1) === 'help' && has('edit_quote_document')) {
      return { reasoning: THOUGHT, calls: [call('edit_quote_document', { ops: [{ op: 'setText', field: 'intro', value: 'Gracias por considerarnos para tu obra.' }] })], text: '' }
    }
    if (proposal) return { reasoning: THOUGHT, calls: [], text: 'Te dejé la propuesta para que la apruebes.' }
    // Un modelo real lee el fallo: el simulador tampoco debe decir «listo» si la herramienta falló.
    if (result.ok === false) return { reasoning: THOUGHT, calls: [], text: 'No pude hacerlo. Revisa los datos y pídemelo de nuevo.' }
    const summary = result.summary || result.say || ''
    return { reasoning: 'Ya tengo el resultado; respondo corto.', calls: [], text: summary ? `Listo, ${String(summary).charAt(0).toLowerCase()}${String(summary).slice(1)}.`.replace('..', '.') : 'Listo, quedó hecho.' }
  }

  // La prueba completa de `ai:check -- --full` pide una herramienta propia.
  if (has('ver_hora')) return { reasoning: THOUGHT, calls: [call('ver_hora', { zona: 'UTC' })], text: '' }
  const dims = sizes(text)
  if (/qu[eé] (te )?recuerdas|acuerdas/.test(text) && has('recall')) return { reasoning: THOUGHT, calls: [call('recall', { query: text.slice(0, 80) })], text: '' }
  if (/^recuerda|recuerda que/.test(text) && has('remember')) return { reasoning: THOUGHT, calls: [call('remember', { content: text.replace(/^.*recuerda que\s*/, '').slice(0, 300), explicit: true })], text: '' }
  if (/dise[nñ]a.*plantilla|plantilla.*(dise[nñ]a|nueva)|genera.*plantilla/.test(text) && has('generate_template')) return { reasoning: THOUGHT, calls: [call('generate_template', { kind: 'quote', prompt: text.slice(0, 300) })], text: '' }
  if (/borra|elimina/.test(text) && /cotiz/.test(text) && has('delete_quote')) return { reasoning: THOUGHT, calls: [call('delete_quote', { quoteNumber: Number((text.match(/\d+/) ?? ['1'])[0]) })], text: '' }
  if (/env[ií]a|manda/.test(text) && has('send_quote')) return { reasoning: THOUGHT, calls: [call('send_quote', { channel: 'link' })], text: '' }
  if (/edita.*(pdf|documento)|(pdf|documento).*edita/.test(text) && has('help')) return { reasoning: THOUGHT, calls: [call('help', { topic: 'document_ops' })], text: '' }
  if (/tel[eé]fono/.test(text) && has('update_company')) return { reasoning: THOUGHT, calls: [call('update_company', { phone: '+56 9 8765 4321' })], text: '' }
  if (/\bot \d+.*(termin|lista)/.test(text) && has('update_work_order')) return { reasoning: THOUGHT, calls: [call('update_work_order', { number: Number((text.match(/\d+/) ?? ['1'])[0]), status: 'done' })], text: '' }
  if (/margen/.test(text) && has('update_pricing')) return { reasoning: THOUGHT, calls: [call('update_pricing', { margin_pct: Number((text.match(/\d+/) ?? ['30'])[0]) })], text: '' }
  if (/plazo de entrega|validez/.test(text) && has('update_settings')) return { reasoning: THOUGHT, calls: [call('update_settings', /validez/.test(text) ? { validity_days: Number((text.match(/\d+/) ?? ['30'])[0]) } : { lead_time: '15 días hábiles' })], text: '' }
  if (/descuento/.test(text) && has('update_quote')) return { reasoning: THOUGHT, calls: [call('update_quote', { discount: Number((text.match(/\d+/) ?? ['5'])[0]) })], text: 'Aplico el descuento. ' }
  if (/precio|cu[aá]nto (sale|cuesta)/.test(text) && has('explain_price')) return { reasoning: THOUGHT, calls: [call('explain_price', {})], text: '' }
  if (/resumen|panorama/.test(text) && has('list_quotes') && has('get_stats')) return { reasoning: THOUGHT, calls: [call('list_quotes', { limit: 5 }), call('get_stats', { metric: 'quotes_created', period: 'month' })], text: '' }
  if (/cotiza/.test(text) && dims.length && has('create_quote')) {
    const client = /(?:a|para)\s+([a-záéíóúñ]+\s+[a-záéíóúñ]+)/.exec(text)?.[1]
    const items = dims.map((d) => ({ typology: text.includes('fija') ? 'fixed' : 'sliding_2', ...d }))
    return { reasoning: THOUGHT, calls: [call('create_quote', { title: 'Cotización de prueba', ...(client ? { client } : {}), items })], text: 'Armo la cotización. ' }
  }
  if (dims.length && has('add_window')) return { reasoning: THOUGHT, calls: [call('add_window', { typology: text.includes('oscilo') ? 'tilt_turn' : 'sliding_2', ...dims[0] })], text: 'Agrego la ventana. ' }
  if (/cotizaciones/.test(text) && has('list_quotes')) return { reasoning: THOUGHT, calls: [call('list_quotes', { limit: 5 })], text: '' }
  if (/ignora|pol[ií]tica/.test(text)) return { reasoning: THOUGHT, calls: [], text: 'Eso no puedo hacerlo. Te ayudo con cotizaciones, clientes y catálogo.' }
  if (dims.length || /agrega|cambia|cotiza/.test(text)) return { reasoning: THOUGHT, calls: [], text: 'En modo Chat no hago cambios. Pásate a Supervisado o Acceso total y lo hago.' }
  if (/responde solo: ok/.test(text)) return { reasoning: THOUGHT, calls: [], text: 'ok' }
  return { reasoning: THOUGHT, calls: [], text: 'Hola. Dime qué ventana necesitas, con tipo y medidas, y la armo.' }
}

// ── Servidor ─────────────────────────────────────────────────────────────────

function takeFault() {
  const fault = faults[0]
  if (!fault) return null
  if (--fault.times <= 0) faults.shift()
  return fault
}

async function readJson(req) {
  let raw = ''
  for await (const part of req) raw += part
  return raw ? JSON.parse(raw) : {}
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://sim')
  const path = url.pathname

  if (path === '/__sim/requests') return json(res, 200, log)
  if (path === '/__sim/reset') {
    faults = []
    noBalance = false
    log = []
    return json(res, 200, { ok: true })
  }
  if (path === '/__sim/fault') {
    const { mode, times = 1, retryAfter } = await readJson(req)
    if (mode === 'no_balance') noBalance = true
    else faults.push({ mode: String(mode), times, retryAfter })
    return json(res, 200, { ok: true })
  }

  const { key, via } = keyOf(req)
  const entry = { at: new Date().toISOString(), method: req.method, path, via }
  log.push(entry)
  if (log.length > 500) log.shift()

  if (req.method === 'GET' && path === '/v1/models') {
    if (!keyIsValid(key)) return invalidKey(res, false)
    const fault = faults[0]?.mode === '403' ? takeFault() : null
    if (fault) return gatewayError(res, 403, 'Forbidden', 'forbidden')
    return json(res, 200, { object: 'list', data: [] })
  }

  if (req.method === 'GET' && path === '/v1/platform/balance') {
    if (!keyIsValid(key)) return invalidKey(res, true)
    const total = noBalance ? '0.00' : '10.00'
    return json(res, 200, { object: 'balance', is_available: !noBalance, balance_infos: [{ currency: 'USD', cash_balance: total, gift_balance: '0.00', frozen_balance: '0.00', credit_limit: '0.00', credit_available: '0.00', total_available: total }] })
  }

  if (req.method === 'POST' && path === '/v1/chat/completions') {
    const body = await readJson(req)
    const thinking = body.thinking?.type !== 'disabled'
    Object.assign(entry, {
      model: body.model,
      thinking,
      stream: Boolean(body.stream),
      temperature: body.temperature,
      maxCompletionTokens: body.max_completion_tokens,
      tools: (body.tools ?? []).length,
      toolChoice: body.tool_choice,
      responseFormat: body.response_format?.type,
      messages: body.messages?.length,
      lastRole: body.messages?.at(-1)?.role,
      reasoningReplayed: (body.messages ?? []).filter((m) => m.reasoning_content).length,
      hasImage: (body.messages ?? []).some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')),
    })
    if (!keyIsValid(key)) return invalidKey(res, false)
    if (noBalance) return gatewayError(res, 402, 'Insufficient balance', 'insufficient_balance')
    const fault = takeFault()
    const mode = fault?.mode
    const headers = fault?.retryAfter ? { 'retry-after': String(fault.retryAfter) } : {}
    entry.fault = mode
    if (mode === '401') return invalidKey(res, false)
    if (mode === '402') return gatewayError(res, 402, 'Insufficient balance', 'insufficient_balance')
    if (mode === '403') return gatewayError(res, 403, 'Forbidden', 'forbidden')
    if (mode === '400_model') return gatewayError(res, 400, `Model ${body.model} does not exist`, 'invalid_request_error')
    if (mode === '400') return gatewayError(res, 400, 'Invalid request', 'invalid_request_error')
    if (mode === '421') return gatewayError(res, 421, 'Content blocked by moderation', 'content_filter')
    if (mode === '429') return gatewayError(res, 429, 'Too many requests', 'rate_limit', { headers })
    if (mode === '500') return gatewayError(res, 500, 'Server error', 'server_error')
    if (mode === '503') return gatewayError(res, 503, 'Server overloaded', 'server_overloaded')
    if (mode === 'hang') return
    if (typeof body.model !== 'string' || !body.model) return gatewayError(res, 400, 'Model is required', 'invalid_request_error')
    const problem = validate(body)
    if (problem) {
      entry.rejected = problem
      return gatewayError(res, 400, problem, 'invalid_request_error')
    }
    const reply = brain(body)
    if (body.stream) return streamReply(res, body, reply, thinking, mode)
    return plainReply(res, body, reply, thinking)
  }

  gatewayError(res, 404, 'Not Found', 'not_found')
}).listen(port, () => console.log(`Proveedor de IA simulado en http://localhost:${port}/v1`))
