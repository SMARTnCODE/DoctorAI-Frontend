'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { JoinGoogleMeetButton } from '@/components/hospital/clinical/join-google-meet-button'
import { RescheduleTelehealthDialog } from '@/components/hospital/clinical/reschedule-telehealth-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/components/hospital/auth-context'
import { ApiError } from '@/lib/api-client'
import { handlePatientAuthError } from '@/lib/patient-api-error'
import {
  cancelFailureMessage,
  formatTelehealthDate,
  formatTelehealthTime,
  isGoogleMeetLink,
  normalizeTelehealthStatus,
  telehealthErrorMessage,
  telehealthService,
  telehealthStatusLabel,
  type TelehealthAppointment,
} from '@/services/telehealth.service'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  )
}

export function TelehealthAppointmentDialog({
  appointmentId,
  open,
  onOpenChange,
  onChanged,
}: {
  appointmentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: (appointment: TelehealthAppointment) => void
}) {
  const { logout } = useAuth()
  const [appointment, setAppointment] = useState<TelehealthAppointment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!open || !appointmentId) {
      setAppointment(null)
      setError(null)
      setLoading(false)
      setRescheduleOpen(false)
      setConfirmCancel(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const next = await telehealthService.getAppointment(appointmentId)
        if (!cancelled) setAppointment(next)
      } catch (err) {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/doctor/telehealth')) return
        setAppointment(null)
        setError(telehealthErrorMessage(err, 'Appointment could not be found.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, appointmentId, reloadKey, logout])

  async function cancelAppointment() {
    if (!appointment || cancelling) return
    setCancelling(true)
    try {
      const next = await telehealthService.cancel(appointment.id)
      const merged: TelehealthAppointment = {
        ...appointment,
        ...next,
        patientName: next.patientName || appointment.patientName,
        doctorName: next.doctorName || appointment.doctorName,
        doctorSpecialization: next.doctorSpecialization || appointment.doctorSpecialization,
        purpose: next.purpose || appointment.purpose,
        appointmentDate: next.appointmentDate || appointment.appointmentDate,
        appointmentTime: next.appointmentTime || appointment.appointmentTime,
        meetingLink: next.meetingLink || appointment.meetingLink,
        status: 'CANCELLED',
      }
      setAppointment(merged)
      setConfirmCancel(false)
      toast.success('Telehealth appointment cancelled.')
      onChanged(merged)
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/telehealth')) return
      toast.error(err instanceof ApiError ? cancelFailureMessage(err) : cancelFailureMessage(err))
    } finally {
      setCancelling(false)
    }
  }

  const status = normalizeTelehealthStatus(appointment?.status)
  const closed = status === 'CANCELLED' || status === 'COMPLETED'
  const meetLink = isGoogleMeetLink(appointment?.meetingLink) ? appointment.meetingLink : null

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!cancelling) onOpenChange(next) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Telehealth appointment</DialogTitle>
            <DialogDescription>
              Google Meet is opened from the link stored for this appointment.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading appointment...
            </div>
          ) : error ? (
            <div className="space-y-3">
              <p className="text-sm text-rose-600" role="alert">{error}</p>
              <Button type="button" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
                Retry
              </Button>
            </div>
          ) : appointment ? (
            <div className="space-y-3">
              <Row label="Patient" value={appointment.patientName} />
              <Row label="Doctor" value={[appointment.doctorName, appointment.doctorSpecialization].filter(Boolean).join(' · ')} />
              <Row label="Date" value={appointment.appointmentDate ? formatTelehealthDate(appointment.appointmentDate) : '—'} />
              <Row label="Time" value={appointment.appointmentTime ? formatTelehealthTime(appointment.appointmentTime) : '—'} />
              <Row label="Status" value={telehealthStatusLabel(appointment.status)} />
              <Row label="Purpose" value={appointment.purpose || '—'} />
              {status === 'CANCELLED' ? (
                <p className="text-sm text-rose-600" role="alert">This appointment has been cancelled.</p>
              ) : null}
              {meetLink ? (
                <div className="space-y-2 rounded-lg border px-3 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Google Meet</p>
                  <p className="break-all text-xs text-foreground">{meetLink}</p>
                  <JoinGoogleMeetButton
                    meetingLink={meetLink}
                    status={appointment.status}
                    appointmentDate={appointment.appointmentDate}
                    appointmentTime={appointment.appointmentTime}
                    durationMinutes={appointment.durationMinutes}
                  />
                </div>
              ) : (
                <p className="text-sm text-amber-700" role="status">
                  Google Meet link is not available for this appointment.
                </p>
              )}
            </div>
          ) : null}
          {appointment && !loading && !error ? (
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={closed || cancelling}
                onClick={() => setConfirmCancel(true)}
              >
                Cancel appointment
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={closed}
                onClick={() => setRescheduleOpen(true)}
              >
                Reschedule
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
      <RescheduleTelehealthDialog
        appointment={appointment}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        onSaved={(next) => {
          const merged: TelehealthAppointment = {
            ...next,
            patientName: next.patientName || appointment?.patientName || '',
            doctorName: next.doctorName || appointment?.doctorName || '',
            doctorSpecialization: next.doctorSpecialization || appointment?.doctorSpecialization,
            purpose: next.purpose || appointment?.purpose || '',
            appointmentDate: next.appointmentDate || appointment?.appointmentDate || '',
            appointmentTime: next.appointmentTime || appointment?.appointmentTime || '',
            meetingLink: next.meetingLink || appointment?.meetingLink,
          }
          setAppointment(merged)
          onChanged(merged)
        }}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this telehealth appointment?"
        description="The Google Meet link will no longer admit anyone. This cannot be undone from here."
        confirmLabel="Cancel appointment"
        destructive
        processing={cancelling}
        processingLabel="Cancelling…"
        onConfirm={() => { void cancelAppointment() }}
      />
    </>
  )
}
