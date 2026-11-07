import '../../../test/setup'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { glossary, type MessageTree, type Translation } from '@dekopen/shared'
import { AppProviders } from '../../app/providers'
import { ApiRequestError, humanError, NETWORK_MESSAGE, request } from '../api'
import { formatDate, formatDocNumber, formatLongDate, formatRelative, normalizeSearch } from '../format'
import { qk } from '../queryClient'
import {
  getFormatter,
  getGlossary,
  I18nProvider,
  LocaleScope,
  LocaleServerSync,
  T,
  useFormat,
  useGlossary,
  useLocale,
  useT,
  webGlossary,
} from '.'
import exampleEs from './__example__/i18n/es'
import libEs from './es'
import { namespaceIds, namespaceOf, registerNamespace } from './registry'
import { renderRich } from './rich'
import {
  getLocale,
  getPendingLocale,
  isLocaleReady,
  loadedNamespace,
  LOCALE_STORAGE_KEY,
  onLocaleChange,
  resetI18nForTests,
  setLocale,
  switchLocale,
  translate,
} from './runtime'

afterEach(() => {
  resetI18nForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('registro por carpetas', () => {
  it('cada espacio se registra al cargar su es.ts y el resto queda diferido', async () => {
    await import('./__example__/i18n/es')
    await import('../i18n/es')
    expect(namespaceIds()).toEqual(expect.arrayContaining(['lib', 'lib/i18n/__example__', 'glossary']))
    expect(namespaceOf(libEs)).toBe('lib')
    expect(namespaceOf(exampleEs)).toBe('lib/i18n/__example__')
    expect(namespaceOf({})).toBeUndefined()
  })
})

describe('idioma y traducción sin hooks', () => {
  it('parte en español en pruebas y traduce sin proveedor', () => {
    expect(getLocale()).toBe('es')
    expect(translate(exampleEs, 'windows', { count: 2 })).toBe('2 ventanas')
    expect(translate(glossary, 'typology.tilt_turn')).toBe('Oscilobatiente')
  })

  it('descarga el idioma antes de aplicarlo, guarda la elección y pone <html lang>', async () => {
    expect(isLocaleReady('de')).toBe(false)
    const switching = setLocale('de')
    expect(getPendingLocale()).toBe('de')
    expect(getLocale()).toBe('es')
    await switching
    expect(getLocale()).toBe('de')
    expect(getPendingLocale()).toBeNull()
    expect(isLocaleReady('de')).toBe(true)
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de')
    expect(document.documentElement.lang).toBe('de-DE')
    expect(translate(exampleEs, 'windows', { count: 2 })).toBe('2 Fenster')
    // Un idioma explícito (p. ej. el del documento) no depende del de la interfaz.
    expect(translate(exampleEs, 'windows', { count: 2 }, 'es')).toBe('2 ventanas')
  })

  it('si llegan dos cambios seguidos, gana el último', async () => {
    const first = setLocale('fr')
    const second = setLocale('pt')
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(getLocale()).toBe('pt')
  })

  it('cae al español por clave cuando falta en el idioma, y avisa una sola vez en desarrollo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const es = { a: 'Uno', b: 'Dos' } as const
    registerNamespace('test/partial', es, { en: { a: 'One' } as unknown as Translation<typeof es> })
    await setLocale('en')
    expect(translate(es, 'a')).toBe('One')
    expect(translate(es, 'b')).toBe('Dos')
    expect(translate(es, 'b')).toBe('Dos')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('test/partial:b')
  })

  it('un archivo de idioma que no baja no bloquea: esas claves quedan en español', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const es = { hello: 'Hola' } as const
    registerNamespace('test/broken', es, { it: () => Promise.reject(new Error('offline')) })
    expect(await setLocale('it')).toBe(true)
    expect(translate(es, 'hello')).toBe('Hola')
  })

  it('avisa del origen de cada cambio (para guardarlo en la cuenta)', async () => {
    const seen: string[] = []
    const off = onLocaleChange((locale, source) => seen.push(`${locale}:${source}`))
    await setLocale('tr')
    await switchLocale('es', 'server')
    off()
    expect(seen).toEqual(['tr:user', 'es:server'])
  })
})

