import { Avatar as RadixAvatar } from 'radix-ui'
import { cn } from '../lib/cn'
import { initials } from '../lib/format'

export interface AvatarProps {
  name: string
  src?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** 'ink' para la persona actual; 'paper' para el resto. */
  tone?: 'paper' | 'ink'
  className?: string
}

const sizes = {
  xs: 'size-5 text-[9px] tracking-[0.02em]',
  sm: 'size-6 text-[10px] tracking-[0.02em]',
  md: 'size-8 text-meta',
  lg: 'size-10 text-base',
}

/** Persona u organización: foto si existe, iniciales si no. */
export function Avatar({ name, src, size = 'md', tone = 'paper', className }: AvatarProps) {
  return (
    <RadixAvatar.Root
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        tone === 'ink' ? 'bg-accent text-fg-on-accent' : 'bg-pressed text-fg-muted',
        sizes[size],
        className,
      )}
    >
      {src ? <RadixAvatar.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <RadixAvatar.Fallback delayMs={src ? 300 : 0} aria-label={name}>
        {initials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  )
}
