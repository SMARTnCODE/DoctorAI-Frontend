'use client'

import { useEffect, useState } from 'react'
import {
  Activity, BedDouble, Bell, Bot, CalendarDays, ChevronUp, Hospital, LayoutDashboard, Lock, LogOut,
  Menu, Search, Stethoscope, UserRound, Users, Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/hospital/theme-toggle'
import { admissionFor } from '@/components/hospital/clinical/clinical-data'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import { useAuth } from '@/components/hospital/auth-context'
import { navigate } from '@/lib/hash-nav'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { patientsService, type Patient, type PatientReferral } from '@/services/patients.service'
import type { LucideIcon } from 'lucide-react'

export type DoctorSection =
  | 'dashboard'
  | 'inpatients'
  | 'opd'
  | 'telehealth'
  | 'patients'
  | 'patient'
  | 'referrals'
  | 'ai'
  | 'profile'

export const DOCTOR_NAV: { section: Exclude<DoctorSection, 'patient'>; label: string; hint: string; icon: LucideIcon; path: string }[] = [
  { section: 'dashboard', label: 'Dashboard', hint: 'Overview', icon: LayoutDashboard, path: '/doctor/dashboard' },
  { section: 'inpatients', label: 'In-Hospital', hint: 'Wards & beds', icon: BedDouble, path: '/doctor/inpatients' },
  { section: 'opd', label: 'OPD Patients', hint: "Today's queue", icon: Stethoscope, path: '/doctor/opd' },
  { section: 'telehealth', label: 'Telehealth', hint: 'Virtual visits', icon: Video, path: '/doctor/telehealth' },
  { section: 'patients', label: 'Patient Records', hint: 'All patients', icon: Users, path: '/doctor/patients' },
  { section: 'ai', label: 'AI Co-Pilot', hint: 'Clinical assistant', icon: Bot, path: '/doctor/ai' },
]

const TITLES: Record<DoctorSection, string> = {
  dashboard: 'Clinical Dashboard',
  inpatients: 'In-Hospital Patients',
  opd: 'Outpatient (OPD) Queue',
  telehealth: 'Telehealth Visits',
  patients: 'Patient Records',
  patient: 'Patient Records',
  referrals: 'Referrals',
  ai: 'Clinical AI Co-Pilot',
  profile: 'Profile',
}

const SUBTITLES: Record<DoctorSection, string> = {
  dashboard: "Today's snapshot across all services",
  inpatients: 'Ward map & admitted patient care',
  opd: "Today's appointments & check-in",
  telehealth: 'Virtual consultations & scheduling',
  patients: 'Search, add & manage all patients',
  patient: 'Search, add & manage all patients',
  referrals: 'Received and sent referrals',
  ai: 'Evidence-based clinical assistance',
  profile: 'Account and password',
}

function NavList({
  active,
  onNavigate,
}: {
  active: DoctorSection
  onNavigate?: () => void
}) {
  const current = active === 'patient' ? 'patients' : active
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Doctor navigation">
      <p className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">Workspace</p>
      {DOCTOR_NAV.map((item) => {
        const Icon = item.icon
        const selected = current === item.section
        return (
          <button
            key={item.section}
            type="button"
            onClick={() => {
              navigate(item.path)
              onNavigate?.()
            }}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-colors',
              selected
                ? 'bg-[#164d45] text-white'
                : 'text-sidebar-foreground/75 hover:bg-[#164d45]/70 hover:text-white',
            )}
          >
            <span className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              selected || item.section === 'ai'
                ? 'bg-[#1f8f72] text-white'
                : 'bg-[#123f3a] text-sidebar-foreground/70',
            )}>
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.label}</span>
              <span className={cn('block truncate text-[10px] font-normal', selected ? 'text-white/60' : 'text-sidebar-foreground/45')}>{item.hint}</span>
            </span>
            {item.section === 'ai' ? (
              <span className="size-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

function DoctorIdentity({ name, specialty, onLogout }: { name: string; specialty?: string | null; onLogout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2.5 text-left hover:bg-sidebar-accent"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-sidebar-foreground">{name}</span>
            <span className="flex items-center gap-1 truncate text-[11px] text-sidebar-foreground/60">
              <Activity className="size-3" aria-hidden /> {specialty || 'Physician'} · On duty
            </span>
          </span>
          <ChevronUp className="size-4 shrink-0 text-sidebar-foreground/50" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => navigate('/doctor/profile')}>
          <UserRound className="size-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="size-4" /> Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DoctorShell({
  section,
  patientId,
  name,
  specialty,
  onLogout,
  children,
}: {
  section: DoctorSection
  patientId?: string
  name: string
  specialty?: string | null
  onLogout: () => void
  children: React.ReactNode
}) {
  const { userId, doctorProfile } = useAuth()
  const actorId = doctorProfile?.id || userId
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Patient[]>([])
  const [incoming, setIncoming] = useState<PatientReferral[]>([])
  const setDirectoryQuery = useClinicalStore((s) => s.setDirectoryQuery)
  const viewingAdmission = section === 'patient' && Boolean(patientId && admissionFor(patientId))
  const titleKey: DoctorSection = viewingAdmission ? 'inpatients' : section
  const navSection: DoctorSection = viewingAdmission ? 'inpatients' : section

  useEffect(() => {
    setDirectoryQuery(section === 'patients' ? query : '')
  }, [section, query, setDirectoryQuery])

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2 || section === 'patients') {
      setHits([])
      return
    }
    const timer = window.setTimeout(() => {
      void patientsService.getPatients({ search: term, page: 1, pageSize: 6 })
        .then((result) => setHits(result.items))
        .catch(() => setHits([]))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, section])

  useEffect(() => {
    let cancelled = false
    void patientsService.getReferrals({ status: 'PENDING', page: 1, pageSize: 20 })
      .then((result) => {
        if (cancelled) return
        setIncoming(result.items.filter((item) => item.referredDoctor?.id === actorId))
      })
      .catch(() => {
        if (!cancelled) setIncoming([])
      })
    return () => { cancelled = true }
  }, [actorId, section])

  return (
    <div className="flex min-h-screen bg-background" data-testid="doctor-portal">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-teal-500/20 text-teal-100 ring-1 ring-white/15">
            <Hospital className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold text-sidebar-foreground">MediCare</p>
            <p className="truncate text-[11px] text-sidebar-foreground/60">Clinical Portal</p>
          </div>
        </div>
        <NavList active={navSection} />
        <div className="border-t border-sidebar-border p-3">
          <DoctorIdentity name={name} specialty={specialty} onLogout={onLogout} />
        </div>
      </aside>

      <div className={cn('flex min-w-0 flex-1 flex-col', section === 'ai' ? 'h-dvh overflow-hidden' : 'min-h-screen')}>
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-3 sm:gap-4 sm:px-5">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
              <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
                <SheetTitle className="sr-only">Doctor navigation</SheetTitle>
                <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
                  <Hospital className="size-5 text-teal-100" aria-hidden />
                  <span className="font-semibold">MediCare</span>
                </div>
                <NavList active={navSection} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="w-[11.5rem] shrink-0 leading-tight sm:w-[13.5rem]">
              <p className="truncate text-[15px] font-semibold text-foreground">{TITLES[titleKey]}</p>
              <p className="truncate text-[11px] text-muted-foreground">{SUBTITLES[titleKey]}</p>
            </div>

            <div className="relative min-w-[12rem] flex-1">
              <div className="relative mx-auto w-full max-w-xl">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search patients, MRN, phone..."
                  className="h-10 rounded-lg border-border bg-muted/40 pl-9 shadow-none"
                  aria-label="Search patients"
                />
                {section !== 'patients' && hits.length > 0 ? (
                  <ul className="absolute top-12 z-30 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
                    {hits.map((patient) => (
                      <li key={patient.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            setQuery('')
                            navigate(`/doctor/patients/${patient.id}`)
                          }}
                        >
                          <span className="font-medium">{patient.fullName}</span>
                          <span className="text-xs text-muted-foreground">{patient.patientId}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span className="hidden items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground lg:inline-flex">
                <CalendarDays className="size-3.5" aria-hidden />
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
              <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-lg border-border bg-background px-3 text-foreground shadow-none hover:bg-muted" onClick={() => navigate('/doctor/ai')}>
                <Bot className="size-3.5" />
                <span className="hidden sm:inline">Ask Co-Pilot</span>
              </Button>
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative size-9" aria-label="Notifications">
                    <Bell className="size-4" />
                    {incoming.length > 0 ? (
                      <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-rose-500 ring-2 ring-background" />
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Referrals</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {incoming.length === 0 ? (
                    <DropdownMenuItem disabled>No new referrals</DropdownMenuItem>
                  ) : incoming.map((referral) => (
                    <DropdownMenuItem key={referral.id} onClick={() => navigate('/doctor/referrals')}>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">New Patient Referral</span>
                        <span className="text-xs text-muted-foreground">
                          {referral.referringDoctor?.name ?? 'A doctor'} referred {referral.patient?.fullName ?? 'a patient'} to you.
                        </span>
                        <span className="text-xs font-medium text-teal-700 dark:text-teal-300">View</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white"
                    aria-label="Account menu"
                  >
                    {initials(name)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{name}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate('/doctor/profile')}>Profile</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout}>
                    <LogOut className="size-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className={cn(
          'flex-1 bg-[radial-gradient(circle,rgba(11,52,48,0.07)_1px,transparent_1px)] bg-[size:22px_22px]',
          section === 'ai' ? 'flex min-h-0 flex-col overflow-hidden' : 'p-4 sm:p-6',
        )}>
          {children}
        </main>

        {section === 'ai' ? null : (
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-2.5 text-[11px] text-muted-foreground sm:px-6">
            <span>
              MediCare Clinical Portal · v1.0 · For clinical use
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3" aria-hidden /> {section === 'patients' ? 'HIPAA ready · Encrypted' : 'HIPAA-aligned · Encrypted'}
            </span>
            <span>Need help? Contact IT</span>
          </footer>
        )}
      </div>
    </div>
  )
}
