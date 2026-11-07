/**
 * Miniatura de un diseño de documento (36 × 46): la primera página dibujada con los colores, la
 * estructura y el tipo de portada e ítems de la plantilla, para elegir diseño sin abrirlo. Es un
 * esquema vectorial (liviano: hay diez en la lista), no una captura.
 */
import { memo } from 'react'
import type { DocTemplate } from '@dekopen/shared'

const W = 36
const H = 46

function WindowGlyph({ x, y, w, h, ink, glass, accent }: { x: number; y: number; w: number; h: number; ink: string; glass: string; accent: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={glass} stroke={ink} strokeWidth={0.7} />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={ink} strokeWidth={0.5} />
      <rect x={x + 0.6} y={y + 0.6} width={0.8} height={h - 1.2} fill={accent} />
    </g>
  )
}

export const TemplateThumb = memo(function TemplateThumb({ template, className }: { template: DocTemplate | undefined; className?: string }) {
  if (!template) return null
  const p = template.theme.palette
  const sections = template.sections.filter((s) => s.enabled !== false)
  const cover = sections[0]?.type === 'cover' ? (sections[0].options as { variant?: string }).variant : undefined
  const items = sections.find((s) => s.type === 'items')
  const itemVariant = (items?.options as { variant?: string } | undefined)?.variant ?? 'table'
  const glass = '#DCEBEC'
  const strongBand = template.theme.accentUsage !== 'minimal'
  const radius = template.theme.radius === 'none' ? 0 : template.theme.radius === 'small' ? 0.6 : 1.2

  let body
  if (cover) {
    const photo = cover === 'photo' || cover === 'split'
    body = (
      <g>
        {cover === 'split' ? <rect x={0} y={0} width={W / 2} height={H} fill={p.surface} /> : null}
        {photo ? (
          <rect x={cover === 'split' ? 0 : 3} y={3} width={cover === 'split' ? W / 2 : W - 6} height={cover === 'split' ? H : 22} fill={p.surface} rx={radius} />
        ) : cover === 'typographic' ? null : (
          <WindowGlyph x={9} y={6} w={18} h={18} ink={p.ink} glass={glass} accent={p.accent} />
        )}
        <rect x={cover === 'split' ? W / 2 + 2 : 4} y={cover === 'typographic' ? 12 : 29} width={cover === 'split' ? 12 : 22} height={2.4} fill={p.ink} rx={0.4} />
        <rect x={cover === 'split' ? W / 2 + 2 : 4} y={cover === 'typographic' ? 16 : 33} width={cover === 'split' ? 9 : 15} height={1.2} fill={p.muted} rx={0.3} />
        <rect x={cover === 'split' ? W / 2 + 2 : 4} y={H - 8} width={cover === 'split' ? 12 : 12} height={3} fill={strongBand ? p.accent : p.rule} rx={radius} />
      </g>
    )
  } else {
    const header = (
      <g>
        <rect x={3} y={3} width={4} height={4} fill={p.accent} rx={radius} />
        <rect x={9} y={3.6} width={14} height={1.4} fill={p.ink} rx={0.3} />
        <rect x={9} y={6} width={9} height={0.9} fill={p.muted} rx={0.3} />
        <line x1={3} y1={9.5} x2={W - 3} y2={9.5} stroke={p.rule} strokeWidth={0.5} />
      </g>
    )
    let rows
    if (itemVariant === 'table') {
      rows = (
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect x={3} y={12 + i * 5.4} width={4} height={4} fill={glass} stroke={p.ink} strokeWidth={0.4} />
              <rect x={9} y={13 + i * 5.4} width={13} height={1} fill={p.ink} rx={0.3} />
              <rect x={26} y={13 + i * 5.4} width={7} height={1} fill={p.muted} rx={0.3} />
            </g>
          ))}
        </g>
      )
    } else if (itemVariant === 'gallery') {
      rows = (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x={3 + (i % 2) * 15.5} y={12 + Math.floor(i / 2) * 13} width={14} height={11.5} fill={p.surface} rx={radius} />
              <WindowGlyph x={6.5 + (i % 2) * 15.5} y={13.5 + Math.floor(i / 2) * 13} w={7} h={7} ink={p.ink} glass={glass} accent={p.accent} />
            </g>
          ))}
        </g>
      )
    } else if (itemVariant === 'sheet' || itemVariant === 'per_page') {
      rows = (
        <g>
          <WindowGlyph x={4} y={12} w={15} h={17} ink={p.ink} glass={glass} accent={p.accent} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={22} y={13 + i * 3.4} width={11 - (i % 2) * 3} height={1} fill={i === 0 ? p.ink : p.muted} rx={0.3} />
          ))}
          <line x1={3} y1={32} x2={W - 3} y2={32} stroke={p.rule} strokeWidth={0.5} />
        </g>
      )
    } else {
      rows = (
        <g>
          {[0, 1].map((i) => (
            <g key={i}>
              <rect x={3} y={12 + i * 11} width={W - 6} height={10} fill={p.surface} rx={radius} />
              <WindowGlyph x={5} y={13.5 + i * 11} w={7} h={7} ink={p.ink} glass={glass} accent={p.accent} />
              <rect x={14} y={14.5 + i * 11} width={11} height={1.1} fill={p.ink} rx={0.3} />
              <rect x={14} y={17.5 + i * 11} width={7} height={0.9} fill={p.muted} rx={0.3} />
            </g>
          ))}
        </g>
      )
    }
    body = (
      <g>
        {header}
        {rows}
        <rect x={W - 15} y={H - 9} width={12} height={4.5} fill={strongBand ? p.strong : p.surface} rx={radius} />
        <rect x={W - 13} y={H - 7.3} width={8} height={1.1} fill={strongBand ? p.onStrong : p.ink} rx={0.3} />
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className={className ?? 'h-9 w-7'} style={{ flexShrink: 0 }}>
      <rect x={0.25} y={0.25} width={W - 0.5} height={H - 0.5} fill={p.paper} stroke="var(--dk-divider-strong)" strokeWidth={0.5} rx={0.8} />
      {body}
    </svg>
  )
})
