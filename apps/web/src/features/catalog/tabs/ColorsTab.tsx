import { useMemo } from 'react'
import type { Catalog } from '@framezen/engine'
import { Skeleton } from '../../../ui'
import { SectionTitle } from '../parts'

const WOOD = /(nogal|roble|winchester|caoba|embero|colonial|anteak|lenga|wengu|terra|bronce)/i

/** Muestras de los colores del catálogo y en qué líneas se fabrican. */
export function ColorsTab({ catalog, loading }: { catalog: Catalog | undefined; loading: boolean }) {
  const usage = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const line of catalog?.lines ?? []) for (const id of line.colorIds) map.set(id, [...(map.get(id) ?? []), line.name])
    return map
  }, [catalog])

  if (loading || !catalog) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-md" />
        ))}
      </div>
    )
  }

  const used = catalog.colors.filter((c) => usage.has(c.id))
  const unused = catalog.colors.filter((c) => !usage.has(c.id))

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Colores de tus líneas"
          description="Así se dibujan en el diseñador, en las cotizaciones y en el portal del cliente. El precio de cada color está en Precios."
        />
        <ColorGrid colors={used} usage={usage} />
      </section>
      {unused.length ? (
        <section className="flex flex-col gap-4">
          <SectionTitle title="Otros colores del catálogo" description="Aparecen cuando activas una marca que los fabrica." />
          <ColorGrid colors={unused} usage={usage} />
        </section>
      ) : null}
    </div>
  )
}

/** Tarjeta de color: nombre y en cuántas líneas está. El código y el hex quedan solo en el tooltip (soporte). */
function ColorGrid({ colors, usage }: { colors: Catalog['colors']; usage: Map<string, string[]> }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {colors.map((color) => {
        const lines = usage.get(color.id) ?? []
        return (
          <li
            key={color.id}
            className="overflow-hidden rounded-md border border-paper-200 bg-paper-0"
            title={[color.name, color.code, color.hex?.toUpperCase()].filter(Boolean).join(' · ')}
          >
            <div className="relative h-20" style={{ background: color.hex }}>
              {/* Perfil en corte: dos cantos que dan volumen sin degradados. */}
              <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/30" />
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-black/10" />
              {WOOD.test(color.name) ? (
                <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.16]" preserveAspectRatio="none" viewBox="0 0 100 40">
                  <path d="M0 9 C 30 6, 60 13, 100 8 M0 19 C 25 16, 70 23, 100 18 M0 30 C 35 27, 65 34, 100 29" stroke="#000" strokeWidth="0.6" fill="none" />
                </svg>
              ) : null}
              <span aria-hidden className="absolute inset-0 shadow-[inset_0_0_0_1px_rgb(31_28_24/0.12)]" />
            </div>
            <div className="px-3 py-2.5">
              <p className="truncate font-medium text-paper-900">{color.name}</p>
              {lines.length ? (
                <p className="mt-0.5 truncate text-meta text-paper-600" title={lines.join(', ')}>
                  {`${lines.length} ${lines.length === 1 ? 'línea' : 'líneas'} · ${lines.slice(0, 2).join(', ')}${lines.length > 2 ? '…' : ''}`}
                </p>
              ) : (
                <p className="mt-0.5 truncate text-meta text-paper-600">Se activa con su marca</p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
