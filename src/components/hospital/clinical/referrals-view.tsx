'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/hospital/empty-state'
import { PaginationControls } from '@/components/hospital/pagination-controls'
import { ConfirmDialog } from '@/components/hospital/confirm-dialog'
import { ReferralStatusBadge } from '@/components/hospital/referral-status-badge'
import { useAuth } from '@/components/hospital/auth-context'
import { formatDate, initials } from '@/lib/format'
import { navigate } from '@/lib/hash-nav'
import {
  handlePatientAuthError,
  patientActionErrorMessage,
  referralActionErrorMessage,
  validationFieldErrors,
} from '@/lib/patient-api-error'
import {
  REFERRAL_STATUSES,
  patientsService,
  type PatientReferral,
} from '@/services/patients.service'
const PAGE_SIZE = 10

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function ReferralsView() {
  const { logout, userId, doctorProfile } = useAuth()
  const actorId = doctorProfile?.id || userId
  const [tab, setTab] = useState<'received' | 'sent'>('received')
  const [status, setStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PatientReferral[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<PatientReferral | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState('')
  const [cancelling, setCancelling] = useState<PatientReferral | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const debouncedSearch = useDebounced(search)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    patientsService.getReferrals({
      page,
      pageSize: PAGE_SIZE,
      status,
      search: debouncedSearch,
    })
      .then((result) => {
        if (cancelled) return
        setRows(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      })
      .catch(async (err) => {
        if (cancelled) return
        if (await handlePatientAuthError(err, logout, '/doctor/referrals')) return
        setRows([])
        setError(patientActionErrorMessage(err, 'Could not load referrals.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [page, status, debouncedSearch, reloadKey, logout])

  const visible = useMemo(() => rows.filter((referral) => {
    const sentByMe = referral.referringDoctor?.id === actorId
    const receivedByMe = referral.referredDoctor?.id === actorId
    if (tab === 'sent') return sentByMe
    return receivedByMe || !sentByMe
  }), [rows, tab, actorId])

  function refresh() {
    setReloadKey((value) => value + 1)
  }

  async function accept(referral: PatientReferral) {
    setBusyId(referral.id)
    try {
      await patientsService.acceptReferral(referral.id)
      toast.success('Referral accepted successfully.')
      refresh()
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/referrals')) return
      toast.error(referralActionErrorMessage(err, 'Could not accept the referral.'))
    } finally {
      setBusyId(null)
    }
  }

  async function reject() {
    if (!rejecting || busyId) return
    if (!rejectReason.trim()) {
      setRejectError('A reason is required')
      return
    }
    setBusyId(rejecting.id)
    try {
      await patientsService.rejectReferral(rejecting.id, rejectReason.trim())
      toast.success('Referral rejected.')
      setRejecting(null)
      setRejectReason('')
      refresh()
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/referrals')) return
      const fields = validationFieldErrors(err)
      if (fields.reason) setRejectError(fields.reason)
      toast.error(referralActionErrorMessage(err, 'Could not reject the referral.'))
    } finally {
      setBusyId(null)
    }
  }

  async function cancel() {
    if (!cancelling) return
    setBusyId(cancelling.id)
    try {
      await patientsService.cancelReferral(cancelling.id)
      toast.success('Referral cancelled.')
      setCancelling(null)
      refresh()
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/referrals')) return
      toast.error(referralActionErrorMessage(err, 'Could not cancel the referral.'))
    } finally {
      setBusyId(null)
    }
  }

  async function complete(referral: PatientReferral) {
    setBusyId(referral.id)
    try {
      await patientsService.completeReferral(referral.id)
      toast.success('Referral completed.')
      refresh()
    } catch (err) {
      if (await handlePatientAuthError(err, logout, '/doctor/referrals')) return
      toast.error(referralActionErrorMessage(err, 'Could not complete the referral.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4" data-testid="doctor-referrals">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Referrals you have received or sent.</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={(value) => setTab(value as 'received' | 'sent')}>
          <TabsList>
            <TabsTrigger value="received">Received</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-xl">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by patient, doctor, or reason..."
            aria-label="Search referrals"
          />
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1) }}>
            <SelectTrigger className="sm:w-44" aria-label="Filter by referral status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {REFERRAL_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>{item.charAt(0) + item.slice(1).toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}
        </div>
      ) : error ? (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      ) : visible.length === 0 ? (
        rows.length > 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No {tab} referrals on this page. The list is paginated from referrals you are allowed to see.
          </p>
        ) : (
          <EmptyState
            illustrated
            icon={Send}
            title="No referrals found."
            description={tab === 'received'
              ? 'Referrals sent to you will appear here.'
              : 'Referrals you send will appear here.'}
          />
        )
      ) : (
        <div className={loading ? 'space-y-3 opacity-60' : 'space-y-3'}>
          {visible.map((referral) => {
            const patient = referral.patient
            const sentByMe = referral.referringDoctor?.id === actorId
            const receivedByMe = referral.referredDoctor?.id === actorId
            const pending = referral.status === 'PENDING'
            const accepted = referral.status === 'ACCEPTED'
            return (
              <article key={referral.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">
                      {initials(patient?.fullName || 'Patient')}
                    </span>
                    <div>
                      <p className="font-medium">{patient?.fullName || 'Patient'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{patient?.patientId || referral.patientId}</p>
                    </div>
                  </div>
                  <ReferralStatusBadge status={referral.status} />
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">{sentByMe && !receivedByMe ? 'Referred to' : 'Referred by'}</dt>
                    <dd>{sentByMe && !receivedByMe ? referral.referredDoctor?.name : referral.referringDoctor?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Date</dt>
                    <dd>{formatDate(referral.createdAt)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Reason</dt>
                    <dd>{referral.referralReason}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {receivedByMe && pending ? (
                    <>
                      <Button size="sm" disabled={busyId === referral.id} onClick={() => { void accept(referral) }}>
                        {busyId === referral.id ? <Loader2 className="size-4 animate-spin" /> : null}
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRejecting(referral); setRejectReason(''); setRejectError('') }}>
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {sentByMe && (pending || accepted) ? (
                    <Button size="sm" variant="outline" onClick={() => setCancelling(referral)}>Cancel Referral</Button>
                  ) : null}
                  {accepted && (sentByMe || receivedByMe) ? (
                    <Button size="sm" variant="outline" disabled={busyId === referral.id} onClick={() => { void complete(referral) }}>
                      Complete
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/doctor/patients/${patient?.id || referral.patientId}`)}>
                    View Patient
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {rows.length > 0 ? (
        <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      ) : null}

      <Dialog open={!!rejecting} onOpenChange={(open) => { if (!open && !busyId) setRejecting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject referral</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason <span className="text-rose-600">*</span></Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why are you rejecting this referral?"
              rows={3}
            />
            {rejectError ? <p className="text-xs text-rose-600">{rejectError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!!busyId} onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!!busyId} onClick={() => { void reject() }}>
              {busyId ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(open) => { if (!open && !busyId) setCancelling(null) }}
        title="Cancel referral"
        description="The receiving doctor will lose access granted by this referral. The referral history stays on the patient record."
        confirmLabel="Cancel Referral"
        destructive
        processing={!!busyId}
        onConfirm={() => { void cancel() }}
      />
    </div>
  )
}
