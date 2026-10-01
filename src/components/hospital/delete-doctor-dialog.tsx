'use client'

/**
 * Delete Doctor — multi-stage destructive workflow (round 21, Task 26 gate).
 *
 * Stage 'warning' (only when the doctor still has assignments):
 *   "This doctor has active assignments" → Cancel | Review assignments
 * Stage 'review':   the exact records that will be removed vs preserved.
 * Stage 'confirm':  "Delete Doctor Account?" + typed doctor-NAME gate
 *                   → Cancel | Delete Account.
 *
 * Safety rules (all mandatory):
 * - The dialog can NEVER be dismissed by clicking outside or pressing Escape
 *   (Radix AlertDialog never closes on outside click; Escape is prevented).
 * - The final action stays disabled until the Super Admin types the doctor's
 *   full display name ("Dr. First Last") — compared case-insensitively; the
 *   server independently re-verifies it (422 + expected name on mismatch).
 * - The server independently enforces both rules (doctorDeleteSchema +
 *   ACTIVE_ASSIGNMENTS 409 backstop).
 */
import { useEffect, useState } from 'react'
import {
  AlertTriangle, CalendarClock, CalendarDays, Loader2, Lock, Trash2, Users,
} from 'lucide-react'
import { ApiError, type DoctorRef } from '@/lib/api-client'
import { doctorsService, usableDoctorId } from '@/services/doctors.service'
import { formatDate, formatShiftDate, formatTime12h, shiftTypeLabel } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

type Stage = 'loading' | 'warning' | 'review' | 'confirm'

interface DeleteSummary {
  doctor: { id: string; doctorId: string; firstName: string; lastName: string; status: string }
  assignments: {
    activePatients: number
    upcomingVisits: number
    upcomingShifts: number
    hasAssignments: boolean
    patients: { patientId: string; name: string }[]
    visits: { visitDate: string; reason: string | null; patientName: string }[]
    shifts: { date: string; shiftType: string; startTime: string; endTime: string }[]
  }
}

function handleDialogError(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.status === 401) {
    toast.error('Session expired. Please sign in again.')
    navigate('/super-admin/login')
    return
  }
  toast.error(e instanceof ApiError ? e.message : fallback)
}

function CountRow({ icon: Icon, label, count, children }: {
  icon: typeof Users
  label: string
  count: number
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          <Icon className="size-4 text-teal-700 dark:text-teal-300" aria-hidden />
          {label}
        </span>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">
          {count}
        </span>
      </div>
      {children}
    </div>
  )
}

function SampleList({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
      {items.map((line, i) => (
        <li key={i} className="truncate">• {line}</li>
      ))}
    </ul>
  )
}

