'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DOCTORS } from '@/components/hospital/clinical/clinical-data'
import { useAuth } from '@/components/hospital/auth-context'
import { handlePatientAuthError, patientActionErrorMessage } from '@/lib/patient-api-error'
import { patientsService, type ReferralDoctorOption } from '@/services/patients.service'

function sampleDoctors(search: string, actorName: string): ReferralDoctorOption[] {
  const query = search.trim().toLowerCase()
  return DOCTORS
    .filter((doctor) => {
      const plain = doctor.name.replace(/^Dr\.?\s*/, '').toLowerCase()
      if (actorName && (plain === actorName || doctor.name.toLowerCase() === actorName)) return false
      return !query || doctor.name.toLowerCase().includes(query) || doctor.specialty.toLowerCase().includes(query)
    })
    .map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      department: { id: doctor.id, name: doctor.specialty },
      specialization: doctor.specialty,
      specializations: [doctor.specialty],
    }))
}

export function useReferralDoctors(open: boolean, search: string) {
  const { logout, userId, doctorProfile } = useAuth()
  const actorId = doctorProfile?.id || userId
  const actorName = doctorProfile?.name?.replace(/^Dr\.?\s*/, '').trim().toLowerCase() ?? ''
  const [doctors, setDoctors] = useState<ReferralDoctorOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    patientsService.getReferralDoctors({
      search: search.trim() || undefined,
      page: 1,
      pageSize: 20,
    })
      .then((result) => {
        if (cancelled) return
        const live = result.items.filter((doctor) => doctor.id !== actorId)
        setDoctors(live.length > 0 ? live : sampleDoctors(search, actorName).filter((doctor) => doctor.id !== actorId))
      })
      .catch(async (error) => {
        if (cancelled) return
        if (await handlePatientAuthError(error, logout, '/doctor/patients')) return
        setDoctors(sampleDoctors(search, actorName))
        if (search.trim()) toast.error(patientActionErrorMessage(error, 'Could not load doctors.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, search, logout, actorId, actorName])

  return { doctors, loading }
}
