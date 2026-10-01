'use client'

/**
 * Terminate Doctor — permanent employment termination (Task 26, spec §9).
 *
 * Sets the doctor's employment status to TERMINATED and (by default) disables
 * portal login, cancels future shifts and prevents new patient assignments
 * (POST /api/doctors/{id}/terminate). Clinical history is NEVER deleted.
 *
 * Safety rules (mandatory, same discipline as DeleteDoctorDialog):
 * - Radix AlertDialog — never closes on outside click; Escape is prevented so
 *   a half-filled form can never be dismissed accidentally.
 * - Reason is mandatory (5–500 chars) so the audit trail always carries a
 *   human justification; the server independently refuses to re-terminate
 *   (409) and re-checks every rule.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, UserMinus } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { doctorActionError, doctorsService, usableDoctorId } from '@/services/doctors.service'
import { navigate } from '@/lib/hash-nav'
import { todayLocalISO } from '@/lib/format'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export interface TerminateDoctorRef {
  id: string
  doctorId: string
  firstName: string
  lastName: string
  departmentName?: string | null
  specializationNames?: string
  designation?: string | null
}

const TERMINATION_TYPES: { value: string; label: string }[] = [
  { value: 'RESIGNATION', label: 'Resignation' },
  { value: 'CONTRACT_COMPLETED', label: 'Contract Completed' },
  { value: 'RETIREMENT', label: 'Retirement' },
  { value: 'DISMISSAL', label: 'Dismissal' },
  { value: 'OTHER', label: 'Other' },
]

export function TerminateDoctorDialog({
  doctor, open, onOpenChange, onDone,
}: {
  doctor: TerminateDoctorRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}) {
  const [terminationType, setTerminationType] = useState('RESIGNATION')
  const [terminationDate, setTerminationDate] = useState('')
  const [lastWorkingDate, setLastWorkingDate] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [disableLogin, setDisableLogin] = useState(true)
  const [cancelFutureShifts, setCancelFutureShifts] = useState(true)
  const [preventNewPatientAssignments, setPreventNewPatientAssignments] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fullName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''

  // Fresh form every time the dialog opens — termination defaults to today.
  useEffect(() => {
    if (!open) return
    setTerminationType('RESIGNATION')
    setTerminationDate(todayLocalISO())
    setLastWorkingDate('')
    setReason('')
    setNotes('')
    setDisableLogin(true)
    setCancelFutureShifts(true)
    setPreventNewPatientAssignments(true)
    setError(null)
    setSubmitting(false)
  }, [open])

  const reasonError = reason.trim().length < 5
    ? 'Termination reason is required (5–500 characters).'
    : reason.trim().length > 500
      ? 'Termination reason must be at most 500 characters.'
      : null

  const handleSubmit = async () => {
    if (!doctor || submitting) return
    if (reasonError) {
      setError(reasonError)
      return
    }
    setSubmitting(true)
    setError(null)
    const doctorId = usableDoctorId(doctor.id)
    if (!doctorId) {
      setError('Missing doctor id.')
      setSubmitting(false)
      return
    }
    try {
      await doctorsService.terminate(doctorId, { reason: reason.trim() })
      toast.success('Doctor terminated successfully.')
      onDone?.()
      onOpenChange(false)
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        toast.error('Session expired. Please sign in again.')
        navigate('/super-admin/login')
        return
      }
      setError(doctorActionError(e, 'Could not terminate the doctor. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const reasonId = 'terminate-reason'
  const switchRow = (
    id: string,
    label: string,
    hint: string,
    checked: boolean,
    setChecked: (v: boolean) => void,
  ) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
      <Label htmlFor={id} className="cursor-pointer font-normal leading-snug text-slate-700 dark:text-slate-300">
        {label}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={setChecked} disabled={submitting} />
    </div>
  )

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Cancel button is the only way out — never Escape or outside click.
        if (!next && !submitting) onOpenChange(false)
      }}
    >
      <AlertDialogContent
        className="hms-scroll max-h-[85vh] max-w-md overflow-y-auto"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserMinus className="size-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
            Terminate Doctor
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action will prevent the doctor from logging in and from receiving new assignments.
            Historical records are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Doctor info block */}
          <dl className="space-y-1.5 rounded-lg border bg-slate-50 p-3 text-sm dark:bg-white/5">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Doctor</dt>
              <dd className="text-right font-medium text-slate-800 dark:text-slate-100">
                {fullName}
                <span className="block font-mono text-xs text-muted-foreground">{doctor?.doctorId}</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Department</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-100">{doctor?.departmentName || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Specialization</dt>
              <dd className="text-right font-medium text-slate-800 dark:text-slate-100">
                {doctor?.specializationNames || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Designation</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-100">{doctor?.designation || '—'}</dd>
            </div>
          </dl>

          {/* Termination type */}
          <div className="space-y-1.5">
            <Label htmlFor="terminate-type">Termination Type</Label>
            <Select value={terminationType} onValueChange={setTerminationType}>
              <SelectTrigger id="terminate-type" className="w-full">
                <SelectValue placeholder="Select termination type" />
              </SelectTrigger>
              <SelectContent>
                {TERMINATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="terminate-date">
                Termination Date <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
              </Label>
              <Input
                id="terminate-date"
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terminate-last-working">Last Working Date</Label>
              <Input
                id="terminate-last-working"
                type="date"
                value={lastWorkingDate}
                onChange={(e) => setLastWorkingDate(e.target.value)}
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>
              Reason <span className="text-rose-600 dark:text-rose-400" aria-hidden>*</span>
            </Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Resignation accepted effective from the stated date…"
              maxLength={500}
              aria-required="true"
              aria-invalid={Boolean(reason) && Boolean(reasonError)}
              aria-describedby={reasonError ? `${reasonId}-error` : undefined}
            />
            {reasonError && reason.length > 0 ? (
              <p id={`${reasonId}-error`} className="text-xs text-rose-600 dark:text-rose-400" role="alert">
                {reasonError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Required — 5 to 500 characters. Recorded in the audit trail.</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="terminate-notes">Additional Notes</Label>
            <Textarea
              id="terminate-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional context for other Super Admins…"
              maxLength={500}
            />
          </div>

          {/* Immediate-effect switches */}
          <div className="space-y-2" role="group" aria-label="Immediate termination effects">
            {switchRow(
              'terminate-disable-login',
              'Disable portal login',
              'The doctor can no longer sign in to the portal.',
              disableLogin,
              setDisableLogin,
            )}
            {switchRow(
              'terminate-cancel-shifts',
              'Cancel future shifts',
              'All scheduled shifts from today onwards are cancelled.',
              cancelFutureShifts,
              setCancelFutureShifts,
            )}
            {switchRow(
              'terminate-prevent-assignments',
              'Prevent new patient assignments',
              'The doctor cannot be added to any care team.',
              preventNewPatientAssignments,
              setPreventNewPatientAssignments,
            )}
          </div>

          {/* Warning box */}
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Employment status becomes Terminated and the account is disabled. Historical patient,
              visit and medical records remain intact — termination never deletes clinical history.
            </span>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || Boolean(reasonError) || !terminationDate}
            className="bg-rose-600 text-white hover:bg-rose-700 disabled:pointer-events-none disabled:opacity-50"
            onClick={(e) => {
              e.preventDefault()
              void handleSubmit()
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Terminating…
              </>
            ) : (
              <>
                <UserMinus className="size-4" aria-hidden /> Terminate Doctor
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
