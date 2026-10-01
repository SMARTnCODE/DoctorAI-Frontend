export { authService } from '@/services/auth.service'
export type {
  SignupPayload,
  LoginPayload,
  AuthAccountData,
  ActivateAccountPayload,
  ChangePasswordPayload,
} from '@/services/auth.service'

export { departmentsService } from '@/services/departments.service'
export type {
  DepartmentListParams,
  DepartmentApiItem,
  DepartmentListResponse,
  EligibleHeadItem,
  EligibleHeadsResponse,
  DepartmentCreatePayload,
  DepartmentUpdatePayload,
} from '@/services/departments.service'

export { specializationsService } from '@/services/specializations.service'
export type {
  SpecializationListParams,
  SpecializationApiItem,
  SpecializationListResponse,
  SpecializationDropdownItem,
  SpecializationCreatePayload,
  SpecializationUpdatePayload,
  SpecializationStatusPayload,
} from '@/services/specializations.service'

export { doctorsService, doctorIdFromResponse, mapAdminDoctorDetail, mapDoctorListItem, doctorListItems, doctorListMeta, isDoctorListArray } from '@/services/doctors.service'
export type {
  DoctorListParams,
  DoctorCreatePayload,
  DoctorUpdatePayload,
  DoctorApiItem,
  DoctorListResponse,
} from '@/services/doctors.service'

export { doctorProfileService } from '@/services/doctor-profile.service'
export type { DoctorProfileUpdatePayload } from '@/services/doctor-profile.service'

export { clinicalVisitsService } from '@/services/clinical-visits.service'
export type {
  AssignedDoctor,
  ClinicalVisit,
  OpdQueueParams,
  OpdSummary,
  CreateClinicalVisitPayload,
} from '@/services/clinical-visits.service'

export { telehealthService, telehealthAppointmentFromPatient, normalizeTelehealthStatus } from '@/services/telehealth.service'
export type {
  TelehealthAppointment,
  TelehealthMeeting,
  TelehealthStatus,
  RescheduleTelehealthPayload,
  DoctorAvailability,
  DoctorAvailabilitySlot,
  DoctorSlotStatus,
} from '@/services/telehealth.service'

export {
  patientsService,
  patientListPath,
  mapPatient,
  mapPatientList,
  patientUiActions,
  buildPatientUpdatePayload,
  dateOfBirthFromAge,
  PATIENT_TYPES,
  PATIENT_TYPE_LABELS,
  PATIENT_WARDS,
  CLINICAL_STATUSES,
  CLINICAL_STATUS_LABELS,
  patientTypeLabel,
  clinicalStatusLabel,
  normalizePatientType,
  isPatientDischarged,
  normalizeClinicalStatus,
  normalizeWard,
  toDatetimeLocalValue,
  isPatientType,
  OPTIONAL_CLEAR,
} from '@/services/patients.service'
export type {
  Patient,
  PatientType,
  PatientVitals,
  LatestVitals,
  PatientEditDraft,
  PatientListParams,
  PatientListResponse,
  PatientWritePayload,
  PatientUpdatePayload,
  ClinicalStatus,
  PatientSummaryCounts,
  PatientReferral,
  ReferralListParams,
  ReferralListResponse,
  ReferralCreatePayload,
  ReferralDoctorOption,
  PatientAccessType,
  ReferralStatus,
} from '@/services/patients.service'
