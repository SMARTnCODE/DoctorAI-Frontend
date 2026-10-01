'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { doctorActionError, doctorControlFlags, doctorsService, usableDoctorId } from '@/services/doctors.service'
import { navigate } from '@/lib/hash-nav'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export interface AssignableShift {
  id: string
  label: string
}

export function AssignShiftDialog({
  doctorId, doctorName, employmentStatus, accountStatus, shifts, open, onOpenChange, onAssigned,
}: {
  doctorId: string
  doctorName: string
  employmentStatus: string
  accountStatus: string
  shifts: AssignableShift[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssigned?: () => void
}) {
  const [shiftId, setShiftId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const flags = doctorControlFlags(employmentStatus, accountStatus)

  useEffect(() => {
    if (!open) return
    setShiftId('')
    setSubmitting(false)
  }, [open])

  const handleAssign = async () => {
    const id = usableDoctorId(doctorId)
    if (!id || submitting) return
    if (!flags.assignShift) {
      toast.error('Shifts can only be assigned to an active doctor.')
      return
    }
    if (!shiftId) {
      toast.error('Select a shift before assigning.')
      return
    }
    setSubmitting(true)
    try {
      await doctorsService.assignShift(id, { shift_id: shiftId })
      toast.success('Shift assigned successfully.')
      onAssigned?.()
      onOpenChange(false)
    } catch (e: unknown) {
      const message = doctorActionError(e, 'Could not assign the shift. Please try again.')
      toast.error(message)
      if (e instanceof ApiError && e.status === 401) navigate('/super-admin/login')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting || next) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
            Assign Shift
          </DialogTitle>
          <DialogDescription>
            Assign an existing shift to {doctorName}.
          </DialogDescription>
        </DialogHeader>
        {flags.assignShift ? (
          shifts.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="assign-shift">Shift</Label>
              <Select value={shiftId || undefined} onValueChange={setShiftId} disabled={submitting}>
                <SelectTrigger id="assign-shift" className="w-full">
                  <SelectValue placeholder="Select a shift" />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>{shift.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No shifts are available to assign.
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Shifts can only be assigned to an active doctor.
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting || !flags.assignShift || !shiftId}
            onClick={() => void handleAssign()}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
            Assign Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
