import { clsx } from 'clsx'
import { Menu, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { FramezenLogo } from '../../../ui/FramezenLogo'
import { ButtonLink, Container, EASE_IN, EASE_OUT } from './primitives'

export const NAV_LINKS = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#documentos', label: 'Documentos' },
  { href: '#taller', label: 'Taller' },
  { href: '#marco', label: 'Marco' },
  { href: '#planes', label: 'Planes' },
  { href: '#preguntas', label: 'Preguntas' },
] as const

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const menuId = useId()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
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

  return (
    <header
      className={clsx(
        'sticky top-0 z-40 bg-paper-50 transition-[border-color] duration-[160ms]',
        'border-b',
        scrolled || open ? 'border-paper-200' : 'border-transparent',
      )}
    >
      <a
        href="#contenido"
        className="sr-only rounded-sm bg-paper-0 px-3 py-2 text-[14px] font-medium focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Saltar al contenido
      </a>
      <Container className="flex h-16 items-center gap-6">
        <Link to="/" aria-label="Framezen, inicio" className="-m-1 rounded-sm p-1">
          <FramezenLogo size="md" className="text-paper-900" />
        </Link>

        <nav aria-label="Secciones" className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-sm px-2.5 py-1.5 text-[14px] text-paper-600 transition-colors duration-[120ms] hover:text-paper-900"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span className="hidden sm:contents">
            <ButtonLink to="/entrar" variant="ghost">
              Entrar
            </ButtonLink>
          </span>
          <ButtonLink to="/crear-cuenta" variant="primary">
            Probar gratis
          </ButtonLink>
          <button
            type="button"
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-sm text-paper-900 hover:bg-paper-100 lg:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden className="size-5" strokeWidth={1.75} /> : <Menu aria-hidden className="size-5" strokeWidth={1.75} />}
          </button>
        </div>
      </Container>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.nav
            id={menuId}
            aria-label="Secciones"
            className="border-t border-paper-200 bg-paper-50 lg:hidden"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease: EASE_IN } }}
          >
            <Container className="py-3">
              <ul className="grid gap-0.5">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex h-11 items-center rounded-sm px-2 text-[16px] text-paper-900 hover:bg-paper-100"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                <li className="mt-2 border-t border-paper-200 pt-2 sm:hidden">
                  <Link
                    to="/entrar"
                    className="flex h-11 items-center rounded-sm px-2 text-[16px] text-paper-900 hover:bg-paper-100"
                  >
                    Entrar
                  </Link>
                </li>
              </ul>
            </Container>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
