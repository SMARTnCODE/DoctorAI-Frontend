'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function PaginationControls({
  page, totalPages, total, pageSize, onPage,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (page: number) => void
}) {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="px-1 text-xs text-muted-foreground">
        {total} record{total === 1 ? '' : 's'}
      </p>
    ) : null
  }
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  )

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-slate-700 dark:text-slate-300">{from}–{to}</span> of{' '}
        <span className="font-medium text-slate-700 dark:text-slate-300">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        {pages.map((p, i) => (
          <span key={p} className="flex items-center">
            {i > 0 && p - pages[i - 1] > 1 ? <span className="px-1 text-xs text-muted-foreground">…</span> : null}
            <Button
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </Button>
          </span>
        ))}
        <Button variant="outline" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
