/**
 * Dictado por voz con la Web Speech API (Chrome, Edge, Safari). Si el navegador no la tiene, el
 * botón no aparece. Escucha en el idioma de la interfaz (es-CL, en-US, pt-BR…); entrega el texto
 * final y el parcial mientras hablas.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { intlTag } from '@dekopen/shared'
import { useLocale, useT } from '../../lib/i18n'
import es from './i18n/es'

interface SpeechAlternative {
  transcript: string
}
interface SpeechResult {
  isFinal: boolean
  0: SpeechAlternative
}
interface SpeechEvent {
  resultIndex: number
  results: ArrayLike<SpeechResult>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}
type SpeechCtor = new () => SpeechRecognitionLike

function speechCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isDictationSupported(): boolean {
  return speechCtor() !== null
}

export function useDictation(options: { onFinal(text: string): void; lang?: string }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const { locale } = useLocale()
  const t = useT(es)
  const lang = options.lang ?? intlTag(locale)
  const onFinal = useRef(options.onFinal)
  onFinal.current = options.onFinal
  const supported = isDictationSupported()

  const stop = useCallback(() => {
    recognition.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = speechCtor()
    if (!Ctor || recognition.current) return
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = false
    rec.interimResults = true
    rec.onresult = (event) => {
      let partial = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) onFinal.current(text.trim())
        else partial += text
      }
      setInterim(partial.trim())
    }
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setProblem(t('dictation.denied'))
      else if (event.error === 'no-speech') setProblem(t('dictation.noSpeech'))
      else if (event.error && event.error !== 'aborted') setProblem(t('dictation.unavailable'))
    }
    rec.onend = () => {
      recognition.current = null
      setListening(false)
      setInterim('')
    }
    recognition.current = rec
    setProblem(null)
    try {
      rec.start()
      setListening(true)
    } catch {
      recognition.current = null
      setProblem(t('dictation.unavailable'))
    }
  }, [lang, t])

  useEffect(() => () => recognition.current?.abort(), [])

  return { supported, listening, interim, problem, start, stop, clearProblem: () => setProblem(null) }
}
