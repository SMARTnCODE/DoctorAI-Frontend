/**
 * Clinical board for the doctor portal, shaped like the MediCare prototype
 * (dashboard, wards, OPD, telehealth, records). Dates are shifted so the
 * prototype's clinic day lands on the doctor's local today.
 */

const ANCHOR = Date.parse('2026-09-10T00:00:00.000Z')

function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

const SHIFT = startOfLocalDay(Date.now()) - startOfLocalDay(ANCHOR)

function at(iso: string): string {
  return new Date(Date.parse(iso) + SHIFT).toISOString()
}

export type Severity = 'stable' | 'moderate' | 'critical'
export type VisitStatus = 'scheduled' | 'checked-in' | 'in-progress' | 'completed' | 'no-show'
export type PatientStatus = 'admitted' | 'outpatient' | 'telehealth'
export type LabFlag = 'normal' | 'high' | 'low' | 'critical'

export interface Vital {
  heartRate: number
  bloodPressureS: number
  bloodPressureD: number
  oxygenSat: number
  temperature: number
  respiratoryRate?: number
  recordedAt: string
}

export interface Admission {
  id: string
  patientId: string
  patientName: string
  age: number
  gender: string
  ward: string
  bed: string
  condition: string
  severity: Severity
  admitDate: string
  doctor: string
  specialty: string
  latestVital: Vital
}

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  age: number
  gender: string
  phone: string
  doctorName: string
  specialty: string
  scheduledAt: string
  durationMin: number
  status: VisitStatus
  purpose: string
  bloodGroup: string | null
  roomUrl?: string | null
}

export interface PatientSummary {
  id: string
  name: string
  age: number
  gender: string
  bloodGroup: string | null
  phone: string
  email: string | null
  address: string | null
  allergies: string | null
  status: PatientStatus
}

export interface LabResult {
  id: string
  testName: string
  result: string
  normalRange: string
  flag: LabFlag
  status: 'completed' | 'pending'
  reportedAt: string
}

export interface Medication {
  id: string
  name: string
  dosage: string
  frequency: string
  active: boolean
}

export interface ClinicalNote {
  id: string
  content: string
  category: 'general' | 'rounds' | 'consultation' | 'telehealth'
  createdAt: string
  doctorName: string
}

export interface PatientAppointment {
  id: string
  type: 'OPD' | 'Telehealth'
  scheduledAt: string
  status: string
  purpose: string
  doctorName: string
}

export interface PatientChart {
  patient: PatientSummary
  admission: Admission | null
  vitals: Vital[]
  labs: LabResult[]
  medications: Medication[]
  notes: ClinicalNote[]
  appointments: PatientAppointment[]
}

export interface ClinicalAlert {
  id: string
  type: 'lab' | 'critical'
  severity: 'critical' | 'high'
  title: string
  description: string
  patientId: string
  createdAt: string
}

export const DOCTORS = [
  { id: 'anita', name: 'Dr. Anita Deshmukh', specialty: 'Cardiology' },
  { id: 'meera', name: 'Dr. Meera Iyer', specialty: 'Pediatrics' },
  { id: 'priya', name: 'Dr. Priya Nair', specialty: 'General Medicine' },
  { id: 'rajesh', name: 'Dr. Rajesh Khanna', specialty: 'Neurology' },
  { id: 'samuel', name: 'Dr. Samuel Thomas', specialty: 'Orthopedics' },
  { id: 'vikram', name: 'Dr. Vikram Rao', specialty: 'Dermatology' },
] as const

