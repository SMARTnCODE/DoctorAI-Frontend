/**
 * Doctor Google Calendar connection.
 * The frontend only receives an authorization URL. Tokens stay on the backend.
 */
import { ApiError, apiFetch } from '@/lib/api-client'

export interface GoogleCalendarStatus {
  connected: boolean
  googleEmail?: string
  calendarId?: string
}

interface GoogleAuthStart {
  success?: boolean
  authorizationUrl?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function readConnected(source: Record<string, unknown>): boolean {
  const value = source.connected ?? source.is_connected ?? source.isConnected
  return value === true || value === 'true' || value === 1 || value === '1'
}

/** Accepts the unwrapped status object, including snake_case fields from the API. */
export function mapGoogleCalendarStatus(value: unknown): GoogleCalendarStatus {
  const source = asRecord(value) ?? {}
  const nested = asRecord(source.data) ?? source
  return {
    connected: readConnected(nested),
    googleEmail: pickString(nested, 'google_email', 'googleEmail', 'email'),
    calendarId: pickString(nested, 'calendar_id', 'calendarId'),
  }
}

/** The backend returns the Google authorization URL. This client never builds one. */
export function mapGoogleAuthorizationUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const source = asRecord(value) ?? {}
  const nested = asRecord(source.data) ?? source
  return pickString(nested, 'authorization_url', 'authorizationUrl', 'auth_url', 'authUrl', 'url')
    ?? pickString(source, 'authorization_url', 'authorizationUrl', 'auth_url', 'authUrl', 'url')
}

export const googleCalendarService = {
  async status() {
    return mapGoogleCalendarStatus(await apiFetch<unknown>('/api/google/status'))
  },

  async startAuth(): Promise<GoogleAuthStart> {
    const data = await apiFetch<unknown>('/api/google/auth')
    return { authorizationUrl: mapGoogleAuthorizationUrl(data) }
  },

  disconnect() {
    return apiFetch<{ success?: boolean; connected?: boolean }>('/api/google/disconnect', {
      method: 'POST',
    })
  },
}

export function googleCalendarErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your DoctorAI session has expired. Please log in again.'
    if (error.status === 0) return 'Unable to connect to DoctorAI server.'
  }
  return 'Unable to connect Google Calendar. Please try again.'
}
