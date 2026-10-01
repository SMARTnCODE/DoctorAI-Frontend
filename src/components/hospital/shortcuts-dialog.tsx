'use client'

/**
 * Keyboard shortcuts help dialog — opened with the "?" global shortcut or the
 * sidebar footer button. Lists every shortcut in a two-column definition list;
 * kbd styling mirrors the ⌘K hint in the topbar.
 */
import { Keyboard } from 'lucide-react'

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const KBD = 'rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300'

const GENERAL_SHORTCUTS = [
  { keys: ['⌘K', 'Ctrl+K'], label: 'Command palette' },
  { keys: ['?'], label: 'Keyboard shortcuts (this help)' },
  { keys: ['Shift', 'T'], label: 'Cycle color theme (light / dark / system)' },
  { keys: ['Esc'], label: 'Close dialogs' },
]

// Keep in sync with NAV_ITEMS in admin-shell / command-palette.
const NAV_SHORTCUTS = [
  { keys: ['Alt', '1'], label: 'Dashboard' },
  { keys: ['Alt', '2'], label: 'Doctors' },
  { keys: ['Alt', '3'], label: 'Specializations' },
  { keys: ['Alt', '4'], label: 'Departments' },
  { keys: ['Alt', '5'], label: 'Patients' },
  { keys: ['Alt', '6'], label: 'Doctor Shifts' },
  { keys: ['Alt', '7'], label: 'Audit Logs' },
  { keys: ['Alt', '8'], label: 'Settings' },
  { keys: ['Alt', '9'], label: 'Visits' },
]

function ShortcutList({ items }: { items: { keys: string[]; label: string }[] }) {
  return (
    <dl className="mt-3 space-y-2.5">
      {items.map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-3">
          <dt className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-300">{s.label}</dt>
          <dd className="flex shrink-0 items-center gap-1">
            {s.keys.map((k) => (
              <kbd key={k} className={KBD}>{k}</kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ShortcutsDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="size-4 text-teal-600" aria-hidden /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Work faster with these global shortcuts — available on every page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-1 sm:grid-cols-2">
          <section aria-label="General shortcuts">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">General</h3>
            <ShortcutList items={GENERAL_SHORTCUTS} />
          </section>
          <section aria-label="Navigation shortcuts">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Navigation</h3>
            <ShortcutList items={NAV_SHORTCUTS} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
