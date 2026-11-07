/**
 * Selectores de idioma de la interfaz (7 idiomas con su nombre nativo). Cambiar el idioma primero
 * descarga los textos y recién después lo aplica (sin destellos) y, con sesión, lo guarda en la cuenta.
 * El idioma de los documentos es otro: va por cotización (por defecto el de la empresa).
 *
 * - `LanguageSubmenu`: dentro de un DropdownMenu (menú de cuenta).
 * - `LanguageSelect`: selector compacto para pantallas sin shell (acceso, bienvenida, landing).
 */
import { Check, Languages } from 'lucide-react'
import { LOCALE_META, useLocale, useT, type Locale } from '../../lib/i18n'
import { cn } from '../../lib/cn'
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Select,
  Spinner,
} from '../../ui'
import es from '../i18n/es'

export function LanguageSubmenu() {
  const t = useT(es)
  const { locale, locales, pending, setLocale } = useLocale()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger icon={Languages}>{t('account.language', { language: LOCALE_META[locale].label })}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuLabel>{t('account.languageTitle')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={pending ?? locale} onValueChange={(value) => void setLocale(value as Locale)}>
          {locales.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={LOCALE_META[l].intl} onSelect={(event) => event.preventDefault()}>
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate">{LOCALE_META[l].label}</span>
                {pending === l ? <Spinner size={14} className="text-fg-muted" /> : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <p className="px-2 pt-1.5 pb-2 text-meta text-fg-muted">{pending ? t('account.changingLanguage') : t('account.languageHint')}</p>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** Selector compacto de idioma (pantallas públicas y bienvenida). */
export function LanguageSelect({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'md' }) {
  const t = useT(es)
  const { locale, locales, pending, setLocale } = useLocale()
  return (
    <Select<Locale>
      value={pending ?? locale}
      onValueChange={(value) => void setLocale(value)}
      size={size}
      aria-label={t('account.languageTitle')}
      className={cn('w-auto min-w-[9.5rem]', className)}
      options={locales.map((l) => ({
        value: l,
        label: (
          <span className="inline-flex items-center gap-2" lang={LOCALE_META[l].intl}>
            <Languages aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
            {LOCALE_META[l].label}
          </span>
        ),
      }))}
    />
  )
}

/** Lista de idiomas como opciones grandes (bienvenida): nombre nativo + marca de elegido. */
export function LanguageOptions({ value, onChange, className }: { value: Locale; onChange: (locale: Locale) => void; className?: string }) {
  const { locales, pending } = useLocale()
  return (
    <div role="radiogroup" className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
      {locales.map((l) => {
        const selected = (pending ?? value) === l
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={LOCALE_META[l].intl}
            onClick={() => onChange(l)}
            className={cn(
              'relative flex h-11 items-center justify-between gap-2 rounded-control border px-3 text-left text-base transition-colors duration-100',
              selected
                ? 'border-accent bg-accent-subtle font-medium text-accent-ink'
                : 'border-divider-strong bg-surface text-fg hover:border-control-hover hover:bg-hover',
            )}
          >
            <span className="truncate">{LOCALE_META[l].label}</span>
            {pending === l ? (
              <Spinner size={14} />
            ) : selected ? (
              <Check aria-hidden strokeWidth={2} className="size-4 shrink-0" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
