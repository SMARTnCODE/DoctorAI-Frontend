'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

export function PageHeader({
  title, description, actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        // Subtle staggered entrance for the header's action buttons (the shell
        // already animates the page body — this only delays the right side).
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut', delay: 0.2 }}
          className="flex shrink-0 flex-wrap items-center gap-2"
        >
          {actions}
        </motion.div>
      ) : null}
    </div>
  )
}
