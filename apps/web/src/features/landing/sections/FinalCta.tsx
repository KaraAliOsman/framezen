import { TRIAL_DAYS } from '@framezen/shared'
import { ButtonLink, Container, Reveal } from '../components/primitives'

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="bg-paper-900 text-paper-50">
      <Container className="grid grid-cols-1 items-center gap-12 py-20 sm:py-28 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <h2
            id="final-cta-title"
            className="max-w-[16ch] text-[38px] leading-[44px] font-semibold tracking-[-0.02em] text-balance sm:text-[56px] sm:leading-[60px]"
          >
            Tu próxima cotización puede salir hoy.
          </h2>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-[28px] text-paper-50/75">
            Crea tu cuenta en un minuto, elige tus marcas y manda tu primera cotización con dibujos antes de que el
            cliente se enfríe.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink to="/crear-cuenta" variant="inverse" size="lg" arrow>
              Crear cuenta gratis
            </ButtonLink>
            <ButtonLink to="/entrar" variant="inverseGhost" size="lg">
              Entrar
            </ButtonLink>
          </div>
          <p className="mt-6 text-[13px] text-paper-50/65">
            {TRIAL_DAYS} días con todo lo de Pro · sin tarjeta · todas las marcas
          </p>
        </Reveal>
        <div aria-hidden className="hidden justify-center lg:col-span-5 lg:flex">
          <BlueprintWindow />
        </div>
      </Container>
    </section>
  )
}

/** Ventana en trazo fino con cotas, como un plano en limpio. */
function BlueprintWindow() {
  return (
    <svg width="360" height="320" viewBox="0 0 360 320" fill="none" className="text-paper-50">
      <g stroke="currentColor" strokeOpacity="0.5" strokeWidth="1">
        {/* cota horizontal total */}
        <line x1="30" y1="20" x2="310" y2="20" />
        <line x1="30" y1="14" x2="30" y2="26" />
        <line x1="310" y1="14" x2="310" y2="26" />
        <line x1="26" y1="24" x2="34" y2="16" strokeOpacity="0.9" strokeWidth="1.25" />
        <line x1="306" y1="24" x2="314" y2="16" strokeOpacity="0.9" strokeWidth="1.25" />
        {/* cota vertical */}
        <line x1="336" y1="40" x2="336" y2="300" />
        <line x1="330" y1="40" x2="342" y2="40" />
        <line x1="330" y1="300" x2="342" y2="300" />
        <line x1="332" y1="44" x2="340" y2="36" strokeOpacity="0.9" strokeWidth="1.25" />
        <line x1="332" y1="304" x2="340" y2="296" strokeOpacity="0.9" strokeWidth="1.25" />
      </g>
      <text x="170" y="14" textAnchor="middle" fill="currentColor" fillOpacity="0.75" fontSize="12" className="tabular">
        2.400
      </text>
      <text
        x="352"
        y="170"
        textAnchor="middle"
        fill="currentColor"
        fillOpacity="0.75"
        fontSize="12"
        transform="rotate(90 352 170)"
        className="tabular"
      >
        2.100
      </text>
      <g stroke="currentColor" strokeWidth="1.25">
        <rect x="30" y="40" width="280" height="260" rx="2" strokeOpacity="0.9" />
        <rect x="40" y="50" width="260" height="240" strokeOpacity="0.5" />
        {/* sobreluz */}
        <line x1="40" y1="110" x2="300" y2="110" strokeOpacity="0.9" />
        {/* hojas */}
        <line x1="170" y1="110" x2="170" y2="290" strokeOpacity="0.9" />
        <rect x="48" y="118" width="114" height="164" strokeOpacity="0.6" />
        <rect x="178" y="118" width="114" height="164" strokeOpacity="0.6" />
      </g>
      {/* aperturas: abatir izquierda y oscilobatiente derecha */}
      <g stroke="currentColor" strokeOpacity="0.55" strokeWidth="1">
        <polyline points="156,124 54,200 156,276" />
        <polyline points="184,124 286,200 184,276" />
        <polyline points="184,124 235,276 286,124" />
      </g>
      {/* reflejo del vidrio de la sobreluz */}
      <g stroke="currentColor" strokeOpacity="0.35" strokeWidth="1">
        <line x1="210" y1="100" x2="240" y2="60" />
        <line x1="222" y1="100" x2="252" y2="60" />
      </g>
    </svg>
  )
}
