'use client'

/**
 * Audit Logs — immutable trail of administrative activity (read-only).
 * Filters: date range, user, action, module. No edit/delete exists by design.
 *
 * Enhancements (round 13):
 *  - Facet-driven filter options from GET /api/audit-logs/facets (counts as muted
 *    suffix), with static fallback lists when the endpoint is unavailable.
 *  - User filter is a combobox (facet users + free text) backed by the existing
 *    `user` name-contains query param.
 *  - Active filters are encoded in the hash query (#/super-admin/audit-logs?action=…)
 *    via history.replaceState (debounced) so filtered views are shareable.
 *  - Saved presets ({id, name, params}) persisted in localStorage `hms-audit-presets`
 *    (max 8, newest first) with apply / instant-remove chips.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  BookmarkPlus, ChevronsUpDown, Download, Info, Loader2, RotateCcw, ScrollText, X,
} from 'lucide-react'
import { toast } from 'sonner'

import { useApiData } from '@/hooks/use-api-data'
import { EXPORT_PAGE_SIZE, runCsvExport } from '@/lib/csv-export'
import { ACTION_LABELS, formatDateTime, initials, timeAgo } from '@/lib/format'
import { currentHashQuery, replaceHashQuery } from '@/lib/hash-nav'
import { PageHeader } from '@/components/hospital/page-header'
import { EmptyState } from '@/components/hospital/empty-state'
import { PaginationControls } from '@/components/hospital/pagination-controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const PAGE_SIZE = 10
const ALL = 'ALL'
const PRESETS_KEY = 'hms-audit-presets'
const PRESETS_MAX = 8

interface AuditLogRow {
  id: string; userName: string | null; action: string; module: string
  recordId: string | null; recordLabel: string | null; description: string
  ipAddress: string | null; userAgent: string | null; timestamp: string
}
interface AuditLogsResponse {
  logs: AuditLogRow[]
  total: number; page: number; pageSize: number; totalPages: number
}

interface FacetValue { value: string; count: number }
interface AuditFacets { actions: FacetValue[]; modules: FacetValue[]; users: FacetValue[]; totalLogs: number }
interface AuditPreset { id: string; name: string; params: Record<string, string> }
interface FacetOption { value: string; count: number | null }

const ACTIONS = [
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE',
  'DEACTIVATE', 'ACTIVATE', 'VIEW', 'ACCESS', 'CANCEL',
  'DELETE', 'ASSIGN', 'UNASSIGN', 'PASSWORD_CHANGE',
  'RESUME_UPLOADED', 'RESUME_REPLACED', 'RESUME_REMOVED', 'DOCTOR_PASSWORD_RESET',
  'DOCTOR_LOCKED', 'DOCTOR_UNLOCKED',
  // Task 26 — Super Admin central doctor-control actions.
  'DOCTOR_LOGIN_CREATED', 'DOCTOR_PASSWORD_CHANGED', 'DOCTOR_PASSWORD_CHANGE_FORCED',
  'DOCTOR_ACCOUNT_ENABLED', 'DOCTOR_ACCOUNT_DISABLED',
  'DOCTOR_SUSPENDED', 'DOCTOR_SUSPENSION_LIFTED', 'DOCTOR_TERMINATED',
  'DOCTOR_DELETE_INITIATED', 'DOCTOR_DELETED',
] as const

const MODULES = [
  'AUTH', 'DOCTORS', 'PATIENTS', 'SHIFTS', 'SPECIALIZATIONS', 'DEPARTMENTS', 'SETTINGS',
] as const

/* Light values unchanged; dark uses the /10 fill + -300 text + -500/25 border
   pattern (slate family uses white/5 + slate-300 + slate-700/60). */
