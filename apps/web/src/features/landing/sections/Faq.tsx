import { TRIAL_CREDITS, TRIAL_DAYS } from '@framezen/shared'
import { Plus } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Accordion } from 'radix-ui'
import { EASE_OUT, Kicker, Section, SectionTitle } from '../components/primitives'
import { formatInt } from '../lib/format'

export const FAQ: { question: string; answer: string }[] = [
  {
    question: '¿Necesito tarjeta para probar?',
    answer: `No. Creas tu cuenta con tu correo y tienes ${TRIAL_DAYS} días con todo lo del plan Pro, incluidos ${formatInt(TRIAL_CREDITS)} créditos para Marco. Nada se cobra solo.`,
  },
  {
    question: '¿Qué pasa cuando termina la prueba?',
    answer:
      'Eliges un plan y sigues donde quedaste. Si no eliges, tu cuenta queda en modo lectura: ves todo y puedes exportar tus cotizaciones, clientes y catálogo cuando quieras. No se borra nada.',
  },
  {
    question: '¿Sirve con las marcas de perfiles que uso?',
    answer:
      'Sí. Trabajas con todas las marcas que quieras, en todos los planes. Cada línea tiene su pauta de corte (descuentos de marco, hoja, travesaño y refuerzo), y si una línea no viene cargada la armas a partir de una parecida.',
  },
  {
    question: '¿Puedo usar mis propios precios?',
    answer:
      'Claro. Cargas tu lista de precios por perfil, color, vidrio y herraje, o importas un CSV. Defines descuentos por familia, margen, mano de obra por m², merma y redondeo. El precio de cada ventana sale de ahí, y te explica de dónde sale cada peso.',
  },
  {
    question: '¿Puedo cambiar una cotización después de enviarla?',
    answer:
      'Sí. La editas como siempre y, al reenviarla, Framezen guarda la versión B (y luego C, D…). Tu cliente siempre ve la última que le mandaste.',
  },
  {
    question: '¿Funciona en el teléfono y en la tablet?',
    answer:
      'Sí, en el navegador del computador, la tablet o el teléfono, sin instalar nada. Tus clientes abren y aceptan la cotización desde su teléfono.',
  },
  {
    question: '¿Y si trabajo aluminio además de PVC?',
    answer:
      'Framezen está pensado para PVC y también sirve para aluminio: cargas las líneas con su pauta y sus precios, y se cotizan y cortan igual.',
  },
  {
    question: '¿Cómo se paga y puedo cancelar?',
    answer:
      'Pagas con Flow, mes a mes o por año. Los precios son netos en pesos chilenos y se les suma IVA. Puedes cambiar de plan o cancelar cuando quieras, sin contrato de permanencia.',
  },
]

export function Faq() {
  const reduce = useReducedMotion()
  return (
    <Section id="preguntas" labelledBy="faq-title" className="border-t border-paper-200">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Kicker index="07">Preguntas</Kicker>
          <SectionTitle id="faq-title">Preguntas frecuentes.</SectionTitle>
          <p className="mt-5 max-w-[34ch] text-[15px] leading-6 text-paper-600">
            ¿Te quedó una duda? Crea tu cuenta y pregúntale a Marco: conoce Framezen de punta a punta.
          </p>
        </div>
        <Accordion.Root type="single" collapsible className="border-t border-paper-200 lg:col-span-8">
          {FAQ.map((item, index) => (
            <Accordion.Item key={item.question} value={`faq-${index}`} className="border-b border-paper-200">
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 py-5 text-left text-[17px] leading-6 font-medium text-paper-900 transition-colors duration-[120ms] hover:text-ink-700">
                  {item.question}
                  <Plus
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-5 shrink-0 text-paper-600 transition-transform duration-[200ms] ease-out group-data-[state=open]:rotate-45"
                  />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <motion.p
                  initial={{ opacity: 0, y: reduce ? 0 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="max-w-[62ch] pr-10 pb-5 text-[15px] leading-6 text-pretty text-paper-600"
                >
                  {item.answer}
                </motion.p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </Section>
  )
}
