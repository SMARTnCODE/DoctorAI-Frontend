'use client'

import { Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatSlotLabel } from '@/services/clinical-visits.service'
import {
  formatTelehealthDate,
  formatTelehealthTime,
  type DoctorAvailabilitySlot,
  type DoctorSlotStatus,
} from '@/services/telehealth.service'

const STATUS_LABEL: Record<DoctorSlotStatus, string> = {
  AVAILABLE: 'Available',
  BOOKED: 'Booked',
  BREAK: 'Break',
  PAST: 'Past',
}

const STATUS_HINT: Record<Exclude<DoctorSlotStatus, 'AVAILABLE'>, string> = {
  BOOKED: 'Already booked',
  BREAK: 'Doctor break',
  PAST: 'Past time',
}

export function AvailabilitySlotPicker({
  slots,
  loading,
  error,
  selectedTime,
  date,
  ready,
  onSelect,
  onRetry,
}: {
  slots: DoctorAvailabilitySlot[]
  loading: boolean
  error: string | null
  selectedTime: string
  date: string
  /** True only after both doctor and date are chosen. */
  ready: boolean
  onSelect: (startTime: string) => void
  onRetry?: () => void
}) {
  if (!ready) {
    return <p className="text-sm text-muted-foreground">Select a doctor and date to see available times.</p>
  }

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking doctor availability...
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-sm text-rose-700">{error}</p>
        {onRetry ? (
          <button type="button" className="text-xs font-medium text-teal-800 underline" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-3 text-sm" role="status">
        <p>No available slots for this doctor on the selected date.</p>
        <p className="mt-1 text-muted-foreground">Please select another date.</p>
      </div>
    )
  }

  const hasAvailable = slots.some((slot) => slot.status === 'AVAILABLE')
  return (
    <div className="space-y-3">
      {hasAvailable ? <p className="text-xs text-muted-foreground">Select an available time</p> : null}
      <SlotGrid slots={slots} selectedTime={selectedTime} onSelect={onSelect} />
      {selectedTime ? (
        <p className="text-sm font-medium">
          Selected: {date ? formatTelehealthDate(date) : '—'} · {formatTelehealthTime(selectedTime)}
        </p>
      ) : null}
    </div>
  )
}

function SlotGrid({
  slots,
  selectedTime,
  onSelect,
}: {
  slots: DoctorAvailabilitySlot[]
  selectedTime: string
  onSelect: (startTime: string) => void
}) {
  return (
    <div role="radiogroup" aria-label="Available times" className="grid grid-cols-3 gap-2">
      {slots.map((slot) => (
        <SlotButton
          key={`${slot.startTime}-${slot.status}`}
          slot={slot}
          selected={slot.status === 'AVAILABLE' && slot.startTime === selectedTime}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function SlotButton({
  slot,
  selected,
  onSelect,
}: {
  slot: DoctorAvailabilitySlot
  selected: boolean
  onSelect: (startTime: string) => void
}) {
  const selectable = slot.status === 'AVAILABLE'
  const timeLabel = formatSlotLabel(slot.startTime)
  const statusLabel = STATUS_LABEL[slot.status]
  const button = (
    <button
      type="button"
      role={selectable ? 'radio' : undefined}
      aria-checked={selectable ? selected : undefined}
      aria-hidden={selectable ? undefined : true}
      tabIndex={selectable ? undefined : -1}
      aria-label={selectable ? `${timeLabel} - ${statusLabel}` : undefined}
      disabled={!selectable}
      onClick={() => {
        if (!selectable) return
        onSelect(slot.startTime)
      }}
      className={cn(
        'flex h-auto min-h-14 w-full flex-col items-center justify-center rounded-lg border px-2 py-2 text-center',
        !selectable && 'pointer-events-none',
        selectable && !selected && 'border-border bg-card text-foreground hover:border-teal-700 hover:bg-teal-50',
        selected && 'border-[#0b3430] bg-[#0b3430] text-white',
        slot.status === 'BOOKED' && 'cursor-not-allowed border-rose-200 bg-rose-50 text-rose-800',
        (slot.status === 'BREAK' || slot.status === 'PAST') && 'cursor-not-allowed border-border bg-muted text-muted-foreground',
      )}
    >
      <span className="text-xs font-semibold">{timeLabel}</span>
      <span className={cn('text-[10px] font-medium tracking-wide uppercase', selected && 'text-white/80')}>
        {statusLabel}
      </span>
    </button>
  )

  if (selectable) return button
  const hint = STATUS_HINT[slot.status]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
          role="radio"
          aria-checked={false}
          aria-disabled="true"
          aria-label={`${timeLabel} - ${statusLabel}. ${hint}`}
        >
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
