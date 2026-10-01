'use client'

import { useState, type FormEvent } from 'react'
import {
  Activity, Droplet, FileText, HeartPulse, Pill, Plus, Scale, Send, Thermometer, Upload, Wind,
} from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { StatusPill } from '@/components/hospital/clinical/status-pill'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface ChartVitalReading {
  recordedAt?: string | null
  heartRate?: number | null
  bloodPressureS?: number | null
  bloodPressureD?: number | null
  oxygenSat?: number | null
  temperature?: number | null
  respiratoryRate?: number | null
  weightKg?: number | null
}

export interface ChartLab {
  id: string
  testName: string
  result: string
  normalRange: string
  flag: string
  reportedAt: string
}

export interface ChartMedication {
  id: string
  name: string
  dosage: string
  frequency: string
  active: boolean
  since?: string | null
}

export interface ChartNote {
  id: string
  content: string
  category: string
  createdAt: string
  doctorName: string
}

export interface ChartAppointment {
  id: string
  scheduledAt: string
  purpose: string
  doctorName: string
}

export interface MedicalReport {
  id: string
  type: string
  name: string
  date: string
  fileName: string
  notes: string
}

/** Segmented chart tabs: gray track, white active tab. */
export const CHART_TAB_LIST = 'h-9 w-fit max-w-full justify-start rounded-lg bg-muted p-1'
export const CHART_TAB_TRIGGER = 'h-7 flex-none rounded-md border border-transparent px-3 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'

const NOTE_CATEGORIES = ['General', 'Rounds', 'Consultation', 'Telehealth'] as const
const REPORT_TYPES = ['X-Ray', 'CT Scan', 'MRI', 'ECG', 'Ultrasound', 'Lab Report', 'Other'] as const
const MAX_REPORT_BYTES = 15 * 1024 * 1024

function display(value: number | null | undefined, digits?: number): string {
  if (value == null || Number.isNaN(value)) return '—'
  return digits == null ? String(value) : value.toFixed(digits)
}

function whenLabel(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days < 60) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function VitalCard({
  label, value, unit, icon: Icon, iconClass, alert,
}: {
  label: string
  value: string
  unit: string
  icon: typeof HeartPulse
  iconClass: string
  alert?: boolean
}) {
  return (
    <div className={cn(
      'min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm',
      alert && 'border-rose-200 bg-rose-50',
    )}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className={cn('size-3.5 shrink-0', iconClass)} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn('mt-2 truncate text-xl leading-none font-semibold tracking-tight', alert && 'text-rose-600')}>
        {value}
        <span className={cn('ml-1 text-sm font-medium text-muted-foreground', alert && 'text-rose-400')}>{unit}</span>
      </p>
    </div>
  )
}

export function OverviewVitals({ reading }: { reading?: ChartVitalReading | null }) {
  const systolic = reading?.bloodPressureS
  const diastolic = reading?.bloodPressureD
  const bp = systolic != null && diastolic != null
    ? `${systolic}/${diastolic}`
    : systolic != null
      ? String(systolic)
      : diastolic != null
        ? String(diastolic)
        : '—'
  const bpAlert = (systolic ?? 0) >= 140 || (diastolic ?? 0) >= 90
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <VitalCard label="Heart rate" value={display(reading?.heartRate)} unit="bpm" icon={HeartPulse} iconClass="text-rose-500" />
      <VitalCard label="Blood pressure" value={bp} unit="mmHg" icon={Droplet} iconClass="text-rose-500" alert={bp !== '—' && bpAlert} />
      <VitalCard label="Temperature" value={display(reading?.temperature, Number.isInteger(reading?.temperature) ? 0 : 1)} unit="°C" icon={Thermometer} iconClass="text-amber-500" />
      <VitalCard label="Respiratory" value={display(reading?.respiratoryRate)} unit="/min" icon={Wind} iconClass="text-sky-500" />
      <VitalCard label="SpO₂" value={display(reading?.oxygenSat)} unit="%" icon={Droplet} iconClass="text-sky-500" />
      <VitalCard label="Weight" value={display(reading?.weightKg, 1)} unit="kg" icon={Scale} iconClass="text-emerald-500" />
    </div>
  )
}