export const ADMISSIONS: Admission[] = [
  { id: 'a-rohan', patientId: 'rohan', patientName: 'Rohan Johnson', age: 82, gender: 'male', ward: 'ICU', bed: '12A', condition: 'Cholecystitis', severity: 'stable', admitDate: at('2026-09-04T10:44:06.894Z'), doctor: 'Dr. Anita Deshmukh', specialty: 'Cardiology', latestVital: { heartRate: 71, bloodPressureS: 141, bloodPressureD: 96, oxygenSat: 92, temperature: 38.2, respiratoryRate: 18, recordedAt: at('2026-09-08T21:44:06.934Z') } },
  { id: 'a-diya', patientId: 'diya', patientName: 'Diya Garcia', age: 80, gender: 'female', ward: 'CCU', bed: '24A', condition: 'Type 2 Diabetes', severity: 'stable', admitDate: at('2026-09-02T10:44:06.897Z'), doctor: 'Dr. Vikram Rao', specialty: 'Dermatology', latestVital: { heartRate: 82, bloodPressureS: 155, bloodPressureD: 92, oxygenSat: 98, temperature: 37.7, respiratoryRate: 16, recordedAt: at('2026-09-10T05:44:06.943Z') } },
  { id: 'a-ishaan', patientId: 'ishaan', patientName: 'Ishaan Kumar', age: 30, gender: 'male', ward: 'General', bed: '7A', condition: 'Type 2 Diabetes', severity: 'stable', admitDate: at('2026-08-31T10:44:06.898Z'), doctor: 'Dr. Priya Nair', specialty: 'General Medicine', latestVital: { heartRate: 93, bloodPressureS: 149, bloodPressureD: 60, oxygenSat: 91, temperature: 38.5, respiratoryRate: 20, recordedAt: at('2026-09-10T06:44:06.945Z') } },
  { id: 'a-priya', patientId: 'priya-rao', patientName: 'Priya Rao', age: 57, gender: 'male', ward: 'A-Ward', bed: '6B', condition: 'Acute bronchitis', severity: 'moderate', admitDate: at('2026-09-08T10:44:06.901Z'), doctor: 'Dr. Samuel Thomas', specialty: 'Orthopedics', latestVital: { heartRate: 81, bloodPressureS: 111, bloodPressureD: 78, oxygenSat: 96, temperature: 36.6, respiratoryRate: 18, recordedAt: at('2026-09-10T00:44:06.947Z') } },
  { id: 'a-aanya', patientId: 'aanya', patientName: 'Aanya Reddy', age: 43, gender: 'female', ward: 'General', bed: '16C', condition: 'Cholecystitis', severity: 'moderate', admitDate: at('2026-09-08T10:44:06.890Z'), doctor: 'Dr. Rajesh Khanna', specialty: 'Neurology', latestVital: { heartRate: 63, bloodPressureS: 138, bloodPressureD: 80, oxygenSat: 94, temperature: 38.1, respiratoryRate: 17, recordedAt: at('2026-09-09T00:44:06.932Z') } },
  { id: 'a-michael', patientId: 'michael-n', patientName: 'Michael Nair', age: 40, gender: 'female', ward: 'CCU', bed: '17A', condition: 'Fracture recovery', severity: 'moderate', admitDate: at('2026-09-06T10:44:06.895Z'), doctor: 'Dr. Rajesh Khanna', specialty: 'Neurology', latestVital: { heartRate: 72, bloodPressureS: 121, bloodPressureD: 100, oxygenSat: 93, temperature: 39, respiratoryRate: 22, recordedAt: at('2026-09-10T07:44:06.938Z') } },
  { id: 'a-vivaan-s', patientId: 'vivaan-s', patientName: 'Vivaan Sharma', age: 51, gender: 'female', ward: 'A-Ward', bed: '18A', condition: 'Gastroenteritis', severity: 'moderate', admitDate: at('2026-08-30T10:44:06.887Z'), doctor: 'Dr. Priya Nair', specialty: 'General Medicine', latestVital: { heartRate: 98, bloodPressureS: 139, bloodPressureD: 80, oxygenSat: 97, temperature: 38.5, respiratoryRate: 19, recordedAt: at('2026-09-08T18:44:06.905Z') } },
  { id: 'a-saanvi', patientId: 'saanvi', patientName: 'Saanvi Jones', age: 87, gender: 'female', ward: 'General', bed: '10C', condition: 'Migraine management', severity: 'moderate', admitDate: at('2026-08-28T10:44:06.896Z'), doctor: 'Dr. Priya Nair', specialty: 'General Medicine', latestVital: { heartRate: 98, bloodPressureS: 125, bloodPressureD: 73, oxygenSat: 97, temperature: 38.6, respiratoryRate: 23, recordedAt: at('2026-09-10T06:44:06.940Z') } },
  { id: 'a-patricia', patientId: 'patricia', patientName: 'Patricia Patel', age: 57, gender: 'female', ward: 'A-Ward', bed: '8B', condition: 'CKD stage 3', severity: 'moderate', admitDate: at('2026-08-28T10:44:06.885Z'), doctor: 'Dr. Anita Deshmukh', specialty: 'Cardiology', latestVital: { heartRate: 102, bloodPressureS: 118, bloodPressureD: 78, oxygenSat: 95, temperature: 37.6, respiratoryRate: 18, recordedAt: at('2026-09-09T05:44:06.902Z') } },
  { id: 'a-vivaan-j', patientId: 'vivaan-j', patientName: 'Vivaan Johnson', age: 35, gender: 'female', ward: 'ICU', bed: '17C', condition: 'Gastroenteritis', severity: 'critical', admitDate: at('2026-09-06T10:44:06.888Z'), doctor: 'Dr. Vikram Rao', specialty: 'Dermatology', latestVital: { heartRate: 95, bloodPressureS: 108, bloodPressureD: 63, oxygenSat: 96, temperature: 36.7, respiratoryRate: 24, recordedAt: at('2026-09-10T04:44:06.907Z') } },
  { id: 'a-reyansh', patientId: 'reyansh', patientName: 'Reyansh Gupta', age: 77, gender: 'male', ward: 'CCU', bed: '23C', condition: 'Gastroenteritis', severity: 'critical', admitDate: at('2026-09-03T10:44:06.889Z'), doctor: 'Dr. Meera Iyer', specialty: 'Pediatrics', latestVital: { heartRate: 105, bloodPressureS: 130, bloodPressureD: 60, oxygenSat: 98, temperature: 37.4, respiratoryRate: 22, recordedAt: at('2026-09-10T09:44:06.910Z') } },
]

