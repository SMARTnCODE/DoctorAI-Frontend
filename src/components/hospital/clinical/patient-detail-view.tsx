'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, Bot, DoorOpen, Mail, MapPin, MoreHorizontal, Pencil, Phone, Send, Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClinicalChartView } from '@/components/hospital/clinical/clinical-chart-view'
import { SharePatientDialog } from '@/components/hospital/clinical/share-patient-dialog'
import { patientById } from '@/components/hospital/clinical/clinical-data'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import { ReferralHistoryList } from '@/components/hospital/referral-history'
import { ReferralStatusBadge } from '@/components/hospital/referral-status-badge'
import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { PatientFormDialog } from '@/components/hospital/clinical/patient-form-dialog'
import {
  CHART_TAB_LIST, CHART_TAB_TRIGGER,
  LabsPanel, NotesPanel, OverviewVitals, PrescriptionsPanel, RecentAppointments, VitalsPanel,
  type ChartNote, type ChartVitalReading,
} from '@/components/hospital/clinical/patient-chart-tabs'
import { ReferPatientDialog } from '@/components/hospital/clinical/refer-patient-dialog'
import { useAuth } from '@/components/hospital/auth-context'
import { initials } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import { cn } from '@/lib/utils'
import {
  dischargeActionErrorMessage,
  handlePatientAuthError,
  isAlreadyDischargedError,
  patientActionErrorMessage,
  recordAccessMessage,
} from '@/lib/patient-api-error'
import {
  clinicalStatusLabel,
  isPatientDischarged,
  normalizePatientType,
  patientTypeLabel,
  patientUiActions,
  patientsService,
  type Patient,
  type PatientReferral,
} from '@/services/patients.service'

const OUTLINE_ACTION = 'h-9 gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium shadow-none hover:bg-muted/60'
const COPILOT_ACTION = 'h-9 gap-1.5 rounded-lg bg-[#1f7a4d] px-3 text-white hover:bg-[#186540]'

function readingFromPatient(patient: Patient): ChartVitalReading | null {
  const vitals = patient.latestVitals
  if (!vitals) return null
  const systolic = vitals.systolicBP ?? vitals.bloodPressureS
  const diastolic = vitals.diastolicBP ?? vitals.bloodPressureD
  const oxygen = vitals.oxygenSaturation ?? vitals.oxygenSat
  const weight = vitals.weight != null && vitals.weight > 0 ? vitals.weight : null
  const respiratoryRate = vitals.respiratoryRate != null && vitals.respiratoryRate > 0 ? vitals.respiratoryRate : null
  if (
    vitals.heartRate == null
    && systolic == null
    && diastolic == null
    && oxygen == null
    && vitals.temperature == null
    && weight == null
    && respiratoryRate == null
  ) return null
  return {
    recordedAt: patient.updatedAt || patient.admittedAt,
    heartRate: vitals.heartRate,
    bloodPressureS: systolic,
    bloodPressureD: diastolic,
    oxygenSat: oxygen,
    temperature: vitals.temperature,
    weightKg: weight,
    respiratoryRate,
  }
}

function chartReadings(patient: Patient): ChartVitalReading[] {
  const history = patient.vitalReadings ?? []
  if (history.length > 0) {
    return history.map((row) => ({
      recordedAt: row.recordedAt,
      heartRate: row.heartRate,
      bloodPressureS: row.systolicBP,
      bloodPressureD: row.diastolicBP,
      oxygenSat: row.oxygenSaturation,
      temperature: row.temperature,
      respiratoryRate: row.respiratoryRate,
      weightKg: row.weight,
    }))
  }
  const latest = readingFromPatient(patient)
  return latest ? [latest] : []
}

const SEVERITY_PILL: Record<string, { dot: string; chip: string; label: string }> = {
  stable: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', label: 'Stable' },
  moderate: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', label: 'Moderate' },
  critical: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700', label: 'Critical' },
}

function SeverityPill({ value }: { value: string | null | undefined }) {
  const label = clinicalStatusLabel(value)
  const pill = SEVERITY_PILL[label.toLowerCase()]
  if (!pill) return <span className="text-xs font-medium text-muted-foreground">{label}</span>
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', pill.chip)}>
      <span className={cn('size-1.5 rounded-full', pill.dot)} aria-hidden />
      {pill.label}
    </span>
  )
}

function scheduleDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function locationText(value?: string | null): string {
  const text = value?.trim() ?? ''
  if (!text || text === '—' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return ''
  return text
}

function dischargeConfirmation(patient: Patient): string {
  const name = patient.fullName.trim() || 'this patient'
  const ward = locationText(patient.ward)
  const bed = locationText(patient.bed)
  if (ward && bed) return `Discharge ${name} from ${ward} (Bed ${bed})?`
  if (ward) return `Discharge ${name} from ${ward}?`
  if (bed) return `Discharge ${name} (Bed ${bed})?`
  return `Discharge ${name}?`
}

function formatDischargeStamp(value?: string | null): string {
  if (!value?.trim()) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time}`
}

export function PatientDetailView({ patientId }: { patientId: string }) {
  const added = useClinicalStore((s) => s.patients)
  const clinical = Boolean(patientById(patientId) || added.some((patient) => patient.id === patientId))
  if (clinical) return <ClinicalChartView patientId={patientId} />
  return <ApiPatientDetail patientId={patientId} />
}

function ApiPatientDetail({ patientId }: { patientId: string }) {
  const { logout, userId, doctorProfile } = useAuth()
  const actorId = doctorProfile?.id || userId
  const [patient, setPatient] = useState<Patient | null>(null)
  const [referrals, setReferrals] = useState<PatientReferral[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [referring, setReferring] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivatingBusy, setDeactivatingBusy] = useState(false)
  const [dischargeOpen, setDischargeOpen] = useState(false)
  const [dischargeNote, setDischargeNote] = useState('')
  const [dischargeError, setDischargeError] = useState<string | null>(null)
  const [dischargingBusy, setDischargingBusy] = useState(false)
  const dischargeRequest = useRef(false)
  const loadedPatientId = useRef<string | null>(null)
  const loadGeneration = useRef(0)
  const [notes, setNotes] = useState<ChartNote[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const bumpPatients = useClinicalStore((s) => s.bumpPatients)

  function refreshPatient() {
    bumpPatients()
    setReloadKey((value) => value + 1)
  }

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current
    const quiet = loadedPatientId.current === patientId
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const record = await patientsService.getPatientById(patientId)
      const history = await patientsService.getPatientReferrals(record.id)
      if (generation !== loadGeneration.current) return
      setPatient(record)
      setReferrals(history)
      loadedPatientId.current = patientId
    } catch (err) {
      if (generation !== loadGeneration.current) return
      if (await handlePatientAuthError(err, logout, '/doctor/patients')) return
      if (quiet) {
        toast.error(recordAccessMessage(err))
        return
      }
      loadedPatientId.current = null
      setPatient(null)
      setReferrals([])
      setError(recordAccessMessage(err))
    } finally {
      if (generation === loadGeneration.current && !quiet) setLoading(false)
    }
  }, [patientId, logout])

  useEffect(() => { void load() }, [load, reloadKey])
  useEffect(() => {
    loadedPatientId.current = null
    dischargeRequest.current = false
    setNotes([])
    setDischargeOpen(false)
    setDischargeNote('')
    setDischargeError(null)
  }, [patientId])

  function openDischarge() {
    setDischargeNote('')
    setDischargeError(null)
    setDischargeOpen(true)
  }

  async function confirmDischarge() {
    if (!patient || dischargeRequest.current) return
    dischargeRequest.current = true
    setDischargingBusy(true)
    setDischargeError(null)
    try {
      const updated = await patientsService.dischargePatient(patient.id, dischargeNote)
      if (updated) setPatient(updated)
      else setPatient((current) => (current ? { ...current, status: 'DISCHARGED', severity: 'DISCHARGED' } : current))
      toast.success('Patient discharged successfully.')
      setDischargeOpen(false)
      setDischargeNote('')
      refreshPatient()
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/patients')) return
      if (isAlreadyDischargedError(err)) {
        setPatient((current) => (current ? { ...current, status: 'DISCHARGED', severity: 'DISCHARGED' } : current))
        toast.error(dischargeActionErrorMessage(err))
        setDischargeOpen(false)
        setDischargeNote('')
        refreshPatient()
        return
      }
      setDischargeError(dischargeActionErrorMessage(err))
    } finally {
      dischargeRequest.current = false
      setDischargingBusy(false)
    }
  }

  async function confirmDeactivate() {
    if (!patient || deactivatingBusy) return
    setDeactivatingBusy(true)
    try {
      await patientsService.deactivatePatient(patient.id)
      toast.success('Patient deactivated successfully.')
      setDeactivating(false)
      refreshPatient()
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/patients')) return
      toast.error(patientActionErrorMessage(err, 'Could not deactivate the patient.'))
    } finally {
      setDeactivatingBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" data-testid="doctor-patient-detail">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !patient) {
    return (
      <div className="space-y-4" data-testid="doctor-patient-detail">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/doctor/patients')}>
          <ArrowLeft className="size-4" /> All patients
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error ?? 'Patient not found or you are not authorized to access this patient.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const actions = patientUiActions(patient)
  const currentReferral = [...referrals]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((item) => {
      const status = item.status.toUpperCase()
      return status === 'PENDING' || status === 'ACCEPTED' || status === 'COMPLETED'
    })
  const activeReferral = referrals.find((item) =>
    item.referredDoctor?.id === actorId && (item.status.toUpperCase() === 'PENDING' || item.status.toUpperCase() === 'ACCEPTED'),
  ) ?? currentReferral
  const discharged = isPatientDischarged(patient.status, patient.severity)
  const canDischarge = normalizePatientType(patient.patientType) === 'IN_HOSPITAL' && !discharged
  const dischargedAtLabel = formatDischargeStamp(patient.dischargedAt)
  const dischargeNoteText = locationText(patient.dischargeNote)
  const dischargedByName = locationText(patient.dischargedBy)
  const meta = [
    `MRN: ${patient.patientCode || patient.patientId}`,
    patient.age != null ? `${patient.age}y` : null,
    patient.gender || null,
    patient.bloodGroup || null,
    patient.ward || patient.department?.name || null,
  ].filter(Boolean).join(' · ')
  const upcoming = patient.lastVisit && new Date(patient.lastVisit).getTime() > Date.now()
    ? patient.lastVisit
    : null
  const pastVisit = patient.lastVisit && !upcoming ? patient.lastVisit : null

  return (
    <div className="space-y-4" data-testid="doctor-patient-detail">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => navigate('/doctor/patients')}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All patients
        </button>
        <span className="text-muted-foreground/70" aria-hidden>/</span>
        <span className="font-medium">{patient.fullName}</span>
      </div>

      <section className="rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
              {initials(patient.fullName)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{patient.fullName}</h1>
                <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                  {patientTypeLabel(patient.patientType)}
                </span>
                {patient.accessType === 'REFERRED' ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200">REFERRED</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {patient.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5" aria-hidden /> {patient.phone}
                  </span>
                ) : null}
                {patient.email ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" aria-hidden /> {patient.email}
                  </span>
                ) : null}
                {patient.address ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden /> {patient.address}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions.canRefer ? (
              <Button type="button" variant="outline" className={OUTLINE_ACTION} onClick={() => setReferring(true)}>
                <Send className="size-4" aria-hidden /> Refer
              </Button>
            ) : null}
            <Button type="button" variant="outline" className={OUTLINE_ACTION} onClick={() => setSharing(true)}>
              <Share2 className="size-4" aria-hidden /> Share
            </Button>
            <Button type="button" className={COPILOT_ACTION} onClick={() => navigate(`/doctor/ai/${patient.id}`)}>
              <Bot className="size-4" aria-hidden /> Ask Co-Pilot
            </Button>
            {actions.canEdit || actions.canDeactivate ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="size-9 rounded-lg shadow-none" aria-label="More patient actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {actions.canEdit ? (
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <Pencil className="size-4" /> Edit Patient
                    </DropdownMenuItem>
                  ) : null}
                  {actions.canDeactivate ? (
                    <DropdownMenuItem className="text-rose-600" onClick={() => setDeactivating(true)}>
                      Deactivate
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </section>

      {normalizePatientType(patient.patientType) === 'IN_HOSPITAL' ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">
              {discharged ? 'Discharged' : 'Admitted'}
            </p>
            <p className="mt-1 text-base font-semibold">
              {locationText(patient.ward) || '—'}{locationText(patient.bed) ? ` · Bed ${locationText(patient.bed)}` : ''}
            </p>
            <div className="mt-2 space-y-1.5 text-sm">
              {discharged ? (
                <p>
                  <span className="text-muted-foreground">Status </span>
                  <span className="font-medium">DISCHARGED</span>
                </p>
              ) : (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Status</span>
                  <SeverityPill value={patient.severity} />
                </p>
              )}
              {discharged && patient.severity ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Clinical status</span>
                  <SeverityPill value={patient.severity} />
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Condition </span>
                <span>{patient.condition?.trim() || '—'}</span>
              </p>
              {discharged && dischargedAtLabel ? (
                <p>
                  <span className="text-muted-foreground">Discharged </span>
                  <span>{dischargedAtLabel}</span>
                </p>
              ) : null}
              {discharged && dischargedByName ? (
                <p>
                  <span className="text-muted-foreground">Discharged by </span>
                  <span>{dischargedByName}</span>
                </p>
              ) : null}
              {discharged && dischargeNoteText ? (
                <p>
                  <span className="text-muted-foreground">Discharge Note </span>
                  <span className="whitespace-pre-wrap">{dischargeNoteText}</span>
                </p>
              ) : null}
              {patient.primaryDoctor?.name ? (
                <p className="text-muted-foreground">{patient.primaryDoctor.name}</p>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {patient.admittedAt ? `Since ${scheduleDate(patient.admittedAt)}` : 'Admission date not recorded'}
            </p>
          </div>
          {canDischarge ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 rounded-lg border-emerald-200 text-emerald-700 shadow-none hover:bg-emerald-50"
              data-testid="discharge-patient"
              onClick={openDischarge}
            >
              <DoorOpen className="size-4" aria-hidden /> Discharge
            </Button>
          ) : null}
        </section>
      ) : null}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className={CHART_TAB_LIST}>
          {['Overview', 'Vitals', 'Labs', 'Prescriptions', 'Notes'].map((tab) => (
            <TabsTrigger key={tab} value={tab.toLowerCase()} className={CHART_TAB_TRIGGER}>{tab}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <OverviewVitals reading={readingFromPatient(patient)} />
          <RecentAppointments items={pastVisit || upcoming ? [{
            id: 'last-visit',
            scheduledAt: (upcoming || pastVisit) as string,
            purpose: patient.purpose || patient.condition || 'Visit',
            doctorName: patient.primaryDoctor?.name || '',
          }] : []} />

          {patient.accessType === 'REFERRED' && activeReferral ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">Referral information</h2>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <Info label="Referred by" value={activeReferral.referringDoctor?.name ?? '—'} />
                <Info label="Referral reason" value={activeReferral.referralReason} />
                <div>
                  <p className="text-xs text-muted-foreground">Referral status</p>
                  <div className="mt-1"><ReferralStatusBadge status={activeReferral.status} /></div>
                </div>
                {activeReferral.message ? <Info label="Message" value={activeReferral.message} /> : null}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-sm font-semibold">Referral history</h2>
            <ReferralHistoryList referrals={referrals} />
          </section>
        </TabsContent>

        <TabsContent value="vitals">
          <VitalsPanel readings={chartReadings(patient)} />
        </TabsContent>
        <TabsContent value="labs">
          <LabsPanel labs={[]} />
        </TabsContent>
        <TabsContent value="prescriptions">
          <PrescriptionsPanel medications={[]} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesPanel
            notes={notes}
            doctorName={doctorProfile?.name || 'Doctor'}
            onAdd={(note) => setNotes((current) => [note, ...current])}
          />
        </TabsContent>
      </Tabs>

      <PatientFormDialog
        open={editing}
        mode="edit"
        patient={patient}
        onOpenChange={setEditing}
        onSaved={() => refreshPatient()}
      />
      <ReferPatientDialog
        patient={patient}
        open={referring}
        onOpenChange={setReferring}
        onSent={() => refreshPatient()}
      />
      <SharePatientDialog
        patient={patient}
        open={sharing}
        onOpenChange={setSharing}
      />
      <ConfirmDialog
        open={dischargeOpen}
        onOpenChange={(open) => {
          if (dischargingBusy) return
          setDischargeOpen(open)
          if (!open) {
            setDischargeNote('')
            setDischargeError(null)
          }
        }}
        title="Confirm patient discharge"
        description={dischargeConfirmation(patient)}
        confirmLabel="Confirm discharge"
        processingLabel="Discharging..."
        processing={dischargingBusy}
        onConfirm={() => { void confirmDischarge() }}
      >
        <div className="space-y-2 text-foreground">
          <Label htmlFor="discharge-note">Discharge Note (Optional)</Label>
          <Textarea
            id="discharge-note"
            value={dischargeNote}
            onChange={(event) => setDischargeNote(event.target.value)}
            placeholder="Add discharge summary note..."
            disabled={dischargingBusy}
            rows={3}
          />
        </div>
        {dischargeError ? (
          <Alert variant="destructive">
            <AlertDescription>{dischargeError}</AlertDescription>
          </Alert>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        title="Deactivate patient"
        description="Are you sure you want to deactivate this patient?"
        confirmLabel="Deactivate"
        destructive
        processing={deactivatingBusy}
        onConfirm={() => { void confirmDeactivate() }}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm">{value}</p>
    </div>
  )
}
