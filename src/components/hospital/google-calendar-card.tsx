'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { useDoctorAuth } from '@/components/hospital/doctor-auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api-client'
import { currentHashQuery, navigate, replaceHashQuery } from '@/lib/hash-nav'
import {
  googleCalendarErrorMessage,
  googleCalendarService,
  type GoogleCalendarStatus,
} from '@/services/google-calendar.service'

function isGoogleAuthorizationUrl(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith('https://accounts.google.com/')
}

export function GoogleCalendarCard() {
  const { logout } = useDoctorAuth()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const announced = useRef(false)

  async function expireSession() {
    toast.error('Your DoctorAI session has expired. Please log in again.')
    try {
      await logout()
    } catch {
      /* logout already clears the DoctorAI session */
    }
    navigate('/doctor/login')
  }

  async function refreshStatus() {
    setLoading(true)
    setLoadError(null)
    try {
      const next = await googleCalendarService.status()
      setStatus(next?.connected ? next : { connected: false })
    } catch (error) {
      setStatus(null)
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
        return
      }
      setLoadError(googleCalendarErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const params = currentHashQuery()
    const flag = params.get('google')
    if (flag && !announced.current) {
      announced.current = true
      if (flag === 'connected') toast.success('Google Calendar connected successfully.')
      else if (flag === 'error') toast.error('Unable to connect Google Calendar. Please try again.')
      params.delete('google')
      replaceHashQuery(params.toString() ? params : null)
    }
    void refreshStatus()
    // The OAuth return is read once when settings opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function connect() {
    if (connecting) return
    setConnecting(true)
    try {
      const result = await googleCalendarService.startAuth()
      const authorizationUrl = result?.authorizationUrl
      if (!isGoogleAuthorizationUrl(authorizationUrl)) {
        toast.error('Unable to connect Google Calendar. Please try again.')
        setConnecting(false)
        return
      }
      window.location.href = authorizationUrl
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await expireSession()
        return
      }
      toast.error(googleCalendarErrorMessage(error))
      setConnecting(false)
    }
  }

  async function disconnect() {
    if (disconnecting) return
    setDisconnecting(true)
    try {
      await googleCalendarService.disconnect()
      toast.success('Google Calendar disconnected successfully.')
      setConfirmOpen(false)
      await refreshStatus()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setConfirmOpen(false)
        await expireSession()
        return
      }
      toast.error(googleCalendarErrorMessage(error))
    } finally {
      setDisconnecting(false)
    }
  }

  const connected = status?.connected === true

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
          Google Calendar
        </CardTitle>
        <CardDescription>
          Connect your own Google account so Telehealth appointments can create a Google Meet link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-52" />
          </div>
        ) : loadError ? (
          <div className="space-y-3">
            <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{loadError}</p>
            <Button type="button" variant="outline" onClick={() => void refreshStatus()}>
              Retry
            </Button>
          </div>
        ) : connected ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Status</p>
              <p className="mt-1 text-sm font-semibold text-foreground">Connected</p>
              <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Connected Google email</p>
              <p className="mt-1 text-sm text-foreground">{status?.googleEmail || '—'}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={disconnecting}
            >
              Disconnect Google Calendar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Status</p>
              <p className="mt-1 text-sm font-semibold text-foreground">Not Connected</p>
            </div>
            <Button
              type="button"
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void connect()}
              disabled={connecting}
            >
              {connecting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
              {connecting ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Disconnect Google Calendar?"
        description="Telehealth appointments already scheduled will stay in DoctorAI. New Telehealth visits need Google Calendar connected again."
        confirmLabel="Disconnect Google Calendar"
        destructive
        processing={disconnecting}
        processingLabel="Disconnecting…"
        onConfirm={() => void disconnect()}
      />
    </Card>
  )
}
