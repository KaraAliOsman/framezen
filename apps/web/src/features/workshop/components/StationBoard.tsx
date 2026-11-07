import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { ArrowRight, CalendarDays, Ellipsis } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { Station } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../../ui'
import es from '../i18n/es'
import type { BoardCard, BoardColumns } from '../model/board'
import { dueInfo } from '../model/orders'
import { nextStation, STATIONS } from '../model/stations'
import { RefChip, useOrderLabel } from './bits'
import { DesignThumb } from './DesignThumb'

const CARD_MIME = 'application/x-dekopen-card'

export interface StationBoardProps {
  columns: BoardColumns
  catalog?: Catalog
  now: Date
  onMove: (card: BoardCard, station: Station) => void
  /** Sin permiso para mover (plan o rol): se ve igual, sin arrastre ni botones. */
  readOnly?: boolean
}

/**
 * Tablero por estación: se arrastra una ventana a otra columna, o se usa «→ Siguiente» y el
 * menú «Mover a…» de cada tarjeta (teclado y pantallas táctiles).
 */
export function StationBoard({ columns, catalog, now, onMove, readOnly }: StationBoardProps) {
  const t = useT(es)
  const g = useGlossary()
  const [dragging, setDragging] = useState<BoardCard | null>(null)
  const [over, setOver] = useState<Station | null>(null)

  const findCard = (id: string): BoardCard | undefined => {
    for (const s of STATIONS) {
      const card = columns[s.id].find((c) => c.id === id)
      if (card) return card
    }
    return undefined
  }

  const drop = (event: DragEvent, station: Station) => {
    event.preventDefault()
    const id = event.dataTransfer.getData(CARD_MIME) || event.dataTransfer.getData('text/plain')
    const card = dragging ?? findCard(id)
    setDragging(null)
    setOver(null)
    if (card && card.station !== station) onMove(card, station)
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div
          className="scrollbar-quiet -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:snap-none lg:px-8"
          role="list"
          aria-label={t('board.label')}
        >
          {STATIONS.map((station) => {
            const cards = columns[station.id]
            const Icon = station.icon
            const name = g.station(station.id)
            const isOver = over === station.id && dragging?.station !== station.id
            // Una estación vacía queda como riel angosto; al arrastrar se abre para recibir.
            const slim = cards.length === 0 && !dragging
            return (
              <section
                key={station.id}
                role="listitem"
                aria-label={t('board.column', { station: name, count: cards.length })}
                onDragOver={(e) => {
                  if (!dragging) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (over !== station.id) setOver(station.id)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((s) => (s === station.id ? null : s))
                }}
                onDrop={(e) => drop(e, station.id)}
                className={cn(
                  'flex shrink-0 snap-start flex-col rounded-panel transition-colors duration-140 ease-out',
                  slim ? 'w-11' : 'w-[78vw] max-w-[272px] sm:w-[256px]',
                  isOver ? 'bg-accent-subtle-strong' : 'bg-sunken',
                )}
              >
                {slim ? (
                  <header className="flex flex-1 flex-col items-center gap-2 py-3" title={t('board.emptyColumn', { station: name })}>
                    <Icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
                    <h3 className="text-table text-fg-muted [writing-mode:vertical-rl]">{name}</h3>
                  </header>
                ) : (
                  <>
                    <header className="flex h-11 items-center gap-2 px-3">
                      <Icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
                      <h3 className="min-w-0 flex-1 truncate font-medium text-fg-strong">{name}</h3>
                      <span className="text-table text-fg-muted tabular">{cards.length}</span>
                    </header>
                    <div className="flex min-h-32 flex-1 flex-col gap-2 px-2 pb-2">
                      <AnimatePresence initial={false}>
                        {cards.map((card) => (
                          <motion.div
                            key={card.id}
                            layout="position"
                            layoutId={card.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                          >
                            <Card
                              card={card}
                              catalog={catalog}
                              now={now}
                              readOnly={readOnly}
                              dragging={dragging?.id === card.id}
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData(CARD_MIME, card.id)
                                e.dataTransfer.setData('text/plain', card.id)
                                setDragging(card)
                              }}
                              onDragEnd={() => {
                                setDragging(null)
                                setOver(null)
                              }}
                              onMove={(s) => onMove(card, s)}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {cards.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center px-3 py-6 text-center text-table text-fg-muted">
                          {t('board.drop')}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>
            )
          })}
        </div>
      </LayoutGroup>
    </MotionConfig>
  )
}

function Card({
  card,
  catalog,
  now,
  readOnly,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: BoardCard
  catalog?: Catalog
  now: Date
  readOnly?: boolean
  dragging: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onMove: (station: Station) => void
}) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const orderLabel = useOrderLabel()
  const next = nextStation(card.station)
  const due = dueInfo(card.dueDate, { now, done: card.station === 'ready' || card.station === 'installed', locale: t.locale })
  const item = card.item
  const order = orderLabel(card.orderNumber)
  const title = item?.name || card.title || t('common.quoteNumber', { number: fmt.docNumber(card.quoteNumber) })
  const subtitle = item?.name ? card.title : card.clientName
  return (
    <article
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={t('board.card', { ref: card.ref, order, station: g.station(card.station) })}
      className={cn(
        'group relative rounded-sm bg-surface p-2.5 shadow-raised transition-[opacity,box-shadow] duration-100',
        !readOnly && 'cursor-grab hover:shadow-float active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <RefChip size="sm">{card.ref}</RefChip>
        {item && item.qty > 1 ? <span className="text-meta font-medium text-fg tabular">× {item.qty}</span> : null}
        <Link
          to={`/taller/${card.orderId}`}
          draggable={false}
          className="code-id ml-auto truncate rounded-xs text-meta text-fg-muted hover:underline"
        >
          {order}
        </Link>
        {!readOnly ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-xs text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg touch:size-8"
                aria-label={t('board.menu', { ref: card.ref, order })}
              >
                <Ellipsis aria-hidden strokeWidth={1.75} className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel>{t('board.moveTo')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={card.station} onValueChange={(v) => onMove(v as Station)}>
                {STATIONS.map((s) => (
                  <DropdownMenuRadioItem key={s.id} value={s.id}>
                    {g.station(s.id)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xs bg-sunken">
          {item ? <DesignThumb design={item.design} catalog={catalog} size={36} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-medium break-words text-fg-strong">{title}</div>
          {item ? <div className="dim mt-0.5 text-meta text-fg-muted">{fmt.size(item.design.width, item.design.height)}</div> : null}
          {subtitle ? <div className="truncate text-meta text-fg-muted">{subtitle}</div> : null}
        </div>
      </div>
      {due.tone !== 'none' || (next && !readOnly) ? (
        <div className="mt-2 flex items-center gap-2">
          {due.tone === 'late' || due.tone === 'soon' ? (
            <span className={cn('inline-flex min-w-0 items-center gap-1.5 truncate text-meta font-medium', due.tone === 'late' ? 'text-danger' : 'text-warning')}>
              <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', due.tone === 'late' ? 'bg-danger' : 'bg-warning-solid')} />
              <span className="truncate">{due.label}</span>
            </span>
          ) : due.date ? (
            <span className="inline-flex min-w-0 items-center gap-1 truncate text-meta text-fg-muted tabular" title={t('board.due', { date: due.date })}>
              <CalendarDays aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
              {due.date}
            </span>
          ) : null}
          {next && !readOnly ? (
            <button
              type="button"
              onClick={() => onMove(next)}
              className="-mr-1 ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-xs px-1.5 text-table font-medium text-fg transition-colors duration-100 hover:bg-hover touch:h-10"
              aria-label={t('board.next', { ref: card.ref, order, station: g.station(next) })}
            >
              {g.station(next)}
              <ArrowRight aria-hidden strokeWidth={1.75} className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
