/**
 * Piezas comunes de las secciones de plantilla: rótulos, cifras, código de ítem, muestras de color,
 * dibujo de la ventana, logo, títulos de sección y texto enriquecido. Todo el texto de usuario se pinta
 * como nodos de texto de React (nunca HTML) y los marcadores se reemplazan por valores ya formateados.
 */
import type { ComponentType, ReactNode } from 'react'
import { richTextFromPlain, richTextToSource, type PlaceholderKey, type RichBlock, type RichInline, type RichText } from '@dekopen/shared'
import { clsx } from '../base/clsx'
import { EditableText, type EditableTag } from '../base/editable'
import { fineType } from './typography'
import { mix, shade } from '../base/color'
import type { DocOrg } from '../base/types'
import { WindowDrawing, type WindowDrawingProps } from '../drawing/WindowDrawing'
import { patternIdFor, patternSize, resolveColorAppearance, type DrawingDefsData, type TextureSources } from '../textures'
import type { QuoteDocColor, QuoteDocItemV5 } from '../data/quote'
import type { QuoteDocField } from '../sales/types'
import type { QuoteModel } from './model'

// ── Texto ───────────────────────────────────────────────────────────────────

type Values = Partial<Record<PlaceholderKey, string>>

function inlineNodes(nodes: readonly RichInline[], values: Values): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === 'line_break') return <br key={i} />
    if (n.type === 'placeholder') return <span key={i}>{values[n.key] ?? ''}</span>
    let node: ReactNode = fineType(n.text)
    if (n.italic) node = <em>{node}</em>
    if (n.bold) node = <strong>{node}</strong>
    return <span key={i}>{node}</span>
  })
}

/** Bloques de texto enriquecido (AST acotado) con marcadores ya resueltos. */
export function RichBlocks({ blocks, values, className }: { blocks: readonly RichBlock[]; values: Values; className?: string }) {
  if (blocks.length === 0) return null
  return (
    <div className={clsx('dkd-rich', className)}>
      {blocks.map((b, i) => {
        if (b.type === 'heading') return b.level === 2 ? <h4 key={i}>{inlineNodes(b.children, values)}</h4> : <h5 key={i}>{inlineNodes(b.children, values)}</h5>
        if (b.type === 'bullet_list')
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inlineNodes(it.children, values)}</li>
              ))}
            </ul>
          )
        if (b.type === 'ordered_list')
          return (
            <ol key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inlineNodes(it.children, values)}</li>
              ))}
            </ol>
          )
        return (
          <p key={i} className={b.align === 'center' ? 'dkd-center' : undefined}>
            {inlineNodes(b.children, values)}
          </p>
        )
      })}
    </div>
  )
}

export function RichView({ doc, values, className }: { doc: RichText | undefined; values: Values; className?: string }) {
  return doc ? <RichBlocks blocks={doc.blocks} values={values} className={className} /> : null
}

const richCache = new Map<string, RichText>()

/** Texto del taller (Markdown mínimo de v4 + marcadores) → AST (memorizado). */
export function richOf(text: string): RichText {
  let doc = richCache.get(text)
  if (!doc) {
    doc = richTextFromPlain(text)
    if (richCache.size > 400) richCache.clear()
    richCache.set(text, doc)
  }
  return doc
}

/** Una línea con marcadores (títulos, rótulos propios): texto plano con valores. */
export function fillLine(text: string, values: Values): string {
  return richOf(text)
    .blocks.flatMap((b) => (b.type === 'paragraph' || b.type === 'heading' ? [b.children] : b.items.map((i) => i.children)))
    .map((nodes) => nodes.map((n) => (n.type === 'text' ? n.text : n.type === 'placeholder' ? (values[n.key] ?? '') : ' ')).join(''))
    .join(' ')
    .trim()
}

/**
 * Texto de documento: editable en el lugar en la vista previa (texto plano, marcadores visibles) y
 * enriquecido con marcadores resueltos en el PDF.
 */