function Greeting({ count }: { count: number }) {
  const t = useT(exampleEs)
  return <p data-testid="greeting">{t('windows', { count })}</p>
}

describe('proveedor y hooks', () => {
  it('re-dibuja en el idioma nuevo sin pasar por un estado mezclado', async () => {
    const seen: string[] = []
    function Spy() {
      const t = useT(exampleEs)
      const text = t('windows', { count: 2 })
      useEffect(() => {
        seen.push(text)
      })
      return <span>{text}</span>
    }
    render(
      <I18nProvider>
        <Spy />
      </I18nProvider>,
    )
    await act(() => setLocale('fr'))
    expect(seen.filter((v, i) => v !== seen[i - 1])).toEqual(['2 ventanas', '2 fenêtres'])
  })

  it('al arrancar con un idioma guardado muestra el respaldo hasta tener los textos (sin destello)', async () => {
    resetI18nForTests('it')
    render(
      <I18nProvider fallback={<span>…</span>}>
        <Greeting count={1} />
      </I18nProvider>,
    )
    expect(screen.queryByTestId('greeting')).toBeNull()
    expect(await screen.findByTestId('greeting')).toHaveProperty('textContent', '1 finestra')
    expect(document.documentElement.lang).toBe('it-IT')
  })

  it('useLocale expone el idioma, el estado de carga y cómo cambiarlo', async () => {
    const { result } = renderHook(() => useLocale(), { wrapper: ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider> })
    expect(result.current.locale).toBe('es')
    expect(result.current.meta.intl).toBe('es-CL')
    expect(result.current.locales).toHaveLength(7)
    await act(() => result.current.setLocale('en'))
    expect(result.current.locale).toBe('en')
    expect(result.current.meta.label).toBe('English')
  })

  it('LocaleScope dibuja una parte en otro idioma sin cambiar el de la persona', async () => {
    render(
      <I18nProvider>
        <Greeting count={2} />
        <LocaleScope locale="pt" fallback={<span data-testid="loading" />}>
          <div data-testid="scoped">
            <Greeting count={2} />
          </div>
        </LocaleScope>
      </I18nProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('scoped').textContent).toBe('2 janelas'))
    expect(screen.getAllByTestId('greeting')[0].textContent).toBe('2 ventanas')
    expect(getLocale()).toBe('es')
    expect(screen.getByTestId('scoped').parentElement?.getAttribute('lang')).toBe('pt-BR')
  })

  it('<T> y t.rich convierten etiquetas en elementos', async () => {
    render(
      <I18nProvider>
        <p data-testid="t">
          <T ns={exampleEs} k="total" values={{ b: <strong className="x" />, total: '$100' }} />
        </p>
      </I18nProvider>,
    )
    expect(screen.getByTestId('t').innerHTML).toBe('Total <strong class="x">$100</strong> + IVA')
    await act(() => setLocale('de'))
    expect(screen.getByTestId('t').innerHTML).toBe('Gesamt <strong class="x">$100</strong> zzgl. MwSt.')
  })

  it('useGlossary nombra dominio en el idioma del componente', async () => {
    const { result } = renderHook(() => useGlossary(), { wrapper: ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider> })
    expect(result.current.typology('awning')).toBe('Proyectante')
    expect(result.current.quoteStatus('accepted')).toBe('Aceptada')
    await act(() => setLocale('it'))
    expect(result.current.typology('awning')).toBe('A sporgere')
    expect(result.current.warning({ code: 'size_invalid', message: 'La ventana necesita ancho y alto mayores que cero.' })).toBe(
      'La finestra ha bisogno di larghezza e altezza maggiori di zero.',
    )
    expect(result.current.count('windows', 3)).toBe('3 finestre')
    expect(result.current.t('business.quote')).toBe('Preventivo')
  })

  it('el glosario de la web baja cada idioma con el cambio de idioma (no viaja entero)', async () => {
    expect(loadedNamespace('glossary', 'tr')).toBeUndefined()
    expect(getGlossary('tr').typology('tilt_turn')).toBe('Oscilobatiente')
    await setLocale('tr')
    expect(loadedNamespace('glossary', 'tr')).toBeDefined()
    expect(getGlossary().typology('tilt_turn')).toBe('Çift açılım')
    expect(translate(webGlossary, 'quoteStatus.sent')).toBe('Gönderildi')
  })

  it('un espacio registrado tarde se descarga para el idioma ya cargado', async () => {
    await setLocale('pt')
    const es = { late: 'Tarde' } as const
    registerNamespace('test/late', es, { pt: { late: 'Atrasado' } })
    await waitFor(() => expect(translate(es, 'late')).toBe('Atrasado'))
  })
})

