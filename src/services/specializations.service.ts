/**
 * Admin specializations API — /api/admin/specializations
 */
import { apiFetch } from '@/lib/api-client'

export interface SpecializationListParams {
  search?: string
  status?: string
  department_id?: string
  page?: number
  page_size?: number
  sort_by?: 'name' | 'status' | 'created_at' | 'updated_at' | string
  sort_order?: 'asc' | 'desc'
}

export interface SpecializationDepartmentRef {
  id: string
  name: string
  code: string
}

export interface SpecializationApiItem {
  id: string
  name: string
  description: string | null
  department: SpecializationDepartmentRef | null
  doctors_count: number
  status: 'ACTIVE' | 'INACTIVE' | string
  created_at: string
  updated_at: string
}

export interface SpecializationListResponse {
  items: SpecializationApiItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface SpecializationDropdownItem {
  id: string
  name: string
  department_id: string | null
}

export interface SpecializationCreatePayload {
  name: string
  description?: string | null
  department_id?: string | null
  status?: 'ACTIVE' | 'INACTIVE' | string
}

export interface SpecializationUpdatePayload {
  name?: string | null
  description?: string | null
  department_id?: string | null
  status?: 'ACTIVE' | 'INACTIVE' | string | null
}

export interface SpecializationStatusPayload {
  status: 'ACTIVE' | 'INACTIVE'
}

function toQuery(params?: SpecializationListParams): string {
  if (!params) return ''
  const q = new URLSearchParams()
  if (params.search?.trim()) q.set('search', params.search.trim())
  if (params.status) q.set('status', params.status)
  if (params.department_id) q.set('department_id', params.department_id)
  if (params.page != null) q.set('page', String(params.page))
  if (params.page_size != null) q.set('page_size', String(params.page_size))
  if (params.sort_by) q.set('sort_by', params.sort_by)
  if (params.sort_order) q.set('sort_order', params.sort_order)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const specializationsService = {
  list(params?: SpecializationListParams) {
    return apiFetch<SpecializationListResponse>(`/api/admin/specializations${toQuery(params)}`)
  },

  /** Active specializations for doctor form / filter dropdowns. */
  dropdown(departmentId?: string | null) {
    const qs = departmentId
      ? `?department_id=${encodeURIComponent(departmentId)}`
      : ''
    return apiFetch<SpecializationDropdownItem[]>(`/api/admin/specializations/dropdown${qs}`)
  },

  get(specializationId: string) {
    return apiFetch<SpecializationApiItem>(
      `/api/admin/specializations/${encodeURIComponent(specializationId)}`,
    )
  },

  create(payload: SpecializationCreatePayload) {
    return apiFetch<SpecializationApiItem>('/api/admin/specializations', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  update(specializationId: string, payload: SpecializationUpdatePayload) {
    return apiFetch<SpecializationApiItem>(
      `/api/admin/specializations/${encodeURIComponent(specializationId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    )
  },

  setStatus(specializationId: string, payload: SpecializationStatusPayload) {
    return apiFetch<SpecializationApiItem>(
      `/api/admin/specializations/${encodeURIComponent(specializationId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    )
  },

  remove(specializationId: string) {
    return apiFetch<unknown>(
      `/api/admin/specializations/${encodeURIComponent(specializationId)}`,
      { method: 'DELETE' },
    )
  },
}
