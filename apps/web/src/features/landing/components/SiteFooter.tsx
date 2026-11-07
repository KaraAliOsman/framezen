import { Link } from 'react-router'
import { useT } from '../../../lib/i18n'
import { DekopenWordmark } from '../../../ui/DekopenLogo'
import es from '../i18n/es'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Container } from './primitives'
import { NAV_LINKS } from './SiteHeader'

const LINK = 'rounded-xs text-fg-muted transition-colors duration-100 hover:text-fg-strong'

/** Pie: enlaces, idioma y el logotipo grande como cierre de la página. */
export function SiteFooter() {
  const t = useT(es)
  return (
    <footer className="bg-canvas text-fg">
      <Container className="pb-8">
        <div className="grid grid-cols-2 gap-8 border-t border-divider pt-10 md:grid-cols-12">
          <p className="col-span-2 max-w-[38ch] text-base text-fg-muted md:col-span-6">{t('footer.tagline')}</p>
          <nav aria-label={t('footer.product')} className="md:col-span-3">
            <ul className="grid gap-2 text-base">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={LINK}>
                    {t(`nav.${link.key}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t('footer.account')} className="md:col-span-3">
            <ul className="grid gap-2 text-base">
              <li>
                <Link to="/crear-cuenta" className={LINK}>
                  {t('common.createAccount')}
                </Link>
              </li>
              <li>
                <Link to="/entrar" className={LINK}>
                  {t('common.login')}
                </Link>
              </li>
              <li>
                <Link to="/recuperar" className={LINK}>
                  {t('footer.recover')}
                </Link>
              </li>
            </ul>
            <p className="sr-only">{t('footer.language')}</p>
            <LanguageSwitcher variant="full" className="mt-3 -ml-2.5" />
          </nav>
        </div>

        <div aria-hidden className="lp-wordmark mt-14 text-fg-strong">
          <DekopenWordmark height={100} />
        </div>

        <div className="mt-6 flex flex-col gap-1 text-table text-fg-muted sm:flex-row sm:justify-between">
          <p className="tabular">{t('footer.copyright', { year: String(new Date().getFullYear()) })}</p>
          <p>{t('footer.note')}</p>
        </div>
      </Container>
    </footer>
  )
}
