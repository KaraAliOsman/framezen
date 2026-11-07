/**
 * Huella de una plantilla: dos páginas en miniatura dibujadas con su paleta, su radio y su
 * estructura real (portada o no, variante de ítems, caja de totales). No es el render del documento
 * (eso está en Documentos): sirve para reconocer cada diseño de un vistazo en Ajustes.
 */
import type { DocSection, DocTemplate } from '@dekopen/shared'
import { cn } from '../../../lib/cn'

const W = 64
const PAGE_H = { A4: 90.5, Letter: 82.8 } as const

function sectionOf(template: DocTemplate, types: readonly DocSection['type'][]): DocSection | undefined {
  return template.sections.find((s) => (types as readonly string[]).includes(s.type))
}

function variantOf(section: DocSection | undefined): string | undefined {
  const options = section?.options as { variant?: unknown } | undefined
  return typeof options?.variant === 'string' ? options.variant : undefined
}

/** Ventana mínima: marco y una división, en el color de tinta del tema. */
function Win({ x, y, w, h, ink, glass, split = true }: { x: number; y: number; w: number; h: number; ink: string; glass: string; split?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={glass} stroke={ink} strokeWidth={0.7} />
      {split ? <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={ink} strokeWidth={0.6} /> : null}
    </g>
  )
}

