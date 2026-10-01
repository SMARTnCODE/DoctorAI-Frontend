'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Loader2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/hospital/auth-context'
import { handlePatientAuthError } from '@/lib/patient-api-error'
import { navigate } from '@/lib/hash-nav'
import {
  formatTelehealthDate,
  formatTelehealthTime,
  isGoogleMeetLink,
  openGoogleMeet,
  telehealthErrorMessage,
  telehealthJoinBlockReason,
  telehealthService,
  type TelehealthMeeting,
} from '@/services/telehealth.service'

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm font-medium">{value || '—'}</p>
    </div>
  )
}

export function TelehealthMeetingPage({ meetingToken }: { meetingToken: string }) {
  const { logout, doctorProfile, userId } = useAuth()
  const [meeting, setMeeting] = useState<TelehealthMeeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = meetingToken.trim()
    if (!token) {
      setLoading(false)
      setError('Meeting link is not available for this appointment.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    telehealthService.validateMeeting(token)
      .then((result) => {
        if (cancelled) return
        const actorId = doctorProfile?.id || ''
        const allowed = [actorId, userId, doctorProfile?.doctorId].filter((value): value is string => Boolean(value))
        if (!result.doctorId || (allowed.length > 0 && !allowed.includes(result.doctorId))) {
          setMeeting(null)
          setError('You are not authorized to open this consultation.')
          return
        }
        setMeeting(result)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/doctor/telehealth')) return
        setMeeting(null)
        setError(telehealthErrorMessage(err, 'This consultation could not be verified.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [meetingToken, logout, doctorProfile?.id, userId])

  const meetLink = isGoogleMeetLink(meeting?.meetingLink) ? meeting.meetingLink : null
  const joinReason = meeting
    ? telehealthJoinBlockReason({
      status: meeting.status,
      meetingLink: meeting.meetingLink,
      appointmentDate: meeting.appointmentDate,
      appointmentTime: meeting.appointmentTime,
    })
    : null

  function joinMeet() {
    if (!meetLink) {
      toast.error(joinReason ?? 'Google Meet link is not available for this appointment.')
      return
    }
    if (!openGoogleMeet(meetLink)) {
      toast.error('Google Meet link is not available for this appointment.')
    }
  }

  const when = meeting
    ? [formatTelehealthDate(meeting.appointmentDate), formatTelehealthTime(meeting.appointmentTime)].filter((part) => part && part !== '—').join(' · ')
    : ''

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <header className="space-y-1 text-center">
          <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">DoctorAI Telehealth</p>
          <h1 className="text-xl font-semibold tracking-tight">Virtual consultation</h1>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Verifying this consultation...
          </div>
        ) : error ? (
          <div className="space-y-4 rounded-xl border bg-card px-4 py-6 text-center">
            <p className="text-sm text-rose-700" role="alert">{error}</p>
            <Button type="button" variant="outline" onClick={() => navigate('/doctor/telehealth')}>
              Back to virtual consultations
            </Button>
          </div>
        ) : meeting ? (
          <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <Detail label="Patient" value={meeting.patientName} />
              <Detail label="Age" value={meeting.patientAge != null ? String(meeting.patientAge) : '—'} />
              <Detail label="Purpose" value={meeting.purpose || '—'} />
              <Detail label="Doctor" value={meeting.doctorName || '—'} />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <CalendarDays className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Scheduled</p>
                <p className="font-medium">{when || '—'}</p>
              </div>
            </div>
            {joinReason ? (
              <p className="text-sm text-rose-700" role="alert">{joinReason}</p>
            ) : null}
            {meetLink ? (
              <p className="break-all text-xs text-muted-foreground">{meetLink}</p>
            ) : (
              <p className="text-sm text-amber-800" role="status">Google Meet link is not available for this appointment.</p>
            )}
            <Button
              type="button"
              className="h-10 w-full gap-2 bg-[#1f7a4d] text-white hover:bg-[#186540]"
              disabled={joinReason != null || !meetLink}
              onClick={joinMeet}
            >
              <Video className="size-4" aria-hidden /> Join Google Meet
            </Button>
          </section>
        ) : null}
      </div>
    </div>
  )
}
