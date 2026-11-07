import { TRIAL_DAYS } from '@dekopen/shared'
import { MotionConfig } from 'motion/react'
import { useT } from '../../lib/i18n'
import { useLandingTheme } from '../../lib/theme'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import './landing.css'
import { SampleQuoteProvider } from './lib/sampleContext'
import { Assemblies } from './sections/Assemblies'
import { Assistant } from './sections/Assistant'
import { Closing } from './sections/Closing'
import { DataSources } from './sections/DataSources'
import { Faq } from './sections/Faq'
import { Hero } from './sections/Hero'
import { Plans } from './sections/Plans'
import { Portal } from './sections/Portal'
import { QuotePages } from './sections/QuotePages'
import { TryIt } from './sections/TryIt'
import { Workshop } from './sections/Workshop'
import es from './i18n/es'

/**
 * Landing pública de DEKOPEN (ruta «/», carga perezosa). Muestra el producto de verdad: los dibujos,
 * las páginas de cotización, el portal y los cortes salen del mismo motor y de los mismos
 * componentes de la app, con el catálogo de ejemplo. Ninguna cifra se escribe a mano.
 */
export default function LandingPage() {
  const t = useT(es)
  const forcedTheme = useLandingTheme()
  return (
    <MotionConfig reducedMotion="user">
      <title>{t('meta.title')}</title>
      <meta name="description" content={t('meta.description', { days: TRIAL_DAYS })} />
      <div data-theme={forcedTheme} className="lp-root min-h-dvh bg-canvas text-fg">
        <SiteHeader />
        <SampleQuoteProvider>
          <main id="contenido" tabIndex={-1} className="outline-none">
            <Hero />
            <TryIt />
            <Assemblies />
            <QuotePages />
            <Portal />
            <Workshop />
            <DataSources />
            <Assistant />
            <Plans />
            <Faq />
            <Closing />
          </main>
        </SampleQuoteProvider>
        <SiteFooter />
      </div>
    </MotionConfig>
  )
}
