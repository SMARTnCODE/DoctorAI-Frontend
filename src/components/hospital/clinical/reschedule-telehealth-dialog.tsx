'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AvailabilitySlotPicker } from '@/components/hospital/clinical/availability-slot-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/components/hospital/auth-context'
import { handlePatientAuthError } from '@/lib/patient-api-error'
import { todayLocalISO } from '@/lib/format'
import {
  closeElapsedSlots,
  isSlotUnavailableError,
  releaseBookedSlot,
  rescheduleFailureMessage,
  telehealthService,
  type DoctorAvailabilitySlot,
  type TelehealthAppointment,
} from '@/services/telehealth.service'

const SAVE_BUTTON = 'bg-[#b7e4c7] text-[#0b3430] hover:bg-[#a4dbb8]'

function parseIsoDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function toIsoDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function formatVisitDate(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function RescheduleTelehealthDialog({
  appointment,
  open,
  onOpenChange,
  onSaved,
}: {
  appointment: TelehealthAppointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (result: TelehealthAppointment) => void
}) {
  const { logout } = useAuth()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [availabilitySlots, setAvailabilitySlots] = useState<DoctorAvailabilitySlot[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [availabilityReload, setAvailabilityReload] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setDate('')
      setTime('')
      setCalendarOpen(false)
      setAvailabilitySlots([])
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      setAvailabilityReload(0)
      setErrors({})
      submittingRef.current = false
      setSubmitting(false)
      return
    }
    const initialDate = appointment?.appointmentDate ?? ''
    const today = todayLocalISO()
    setDate(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) && initialDate >= today ? initialDate : '')
    setTime('')
    setCalendarOpen(false)
    setAvailabilitySlots([])
    setAvailabilityLoading(false)
    setAvailabilityError(null)
    setAvailabilityReload(0)
    setErrors({})
    submittingRef.current = false
    setSubmitting(false)
  }, [open, appointment])

  useEffect(() => {
    if (!open || !appointment?.doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAvailabilitySlots([])
      setAvailabilityLoading(false)
      setAvailabilityError(null)
      return
    }
    let cancelled = false
    setAvailabilitySlots([])
    setAvailabilityLoading(true)
    setAvailabilityError(null)
    const releaseTime = date === appointment.appointmentDate ? appointment.appointmentTime : ''
    void (async () => {
      try {
        const result = await telehealthService.getDoctorAvailability(appointment.doctorId, date, {
          appointmentId: appointment.id,
        })
        if (!cancelled) {
          setAvailabilitySlots(closeElapsedSlots(releaseBookedSlot(result.slots, releaseTime), date))
        }
      } catch (error) {
        if (cancelled) return
        if (await handlePatientAuthError(error, logout, '/doctor/telehealth')) return
        if (cancelled) return
        setAvailabilitySlots([])
        setAvailabilityError('Unable to load doctor availability. Please try again.')
      } finally {
        if (!cancelled) setAvailabilityLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, appointment, date, availabilityReload, logout])

  useEffect(() => {
    if (!open || availabilityLoading || !time || availabilitySlots.length === 0) return
    const stillOpen = availabilitySlots.some((slot) => slot.startTime === time && slot.status === 'AVAILABLE')
    if (!stillOpen) setTime('')
  }, [open, availabilityLoading, availabilitySlots, time])

  async function save() {
    if (submittingRef.current || !appointment || availabilityLoading) return
    submittingRef.current = true
    const next: Record<string, string> = {}
    const today = todayLocalISO()
    if (!date) next.date = 'Date is required for telehealth appointments.'
    else if (date < today) next.date = 'Choose today or a future date.'
    if (!time) next.time = 'Time is required for telehealth appointments.'
    else if (!availabilitySlots.some((slot) => slot.startTime === time && slot.status === 'AVAILABLE')) {
      next.time = 'Please select an available appointment time.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) {
      submittingRef.current = false
      return
    }
    setSubmitting(true)
    try {
      const saved = await telehealthService.reschedule(appointment.id, {
        appointmentDate: date,
        appointmentTime: time,
      })
      toast.success('Telehealth appointment rescheduled successfully.')
      onOpenChange(false)
      onSaved(saved)
    } catch (error) {
      if (await handlePatientAuthError(error, logout, '/doctor/telehealth')) return
      const message = rescheduleFailureMessage(error)
      if (isSlotUnavailableError(error)) {
        setTime('')
        setAvailabilityReload((value) => value + 1)
        setErrors({ time: message })
        toast.error(message)
        return
      }
      if (message === 'Please select a future time.') setErrors({ time: message })
      toast.error(message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const timeReady = availabilitySlots.some((slot) => slot.startTime === time && slot.status === 'AVAILABLE')
  const canSave = Boolean(date) && timeReady && !availabilityLoading && !submitting

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule Telehealth Consultation</DialogTitle>
          <DialogDescription>
            Choose a new date and time. The patient and doctor will receive an updated email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Date <span className="text-rose-600">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-start px-3 text-left font-normal shadow-none"
              aria-label="Date"
              onClick={() => setCalendarOpen((current) => !current)}
            >
              <CalendarDays className="mr-2 size-3.5 text-muted-foreground" aria-hidden />
              {date ? formatVisitDate(date) : 'Select date'}
            </Button>
            {errors.date ? <p className="text-xs text-rose-600">{errors.date}</p> : null}
          </div>
          {calendarOpen ? (
            <div className="rounded-md border bg-popover shadow-sm">
              <Calendar
                mode="single"
                selected={date ? parseIsoDate(date) ?? undefined : undefined}
                onSelect={(picked) => {
                  if (!picked) return
                  const today = startOfToday()
                  const pickedDay = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate())
                  if (pickedDay < today) return
                  setDate(toIsoDate(picked))
                  setTime('')
                  setAvailabilitySlots([])
                  setAvailabilityError(null)
                  setAvailabilityLoading(true)
                  setCalendarOpen(false)
                  setErrors((current) => ({ ...current, date: '', time: '' }))
                }}
                disabled={{ before: startOfToday() }}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Time <span className="text-rose-600">*</span>
            </Label>
            <AvailabilitySlotPicker
              slots={availabilitySlots}
              loading={availabilityLoading}
              error={availabilityError}
              selectedTime={time}
              date={date}
              ready={Boolean(appointment?.doctorId) && /^\d{4}-\d{2}-\d{2}$/.test(date)}
              onRetry={() => setAvailabilityReload((value) => value + 1)}
              onSelect={(startTime) => {
                setTime(startTime)
                setErrors((current) => ({ ...current, time: '' }))
              }}
            />
            {errors.time ? <p className="text-xs text-rose-600">{errors.time}</p> : null}
          </div>
          <div className="grid gap-3 rounded-lg border px-3 py-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Doctor</p>
              <p className="text-sm font-medium">{appointment?.doctorName || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Specialization</p>
              <p className="text-sm">{appointment?.doctorSpecialization || '—'}</p>
            </div>
          </div>
          <div className="rounded-lg border px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Purpose</p>
            <p>{appointment?.purpose || '—'}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className={SAVE_BUTTON}
            disabled={!canSave}
            aria-busy={submitting}
            onClick={() => { void save() }}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {submitting ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
