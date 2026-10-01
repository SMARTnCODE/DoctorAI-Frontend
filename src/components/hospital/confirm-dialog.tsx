'use client'

import type { ReactNode } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function ConfirmDialog({
  open, onOpenChange, title, description, children, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', destructive = false, onConfirm, processing = false,
  processingLabel = 'Working…',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  processing?: boolean
  processingLabel?: string
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children ? <div className="space-y-3 text-sm text-muted-foreground">{children}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={processing}
            className={
              destructive
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : undefined
            }
          >
            {processing ? processingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