export function TemplateThumb({ template, className }: { template: DocTemplate; className?: string }) {
  const { palette, radius, accentUsage } = template.theme
  const H = PAGE_H[template.page.size === 'A4' ? 'A4' : 'Letter']
  const r = radius === 'none' ? 0 : radius === 'small' ? 0.8 : radius === 'medium' ? 1.6 : 2.6
  const m = 5
  const glass = palette.surface
  const cover = template.sections[0]?.type === 'cover' ? template.sections[0] : undefined
  const items = sectionOf(template, ['items', 'product_cards', 'families'])
  const itemsVariant = variantOf(items) ?? 'table'
  const totals = sectionOf(template, ['totals'])
  const bold = accentUsage === 'bold' || accentUsage === 'bands'

  const lines = (x: number, y: number, widths: number[], color: string, gap = 2.6) =>
    widths.map((w, i) => <rect key={i} x={x} y={y + i * gap} width={w} height={1} rx={0.5} fill={color} />)

  const pageA = cover ? (
    <g>
      {bold ? <rect x={0} y={0} width={W} height={variantOf(cover) === 'split' ? H : 16} fill={palette.accent} opacity={variantOf(cover) === 'split' ? 0.12 : 1} /> : null}
      <rect x={m} y={m} width={6} height={6} rx={r} fill={bold ? palette.onAccent : palette.strong} opacity={0.9} />
      {variantOf(cover) === 'typographic' ? (
        <g>
          <rect x={m} y={30} width={40} height={4} fill={palette.ink} />
          <rect x={m} y={37} width={28} height={4} fill={palette.ink} />
          {lines(m, 48, [30, 24], palette.muted)}
        </g>
      ) : variantOf(cover) === 'photo' ? (
        <g>
          <rect x={0} y={20} width={W} height={36} fill={palette.surface} />
          <path d={`M0 56 L18 40 L30 50 L44 34 L${W} 52 L${W} 56 Z`} fill={palette.rule} />
          {lines(m, 62, [34, 22], palette.ink, 3)}
        </g>
      ) : (
        <g>
          <Win x={W / 2 - 15} y={24} w={30} h={26} ink={palette.ink} glass={glass} />
          {lines(m, 58, [36, 22], palette.ink, 3)}
        </g>
      )}
      <rect x={m} y={H - 14} width={20} height={3.4} rx={r / 2} fill={palette.accent} />
      {lines(m, H - 8, [14], palette.muted)}
    </g>
  ) : (
    <g>
      <rect x={m} y={m} width={6} height={6} rx={r} fill={palette.strong} />
      {lines(W - m - 16, m + 1, [16, 10], palette.muted)}
      <rect x={m} y={16} width={W - 2 * m} height={bold ? 7 : 0.6} fill={bold ? palette.accent : palette.rule} opacity={bold ? 0.14 : 1} />
      {lines(m, 28, [40, 34, 38], palette.muted)}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Win x={m} y={40 + i * 13} w={10} h={9} ink={palette.ink} glass={glass} />
          {lines(m + 14, 41 + i * 13, [24, 16], palette.muted)}
          <rect x={W - m - 10} y={41 + i * 13} width={10} height={1.2} fill={palette.ink} />
        </g>
      ))}
    </g>
  )

  const card = (x: number, y: number, w: number, h: number, key: string) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={palette.surface} stroke={palette.rule} strokeWidth={0.4} />
      <Win x={x + w * 0.22} y={y + 3} w={w * 0.56} h={h * 0.48} ink={palette.ink} glass={palette.paper} />
      {lines(x + 3, y + h * 0.62 + 2, [w * 0.6, w * 0.4], palette.muted, 2.4)}
    </g>
  )

  const itemsBody = (() => {
    const top = 12
    switch (itemsVariant) {
      case 'cards':
      case 'grid':
      case 'lifestyle': {
        const cols = 2
        const cw = (W - 2 * m - 3) / cols
        return [0, 1, 2, 3].map((i) => card(m + (i % cols) * (cw + 3), top + Math.floor(i / cols) * 25, cw, 22, `c${i}`))
      }
      case 'gallery':
      case 'lookbook':
        return [0, 1, 2, 3, 4, 5].map((i) => (
          <Win key={i} x={m + (i % 3) * 18.5} y={top + Math.floor(i / 3) * 22} w={16} h={18} ink={palette.ink} glass={glass} split={i % 2 === 0} />
        ))
      case 'sheet':
      case 'per_page':
        return (
          <g>
            <Win x={m + 4} y={top + 2} w={W - 2 * m - 8} h={34} ink={palette.ink} glass={glass} />
            <line x1={m + 4} y1={top + 39} x2={W - m - 4} y2={top + 39} stroke={palette.muted} strokeWidth={0.4} />
            {lines(m, top + 44, [44, 38, 40], palette.muted)}
          </g>
        )
      default:
        return (
          <g>
            <rect x={m} y={top} width={W - 2 * m} height={3} fill={bold ? palette.strong : palette.surface} />
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <rect x={m} y={top + 5 + i * 8} width={6} height={6} fill={glass} stroke={palette.ink} strokeWidth={0.5} />
                {lines(m + 9, top + 6 + i * 8, [26], palette.muted)}
                <rect x={W - m - 9} y={top + 6 + i * 8} width={9} height={1.2} fill={palette.ink} />
                <line x1={m} y1={top + 12 + i * 8} x2={W - m} y2={top + 12 + i * 8} stroke={palette.rule} strokeWidth={0.3} />
              </g>
            ))}
          </g>
        )
    }
  })()

  const totalsBox = totals ? (
    variantOf(totals) === 'band' || bold ? (
      <rect x={m} y={H - 16} width={W - 2 * m} height={9} rx={r} fill={palette.accent} />
    ) : (
      <g>
        <rect x={W / 2} y={H - 18} width={W / 2 - m} height={11} rx={r} fill="none" stroke={palette.rule} strokeWidth={0.6} />
        <rect x={W / 2 + 3} y={H - 11} width={W / 2 - m - 6} height={2} fill={palette.accent} />
      </g>
    )
  ) : null

  return (
    <svg viewBox={`0 0 ${W * 2 + 6} ${H}`} aria-hidden className={cn('block h-auto w-full', className)}>
      <rect x={0} y={0} width={W} height={H} fill={palette.paper} stroke={palette.rule} strokeWidth={0.5} />
      {pageA}
      <g transform={`translate(${W + 6} 0)`}>
        <rect x={0} y={0} width={W} height={H} fill={palette.paper} stroke={palette.rule} strokeWidth={0.5} />
        <rect x={m} y={m} width={4} height={4} rx={r} fill={palette.strong} opacity={0.6} />
        {itemsBody}
        {totalsBox}
      </g>
    </svg>
  )
}
