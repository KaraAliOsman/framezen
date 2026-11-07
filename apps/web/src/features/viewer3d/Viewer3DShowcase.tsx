import { TYPOLOGIES, type TypologyGroup, type TypologyId } from '@dekopen/engine'
import clsx from 'clsx'
import { Slider, Switch, ToggleGroup } from 'radix-ui'
import { useMemo, useState } from 'react'
import { WindowArButton } from './ar/WindowArButton'
import { SHOWCASE_CATALOG, SHOWCASE_TYPOLOGIES, showcaseWindow } from './showcaseData'
import type { Viewer3DView } from './types'
import { Window3D } from './Window3D'

const mm = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

/** Agrupa por el `group` de cada tipología del motor (no por prefijo del id). */
const GROUPS: { label: string; group: TypologyGroup }[] = [
  { label: 'Ventanas', group: 'window' },
  { label: 'Puertas', group: 'door' },
  { label: 'Correderas, elevadoras y paralelas', group: 'sliding' },
  { label: 'Plegables', group: 'folding' },
  { label: 'Formas especiales', group: 'shape' },
]

function SectionLabel({ children }: { children: string }) {
  return <p className="text-[12px] font-medium leading-4 text-paper-600">{children}</p>
}

function SwitchRow({ id, label, checked, onChange, disabled }: { id: string; label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-between gap-3', disabled && 'opacity-50')}>
      <label htmlFor={id} className="text-[14px] leading-5 text-paper-900">
        {label}
      </label>
      <Switch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="relative h-5 w-9 shrink-0 rounded-full border border-paper-350 bg-paper-100 transition-colors duration-[160ms] data-[state=checked]:border-ink-600 data-[state=checked]:bg-ink-600"
      >
        <Switch.Thumb className="block h-4 w-4 translate-x-[1px] rounded-full bg-paper-0 shadow-[0_1px_2px_rgb(31_28_24/.2)] transition-transform duration-[160ms] ease-[cubic-bezier(.2,0,0,1)] data-[state=checked]:translate-x-[17px]" />
      </Switch.Root>
    </div>
  )
}

/**
 * Página de desarrollo del visor 3D (/dev/3d): todas las tipologías del motor con el
 * catálogo de ejemplo, apertura, vista interior/exterior, color y bicolor.
 */
