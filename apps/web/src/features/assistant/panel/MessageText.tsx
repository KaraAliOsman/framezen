/**
 * Texto del asistente con un markdown mínimo y seguro: párrafos, listas (- • * y 1.), **negrita** y
 * `código` (ids, medidas). Todo se dibuja como texto de React: nada se interpreta como HTML ni hay
 * enlaces que el modelo pueda inventar. En streaming, un cursor fino de acento al final.
 */
import { Fragment, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { hideOpenMarks, useSmoothText } from './streaming'

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) out.push(<Fragment key={`${key}t${i++}`}>{text.slice(last, index)}</Fragment>)
    const token = match[0]
    if (token.startsWith('**')) out.push(<strong key={`${key}b${i++}`} className="font-semibold text-fg-strong">{token.slice(2, -2)}</strong>)
    else out.push(<code key={`${key}c${i++}`} className="code-id rounded-xs bg-sunken px-1 text-table">{token.slice(1, -1)}</code>)
    last = index + token.length
  }
  if (last < text.length) out.push(<Fragment key={`${key}t${i++}`}>{text.slice(last)}</Fragment>)
  return out
}

export function StreamCaret() {
  const reduced = useReducedMotion()
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-accent align-baseline"
      animate={reduced ? undefined : { opacity: [1, 1, 0, 0] }}
      transition={reduced ? undefined : { duration: 1, repeat: Infinity, ease: 'linear', times: [0, 0.5, 0.5, 1] }}
    />
  )
}

export function MessageText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const { shown, settling } = useSmoothText(text, streaming)
  return <Blocks text={streaming || settling ? hideOpenMarks(shown) : text} caret={streaming || settling} />
}

function Blocks({ text, caret }: { text: string; caret: boolean }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={`l${blocks.length}`} className={list.ordered ? 'my-1 list-decimal space-y-0.5 pl-5 marker:text-fg-muted' : 'my-1 list-disc space-y-0.5 pl-4 marker:text-fg-faint'}>
        {list.items.map((item, i) => (
          <li key={i}>{inline(item, `l${blocks.length}i${i}`)}</li>
        ))}
      </Tag>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d{1,2}[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#{1,6}\s+/, ''), `p${blocks.length}`)}</p>)
  }
  flush()
  if (caret) {
    const lastBlock = blocks.pop()
    blocks.push(
      <div key="stream" className="[&>p]:inline">
        {lastBlock}
        <StreamCaret />
      </div>,
    )
  }
  return <div className="space-y-1.5">{blocks}</div>
}