const ACTION_STYLES: Record<string, string> = {
  LOGIN: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  ACTIVATE: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  CREATE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25',
  UPDATE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  DEACTIVATE: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  CANCEL: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  LOGIN_FAILED: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  ASSIGN: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/25',
  UNASSIGN: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/25',
  PASSWORD_CHANGE: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/25',
  DELETE: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  RESUME_UPLOADED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25',
  RESUME_REPLACED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  RESUME_REMOVED: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/25',
  DOCTOR_PASSWORD_RESET: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/25',
  // Task 24 — manual lock/unlock of a doctor's portal account.
  DOCTOR_LOCKED: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  DOCTOR_UNLOCKED: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  // Task 26 — Super Admin central doctor-control actions.
  DOCTOR_LOGIN_CREATED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/25',
  DOCTOR_PASSWORD_CHANGED: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/25',
  DOCTOR_PASSWORD_CHANGE_FORCED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  DOCTOR_ACCOUNT_ENABLED: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  DOCTOR_ACCOUNT_DISABLED: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  DOCTOR_SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25',
  DOCTOR_SUSPENSION_LIFTED: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/25',
  DOCTOR_TERMINATED: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  DOCTOR_DELETE_INITIATED: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/25',
  DOCTOR_DELETED: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/25',
  ACCESS: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/25',
  VIEW: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-slate-700/60',
  LOGOUT: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-slate-700/60',
}

/** Shared badge geometry so action + module badges render identically. */
const BADGE_SHAPE = 'rounded-full px-2.5 py-0.5'
const MODULE_BADGE = `${BADGE_SHAPE} border-slate-200 bg-slate-100 font-normal text-slate-600 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300`

function moduleLabel(m: string): string {
  return m.charAt(0) + m.slice(1).toLowerCase()
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ── Hash query ⇄ filter state ────────────────────────────────
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ENUM_RE = /^[A-Z_]{1,40}$/

function parseHashFilters(): { from: string; to: string; user: string; action: string; module: string } {
  const defaults = { from: '', to: '', user: '', action: ALL, module: ALL }
  if (typeof window === 'undefined') return defaults
  try {
    const q = currentHashQuery()
    const from = q.get('from') ?? ''
    const to = q.get('to') ?? ''
    return {
      action: ENUM_RE.test(q.get('action') ?? '') ? (q.get('action') as string) : ALL,
      module: ENUM_RE.test(q.get('module') ?? '') ? (q.get('module') as string) : ALL,
      user: (q.get('user') ?? '').trim().slice(0, 80),
      from: ISO_DATE_RE.test(from) ? from : '',
      to: ISO_DATE_RE.test(to) ? to : '',
    }
  } catch {
    return defaults
  }
}

// ── Saved presets (localStorage) ─────────────────────────────
function loadPresets(): AuditPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p): p is AuditPreset =>
        Boolean(p) && typeof (p as AuditPreset).id === 'string' &&
        typeof (p as AuditPreset).name === 'string' &&
        Boolean((p as AuditPreset).params) && typeof (p as AuditPreset).params === 'object')
      .slice(0, PRESETS_MAX)
  } catch {
    return []
  }
}

function persistPresets(list: AuditPreset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list))
  } catch {
    toast.error('Could not save presets (browser storage unavailable).')
  }
}

function uniqueName(base: string, existing: AuditPreset[]): string {
  let name = base
  let n = 2
  while (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    name = `${base} (${n})`
    n += 1
  }
  return name
}

function describePreset(p: AuditPreset): string {
  const parts: string[] = []
  if (p.params.action) parts.push(`Action: ${ACTION_LABELS[p.params.action] ?? p.params.action}`)
  if (p.params.module) parts.push(`Module: ${moduleLabel(p.params.module)}`)
  if (p.params.user) parts.push(`User: ${p.params.user}`)
  if (p.params.from || p.params.to) parts.push(`${p.params.from || '…'} → ${p.params.to || '…'}`)
  return parts.length > 0 ? parts.join(' · ') : 'All entries'
}

