'use client'

import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { DoctorShell, type DoctorSection } from '@/components/hospital/clinical/doctor-shell'
import { DoctorDashboardView } from '@/components/hospital/clinical/dashboard-view'
import { InpatientsView, OpdView, TelehealthView } from '@/components/hospital/clinical/queue-views'
import { PatientsView } from '@/components/hospital/clinical/patients-directory-view'
import { PatientDetailView } from '@/components/hospital/clinical/patient-detail-view'
import { ReferralsView } from '@/components/hospital/clinical/referrals-view'
import { AiWorkspaceView } from '@/components/hospital/clinical/ai-workspace-view'
import { useDoctorAuth } from '@/components/hospital/doctor-auth-context'
import { DoctorAccountPanel, DoctorForcedPasswordReset } from '@/components/hospital/doctor-portal'
import { navigate } from '@/lib/hash-nav'

export function DoctorClinicalPortal({
  section,
  patientId,
}: {
  section: DoctorSection
  patientId?: string
}) {
  const { status, user, mustChangePassword, logout } = useDoctorAuth()

  useEffect(() => {
    if (status === 'unauthenticated') navigate('/doctor/login')
  }, [status])

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="size-8 animate-spin text-teal-600" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {status === 'loading' ? 'Loading your portal…' : 'Redirecting to sign-in…'}
        </p>
      </div>
    )
  }

  if (mustChangePassword) {
    return (
      <div className="mx-auto min-h-screen w-full max-w-3xl p-4 sm:p-6">
        <DoctorForcedPasswordReset />
      </div>
    )
  }

  async function handleLogout() {
    await logout()
    navigate('/doctor/login')
  }

  return (
    <DoctorShell section={section} patientId={patientId} name={user.name} specialty={user.designation} onLogout={handleLogout}>
      {section === 'dashboard' ? <DoctorDashboardView /> : null}
      {section === 'inpatients' ? <InpatientsView /> : null}
      {section === 'opd' ? <OpdView /> : null}
      {section === 'telehealth' ? <TelehealthView /> : null}
      {section === 'patients' ? <PatientsView /> : null}
      {section === 'patient' && patientId ? <PatientDetailView patientId={patientId} /> : null}
      {section === 'referrals' ? <ReferralsView /> : null}
      {section === 'ai' ? <AiWorkspaceView patientId={patientId} /> : null}
      {section === 'profile' ? <DoctorAccountPanel user={user} /> : null}
    </DoctorShell>
  )
}
