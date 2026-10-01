'use client'

import { Video } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  isGoogleMeetLink,
  openGoogleMeet,
  telehealthJoinBlockReason,
} from '@/services/telehealth.service'

export function JoinGoogleMeetButton({
  meetingLink,
  status,
  appointmentDate,
  appointmentTime,
  durationMinutes,
  className,
  size = 'sm',
}: {
  meetingLink?: string | null
  status?: string | null
  appointmentDate?: string | null
  appointmentTime?: string | null
  durationMinutes?: number | null
  className?: string
  size?: 'sm' | 'default'
}) {
  if (!isGoogleMeetLink(meetingLink)) {
    return <span className="text-xs text-muted-foreground">Meet link unavailable</span>
  }
  const reason = telehealthJoinBlockReason({
    status,
    meetingLink,
    appointmentDate,
    appointmentTime,
    durationMinutes,
  })
  return (
    <Button
      type="button"
      size={size}
      className={cn(
        'gap-1.5 bg-[#1f7a4d] text-white hover:bg-[#186540]',
        size === 'sm' ? 'h-8 rounded-lg px-3 text-xs' : 'h-10',
        className,
      )}
      disabled={reason != null}
      title={reason ?? 'Join Google Meet'}
      onClick={() => {
        if (reason) {
          toast.error(reason)
          return
        }
        if (!openGoogleMeet(meetingLink)) {
          toast.error('Google Meet link is not available for this appointment.')
        }
      }}
    >
      <Video className="size-3.5" aria-hidden /> Join Google Meet
    </Button>
  )
}
