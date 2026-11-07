/**
 * Entornos del vidrio: imágenes muy desenfocadas (generadas, sin datos de terceros) que dan al vidrio
 * lo que un degradado no puede. Viajan en el paquete porque pesan menos de una tesela y evitan el
 * parpadeo de una carga diferida; un documento las lleva una sola vez (`DrawingDefsSvg`).
 */
import outdoor from './builtin/env_outdoor'
import reflection from './builtin/env_reflection'

export type GlassEnvironment = 'outdoor' | 'reflection'

/** Vista interior: se mira hacia afuera. Vista exterior: el vidrio refleja. */
export function environmentFor(view: 'interior' | 'exterior'): GlassEnvironment {
  return view === 'interior' ? 'outdoor' : 'reflection'
}

export function environmentHref(env: GlassEnvironment): string {
  return env === 'outdoor' ? outdoor : reflection
}
