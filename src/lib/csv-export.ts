'use client'

/**
 * CSV export helpers shared by the Doctors / Patients / Audit Logs pages.
 * - Proper RFC-4180 escaping (quotes, commas, newlines) + UTF-8 BOM
 * - Paged fetch helper that walks an endpoint up to N pages / row cap
 * - Blob download via a temporary anchor
 */
import { apiFetch, ApiError } from '@/lib/api-client'
import { navigate } from '@/lib/hash-nav'
import { toast } from 'sonner'

export const EXPORT_PAGE_SIZE = 100
export const EXPORT_MAX_PAGES = 5
export const EXPORT_MAX_ROWS = EXPORT_PAGE_SIZE * EXPORT_MAX_PAGES

export type CsvCell = string | number | null | undefined

/** Escape a single CSV cell: wrap in quotes when needed, double inner quotes. */
export function csvEscape(value: CsvCell): string {
  const raw = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

/** Build a full CSV document (headers + rows) prefixed with a UTF-8 BOM. */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','))
  return '\ufeff' + lines.join('\r\n')
}

/** Today's local date as YYYY-MM-DD (used in export filenames). */
export function exportDateStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Trigger a client-side download of text content. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/**
 * Walk a paginated list endpoint (page=1..maxPages, pageSize=EXPORT_PAGE_SIZE)
 * accumulating rows until totalPages is reached. Returns up to 500 rows.
 */
export async function fetchAllForExport<TResp, TRow>(
  buildUrl: (page: number) => string,
  extract: (resp: TResp) => { rows: TRow[]; totalPages: number },
): Promise<TRow[]> {
  const all: TRow[] = []
  let page = 1
  while (page <= EXPORT_MAX_PAGES) {
    const resp = await apiFetch<TResp>(buildUrl(page))
    const { rows, totalPages } = extract(resp)
    all.push(...rows)
    const parsed = Number(totalPages)
    const safeTotalPages = Number.isFinite(parsed) && parsed >= 1 ? parsed : page
    if (rows.length === 0 || page >= safeTotalPages || all.length >= EXPORT_MAX_ROWS) break
    page += 1
  }
  return all.slice(0, EXPORT_MAX_ROWS)
}

/**
 * Shared click-handler for "Export CSV" buttons:
 * toast('Exporting…') → fetch → build → download → success/error toast.
 * Returns true when the export was attempted (button callers can ignore).
 */
export async function runCsvExport<TResp, TRow>(opts: {
  filenameBase: string
  buildUrl: (page: number) => string
  extract: (resp: TResp) => { rows: TRow[]; totalPages: number }
  headers: string[]
  mapRow: (row: TRow) => CsvCell[]
}): Promise<void> {
  const toastId = toast.loading('Exporting…')
  try {
    const rows = await fetchAllForExport(opts.buildUrl, opts.extract)
    const csv = buildCsv(opts.headers, rows.map(opts.mapRow))
    const filename = `${opts.filenameBase}-${exportDateStamp()}.csv`
    downloadTextFile(filename, csv)
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`, {
      id: toastId,
      description: `${filename} · current filters applied`,
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      toast.error('Session expired. Please sign in again.', { id: toastId })
      navigate('/super-admin/login')
      return
    }
    toast.error(e instanceof ApiError ? e.message : 'Export failed. Please try again.', { id: toastId })
  }
}