export const OPD: Appointment[] = [
  { id: 'o1', patientId: 'sara', patientName: 'Sara Williams', age: 43, gender: 'female', phone: '+91 9696000747', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-10T09:00:00.000Z'), durationMin: 30, status: 'completed', purpose: 'Vaccination', bloodGroup: 'AB+' },
  { id: 'o2', patientId: 'vivaan-j', patientName: 'Vivaan Johnson', age: 35, gender: 'female', phone: '+91 9259204428', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-10T09:30:00.000Z'), durationMin: 30, status: 'completed', purpose: 'Allergy consultation', bloodGroup: 'O+' },
  { id: 'o3', patientId: 'michael-n', patientName: 'Michael Nair', age: 40, gender: 'female', phone: '+91 9590294113', doctorName: 'Dr. Vikram Rao', specialty: 'Dermatology', scheduledAt: at('2026-09-10T10:00:00.000Z'), durationMin: 30, status: 'completed', purpose: 'Skin biopsy review', bloodGroup: 'AB-' },
  { id: 'o4', patientId: 'james', patientName: 'James Patel', age: 75, gender: 'male', phone: '+91 9532933461', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-10T11:00:00.000Z'), durationMin: 30, status: 'in-progress', purpose: 'Follow-up consultation', bloodGroup: 'A-' },
  { id: 'o5', patientId: 'james-l', patientName: 'James Lopez', age: 69, gender: 'male', phone: '+91 9446984798', doctorName: 'Dr. Priya Nair', specialty: 'General Medicine', scheduledAt: at('2026-09-10T11:30:00.000Z'), durationMin: 30, status: 'checked-in', purpose: 'Routine checkup', bloodGroup: 'AB-' },
  { id: 'o6', patientId: 'anika', patientName: 'Anika Johnson', age: 80, gender: 'male', phone: '+91 9553323399', doctorName: 'Dr. Meera Iyer', specialty: 'Pediatrics', scheduledAt: at('2026-09-10T12:00:00.000Z'), durationMin: 30, status: 'scheduled', purpose: 'Skin biopsy review', bloodGroup: 'B-' },
  { id: 'o7', patientId: 'kavya', patientName: 'Kavya Williams', age: 75, gender: 'female', phone: '+91 9369997527', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-10T12:30:00.000Z'), durationMin: 30, status: 'no-show', purpose: 'Follow-up consultation', bloodGroup: 'AB-' },
  { id: 'o8', patientId: 'aditya', patientName: 'Aditya Hernandez', age: 42, gender: 'female', phone: '+91 9897858519', doctorName: 'Dr. Samuel Thomas', specialty: 'Orthopedics', scheduledAt: at('2026-09-10T13:00:00.000Z'), durationMin: 30, status: 'scheduled', purpose: 'Skin biopsy review', bloodGroup: 'AB+' },
  { id: 'o9', patientId: 'saanvi', patientName: 'Saanvi Jones', age: 87, gender: 'female', phone: '+91 9525371595', doctorName: 'Dr. Samuel Thomas', specialty: 'Orthopedics', scheduledAt: at('2026-09-10T14:00:00.000Z'), durationMin: 30, status: 'checked-in', purpose: 'ECG review', bloodGroup: 'AB-' },
  { id: 'o10', patientId: 'aanya-p', patientName: 'Aanya Patel', age: 44, gender: 'male', phone: '+91 9928105510', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-11T10:00:00.000Z'), durationMin: 30, status: 'scheduled', purpose: 'Routine checkup', bloodGroup: 'B-' },
  { id: 'o11', patientId: 'kavya', patientName: 'Kavya Williams', age: 75, gender: 'female', phone: '+91 9369997527', doctorName: 'Dr. Samuel Thomas', specialty: 'Orthopedics', scheduledAt: at('2026-09-11T16:00:00.000Z'), durationMin: 30, status: 'scheduled', purpose: 'Medication adjustment', bloodGroup: 'AB-' },
  { id: 'o12', patientId: 'reyansh', patientName: 'Reyansh Gupta', age: 77, gender: 'male', phone: '+91 9370011911', doctorName: 'Dr. Vikram Rao', specialty: 'Dermatology', scheduledAt: at('2026-09-13T16:15:00.000Z'), durationMin: 30, status: 'scheduled', purpose: 'Routine checkup', bloodGroup: 'AB-' },
]

export const TELEHEALTH: Appointment[] = [
  { id: 't1', patientId: 'anika-k', patientName: 'Anika Kumar', age: 4, gender: 'female', phone: '+91 9160248257', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-10T10:30:00.000Z'), durationMin: 20, status: 'completed', purpose: 'Virtual follow-up', bloodGroup: null, roomUrl: null },
  { id: 't2', patientId: 'aditya-g', patientName: 'Aditya Garcia', age: 16, gender: 'male', phone: '+91 9186386437', doctorName: 'Dr. Samuel Thomas', specialty: 'Orthopedics', scheduledAt: at('2026-09-10T11:00:00.000Z'), durationMin: 20, status: 'scheduled', purpose: 'Tele-consultation', bloodGroup: null, roomUrl: null },
  { id: 't3', patientId: 'kiara', patientName: 'Kiara Nair', age: 60, gender: 'female', phone: '+91 9894000520', doctorName: 'Dr. Meera Iyer', specialty: 'Pediatrics', scheduledAt: at('2026-09-10T12:30:00.000Z'), durationMin: 20, status: 'in-progress', purpose: 'Tele-consultation', bloodGroup: null, roomUrl: null },
  { id: 't4', patientId: 'john', patientName: 'John Nair', age: 84, gender: 'male', phone: '+91 9147534859', doctorName: 'Dr. Vikram Rao', specialty: 'Dermatology', scheduledAt: at('2026-09-10T13:00:00.000Z'), durationMin: 20, status: 'scheduled', purpose: 'Virtual follow-up', bloodGroup: null, roomUrl: null },
  { id: 't5', patientId: 'mary', patientName: 'Mary Lopez', age: 40, gender: 'male', phone: '+91 9983836322', doctorName: 'Dr. Priya Nair', specialty: 'General Medicine', scheduledAt: at('2026-09-10T14:00:00.000Z'), durationMin: 20, status: 'scheduled', purpose: 'Medication review', bloodGroup: null, roomUrl: null },
  { id: 't6', patientId: 'aanya', patientName: 'Aanya Reddy', age: 43, gender: 'female', phone: '+91 9177969472', doctorName: 'Dr. Vikram Rao', specialty: 'Dermatology', scheduledAt: at('2026-09-10T14:30:00.000Z'), durationMin: 20, status: 'scheduled', purpose: 'Report review', bloodGroup: null, roomUrl: null },
  { id: 't7', patientId: 'kiara', patientName: 'Kiara Nair', age: 60, gender: 'female', phone: '+91 9894000520', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-12T15:45:00.000Z'), durationMin: 20, status: 'scheduled', purpose: 'Report review', bloodGroup: null, roomUrl: null },
  { id: 't8', patientId: 'sravanthi', patientName: 'Sravanthi', age: 45, gender: 'male', phone: '+91 9381370888', doctorName: 'Dr. Anita Deshmukh', specialty: 'Cardiology', scheduledAt: at('2026-09-18T08:30:00.000Z'), durationMin: 20, status: 'scheduled', purpose: 'Tele-consultation', bloodGroup: 'O+', roomUrl: null },
]

export const PATIENTS: PatientSummary[] = [
  { id: 'saanvi', name: 'Saanvi Jones', age: 87, gender: 'female', bloodGroup: 'AB-', phone: '+91 9525371595', email: 'saanvi.jones@mail.com', address: '28 Park Street, Delhi', allergies: null, status: 'admitted' },
  { id: 'vivaan-j', name: 'Vivaan Johnson', age: 35, gender: 'female', bloodGroup: 'O+', phone: '+91 9259204428', email: 'vivaan.johnson@mail.com', address: '14 Lake View, Mumbai', allergies: 'Penicillin', status: 'admitted' },
  { id: 'reyansh', name: 'Reyansh Gupta', age: 77, gender: 'male', bloodGroup: 'AB-', phone: '+91 9370011911', email: 'reyansh.gupta@mail.com', address: '9 Hill Side, Bengaluru', allergies: null, status: 'admitted' },
  { id: 'rohan', name: 'Rohan Johnson', age: 82, gender: 'male', bloodGroup: 'A+', phone: '+91 9811122233', email: 'rohan.johnson@mail.com', address: '4 MG Road, Pune', allergies: null, status: 'admitted' },
  { id: 'diya', name: 'Diya Garcia', age: 80, gender: 'female', bloodGroup: 'B+', phone: '+91 9822233344', email: 'diya.garcia@mail.com', address: '18 Gandhi Nagar, Chennai', allergies: 'Latex', status: 'admitted' },
  { id: 'ishaan', name: 'Ishaan Kumar', age: 30, gender: 'male', bloodGroup: 'O+', phone: '+91 9833344455', email: 'ishaan.kumar@mail.com', address: '55 Park Street, Delhi', allergies: null, status: 'admitted' },
  { id: 'priya-rao', name: 'Priya Rao', age: 57, gender: 'male', bloodGroup: 'B+', phone: '+91 9776827465', email: 'priya.rao@mail.com', address: '49 Lake View, Bengaluru', allergies: 'Peanuts', status: 'admitted' },
  { id: 'aanya', name: 'Aanya Reddy', age: 43, gender: 'female', bloodGroup: 'B-', phone: '+91 9177969472', email: 'aanya.reddy@mail.com', address: '83 Gandhi Nagar, Pune', allergies: null, status: 'admitted' },
  { id: 'michael-n', name: 'Michael Nair', age: 40, gender: 'female', bloodGroup: 'AB-', phone: '+91 9590294113', email: 'michael.nair@mail.com', address: '100 Lake View, Pune', allergies: null, status: 'admitted' },
  { id: 'vivaan-s', name: 'Vivaan Sharma', age: 51, gender: 'female', bloodGroup: 'A+', phone: '+91 9900011122', email: 'vivaan.sharma@mail.com', address: '22 Hill Side, Hyderabad', allergies: null, status: 'admitted' },
  { id: 'patricia', name: 'Patricia Patel', age: 57, gender: 'female', bloodGroup: 'O-', phone: '+91 9810099887', email: 'patricia.patel@mail.com', address: '7 MG Road, Mumbai', allergies: null, status: 'admitted' },
  { id: 'sara', name: 'Sara Williams', age: 43, gender: 'female', bloodGroup: 'AB+', phone: '+91 9696000747', email: 'sara.williams@mail.com', address: '29 MG Road, Chennai', allergies: null, status: 'outpatient' },
  { id: 'james', name: 'James Patel', age: 75, gender: 'male', bloodGroup: 'A-', phone: '+91 9532933461', email: 'james.patel@mail.com', address: '12 Park Street, Delhi', allergies: null, status: 'outpatient' },
  { id: 'james-l', name: 'James Lopez', age: 69, gender: 'male', bloodGroup: 'AB-', phone: '+91 9446984798', email: 'james.lopez@mail.com', address: '61 Lake View, Pune', allergies: null, status: 'outpatient' },
  { id: 'anika', name: 'Anika Johnson', age: 80, gender: 'male', bloodGroup: 'B-', phone: '+91 9553323399', email: 'anika.johnson@mail.com', address: '3 Gandhi Nagar, Delhi', allergies: null, status: 'outpatient' },
  { id: 'kavya', name: 'Kavya Williams', age: 75, gender: 'female', bloodGroup: 'AB-', phone: '+91 9369997527', email: 'kavya.williams@mail.com', address: '40 MG Road, Mumbai', allergies: null, status: 'outpatient' },
  { id: 'aditya', name: 'Aditya Hernandez', age: 42, gender: 'female', bloodGroup: 'AB+', phone: '+91 9897858519', email: 'aditya.hernandez@mail.com', address: '133 Hill Side, Bengaluru', allergies: null, status: 'outpatient' },
  { id: 'aanya-p', name: 'Aanya Patel', age: 44, gender: 'male', bloodGroup: 'B-', phone: '+91 9928105510', email: 'aanya.patel@mail.com', address: '8 Park Street, Chennai', allergies: null, status: 'outpatient' },
  { id: 'kiara', name: 'Kiara Nair', age: 60, gender: 'female', bloodGroup: 'O+', phone: '+91 9894000520', email: 'kiara.nair@mail.com', address: '19 Lake View, Hyderabad', allergies: null, status: 'telehealth' },
  { id: 'sravanthi', name: 'Sravanthi', age: 45, gender: 'male', bloodGroup: 'O+', phone: '+91 9381370888', email: 'sravanthi@gmail.com', address: 'Jubilee Hills, Hyderabad', allergies: null, status: 'telehealth' },
  { id: 'anika-k', name: 'Anika Kumar', age: 4, gender: 'female', bloodGroup: 'A+', phone: '+91 9160248257', email: null, address: '2 Gandhi Nagar, Pune', allergies: null, status: 'telehealth' },
  { id: 'mary', name: 'Mary Lopez', age: 40, gender: 'male', bloodGroup: 'AB-', phone: '+91 9983836322', email: 'mary.lopez@mail.com', address: '31 Park Street, Mumbai', allergies: null, status: 'telehealth' },
  { id: 'john', name: 'John Nair', age: 84, gender: 'male', bloodGroup: 'B+', phone: '+91 9147534859', email: 'john.nair@mail.com', address: '77 MG Road, Delhi', allergies: 'Sulfa', status: 'telehealth' },
  { id: 'aditya-g', name: 'Aditya Garcia', age: 16, gender: 'male', bloodGroup: 'B+', phone: '+91 9186386437', email: 'aditya.garcia@mail.com', address: '5 Hill Side, Chennai', allergies: null, status: 'telehealth' },
  { id: 'william', name: 'William Rao', age: 76, gender: 'male', bloodGroup: 'O-', phone: '+91 9763029624', email: 'william.rao@mail.com', address: '23 Park Street, Delhi', allergies: null, status: 'outpatient' },
]

export interface AbnormalLab {
  id: string
  patientId: string
  patientName: string
  testName: string
  result: string
  flag: LabFlag
  reportedAt: string
}

/** Labs surfaced on the clinical dashboard urgent-alert list. */
export const ABNORMAL_LABS: AbnormalLab[] = [
  { id: 'lab-k', patientId: 'saanvi', patientName: 'Saanvi Jones', testName: 'Potassium', result: '5.8 mmol/L', flag: 'high', reportedAt: at('2026-09-09T10:44:07.093Z') },
  { id: 'lab-creat-w', patientId: 'william', patientName: 'William Rao', testName: 'Creatinine', result: '2 mg/dL', flag: 'critical', reportedAt: at('2026-09-08T10:44:07.060Z') },
  { id: 'lab-na', patientId: 'james', patientName: 'James Patel', testName: 'Sodium', result: '148.6 mmol/L', flag: 'high', reportedAt: at('2026-09-08T10:44:06.969Z') },
  { id: 'lab-tsh-v', patientId: 'vivaan-s', patientName: 'Vivaan Sharma', testName: 'TSH', result: '8 mIU/L', flag: 'critical', reportedAt: at('2026-09-06T10:44:07.002Z') },
  { id: 'lab-cbc', patientId: 'patricia', patientName: 'Patricia Patel', testName: 'Complete Blood Count', result: '12.5 10^9/L', flag: 'high', reportedAt: at('2026-09-06T10:44:06.979Z') },
  { id: 'lab-tsh-a', patientId: 'aditya', patientName: 'Aditya Hernandez', testName: 'TSH', result: '5.7 mIU/L', flag: 'critical', reportedAt: at('2026-09-05T10:44:07.066Z') },
]

const SAANVI_LABS: LabResult[] = [
  { id: 'l1', testName: 'Potassium', result: '5.8 mmol/L', normalRange: '3.5–5.0', flag: 'high', status: 'completed', reportedAt: at('2026-09-09T10:44:07.093Z') },
  { id: 'l2', testName: 'Hemoglobin', result: '11 g/dL', normalRange: '12.0–17.0', flag: 'low', status: 'completed', reportedAt: at('2026-08-28T10:44:07.095Z') },
  { id: 'l3', testName: 'Complete Blood Count', result: '13.9 10^9/L', normalRange: '4.0–11.0', flag: 'high', status: 'pending', reportedAt: at('2026-08-17T10:44:07.093Z') },
  { id: 'l4', testName: 'Creatinine', result: '1.6 mg/dL', normalRange: '0.6–1.2', flag: 'high', status: 'completed', reportedAt: at('2026-08-14T10:44:07.094Z') },
]

const SAANVI_MEDS: Medication[] = [
  { id: 'm1', name: 'Salbutamol Inhaler', dosage: '200mcg', frequency: '2 puffs PRN', active: true },
  { id: 'm2', name: 'Aspirin', dosage: '75mg', frequency: 'Once daily', active: true },
  { id: 'm3', name: 'Omeprazole', dosage: '20mg', frequency: 'Once before breakfast', active: true },
]

const SAANVI_NOTES: ClinicalNote[] = [
  { id: 'n1', content: 'Patient alert and oriented. Tolerating oral intake. Plan discharge in 2 days if stable.', category: 'rounds', createdAt: at('2026-09-08T21:44:07.203Z'), doctorName: 'Dr. Anita Deshmukh' },
]

const EXTRA_LABS: Record<string, LabResult[]> = {
  william: [
    { id: 'lw1', testName: 'Creatinine', result: '2 mg/dL', normalRange: '0.6–1.2', flag: 'critical', status: 'completed', reportedAt: at('2026-09-08T10:44:07.060Z') },
  ],
  'vivaan-j': [
    { id: 'lj1', testName: 'Sodium', result: '148.6 mmol/L', normalRange: '135–145', flag: 'high', status: 'completed', reportedAt: at('2026-09-08T10:44:06.969Z') },
  ],
  'vivaan-s': [
    { id: 'ls1', testName: 'TSH', result: '8 mIU/L', normalRange: '0.4–4.0', flag: 'critical', status: 'completed', reportedAt: at('2026-09-06T10:44:07.002Z') },
  ],
  patricia: [
    { id: 'lp1', testName: 'Complete Blood Count', result: '12.5 10^9/L', normalRange: '4.0–11.0', flag: 'high', status: 'completed', reportedAt: at('2026-09-06T10:44:06.979Z') },
    { id: 'lp2', testName: 'Creatinine', result: '2.1 mg/dL', normalRange: '0.6–1.2', flag: 'critical', status: 'completed', reportedAt: at('2026-09-07T10:44:07.000Z') },
  ],
  james: [
    { id: 'lja1', testName: 'Sodium', result: '148.6 mmol/L', normalRange: '135–145', flag: 'high', status: 'completed', reportedAt: at('2026-09-08T10:44:06.969Z') },
  ],
  reyansh: [
    { id: 'lr1', testName: 'Creatinine', result: '1.8 mg/dL', normalRange: '0.6–1.2', flag: 'high', status: 'completed', reportedAt: at('2026-09-05T10:44:07.000Z') },
  ],
}

export const ALERTS: ClinicalAlert[] = [
  { id: 'lab-creat', type: 'lab', severity: 'critical', title: 'Abnormal lab: Creatinine', description: 'Patricia Patel · 2.1 mg/dL (critical)', patientId: 'patricia', createdAt: at('2026-09-08T10:44:07.060Z') },
  { id: 'lab-tsh', type: 'lab', severity: 'critical', title: 'Abnormal lab: TSH', description: 'Vivaan Sharma · 8 mIU/L (critical)', patientId: 'vivaan-s', createdAt: at('2026-09-06T10:44:07.002Z') },
  { id: 'crit-vivaan', type: 'critical', severity: 'critical', title: 'Critical: Vivaan Johnson', description: 'ICU · Bed 17C · Gastroenteritis', patientId: 'vivaan-j', createdAt: at('2026-09-06T10:44:06.888Z') },
  { id: 'crit-reyansh', type: 'critical', severity: 'critical', title: 'Critical: Reyansh Gupta', description: 'CCU · Bed 23C · Gastroenteritis', patientId: 'reyansh', createdAt: at('2026-09-03T10:44:06.889Z') },
  { id: 'lab-k', type: 'lab', severity: 'high', title: 'Abnormal lab: Potassium', description: 'Saanvi Jones · 5.8 mmol/L (high)', patientId: 'saanvi', createdAt: at('2026-09-09T10:44:07.093Z') },
  { id: 'lab-na', type: 'lab', severity: 'high', title: 'Abnormal lab: Sodium', description: 'James Patel · 148.6 mmol/L (high)', patientId: 'james', createdAt: at('2026-09-08T10:44:06.969Z') },
  { id: 'lab-cbc', type: 'lab', severity: 'high', title: 'Abnormal lab: Complete Blood Count', description: 'Patricia Patel · 12.5 10^9/L (high)', patientId: 'patricia', createdAt: at('2026-09-06T10:44:06.979Z') },
]

export function isSameLocalDay(iso: string, ref = new Date()): boolean {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate()
}

export function isAfterToday(iso: string, ref = new Date()): boolean {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)
  return new Date(iso).getTime() >= start.getTime()
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function patientById(id: string): PatientSummary | undefined {
  return PATIENTS.find((p) => p.id === id)
}

/** Charts opened outside the records table can still resolve sample patients. */
export function withRegisteredPatients(added: readonly PatientSummary[]): PatientSummary[] {
  if (added.length === 0) return PATIENTS
  const ids = new Set(added.map((patient) => patient.id))
  return [...added, ...PATIENTS.filter((patient) => !ids.has(patient.id))]
}

/** Stable chart number so search and referrals can show an MRN without a backend. */
export function mrnFor(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const n = h >>> 0
  const left = String(1000 + (n % 9000))
  const right = String(1000 + ((n >>> 10) % 9000))
  return `MRN-${left}-${right}`
}

export function admissionFor(patientId: string): Admission | undefined {
  return ADMISSIONS.find((a) => a.patientId === patientId)
}

function synthMeds(patientId: string): Medication[] {
  if (patientId === 'saanvi') return SAANVI_MEDS
  const admission = admissionFor(patientId)
  if (!admission) return []
  return [
    { id: `${patientId}-m1`, name: 'Paracetamol', dosage: '500mg', frequency: 'Every 8 hours if febrile', active: true },
    { id: `${patientId}-m2`, name: 'Pantoprazole', dosage: '40mg', frequency: 'Once daily', active: true },
  ]
}

function synthNotes(patientId: string, doctor: string): ClinicalNote[] {
  if (patientId === 'saanvi') return SAANVI_NOTES
  const admission = admissionFor(patientId)
  if (!admission) return []
  return [{
    id: `${patientId}-n1`,
    content: `${admission.condition}. Reviewed on the ward. Continue current plan and repeat vitals this evening.`,
    category: 'rounds',
    createdAt: admission.latestVital.recordedAt,
    doctorName: doctor,
  }]
}

export function buildChart(
  patientId: string,
  extraNotes: ClinicalNote[] = [],
  opd: Appointment[] = OPD,
  tele: Appointment[] = TELEHEALTH,
  roster: readonly PatientSummary[] = PATIENTS,
): PatientChart | null {
  const patient = roster.find((p) => p.id === patientId)
  if (!patient) return null
  const admission = admissionFor(patientId) ?? null
  const vitals = admission
    ? [admission.latestVital, {
        ...admission.latestVital,
        heartRate: Math.max(55, admission.latestVital.heartRate - 6),
        temperature: Math.round((admission.latestVital.temperature - 0.4) * 10) / 10,
        recordedAt: new Date(Date.parse(admission.latestVital.recordedAt) - 36 * 3600 * 1000).toISOString(),
      }]
    : []
  const labs = patientId === 'saanvi' ? SAANVI_LABS : (EXTRA_LABS[patientId] ?? [])
  const appointments: PatientAppointment[] = [
    ...opd.filter((a) => a.patientId === patientId).map((a) => ({
      id: a.id, type: 'OPD' as const, scheduledAt: a.scheduledAt, status: a.status, purpose: a.purpose, doctorName: a.doctorName,
    })),
    ...tele.filter((a) => a.patientId === patientId).map((a) => ({
      id: a.id, type: 'Telehealth' as const, scheduledAt: a.scheduledAt, status: a.status, purpose: a.purpose, doctorName: a.doctorName,
    })),
  ].sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt))

  return {
    patient,
    admission,
    vitals,
    labs,
    medications: synthMeds(patientId),
    notes: [...extraNotes, ...synthNotes(patientId, admission?.doctor ?? 'Dr. Priya Nair')],
    appointments,
  }
}

export function weekTrend(opd: Appointment[], tele: Appointment[]): { date: string; opd: number; tele: number }[] {
  const days: { date: string; opd: number; tele: number }[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 6)
  for (let i = 0; i < 7; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    const label = day.toLocaleDateString('en-GB', { weekday: 'short' })
    days.push({
      date: label,
      opd: opd.filter((a) => isSameLocalDay(a.scheduledAt, day)).length,
      tele: tele.filter((a) => isSameLocalDay(a.scheduledAt, day)).length,
    })
  }
  return days
}