export function Viewer3DShowcase() {
  const [typologyId, setTypologyId] = useState<TypologyId>('casement')
  const [open, setOpen] = useState(0)
  const [view, setView] = useState<Viewer3DView>('interior')
  const [colorId, setColorId] = useState('blanco')
  const [bicolor, setBicolor] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)

  const canBeBicolor = colorId !== 'blanco'
  const data = useMemo(
    () => showcaseWindow(typologyId, { colorId, colorInId: bicolor && canBeBicolor ? 'blanco' : undefined }),
    [typologyId, colorId, bicolor, canBeBicolor],
  )
  const { design, layout, catalog, line } = data
  const movable = layout.sashes.some((sash) => sash.opening.kind !== 'fixed') || layout.sliding.some((panel) => panel.kind === 'moving')
  const typology = SHOWCASE_TYPOLOGIES.find((item) => item.id === typologyId)
  const colors = (line?.colorIds.length ? line.colorIds : SHOWCASE_CATALOG.colors.map((color) => color.id))
    .map((id) => catalog.colors.find((color) => color.id === id))
    .filter((color) => color !== undefined)
  const color = catalog.colors.find((item) => item.id === colorId)

  return (
    <div className="min-h-dvh bg-paper-50 text-paper-900">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 py-8 lg:py-10">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-[12px] leading-4 text-paper-600">/dev/3d</p>
          <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.01em]">Visor 3D</h1>
          <p className="max-w-[62ch] text-[14px] leading-5 text-paper-600">
            La misma ventana del dibujo, en volumen: así la gira y la abre tu cliente en el portal antes de aceptar.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="flex min-w-0 flex-col gap-4">
            <Window3D
              layout={layout}
              design={design}
              catalog={catalog}
              openAmount={movable ? open / 100 : 0}
              autoRotate={autoRotate}
              view={view}
              height="min(600px, 68dvh)"
              className="rounded-[12px] border border-paper-200"
              overlay={<WindowArButton layout={layout} design={design} catalog={catalog} title={typology?.label} />}
            />
            <p className="tabular flex flex-wrap items-center gap-x-2 text-[13px] leading-[18px] text-paper-600">
              <span className="font-medium text-paper-900">{typology?.label}</span>
              <span aria-hidden>·</span>
              <span>
                {mm.format(design.width)} × {mm.format(design.height)} mm
              </span>
              {line && (
                <>
                  <span aria-hidden>·</span>
                  <span>{line.name}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>
                {color?.name}
                {design.colorInId ? ' por fuera, blanco por dentro' : ''}
              </span>
              {data.fallback && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-warn-600">Geometría de ejemplo</span>
                </>
              )}
            </p>

            <ToggleGroup.Root
              type="single"
              value={typologyId}
              onValueChange={(value) => {
                if (value) setTypologyId(value as TypologyId)
              }}
              aria-label="Tipología"
              className="flex flex-col gap-4"
            >
              {GROUPS.map((group) => {
                const items = SHOWCASE_TYPOLOGIES.filter((item) => TYPOLOGIES.find((t) => t.id === item.id)?.group === group.group)
                if (items.length === 0) return null
                return (
                  <div key={group.label} className="flex flex-col gap-2">
                    <SectionLabel>{group.label}</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <ToggleGroup.Item
                          key={item.id}
                          value={item.id}
                          className="h-8 rounded-[6px] border border-paper-200 bg-paper-0 px-2.5 text-[13px] leading-[18px] text-paper-900 transition-colors duration-[120ms] hover:bg-paper-100 data-[state=on]:border-ink-600 data-[state=on]:bg-ink-50 data-[state=on]:text-ink-700"
                        >
                          {item.label}
                        </ToggleGroup.Item>
                      ))}
                    </div>
                  </div>
                )
              })}
            </ToggleGroup.Root>
          </section>

          <aside className="flex flex-col gap-6 self-start rounded-[12px] border border-paper-200 bg-paper-0 p-5 lg:sticky lg:top-6">
            <div className={clsx('flex flex-col gap-3', !movable && 'opacity-60')}>
              <div className="flex items-baseline justify-between">
                <SectionLabel>Apertura</SectionLabel>
                <span className="tabular text-[13px] leading-[18px] text-paper-900">{movable ? `${open} %` : 'No abre'}</span>
              </div>
              <Slider.Root
                value={[open]}
                onValueChange={([value]) => setOpen(value ?? 0)}
                min={0}
                max={100}
                step={1}
                disabled={!movable}
                aria-label="Apertura"
                className="relative flex h-5 w-full touch-none select-none items-center"
              >
                <Slider.Track className="relative h-1 grow overflow-hidden rounded-full bg-paper-200">
                  <Slider.Range className="absolute h-full rounded-full bg-ink-600" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 rounded-full border border-ink-600 bg-paper-0 shadow-[0_1px_2px_rgb(31_28_24/.15)] transition-transform duration-[120ms] hover:scale-110" />
              </Slider.Root>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!movable}
                  onClick={() => setOpen(0)}
                  className="h-9 rounded-[6px] border border-paper-350 bg-paper-0 text-[14px] font-medium transition-colors duration-[120ms] hover:bg-paper-100 disabled:pointer-events-none"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={!movable}
                  onClick={() => setOpen(100)}
                  className="h-9 rounded-[6px] bg-ink-600 text-[14px] font-medium text-paper-0 transition-colors duration-[120ms] hover:bg-ink-700 disabled:pointer-events-none"
                >
                  Abrir
                </button>
              </div>
              {!movable && <p className="text-[12px] leading-4 text-paper-600">Es un paño fijo: no tiene hojas que abrir.</p>}
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Vista</SectionLabel>
              <ToggleGroup.Root
                type="single"
                value={view}
                onValueChange={(value) => {
                  if (value) setView(value as Viewer3DView)
                }}
                aria-label="Vista"
                className="grid grid-cols-2 rounded-[6px] border border-paper-200 bg-paper-100 p-0.5"
              >
                {(
                  [
                    ['interior', 'Interior'],
                    ['exterior', 'Exterior'],
                  ] as const
                ).map(([value, label]) => (
                  <ToggleGroup.Item
                    key={value}
                    value={value}
                    className="h-8 rounded-[5px] text-[13px] font-medium text-paper-600 transition-colors duration-[120ms] data-[state=on]:bg-paper-0 data-[state=on]:text-paper-900 data-[state=on]:shadow-[0_1px_2px_rgb(31_28_24/.08)]"
                  >
                    {label}
                  </ToggleGroup.Item>
                ))}
              </ToggleGroup.Root>
            </div>

            <div className="flex flex-col gap-2">
              <SectionLabel>Color</SectionLabel>
              <ToggleGroup.Root
                type="single"
                value={colorId}
                onValueChange={(value) => {
                  if (value) setColorId(value)
                }}
                aria-label="Color"
                className="flex flex-wrap gap-2"
              >
                {colors.map((item) => (
                  <ToggleGroup.Item
                    key={item.id}
                    value={item.id}
                    title={item.name}
                    aria-label={item.name}
                    className="h-7 w-7 rounded-full border border-paper-350 ring-offset-2 ring-offset-paper-0 transition-shadow duration-[120ms] data-[state=on]:ring-2 data-[state=on]:ring-ink-600"
                    style={{ backgroundColor: item.hex }}
                  />
                ))}
              </ToggleGroup.Root>
              <p className="text-[13px] leading-[18px] text-paper-900">{color?.name}</p>
            </div>

            <div className="flex flex-col gap-3 border-t border-paper-200 pt-5">
              <SwitchRow id="viewer3d-bicolor" label="Interior blanco (bicolor)" checked={bicolor && canBeBicolor} onChange={setBicolor} disabled={!canBeBicolor} />
              <SwitchRow id="viewer3d-rotate" label="Girar sola" checked={autoRotate} onChange={setAutoRotate} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default Viewer3DShowcase
