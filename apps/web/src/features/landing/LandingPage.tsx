import { TRIAL_DAYS } from '@framezen/shared'
import { MotionConfig } from 'motion/react'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { Assistant } from './sections/Assistant'
import { Comparison } from './sections/Comparison'
import { Documents } from './sections/Documents'
import { Faq } from './sections/Faq'
import { FinalCta } from './sections/FinalCta'
import { Hero } from './sections/Hero'
import { Pricing } from './sections/Pricing'
import { Steps } from './sections/Steps'
import { Workshop } from './sections/Workshop'

/**
 * Landing pública de Framezen (ruta «/», carga perezosa). Todo lo que se dibuja
 * y cotiza aquí lo calcula el mismo motor de la app con el catálogo de ejemplo.
 */
export default function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <title>Framezen · Cotiza y fabrica ventanas de PVC sin errores</title>
      <meta
        name="description"
        content={`Software para talleres de ventanas y puertas de PVC: diseña en segundos, cotiza con precio al instante, envía documentos que venden y pasa a taller con cortes optimizados. Prueba ${TRIAL_DAYS} días sin tarjeta.`}
      />
      {/* Al imprimir nada queda a medio aparecer: las entradas son solo un realce. */}
      <style>{'@media print{[data-reveal]{opacity:1!important;transform:none!important}}'}</style>
      <div className="min-h-dvh bg-paper-50 text-paper-900">
        <SiteHeader />
        <main id="contenido" tabIndex={-1} className="outline-none">
          <Hero />
          <Steps />
          <Documents />
          <Workshop />
          <Assistant />
          <Comparison />
          <Pricing />
          <Faq />
          <FinalCta />
        </main>
        <SiteFooter />
      </div>
    </MotionConfig>
  )
}
