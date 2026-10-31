import { Check } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { TRIAL_DAYS } from '@framezen/shared'
import { ButtonLink, Container, Reveal, useEntrance } from '../components/primitives'
import { HeroDesigner } from '../designer/HeroDesigner'

const PROMISES = [
  `${TRIAL_DAYS} días gratis, sin tarjeta`,
  'Todas tus marcas de perfiles',
  'Computador, tablet o teléfono',
]

export function Hero() {
  const reduce = useReducedMotion()

  return (
    <section aria-labelledby="hero-title" className="relative pt-10 pb-20 sm:pt-16 lg:pt-20 lg:pb-24">
      <Container>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className="lg:col-span-7">
            <Reveal as="p" when="mount" className="text-[14px] font-medium text-paper-600">
              Para talleres de ventanas y puertas de PVC
            </Reveal>
            <Reveal
              as="h1"
              when="mount"
              delay={0.04}
              id="hero-title"
              className="mt-5 text-[38px] leading-[42px] font-semibold tracking-[-0.025em] text-paper-900 sm:text-[60px] sm:leading-[62px] lg:text-[64px] lg:leading-[66px]"
            >
              Cotiza en minutos.{' '}
              <span className="block">
                Fabrica al{' '}
                <span className="relative inline-block whitespace-nowrap">
                  milímetro.
                  <MillimeterMark delay={reduce ? 0 : 0.35} />
                </span>
              </span>
            </Reveal>
          </div>

          <div className="lg:col-span-5 lg:pb-1 xl:pl-8">
            <Reveal as="p" when="mount" delay={0.08} className="max-w-[46ch] text-[17px] leading-[28px] text-pretty text-paper-600">
              Dibujas la ventana, ves su precio al instante y mandas una cotización que da gusto aceptar. Después,
              el taller recibe los cortes optimizados, los vidrios y los materiales. Sin planillas ni medidas copiadas
              a mano.
            </Reveal>
            <Reveal when="mount" delay={0.12} className="mt-7 flex flex-wrap items-center gap-3">
              <ButtonLink to="/crear-cuenta" size="lg" arrow>
                Probar gratis {TRIAL_DAYS} días
              </ButtonLink>
              <ButtonLink to="/entrar" size="lg" variant="secondary">
                Ya tengo cuenta
              </ButtonLink>
            </Reveal>
          </div>
        </div>

        <Reveal
          as="ul"
          when="mount"
          delay={0.16}
          className="mt-8 flex flex-col gap-2 text-[14px] text-paper-600 sm:flex-row sm:flex-wrap sm:gap-x-6 lg:mt-10"
        >
          {PROMISES.map((promise) => (
            <li key={promise} className="flex items-center gap-1.5">
              <Check aria-hidden strokeWidth={1.75} className="size-4 text-ok-600" />
              {promise}
            </li>
          ))}
        </Reveal>

        <Reveal when="mount" delay={0.12} className="mt-10 lg:mt-12">
          <HeroDesigner />
          <p className="mt-3 max-w-[90ch] text-[12px] leading-4 text-paper-600">
            Pruébalo con tus medidas: el dibujo y el precio los calcula aquí mismo el motor de Framezen, con un catálogo
            de ejemplo, margen de 40 % y mano de obra incluida. Con tu lista de precios, el precio es el tuyo.
          </p>
        </Reveal>
      </Container>
    </section>
  )
}

/** Cota bajo «milímetro.»: línea fina con remates oblicuos que se dibuja al cargar. */
function MillimeterMark({ delay }: { delay: number }) {
  const ref = useEntrance<HTMLSpanElement>({
    when: 'mount',
    delay,
    duration: 300,
    keyframes: [
      { opacity: 0, transform: 'scaleX(0.6)' },
      { opacity: 1, transform: 'none' },
    ],
  })
  return (
    <span ref={ref} aria-hidden data-reveal="" className="absolute right-[0.32em] -bottom-2 left-0 flex origin-left items-center text-ink-600">
      <ObliqueTick />
      <span className="-mx-[5px] h-px flex-1 bg-current" />
      <ObliqueTick />
    </span>
  )
}

function ObliqueTick() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" className="shrink-0">
      <line x1="5" y1="1" x2="5" y2="11" stroke="currentColor" strokeWidth="1" strokeOpacity="0.55" />
      <line x1="1.5" y1="9.5" x2="8.5" y2="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
