import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { SIDEBAR_AUTO_COLLAPSE_QUERY, useShellStore } from '../../lib/stores'
import { useShortcut } from '../../lib/useShortcut'
import { useToastArea } from '../../ui'
import { AccountBanner } from './AccountBanner'
import { MobileNavSheet, MobileTabBar } from './MobileNav'
import { PageFallback } from './PageFallback'
import { ShellCommandPalette } from './ShellCommandPalette'
import { ShortcutsDialog } from './ShortcutsDialog'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/** Marco general de la app privada: barra lateral, barra superior, contenido y paleta ⌘K. */
export default function AppShell() {
  const toggleSidebar = useShellStore((s) => s.toggleSidebar)
  const commandOpen = useShellStore((s) => s.commandOpen)
  const setCommandOpen = useShellStore((s) => s.setCommandOpen)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const showShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  const syncSidebarToScreen = useShellStore((s) => s.syncSidebarToScreen)

  useShortcut('mod+k', () => setCommandOpen(!commandOpen), { allowInInputs: true })
  useShortcut('/', () => setCommandOpen(true))
  useShortcut('[', toggleSidebar)
  useShortcut('?', showShortcuts)

  // Sin una elección guardada, la barra lateral va en modo iconos bajo 1280 px y se expande sobre eso.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(SIDEBAR_AUTO_COLLAPSE_QUERY)
    syncSidebarToScreen()
    query.addEventListener('change', syncSidebarToScreen)
    return () => query.removeEventListener('change', syncSidebarToScreen)
  }, [syncSidebarToScreen])

  // Los avisos de arriba se centran sobre el contenido (no sobre la ventana) para no tapar la barra lateral.
  useToastArea(mainRef)

  // El contenido se desplaza dentro de <main>: volvemos arriba al cambiar de página.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-paper-50">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-sm bg-paper-900 px-3 py-2 text-paper-0 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onShowShortcuts={showShortcuts} />
        <AccountBanner />
        <main
          id="contenido"
          ref={mainRef}
          tabIndex={-1}
          className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] focus:outline-none md:pb-0"
        >
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileTabBar />
      <MobileNavSheet />
      <ShellCommandPalette onShowShortcuts={showShortcuts} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}
