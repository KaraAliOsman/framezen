/**
 * Cuenta y sesión: crear cuenta (con avisos en línea), entrar directo, puesta a punto opcional,
 * recarga con sesión, cerrar sesión, ruta privada → /entrar?next y vuelta, clave equivocada,
 * correo repetido y «Olvidé mi contraseña».
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, newAccount, shot, test } from './fixtures'

/** Sin RESEND_API_KEY el servidor escribe los correos en su consola (FZ_API_LOG, por defecto .scratch/api.log). */
function resetLinkFromLog(email: string): string | null {
  const file = process.env.FZ_API_LOG ?? path.resolve(process.cwd(), '.scratch/api.log')
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const at = text.lastIndexOf(`Correo para ${email}`)
  if (at < 0) return null
  return text.slice(at, at + 2000).match(/https?:\/\/\S+token=[^\s]+|https?:\/\/\S+\/restablecer\/[^\s]+/)?.[0] ?? null
}

test.describe('Cuenta y sesión', () => {
  test('crear cuenta, entrar, salir y volver a entrar', async ({ page, allowProblems }) => {
    // Clave equivocada y correo repetido: el servidor responde 401/409 a propósito.
    allowProblems(/http 401 POST \/api\/auth\/login/, /http 409 POST \/api\/auth\/signup/, /status of 40[19]/)
    const account = newAccount('cuenta')

    await page.goto('/crear-cuenta')
    await expect(page.getByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible()

    // Enviar vacío: avisos en línea, sin diálogos.
    await page.getByRole('button', { name: 'Crear cuenta y empezar' }).click()
    await expect(page.getByText('Escribe tu nombre.')).toBeVisible()
    await expect(page.getByText('Escribe el nombre de tu taller o empresa.')).toBeVisible()
    await expect(page).toHaveURL(/\/crear-cuenta/)

    await page.getByLabel('Tu nombre').fill(account.name)
    await page.getByLabel('Taller o empresa').fill(account.company)
    await page.getByLabel('Correo').fill(account.email)
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await shot(page, 'cuenta-01-formulario')
    await page.getByRole('button', { name: 'Crear cuenta y empezar' }).click()

    // Entra directo a /inicio (nunca obliga a la puesta a punto) con la prueba de 14 días.
    await page.waitForURL(/\/inicio/, { timeout: 20_000 })
    await expect(page.getByText(/14 días con todo Pro/).first()).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await shot(page, 'cuenta-02-inicio')

    const me = await (await page.request.get('/api/me')).json()
    expect(me.user.email).toBe(account.email)
    expect(me.org.name).toBe(account.company)
    expect(me.billing.plan).toBe('trial')

    // Recargar no pierde la sesión.
    await page.reload()
    await expect(page).toHaveURL(/\/inicio/)
    await expect(page.getByRole('button', { name: `Cuenta de ${account.name}` })).toBeVisible()

    // Cerrar sesión desde el menú de la cuenta.
    await page.getByRole('button', { name: `Cuenta de ${account.name}` }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
    await page.waitForURL(/\/entrar/)
    expect((await page.request.get('/api/me')).status()).toBe(401)

    // Una ruta privada sin sesión pide entrar y recuerda adónde ibas.
    await page.goto('/catalogo?tab=precios')
    await page.waitForURL(/\/entrar\?next=/)
    expect(decodeURIComponent(new URL(page.url()).searchParams.get('next') ?? '')).toBe('/catalogo?tab=precios')

    // Clave equivocada: mensaje humano, sin perder lo escrito.
    await page.getByLabel('Correo').fill(account.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('no-es-mi-clave')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    const loginError = page.getByRole('alert').or(page.locator('[id$="-error"]')).first()
    await expect(loginError).toBeVisible()
    await expect(loginError).not.toContainText(/invalid|unauthorized|error \d{3}/i)
    await expect(page.getByLabel('Correo')).toHaveValue(account.email)
    await shot(page, 'cuenta-03-clave-equivocada')

    // Clave correcta: vuelve a la página que pedía.
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.waitForURL(/\/catalogo\?tab=precios/, { timeout: 20_000 })

    // Con sesión, /crear-cuenta lleva a /inicio.
    await page.goto('/crear-cuenta')
    await page.waitForURL(/\/inicio/)

    // Correo repetido: aviso en el campo, en español y sin códigos.
    await page.request.post('/api/auth/logout')
    await page.goto('/crear-cuenta')
    await page.getByLabel('Tu nombre').fill('Otra Persona')
    await page.getByLabel('Taller o empresa').fill('Otro taller')
    await page.getByLabel('Correo').fill(account.email)
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Crear cuenta y empezar' }).click()
    await expect(page.getByText(/ya (tiene|existe|está)|ya hay una cuenta|ya usaste|registrad/i).first()).toBeVisible()
    await expect(page).toHaveURL(/\/crear-cuenta/)
    await shot(page, 'cuenta-04-correo-repetido')
  })

  test('puesta a punto opcional y recuperar contraseña', async ({ page }) => {
    const account = newAccount('bienvenida')
    await page.goto('/crear-cuenta')
    await page.getByLabel('Tu nombre').fill(account.name)
    await page.getByLabel('Taller o empresa').fill(account.company)
    await page.getByLabel('Correo').fill(account.email)
    await page.getByLabel('Contraseña', { exact: true }).fill(account.password)
    await page.getByRole('button', { name: 'Crear cuenta y empezar' }).click()
    await page.waitForURL(/\/inicio/, { timeout: 20_000 })

    // /bienvenida existe, se puede saltar entera y no vuelve a aparecer a la fuerza.
    await page.goto('/bienvenida')
    await shot(page, 'cuenta-05-bienvenida')
    const skip = page.getByRole('button', { name: /^Saltar|Hacerlo después|Ir a cotizar|Omitir/ }).first()
    await expect(skip).toBeVisible()
    await skip.click()
    await expect(page).not.toHaveURL(/\/bienvenida/)
    await page.goto('/cotizaciones')
    await expect(page).toHaveURL(/\/cotizaciones/)

    // Recuperar contraseña: misma respuesta exista o no el correo.
    await page.request.post('/api/auth/logout')
    await page.goto('/recuperar')
    await page.getByLabel('Correo de tu cuenta').fill(account.email)
    await page.getByRole('button', { name: /Enviar|Recuperar|Mandar/ }).first().click()
    await expect(page.getByText(/te (enviamos|mandamos)|revisa tu correo|si existe/i).first()).toBeVisible()
    await shot(page, 'cuenta-06-recuperar')

    // El enlace del correo debe abrir el formulario de contraseña nueva y dejar entrar con ella.
    await page.waitForTimeout(500)
    const link = resetLinkFromLog(account.email)
    test.skip(!link, 'No hay registro de la consola de la API para leer el correo de recuperación.')
    await page.goto(new URL(link!).pathname + new URL(link!).search)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await shot(page, 'cuenta-07-enlace-del-correo')
    const fresh = page.getByLabel('Contraseña nueva')
    await expect(page.getByLabel('Correo de tu cuenta'), 'el enlace del correo no debería volver a pedir el correo').toHaveCount(0, { timeout: 3000 })
    await fresh.fill('otra-clave-segura-2026')
    await page.getByRole('button', { name: 'Guardar y entrar' }).click()
    await page.waitForURL(/\/inicio/, { timeout: 15_000 })
  })
})
