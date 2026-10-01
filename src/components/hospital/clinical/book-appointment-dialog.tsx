'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarPlus, Clock, Loader2, Search, Stethoscope, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DOCTORS, isSameLocalDay, type Appointment } from '@/components/hospital/clinical/clinical-data'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import { initials } from '@/lib/format'
import { patientsService, type Patient } from '@/services/patients.service'

const SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '16:00', '16:30', '17:00']
/** Shared clinic purposes. Telehealth adds its own virtual reasons below. */
export const OPD_APPOINTMENT_PURPOSES = [
  'Routine checkup',
  'Follow-up consultation',
  'Lab review',
  'New symptom assessment',
  'Medication adjustment',
  'ECG review',
  'Wound dressing',
  'Allergy consultation',
] as const
const APPOINTMENT_PURPOSES = [
  ...OPD_APPOINTMENT_PURPOSES,
  'Tele-consultation',
  'Virtual follow up',
]
const CLINIC_DEFAULT_PURPOSE = 'Routine checkup'
const TELEHEALTH_DEFAULT_PURPOSE = 'Tele-consultation'
const BOOK_BUTTON = 'bg-[#b7e4c7] text-[#0b3430] hover:bg-[#a4dbb8]'

export interface BookedPatient {
  id: string
  name: string
  age: number
  gender: string
  phone: string
  bloodGroup: string | null
}

