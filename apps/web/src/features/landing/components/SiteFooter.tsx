import { Link } from 'react-router'
import { FramezenLogo } from '../../../ui/FramezenLogo'
import { Container } from './primitives'
import { NAV_LINKS } from './SiteHeader'

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-paper-200 bg-paper-50">
      <Container className="grid grid-cols-1 gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <FramezenLogo size="md" className="text-paper-900" />
          <p className="mt-4 max-w-[36ch] text-[14px] leading-[22px] text-paper-600">
            El software para talleres y fábricas de ventanas y puertas de PVC. Hecho en Chile, para talleres de toda
            Latinoamérica.
          </p>
        </div>
        <nav aria-label="Producto" className="md:col-span-4">
          <p className="text-[13px] font-medium text-paper-900">Producto</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="rounded-xs text-paper-600 transition-colors duration-[120ms] hover:text-paper-900">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Cuenta" className="md:col-span-3">
          <p className="text-[13px] font-medium text-paper-900">Cuenta</p>
          <ul className="mt-3 grid gap-2 text-[14px]">
            <li>
              <Link to="/crear-cuenta" className="rounded-xs text-paper-600 transition-colors duration-[120ms] hover:text-paper-900">
                Crear cuenta
              </Link>
            </li>
            <li>
              <Link to="/entrar" className="rounded-xs text-paper-600 transition-colors duration-[120ms] hover:text-paper-900">
                Entrar
              </Link>
            </li>
            <li>
              <Link to="/recuperar" className="rounded-xs text-paper-600 transition-colors duration-[120ms] hover:text-paper-900">
                Recuperar contraseña
              </Link>
            </li>
          </ul>
        </nav>
      </Container>
      <Container>
        <div className="flex flex-col gap-2 border-t border-paper-200 py-6 text-[12px] text-paper-600 sm:flex-row sm:justify-between">
          <p className="tabular">© {year} Framezen</p>
          <p>Precios en pesos chilenos más IVA. Dibujos y cifras de esta página: catálogo de ejemplo.</p>
        </div>
      </Container>
    </footer>
  )
}
