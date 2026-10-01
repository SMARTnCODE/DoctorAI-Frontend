'use client'

/**
 * Global command palette (⌘K / Ctrl+K).
 * - Static Navigation + Quick actions + Appearance (theme toggle) groups
 * - Live search (≥2 chars, 250ms debounce) against GET /api/search
 *   → Doctors / Patients / Departments / Specializations groups
 * - 401 handled exactly like the pages (toast + back to login view)
 *
 * Controlled by AdminShell which owns the open state and the keyboard shortcut.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react'
import {
  Building2, CalendarClock, CalendarPlus, ClipboardList, Clock, HeartPulse, LayoutDashboard,
  Loader2, Moon, ScrollText, Settings, Stethoscope, Sun, UserPlus, Users,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/hospital/status-badge'
import { apiFetch, ApiError } from '@/lib/api-client'
import { navigate } from '@/lib/hash-nav'
import { initials } from '@/lib/format'
import { clearRecentItems, getRecentItems, type RecentItem } from '@/lib/recent-items'

interface SearchDoctor {
  id: string
  doctorId: string
  name: string
  designation: string | null
  department: string | null
  status: string
}
interface SearchPatient {
  id: string
  patientId: string
  name: string
  gender: string | null
  phone: string | null
  status: string
}
interface SearchDepartment { id: string; name: string; code: string; status: string }
interface SearchSpecialization { id: string; name: string; status: string }
interface SearchResponse {
  doctors: SearchDoctor[]
  patients: SearchPatient[]
  departments: SearchDepartment[]
  specializations: SearchSpecialization[]
}

const EMPTY_RESULTS: SearchResponse = { doctors: [], patients: [], departments: [], specializations: [] }

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

const QUICK_ACTIONS = [
  { path: '/super-admin/doctors/new', label: 'Add doctor', icon: UserPlus },
  { path: '/super-admin/shifts', label: 'Add shift', icon: CalendarPlus },
  { path: '/super-admin/audit-logs', label: 'View audit logs', icon: ScrollText },
  { path: '/super-admin/settings', label: 'Open settings', icon: Settings },
]

// Hydration guard for the theme toggle (same pattern as theme-toggle.tsx).
const emptySubscribe = () => () => {}

export function CommandPalette({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [searching, setSearching] = useState(false)
  const [recents, setRecents] = useState<RecentItem[]>([])
  const inputRef = useRef<ComponentRef<typeof CommandInput>>(null)
  const requestRef = useRef(0)

  // Theme toggle — icon/hint reflect the *effective* theme after mount
  // (Sun before mount, mirroring theme-toggle.tsx, to avoid a hydration mismatch).
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const effectiveTheme = mounted ? resolvedTheme : undefined

  // Refresh the Recent group every time the palette opens (fresh storage read).
  useEffect(() => {
    if (!open) return
    // Deferred to satisfy react-hooks/set-state-in-effect (codebase convention).
    const t = window.setTimeout(() => setRecents(getRecentItems()), 0)
    return () => window.clearTimeout(t)
  }, [open])

  // Reset transient search state whenever the palette closes.
  useEffect(() => {
    if (open) return
    requestRef.current += 1 // invalidate in-flight requests
    const t = window.setTimeout(() => {
      setQuery('')
      setResults(null)
      setSearching(false)
      // Release focus back to <body> (Radix first restores it to the trigger).
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])

  // Debounced live search.
  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) {
      requestRef.current += 1 // invalidate in-flight requests
      const t = window.setTimeout(() => {
        setResults(null)
        setSearching(false)
      }, 0)
      return () => window.clearTimeout(t)
    }
    const id = ++requestRef.current
    const timer = window.setTimeout(() => {
      setSearching(true)
      apiFetch<Partial<SearchResponse>>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((data) => {
          if (requestRef.current !== id) return
          setResults({
            doctors: data.doctors ?? [],
            patients: data.patients ?? [],
            departments: data.departments ?? [],
            specializations: data.specializations ?? [],
          })
        })
        .catch((e: unknown) => {
          if (requestRef.current !== id) return
          if (e instanceof ApiError && e.status === 401) {
            toast.error('Session expired. Please sign in again.')
            navigate('/super-admin/login')
            onOpenChange(false)
            return
          }
          // Endpoint briefly unavailable / transient error → show empty results.
          setResults(EMPTY_RESULTS)
        })
        .finally(() => {
          if (requestRef.current === id) setSearching(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, open, onOpenChange])

  const go = (path: string) => {
    navigate(path)
    onOpenChange(false)
  }

  const clearRecents = () => {
    clearRecentItems()
    setRecents([])
    // Clearing unmounts the button — keep keyboard focus on the search input.
    inputRef.current?.focus()
  }

  // Light ⇄ Dark only — never writes 'system' (leaves the system preference intact).
  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    onOpenChange(false)
  }

  const doctors = results?.doctors ?? []
  const patients = results?.patients ?? []
  const departments = results?.departments ?? []
  const specializations = results?.specializations ?? []

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search doctors, patients, departments and specializations, or jump to a page."
      className="sm:max-w-xl"
    >
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder="Search doctors, patients, departments… or type to navigate"
      />
      <CommandList className="hms-scroll">
        {searching ? (
          <CommandGroup heading="Search results">
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
            </div>
          </CommandGroup>
        ) : null}

        {query.trim() === '' && recents.length > 0 ? (
          <CommandGroup value="recent" heading="Recent" className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                clearRecents()
              }}
              className="absolute top-1.5 right-2 z-10 rounded-sm py-0.5 text-[11px] font-normal text-teal-700 transition-colors hover:text-teal-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-teal-300 dark:hover:text-teal-200"
            >
              Clear
            </button>
            {recents.slice(0, 4).map((r) => (
              <CommandItem
                key={`${r.type}-${r.code}`}
                value={`recent ${r.type} ${r.name} ${r.code}`}
                onSelect={() =>
                  go(
                    r.type === 'doctor'
                      ? `/super-admin/doctors/${encodeURIComponent(r.code)}`
                      : `/super-admin/patients/${encodeURIComponent(r.code)}`,
                  )
                }
              >
                <Clock className="text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.name}</span>
                <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[10px] font-medium">
                  {r.code}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.path}
              value={`navigation ${item.label} ${item.path}`}
              onSelect={() => go(item.path)}
            >
              <item.icon className="text-teal-600 dark:text-teal-300" aria-hidden />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Quick actions">
          {QUICK_ACTIONS.map((action) => (
            <CommandItem
              key={action.path}
              value={`action ${action.label} ${action.path}`}
              onSelect={() => go(action.path)}
            >
              <action.icon className="text-teal-600 dark:text-teal-300" aria-hidden />
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Appearance">
          <CommandItem
            value="appearance toggle dark mode theme"
            onSelect={toggleTheme}
          >
            {effectiveTheme === 'dark'
              ? <Moon className="text-teal-600 dark:text-teal-300" aria-hidden />
              : <Sun className="text-teal-600 dark:text-teal-300" aria-hidden />}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">Toggle dark mode</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {effectiveTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            </span>
          </CommandItem>
        </CommandGroup>

        {doctors.length > 0 ? (
          <CommandGroup heading="Doctors">
            {doctors.map((d) => (
              <CommandItem
                key={d.id}
                value={`doctor ${d.name} ${d.doctorId} ${d.department ?? ''}`}
                onSelect={() => go(`/super-admin/doctors/${d.id}`)}
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-teal-50 text-[10px] font-semibold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                    {initials(d.name?.replace(/^Dr\.?\s+/i, '') ?? '')}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{d.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[d.designation, d.department].filter(Boolean).join(' · ') || d.doctorId}
                  </span>
                </span>
                <StatusBadge status={d.status ?? 'ACTIVE'} className="ml-auto hidden shrink-0 sm:inline-flex" />
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {patients.length > 0 ? (
          <CommandGroup heading="Patients">
            {patients.map((p) => (
              <CommandItem
                key={p.id}
                value={`patient ${p.name} ${p.patientId} ${p.phone ?? ''}`}
                onSelect={() => go(`/super-admin/patients/${p.id}`)}
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">
                    {initials(p.name ?? '')}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {p.patientId}
                    {p.gender ? ` · ${p.gender}` : ''}
                  </span>
                </span>
                {p.phone ? (
                  <span className="ml-auto hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">
                    {p.phone}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {departments.length > 0 ? (
          <CommandGroup heading="Departments">
            {departments.map((dep) => (
              <CommandItem
                key={dep.id}
                value={`department ${dep.name} ${dep.code}`}
                onSelect={() => {
                  // Hand-off consumed by the doctors page on mount.
                  sessionStorage.setItem('hms-doctors-prefill', JSON.stringify({ departmentId: dep.id }))
                  go('/super-admin/doctors')
                }}
              >
                <Building2 className="text-teal-600 dark:text-teal-300" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{dep.name}</span>
                {dep.code ? (
                  <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[10px] font-medium">
                    {dep.code}
                  </Badge>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {specializations.length > 0 ? (
          <CommandGroup heading="Specializations">
            {specializations.map((sp) => (
              <CommandItem
                key={sp.id}
                value={`specialization ${sp.name}`}
                onSelect={() => go('/super-admin/specializations')}
              >
                <HeartPulse className="text-teal-600 dark:text-teal-300" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{sp.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        <CommandEmpty>No results found.</CommandEmpty>
      </CommandList>
    </CommandDialog>
  )
}
