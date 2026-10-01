'use client'

/**
 * Hospital Super Admin Portal — root single-page application.
 *
 * The sandbox preview exposes only the `/` route, so the portal lives here and
 * uses hash navigation that mirrors the spec URLs:
 *   #/super-admin/login, #/super-admin/dashboard, #/super-admin/doctors, ...
 *
 * Authorization flow:
 *   - Session role comes from the login API (super_admin or doctor).
 *   - /super-admin/* is Super Admin only. /doctor/* is Doctor only.
 *   - A signed-in user who opens the other portal is sent to their own dashboard.
 *   - Every underlying API re-validates the role server-side.
 */
import { useEffect, useMemo, useState } from 'react'
import { Hospital } from 'lucide-react'
import { ThemeProvider, useTheme } from 'next-themes'
import { AuthProvider, useAuth } from '@/components/hospital/auth-context'
import { LoginPage } from '@/components/hospital/login-page'
import { DoctorLoginPage } from '@/components/hospital/doctor-login-page'
import { SignupPage } from '@/components/hospital/signup-page'
import { AdminShell } from '@/components/hospital/admin-shell'
import { DoctorClinicalPortal } from '@/components/hospital/clinical/doctor-clinical-portal'
import { TelehealthMeetingPage } from '@/components/hospital/clinical/telehealth-meeting-page'
import { ProtectedRoute, RedirectTo } from '@/components/hospital/protected-route'
import { currentHashPath } from '@/lib/hash-nav'
import { resolveAuthDestination } from '@/lib/auth-routing'
import { USER_ROLES } from '@/lib/roles'

import DashboardPage from '@/components/hospital/pages/dashboard-page'
import DoctorsPage from '@/components/hospital/pages/doctors-page'
import DoctorFormPage from '@/components/hospital/pages/doctor-form-page'
import DoctorProfilePage from '@/components/hospital/pages/doctor-profile-page'
import SpecializationsPage from '@/components/hospital/pages/specializations-page'
import DepartmentsPage from '@/components/hospital/pages/departments-page'
import PatientsPage from '@/components/hospital/pages/patients-page'
import PatientDetailPage from '@/components/hospital/pages/patient-detail-page'
import VisitsPage from '@/components/hospital/pages/visits-page'
import ShiftsPage from '@/components/hospital/pages/shifts-page'
import AuditLogsPage from '@/components/hospital/pages/audit-logs-page'
import SettingsPage from '@/components/hospital/pages/settings-page'

/** Browser/OS chrome color follows the active theme (PWA + mobile address bar). */
const THEME_COLOR = {
  light: '#0d9488', // teal-600 brand bar
  dark: '#0e161b', // ≈ .dark --background oklch(0.17 0.013 235)
} as const

function ThemeColorSync() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    if (!resolvedTheme) return
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', THEME_COLOR[resolvedTheme === 'dark' ? 'dark' : 'light'])
  }, [resolvedTheme])
  return null
}

function Splash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex size-14 animate-pulse items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
        <Hospital className="size-7 text-white" aria-hidden />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

/** Pure route resolver (no hooks) — returns the view for a hash path. */
function resolveView(path: string): { title: string; node: React.ReactNode } | null {
  const segments = path.split('/').filter(Boolean) // e.g. ['super-admin','doctors','abc','edit']
  if (segments[0] !== 'super-admin' || !segments[1]) return null
  const section = segments[1]
  const rest = segments.slice(2)

  switch (section) {
    case 'dashboard':
      return { title: 'Dashboard', node: <DashboardPage /> }
    case 'doctors':
      if (rest.length === 0) return { title: 'Doctors', node: <DoctorsPage /> }
      if (rest[0] === 'new') return { title: 'Add Doctor', node: <DoctorFormPage mode="create" /> }
      if (rest.length === 1) return { title: 'Doctor Profile', node: <DoctorProfilePage doctorId={rest[0]} /> }
      if (rest.length === 2 && rest[1] === 'edit')
        return { title: 'Edit Doctor', node: <DoctorFormPage mode="edit" doctorId={rest[0]} /> }
      return null
    case 'specializations':
      return { title: 'Specializations', node: <SpecializationsPage /> }
    case 'departments':
      return { title: 'Departments', node: <DepartmentsPage /> }
    case 'patients':
      if (rest.length === 0) return { title: 'Patients', node: <PatientsPage /> }
      if (rest.length === 1) return { title: 'Patient Record', node: <PatientDetailPage patientId={rest[0]} /> }
      return null
    case 'visits':
      return { title: 'Visits', node: <VisitsPage /> }
    case 'shifts':
      return { title: 'Doctor Shifts', node: <ShiftsPage /> }
    case 'audit-logs':
      return { title: 'Audit Logs', node: <AuditLogsPage /> }
    case 'settings':
      return { title: 'Settings', node: <SettingsPage /> }
    default:
      return null
  }
}

