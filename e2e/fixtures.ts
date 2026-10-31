/**
 * Utilidades compartidas de la suite E2E: cuenta nueva por prueba, vigilancia de consola y de
 * respuestas de la API, y pasos del editor de cotizaciones escritos como los haría una persona.
 */
import { test as base, expect, type APIRequestContext, type Locator, type Page, type Response } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export { expect }
export type { Page } from '@playwright/test'

export interface Problem {
  kind: 'console' | 'pageerror' | 'http'
  page: string
  text: string
}

export interface Account {
  email: string
  password: string
  name: string
  company: string
}

/** Patrones de problemas esperados en una prueba (p. ej. el 409 de la prueba de conflicto). */
type Allow = (RegExp | string)[]

interface Fixtures {
  /** Problemas vistos en todas las páginas del contexto. */
  problems: Problem[]
  /** Permite problemas esperados en esta prueba. */
  allowProblems: (...patterns: Allow) => void
  /** Vigila otra página (pestaña nueva, portal…) además de `page`. */
  watch: (p: Page, name: string) => void
}

// Ruido conocido que no es un fallo del producto.
const ALWAYS_ALLOWED: Allow = [
  // Antes de entrar, /api/me responde 401: es como la app sabe que no hay sesión.
  /http 401 GET \/api\/me$/,
  // Vite en desarrollo: avisos de React DevTools y de recarga en caliente.
  /Download the React DevTools/,
  /\[vite\]/,
]

function matches(text: string, patterns: Allow) {
  return patterns.some((p) => (typeof p === 'string' ? text.includes(p) : p.test(text)))
}

export const test = base.extend<Fixtures>({
  problems: async ({}, use) => {
    await use([])
  },
  allowProblems: async ({}, use, testInfo) => {
    const extra: Allow = []
    ;(testInfo as unknown as { __allow: Allow }).__allow = extra
    await use((...patterns) => extra.push(...patterns))
  },
  watch: async ({ problems }, use) => {
    const seen = new WeakSet<Page>()
    await use((p, name) => {
      if (seen.has(p)) return
      seen.add(p)
      p.on('pageerror', (e) => problems.push({ kind: 'pageerror', page: name, text: String(e).slice(0, 400) }))
      p.on('console', (m) => {
        if (m.type() !== 'error') return
        const text = m.text()
        const where = m.location()?.url ?? ''
        // «Failed to load resource» de /api ya queda registrado como respuesta http (con su ruta).
        if (/Failed to load resource/.test(text) && where.includes('/api/')) return
        problems.push({ kind: 'console', page: name, text: `${text.slice(0, 400)}${where && /Failed to load/.test(text) ? ` (${where})` : ''}` })
      })
      p.on('response', (r: Response) => {
        const url = new URL(r.url())
        if (r.status() >= 400 && url.pathname.startsWith('/api/')) {
          problems.push({ kind: 'http', page: name, text: `http ${r.status()} ${r.request().method()} ${url.pathname}` })
        }
      })
    })
  },
  page: async ({ page, watch, problems }, use, testInfo) => {
    watch(page, 'app')
    await use(page)
    const allow = [...ALWAYS_ALLOWED, ...((testInfo as unknown as { __allow?: Allow }).__allow ?? [])]
    const unexpected = problems.filter((p) => !matches(`${p.kind} ${p.text}`, allow) && !matches(p.text, allow))
    if (problems.length) {
      await testInfo.attach('problemas.json', { body: JSON.stringify({ unexpected, all: problems }, null, 2), contentType: 'application/json' })
    }
    for (const p of unexpected) testInfo.annotations.push({ type: `problema:${p.kind}`, description: `[${p.page}] ${p.text}` })
    expect.soft(unexpected.map((p) => `[${p.page}] ${p.kind}: ${p.text}`), 'Errores de consola o respuestas 4xx/5xx inesperadas').toEqual([])
  },
})

// ── Cuentas ──────────────────────────────────────────────────────────────────

let counter = 0
export function uniqueEmail(tag: string) {
  counter++
  return `e2e-${tag}-${Date.now().toString(36)}-${process.pid}-${counter}@framezen.test`
}

export function newAccount(tag: string, overrides: Partial<Account> = {}): Account {
  return {
    email: uniqueEmail(tag),
    password: 'clave-segura-2026',
    name: 'Rosa Martínez',
    company: 'Ventanas Martínez',
    ...overrides,
  }
}

/** Crea la cuenta por la API (la cookie de sesión queda en el contexto de `page`). */
export async function signupApi(page: Page, tag: string, overrides: Partial<Account> = {}) {
  const account = newAccount(tag, overrides)
  const res = await page.request.post('/api/auth/signup', {
    data: { name: account.name, email: account.email, password: account.password, company: account.company },
  })
  expect(res.status(), `crear cuenta por API: ${await res.text().catch(() => '')}`).toBe(201)
  return account
}