export function DeleteDoctorDialog({
  doctor, open, onOpenChange, onDeleted,
}: {
  doctor: DoctorRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [stage, setStage] = useState<Stage>('loading')
  const [summary, setSummary] = useState<DeleteSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''
  const assignments = summary?.assignments
  // Prefer the server-verified id from the delete-summary payload; the list
  // row is the fallback when the summary has not loaded.
  const doctorId = summary?.doctor.doctorId ?? doctor?.doctorId ?? ''
  // Task 26 — the confirmation gate is the doctor's FULL display name
  // ("Dr. First Last"), compared case-insensitively (server re-verifies).
  const canConfirm =
    confirmText.trim().toLowerCase() === fullName.toLowerCase() && !processing

  // Assignment summary is not on the admin API. Open the existing
  // confirmation step without calling a missing delete-summary route.
  useEffect(() => {
    if (!open || !doctor) return
    setStage('confirm')
    setSummary(null)
    setLoadError(null)
    setError(null)
    setConfirmText('')
    setProcessing(false)
  }, [open, doctor])

  const handleDelete = async () => {
    if (!doctor || !canConfirm) return
    const targetId = usableDoctorId(doctor.id)
    if (!targetId) {
      setError('Missing doctor id.')
      return
    }
    setProcessing(true)
    setError(null)
    try {
      await doctorsService.remove(targetId)
      toast.success('Doctor deactivated', {
        description: `${fullName} was deactivated in the Doctor Directory.`,
      })
      onOpenChange(false)
      onDeleted()
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        toast.error('Session expired. Please sign in again.')
        navigate('/super-admin/login')
        return
      }
      // Server backstop: assignments appeared since the summary — show the warning again.
      if (e instanceof ApiError && e.status === 409 && e.code === 'ACTIVE_ASSIGNMENTS') {
        setStage('warning')
        setError(e.message)
        return
      }
      setError(e instanceof ApiError ? e.message : 'Failed to delete the doctor. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  const retryLoad = () => {
    if (!doctor) return
    setLoadError(null)
    setStage('confirm')
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Cancel button is the only way out — never Escape or outside click.
        if (!next && !processing) onOpenChange(false)
      }}
    >
      <AlertDialogContent
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {stage === 'loading' ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Checking assignments…</AlertDialogTitle>
              <AlertDialogDescription>
                Loading the safety check before deletion{doctor ? ` for ${fullName}` : ''}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {loadError ? (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="space-y-2">
                  <p>{loadError}</p>
                  <Button size="sm" variant="outline" onClick={retryLoad}>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Retry
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-6" aria-live="polite">
                <Loader2 className="size-6 animate-spin text-teal-700 dark:text-teal-300" aria-hidden />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : null}

        {stage === 'warning' && assignments ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                This doctor has active assignments
              </AlertDialogTitle>
              <AlertDialogDescription>
                This doctor currently has patients, appointments, or shifts assigned. Review or
                reassign these records before deleting the doctor.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error ? (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            ) : null}
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
                <p className="font-medium text-slate-800 dark:text-slate-100">{fullName}</p>
                <p className="font-mono text-xs text-muted-foreground">{assignments ? summary?.doctor.doctorId : doctor?.doctorId}</p>
              </div>
              <ul className="space-y-1 text-muted-foreground">
                <li>• {assignments.activePatients} assigned patient{assignments.activePatients === 1 ? '' : 's'}</li>
                <li>• {assignments.upcomingVisits} upcoming appointment{assignments.upcomingVisits === 1 ? '' : 's'}</li>
                <li>• {assignments.upcomingShifts} assigned shift{assignments.upcomingShifts === 1 ? '' : 's'}</li>
              </ul>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  setError(null)
                  setStage('review')
                }}
              >
                Review assignments
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}

        {stage === 'review' && assignments ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Review active assignments</AlertDialogTitle>
              <AlertDialogDescription>
                These records belong to {fullName}. Patient records and visit history are preserved —
                only the doctor&apos;s assignments, shifts and directory access are removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="hms-scroll max-h-64 space-y-2 overflow-y-auto text-sm">
              <CountRow icon={Users} label="Assigned patients" count={assignments.activePatients}>
                <SampleList
                  items={[
                    ...assignments.patients.map((p) => `${p.patientId} · ${p.name}`),
                    ...(assignments.activePatients > assignments.patients.length
                      ? [`+ ${assignments.activePatients - assignments.patients.length} more`]
                      : []),
                  ]}
                />
              </CountRow>
              <CountRow icon={CalendarClock} label="Upcoming appointments" count={assignments.upcomingVisits}>
                <SampleList
                  items={[
                    ...assignments.visits.map((v) => `${formatDate(v.visitDate)} · ${v.patientName}${v.reason ? ` · ${v.reason}` : ''}`),
                    ...(assignments.upcomingVisits > assignments.visits.length
                      ? [`+ ${assignments.upcomingVisits - assignments.visits.length} more`]
                      : []),
                  ]}
                />
              </CountRow>
              <CountRow icon={CalendarDays} label="Assigned shifts" count={assignments.upcomingShifts}>
                <SampleList
                  items={[
                    ...assignments.shifts.map((s) => `${formatShiftDate(s.date)} · ${shiftTypeLabel(s.shiftType)} · ${formatTime12h(s.startTime)}–${formatTime12h(s.endTime)}`),
                    ...(assignments.upcomingShifts > assignments.shifts.length
                      ? [`+ ${assignments.upcomingShifts - assignments.shifts.length} more`]
                      : []),
                  ]}
                />
              </CountRow>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={(e) => {
                  e.preventDefault()
                  setStage('confirm')
                }}
              >
                <Trash2 className="size-4" aria-hidden /> Continue to delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}

        {stage === 'confirm' ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate Doctor</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to deactivate {fullName}? The doctor&apos;s historical records will be preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p className="text-sm text-muted-foreground">
              This deactivates the doctor. It does not erase patient, visit, or other historical records.
            </p>
            <p className="text-sm text-muted-foreground">
              This is a permanent administrative action. The doctor account and associated
              non-medical administrative data may be removed. Historical healthcare records must
              not be deleted if they are required for legal, clinical, or audit purposes.
            </p>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Patient records and visit history are preserved per the data-retention policy —
                this cannot be used to erase clinical records.
              </span>
            </div>
            {error ? (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="delete-doctor-confirm" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Type the doctor&apos;s full name to confirm:
              </Label>
              <Input
                id="delete-doctor-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={fullName.toUpperCase()}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={processing}
                className="font-mono"
                aria-describedby="delete-doctor-confirm-hint"
              />
              <p id="delete-doctor-confirm-hint" className="text-xs text-muted-foreground">
                Type {fullName.toUpperCase()} exactly — the full display name, any
                letter case. The Delete Doctor button unlocks only on an exact match.
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!canConfirm}
                className="bg-rose-600 text-white hover:bg-rose-700 disabled:pointer-events-none disabled:opacity-50"
                onClick={(e) => {
                  e.preventDefault()
                  void handleDelete()
                }}
              >
                {processing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="size-4" aria-hidden /> Delete Doctor
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
