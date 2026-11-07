import { clsx } from 'clsx'
import { Menu, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../../../lib/i18n'
import { DekopenLogo } from '../../../ui/DekopenLogo'
import es from '../i18n/es'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ButtonLink, EASE_IN, EASE_OUT, PAGE_GUTTER, PAGE_WIDTH } from './primitives'

/** Anclas de la página (los slugs quedan en español en todos los idiomas). El texto se traduce al dibujar. */
export const NAV_LINKS = [
  { href: '#precio', key: 'price' },
  { href: '#conjuntos', key: 'assemblies' },
  { href: '#cotizacion', key: 'quote' },
  { href: '#portal', key: 'portal' },
  { href: '#taller', key: 'workshop' },
  { href: '#asistente', key: 'assistant' },
  { href: '#planes', key: 'pricing' },
  { href: '#preguntas', key: 'faq' },
] as const

/**
 * Cabecera fija. Arriba se funde con la hoja; al bajar se vuelve una capa translúcida y el
 * contenido pasa por debajo. Su botón va en tinta: el amarillo es del héroe.
 */
export function SiteHeader() {
  const t = useT(es)
  const [scrolled, setScrolled] = useState(false)
  const [overDark, setOverDark] = useState(false)
  const [open, setOpen] = useState(false)
  const menuId = useId()

  useEffect(() => {
    // Sobre una banda antracita la cabecera también se vuelve antracita (lee la línea media de la barra).
    const onScroll = () => {
      setScrolled(window.scrollY > 8)
      const bands = document.querySelectorAll<HTMLElement>('.lp-root main section[data-theme="dark"]')
      setOverDark(
        Array.from(bands).some((band) => {
          const rect = band.getBoundingClientRect()
          return rect.top <= 32 && rect.bottom >= 32
        }),
      )
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const solid = scrolled || open

  return (
    <header
      data-theme={overDark ? 'dark' : undefined}
      className={clsx(
        'sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200 ease-out',
        solid
          ? 'border-divider bg-canvas/85 backdrop-blur-md backdrop-saturate-150'
          : 'border-transparent bg-canvas',
      )}
    >
      <a
        href="#contenido"
        className="sr-only rounded-sm bg-surface px-3 py-2 text-base font-medium focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        {t('nav.skip')}
      </a>
      <div className={clsx('mx-auto flex h-16 w-full items-center gap-8', PAGE_GUTTER, PAGE_WIDTH)}>
        <Link to="/" aria-label={t('nav.home')} className="-m-1 shrink-0 rounded-sm p-1">
          <DekopenLogo size="md" className="text-fg-strong" />
        </Link>

        <nav aria-label={t('nav.label')} className="hidden min-w-0 flex-1 xl:block">
          <ul className="flex items-center gap-0.5">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-sm px-2.5 py-1.5 text-base whitespace-nowrap text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg-strong"
                >
                  {t(`nav.${link.key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 xl:ml-0">
          <span className="hidden sm:contents">
            <LanguageSwitcher />
            <ButtonLink to="/entrar" variant="ghost">
              {t('common.login')}
            </ButtonLink>
          </span>
          <ButtonLink to="/crear-cuenta" variant="ink">
            {t('common.signup')}
          </ButtonLink>
          <button
            type="button"
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-sm text-fg-strong transition-transform duration-150 hover:bg-hover active:scale-[0.96] xl:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? t('nav.close') : t('nav.open')}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden className="size-5" strokeWidth={1.75} /> : <Menu aria-hidden className="size-5" strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.nav
            id={menuId}
            aria-label={t('nav.label')}
            className="border-t border-divider bg-canvas xl:hidden"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: EASE_IN } }}
          >
            <div className="px-5 pt-2 pb-5 sm:px-8">
              <ul className="grid">
                {NAV_LINKS.map((link) => (
                  <li key={link.href} className="border-b border-divider">
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex h-13 items-center justify-between text-lead font-medium text-fg-strong"
                    >
                      {t(`nav.${link.key}`)}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <ButtonLink to="/entrar" variant="secondary" size="lg">
                  {t('common.login')}
                </ButtonLink>
                <ButtonLink to="/crear-cuenta" variant="ink" size="lg">
                  {t('common.createAccount')}
                </ButtonLink>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-divider pt-4 sm:hidden">
                <span className="text-table text-fg-muted">{t('common.language')}</span>
                <LanguageSwitcher variant="full" />
              </div>
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
