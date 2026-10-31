/*
 * /dev/marco — banco de pruebas de Marco: estados, tamaños, fondos y uso en contexto.
 */
import { clsx } from 'clsx'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MARCO_STATES, type MarcoState } from './engine/director'
import { MARCO_STATE_LABELS } from './labels'
import { MarcoAvatar, type MarcoLookAt, type MarcoPoint } from './MarcoAvatar'

const STATE_INFO: Record<MarcoState, { name: string; when: string }> = {
  idle: { name: 'Reposo', when: 'Sin actividad. Te mira y sigue tu cursor.' },
  listening: { name: 'Escuchando', when: 'Mientras escribes. Mira el campo de texto.' },
  thinking: { name: 'Pensando', when: 'Esperando respuesta. Aparece tras 250 ms y dura al menos 600 ms.' },
  working: { name: 'Trabajando', when: 'Calcula cortes, busca precios o arma el PDF.' },
  done: { name: 'Listo', when: 'Guiña, se alegra un momento y vuelve al reposo.' },
  approval: { name: 'Aprobación', when: 'Propone algo que cambia datos y espera tu visto bueno.' },
  error: { name: 'Error', when: 'Algo falló. Se preocupa y niega suave con la cabeza.' },
}

const SIZES = [20, 24, 32, 40, 56, 96, 160, 240] as const

/**
 * Superficies del tema oscuro escritas a mano: los tokens --color-* se resuelven en
 * :root, así que un data-theme local no cambia los fondos. El data-theme sí se deja,
 * porque es lo que aclara el cuerpo de Marco.
 */
const THEMES = {
  light: { surface: 'border-paper-200 bg-paper-0 text-paper-900', canvas: 'border-paper-200 bg-paper-50 text-paper-900', muted: 'text-paper-600' },
  dark: { surface: 'border-[#34302b] bg-[#1e1b18] text-[#ede9e3]', canvas: 'border-[#34302b] bg-[#151311] text-[#ede9e3]', muted: 'text-[#a39d94]' },
} as const

type MotionChoice = 'system' | 'full' | 'reduced'
const MOTION_OPTIONS: { value: MotionChoice; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'full', label: 'Completo' },
  { value: 'reduced', label: 'Reducido' },
]

/* ------------------------------------------------------------ piezas locales */

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-paper-200 bg-paper-0 p-0.5">
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={clsx(
              'h-7 rounded-sm px-2.5 text-[13px] font-medium transition-colors duration-150',
              checked ? 'bg-paper-100 text-paper-900 shadow-[inset_0_0_0_1px_var(--paper-200)]' : 'text-paper-600 hover:text-paper-900',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function Switch({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex h-8 items-center gap-2 rounded-md px-1 text-[13px] font-medium text-paper-900"
    >
      <span
        aria-hidden
        className={clsx(
          'relative h-[18px] w-8 rounded-full transition-colors duration-150',
          checked ? 'bg-ink-600' : 'bg-paper-200',
        )}
      >
        <span
          className={clsx(
            'absolute top-[2px] left-[2px] size-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 ease-out',
            checked && 'translate-x-[14px]',
          )}
        />
      </span>
      {children}
    </button>
  )
}

function Button({
  children,
  onClick,
  variant = 'secondary',
}: {
  children: ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 items-center rounded-sm px-3 text-[13px] font-medium transition-colors duration-150',
        variant === 'primary' && 'bg-ink-600 text-white hover:bg-ink-700',
        variant === 'secondary' && 'border border-paper-200 bg-paper-0 text-paper-900 hover:bg-paper-100',
        variant === 'ghost' && 'text-paper-600 hover:bg-paper-100 hover:text-paper-900',
      )}
    >
      {children}
    </button>
  )
}

