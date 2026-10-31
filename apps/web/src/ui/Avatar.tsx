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
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-[12px]',
  lg: 'size-10 text-[14px]',
}

/** Persona u organización: foto si existe, iniciales si no. */
export function Avatar({ name, src, size = 'md', tone = 'paper', className }: AvatarProps) {
  return (
    <RadixAvatar.Root
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        tone === 'ink' ? 'bg-ink-100 text-ink-700' : 'border border-paper-200 bg-paper-100 text-paper-600',
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
