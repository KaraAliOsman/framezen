import { MarcoAvatar, type MarcoAvatarProps } from '../../assistant/avatar/MarcoAvatar'
import { DrawingBoundary } from '../designer/DrawingBoundary'

/**
 * Avatar de Marco para la landing: si su motor falla, la portada sigue en pie y se ve un disco
 * en tinta en su lugar.
 */
export function SafeMarco(props: MarcoAvatarProps) {
  const size = props.size ?? 48
  return (
    <DrawingBoundary
      resetKey="marco"
      fallback={
        <span
          role={props.title ? 'img' : undefined}
          aria-label={props.title}
          aria-hidden={props.title ? undefined : true}
          className="inline-block shrink-0 rounded-full bg-accent"
          style={{ width: size, height: size }}
        />
      }
    >
      <MarcoAvatar {...props} />
    </DrawingBoundary>
  )
}