function Section({ title, description, children, aside }: { title: string; description: string; children: ReactNode; aside?: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="border-t border-paper-200 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id={id} className="text-[20px]/[28px] font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          <p className="mt-1 max-w-[60ch] text-paper-600">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

/* ----------------------------------------------------- demo: escuchando */

/** Punto del caret de un input, para que Marco mire lo que vas escribiendo. */
function caretPoint(input: HTMLInputElement, canvas: HTMLCanvasElement | null): MarcoPoint | null {
  const box = input.getBoundingClientRect()
  const context = canvas?.getContext('2d')
  if (!context || box.width === 0) return null
  const style = getComputedStyle(input)
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const upToCaret = input.value.slice(0, input.selectionStart ?? input.value.length)
  const width = context.measureText(upToCaret).width
  const x = box.left + parseFloat(style.paddingLeft) + Math.min(width - input.scrollLeft, box.width)
  return { x, y: box.top + box.height / 2 }
}

function ListeningDemo({ reducedMotion }: { reducedMotion: boolean | undefined }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timers = useRef<number[]>([])
  const [state, setState] = useState<MarcoState>('idle')
  const [caret, setCaret] = useState<MarcoPoint | null>(null)
  const [value, setValue] = useState('')

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const trackCaret = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    canvasRef.current ??= document.createElement('canvas')
    setCaret(caretPoint(input, canvasRef.current))
  }, [])

  const later = (ms: number, next: MarcoState) => {
    timers.current.push(window.setTimeout(() => setState(next), ms))
  }

  const send = () => {
    if (!value.trim()) return
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setValue('')
    setState('thinking')
    later(1400, 'working')
    later(3600, 'done')
  }

  const lookAt: MarcoLookAt = state === 'listening' ? (caret ?? inputRef) : 'pointer'

  return (
    <div className="rounded-lg border border-paper-200 bg-paper-0 shadow-float">
      <div className="flex items-center gap-3 border-b border-paper-200 px-4 py-3">
        <MarcoAvatar state={state} size={36} lookAt={lookAt} title="Marco" reducedMotion={reducedMotion} />
        <div className="min-w-0">
          <p className="font-semibold">Marco</p>
          <p className="text-meta text-paper-600" aria-live="polite">
            {MARCO_STATE_LABELS[state]}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-paper-600">
          Escribe algo: Marco sigue tu texto con la mirada. Con Enter piensa, trabaja y te avisa cuando termina.
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setState((current) => (current === 'idle' || current === 'done' ? 'listening' : current))
            trackCaret()
          }}
          onFocus={() => {
            setState('listening')
            trackCaret()
          }}
          onBlur={() => {
            setState((current) => (current === 'listening' ? 'idle' : current))
          }}
          onKeyUp={trackCaret}
          onClick={trackCaret}
          onSelect={trackCaret}
          onKeyDown={(event) => {
            if (event.key === 'Enter') send()
          }}
          placeholder="Pregúntame o pega medidas (ej. 1500×1200 corredera)"
          aria-label="Mensaje para Marco"
          className="h-10 w-full rounded-md border border-paper-350 bg-paper-0 px-3 text-[14px] placeholder:text-paper-600"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------ demo: aprobación */

