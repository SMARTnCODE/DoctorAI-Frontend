'use client'

/**
 * Suspend Doctor — Super Admin employment suspension (Task 26, spec §8).
 *
 * Sets the doctor's employment status to SUSPENDED and disables portal login
 * (POST /api/doctors/{id}/suspend). The suspension is reversible via the
 * "Lift Suspension" action, so this dialog closes normally (Escape/outside
 * click allowed). Reason is mandatory (5–500 chars) so the audit trail always
 * carries a human justification; the end date is optional (open-ended).
 */
import { useEffect, useState } from 'react'
import { AlertTriangle, Ban, Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { doctorActionError, doctorsService, usableDoctorId } from '@/services/doctors.service'
import { navigate } from '@/lib/hash-nav'
import { todayLocalISO } from '@/lib/format'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface SuspendDoctorRef {
  id: string
  doctorId: string
  firstName: string
  lastName: string
}

export function SuspendDoctorDialog({
  doctor, open, onOpenChange, onDone,
}: {
  doctor: SuspendDoctorRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}) {
  const [reason, setReason] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<{ reason?: string; dates?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  const fullName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''

  // Fresh form every time the dialog opens — suspension starts today by default.
  useEffect(() => {
    if (!open) return
    setReason('')
    setStartDate(todayLocalISO())
    setEndDate('')
    setNotes('')
    setErrors({})
    setSubmitting(false)
  }, [open])

  const validate = (): { reason?: string; dates?: string } => {
    const next: { reason?: string; dates?: string } = {}
    const trimmed = reason.trim()
    if (trimmed.length < 5) next.reason = 'Suspension reason is required (5–500 characters).'
    else if (trimmed.length > 500) next.reason = 'Suspension reason must be at most 500 characters.'
    if (!startDate) next.dates = 'Start date is required.'
    else if (endDate && endDate < startDate) next.dates = 'End date cannot be before the start date.'
    return next
  }

  const handleSubmit = async () => {
    if (!doctor || submitting) return
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setSubmitting(true)
    const doctorId = usableDoctorId(doctor.id)
    if (!doctorId) {
      toast.error('Missing doctor id.')
      setSubmitting(false)
      return
    }
    try {
      await doctorsService.suspend(doctorId, { reason: reason.trim() })
      toast.success('Doctor suspended successfully.')
      onDone?.()
      onOpenChange(false)
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        toast.error('Session expired. Please sign in again.')
        navigate('/super-admin/login')
        return
      }
      toast.error(doctorActionError(e, 'Could not suspend the doctor. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting || next) onOpenChange(next) }}>
      <DialogContent className="hms-scroll max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
            Suspend Doctor
          </DialogTitle>
          <DialogDescription>
            Temporarily suspend {fullName}&apos;s employment and block portal access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Doctor header */}
          <div className="rounded-lg border bg-slate-50 p-3 text-sm dark:bg-white/5">
            <p className="font-medium text-slate-800 dark:text-slate-100">{fullName}</p>
            <p className="font-mono text-xs text-muted-foreground">{doctor?.doctorId}</p>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason">
              Suspension Reason <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
            </Label>
            <Textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Under investigation pending a formal review…"
              maxLength={500}
              aria-required="true"
              aria-invalid={Boolean(errors.reason)}
            />
            {errors.reason ? (
              <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">{errors.reason}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Required — 5 to 500 characters. Recorded in the audit trail.</p>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="suspend-start">
                Start Date <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Input
                id="suspend-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suspend-end">End Date</Label>
              <Input
                id="suspend-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
              />
            </div>
          </div>
          {errors.dates ? (
            <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">{errors.dates}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Leave the end date empty for an open-ended suspension.</p>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="suspend-notes">Additional Notes</Label>
            <Textarea
              id="suspend-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional context for other Super Admins…"
              maxLength={500}
            />
          </div>

          {/* Warning box */}
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              While suspended: portal login is blocked · the doctor cannot receive new patients or
              shifts · all historical records remain intact.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-amber-600 text-white hover:bg-amber-700"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Suspending…
              </>
            ) : (
              <>
                <Ban className="size-4" aria-hidden /> Suspend Doctor
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