export function RecentAppointments({ items }: { items: ChartAppointment[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Recent appointments</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No appointments on record.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {items.slice(0, 6).map((item) => (
            <li key={item.id} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{whenLabel(item.scheduledAt)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(item.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <p>{item.purpose || '—'}</p>
              <p className="text-muted-foreground">{item.doctorName || '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const TREND_LIMIT = 6

function finite(value: number | null | undefined): number | null {
  return value == null || Number.isNaN(value) ? null : value
}

function temperatureLabel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function Sparkline({
  series,
}: {
  series: { values: Array<number | null>; color: string; dashed?: boolean }[]
}) {
  const usable = series.flatMap((line) => line.values.filter((value): value is number => value != null))
  if (usable.length === 0) return <p className="mt-6 text-xs text-muted-foreground">No readings.</p>
  const min = Math.min(...usable)
  const max = Math.max(...usable)
  const span = max - min || 1
  const width = 280
  const height = 64
  const yOf = (value: number) => height - ((value - min) / span) * (height - 16) - 8
  const segments = series.flatMap((line) => {
    const indexed = line.values
      .map((value, index) => ({ value, index }))
      .filter((item): item is { value: number; index: number } => item.value != null)
    if (indexed.length === 0) return []
    if (indexed.length === 1) {
      const y = yOf(indexed[0].value)
      return [{ points: `0,${y} ${width},${y}`, dashed: line.dashed, color: line.color }]
    }
    const count = line.values.length
    return [{
      points: indexed.map(({ value, index }) => `${(index / (count - 1)) * width},${yOf(value)}`).join(' '),
      dashed: line.dashed,
      color: line.color,
    }]
  })
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-14 w-full" aria-hidden>
      {segments.map((segment, index) => (
        <polyline
          key={index}
          fill="none"
          stroke={segment.color}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={segment.dashed ? '4 4' : undefined}
          points={segment.points}
        />
      ))}
    </svg>
  )
}

function TrendCard({
  label, value, unit, icon: Icon, iconClass, alert, tint, series,
}: {
  label: string
  value: string
  unit: string
  icon: typeof HeartPulse
  iconClass: string
  alert?: boolean
  tint?: boolean
  series: { values: Array<number | null>; color: string; dashed?: boolean }[]
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-background px-3.5 py-3',
      tint && 'border-rose-100 bg-rose-50',
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className={cn('size-3.5 shrink-0', iconClass)} aria-hidden />
          <span className="truncate">{label}</span>
        </p>
        <p className={cn('shrink-0 text-sm font-semibold', alert && 'text-rose-600')}>
          {value}
          <span className={cn('ml-1 font-medium text-muted-foreground', alert && 'text-rose-400')}>{unit}</span>
        </p>
      </div>
      <Sparkline series={series} />
    </div>
  )
}

export function VitalsPanel({ readings }: { readings: ChartVitalReading[] }) {
  const ordered = [...readings].sort((a, b) => Date.parse(a.recordedAt || '') - Date.parse(b.recordedAt || ''))
  const latest = ordered[ordered.length - 1]
  if (!latest) return <p className="py-6 text-sm text-muted-foreground">No vitals recorded.</p>
  const windowed = ordered.slice(-TREND_LIMIT)
  const series = (pick: (row: ChartVitalReading) => number | null | undefined) => windowed.map((row) => finite(pick(row)))
  const heartRate = series((row) => row.heartRate)
  const oxygen = series((row) => row.oxygenSat)
  const temperature = series((row) => row.temperature)
  const systolic = series((row) => row.bloodPressureS)
  const diastolic = series((row) => row.bloodPressureD)
  const pressureHigh = (latest.bloodPressureS ?? 0) >= 140 || (latest.bloodPressureD ?? 0) >= 90
  const temperatureHigh = (latest.temperature ?? 0) >= 37.5
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Trend (last {windowed.length} {windowed.length === 1 ? 'reading' : 'readings'})
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose-500" /> HR</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-teal-600" /> SpO₂</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" /> Temp</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-600" /> BP</span>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TrendCard
            label="Heart rate"
            value={display(latest.heartRate)}
            unit="bpm"
            icon={HeartPulse}
            iconClass="text-rose-500"
            series={[{ values: heartRate, color: '#e11d48' }]}
          />
          <TrendCard
            label="SpO₂"
            value={display(latest.oxygenSat)}
            unit="%"
            icon={Droplet}
            iconClass="text-teal-600"
            series={[{ values: oxygen, color: '#0f766e' }]}
          />
          <TrendCard
            label="Temperature"
            value={temperatureLabel(latest.temperature)}
            unit="°C"
            icon={Thermometer}
            iconClass="text-amber-500"
            tint={temperatureHigh}
            series={[{ values: temperature, color: '#d97706' }]}
          />
          <TrendCard
            label="Blood pressure"
            value={latest.bloodPressureS != null ? String(latest.bloodPressureS) : '—'}
            unit="mmHg"
            icon={Activity}
            iconClass="text-emerald-600"
            alert={latest.bloodPressureS != null && pressureHigh}
            series={[
              { values: systolic, color: '#059669' },
              { values: diastolic, color: '#94a3b8', dashed: true },
            ]}
          />
        </div>
      </section>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr className="border-b">
              {['When', 'HR', 'BP', 'Temp', 'SpO₂', 'RR'].map((heading) => (
                <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...ordered].reverse().map((row, index) => (
              <tr key={`${row.recordedAt ?? 'latest'}-${index}`} className="border-b last:border-b-0">
                <td className="px-4 py-3 text-muted-foreground">{whenLabel(row.recordedAt)}</td>
                <td className="px-4 py-3">{display(row.heartRate)}</td>
                <td className="px-4 py-3">
                  {row.bloodPressureS != null && row.bloodPressureD != null
                    ? `${row.bloodPressureS}/${row.bloodPressureD}`
                    : row.bloodPressureS != null
                      ? String(row.bloodPressureS)
                      : '—'}
                </td>
                <td className="px-4 py-3">{temperatureLabel(row.temperature)}</td>
                <td className="px-4 py-3">{row.oxygenSat != null ? `${row.oxygenSat}%` : '—'}</td>
                <td className="px-4 py-3">{display(row.respiratoryRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function LabsPanel({ labs }: { labs: ChartLab[] }) {
  const [reports, setReports] = useState<MedicalReport[]>([])
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 text-muted-foreground" aria-hidden /> Lab Results
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[11px] tracking-wider text-muted-foreground uppercase">
              <tr className="border-b">
                {['Test', 'Result', 'Ref range', 'Flag', 'When'].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No lab results on file.</td>
                </tr>
              ) : labs.map((lab) => (
                <tr key={lab.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{lab.testName}</td>
                  <td className="px-4 py-3">{lab.result}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lab.normalRange || '—'}</td>
                  <td className="px-4 py-3"><StatusPill value={lab.flag} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{whenLabel(lab.reportedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" aria-hidden /> Medical Reports
          </h2>
          <Button type="button" variant="outline" className="h-8 gap-1 rounded-lg bg-card px-3 text-xs shadow-none" onClick={() => setOpen(true)}>
            <Plus className="size-3.5" aria-hidden /> Add Medical Report
          </Button>
        </div>
        {reports.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
            <Upload className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium">No medical reports uploaded</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload X-Rays, CT scans, MRIs, ECGs and other diagnostic documents for this patient.</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {reports.map((report) => (
              <li key={report.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{report.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{report.type} · {report.fileName}{report.date ? ` · ${report.date}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AddReportDialog
        open={open}
        onOpenChange={setOpen}
        onSave={(report) => setReports((current) => [report, ...current])}
      />
    </div>
  )
}

function AddReportDialog({
  open, onOpenChange, onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (report: MedicalReport) => void
}) {
  const [type, setType] = useState('')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  function reset() {
    setType('')
    setName('')
    setDate('')
    setNotes('')
    setFile(null)
    setError('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!type) { setError('Select a report type'); return }
    if (!name.trim()) { setError('Enter a report name'); return }
    if (!file) { setError('Choose a file to upload'); return }
    if (file.size > MAX_REPORT_BYTES) { setError('File must be 15 MB or smaller'); return }
    onSave({
      id: `${Date.now()}`,
      type,
      name: name.trim(),
      date,
      fileName: file.name,
      notes: notes.trim(),
    })
    toast.success('Medical report added.')
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="size-4 text-muted-foreground" aria-hidden /> Add Medical Report
          </DialogTitle>
          <DialogDescription>Upload a diagnostic document or medical report for this patient.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>Report type <span className="text-rose-600">*</span></Label>
            <Select value={type || undefined} onValueChange={setType}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select report type" /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Report name / title <span className="text-rose-600">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chest X-Ray – September 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Report date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Upload file <span className="text-rose-600">*</span></Label>
            <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              <Upload className="mb-2 size-5" aria-hidden />
              {file ? file.name : 'Drag & drop file here'}
              <span className="mt-1 text-xs">or browse · PDF, JPG, JPEG, PNG · max 15 MB</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this report..." />
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-[#1f7a4d] text-white hover:bg-[#186540]">Upload Report</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PrescriptionsPanel({ medications }: { medications: ChartMedication[] }) {
  if (medications.length === 0) return <p className="py-6 text-sm text-muted-foreground">No prescriptions on file.</p>
  return (
    <ul className="space-y-3">
      {medications.map((med) => (
        <li key={med.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-emerald-700">
              <Pill className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <p className="font-medium">{med.name}{med.dosage ? <span className="font-normal text-muted-foreground"> · {med.dosage}</span> : null}</p>
              <p className="text-xs text-muted-foreground">
                {med.frequency}{med.since ? ` · since ${med.since}` : ''}
              </p>
            </span>
          </div>
          <span className={cn('shrink-0 text-sm font-medium', med.active ? 'text-emerald-600' : 'text-muted-foreground')}>
            {med.active ? 'Active' : 'Stopped'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function NotesPanel({
  notes, doctorName, onAdd,
}: {
  notes: ChartNote[]
  doctorName: string
  onAdd: (note: ChartNote) => void
}) {
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<(typeof NOTE_CATEGORIES)[number]>('General')

  function submit(event: FormEvent) {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return
    onAdd({
      id: `${Date.now()}`,
      content,
      category,
      createdAt: new Date().toISOString(),
      doctorName: doctorName || 'Doctor',
    })
    setDraft('')
    setCategory('General')
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a clinical note..."
          className="h-10"
        />
        <div className="flex gap-2">
          <Select value={category} onValueChange={(value) => setCategory(value as (typeof NOTE_CATEGORIES)[number])}>
            <SelectTrigger className="h-10 w-[140px]" aria-label="Note category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {NOTE_CATEGORIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="submit" className="h-10 gap-1.5 bg-[#1f7a4d] px-4 text-white hover:bg-[#186540]">
            <Send className="size-4" aria-hidden /> Add
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No clinical notes recorded.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <p><span className="font-medium text-foreground">{note.doctorName}</span> · {note.category}</p>
                <p>{timeAgo(note.createdAt)}</p>
              </div>
              <p className="mt-2">{note.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