describe('texto enriquecido', () => {
  const html = (node: ReactNode) => {
    const { container, unmount } = render(<div>{node}</div>)
    const out = container.firstElementChild!.innerHTML
    unmount()
    return out
  }

  it('sin etiquetas ni nodos devuelve texto plano', () => {
    expect(renderRich('Hola {name}', { name: 'Ana' })).toBe('Hola Ana')
  })

  it('anida etiquetas, acepta funciones, autocierre y nodos como valores', () => {
    const node = renderRich('<b>Total <i>{n}</i></b><br/>{badge} y <link>ver</link>', {
      b: <strong />,
      i: (c) => <em>{c}</em>,
      br: <br />,
      badge: <span className="badge">nuevo</span>,
      link: (c) => <a href="/x">{c}</a>,
      n: 3,
    })
    expect(html(node)).toBe('<strong>Total <em>3</em></strong><br><span class="badge">nuevo</span> y <a href="/x">ver</a>')
  })

  it('los valores nunca se interpretan como etiquetas', () => {
    expect(html(renderRich('Cliente: <b>{name}</b>', { b: <strong />, name: 'Ventanas <Sur> & <b>Co</b>' }))).toBe(
      'Cliente: <strong>Ventanas &lt;Sur&gt; &amp; &lt;b&gt;Co&lt;/b&gt;</strong>',
    )
  })

  it('una etiqueta sin dibujante o sin cerrar no rompe', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(html(renderRich('a <x>b</x> c', {}))).toBe('a b c')
    expect(html(renderRich('a <b>b c', { b: <strong /> }))).toBe('a &lt;b&gt;b c')
    expect(html(renderRich('menor < 2 mm', {}))).toBe('menor &lt; 2 mm')
  })

  it('plural con # formateado dentro de una etiqueta', () => {
    expect(html(renderRich('{n, plural, one {<b>#</b> ítem} other {<b>#</b> ítems}}', { n: 1500, b: <strong /> }, 'es'))).toBe('<strong>1.500</strong> ítems')
  })
})

