'use client'

import { useSyncExternalStore } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const emptySubscribe = () => () => {}

/**
 * Light / Dark / System switcher for the top bar.
 * Icon reflects the *effective* theme after hydration (Moon before mount to
 * avoid a hydration mismatch — the menu itself is only usable client-side).
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  // Hydration-safe "is client" flag without setState-in-effect (lint-clean).
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  const effective = mounted ? resolvedTheme : undefined
  const options = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={
            effective === 'dark'
              ? 'Color theme (currently dark) — switch theme'
              : 'Color theme (currently light) — switch theme'
          }
          title="Color theme"
        >
          {effective === 'dark'
            ? <Moon className="size-4.5" aria-hidden />
            : <Sun className="size-4.5" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            aria-current={mounted && theme === value ? 'true' : undefined}
          >
            <Icon className="size-4" aria-hidden />
            <span className="flex-1">{label}</span>
            {mounted && theme === value ? <Check className="size-4 text-teal-600 dark:text-teal-400" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
