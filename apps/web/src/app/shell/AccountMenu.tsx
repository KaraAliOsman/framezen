import { useNavigate } from 'react-router'
import { Building2, CreditCard, Keyboard, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useLogout, useSession } from '../../lib/auth'
import { describePlan } from '../../lib/plan'
import { useTheme, type ThemePreference } from '../../lib/theme'
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
} from '../../ui'

const THEME_LABEL: Record<ThemePreference, string> = { light: 'Claro', dark: 'Oscuro', system: 'Como el sistema' }

/** Menú de cuenta: persona, empresa, plan y días de prueba, tema y salir. */
export function AccountMenu({ onShowShortcuts }: { onShowShortcuts?: () => void }) {
  const me = useSession()
  const navigate = useNavigate()
  const logout = useLogout()
  const { theme, resolved, setTheme } = useTheme()
  const plan = describePlan(me.billing)
  const ThemeIcon = theme === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Cuenta de ${me.user.name}`}
          className="inline-flex size-9 items-center justify-center rounded-full transition-colors duration-120 hover:bg-paper-100 data-[state=open]:bg-paper-100"
        >
          <Avatar name={me.user.name} size="sm" tone="ink" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <div className="flex items-center gap-3 px-2 pt-2 pb-2.5">
          <Avatar name={me.user.name} size="md" tone="ink" />
          <div className="min-w-0">
            <div className="truncate font-medium text-paper-900">{me.user.name}</div>
            <div className="truncate text-[13px] text-paper-600">{me.user.email}</div>
          </div>
        </div>

        <div className="mx-1 mb-1 rounded-sm border border-paper-200 bg-paper-50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-paper-900">{me.org.name}</span>
            <Badge tone={plan.isTrial ? 'ink' : 'neutral'} size="sm">
              {plan.name}
            </Badge>
          </div>
          {plan.isTrial && plan.trialDaysLeft !== null ? (
            <div className="mt-2 space-y-1.5">
              <div
                className="h-1 overflow-hidden rounded-full bg-paper-200"
                role="progressbar"
                aria-label="Días de prueba usados"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(plan.trialProgress * 100)}
              >
                <div
                  className="h-full origin-left rounded-full bg-ink-600"
                  style={{ transform: `scaleX(${Math.max(0.04, plan.trialProgress)})` }}
                />
              </div>
              <p className="text-meta text-paper-600">
                {plan.trialDaysLeft === 0
                  ? 'Tu prueba terminó: puedes ver y exportar todo.'
                  : plan.trialDaysLeft === 1
                    ? 'Queda 1 día de prueba con todo Pro.'
                    : `Quedan ${plan.trialDaysLeft} días de prueba con todo Pro.`}
              </p>
            </div>
          ) : null}
        </div>

        <DropdownMenuItem icon={Building2} onSelect={() => navigate('/ajustes/empresa')}>
          Datos de la empresa
        </DropdownMenuItem>
        <DropdownMenuItem icon={CreditCard} onSelect={() => navigate('/ajustes/plan')} hint={plan.isTrial ? 'Elegir plan' : undefined}>
          Plan y facturación
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={ThemeIcon}>Tema · {THEME_LABEL[theme]}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
              <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Oscuro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">Como el sistema</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onShowShortcuts ? (
          <DropdownMenuItem icon={Keyboard} shortcut="?" onSelect={onShowShortcuts}>
            Atajos de teclado
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={LogOut} onSelect={() => logout.mutate()}>
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
