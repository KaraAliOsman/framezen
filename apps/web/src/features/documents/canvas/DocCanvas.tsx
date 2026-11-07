/**
 * Lienzo de edición directa: envuelve la hoja real (el mismo render del PDF) y le agrega lo que no se
 * imprime: contorno de lo elegido, barra flotante, ocultar un dato con un clic, arrastrar secciones y
 * cambiar imágenes. Se usa igual en una cotización y en una plantilla; solo recibe la plantilla ya
 * resuelta y emite `DocOp`. Los textos se escriben en el documento mismo (`EditableText`).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EyeOff, GripVertical } from 'lucide-react'
import { sectionLabel, type DocOp, type DocSection, type DocTemplate } from '@dekopen/shared'
import { useLocale, useT } from '../../../lib/i18n'
import { cn } from '../../../lib/cn'
import { Button, Input, Popover, PopoverAnchor, PopoverContent, Textarea } from '../../../ui'
import { ImageLibrary } from '../editor/ImageField'
import es from '../i18n/es'
import { IDENTITY_ID, PAGE_CHROME_ID, canMoveTo, elementChain, hideElementOps, moveOp, scrollParent, sectionIdOf, sectionNodesSelector, stepOp, unionByPage, type CanvasScope } from './model'
import { SectionBar } from './SectionBar'

export interface DocCanvasProps {
  /** Plantilla resuelta: lo que se está viendo en la hoja. */
  template: DocTemplate
  scope: CanvasScope
  readOnly?: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOps: (ops: DocOp[], mergeKey?: string) => void
  /** Textos que en la hoja se ven convertidos (cuotas, tabla de garantía): se cambian desde ahí. */
  texts?: Readonly<Record<string, string | undefined>>
  onText?: (field: string, value: string) => void
  children: ReactNode
  className?: string
}

interface Hover {
  id: string
  chain: string[]
  node: Element | null
}

interface Geometry {
  /** Esquina de la hoja modal que aloja la capa, si esa hoja tiene transformación propia. */
  origin: { x: number; y: number }
  view: DOMRect
  selected: DOMRect[]
  hovered: DOMRect[]
  element: DOMRect | null
}

interface Drop {
  targetId: string
  after: boolean
  x: number
  y: number
  width: number
}

type Picker = { kind: 'image'; slot: string; rect: DOMRect } | { kind: 'text'; field: string; rect: DOMRect }

const OVERLAY = '[data-canvas-overlay],[data-radix-popper-content-wrapper]'
const EDGE = 56

const sameRect = (a: DOMRect | null, b: DOMRect | null) => a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)
const sameRects = (a: readonly DOMRect[], b: readonly DOMRect[]) => a.length === b.length && a.every((r, i) => sameRect(r, b[i]))
const sameGeometry = (a: Geometry, b: Geometry) => a.origin.x === b.origin.x && a.origin.y === b.origin.y && sameRect(a.view, b.view) && sameRect(a.element, b.element) && sameRects(a.selected, b.selected) && sameRects(a.hovered, b.hovered)

