import { toast } from 'sonner'
import { ApiError } from '@/lib/api-client'
import { navigate } from '@/lib/hash-nav'
import { loginPathForArea } from '@/lib/roles'

/** 401 uses the existing session logout, then returns the caller to the right login screen. */
export async function handlePatientAuthError(
  error: unknown,
  logout: () => Promise<void>,
  path: string,
): Promise<boolean> {
  if (!(error instanceof ApiError) || error.status !== 401) return false
  toast.error('Session expired. Please login again.')
  try {
    await logout()
  } catch {
    /* logout already clears storage */
  }
  navigate(loginPathForArea(path))
  return true
}

function errorText(error: ApiError): string {
  const payload = error.payload ? JSON.stringify(error.payload) : ''
  return `${error.message ?? ''} ${payload}`.toLowerCase()
}

export function isAlreadyDischargedError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  const payload = error.payload ? JSON.stringify(error.payload) : ''
  return `${error.message ?? ''} ${payload}`.toLowerCase().includes('already discharged')
}

export function dischargeActionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Unable to discharge patient. Please try again.'
  if (isAlreadyDischargedError(error)) return error.message?.trim() || 'Patient is already discharged.'
  if (error.status === 401) return 'Session expired. Please login again.'
  if (error.status === 403) return 'You are not authorized to perform this action.'
  if (error.status === 404) return error.message?.trim() || 'Patient not found.'
  if (error.status >= 500 || error.status === 0) return 'Unable to discharge patient. Please try again.'
  return error.message?.trim() || 'Unable to discharge patient. Please try again.'
}

export function patientActionErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 401) return 'Session expired. Please login again.'
  if (error.status === 403) return 'You are not authorized to perform this action.'
  if (error.status === 404) return error.message?.trim() || 'Patient not found.'
  if (error.status >= 500 || error.status === 0) return 'Something went wrong. Please try again.'
  return error.message?.trim() || fallback
}

/** 400/422 when the signed-in doctor has no department configured. */
export function patientCreateErrorMessage(error: unknown, fallback = 'Could not add the patient.'): string {
  if (error instanceof ApiError && (error.status === 400 || error.status === 422)) {
    const text = errorText(error)
    if (
      text.includes('doctor department not configured') ||
      text.includes('department is not configured') ||
      text.includes('department not configured')
    ) {
      return 'Your department is not configured. Please contact the hospital administrator.'
    }
    if (
      text.includes('not assigned to a department') ||
      text.includes('no department') ||
      text.includes('department is required') ||
      text.includes('without a department')
    ) {
      return 'Your account is not assigned to a department. Please contact the hospital administrator before adding patients.'
    }
  }
  return patientActionErrorMessage(error, fallback)
}

/** 400/422 when the selected referral doctor has no department. */
export function referralActionErrorMessage(error: unknown, fallback = 'Could not send the referral.'): string {
  if (error instanceof ApiError && (error.status === 400 || error.status === 422)) {
    const text = errorText(error)
    if (
      text.includes('doctor department not configured') ||
      text.includes('your department is not configured') ||
      (text.includes('referring doctor') && text.includes('department'))
    ) {
      return 'Your department is not configured. Please contact the hospital administrator.'
    }
    if (text.includes('department')) {
      return 'This doctor cannot receive referrals because no department is assigned.'
    }
  }
  return patientActionErrorMessage(error, fallback)
}

/** Map a 422 envelope onto form field names (`full_name` and `fullName` both match). */
export function validationFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.payload) return {}
  const errors = error.payload.errors
  if (!Array.isArray(errors)) return {}
  const fields: Record<string, string> = {}
  for (const item of errors) {
    if (!item || typeof item !== 'object') continue
    const msg = 'msg' in item && typeof item.msg === 'string' ? item.msg.replace(/^Value error,\s*/i, '') : ''
    if (!msg) continue
    const loc = 'loc' in item && Array.isArray(item.loc) ? item.loc : []
    const raw = [...loc].reverse().find((part) => typeof part === 'string' && part !== 'body')
    const key = typeof raw === 'string' ? raw : 'form'
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    fields[camel] = msg
    fields[key] = msg
  }
  return fields
}

export function recordAccessMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    return 'Patient not found or you are not authorized to access this patient.'
  }
  if (error instanceof ApiError && error.status === 401) return 'Session expired. Please login again.'
  if (error instanceof ApiError && (error.status >= 500 || error.status === 0)) {
    return 'Something went wrong. Please try again.'
  }
  return patientActionErrorMessage(error)
}