/** Doctor clinical portal — pages from the MediCare doctor prototype. */
function resolveDoctorView(path: string): { title: string; node: React.ReactNode } | null {
  const segments = path.split('/').filter(Boolean)
  if (segments[0] !== 'doctor' || !segments[1]) return null
  const section = segments[1]
  const patientId = segments[2]

  if (section === 'dashboard') return { title: 'Dashboard', node: <DoctorClinicalPortal section="dashboard" /> }
  if (section === 'inpatients') return { title: 'In-Hospital', node: <DoctorClinicalPortal section="inpatients" /> }
  if (section === 'opd') return { title: 'OPD Patients', node: <DoctorClinicalPortal section="opd" /> }
  if (section === 'telehealth') return { title: 'Telehealth', node: <DoctorClinicalPortal section="telehealth" /> }
  if (section === 'patients' && patientId) return { title: 'Patient Record', node: <DoctorClinicalPortal section="patient" patientId={patientId} /> }
  if (section === 'patients') return { title: 'Patients', node: <DoctorClinicalPortal section="patients" /> }
  if (section === 'referrals') return { title: 'Referrals', node: <DoctorClinicalPortal section="referrals" /> }
  if (section === 'ai') return { title: 'AI Co-Pilot', node: <DoctorClinicalPortal section="ai" patientId={patientId} /> }
  if (section === 'profile') return { title: 'Profile', node: <DoctorClinicalPortal section="profile" /> }
  return null
}

function Router() {
  const { status, role } = useAuth()
  const [path, setPath] = useState<string>('')
  const [logoutReason, setLogoutReason] = useState<string | undefined>(undefined)

  useEffect(() => {
    const sync = () => setPath(currentHashPath())
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // Surface auto-logout reason on the login screen
  useEffect(() => {
    const onExpired = () => setLogoutReason('Your session expired due to inactivity. Please sign in again.')
    const onManual = () => setLogoutReason(undefined)
    window.addEventListener('hms-session-expired', onExpired)
    window.addEventListener('hms-login', onManual)
    return () => {
      window.removeEventListener('hms-session-expired', onExpired)
      window.removeEventListener('hms-login', onManual)
    }
  }, [])

  const destination = resolveAuthDestination({ status, role, path })

  if (destination.kind === 'splash') return <Splash label="Verifying secure session…" />
  if (destination.kind === 'redirect') return <RedirectTo target={destination.to} />
  if (destination.kind === 'signup') return <SignupPage />
  if (destination.kind === 'doctor-login') return <DoctorLoginPage reason={logoutReason} />
  if (destination.kind === 'super-admin-login') return <LoginPage reason={logoutReason} />

  if (destination.kind === 'doctor') {
    if (path.startsWith('/telehealth/')) {
      const token = decodeURIComponent((path.slice('/telehealth/'.length).split('/')[0] ?? '').trim())
      if (!token) return <RedirectTo target="/doctor/telehealth" />
      return (
        <ProtectedRoute allowedRoles={[USER_ROLES.DOCTOR]} path={path}>
          <TitleSync title="Telehealth" portal="doctor" />
          <TelehealthMeetingPage meetingToken={token} />
        </ProtectedRoute>
      )
    }
    const view = resolveDoctorView(path)
    if (!view) return <RedirectTo target="/doctor/dashboard" />
    return (
      <ProtectedRoute allowedRoles={[USER_ROLES.DOCTOR]} path={path}>
        <TitleSync title={view.title} portal="doctor" />
        {view.node}
      </ProtectedRoute>
    )
  }

  const view = resolveView(path)
  if (!view) return <RedirectTo target="/super-admin/dashboard" />

  return (
    <ProtectedRoute allowedRoles={[USER_ROLES.SUPER_ADMIN]} path={path}>
      <TitleSync title={view.title} portal="super-admin" />
      <AdminShell activePath={'/super-admin/' + (path.split('/').filter(Boolean)[1] ?? '')} title={view.title} viewKey={path}>
        {view.node}
      </AdminShell>
    </ProtectedRoute>
  )
}

function TitleSync({ title, portal }: { title: string; portal: 'super-admin' | 'doctor' }) {
  useEffect(() => {
    document.title = portal === 'doctor'
      ? `${title} · Doctor Portal`
      : `${title} · Hospital Super Admin`
  }, [title, portal])
  return null
}

export default function HospitalApp() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeColorSync />
      <AuthProvider>
        <Router />
      </AuthProvider>
    </ThemeProvider>
  )
}