describe('formatos', () => {
  function wrapperWith(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
      <I18nProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </I18nProvider>
    )
  }

  it('useFormat usa CLP por defecto y es idéntico al formato de hoy', () => {
    const { result } = renderHook(() => useFormat())
    expect(result.current.money(1234567)).toBe('$1.234.567')
    expect(result.current.size(1200, 1500)).toBe('1.200 × 1.500 mm')
  })

  it('useFormat toma la moneda de la empresa del caché y se refresca con el idioma', async () => {
    const client = new QueryClient()
    client.setQueryData(qk.me, { user: { id: 'u' }, org: { id: 'o', currency: 'eur' } })
    const { result } = renderHook(() => useFormat(), { wrapper: wrapperWith(client) })
    expect(result.current.currency).toBe('EUR')
    expect(result.current.money(1234.5)).toBe('EUR 1.234,50')
    await act(() => setLocale('de'))
    expect(result.current.money(1234.5)).toBe('1.234,50 €')
    act(() => client.setQueryData(qk.me, { user: { id: 'u' }, org: { id: 'o', currency: 'USD' } }))
    expect(result.current.money(10)).toBe('10,00 $')
  })

  it('getFormatter sirve fuera de React con el idioma actual', async () => {
    await setLocale('en')
    const client = new QueryClient()
    client.setQueryData(qk.settings, { currency: 'USD' })
    expect(getFormatter({ client }).money(1234.5)).toBe('$1,234.50')
    expect(getFormatter({ client: new QueryClient() }).money(1000)).toBe('CLP 1,000')
  })

  it('lib/format: fechas y número de documento siguen el idioma; en español, igual que hoy', async () => {
    expect(formatDate('2026-10-04T15:00:00Z')).toBe('04-10-2026')
    expect(formatLongDate('2026-10-31T15:00:00Z')).toBe('31 de octubre de 2026')
    expect(formatDocNumber(412)).toBe('N° 412')
    const now = new Date('2026-10-31T12:00:00Z')
    expect(formatRelative('2026-10-30T10:00:00Z', now)).toBe('ayer')
    await setLocale('en')
    expect(formatDate('2026-10-04T15:00:00Z')).toBe('10/04/2026')
    expect(formatLongDate('2026-10-31T15:00:00Z')).toBe('October 31, 2026')
    expect(formatDocNumber(412)).toBe('No. 412')
    expect(formatRelative('2026-10-30T10:00:00Z', now)).toBe('yesterday')
  })

  it('las búsquedas pliegan la i sin punto del turco y las ligaduras', () => {
    expect(normalizeSearch('Cotización Pérez')).toBe('cotizacion perez')
    expect(normalizeSearch('Kapı')).toBe(normalizeSearch('kapi'))
    expect(normalizeSearch('İZMİR')).toBe('izmir')
    expect(normalizeSearch('Weiß')).toBe('weiss')
  })
})

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

