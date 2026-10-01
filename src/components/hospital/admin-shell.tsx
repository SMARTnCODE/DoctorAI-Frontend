'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard, Stethoscope, HeartPulse, Building2, Users, ClipboardList, CalendarClock,
  ScrollText, Settings, LogOut, Hospital, ChevronDown, Menu, ShieldCheck, Search, Keyboard,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { navigate } from '@/lib/hash-nav'
import { useApiData } from '@/hooks/use-api-data'
import { useAuth } from '@/components/hospital/auth-context'
import { initials } from '@/lib/format'
import { CommandPalette } from '@/components/hospital/command-palette'
import { NotificationsMenu } from '@/components/hospital/notifications-panel'
import { ShortcutsDialog } from '@/components/hospital/shortcuts-dialog'
import { ThemeToggle } from '@/components/hospital/theme-toggle'

const NAV_ITEMS = [
  { path: '/super-admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/super-admin/doctors', label: 'Doctors', icon: Stethoscope },
  { path: '/super-admin/specializations', label: 'Specializations', icon: HeartPulse },
  { path: '/super-admin/departments', label: 'Departments', icon: Building2 },
  { path: '/super-admin/patients', label: 'Patients', icon: Users },
  { path: '/super-admin/visits', label: 'Visits', icon: ClipboardList },
  { path: '/super-admin/shifts', label: 'Doctor Shifts', icon: CalendarClock },
  { path: '/super-admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { path: '/super-admin/settings', label: 'Settings', icon: Settings },
]

/**
 * Alt+N navigation order — Alt+1..8 are the original 8 pages (users learned
 * them; do NOT reshuffle), Alt+9 opens the newer Visits page.
 * Keep in sync with NAV_SHORTCUTS in shortcuts-dialog.tsx.
 */
const ALT_NAV_PATHS = [
  '/super-admin/dashboard',       // Alt+1
  '/super-admin/doctors',         // Alt+2
  '/super-admin/specializations', // Alt+3
  '/super-admin/departments',     // Alt+4
  '/super-admin/patients',        // Alt+5
  '/super-admin/shifts',          // Alt+6
  '/super-admin/audit-logs',      // Alt+7
  '/super-admin/settings',        // Alt+8
  '/super-admin/visits',          // Alt+9
]

export function AdminShell({ activePath, title, viewKey, children }: {
  activePath: string
  title?: string
  /** Full current hash path — used to key page-enter transitions. */
  viewKey?: string
  children: React.ReactNode
}) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sessionWarning, setSessionWarning] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  // Hospital name for the sidebar/topbar
  const { data: settingsData } = useApiData<{ settings: { hospitalName: string } }>('/api/settings')
  const hospitalName = settingsData?.settings.hospitalName ?? 'City General Hospital'

  // ⌘K / Ctrl+K toggles the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Global shortcuts: "?" opens the shortcuts help; Alt+1..9 jump between pages
  // (1..8 keep their original targets, 9 = Visits); Shift+T cycles the color
  // theme light → dark → system (documented in shortcuts-dialog.tsx).
  // Ignored while typing in form fields or while any dialog / command palette is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return // palette handler above
      const target = e.target as HTMLElement | null
      const typing = Boolean(
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable),
      )
      if (typing) return
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [cmdk-root]'))
      if (dialogOpen) return

      // Alt+1..9 → navigate (e.code Digit1..9 also covers macOS Option+digit → "¡")
      const codeDigit = /^Digit([1-9])$/.exec(e.code)
      const keyDigit = /^[1-9]$/.test(e.key) ? Number(e.key) : null
      const navDigit = e.altKey && !e.metaKey && !e.ctrlKey
        ? (codeDigit ? Number(codeDigit[1]) : keyDigit)
        : null
      if (navDigit !== null) {
        e.preventDefault()
        const path = ALT_NAV_PATHS[navDigit - 1]
        if (path) navigate(path)
        return
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }

      // Shift+T → cycle color theme (light → dark → system → light)
      if (e.shiftKey && e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [theme, setTheme])

  useEffect(() => {
    const onWarning = () => setSessionWarning(true)
    const onExpired = () => setSessionWarning(false)
    window.addEventListener('hms-session-warning', onWarning)
    window.addEventListener('hms-session-expired', onExpired)
    return () => {
      window.removeEventListener('hms-session-warning', onWarning)
      window.removeEventListener('hms-session-expired', onExpired)
    }
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/super-admin/login')
  }

  function staySignedIn() {
    setSessionWarning(false)
  }

  const sessionCard = (
    <div className="mx-3 mb-1 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">
          {initials(user?.name ?? 'SA')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user?.name ?? 'Super Admin'}</p>
          <span className="mt-0.5 inline-flex rounded-full bg-white/10 px-1.5 py-px text-[9px] font-semibold tracking-wider text-teal-200">
            SUPER ADMIN
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-emerald-300">
          <span className="relative flex size-1.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 [animation-duration:2s]" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
          Session active
        </span>
        <span className="rounded-full border border-white/15 px-1.5 py-px text-[9px] font-medium text-slate-300">
          Demo environment
        </span>
      </div>
    </div>
  )

  const navContent = (
    <nav className="flex h-full flex-col" aria-label="Super Admin navigation">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
          <Hospital className="size-5 text-[#63D4C4]" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{hospitalName}</p>
          <p className="text-[11px] text-slate-400">Super Admin Portal</p>
        </div>
      </div>
      <div className="hms-scroll flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = activePath === item.path || (item.path !== '/super-admin/dashboard' && activePath.startsWith(item.path))
          return (
            <a
              key={item.path}
              href={`#${item.path}`}
              aria-current={active ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                navigate(item.path)
                setMobileOpen(false)
              }}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-[#164D45] text-[#63D4C4]'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white',
              )}
            >
              <item.icon className={cn('size-4 shrink-0', active ? 'text-[#63D4C4]' : 'text-slate-400')} aria-hidden />
              {item.label}
            </a>
          )
        })}
      </div>
      <div className="border-t border-white/10 p-3 pt-2.5">
        {sessionCard}
        <div className="mt-1 flex items-center gap-1">
          <button
            onClick={handleLogout}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="size-4 shrink-0" aria-hidden /> Logout
          </button>
          <button
            type="button"
            onClick={() => {
              setShortcutsOpen(true)
              setMobileOpen(false) // close the mobile Sheet so the dialog is front and center
            }}
            aria-label="Keyboard shortcuts (press question mark)"
            title="Keyboard shortcuts (?)"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            <Keyboard className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* Global command palette (⌘K) + shortcuts help (?) */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-[var(--sidebar)] lg:block" data-testid="admin-sidebar">
        {navContent}
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {/* Mobile nav trigger */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-0 bg-[var(--sidebar)] p-0">
                  <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                  {navContent}
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{title ?? hospitalName}</p>
                <p className="hidden text-xs text-muted-foreground sm:block">{hospitalName} · Administration</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Command palette trigger (desktop: search field style) */}
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search (Ctrl+K or Command K)"
                className="hidden h-9 w-56 items-center gap-2 rounded-lg border bg-muted/70 px-3 text-sm text-muted-foreground transition-colors hover:border-teal-300 hover:bg-muted dark:hover:border-teal-500/50 md:flex xl:w-64"
              >
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="pointer-events-none rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  ⌘K
                </kbd>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 md:hidden"
                aria-label="Search (Command K)"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="size-4.5" />
              </Button>

              <Badge variant="outline" className="hidden border-teal-200 bg-teal-50 font-medium text-teal-700 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-300 md:inline-flex">
                <ShieldCheck className="mr-1 size-3" /> SUPER ADMIN
              </Badge>

              {/* Notifications */}
              <NotificationsMenu />

              {/* Light / Dark / System color theme */}
              <ThemeToggle />

              {/* Profile menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted"
                    aria-label="Profile menu"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
                        {initials(user?.name ?? 'SA')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-32 truncate text-sm font-medium text-foreground sm:block">
                      {user?.name ?? 'Super Admin'}
                    </span>
                    <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
                    <Badge className="mt-1.5 border border-teal-200 bg-teal-50 text-[10px] text-teal-700 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-300">SUPER_ADMIN</Badge>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/super-admin/settings')}>
                    <Settings className="size-4" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                    <LogOut className="size-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Inactivity warning banner */}
          {sessionWarning ? (
            <div className="flex items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-500/25 dark:bg-amber-500/10 sm:px-6" role="alert">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                You have been inactive. You will be signed out automatically in about a minute.
              </p>
              <Button size="sm" className="h-7 bg-amber-600 text-xs text-white hover:bg-amber-700" onClick={staySignedIn}>
                Stay signed in
              </Button>
            </div>
          ) : null}
        </header>

        {/* Page content — subtle enter transition keyed on the hash path */}
        <main className="hms-scroll flex-1 px-4 py-6 sm:px-6 lg:px-8" id="main-content">
          <motion.div
            key={viewKey ?? title ?? 'page'}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </main>

        {/* Sticky footer */}
        <footer className="mt-auto border-t bg-background">
          <div className="flex flex-col items-center justify-between gap-1 px-4 py-3 text-[11px] text-muted-foreground sm:flex-row sm:px-6">
            <p>{hospitalName} · Super Admin Portal</p>
            <p className="hidden items-center gap-1 sm:flex">
              Press{' '}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">?</kbd>{' '}
              for shortcuts ·{' '}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">⌘K</kbd>{' '}
              to search
            </p>
            <p>Secure session active · Access is monitored &amp; audited</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
