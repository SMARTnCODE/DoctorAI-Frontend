'use client'

import { create } from 'zustand'
import {
  OPD, TELEHEALTH, type Appointment, type ClinicalNote, type PatientSummary, type VisitStatus,
} from '@/components/hospital/clinical/clinical-data'

interface ClinicalState {
  opd: Appointment[]
  telehealth: Appointment[]
  notes: Record<string, ClinicalNote[]>
  patients: PatientSummary[]
  directoryQuery: string
  patientsRevision: number
  setDirectoryQuery: (query: string) => void
  bumpPatients: () => void
  addPatient: (patient: PatientSummary) => void
  setVisitStatus: (kind: 'opd' | 'telehealth', id: string, status: VisitStatus) => void
  addAppointment: (kind: 'opd' | 'telehealth', row: Appointment) => void
  rescheduleAppointment: (kind: 'opd' | 'telehealth', id: string, patch: Partial<Pick<Appointment, 'scheduledAt' | 'doctorName' | 'specialty' | 'purpose' | 'durationMin'>>) => void
  addNote: (patientId: string, note: ClinicalNote) => void
}

export const useClinicalStore = create<ClinicalState>((set) => ({
  opd: OPD,
  telehealth: TELEHEALTH,
  notes: {},
  patients: [],
  directoryQuery: '',
  patientsRevision: 0,
  setDirectoryQuery: (directoryQuery) => set({ directoryQuery }),
  bumpPatients: () => set((state) => ({ patientsRevision: state.patientsRevision + 1 })),
  addPatient: (patient) => set((state) => ({ patients: [...state.patients, patient] })),
  setVisitStatus: (kind, id, status) => set((state) => {
    if (kind === 'opd') {
      return { opd: state.opd.map((row) => (row.id === id ? { ...row, status } : row)) }
    }
    return { telehealth: state.telehealth.map((row) => (row.id === id ? { ...row, status } : row)) }
  }),
  addAppointment: (kind, row) => set((state) => (
    kind === 'opd' ? { opd: [...state.opd, row] } : { telehealth: [...state.telehealth, row] }
  )),
  rescheduleAppointment: (kind, id, patch) => set((state) => {
    const apply = (rows: Appointment[]) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    return kind === 'opd' ? { opd: apply(state.opd) } : { telehealth: apply(state.telehealth) }
  }),
  addNote: (patientId, note) => set((state) => ({
    notes: { ...state.notes, [patientId]: [note, ...(state.notes[patientId] ?? [])] },
  })),
}))
