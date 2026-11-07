import { clsx } from 'clsx'
import { ChevronDown, Globe } from 'lucide-react'
import { LOCALE_META, useLocale, useT, type Locale } from '../../../lib/i18n'
import { buttonClass } from '../../../ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../../../ui/DropdownMenu'
import es from '../i18n/es'

/**
 * Selector de idioma de la landing: los 7 idiomas con su nombre nativo. Cambia el idioma de la
 * página al instante (descarga primero los textos, sin destello) y lo recuerda (`fz-locale`), así la
 * cuenta nueva nace en ese idioma.
 * - `compact`: ícono + código («ES») para la cabecera.
 * - `full`: nombre completo («Español») para el pie.
 */
export function LanguageSwitcher({ variant = 'compact', className }: { variant?: 'compact' | 'full'; className?: string }) {
  const t = useT(es)
  const { locale, locales, pending, setLocale } = useLocale()
  const current = LOCALE_META[locale]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t('common.language')}: ${current.label}`}
        aria-busy={pending ? true : undefined}
        className={buttonClass('ghost', variant === 'compact' ? 'md' : 'sm', clsx('gap-1.5 px-2.5 text-fg-muted hover:text-fg-strong', className))}
      >
        <Globe aria-hidden strokeWidth={1.75} />
        {variant === 'compact' ? (
          <span className="code-id text-table">{locale.toUpperCase()}</span>
        ) : (
          <span>{pending ? t('common.languageChanging') : current.label}</span>
        )}
        <ChevronDown aria-hidden strokeWidth={1.75} className="-mr-0.5 size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === 'compact' ? 'end' : 'start'} className="min-w-44">
        <DropdownMenuRadioGroup value={locale} onValueChange={(value) => void setLocale(value as Locale)}>
          {locales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={LOCALE_META[code].intl}>
              <span className="flex-1">{LOCALE_META[code].label}</span>
              <span className="code-id text-meta text-fg-faint">{code.toUpperCase()}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
