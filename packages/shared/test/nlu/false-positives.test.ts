/**
 * Corpus negativo (investigación 24 §7.3): preguntas libres, conversación, negaciones, órdenes con
 * palabras de más y redacción → `unmatched` (van a la IA). Nada se ejecuta por accidente.
 */
import { describe, expect, it } from 'vitest'
import type { Locale } from '../../src/i18n/locales'
import { makeNlu, QUOTE_CTX } from './fixtures'

const FREE: Record<Locale, string[]> = {
  es: [
    '¿Cuál es el mejor color para una ventana de baño?',
    '¿Qué opinas del mercado de ventanas en Chile?',
    '¿Cuánto cuesta una corredera de 1500x1200?',
    '¿Cómo se calcula el precio de una ventana?',
    'Necesito ayuda para convencer a un cliente de que la corredera es mejor',
    'Hola, ¿cómo estás?',
    'Escríbeme un correo para el cliente explicando el retraso',
    '¿Por qué el PVC es mejor que el aluminio?',
    'Redacta una nota bonita para la cotización',
    '¿Qué diferencia hay entre termopanel y laminado?',
    'dame ideas para vender más ventanas',
    '¿Es buena idea usar vidrio laminado en un baño?',
    'Explícame qué es una oscilobatiente',
    'cuéntame un chiste',
    '¿qué tiempo hace hoy?',
    'Haz un resumen de la reunión de ayer',
    'ayúdame a redactar un correo para Pérez',
    '¿Qué me recomiendas para una casa en la playa?',
    'La cotización de Pérez tiene un error en el precio, ¿lo revisas?',
    'Quiero que me expliques cómo funciona el margen',
    'compárame dos correderas',
    'traduce este texto al inglés',
    'el cielo está azul hoy',
    'agrega una corredera para la casa de mi hermano que vive en Temuco',
  ],
  en: [
    'What is the best window for a cold climate?',
    'Write an email to the client about the delay',
    'Why is PVC better than aluminium?',
    'Can you explain how pricing works?',
    'Tell me a joke',
    'What do you think about triple glazing?',
    'Is laminated glass good for bathrooms?',
    'Summarize this quote for my boss',
  ],
  pt: ['Qual é a melhor janela para clima frio?', 'Escreva um e-mail para o cliente explicando o atraso', 'Por que o PVC é melhor que o alumínio?'],
  fr: ['Quelle est la meilleure fenêtre pour un climat froid ?', 'Écris un e-mail au client pour expliquer le retard', 'Pourquoi le PVC est-il meilleur que l’aluminium ?'],
  de: ['Welches Fenster ist am besten für kaltes Klima?', 'Schreibe eine E-Mail an den Kunden wegen der Verspätung', 'Warum ist PVC besser als Aluminium?'],
  it: ['Qual è la finestra migliore per un clima freddo?', 'Scrivi una email al cliente per spiegare il ritardo', 'Perché il PVC è meglio dell’alluminio?'],
  tr: ['Soğuk iklim için en iyi pencere hangisi?', 'Gecikmeyi açıklayan bir e-posta yaz', 'PVC neden alüminyumdan daha iyi?'],
}

const NEGATED: [Locale, string][] = [
  ['es', 'No envíes la cotización todavía'],
  ['es', 'no borres la V2'],
  ['en', "Don't send the quote"],
  ['en', 'do not remove V3'],
  ['pt', 'Não envie o orçamento'],
  ['fr', "N'envoie pas le devis"],
  ['fr', 'ne supprime pas la V2'],
  ['de', 'Sende das Angebot nicht'],
  ['de', 'Position 3 nicht löschen'],
  ['it', 'Non inviare il preventivo'],
  ['it', 'non eliminare la V2'],
  ['tr', 'Teklifi gönderme'],
  ['tr', '3. kalemi silme'],
]

describe('falsos positivos: todo lo libre va a la IA', () => {
  for (const [locale, texts] of Object.entries(FREE) as [Locale, string[]][]) {
    it(locale, () => {
      const nlu = makeNlu(locale)
      for (const text of texts) {
        const r = nlu.parse(text, QUOTE_CTX)
        expect(r.status, `${text} → ${r.command} ${r.interpretation}`).toBe('unmatched')
        expect(r.plan).toBeNull()
      }
    })
  }

  it('las negaciones nunca ejecutan', () => {
    for (const [locale, text] of NEGATED) {
      const r = makeNlu(locale).parse(text, QUOTE_CTX)
      expect(r.status, text).toBe('unmatched')
      expect(r.plan).toBeNull()
    }
  })

  it('«¿cómo quito un ítem?» explica, no quita', () => {
    for (const [locale, text] of [
      ['es', '¿cómo quito una ventana?'],
      ['en', 'How do I remove an item?'],
      ['pt', 'Como removo um item?'],
    ] as [Locale, string][]) {
      const r = makeNlu(locale).parse(text, QUOTE_CTX)
      expect(r.status, text).toBe('answer')
      expect(r.plan).toEqual([])
    }
  })

  it('palabras de comando entre comillas son texto (título), no órdenes', () => {
    const r = makeNlu('es').parse('crea una cotización llamada "Elimina la V2 y envía todo"', QUOTE_CTX)
    expect(r.plan).toEqual([expect.objectContaining({ tool: 'create_quote', args: { title: 'Elimina la V2 y envía todo' } })])
  })

  it('texto vacío, solo signos o demasiado largo → sin plan', () => {
    const nlu = makeNlu('es')
    for (const text of ['', '   ', '¿?', '...', '!!!']) expect(nlu.parse(text, QUOTE_CTX).status).toBe('unmatched')
    expect(nlu.parse(`agrega una corredera ${'muy '.repeat(400)}grande`, QUOTE_CTX).status).toBe('unmatched')
  })
})
