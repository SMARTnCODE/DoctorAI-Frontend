'use client'

import { ArrowDown } from 'lucide-react'
import { formatDate } from '@/lib/format'
import type { PatientDepartmentRef, PatientDoctorRef, PatientReferral } from '@/services/patients.service'
import { ReferralStatusBadge } from '@/components/hospital/referral-status-badge'

function statusLabel(status: string): string {
  const key = status.trim().toUpperCase()
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
  }
  return labels[key] ?? status
}

/** Department printed on a referral comes from that referral payload only. */
function referralDepartment(
  doctor: PatientDoctorRef | null | undefined,
  snapshot: PatientDepartmentRef | null | undefined,
): string | null {
  return snapshot?.name || doctor?.department?.name || null
}

export function ReferralHistoryList({ referrals }: { referrals: PatientReferral[] }) {
  if (referrals.length === 0) {
    return <p className="text-sm text-muted-foreground">No referrals recorded.</p>
  }
  const ordered = [...referrals].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return (
    <ol className="space-y-3">
      {ordered.map((referral) => {
        const fromDepartment = referralDepartment(referral.referringDoctor, referral.previousDepartment)
        const toDepartment = referralDepartment(referral.referredDoctor, referral.referredDepartment)
        return (
          <li key={referral.id} className="rounded-xl border bg-muted/30 p-3">
            <div className="flex flex-col items-start gap-2 text-sm">
              <div>
                <p className="font-medium">{referral.referringDoctor?.name ?? 'Referring doctor'}</p>
                {fromDepartment ? <p className="text-muted-foreground">{fromDepartment}</p> : null}
              </div>
              <ArrowDown className="size-3.5 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{referral.referredDoctor?.name ?? 'Referred doctor'}</p>
                {toDepartment ? <p className="text-muted-foreground">{toDepartment}</p> : null}
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Reason: </span>
              {referral.referralReason}
            </p>
            {referral.message ? (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Message: </span>
                {referral.message}
              </p>
            ) : null}
            {referral.rejectionReason ? (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Rejection reason: </span>
                {referral.rejectionReason}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ReferralStatusBadge status={referral.status} />
              <span className="text-xs text-muted-foreground">Status: {statusLabel(referral.status)}</span>
              <span className="text-xs text-muted-foreground">Date: {formatDate(referral.createdAt)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