function ApprovalDemo({ reducedMotion }: { reducedMotion: boolean | undefined }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<MarcoState>('approval')
  const pending = state === 'approval'

  return (
    <div className="flex items-start gap-4 rounded-lg border border-paper-200 bg-paper-0 p-4 shadow-float">
      <MarcoAvatar state={state} size={56} lookAt={cardRef} title="Marco" reducedMotion={reducedMotion} />
      <div ref={cardRef} className="min-w-0 flex-1 rounded-md border border-paper-200 bg-paper-50 p-4">
        {pending ? (
          <>
            <p className="font-semibold">¿Envío la cotización COT-0142 a Constructora Andes?</p>
            <p className="mt-1 text-paper-600">
              3 ventanas · <span className="tabular">$1.284.500 + IVA ($1.528.555 con IVA)</span> · a compras@andes.cl
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setState('done')}>
                Sí, enviar
              </Button>
              <Button onClick={() => setState('listening')}>Cambiar algo</Button>
              <Button variant="ghost" onClick={() => setState('idle')}>
                No
              </Button>
            </div>
            <p className="mt-3 text-meta text-paper-600">Puedes seguir trabajando mientras decides.</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-paper-600" aria-live="polite">
              {state === 'done' ? 'Listo, la envié. Te aviso cuando la abran.' : 'Entendido, no envío nada.'}
            </p>
            <Button onClick={() => setState('approval')}>Volver a pedir</Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- página */

export default function MarcoShowcase() {
  const [motion, setMotion] = useState<MotionChoice>('system')
  const [follow, setFollow] = useState(true)
  const [replay, setReplay] = useState(0)
  const [sizeState, setSizeState] = useState<MarcoState>('idle')

  const reducedMotion = motion === 'system' ? undefined : motion === 'reduced'
  const lookAt: MarcoLookAt = follow ? 'pointer' : 'none'
  const stateOptions = MARCO_STATES.map((state) => ({ value: state, label: STATE_INFO[state].name }))

  return (
    <div className="min-h-dvh bg-paper-50 text-paper-900">
      <div className="mx-auto max-w-6xl px-6 pb-16 sm:px-10">
        <header className="flex flex-wrap items-center justify-between gap-8 py-12">
          <div className="flex items-center gap-6">
            <MarcoAvatar state="idle" size={96} lookAt={lookAt} title="Marco" reducedMotion={reducedMotion} />
            <div>
              <p className="font-mono text-meta text-paper-600">/dev/marco</p>
              <h1 className="text-[32px]/[40px] font-semibold tracking-[-0.01em]">Marco</h1>
              <p className="mt-1 max-w-[52ch] text-lead text-paper-600">
                La cara del asistente: una bola de tinta con dos ojos que miran, piensan y avisan. Aquí revisas cada
                estado, cada tamaño y cómo se ve sobre claro y oscuro.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Switch checked={follow} onChange={setFollow}>
              Seguir el cursor
            </Switch>
            <Segmented label="Movimiento" value={motion} options={MOTION_OPTIONS} onChange={setMotion} />
            <Button onClick={() => setReplay((n) => n + 1)}>Repetir animaciones</Button>
          </div>
        </header>

        <Section
          title="Estados"
          description="Siete estados, cada uno con su disparador. La emoción la pone Marco; el texto del panel se mantiene útil."
        >
          <ul key={replay} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {MARCO_STATES.map((state) => (
              <li key={state} className="flex flex-col rounded-lg border border-paper-200 bg-paper-0 p-4">
                <div className="flex h-28 items-center justify-center">
                  <MarcoAvatar state={state} size={88} lookAt={lookAt} reducedMotion={reducedMotion} />
                </div>
                <p className="mt-3 font-semibold">{STATE_INFO[state].name}</p>
                <p className="font-mono text-meta text-paper-600">{state}</p>
                <p className="mt-2 text-meta text-paper-600">{STATE_INFO[state].when}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Tamaños"
          description="De 20 a 240 px. Bajo 36 px los ojos crecen un poco para leerse, y bajo 32 px queda un solo anillo."
          aside={<Segmented label="Estado" value={sizeState} options={stateOptions} onChange={setSizeState} />}
        >
          <div key={replay} className="space-y-3">
            {(['light', 'dark'] as const).map((theme) => (
              <div
                key={theme}
                data-theme={theme === 'dark' ? 'dark' : undefined}
                className={clsx('rounded-lg border px-6 py-8', THEMES[theme].surface)}
              >
                <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
                  {SIZES.map((size) => (
                    <figure key={size} className="flex flex-col items-center gap-2">
                      <MarcoAvatar state={sizeState} size={size} lookAt={lookAt} reducedMotion={reducedMotion} />
                      <figcaption className={clsx('font-mono text-meta', THEMES[theme].muted)}>{size} px</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Claro y oscuro"
          description="El cuerpo usa la tinta de la marca; en tema oscuro se aclara para no perderse en el fondo y los ojos siguen blancos."
        >
          <div key={replay} className="grid gap-3 lg:grid-cols-2">
            {(['light', 'dark'] as const).map((theme) => (
              <div
                key={theme}
                data-theme={theme === 'dark' ? 'dark' : undefined}
                className={clsx('rounded-lg border p-6', THEMES[theme].canvas)}
              >
                <p className={clsx('mb-5 text-meta font-medium', THEMES[theme].muted)}>
                  {theme === 'dark' ? 'Tema oscuro' : 'Tema claro'}
                </p>
                <div className="grid grid-cols-4 gap-x-4 gap-y-6 sm:grid-cols-7">
                  {MARCO_STATES.map((state) => (
                    <div key={state} className="flex flex-col items-center gap-2">
                      <MarcoAvatar state={state} size={48} lookAt={lookAt} reducedMotion={reducedMotion} />
                      <span className={clsx('text-meta', THEMES[theme].muted)}>{STATE_INFO[state].name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="En contexto"
          description="Así se comporta dentro del panel: mira lo que escribes, señala lo que hay que aprobar y deja miniaturas quietas junto a cada mensaje."
        >
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <ListeningDemo reducedMotion={reducedMotion} />
            <div className="space-y-3">
              <ApprovalDemo key={replay} reducedMotion={reducedMotion} />
              <div className="rounded-lg border border-paper-200 bg-paper-0 p-4">
                <p className="mb-3 text-meta font-medium text-paper-600">Miniaturas estáticas (20 px, sin animación)</p>
                <ul className="space-y-3">
                  {(
                    [
                      ['done', 'Listo. Te dejé la cotización COT-0142 en borrador: 3 ventanas, $1.284.500 + IVA.'],
                      ['approval', '¿Envío la cotización COT-0142 a Constructora Andes?'],
                      ['error', 'No pude conectar con la lista de precios. Lo intento de nuevo en 5 s.'],
                      ['idle', 'Hola, soy Marco. Te ayudo a cotizar, calcular cortes y seguir tus pedidos.'],
                    ] as const
                  ).map(([state, text]) => (
                    <li key={state} className="flex items-start gap-2.5">
                      <MarcoAvatar state={state} size={20} animated={false} className="mt-px" />
                      <p className="text-[14px]/[20px]">{text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
