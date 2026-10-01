'use client'

/**
 * Role gate for hash routes. Unauthenticated visitors go to the login page
 * for that area. A signed-in user with the wrong role goes to their own home.
 */
import { useEffect, type ReactNode } from 'react'
import { Hospital } from 'lucide-react'
import { useAuth } from '@/components/hospital/auth-context'
import { navigate } from '@/lib/hash-nav'
import { homePathForRole, loginPathForArea, type UserRole } from '@/lib/roles'

function Splash({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex size-14 animate-pulse items-center justify-center rounded-2xl bg-teal-600 shadow-lg shadow-teal-600/20">
        <Hospital className="size-7 text-white" aria-hidden />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

export function RedirectTo({ target }: { target: string }) {
  useEffect(() => {
    navigate(target)
  }, [target])
  return <Splash label="Redirecting…" />
}

export function ProtectedRoute({
  allowedRoles,
  path,
  children,
}: {
  allowedRoles: readonly UserRole[]
  path: string
  children: ReactNode
}) {
  const { status, role } = useAuth()

  if (status === 'loading') return <Splash label="Verifying secure session…" />

  if (status !== 'authenticated' || !role) {
    return <RedirectTo target={loginPathForArea(path)} />
  }

  if (!allowedRoles.includes(role)) {
    return <RedirectTo target={homePathForRole(role)} />
  }

  return children
}