/** GET/POST/PUT/PATCH a la API con la sesión del navegador. Devuelve el JSON. */
export async function api<T = unknown>(req: APIRequestContext, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, data?: unknown): Promise<T> {
  const res = await req.fetch(url.startsWith('/api') ? url : `/api${url}`, { method, data })
  const text = await res.text()
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : undefined) as T
}

// ── Capturas ─────────────────────────────────────────────────────────────────

const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.scratch/shots/qa-e2e')
export async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  mkdirSync(SHOTS, { recursive: true })
  const project = test.info().project.name
  await page.screenshot({ path: path.join(SHOTS, `${project}-${name}.png`), fullPage: opts.fullPage ?? false })
}

// ── Editor de cotizaciones ───────────────────────────────────────────────────

export function saveStatus(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: /Guardado|Guardando|Sin conexión|No pudimos guardar/ }).first()
}

/** Espera a que el autoguardado termine (sin cambios pendientes). */
export async function waitSaved(page: Page, timeout = 15_000) {
  await page.waitForTimeout(900) // la espera del autoguardado es ~800 ms
  await expect(page.getByRole('status').filter({ hasText: /^Guardado$/ }).first()).toBeVisible({ timeout })
  await expect(page.getByRole('status').filter({ hasText: /Guardando/ })).toHaveCount(0, { timeout })
}

/** Crea una cotización vacía desde el botón «Nueva cotización» de /cotizaciones. */
export async function newQuoteFromUi(page: Page) {
  await page.goto('/cotizaciones')
  await page.getByRole('button', { name: /Nueva cotización/ }).or(page.getByRole('link', { name: /Nueva cotización/ })).first().click()
  await page.waitForURL(/\/cotizaciones\/[^/?]+/, { timeout: 20_000 })
  await waitEditorReady(page)
  return quoteIdFromUrl(page)
}

/** Espera a que el editor termine de abrir (y a que la galería automática aparezca si corresponde). */
export async function waitEditorReady(page: Page) {
  await expect(page.locator('textarea[aria-label="Nombre de la obra"]').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('Abriendo la cotización')).toHaveCount(0)
  // Una cotización nueva y vacía abre la galería sola: le damos un momento para aparecer.
  await pickerDialog(page).waitFor({ state: 'visible', timeout: 2500 }).catch(() => {})
}

export function quoteIdFromUrl(page: Page) {
  const m = new URL(page.url()).pathname.match(/\/cotizaciones\/([^/?]+)/)
  if (!m) throw new Error('No estamos en el editor: ' + page.url())
  return decodeURIComponent(m[1])
}

export function pickerDialog(page: Page) {
  return page.getByRole('dialog').filter({ has: page.getByLabel('Buscar tipología') })
}

/**
 * Agrega una ventana como una persona: abre la galería (tecla A o botón), busca la tipología,
 * Enter, escribe ancho, Tab, alto, Enter.
 */
export async function addWindow(page: Page, search: string, width: number, height: number, opts: { mobile?: boolean; viaShortcut?: boolean } = {}) {
  const picker = pickerDialog(page)
  if (!(await picker.isVisible().catch(() => false))) {
    if (opts.viaShortcut) {
      await page.locator('body').press('a')
    } else {
      const add = page.getByRole('button', { name: /Agregar ventana/ }).first()
      if (opts.mobile) await add.tap()
      else await add.click()
    }
  }
  await expect(picker).toBeVisible()
  const box = picker.getByLabel('Buscar tipología')
  await box.click()
  await box.fill('')
  await page.keyboard.type(search, { delay: 15 })
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Ancho', { exact: true }) })
  await expect(dialog).toBeVisible()
  const w = dialog.getByLabel('Ancho', { exact: true })
  const h = dialog.getByLabel('Alto', { exact: true })
  await expect(w).toBeFocused()
  await page.keyboard.type(String(width), { delay: 15 })
  await page.keyboard.press('Tab')
  await page.keyboard.type(String(height), { delay: 15 })
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
}

export function itemsList(page: Page) {
  return page.getByRole('list', { name: 'Ventanas de la cotización' }).first()
}

/** Fila de una ventana en la columna izquierda (botón con «V1, Corredera…, 1.800 × 1.200 mm…»). */
export function itemRow(page: Page, ref: string) {
  return itemsList(page).getByRole('button', { name: new RegExp(`^${ref},`) }).first()
}

/** Lee el total con IVA del pie de totales (CLP como número), esperando a que las cifras dejen de rodar. */
export async function footerTotal(page: Page): Promise<number> {
  const footer = page.locator('footer[aria-label="Totales"]').first()
  const read = async () => {
    const text = (await footer.innerText()).replace(/\s+/g, ' ')
    const m = text.match(/Total con IVA\s*\$\s?([\d.]+)/)
    if (!m) throw new Error('No encontré el total en: ' + text)
    return Number(m[1].replace(/\./g, ''))
  }
  let last = await read()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150)
    const now = await read()
    if (now === last) return now
    last = now
  }
  return last
}

export function clp(text: string): number {
  const m = text.match(/\$\s?([\d.]+)/)
  return m ? Number(m[1].replace(/\./g, '')) : NaN
}
