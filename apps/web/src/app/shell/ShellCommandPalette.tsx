import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { FilePlus2, Keyboard, LogOut, Moon, PanelLeft, Sun, UserPlus, FileText, User } from 'lucide-react'
import { useLogout, useSession } from '../../lib/auth'
import { formatCLP, formatDocNumber } from '../../lib/format'
import { humanError } from '../../lib/api'
import { useClients, useCreateQuote, useQuotes } from '../../lib/hooks'
import { toggleAssistant, useAssistantStore, useShellStore } from '../../lib/stores'
import { MarcoAvatar } from '../../features/assistant/avatar'
import { useTheme } from '../../lib/theme'
import { CommandPalette, QUOTE_STATUS_COPY, toast, type CommandGroup } from '../../ui'
import { MAIN_NAV, SETTINGS_NAV, SETTINGS_SECTIONS } from './nav'

/** Paleta ⌘K del shell: acciones, navegación, cotizaciones y clientes, y «preguntarle a Marco». */
export function ShellCommandPalette({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const open = useShellStore((s) => s.commandOpen)
  const setOpen = useShellStore((s) => s.setCommandOpen)
  const toggleSidebar = useShellStore((s) => s.toggleSidebar)
  const ask = useAssistantStore((s) => s.ask)
  // Con una sola persona, «Equipo» se llama «Invitar a alguien» (igual que el menú de Ajustes).
  const solo = useSession().solo
  const navigate = useNavigate()
  const { mutate: logout } = useLogout()
  const { mutate: createQuote } = useCreateQuote()
  const { resolved, setTheme } = useTheme()
  // Solo pedimos datos cuando la paleta está abierta.
  const quotes = useQuotes({}, { enabled: open })
  const clients = useClients('', { enabled: open })

  const groups = useMemo<CommandGroup[]>(() => {
    const actions: CommandGroup = {
      heading: 'Acciones',
      items: [
        {
          id: 'new-quote',
          label: 'Nueva cotización',
          icon: FilePlus2,
          keywords: ['crear', 'presupuesto', 'ventana'],
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
          label: 'Nuevo cliente',
          icon: UserPlus,
          keywords: ['crear', 'contacto'],
          onSelect: () => navigate('/clientes?nuevo=1'),
        },
        {
          id: 'theme',
          label: resolved === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
          icon: resolved === 'dark' ? Sun : Moon,
          keywords: ['apariencia', 'modo', 'oscuro', 'claro'],
          onSelect: () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
        },
        {
          id: 'marco',
          label: 'Abrir o cerrar a Marco',
          icon: <MarcoAvatar state="idle" size={20} animated={false} className="-m-0.5 shrink-0" />,
          shortcut: 'mod+j',
          keywords: ['asistente', 'ayuda', 'preguntar', 'chat'],
          onSelect: toggleAssistant,
        },
        { id: 'sidebar', label: 'Contraer o expandir la barra', icon: PanelLeft, shortcut: '[', onSelect: toggleSidebar },
        { id: 'shortcuts', label: 'Ver atajos de teclado', icon: Keyboard, shortcut: '?', onSelect: onShowShortcuts },
      ],
    }
    const goTo: CommandGroup = {
      heading: 'Ir a',
      items: [
        ...MAIN_NAV.map((item) => ({
          id: `go-${item.to}`,
          label: item.label,
          icon: item.icon,
          keywords: item.keywords,
          onSelect: () => navigate(item.to),
        })),
        ...SETTINGS_SECTIONS.map((section) => ({
          id: `go-settings-${section.slug}`,
          label: `Ajustes · ${section.slug === 'equipo' && solo ? 'Invitar a alguien' : section.label}`,
          icon: SETTINGS_NAV.icon,
          keywords: ['ajustes', 'configuración', section.description],
          onSelect: () => navigate(`/ajustes/${section.slug}`),
        })),
      ],
    }
    const quoteItems: CommandGroup = {
      heading: 'Cotizaciones',
      items: (quotes.data ?? []).slice(0, 50).map((q) => ({
        id: `quote-${q.id}`,
        label: `${formatDocNumber(q.number)} · ${q.title || 'Sin nombre de obra'}`,
        hint: [q.clientName, QUOTE_STATUS_COPY[q.status].label, formatCLP(q.total)].filter(Boolean).join(' · '),
        icon: FileText,
        keywords: [String(q.number), q.clientName ?? ''],
        onSelect: () => navigate(`/cotizaciones/${q.id}`),
      })),
    }
    const clientItems: CommandGroup = {
      heading: 'Clientes',
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
      heading: 'Cuenta',
      items: [{ id: 'logout', label: 'Cerrar sesión', icon: LogOut, keywords: ['salir'], onSelect: () => logout() }],
    }
    return [actions, goTo, quoteItems, clientItems, session]
  }, [quotes.data, clients.data, resolved, navigate, createQuote, setTheme, toggleSidebar, onShowShortcuts, logout, solo])

  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      placeholder="Busca una cotización, un cliente o qué hacer…"
      onAsk={ask}
    />
  )
}