function tomorrowValue(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatBookDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function toIso(date: string, slot: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = slot.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

function fromPatient(patient: Patient): BookedPatient {
  return {
    id: patient.id,
    name: patient.fullName,
    age: patient.age ?? 0,
    gender: patient.gender || '—',
    phone: patient.phone || '',
    bloodGroup: null,
  }
}

function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function BookAppointmentDialog({
  open,
  onOpenChange,
  defaultKind,
  reschedule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultKind: 'opd' | 'telehealth'
  reschedule?: Appointment | null
}) {
  const opd = useClinicalStore((s) => s.opd)
  const tele = useClinicalStore((s) => s.telehealth)
  const addAppointment = useClinicalStore((s) => s.addAppointment)
  const rescheduleAppointment = useClinicalStore((s) => s.rescheduleAppointment)
  const [kind, setKind] = useState<'opd' | 'telehealth'>(defaultKind)
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query)
  const [hits, setHits] = useState<BookedPatient[]>([])
  const [searching, setSearching] = useState(false)
  const [patient, setPatient] = useState<BookedPatient | null>(null)
  const [doctorId, setDoctorId] = useState<string>(DOCTORS[0].id)
  const [date, setDate] = useState(tomorrowValue)
  const [slot, setSlot] = useState('10:00')
  const [purpose, setPurpose] = useState(defaultKind === 'telehealth' ? TELEHEALTH_DEFAULT_PURPOSE : CLINIC_DEFAULT_PURPOSE)

  useEffect(() => {
    if (!open) return
    const nextKind = defaultKind
    setKind(nextKind)
    setQuery('')
    setHits([])
    setPatient(reschedule ? {
      id: reschedule.patientId,
      name: reschedule.patientName,
      age: reschedule.age,
      gender: reschedule.gender,
      phone: reschedule.phone,
      bloodGroup: reschedule.bloodGroup,
    } : null)
    setDoctorId(DOCTORS.find((doctor) => doctor.name === reschedule?.doctorName)?.id ?? DOCTORS[0].id)
    setDate(tomorrowValue())
    setSlot('10:00')
    setPurpose(reschedule?.purpose ?? (nextKind === 'telehealth' ? TELEHEALTH_DEFAULT_PURPOSE : CLINIC_DEFAULT_PURPOSE))
  }, [open, defaultKind, reschedule])

  useEffect(() => {
    if (!open) return
    const term = debounced.trim()
    if (term.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    patientsService.getPatients({ search: term, page: 1, pageSize: 8 })
      .then((result) => {
        if (cancelled) return
        setHits(result.items.map(fromPatient))
      })
      .catch(() => {
        if (!cancelled) setHits([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => { cancelled = true }
  }, [open, debounced])

  const purposeOptions = APPOINTMENT_PURPOSES.includes(purpose) ? APPOINTMENT_PURPOSES : [...APPOINTMENT_PURPOSES, purpose]
  const doctor = DOCTORS.find((item) => item.id === doctorId) ?? DOCTORS[0]
  const todayCounts = useMemo(() => {
    const rows = kind === 'opd' ? opd : tele
    const map = new Map<string, number>()
    for (const row of rows) {
      if (!isSameLocalDay(row.scheduledAt)) continue
      map.set(row.doctorName, (map.get(row.doctorName) ?? 0) + 1)
    }
    return map
  }, [kind, opd, tele])

  function submit() {
    if (!patient) {
      toast.error('Select a patient.')
      return
    }
    const scheduledAt = toIso(date, slot)
    if (reschedule) {
      rescheduleAppointment(kind, reschedule.id, {
        scheduledAt,
        doctorName: doctor.name,
        specialty: doctor.specialty,
        purpose,
        durationMin: kind === 'telehealth' ? 20 : 30,
      })
      toast.success('Appointment rescheduled.')
      onOpenChange(false)
      return
    }
    const row: Appointment = {
      id: `${kind}-${Date.now()}`,
      patientId: patient.id,
      patientName: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      scheduledAt,
      durationMin: kind === 'telehealth' ? 20 : 30,
      status: 'scheduled',
      purpose,
      bloodGroup: patient.bloodGroup,
      roomUrl: null,
    }
    addAppointment(kind, row)
    toast.success(kind === 'telehealth' ? 'Telehealth visit booked.' : 'OPD appointment booked.')
    onOpenChange(false)
  }

  const title = reschedule
    ? 'Reschedule appointment'
    : kind === 'telehealth'
      ? 'Book new telehealth appointment'
      : 'Book new OPD appointment'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-3 overflow-y-auto sm:max-w-[32rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="size-4 text-teal-700" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>
            Schedule a {kind === 'telehealth' ? 'virtual' : 'clinic'} visit. The patient will receive an automated reminder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-sm"><UserRound className="size-3.5" aria-hidden /> Patient</Label>
          {patient ? (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{patient.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{patient.age}y · {patient.gender}{patient.bloodGroup ? ` · ${patient.bloodGroup}` : ''}</span>
              </span>
              <button type="button" className="text-xs text-teal-700" onClick={() => setPatient(null)}>Change</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patient by name or phone..."
                className="h-10 pl-9"
                aria-label="Search patient"
              />
              {searching || hits.length > 0 ? (
                <ul className="absolute top-11 z-20 max-h-44 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
                  {searching ? (
                    <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching...
                    </li>
                  ) : hits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => { setPatient(hit); setQuery(''); setHits([]) }}
                      >
                        <span className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-800">
                          {initials(hit.name)}
                        </span>
                        <span>
                          <span className="block font-medium">{hit.name}</span>
                          <span className="block text-xs text-muted-foreground">{hit.phone || 'No phone'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-sm"><Stethoscope className="size-3.5" aria-hidden /> Doctor</Label>
          <Select value={doctorId} onValueChange={setDoctorId}>
            <SelectTrigger className="h-10 w-full" aria-label="Doctor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCTORS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} · {item.specialty} ({todayCounts.get(item.name) ?? 0} today)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="book-date" className="flex items-center gap-1.5 text-sm">
              <CalendarDays className="size-3.5" aria-hidden /> Date
            </Label>
            <label className="relative flex h-10 cursor-pointer items-center rounded-md border bg-background px-3 text-sm">
              {formatBookDate(date)}
              <input
                id="book-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock className="size-3.5" aria-hidden /> Time slot
            </Label>
            <Select value={slot} onValueChange={setSlot}>
              <SelectTrigger className="h-10 w-full" aria-label="Time slot">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOTS.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Purpose</Label>
          <Select value={purpose} onValueChange={setPurpose}>
            <SelectTrigger className="h-10 w-full" aria-label="Purpose">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {purposeOptions.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className={BOOK_BUTTON} onClick={submit}>
            <CalendarPlus className="size-4" aria-hidden />
            {reschedule ? 'Save changes' : 'Book appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
