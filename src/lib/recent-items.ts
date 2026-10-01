'use client'

/**
 * Recently visited doctor / patient profiles — feeds the command palette's
 * "Recent" group (shown when the palette query is empty).
 *
 * Stored in localStorage under `hms-recent-items` as a JSON array, max 6
 * entries, newest first, deduped by type+code (a re-visit moves the entry to
 * the front and refreshes its timestamp). All reads/writes are guarded and
 * validated — corrupt or hostile storage degrades to "no recents" (mirrors
 * the audit-page preset style).
 */

export type RecentItemType = 'doctor' | 'patient'

export interface RecentItem {
  type: RecentItemType
  /** Human code, e.g. "DOC-0001" / "PAT-0002" (used for deep-linking). */
  code: string
  /** Display name, e.g. "Dr. Rahul Sharma" / "Aarav Mehta". */
  name: string
  /** Epoch millis of the most recent visit. */
  at: number
}

const RECENT_ITEMS_KEY = 'hms-recent-items'
const RECENT_ITEMS_MAX = 6

function isRecentItem(value: unknown): value is RecentItem {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    (r.type === 'doctor' || r.type === 'patient') &&
    typeof r.code === 'string' &&
    r.code.trim().length > 0 &&
    r.code.length <= 32 &&
    typeof r.name === 'string' &&
    r.name.trim().length > 0 &&
    r.name.length <= 120 &&
    typeof r.at === 'number' &&
    Number.isFinite(r.at) &&
    r.at > 0
  )
}

/** Read the recents list (newest first). Returns [] when absent/corrupt/SSR. */
export function getRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_ITEMS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const items: RecentItem[] = []
    for (const entry of parsed.filter(isRecentItem)) {
      const key = `${entry.type}:${entry.code}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(entry)
      if (items.length >= RECENT_ITEMS_MAX) break
    }
    return items
  } catch {
    return []
  }
}

/**
 * Record a profile visit. Dedupes by type+code (moves any existing entry to
 * the front with a fresh timestamp). Best-effort: storage failures (private
 * mode, quota) are swallowed — recents must never break navigation.
 */
export function trackRecentItem(item: Omit<RecentItem, 'at'>): void {
  if (typeof window === 'undefined') return
  try {
    const code = item.code.trim()
    if (!code) return
    const type: RecentItemType = item.type === 'patient' ? 'patient' : 'doctor'
    const entry: RecentItem = {
      type,
      code: code.slice(0, 32),
      name: (item.name.trim() || code).slice(0, 120),
      at: Date.now(),
    }
    const rest = getRecentItems().filter((r) => !(r.type === entry.type && r.code === entry.code))
    const next = [entry, ...rest].slice(0, RECENT_ITEMS_MAX)
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(next))
  } catch {
    /* best-effort only */
  }
}

/** Remove all recents (palette "Clear" action). Best-effort. */
export function clearRecentItems(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(RECENT_ITEMS_KEY)
  } catch {
    /* best-effort only */
  }
}
