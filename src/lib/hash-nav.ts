'use client'

/**
 * Hash-based navigation that mirrors the spec URLs:
 * #/super-admin/login, #/super-admin/dashboard, #/super-admin/doctors, ...
 * (The sandbox preview exposes only the root route, so deep links live in the hash.)
 *
 * Hashes may also carry a query string for shareable per-page state, e.g.
 *   #/super-admin/audit-logs?action=CREATE&module=SHIFTS
 * Routing only ever sees the path portion; pages read/replace the query via
 * currentHashQuery() / replaceHashQuery() without pushing history entries.
 */
export function navigate(path: string) {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (window.location.hash !== `#${clean}`) {
    window.location.hash = clean
  }
}

/** Hash path WITHOUT the query string (safe for route resolution). */
export function currentHashPath(): string {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw || raw === '/') return ''
  return raw.split('?')[0] ?? raw
}

/** Raw hash path including any query string (e.g. '/super-admin/audit-logs?…'). */
export function currentFullHash(): string {
  return window.location.hash.replace(/^#/, '')
}

/** Query params from the hash, or an empty URLSearchParams. */
export function currentHashQuery(): URLSearchParams {
  const raw = currentFullHash()
  const qIndex = raw.indexOf('?')
  if (qIndex === -1) return new URLSearchParams()
  return new URLSearchParams(raw.slice(qIndex + 1))
}

/**
 * Replace ONLY the query part of the current hash (keeps the path), via
 * history.replaceState — no hashchange event, no history entry.
 * Pass null/empty to remove all params.
 */
export function replaceHashQuery(params: URLSearchParams | null) {
  const path = currentFullHash().split('?')[0] ?? ''
  const qs = params ? params.toString() : ''
  const next = qs ? `#${path}?${qs}` : `#${path}`
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next)
  }
}
