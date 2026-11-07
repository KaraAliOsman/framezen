import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { FilePlus2, FileText, Keyboard, Languages, LogOut, MessageSquare, Moon, PanelLeft, Ruler, Sun, User, UserPlus } from 'lucide-react'
import { humanError } from '../../lib/api'
import { useLogout, useSession } from '../../lib/auth'
import { useClients, useCreateQuote, useQuotes } from '../../lib/hooks'
import { LOCALE_META, useFormat, useGlossary, useLocale, useT } from '../../lib/i18n'
import { toggleAssistant, useAssistantStore, useShellStore } from '../../lib/stores'
import { useTheme, type ResolvedTheme } from '../../lib/theme'
import { CommandPalette, toast, type CommandGroup } from '../../ui'
import es from '../i18n/es'
import { MAIN_NAV, SETTINGS_NAV, SETTINGS_SECTIONS, settingsSectionLabel } from './nav'
import { useAssistantName } from './useAssistantName'

const THEMES = [
  { value: 'original', label: 'palette.themeOriginal', icon: Ruler },
  { value: 'light', label: 'palette.themeLight', icon: Sun },
  { value: 'dark', label: 'palette.themeDark', icon: Moon },
] as const satisfies readonly { value: ResolvedTheme; label: string; icon: unknown }[]

const words = (text: string) =>
  text
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)

/** Paleta ⌘K del shell: acciones, navegación, cotizaciones y clientes, idioma y «preguntarle al asistente». */
export function ShellCommandPalette({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const { locale, locales, setLocale } = useLocale()
  const open = useShellStore((s) => s.commandOpen)
  const setOpen = useShellStore((s) => s.setCommandOpen)
  const toggleSidebar = useShellStore((s) => s.toggleSidebar)
  const ask = useAssistantStore((s) => s.ask)
  // Con una sola persona, «Equipo» se llama «Invitar a alguien» (igual que el menú de Ajustes).
  const solo = useSession().solo
  const navigate = useNavigate()
  const { mutate: logout } = useLogout()
  const { mutate: createQuote } = useCreateQuote()
  const { theme, setTheme } = useTheme()
  // Solo pedimos datos cuando la paleta está abierta.
  const quotes = useQuotes({}, { enabled: open })
  const clients = useClients('', { enabled: open })
  const assistantName = useAssistantName({ enabled: open })

  const groups = useMemo<CommandGroup[]>(() => {
    const actions: CommandGroup = {
      heading: t('palette.actions'),
      items: [
        {
          id: 'new-quote',
          label: t('palette.newQuote'),
          icon: FilePlus2,
          keywords: words(t('palette.newQuoteKeywords')),
          onSelect: () =>
            createQuote(
              {},
              {
                onSuccess: (quote) => navigate(`/cotizaciones/${quote.id}`),
                onError: (error) => toast.error(humanError(error)),
              },
            ),
        },
        {
          id: 'new-client',
          label: t('palette.newClient'),
          icon: UserPlus,
          keywords: words(t('palette.newClientKeywords')),
          onSelect: () => navigate('/clientes?nuevo=1'),
        },
        ...THEMES.filter((option) => option.value !== theme).map((option) => ({
          id: `theme-${option.value}`,
          label: t(option.label),
          icon: option.icon,
          keywords: words(t('palette.themeKeywords')),
          onSelect: () => setTheme(option.value),
        })),
        {
          id: 'assistant',
          label: assistantName ? t('palette.assistant', { name: assistantName }) : t('palette.assistantGeneric'),
          icon: MessageSquare,
          shortcut: 'mod+j',
          keywords: words(t('palette.assistantKeywords')),
          onSelect: toggleAssistant,
        },
        { id: 'sidebar', label: t('palette.sidebar'), icon: PanelLeft, shortcut: '[', onSelect: toggleSidebar },
        { id: 'shortcuts', label: t('palette.shortcuts'), icon: Keyboard, shortcut: '?', onSelect: onShowShortcuts },
        // Idioma de la interfaz: uno por idioma disponible (el nombre en su propio idioma también se busca).
        ...locales
          .filter((l) => l !== locale)
          .map((l) => ({
            id: `locale-${l}`,
            label: t('palette.language', { language: LOCALE_META[l].label }),
            icon: Languages,
            keywords: [...words(t('palette.languageKeywords')), LOCALE_META[l].label, LOCALE_META[l].englishName],
            onSelect: () => void setLocale(l),
          })),
      ],
    }
    const goTo: CommandGroup = {
      heading: t('palette.goTo'),
      items: [
        ...MAIN_NAV.map((item) => ({
          id: `go-${item.to}`,
          label: t(`nav.${item.id}`),
          icon: item.icon,
          keywords: item.keywords,
          onSelect: () => navigate(item.to),
        })),
        ...SETTINGS_SECTIONS.map((section) => ({
          id: `go-settings-${section.slug}`,
          label: t('palette.settingsItem', { section: settingsSectionLabel(section, solo) }),
          icon: SETTINGS_NAV.icon,
          keywords: [...words(t('palette.settingsKeywords')), section.description],
          onSelect: () => navigate(`/ajustes/${section.slug}`),
        })),
      ],
    }
    const quoteItems: CommandGroup = {
      heading: t('palette.quotes'),
      items: (quotes.data ?? []).slice(0, 50).map((q) => ({
        id: `quote-${q.id}`,
        label: `${fmt.docNumber(q.number)} · ${q.title || t('palette.untitled')}`,
        hint: [q.clientName, g.quoteStatus(q.status), fmt.money(q.total)].filter(Boolean).join(' · '),
        icon: FileText,
        keywords: [String(q.number), q.clientName ?? ''],
        onSelect: () => navigate(`/cotizaciones/${q.id}`),
      })),
    }
    const clientItems: CommandGroup = {
      heading: t('palette.clients'),
      items: (clients.data ?? []).slice(0, 50).map((c) => ({
        id: `client-${c.id}`,
        label: c.name,
        hint: [c.city, c.rut].filter(Boolean).join(' · '),
        icon: User,
        keywords: [c.email ?? '', c.phone ?? ''],
        onSelect: () => navigate(`/clientes/${c.id}`),
      })),
    }
    const session: CommandGroup = {
      heading: t('palette.account'),
      items: [{ id: 'logout', label: t('palette.logout'), icon: LogOut, keywords: words(t('palette.logoutKeywords')), onSelect: () => logout() }],
    }
    return [actions, goTo, quoteItems, clientItems, session]
  }, [
    t,
    g,
    fmt,
    locale,
    locales,
    setLocale,
    quotes.data,
    clients.data,
    theme,
    navigate,
    createQuote,
    setTheme,
    toggleSidebar,
    onShowShortcuts,
    logout,
    solo,
    assistantName,
  ])

  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      placeholder={t('palette.placeholder')}
      onAsk={ask}
      askName={assistantName}
      askIcon={<MessageSquare aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />}
    />
  )
}
