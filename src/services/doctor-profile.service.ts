/**
 * Doctor self-service profile API — /api/doctor/profile
 */
import { apiFetch } from '@/lib/api-client'

export interface DoctorProfileUpdatePayload {
  [key: string]: unknown
}

export const doctorProfileService = {
  get() {
    return apiFetch<unknown>('/api/doctor/profile')
  },

  update(payload: DoctorProfileUpdatePayload) {
    return apiFetch<unknown>('/api/doctor/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
}
