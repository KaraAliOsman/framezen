import { useNavigate } from 'react-router'
import { Building2, CreditCard, Keyboard, LogOut, Monitor, Moon, Ruler, Sun } from 'lucide-react'
import { useLogout, useSession } from '../../lib/auth'
import { useGlossary, useT } from '../../lib/i18n'
import { describePlan } from '../../lib/plan'
import { THEME_CHOICES, useTheme, type ThemePreference } from '../../lib/theme'
import {
  Avatar,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Meter,
} from '../../ui'
import es from '../i18n/es'
import { LanguageSubmenu } from './LanguageMenu'

const THEME_KEY = { original: 'account.original', light: 'account.light', dark: 'account.dark', system: 'account.system' } as const
const THEME_ICON = { original: Ruler, light: Sun, dark: Moon, system: Monitor } as const

/** Menú de cuenta: persona, empresa, plan y días de prueba, tema, idioma, atajos y salir. */
export function AccountMenu({ onShowShortcuts }: { onShowShortcuts?: () => void }) {
  const t = useT(es)
  const g = useGlossary()
  const me = useSession()
  const navigate = useNavigate()
  const logout = useLogout()
  const { theme, setTheme } = useTheme()
  const plan = describePlan(me.billing)
  const ThemeIcon = THEME_ICON[theme]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('account.trigger', { name: me.user.name })}
          className="inline-flex size-9 items-center justify-center rounded-full transition-colors duration-100 hover:bg-hover data-[state=open]:bg-hover"
        >
          <Avatar name={me.user.name} size="sm" tone="ink" className="size-7" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <div className="flex items-center gap-3 px-2 pt-2 pb-2.5">
          <Avatar name={me.user.name} size="md" tone="ink" />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg-strong">{me.user.name}</div>
            <div className="truncate text-table text-fg-muted">{me.user.email}</div>
          </div>
        </div>

        <div className="mx-1 mb-1 rounded-sm bg-sunken px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-table font-medium text-fg-strong">{me.org.name}</span>
            <Badge tone={plan.isTrial ? 'accent' : 'neutral'} size="sm">
              {g.plan(plan.code)}
            </Badge>
          </div>
          {plan.isTrial && plan.trialDaysLeft !== null ? (
            <div className="mt-2 space-y-1.5">
              <Meter value={Math.round(plan.trialProgress * 100)} max={100} tone="auto" aria-label={t('account.trialAria')} />
              <p className="text-meta text-fg-muted">
                {plan.trialDaysLeft === 0 ? t('account.trialEnded') : t('account.trialLeft', { count: plan.trialDaysLeft })}
              </p>
            </div>
          ) : null}
        </div>

        <DropdownMenuItem icon={Building2} onSelect={() => navigate('/ajustes/empresa')}>
          {t('account.company')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={CreditCard} onSelect={() => navigate('/ajustes/plan')} hint={plan.isTrial ? t('account.choosePlan') : undefined}>
          {t('account.plan')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={ThemeIcon}>{t('account.theme', { theme: t(THEME_KEY[theme]) })}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{t('account.appearance')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
              {THEME_CHOICES.map((value) => {
                const Icon = THEME_ICON[value]
                return (
                  <DropdownMenuRadioItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <Icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
                      {t(THEME_KEY[value])}
                    </span>
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <LanguageSubmenu />
        {onShowShortcuts ? (
          <DropdownMenuItem icon={Keyboard} shortcut="?" onSelect={onShowShortcuts}>
            {t('account.shortcuts')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={LogOut} onSelect={() => logout.mutate()}>
          {t('account.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
