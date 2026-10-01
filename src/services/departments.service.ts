/**
 * Admin departments API — /api/admin/departments
 */
import { apiFetch } from '@/lib/api-client'

export interface DepartmentListParams {
  search?: string
  status?: string
  page?: number
  page_size?: number
}

export interface DepartmentHeadApi {
  id: string
  name?: string | null
  doctor_id?: string
  doctorId?: string
  first_name?: string
  last_name?: string
  firstName?: string
  lastName?: string
  designation?: string | null
  specializations?: string[]
}

export interface DepartmentApiItem {
  id: string
  name: string
  code: string
  description: string | null
  head_of_department: DepartmentHeadApi | null
  doctor_count: number
  status: string
  created_at: string
  updated_at: string
}

export interface DepartmentListResponse {
  items: DepartmentApiItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface DepartmentCreatePayload {
  name: string
  code: string
  description?: string | null
  head_of_department_id?: string | null
  status?: 'ACTIVE' | 'INACTIVE' | string
}

export interface DepartmentUpdatePayload {
  name?: string | null
  code?: string | null
  description?: string | null
  head_of_department_id?: string | null
  status?: string | null
}

export interface EligibleHeadItem {
  id: string
  doctor_id: string
  name: string
  designation: string | null
  specializations: string[]
}

export interface EligibleHeadsResponse {
  items: EligibleHeadItem[]
}

function toQuery(params?: DepartmentListParams): string {
  if (!params) return ''
  const q = new URLSearchParams()
  if (params.search?.trim()) q.set('search', params.search.trim())
  if (params.status) q.set('status', params.status)
  if (params.page != null) q.set('page', String(params.page))
  if (params.page_size != null) q.set('page_size', String(params.page_size))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const departmentsService = {
  list(params?: DepartmentListParams) {
    return apiFetch<DepartmentListResponse>(`/api/admin/departments${toQuery(params)}`)
  },

  eligibleHeads(departmentId?: string | null) {
    const qs = departmentId
      ? `?department_id=${encodeURIComponent(departmentId)}`
      : ''
    return apiFetch<EligibleHeadsResponse>(`/api/admin/departments/eligible-heads${qs}`)
  },

  get(departmentId: string) {
    return apiFetch<DepartmentApiItem>(`/api/admin/departments/${encodeURIComponent(departmentId)}`)
  },

  create(payload: DepartmentCreatePayload) {
    return apiFetch<DepartmentApiItem>('/api/admin/departments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  update(departmentId: string, payload: DepartmentUpdatePayload) {
    return apiFetch<DepartmentApiItem>(`/api/admin/departments/${encodeURIComponent(departmentId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  remove(departmentId: string) {
    return apiFetch<unknown>(`/api/admin/departments/${encodeURIComponent(departmentId)}`, {
      method: 'DELETE',
    })
  },
}