export function DocCanvas({ template, scope, readOnly = false, selectedId, onSelect, onOps, texts, onText, children, className }: DocCanvasProps) {
  const t = useT(es)
  const { locale } = useLocale()
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [pinned, setPinned] = useState<Hover | null>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const [barWidth, setBarWidth] = useState(420)
  // En el teléfono el documento vive en una hoja modal: la capa va dentro, o quedaría debajo e inerte.
  const [host, setHost] = useState<Element | null>(null)
  useLayoutEffect(() => setHost(root.current?.closest('[role="dialog"]') ?? document.body), [])
  const [picker, setPicker] = useState<Picker | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const dropRef = useRef<Drop | null>(null)
  const fromCanvas = useRef<string | null>(null)
  const frame = useRef(0)

  const section = (id: string | null | undefined): DocSection | null => template.sections.find((s) => s.id === id) ?? null
  const nameOf = (s: DocSection) => s.title?.trim() || sectionLabel(s.type, locale)

  const rectsOf = useCallback((id: string | null): DOMRect[] => {
    const el = root.current
    if (!el || !id) return []
    if (id === PAGE_CHROME_ID) return unionByPage(Array.from(el.querySelectorAll('[data-dk-chrome]')))
    return unionByPage(Array.from(el.querySelectorAll(sectionNodesSelector(id))))
  }, [])

  const active = hover ?? pinned
  const measure = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = root.current
      if (!el) return
      const view = (scrollParent(el) ?? document.documentElement).getBoundingClientRect()
      const node = active?.node?.isConnected ? active.node : null
      const shifted = host && host !== document.body && getComputedStyle(host).transform !== 'none' ? host.getBoundingClientRect() : null
      const next = { origin: { x: shifted?.left ?? 0, y: shifted?.top ?? 0 }, view, selected: rectsOf(selectedId), hovered: active && active.id !== selectedId ? rectsOf(active.id) : [], element: node ? node.getBoundingClientRect() : null }
      setGeometry((prev) => (prev && sameGeometry(prev, next) ? prev : next))
    })
  }, [active, host, rectsOf, selectedId])

  useLayoutEffect(measure, [measure])
  useLayoutEffect(() => {
    if (bar.current) setBarWidth(bar.current.offsetWidth)
  })
  useEffect(() => {
    const el = root.current
    if (!el) return
    const sync = () => measure()
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sync)
    observer?.observe(el, { childList: true, subtree: true, characterData: true })
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    size?.observe(el)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
      observer?.disconnect()
      size?.disconnect()
    }
  }, [measure])

  // Elegida desde otro lado (la lista de secciones): la hoja va a buscarla.
  useEffect(() => {
    if (!selectedId || fromCanvas.current === selectedId) return
    root.current?.querySelector(sectionNodesSelector(selectedId))?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [selectedId])

  const choose = (id: string | null) => {
    fromCanvas.current = id
    onSelect(id)
  }

  const zoneOf = (target: Element): string | null => (target.closest('[data-dk-chrome]') ? PAGE_CHROME_ID : sectionIdOf(target))

  const onPointerMove = (event: ReactPointerEvent) => {
    if (readOnly || dragId || event.pointerType === 'touch') return
    const target = event.target as Element
    // Los eventos de la barra llegan por el árbol de React aunque vivan fuera de la hoja.
    if (!root.current?.contains(target)) return
    const id = zoneOf(target)
    const chain = id ? elementChain(target, root.current) : []
    const node = chain.length ? target.closest('[data-dk-el]') : null
    setHover((prev) => (prev?.id === id && prev?.node === node ? prev : id ? { id, chain, node } : null))
  }

  const onClick = (event: MouseEvent) => {
    if (readOnly) return
    const target = event.target as Element
    if (!root.current?.contains(target)) return
    if (target.closest('a')) event.preventDefault()
    const id = zoneOf(target)
    if (!id) {
      choose(null)
      setPinned(null)
      return
    }
    choose(id)
    const chain = elementChain(target, root.current)
    setPinned(chain.length ? { id, chain, node: target.closest('[data-dk-el]') } : null)
    if (target.closest('[contenteditable]')) return
    const image = target.closest('[data-dk-image]')
    if (image) {
      setPicker({ kind: 'image', slot: image.getAttribute('data-dk-image') ?? '', rect: image.getBoundingClientRect() })
      return
    }
    const derived = target.closest('[data-dk-text]')
    const field = derived?.getAttribute('data-field')
    if (derived && field) setPicker({ kind: 'text', field, rect: derived.getBoundingClientRect() })
  }

  useEffect(() => {
    if (readOnly) return
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null
      const typing = !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      if (typing) return
      // Con un panel flotante abierto, Escape cierra ese panel: la sección sigue elegida.
      if (event.key === 'Escape' && selectedId && !document.querySelector('[data-radix-popper-content-wrapper]')) {
        fromCanvas.current = null
        onSelect(null)
        setPinned(null)
      }
      if (event.altKey && selectedId && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const op = stepOp(template, selectedId, event.key === 'ArrowUp' ? -1 : 1)
        if (op) {
          event.preventDefault()
          onOps([op])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [readOnly, selectedId, template, onOps, onSelect])

  // ── Arrastrar ─────────────────────────────────────────────────────────────

  const startDrag = (id: string, event: ReactPointerEvent) => {
    event.preventDefault()
    const scroller = scrollParent(root.current)
    let y = event.clientY
    setDragId(id)
    choose(id)
    const move = (e: PointerEvent) => {
      y = e.clientY
      const under = document.elementFromPoint(e.clientX, e.clientY)
      const targetId = under ? sectionIdOf(under) : null
      let next: Drop | null = null
      if (targetId && targetId !== id && section(targetId)) {
        const node = under!.closest(sectionNodesSelector(targetId))
        const page = node?.closest('[data-dk-page]')
        const rects = unionByPage(page ? Array.from(page.querySelectorAll(sectionNodesSelector(targetId))) : node ? [node] : [])
        const box = rects[0]
        if (box) {
          const after = e.clientY > box.top + box.height / 2
          if (canMoveTo(template, id, targetId, after)) next = { targetId, after, x: box.left, y: after ? box.bottom : box.top, width: box.width }
        }
      }
      dropRef.current = next
      setDrop(next)
    }
    const scroll = () => {
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        if (y < box.top + EDGE) scroller.scrollTop -= 10
        else if (y > box.bottom - EDGE) scroller.scrollTop += 10
      }
      raf = requestAnimationFrame(scroll)
    }
    let raf = requestAnimationFrame(scroll)
    const finish = (commit: boolean) => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      const target = dropRef.current
      dropRef.current = null
      setDrop(null)
      setDragId(null)
      if (commit && target) onOps([moveOp(id, target.targetId, target.after)])
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && finish(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
  }

  // ── Dibujo ────────────────────────────────────────────────────────────────

  const view = geometry?.view
  const best = (geometry?.selected ?? []).map((r) => ({ r, seen: view ? Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top) : 0 })).sort((a, b) => b.seen - a.seen)[0]
  const barStyle = (() => {
    if (!view) return { visibility: 'hidden' as const }
    const box = best && best.seen > 0 ? best.r : null
    const left = Math.round(Math.max(view.left + 8, Math.min(box ? box.left : view.left + 8, view.right - barWidth - 8)))
    const top = box ? Math.max(view.top + 6, box.top - 48) : view.top + 6
    return { left, top: Math.round(top) }
  })()
  const hoverSection = section(hover?.id)
  const gripRect = hoverSection && hoverSection.type !== 'cover' && !dragId ? geometry?.hovered[0] : null
  const chipsFor = active ?? null
  const chipSection = chipsFor && chipsFor.id !== IDENTITY_ID ? section(chipsFor.id) : null
  const chips = picker ? [] : (chipsFor?.chain ?? []).filter((key) => hideElementOps(chipsFor?.id === IDENTITY_ID ? null : chipSection, key))
  const chipRect = geometry?.element
  const label = (key: string) => {
    if (key === 'drawing') return t('canvas.elDrawing')
    if (key.startsWith('field:')) {
      const k = `values.fields.${key.slice(6)}`
      return t.has(k) ? t(k as 'values.fields.site') : key.slice(6)
    }
    if (key.startsWith('block:')) {
      const k = `values.blocks.${key.slice(6)}`
      return t.has(k) ? t(k as 'values.blocks.notes') : key.slice(6)
    }
    const k = `options.${key}`
    return t.has(k) ? t(k as 'options.showLogo') : key
  }
  const hide = (key: string) => {
    const ops = hideElementOps(chipsFor?.id === IDENTITY_ID ? null : chipSection, key)
    if (ops) onOps(ops)
    setHover(null)
    setPinned(null)
  }

  const pickImage = (id: string | null) => {
    if (picker?.kind !== 'image') return
    const slot = picker.slot
    const current = section(selectedId)
    if (slot === 'logo') onOps([{ op: 'setDocSettings', patch: { logoAssetId: id } } as DocOp])
    else if (current && slot === 'assetId') onOps([{ op: 'updateSectionOptions', sectionId: current.id, options: { assetId: id } }])
    else if (current?.type === 'gallery' && slot.startsWith('images:')) {
      const index = Number(slot.slice(7))
      const images = current.options.images.flatMap((img, i) => (i !== index ? [img] : id ? [{ ...img, assetId: id }] : []))
      onOps([{ op: 'updateSectionOptions', sectionId: current.id, options: { images } }])
    }
    setPicker(null)
  }

  const overlay =
    readOnly || !host
      ? null
      : createPortal(
          // La transformación hace de esta capa el marco de sus hijos fijos: quedan en coordenadas de pantalla.
          <div className="fixed z-40 size-0" style={{ left: -(geometry?.origin.x ?? 0), top: -(geometry?.origin.y ?? 0), transform: 'translate(0, 0)' }}>
            {view ? (
              // Recortado al panel de la hoja: el contorno nunca pasa por encima del resto de la app.
              <div aria-hidden className="pointer-events-none fixed z-30 overflow-hidden" style={{ left: view.left, top: view.top, width: view.width, height: view.height }}>
                {(geometry?.hovered ?? []).map((r, i) => (
                  <span key={`h${i}`} className="absolute rounded-xs" style={{ left: r.left - view.left - 4, top: r.top - view.top - 4, width: r.width + 8, height: r.height + 8, outline: '1px dashed var(--dk-select)' }} />
                ))}
                {(geometry?.selected ?? []).map((r, i) => (
                  <span key={`s${i}`} className="absolute rounded-xs" style={{ left: r.left - view.left - 4, top: r.top - view.top - 4, width: r.width + 8, height: r.height + 8, outline: '2px solid var(--dk-select)' }} />
                ))}
              </div>
            ) : null}
            {gripRect ? (
              <button
                type="button"
                data-canvas-overlay=""
                aria-label={t('canvas.drag')}
                title={t('canvas.drag')}
                onPointerDown={(e) => startDrag(hoverSection!.id, e)}
                className="fixed z-40 flex size-6 cursor-grab touch-none items-center justify-center rounded-xs bg-raised text-fg-muted shadow-float hover:text-fg-strong active:cursor-grabbing"
                style={{ left: gripRect.left - 34, top: gripRect.top - 2 }}
              >
                <GripVertical aria-hidden className="size-3.5" strokeWidth={1.75} />
              </button>
            ) : null}
            {chips.length && chipRect && !dragId ? (
              <div
                data-canvas-overlay=""
                className="fixed z-40 flex flex-wrap justify-end gap-1"
                style={{ left: Math.max(view ? view.left + 180 : 180, chipRect.right), top: chipRect.height > 64 ? chipRect.top + 4 : chipRect.bottom + 4, transform: 'translateX(-100%)', width: 'max-content', maxWidth: 360 }}
              >
                {chips.map((key) => (
                  <button key={key} type="button" aria-label={t('canvas.hideEl', { name: label(key) })} onClick={() => hide(key)} className="inline-flex h-6 items-center gap-1 rounded-xs bg-inverse px-1.5 text-meta font-medium text-fg-inverse">
                    <EyeOff aria-hidden className="size-3" strokeWidth={1.75} />
                    {label(key)}
                  </button>
                ))}
              </div>
            ) : null}
            {selectedId && !dragId && section(selectedId)?.enabled !== false ? <SectionBar ref={bar} template={template} scope={scope} selectedId={selectedId} readOnly={readOnly} onOps={onOps} onDragStart={(e) => startDrag(selectedId, e)} onChangeLogo={() => geometry?.selected[0] && setPicker({ kind: 'image', slot: 'logo', rect: geometry.selected[0] })} style={barStyle} /> : null}
            {drop ? <span aria-hidden className="pointer-events-none fixed z-40 h-0.5 rounded-full" style={{ left: drop.x, top: drop.y - 1, width: drop.width, background: 'var(--dk-select)' }} /> : null}
            {dragId ? (
              <span className="pointer-events-none fixed z-40 -translate-x-1/2 rounded-xs bg-inverse px-2 py-1 text-meta font-medium text-fg-inverse" style={{ left: view ? view.left + view.width / 2 : '50vw', top: (view?.top ?? 0) + 12 }}>
                {section(dragId) ? nameOf(section(dragId)!) : ''}
              </span>
            ) : null}
            {picker ? <PickerPopover picker={picker} logoSet={Boolean(template.settings?.logoAssetId)} assetSet={picker.kind === 'image' && picker.slot !== 'logo'} value={picker.kind === 'text' ? (texts?.[picker.field] ?? '') : ''} onPick={pickImage} onText={(field, value) => onText?.(field, value)} onClose={() => setPicker(null)} /> : null}
          </div>,
          host,
        )

  return (
    <div
      ref={root}
      data-doc-canvas=""
      className={cn(!readOnly && '[&_[data-dk-image]]:cursor-pointer [&_[data-dk-text]]:cursor-text', dragId && 'select-none', className)}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={(event) => {
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest(OVERLAY)) return
        setHover(null)
      }}
    >
      {children}
      {overlay}
    </div>
  )
}

/** Cambiar una imagen o un texto convertido, junto al elemento. */
function PickerPopover({ picker, logoSet, assetSet, value, onPick, onText, onClose }: { picker: Picker; logoSet: boolean; assetSet: boolean; value: string; onPick: (id: string | null) => void; onText: (field: string, value: string) => void; onClose: () => void }) {
  const t = useT(es)
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)
  const close = () => {
    if (picker.kind === 'text' && draft !== value && !cancelled.current) onText(picker.field, draft)
    onClose()
  }
  const r = picker.rect
  return (
    <Popover open onOpenChange={(open) => !open && close()}>
      <PopoverAnchor asChild>
        <span aria-hidden className="pointer-events-none fixed" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
      </PopoverAnchor>
      <PopoverContent flush side="bottom" align="start" data-canvas-overlay="" onEscapeKeyDown={() => (cancelled.current = true)}>
        {picker.kind === 'image' ? (
          <div>
            <ImageLibrary logo={picker.slot === 'logo'} selected={[]} onPick={(img) => onPick(img.id)} />
            {(picker.slot === 'logo' && logoSet) || assetSet ? (
              <div className="border-t border-divider p-2">
                <Button size="xs" variant="ghost" onClick={() => onPick(null)}>
                  {picker.slot === 'logo' ? t('canvas.companyLogo') : t('images.remove')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : picker.field === 'validityDays' ? (
          <div className="w-44 p-3">
            <Input size="sm" autoFocus inputMode="numeric" aria-label={t('quotePanel.validity')} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))} onKeyDown={(e) => e.key === 'Enter' && close()} />
          </div>
        ) : (
          <div className="w-80 p-3">
            <Textarea autoFocus rows={3} aria-label={t(`texts.${picker.field === 'warranty' ? 'warranty' : 'paymentTerms'}`)} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && close()} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
