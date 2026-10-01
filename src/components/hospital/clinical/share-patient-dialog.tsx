'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Search, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useReferralDoctors } from '@/components/hospital/clinical/use-referral-doctors'
import { patientById } from '@/components/hospital/clinical/clinical-data'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { patientTypeLabel, type Patient, type ReferralDoctorOption } from '@/services/patients.service'

const HANDOVER_LEFT = [
  ['demographics', 'Patient demographics'],
  ['encounters', 'Clinical encounters'],
  ['labs', 'Lab reports'],
  ['images', 'Health image reports'],
  ['notes', 'Notes'],
] as const

const HANDOVER_RIGHT = [
  ['history', 'Clinical history'],
  ['vitals', 'Vitals'],
  ['diagnostics', 'Diagnostic reports'],
  ['prescriptions', 'Prescriptions'],
  ['visits', 'Previous visit history'],
] as const

const HANDOVER = [...HANDOVER_LEFT, ...HANDOVER_RIGHT]

const GREEN = 'bg-[#1f8a5b] text-white hover:bg-[#187a4e]'

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function doctorLine(doctor: ReferralDoctorOption): string {
  return doctor.specialization || doctor.specializations[0] || doctor.department?.name || 'Physician'
}

export function SharePatientDialog({
  patient,
  currentDoctor,
  open,
  onOpenChange,
}: {
  patient: Patient | null
  currentDoctor?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const { doctors, loading } = useReferralDoctors(open, debouncedSearch)
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [shared, setShared] = useState<Record<string, boolean>>(() => Object.fromEntries(HANDOVER.map(([id]) => [id, true])))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedId('')
    setReason('')
    setMessage('')
    setShared(Object.fromEntries(HANDOVER.map(([id]) => [id, true])))
    setSubmitting(false)
  }, [open, patient?.id])

  const selected = doctors.find((doctor) => doctor.id === selectedId) ?? null
  const ageLabel = patient?.age != null && patient.age >= 0 ? `${patient.age}y` : 'Age —'
  const current = currentDoctor || patient?.primaryDoctor?.name || 'Not assigned'

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!patient || submitting) return
    if (!selectedId) {
      toast.error('Select the doctor who will receive this patient.')
      return
    }
    if (!reason.trim()) {
      toast.error('Enter why ongoing care is being transferred.')
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      onOpenChange(false)
      if (patientById(patient.id) || selected) {
        toast.success(`Handover sent to ${selected?.name ?? 'the receiving doctor'}.`)
      }
    }, 250)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-[34rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Share2 className="size-4 text-teal-700" aria-hidden />
            Share Patient
          </DialogTitle>
          <DialogDescription>
            Share this patient with another doctor for continued care.
          </DialogDescription>
        </DialogHeader>
        {patient ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {initials(patient.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{patient.fullName}</p>
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {patientTypeLabel(patient.patientType)}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {patient.patientId} · {ageLabel} · {patient.gender || '—'}
                  {patient.department?.name ? ` · ${patient.department.name}` : ''}
                </p>
                <p className="truncate text-xs text-muted-foreground">Current doctor: {current}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border px-3 py-2">
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Current doctor</p>
                <p className="mt-1 font-medium">{current}</p>
              </div>
              <div className="rounded-lg border px-3 py-2">
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">New receiving doctor</p>
                <p className="mt-1 font-medium">{selected?.name ?? 'Not selected'}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Transfer to doctor</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search doctor by name, specialty, department..."
                  aria-label="Search doctors"
                  className="h-10 pl-9"
                />
              </div>
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                {loading ? (
                  <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Searching doctors...
                  </p>
                ) : doctors.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No matching doctors.</p>
                ) : doctors.map((doctor) => {
                  const active = selectedId === doctor.id
                  return (
                    <button
                      key={doctor.id}
                      type="button"
                      onClick={() => setSelectedId(doctor.id)}
                      className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm', active ? 'bg-emerald-50' : 'hover:bg-muted')}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-semibold text-white">
                        {initials(doctor.name.replace(/^Dr\.?\s*/, ''))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{doctor.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{doctorLine(doctor)}</span>
                      </span>
                      <span className={cn('flex size-4 items-center justify-center rounded-full border', active ? 'border-emerald-600' : 'border-muted-foreground/40')}>
                        {active ? <span className="size-2 rounded-full bg-emerald-600" /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Handover information</p>
              <div className="grid grid-cols-2 gap-x-4">
                <div className="space-y-2">
                  {HANDOVER_LEFT.map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={shared[id]}
                        onCheckedChange={(checked) => setShared((current) => ({ ...current, [id]: checked === true }))}
                        className="rounded-full data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="space-y-2">
                  {HANDOVER_RIGHT.map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={shared[id]}
                        onCheckedChange={(checked) => setShared((current) => ({ ...current, [id]: checked === true }))}
                        className="rounded-full data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">The patient&apos;s selected records will be available to the receiving doctor. Lab and visit screens are included.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="handover-reason" className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Handover reason</Label>
              <Textarea
                id="handover-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why ongoing care is being transferred..."
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="handover-message" className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Optional message</Label>
              <Textarea
                id="handover-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add information for the receiving doctor..."
                rows={2}
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The receiving doctor will take responsibility for ongoing care according to authorization rules once they accept.
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" className={GREEN} disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Continue
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
