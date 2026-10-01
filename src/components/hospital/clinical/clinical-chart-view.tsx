'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft, Bot, DoorOpen, Mail, MapPin, Phone, Send, Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReferPatientDialog } from '@/components/hospital/clinical/refer-patient-dialog'
import { SharePatientDialog } from '@/components/hospital/clinical/share-patient-dialog'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import {
  buildChart, mrnFor, withRegisteredPatients,
  type PatientChart,
} from '@/components/hospital/clinical/clinical-data'
import {
  CHART_TAB_LIST, CHART_TAB_TRIGGER,
  LabsPanel, NotesPanel, OverviewVitals, PrescriptionsPanel, RecentAppointments, VitalsPanel,
  type ChartNote, type ChartVitalReading,
} from '@/components/hospital/clinical/patient-chart-tabs'
import { initials } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import type { Patient } from '@/services/patients.service'

const OUTLINE_ACTION = 'h-9 gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium shadow-none hover:bg-muted/60'
const COPILOT_ACTION = 'h-9 gap-1.5 rounded-lg bg-[#1f7a4d] px-3 text-white hover:bg-[#186540]'

function prettyGender(value: string): string {
  const text = value.trim()
  if (!text) return '—'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function displayMrn(id: string): string {
  const parts = mrnFor(id).replace(/^MRN-/, '').split('-')
  return `MRN ${parts.join(' ')}`
}

function toDialogPatient(chart: PatientChart): Patient {
  const admission = chart.admission
  const status = chart.patient.status
  return {
    id: chart.patient.id,
    patientId: displayMrn(chart.patient.id),
    patientCode: displayMrn(chart.patient.id),
    fullName: chart.patient.name,
    age: chart.patient.age,
    gender: prettyGender(chart.patient.gender),
    phone: chart.patient.phone,
    email: chart.patient.email,
    address: chart.patient.address,
    patientType: admission ? 'IN_HOSPITAL' : status === 'telehealth' ? 'TELEHEALTH' : 'OPD',
    knownAllergies: chart.patient.allergies,
    status: 'ACTIVE',
    primaryDoctor: admission ? { id: admission.doctor, name: admission.doctor } : null,
    department: admission ? { id: admission.ward, name: admission.ward } : null,
  }
}

function toReading(vital: PatientChart['vitals'][number]): ChartVitalReading {
  return {
    recordedAt: vital.recordedAt,
    heartRate: vital.heartRate,
    bloodPressureS: vital.bloodPressureS,
    bloodPressureD: vital.bloodPressureD,
    oxygenSat: vital.oxygenSat,
    temperature: vital.temperature,
    respiratoryRate: vital.respiratoryRate,
  }
}

export function ClinicalChartView({ patientId }: { patientId: string }) {
  const extraPatients = useClinicalStore((s) => s.patients)
  const extraNotes = useClinicalStore((s) => s.notes[patientId])
  const addNote = useClinicalStore((s) => s.addNote)
  const opd = useClinicalStore((s) => s.opd)
  const tele = useClinicalStore((s) => s.telehealth)
  const chart = useMemo(
    () => buildChart(patientId, extraNotes ?? [], opd, tele, withRegisteredPatients(extraPatients)),
    [patientId, extraNotes, opd, tele, extraPatients],
  )
  const [referring, setReferring] = useState(false)
  const [sharing, setSharing] = useState(false)

  if (!chart) return null

  const { patient, admission } = chart
  const dialogPatient = toDialogPatient(chart)
  const latest = chart.vitals[0]
  const backTo = admission ? '/doctor/inpatients' : '/doctor/patients'

  return (
    <div className="space-y-4" data-testid="doctor-patient-chart">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All patients
        </button>
        <span className="text-muted-foreground/70" aria-hidden>/</span>
        <span className="font-medium">{patient.name}</span>
      </div>

      <section className="rounded-xl border bg-card px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
              {initials(patient.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{patient.name}</h1>
                <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {admission ? 'In-Hospital' : patient.status === 'telehealth' ? 'Telehealth' : 'OP Patient'}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {displayMrn(patient.id)} · {patient.age}y · {prettyGender(patient.gender)}
                {patient.bloodGroup ? ` · ${patient.bloodGroup}` : ''}
                {admission ? ` · ${admission.ward}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden /> {patient.phone}</span>
                {patient.email ? <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden /> {patient.email}</span> : null}
                {patient.address ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden /> {patient.address}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className={OUTLINE_ACTION} onClick={() => setReferring(true)}>
              <Send className="size-4" aria-hidden /> Refer
            </Button>
            <Button type="button" variant="outline" className={OUTLINE_ACTION} onClick={() => setSharing(true)}>
              <Share2 className="size-4" aria-hidden /> Share
            </Button>
            <Button type="button" className={COPILOT_ACTION} onClick={() => navigate(`/doctor/ai/${patient.id}`)}>
              <Bot className="size-4" aria-hidden /> Ask Co-Pilot
            </Button>
          </div>
        </div>
      </section>

      {admission ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">
              Admitted — {admission.severity}
            </p>
            <p className="mt-1 text-base font-semibold">{admission.ward} · Bed {admission.bed}</p>
            <p className="text-sm text-muted-foreground">{admission.condition} · {admission.doctor}</p>
            <p className="text-sm text-muted-foreground">Since {new Date(admission.admitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1.5 rounded-lg border-emerald-200 text-emerald-700 shadow-none hover:bg-emerald-50"
            onClick={() => toast.success('Discharge recorded for this admission.')}
          >
            <DoorOpen className="size-4" aria-hidden /> Discharge
          </Button>
        </section>
      ) : null}

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className={CHART_TAB_LIST}>
          {['Overview', 'Vitals', 'Labs', 'Prescriptions', 'Notes'].map((tab) => (
            <TabsTrigger key={tab} value={tab.toLowerCase()} className={CHART_TAB_TRIGGER}>{tab}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <OverviewVitals reading={latest ? toReading(latest) : null} />
          <RecentAppointments items={chart.appointments.map((item) => ({
            id: item.id,
            scheduledAt: item.scheduledAt,
            purpose: item.purpose,
            doctorName: item.doctorName,
          }))} />
        </TabsContent>

        <TabsContent value="vitals">
          <VitalsPanel readings={chart.vitals.map(toReading)} />
        </TabsContent>

        <TabsContent value="labs">
          <LabsPanel labs={chart.labs.map((lab) => ({
            id: lab.id,
            testName: lab.testName,
            result: lab.result,
            normalRange: lab.normalRange,
            flag: lab.flag,
            reportedAt: lab.reportedAt,
          }))} />
        </TabsContent>

        <TabsContent value="prescriptions">
          <PrescriptionsPanel medications={chart.medications.map((med) => ({
            id: med.id,
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            active: med.active,
          }))} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesPanel
            notes={chart.notes.map((note) => ({
              id: note.id,
              content: note.content,
              category: note.category,
              createdAt: note.createdAt,
              doctorName: note.doctorName,
            }))}
            doctorName={admission?.doctor ?? 'Doctor'}
            onAdd={(note: ChartNote) => {
              const key = note.category.toLowerCase()
              const category = key === 'rounds' || key === 'consultation' || key === 'telehealth' ? key : 'general'
              addNote(patient.id, {
                id: note.id,
                content: note.content,
                category,
                createdAt: note.createdAt,
                doctorName: note.doctorName,
              })
            }}
          />
        </TabsContent>
      </Tabs>

      <ReferPatientDialog
        patient={dialogPatient}
        open={referring}
        onOpenChange={setReferring}
        onSent={() => undefined}
      />
      <SharePatientDialog
        patient={dialogPatient}
        currentDoctor={admission?.doctor}
        open={sharing}
        onOpenChange={setSharing}
      />
    </div>
  )
}