/** User filter combobox — facet users with counts, plus free-text ("name contains"). */
function UserCombobox({ value, users, onChange }: {
  value: string
  users: FacetValue[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Local (non-cmdk) filtering so "All users" and the free-text item stay visible.
  const q = search.trim().toLowerCase()
  const filteredUsers = q
    ? users.filter((u) => u.value.toLowerCase().includes(q))
    : users

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch('') }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={value ? `Filter by user: ${value}` : 'Filter by user'}
          className="w-full justify-between gap-2 font-normal lg:w-52"
        >
          <span className="min-w-0 truncate">{value || <span className="text-muted-foreground">All users</span>}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Name contains…"
            maxLength={80}
          />
          <CommandList className="hms-scroll">
            {filteredUsers.length > 0 ? (
              <CommandGroup heading="People">
                {filteredUsers.map((u) => (
                  <CommandItem
                    key={u.value}
                    value={u.value}
                    onSelect={() => pick(u.value)}
                  >
                    <span className="min-w-0 flex-1 truncate">{u.value}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{u.count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {search.trim() ? (
              <CommandGroup heading="Free text">
                <CommandItem value={`use-${search.trim()}`} onSelect={() => pick(search.trim())}>
                  Filter by “{search.trim()}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Options">
              <CommandItem value="all-users" onSelect={() => pick('')}>
                All users
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export default function AuditLogsPage() {
  // Filters hydrated once from the hash query (client-only page — safe to read window).
  const [initialFilters] = useState(parseHashFilters)
  const [from, setFrom] = useState(initialFilters.from)
  const [to, setTo] = useState(initialFilters.to)
  const [user, setUser] = useState(initialFilters.user)
  const [action, setAction] = useState(initialFilters.action)
  const [module, setModule] = useState(initialFilters.module)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  // Saved presets
  const [presets, setPresets] = useState<AuditPreset[]>(loadPresets)
  const [saveOpen, setSaveOpen] = useState(false)
  const [presetName, setPresetName] = useState('')

  // Facet-driven filter options (fallback to static lists on failure)
  const { data: facetsData } = useApiData<AuditFacets>('/api/audit-logs/facets')

  const actionOptions = useMemo<FacetOption[]>(() => {
    const list: FacetOption[] = facetsData?.actions?.length
      ? facetsData.actions.map((f) => ({
          value: f.value,
          count: typeof f.count === 'number' ? f.count : null,
        }))
      : ACTIONS.map((a) => ({ value: a, count: null }))
    if (action !== ALL && !list.some((o) => o.value === action)) list.push({ value: action, count: null })
    return list
  }, [facetsData, action])

  const moduleOptions = useMemo<FacetOption[]>(() => {
    const list: FacetOption[] = facetsData?.modules?.length
      ? facetsData.modules.map((f) => ({
          value: f.value,
          count: typeof f.count === 'number' ? f.count : null,
        }))
      : MODULES.map((m) => ({ value: m, count: null }))
    if (module !== ALL && !list.some((o) => o.value === module)) list.push({ value: module, count: null })
    return list
  }, [facetsData, module])

  const userFacets = useMemo<FacetValue[]>(
    () => (Array.isArray(facetsData?.users) ? facetsData.users : []),
    [facetsData],
  )

  // Persist filters into the hash query (debounced so typing doesn't thrash replaceState).
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams()
      if (action !== ALL) params.set('action', action)
      if (module !== ALL) params.set('module', module)
      const u = user.trim()
      if (u) params.set('user', u)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      replaceHashQuery(params)
    }, 250)
    return () => clearTimeout(t)
  }, [action, module, user, from, to])

  // Deep links / manual URL edits while the page is already mounted: hashchange
  // only fires for external hash writes (our own updates use replaceState, which
  // never fires it), so re-hydrating here is loop-safe.
  useEffect(() => {
    const onHash = () => {
      const p = parseHashFilters()
      setFrom(p.from)
      setTo(p.to)
      setUser(p.user)
      setAction(p.action)
      setModule(p.module)
      setPage(1)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const listPath = useMemo(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (user.trim()) params.set('user', user.trim())
    if (action !== ALL) params.set('action', action)
    if (module !== ALL) params.set('module', module)
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))
    return `/api/audit-logs?${params.toString()}`
  }, [from, to, user, action, module, page])

  const { data, loading, error } = useApiData<AuditLogsResponse>(listPath)

  const rows = data?.logs ?? []
  const filtersActive = from !== '' || to !== '' || user.trim() !== '' || action !== ALL || module !== ALL

  function setFilter(run: () => void) {
    run()
    setPage(1)
  }

  function resetFilters() {
    setFrom('')
    setTo('')
    setUser('')
    setAction(ALL)
    setModule(ALL)
    setPage(1)
  }

  function currentParams(): Record<string, string> {
    const p: Record<string, string> = {}
    if (action !== ALL) p.action = action
    if (module !== ALL) p.module = module
    if (user.trim()) p.user = user.trim()
    if (from) p.from = from
    if (to) p.to = to
    return p
  }

  function handleSavePreset(e: React.FormEvent) {
    e.preventDefault()
    const name = presetName.trim()
    if (!name) {
      toast.error('Give the preset a name.')
      return
    }
    const entry: AuditPreset = { id: genId(), name: uniqueName(name, presets), params: currentParams() }
    const next = [entry, ...presets].slice(0, PRESETS_MAX)
    persistPresets(next)
    setPresets(next)
    setSaveOpen(false)
    setPresetName('')
    toast.success(`Preset “${entry.name}” saved`, {
      description: 'Click the chip below the filters to reapply it anytime.',
    })
  }

  function applyPreset(p: AuditPreset) {
    setFrom(p.params.from ?? '')
    setTo(p.params.to ?? '')
    setUser(p.params.user ?? '')
    setAction(ENUM_RE.test(p.params.action ?? '') ? (p.params.action as string) : ALL)
    setModule(ENUM_RE.test(p.params.module ?? '') ? (p.params.module as string) : ALL)
    setPage(1)
    toast.success(`Preset “${p.name}” applied`)
  }

  function removePreset(id: string) {
    const target = presets.find((p) => p.id === id)
    const next = presets.filter((p) => p.id !== id)
    setPresets(next)
    persistPresets(next)
    toast('Preset removed', {
      description: target ? `“${target.name}” was deleted from this browser.` : undefined,
    })
  }

  /** Export ALL audit entries matching the current filters (up to 500 rows) as CSV. */
  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      await runCsvExport<AuditLogsResponse, AuditLogRow>({
        filenameBase: 'audit-logs',
        buildUrl: (p) => {
          const q = new URLSearchParams()
          if (from) q.set('from', from)
          if (to) q.set('to', to)
          if (user.trim()) q.set('user', user.trim())
          if (action !== ALL) q.set('action', action)
          if (module !== ALL) q.set('module', module)
          q.set('page', String(p))
          q.set('pageSize', String(EXPORT_PAGE_SIZE))
          return `/api/audit-logs?${q.toString()}`
        },
        extract: (r) => ({ rows: r.logs ?? [], totalPages: r.totalPages ?? 1 }),
        headers: ['Timestamp', 'User', 'Action', 'Module', 'Record', 'Description', 'IP'],
        mapRow: (log) => [
          formatDateTime(log.timestamp),
          log.userName ?? 'System',
          ACTION_LABELS[log.action] ?? log.action,
          log.module,
          log.recordLabel ?? log.recordId ?? '',
          log.description,
          log.ipAddress ?? '',
        ],
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Immutable record of administrative activity"
      />

      <Alert className="border-teal-200 bg-teal-50/60 text-teal-900 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-200">
        <Info className="size-4 text-teal-600 dark:text-teal-400" aria-hidden />
        <AlertDescription className="text-sm">
          Audit logs are protected, cannot be edited from the UI, and every sensitive action is recorded.
        </AlertDescription>
      </Alert>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-auto">
              <div className="space-y-1.5">
                <Label htmlFor="log-from">From</Label>
                <Input
                  id="log-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFilter(() => setFrom(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-to">To</Label>
                <Input
                  id="log-to"
                  type="date"
                  value={to}
                  onChange={(e) => setFilter(() => setTo(e.target.value))}
                />
              </div>
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="log-user">User</Label>
                <UserCombobox
                  value={user}
                  users={userFacets}
                  onChange={(v) => setFilter(() => setUser(v))}
                />
              </div>
            </div>
            <Select value={action} onValueChange={(v) => setFilter(() => setAction(v))}>
              <SelectTrigger className="w-full lg:w-44" aria-label="Filter by action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                {actionOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex w-full items-center justify-between gap-3">
                      <span>{ACTION_LABELS[o.value] ?? o.value}</span>
                      {o.count !== null ? (
                        <span className="tabular-nums text-xs text-muted-foreground">{o.count}</span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={module} onValueChange={(v) => setFilter(() => setModule(v))}>
              <SelectTrigger className="w-full lg:w-44" aria-label="Filter by module">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All modules</SelectItem>
                {moduleOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex w-full items-center justify-between gap-3">
                      <span>{moduleLabel(o.value)}</span>
                      {o.count !== null ? (
                        <span className="tabular-nums text-xs text-muted-foreground">{o.count}</span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="shrink-0 text-muted-foreground">
                <RotateCcw className="size-3.5" aria-hidden /> Reset
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="shrink-0 self-start lg:self-auto"
              onClick={() => setSaveOpen(true)}
            >
              <BookmarkPlus className="size-4" aria-hidden /> Save preset
            </Button>
            <Button
              variant="outline"
              className="shrink-0 self-start lg:self-auto"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved presets */}
      <div aria-label="Saved audit filter presets" className="-mt-3">
        {presets.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No saved presets yet — set some filters, click “Save preset”, and they will appear here for one-click access.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => (
              <span
                key={p.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 text-xs shadow-sm transition-colors hover:border-teal-300 dark:hover:border-teal-500/40"
              >
                <button
                  type="button"
                  onClick={() => applyPreset(p)}
                  title={describePreset(p)}
                  className="min-w-0 truncate font-medium text-slate-700 transition-colors hover:text-teal-700 dark:text-slate-300 dark:hover:text-teal-300 focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => removePreset(p.id)}
                  aria-label={`Remove preset ${p.name}`}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Save preset dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleSavePreset} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Save filter preset</DialogTitle>
              <DialogDescription>
                Stores the current filters in this browser (max 8 presets) for one-click access.
              </DialogDescription>
            </DialogHeader>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground ring-1 ring-slate-200 dark:bg-white/5 dark:ring-slate-700/60">
              {describePreset({ id: '', name: '', params: currentParams() })}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="preset-name">Preset name</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="e.g. Shift audit — September"
                maxLength={40}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!presetName.trim()}>
                <BookmarkPlus className="size-4" aria-hidden /> Save preset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Table card */}
      <div className="rounded-xl border bg-card shadow-sm">
        {loading && !data ? (
          <div className="space-y-3 p-4 sm:p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 sm:p-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={ScrollText}
              title="No audit entries found"
              description={
                filtersActive
                  ? 'No log entries match your current filters. Try widening the date range.'
                  : 'Administrative activity will appear here as it happens.'
              }
            />
          </div>
        ) : (
          <>
            <div className="hms-scroll max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)] hover:bg-transparent">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="hidden md:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((log) => (
                    <TableRow key={log.id} className="text-sm transition-colors duration-150 hover:bg-muted/40">
                      <TableCell className="whitespace-nowrap">
                        <p className="text-slate-800 dark:text-slate-200">{formatDateTime(log.timestamp)}</p>
                        <p className="text-[11px] text-muted-foreground">{timeAgo(log.timestamp)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7">
                            <AvatarFallback className="bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">
                              {initials(log.userName ?? 'System')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-slate-700 dark:text-slate-300">{log.userName ?? 'System'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${BADGE_SHAPE} font-medium ${ACTION_STYLES[log.action] ?? 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700/60 dark:bg-white/5 dark:text-slate-300'}`}
                        >
                          {ACTION_LABELS[log.action] ?? log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={MODULE_BADGE}>{moduleLabel(log.module)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <p className="truncate text-slate-700 dark:text-slate-300" title={log.recordLabel ?? ''}>{log.recordLabel ?? '—'}</p>
                        {log.recordId ? (
                          <p className="truncate font-mono text-[11px] text-muted-foreground" title={log.recordId}>{log.recordId}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <p className="truncate text-muted-foreground" title={log.description}>{log.description}</p>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {log.ipAddress ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t p-4">
              <PaginationControls
                page={data?.page ?? 1}
                totalPages={data?.totalPages ?? 1}
                total={data?.total ?? 0}
                pageSize={data?.pageSize ?? PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
