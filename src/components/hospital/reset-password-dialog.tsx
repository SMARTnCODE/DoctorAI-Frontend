'use client'

/**
 * Reset Password — confirmation before POST /api/admin/doctors/{id}/reset-password.
 * The backend generates the temporary password and emails it. This dialog never
 * displays, copies, or stores that password.
 */
import { useEffect, useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { ApiError, type DoctorRef } from '@/lib/api-client'
import { doctorActionError, doctorsService, usableDoctorId } from '@/services/doctors.service'
import { navigate } from '@/lib/hash-nav'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function ResetPasswordDialog({
  doctor, open, onOpenChange, onReset,
}: {
  doctor: DoctorRef | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset?: () => void
}) {
  const [processing, setProcessing] = useState(false)
  const fullName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : ''

  useEffect(() => {
    if (!open) setProcessing(false)
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (!next && processing) return
    onOpenChange(next)
  }

  const handleGenerate = async () => {
    if (!doctor || processing) return
    const doctorId = usableDoctorId(doctor.id)
    if (!doctorId) {
      toast.error('Missing doctor id.')
      return
    }
    setProcessing(true)
    try {
      await doctorsService.resetPassword(doctorId)
      toast.success('Doctor password has been reset and the temporary credentials have been sent to the registered email.')
      onReset?.()
      onOpenChange(false)
    } catch (e: unknown) {
      const message = doctorActionError(e, 'Could not reset the password. Please try again.')
      toast.error(message)
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Doctor Password</AlertDialogTitle>
          <AlertDialogDescription>
            Reset password for this doctor? A new temporary password will be generated and sent
            to the doctor&apos;s registered email.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
          <p className="font-medium text-slate-800 dark:text-slate-100">{fullName}</p>
          <p className="font-mono text-xs text-muted-foreground">{doctor?.doctorId}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          The temporary password is created and emailed by the server. It is not shown here.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={processing}
            onClick={(e) => {
              e.preventDefault()
              void handleGenerate()
            }}
          >
            {processing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Resetting…
              </>
            ) : (
              <>
                <KeyRound className="size-4" aria-hidden /> Reset Password
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
