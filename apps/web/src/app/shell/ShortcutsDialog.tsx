import { Dialog, DialogContent, Kbd } from '../../ui'

const GROUPS: { title: string; items: { combo: string[]; label: string }[] }[] = [
  {
    title: 'En toda la app',
    items: [
      { combo: ['mod+k'], label: 'Buscar o ejecutar un comando' },
      { combo: ['/'], label: 'Buscar' },
      { combo: ['mod+j'], label: 'Abrir o cerrar a Marco' },
      { combo: ['['], label: 'Contraer o expandir la barra lateral' },
      { combo: ['?'], label: 'Ver estos atajos' },
    ],
  },
  {
    title: 'En una cotización',
    items: [
      { combo: ['a'], label: 'Agregar ventana' },
      { combo: ['d'], label: 'Duplicar la ventana elegida' },
      { combo: ['delete'], label: 'Eliminar (con deshacer)' },
      { combo: ['1'], label: 'Elegir la ventana 1 a 9' },
      { combo: ['mod+z'], label: 'Deshacer' },
      { combo: ['shift+mod+z'], label: 'Rehacer' },
    ],
  },
  {
    title: 'En medidas',
    items: [
      { combo: ['up', 'down'], label: 'Sumar o restar 10 mm (Shift: 100 mm)' },
      { combo: ['enter'], label: 'Confirmar; acepta «1200x1500» para ancho y alto' },
    ],
  },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Atajos de teclado" description="Todo se puede hacer con el mouse; esto es para ir más rápido." size="md">
        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-meta font-medium text-paper-600">{group.title}</h3>
              <ul className="divide-y divide-paper-200 rounded-md border border-paper-200">
                {group.items.map((item) => (
                  <li key={item.label} className="flex h-10 items-center justify-between gap-4 px-3">
                    <span className="text-paper-900">{item.label}</span>
                    <span className="flex items-center gap-1">
                      {item.combo.map((c) => (
                        <Kbd key={c} combo={c} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