export function DocText({
  m,
  field,
  value,
  as = 'div',
  inline = false,
  placeholder,
  className,
}: {
  m: QuoteModel
  field: QuoteDocField
  value: string
  as?: EditableTag
  inline?: boolean
  placeholder?: string
  className?: string
}) {
  if (m.canEdit(field) && m.onEdit) {
    const onEdit = m.onEdit
    // Sin foco se ve lo mismo que imprime el PDF; al entrar, el texto fuente con sus marcadores.
    const display = value.trim() ? (inline ? fineType(fillLine(value, m.placeholders)) : <RichView doc={richOf(value)} values={m.placeholders} />) : undefined
    return <EditableText as={as} inline={inline} value={value} field={field} editable onChange={(v) => onEdit(field, v)} placeholder={placeholder ? m.kit.t('editing.empty') : undefined} className={className} display={display} />
  }
  if (inline) return <span className={className} data-field={field}>{fineType(fillLine(value, m.placeholders))}</span>
  return <RichView doc={richOf(value)} values={m.placeholders} className={className} />
}

/**
 * Tramo de un texto largo partido para fluir entre hojas. En edición cada tramo se escribe donde está
 * y el texto se vuelve a unir: la hoja queda partida igual que en el PDF mientras se escribe.
 */
export function TextChunk({ chunks, index, values, editable, onChange, field, placeholder }: { chunks: readonly (readonly RichBlock[])[]; index: number; values: Values; editable: boolean; onChange: (text: string) => void; field?: string; placeholder?: string }) {
  const blocks = chunks[index]
  const view = <RichBlocks blocks={blocks} values={values} />
  if (!editable) return view
  const source = (list: readonly RichBlock[]) => richTextToSource({ blocks: list })
  const join = (next: string) => chunks.map((c, i) => (i === index ? next : source(c))).filter((t) => t.trim()).join('\n\n')
  return <EditableText value={source(blocks)} {...(field ? { field } : {})} editable onChange={(v) => onChange(join(v))} {...(placeholder ? { placeholder } : {})} display={view} />
}

/** Guía del editor de plantillas para lo que el taller aún no escribe. Nunca llega al PDF. */
export function Ghost({ children }: { children: ReactNode }) {
  return <p className="dkd-ghost">{children}</p>
}

// ── Cifras y rótulos ────────────────────────────────────────────────────────

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('dkd-label', className)}>{children}</span>
}

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('dkd-num', className)}>{children}</span>
}

export function Ref({ value, variant = 'line' }: { value: string; variant?: 'line' | 'solid' | 'big' }) {
  if (!value) return null
  return <span className={clsx('dkd-ref', `dkd-ref--${variant}`)}>{value}</span>
}

// ── Muestras de color ───────────────────────────────────────────────────────


/**
 * Muestra cuadrada de una terminación. Con foliado (integrado o subido) se pinta con el mismo patrón
 * que los dibujos del documento (no repite la imagen: va una sola vez en el HTML); sin él, el color
 * plano con una veta sutil cuando el foliado es de madera.
 */
