'use client'

/**
 * Resume / CV upload — shared building blocks (Task 23).
 *
 * Rules (enforced here and mirrored server-side in validation.ts):
 *   - Accepted formats: PDF, DOC, DOCX
 *   - Maximum file size: 5 MB
 *
 * This module owns ONLY the reusable UI + client-side validation; the
 * consumers (Add/Edit Doctor form, Doctor Profile "Professional Documents"
 * card) own their own state and the API calls. Keeping the pieces separate
 * lets the same dropzone/file-row visual language serve both a "pending,
 * unsaved file" (form) and a "stored, server-side file" (profile).
 */
import { useCallback, useRef, useState } from 'react'
import { FileText, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const RESUME_ACCEPT = '.pdf,.doc,.docx'
export const RESUME_MAX_BYTES = 5 * 1024 * 1024 // 5 MB — mirrors RESUME_MAX_BYTES in validation.ts

/** Metadata for a resume stored on the server (payload is never shipped to the client). */
export interface ResumeMeta {
  fileName: string
  fileType: string
  fileSize: number
  uploadedAt?: string | null
  uploadedBy?: string | null
}

/** '1.2 MB'-style human size (matches the stakeholder example). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** Extension → canonical mime (what the API's zod enum expects). */
function mimeFromName(name: string): string | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return null
}

/**
 * Public mime mapping for API payloads — returns the canonical mime for an
 * accepted resume file name, or null when the extension is not supported.
 */
export function resumeMimeFromName(name: string): string | null {
  return mimeFromName(name)
}

/**
 * Client-side resume validation. Returns an error message, or null when the
 * file is acceptable. Extension is the source of truth (browser MIME types
 * vary across platforms for .doc/.docx).
 */
export function validateResumeFile(file: File): string | null {
  if (!mimeFromName(file.name)) {
    return 'Unsupported file type — please upload a PDF, DOC or DOCX file.'
  }
  if (file.size > RESUME_MAX_BYTES) {
    return 'File is too large — the maximum resume size is 5 MB.'
  }
  if (file.size === 0) {
    return 'The selected file is empty.'
  }
  return null
}

/** Read a File as a base64 payload (data-URL prefix stripped) for the JSON API. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Dashed drag-and-drop upload box:
 *   📄  Upload Resume / CV
 *       PDF, DOC or DOCX · Maximum 5 MB
 *                  [ Choose File ]
 */
export function ResumeDropzone({ onFile, disabled, error, id = 'resume-upload' }: {
  onFile: (file: File) => void
  disabled?: boolean
  error?: string | null
  id?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const accept = useCallback(
    (list: FileList | null) => {
      const file = list?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  return (
    <div className="space-y-1.5">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload Resume / CV — drag and drop or choose a file"
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (!disabled) accept(e.dataTransfer.files)
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click()
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-6 text-center transition-colors',
          'focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none',
          dragOver
            ? 'border-teal-500 bg-teal-50/60 dark:border-teal-400 dark:bg-teal-500/10'
            : 'border-slate-300 bg-slate-50/50 hover:border-teal-300 hover:bg-teal-50/40 dark:border-slate-700 dark:bg-white/5 dark:hover:border-teal-500/40 dark:hover:bg-teal-500/5',
          disabled && 'pointer-events-none opacity-60',
        )}
        data-testid={`${id}-dropzone`}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-teal-50 ring-1 ring-teal-200/70 dark:bg-teal-500/10 dark:ring-teal-500/30">
          <UploadCloud className="size-5 text-teal-600 dark:text-teal-400" aria-hidden />
        </span>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Upload Resume / CV</p>
        <p className="text-xs text-muted-foreground">PDF, DOC or DOCX · Maximum 5 MB</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1.5"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            inputRef.current?.click()
          }}
          tabIndex={disabled ? -1 : 0}
        >
          Choose File
        </Button>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={RESUME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={(e) => {
          accept(e.target.files)
          e.target.value = '' // allow re-selecting the same file to "replace"
        }}
      />
      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Stored/selected file row:
 *   📄 Dr_Ravi_Kumar_Resume.pdf   2.4 MB · Uploaded 11 Sep 2026   [actions…]
 */
export function ResumeFileRow({ meta, pending, note, children, testId }: {
  meta: Pick<ResumeMeta, 'fileName' | 'fileSize'>
  /** True when the file has NOT been saved to the server yet (form draft). */
  pending?: boolean
  /** Optional second line override (defaults to size · uploaded date). */
  note?: string
  children?: React.ReactNode
  testId?: string
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5"
      data-testid={testId}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 ring-1 ring-teal-200/70 dark:bg-teal-500/10 dark:ring-teal-500/30">
          <FileText className="size-4.5 text-teal-600 dark:text-teal-400" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={meta.fileName}>
            {meta.fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {note ?? formatFileSize(meta.fileSize)}
            {pending ? <span className="text-amber-600 dark:text-amber-400"> · Not saved yet</span> : null}
          </p>
        </div>
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}
