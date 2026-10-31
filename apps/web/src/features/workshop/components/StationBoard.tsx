import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { ArrowRight, CalendarDays, Ellipsis } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import type { Station } from '@framezen/shared'
import { cn } from '../../../lib/cn'
import { formatSize } from '../../../lib/format'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../../ui'
import type { BoardCard, BoardColumns } from '../model/board'
import { dueInfo } from '../model/orders'
import { nextStation, STATIONS, stationInfo } from '../model/stations'
import { RefChip } from './bits'
import { DesignThumb } from './DesignThumb'

const CARD_MIME = 'application/x-framezen-card'

export interface StationBoardProps {
  columns: BoardColumns
  catalog?: Catalog
  now: Date
  onMove: (card: BoardCard, station: Station) => void
  /** Mientras cargan las cotizaciones: tarjetas sin dibujo. */
  loadingDetails?: boolean
}

/**
 * Tablero por estación: se arrastra una ventana a otra columna, o se usa «→ Siguiente» y el
 * menú de cada tarjeta (teclado y pantallas táctiles).
 */
export function StationBoard({ columns, catalog, now, onMove }: StationBoardProps) {
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
          className="scrollbar-quiet -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:snap-none lg:px-0"
          role="list"
          aria-label="Tablero de producción por estación"
        >
          {STATIONS.map((station) => {
            const cards = columns[station.id]
            const Icon = station.icon
            const isOver = over === station.id && dragging?.station !== station.id
            // Una estación vacía queda como riel angosto; al arrastrar se abre para recibir.
            const slim = cards.length === 0 && !dragging
            const done = station.id === 'installed' || station.id === 'ready'
            return (
              <section
                key={station.id}
                role="listitem"
                aria-label={`${station.label}: ${cards.length} ${cards.length === 1 ? 'ventana' : 'ventanas'}`}
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
                  'flex shrink-0 snap-start flex-col rounded-lg border transition-[background-color,border-color,box-shadow] duration-160 ease-out',
                  slim
                    ? 'w-12 bg-paper-50'
                    : 'w-[76vw] max-w-[264px] bg-paper-100/70 sm:w-[236px] lg:w-auto lg:min-w-[188px] lg:max-w-[300px] lg:flex-1',
                  isOver ? 'border-ink-500 bg-ink-50 shadow-[inset_0_0_0_1px_var(--ink-500)]' : 'border-paper-200',
                )}
              >
                {slim ? (
                  <header className="flex flex-1 flex-col items-center gap-2 py-3" title={`${station.label}: nada en esta estación`}>
                    <Icon aria-hidden strokeWidth={1.75} className={cn('size-4', done ? 'text-ok-600' : 'text-paper-600')} />
                    <h3 className="text-[13px] font-medium text-paper-600 [writing-mode:vertical-rl]">{station.label}</h3>
                    <span className="text-meta text-paper-600/80 tabular">0</span>
                  </header>
                ) : (
                  <>
                    <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                      <Icon aria-hidden strokeWidth={1.75} className={cn('size-4', done ? 'text-ok-600' : 'text-paper-600')} />
                      <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-paper-900">{station.label}</h3>
                      <span className="rounded-full bg-paper-0 px-1.5 text-meta font-medium text-paper-600 tabular ring-1 ring-paper-200">
                        {cards.length}
                      </span>
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
                            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                          >
                            <Card
                              card={card}
                              catalog={catalog}
                              now={now}
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
                        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-ink-500/60 px-3 py-6 text-center text-meta text-ink-700">
                          Suelta aquí
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
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: BoardCard
  catalog?: Catalog
  now: Date
  dragging: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onMove: (station: Station) => void
}) {
  const next = nextStation(card.station)
  const due = dueInfo(card.dueDate, { now, done: card.station === 'ready' || card.station === 'installed' })
  const item = card.item
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={`${card.ref} de la OT N° ${card.orderNumber}, en ${stationInfo(card.station).label}`}
      className={cn(
        'group relative cursor-grab rounded-md border border-paper-200 bg-paper-0 p-2.5 shadow-[0_1px_1px_rgb(31_28_24/0.04)] transition-[opacity,border-color,box-shadow] duration-120 active:cursor-grabbing',
        'hover:border-paper-350/70 hover:shadow-[0_1px_2px_rgb(31_28_24/0.06)]',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2.5">
        {item ? (
          <DesignThumb design={item.design} catalog={catalog} size={40} className="mt-0.5 rounded-xs bg-paper-50" />
        ) : (
          <span className="mt-0.5 size-10 shrink-0 rounded-xs bg-paper-100" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <RefChip size="sm">{card.ref}</RefChip>
            <Link
              to={`/taller/${card.orderId}`}
              draggable={false}
              className="truncate text-meta font-medium text-paper-600 hover:text-ink-700"
            >
              OT N° {card.orderNumber}
            </Link>
            {item && item.qty > 1 ? <span className="ml-auto shrink-0 text-meta font-medium text-paper-900 tabular">× {item.qty}</span> : null}
          </div>
          <div className="mt-1 truncate text-[13px] leading-[18px] text-paper-900">{item?.name || card.title}</div>
          <div className="truncate text-meta text-paper-600 tabular">
            {item ? formatSize(item.design.width, item.design.height) : card.clientName || card.title}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 border-t border-paper-100 pt-2">
        {due.tone === 'late' || due.tone === 'soon' ? (
          <span className={cn('min-w-0 truncate text-meta font-medium', due.tone === 'late' ? 'text-bad-600' : 'text-warn-600')}>{due.label}</span>
        ) : due.date ? (
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-meta text-paper-600 tabular" title={`Entrega ${due.date}`}>
            <CalendarDays aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
            {due.date}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {next ? (
            <button
              type="button"
              onClick={() => onMove(next)}
              className="inline-flex h-6 items-center gap-1 rounded-xs px-1.5 text-meta font-medium text-ink-700 transition-colors duration-120 hover:bg-ink-50 touch:h-8"
              aria-label={`Pasar ${card.ref} de la OT N° ${card.orderNumber} a ${stationInfo(next).label}`}
            >
              {stationInfo(next).label}
              <ArrowRight aria-hidden strokeWidth={1.75} className="size-3.5" />
            </button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center rounded-xs text-paper-600 transition-colors duration-120 hover:bg-paper-100 hover:text-paper-900 touch:size-8"
                aria-label={`Mover ${card.ref} de la OT N° ${card.orderNumber} a otra estación`}
              >
                <Ellipsis aria-hidden strokeWidth={1.75} className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel>Mover a</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={card.station} onValueChange={(v) => onMove(v as Station)}>
                {STATIONS.map((s) => (
                  <DropdownMenuRadioItem key={s.id} value={s.id}>
                    {s.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    </article>
  )
}