export function Swatch({ color, size = 12, image, className, m, el }: { color: QuoteDocColor | undefined; size?: number; image?: string; className?: string; m?: Pick<QuoteModel, 'drawingDefs' | 'textureSources'>; el?: string }) {
  if (!color) return null
  const defs: DrawingDefsData | undefined = m?.drawingDefs
  const sources: TextureSources | undefined = m?.textureSources
  const hex = /^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : '#D8D8D8'
  const appearance = resolveColorAppearance({ id: color.id, name: color.name, hex, ...(color.texture ? { texture: color.texture } : {}) } as Parameters<typeof resolveColorAppearance>[0], sources)
  const patternId = defs && defs.appearances.has(appearance.key) ? patternIdFor(defs, appearance.key) : undefined
  const wood = appearance.finish === 'woodgrain'
  const dark = shade(hex, 0.18)
  const light = mix(hex, '#FFFFFF', 0.18)
  // La tesela es de un paño de unos 160 mm: la muestra enseña un recorte (más amplio en muestras grandes).
  const span = size >= 40 ? 110 : 44
  return (
    <svg className={clsx('dkd-sw', className)} width={size} height={size} viewBox={patternId ? `0 0 ${span} ${span}` : '0 0 24 24'} aria-hidden="true" data-dk-el={el}>
      {patternId ? (
        <>
          <rect width={span} height={span} fill={hex} />
          <use href={`#${patternId}`} transform={`scale(${patternSize(appearance).w} ${patternSize(appearance).h})`} />
        </>
      ) : (
        <>
          <rect width="24" height="24" fill={hex} />
          {image ? <image href={image} width="24" height="24" preserveAspectRatio="xMidYMid slice" /> : null}
          {!image && wood ? (
            <g fill="none" strokeLinecap="round">
              <path d="M-2 5 C 6 3.6 12 6.4 26 4.6" stroke={dark} strokeWidth="1.1" opacity=".55" />
              <path d="M-2 10.5 C 7 9 15 12.2 26 10.2" stroke={dark} strokeWidth=".7" opacity=".45" />
              <path d="M-2 15 C 5 14.2 13 16.6 26 15.4" stroke={light} strokeWidth="1" opacity=".5" />
              <path d="M-2 20 C 8 18.6 14 21.4 26 19.6" stroke={dark} strokeWidth=".9" opacity=".5" />
            </g>
          ) : null}
          {!image && !wood ? <rect x="0" y="0" width="24" height="9" fill="#FFFFFF" opacity=".08" /> : null}
        </>
      )}
      <rect x=".5" y=".5" width={(patternId ? span : 24) - 1} height={(patternId ? span : 24) - 1} fill="none" stroke="#000" strokeOpacity=".18" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ── Dibujo ──────────────────────────────────────────────────────────────────

type DrawingRender = 'realistic' | 'technical'

/** WindowDrawing con el estilo de dibujo (contrato de DRAW: `render`). */
const Drawing = WindowDrawing as unknown as ComponentType<WindowDrawingProps & { render?: DrawingRender }>

export interface ItemDrawingProps {
  m: QuoteModel
  item: QuoteDocItemV5
  width: number
  height: number
  view?: 'interior' | 'exterior'
  dimensions?: 'none' | 'total' | 'all'
  style?: 'inherit' | DrawingRender
  title?: string
  /**
   * El dibujo se achica (nunca crece) para caber en el espacio que le deja su contenedor, cuyo tamaño lo
   * decide el diseño (flex) y no una estimación: portadas y hojas de un ítem nunca se desbordan.
   */
  fit?: boolean
  /** `high` en láminas y dibujos de media página o más: el PDF se amplía. Sin dato, según la escala. */
  detail?: 'high'
  /** Ventana instalada en un muro (sólo dibujo realista). */
  context?: 'wall'
  /** `false`: la planta de un conjunto va aparte, junto a los datos. */
  plan?: boolean
}

export function ItemDrawing({ m, item, width, height, view = 'interior', dimensions = 'total', style = 'inherit', title, fit = false, detail, context, plan }: ItemDrawingProps) {
  const render: DrawingRender = style === 'inherit' ? m.drawingStyle : style
  const drawing = (
    <Drawing
      layout={item.layout}
      design={item.design}
      catalog={m.data.catalog}
      view={view}
      dimensions={dimensions}
      width={Math.max(8, Math.floor(width))}
      height={Math.max(8, Math.floor(height))}
      render={render}
      locale={m.kit.locale}
      defs={m.drawingDefs}
      {...(detail ? { detail } : {})}
      {...(context ? { context } : {})}
      {...(plan === false ? { plan } : {})}
      {...(m.textureSources ? { textures: m.textureSources } : {})}
      title={title ?? `${item.ref} · ${m.kit.fmt.size(item.width, item.height)}`}
    />
  )
  return fit ? (
    <div className="dkd-fit">
      <div className="dkd-fit__in">{drawing}</div>
    </div>
  ) : (
    drawing
  )
}

// ── Marca del taller ────────────────────────────────────────────────────────

/** Alto en px del logo de una marca por tamaño. */
const MARK_HEIGHT = { s: 16, m: 24, l: 34 } as const
export const markHeight = (size: keyof typeof MARK_HEIGHT): number => MARK_HEIGHT[size]

/**
 * Logos de marca (perfil y herrajes). Solo imágenes que subió el taller: una marca sin logo simplemente
 * no aparece, nunca se escribe su nombre en su lugar.
 */
export function BrandLogos({ marks, size = 'm', className }: { marks: readonly { key: string; name: string; src: string }[]; size?: keyof typeof MARK_HEIGHT; className?: string }) {
  if (marks.length === 0) return null
  return (
    <span className={clsx('dkd-marks', `dkd-marks--${size}`, className)}>
      {marks.map((b) => (
        <img key={b.key} className="dkd-mark" src={b.src} alt={b.name} style={{ height: MARK_HEIGHT[size] }} />
      ))}
    </span>
  )
}

export function OrgLogo({ org, size = 'md' }: { org: DocOrg; size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl' }) {
  if (org.logo && /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(org.logo)) {
    return <img className={clsx('dkd-logo', `dkd-logo--${size}`)} src={org.logo} alt={org.name} data-dk-image="logo" data-dk-el="showLogo" />
  }
  return <span className={clsx('dkd-wordmark', `dkd-wordmark--${size}`)} data-dk-image="logo" data-dk-el="showLogo">{org.name}</span>
}

// ── Títulos de sección ──────────────────────────────────────────────────────

/**
 * Partes unidas por « · » que, si no caben, bajan de línea sin dejar el punto colgando: cada punto va en
 * el margen izquierdo de su parte y el del inicio de línea queda recortado por el contenedor.
 */
export function Dotted({ parts, className }: { parts: ReactNode[]; className?: string }) {
  const list = parts.filter((p) => p !== '' && p !== null && p !== undefined && p !== false)
  if (list.length < 2) return <>{list[0] ?? null}</>
  return (
    <span className={clsx('dkd-dots', className)}>
      <span className="dkd-dots__in">
        {list.map((p, i) => (
          <span key={i} className="dkd-dots__part">
            <span className="dkd-dots__dot">·</span>
            {p}
          </span>
        ))}
      </span>
    </span>
  )
}

/** Texto con « · » en su forma partible. */
export function DottedText({ text, className }: { text: string; className?: string }) {
  return <Dotted parts={text.split(/\s+·\s+|\u00A0·\s+/)} {...(className ? { className } : {})} />
}

export function SectionHeading({ title, kicker, aside, editable, side }: { title: ReactNode; kicker?: ReactNode; aside?: ReactNode; editable?: boolean; side?: boolean }) {
  return (
    <header className={clsx('dkd-sh', editable && 'dkd-sh--editable', side && 'dkd-sh--side')}>
      <div className="dkd-sh__main">
        {kicker ? <span className="dkd-sh__kicker">{kicker}</span> : null}
        <h2 className="dkd-sh__title">{title}</h2>
      </div>
      {aside ? <div className="dkd-sh__aside">{aside}</div> : null}
    </header>
  )
}

/** Pares rótulo/valor en grilla. */
export function Facts({ rows, columns = 2, className }: { rows: { key: string; label: ReactNode; value: ReactNode }[]; columns?: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <dl className={clsx('dkd-facts', `dkd-facts--c${columns}`, className)}>
      {rows.map((r) => (
        <div key={r.key} className="dkd-fact">
          <dt className="dkd-label">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Código QR (SVG puro) hacia el portal de la revisión emitida. */
export { QrCode } from './qr'