describe('API en el idioma de la interfaz', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('envía Accept-Language con el idioma actual', async () => {
    fetchMock.mockImplementation(async () => json(200, { ok: true }))
    await request('/health')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['Accept-Language']).toBe('es-CL,es;q=0.9')
    await setLocale('tr')
    await request('/health')
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>)['Accept-Language']).toBe('tr-TR,tr;q=0.9')
  })

  it('en español usa el mensaje del servidor tal cual (como hasta ahora)', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: { code: 'email_taken', message: 'Ese correo ya existe.' } }))
    const error = (await request('/x', { method: 'POST' }).catch((e: unknown) => e)) as ApiRequestError
    expect(error.message).toBe('Ese correo ya existe.')
  })

  it('si el servidor responde en otro idioma, traduce por código; si no conoce el código, por estado', async () => {
    await setLocale('en')
    fetchMock.mockResolvedValueOnce(json(409, { error: { code: 'email_taken', message: 'Ese correo ya tiene una cuenta.' } }))
    const byCode = (await request('/x', { method: 'POST' }).catch((e: unknown) => e)) as ApiRequestError
    expect(byCode.message).toBe('That email already has an account. Sign in or reset your password.')
    expect(byCode.code).toBe('email_taken')
    fetchMock.mockResolvedValueOnce(json(404, { error: { code: 'whatever', message: 'No encontramos eso.' } }))
    const byStatus = (await request('/x').catch((e: unknown) => e)) as ApiRequestError
    expect(byStatus.message).toBe('We could not find what you are looking for. It may have been deleted or the link may be incomplete.')
  })

  it('confía en el mensaje del servidor cuando declara el mismo idioma (Content-Language)', async () => {
    await setLocale('fr')
    fetchMock.mockResolvedValueOnce(json(400, { error: { code: 'invalid', message: 'Le nom est obligatoire.' } }, { 'Content-Language': 'fr-FR' }))
    const error = (await request('/x', { method: 'POST' }).catch((e: unknown) => e)) as ApiRequestError
    expect(error.message).toBe('Le nom est obligatoire.')
  })

  it('sin conexión explica en el idioma actual; la constante en español sigue disponible', async () => {
    vi.useFakeTimers()
    try {
      await setLocale('de')
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
      const promise = request('/quotes', { retry: 0 }).catch((e: unknown) => e)
      await vi.runAllTimersAsync()
      const error = (await promise) as ApiRequestError
      expect(error.status).toBe(0)
      expect(error.message).toBe('Keine Verbindung möglich. Ihre Änderungen sind sicher; wir versuchen es automatisch erneut.')
      expect(humanError(new TypeError('x'))).toBe(error.message)
      expect(NETWORK_MESSAGE).toBe('No pudimos conectar. Tus cambios están a salvo; reintentamos solos.')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sincronización con la cuenta', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  function mount(client: QueryClient) {
    return render(
      <I18nProvider>
        <QueryClientProvider client={client}>
          <LocaleServerSync />
          <Greeting count={2} />
        </QueryClientProvider>
      </I18nProvider>,
    )
  }

  it('adopta el idioma guardado en la cuenta cuando llega la sesión', async () => {
    const client = new QueryClient()
    mount(client)
    expect(screen.getByTestId('greeting').textContent).toBe('2 ventanas')
    act(() => client.setQueryData(qk.me, { user: { id: 'u', locale: 'pt' }, org: { id: 'o' } }))
    await waitFor(() => expect(screen.getByTestId('greeting').textContent).toBe('2 janelas'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('guarda en la cuenta el idioma que la persona elige (PATCH /api/me) y actualiza el caché', async () => {
    fetchMock.mockImplementation(async () => json(200, { ok: true }))
    const client = new QueryClient()
    client.setQueryData(qk.me, { user: { id: 'u', locale: 'es' }, org: { id: 'o' } })
    mount(client)
    await act(() => setLocale('it'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/me')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ locale: 'it' })
    expect((client.getQueryData(qk.me) as { user: { locale: string } }).user.locale).toBe('it')
    expect(screen.getByTestId('greeting').textContent).toBe('2 finestre')
  })

  it('si el servidor aún no tiene la ruta (404), la elección local se mantiene', async () => {
    fetchMock.mockImplementation(async () => json(404, { error: { code: 'not_found', message: 'No encontramos lo que buscas.' } }))
    const client = new QueryClient()
    client.setQueryData(qk.me, { user: { id: 'u', locale: 'es' }, org: { id: 'o' } })
    mount(client)
    await act(() => setLocale('fr'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // El servidor sigue diciendo «es» (no guardó): no se revierte la elección de la persona.
    await act(async () => {
      client.setQueryData(qk.me, { user: { id: 'u', locale: 'es' }, org: { id: 'o' } })
      await Promise.resolve()
    })
    expect(getLocale()).toBe('fr')
  })

  it('sin sesión no llama al servidor', async () => {
    const client = new QueryClient()
    mount(client)
    await act(() => setLocale('en'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('AppProviders', () => {
  it('monta el proveedor de idioma por fuera de todo y sigue en español por defecto', async () => {
    const client = new QueryClient()
    function Probe() {
      const { locale } = useLocale()
      const t = useT(libEs as MessageTree)
      return <span data-testid="probe">{`${locale}|${t('api.status.badRequest' as never)}`}</span>
    }
    render(
      <AppProviders client={client}>
        <Probe />
      </AppProviders>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('es|Revisa los datos e inténtalo de nuevo.')
    await act(() => setLocale('en'))
    expect(screen.getByTestId('probe').textContent).toBe('en|Check the details and try again.')
  })
})
