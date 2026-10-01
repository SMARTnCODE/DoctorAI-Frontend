'use client'

import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Hospital, Stethoscope } from 'lucide-react'
import { DoctorLoginForm } from '@/components/hospital/doctor-login-panel'
import { DoctorForgotPassword } from '@/components/hospital/doctor-forgot-password'
import { navigate } from '@/lib/hash-nav'

/**
 * Doctor sign-in. Separate from the Super Admin login page so a doctor
 * session is created only through the doctor auth API.
 */
export function DoctorLoginPage({ reason }: { reason?: string }) {
  const reduceMotion = useReducedMotion()
  const [forgotOpen, setForgotOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" data-testid="doctor-login">
      <div className="hms-login-backdrop relative hidden shrink-0 flex-col overflow-hidden p-10 text-white lg:flex lg:w-[44%] xl:w-[46%] xl:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute -top-24 -left-20 size-96 rounded-full bg-teal-400/15 blur-3xl"
            animate={reduceMotion ? undefined : { x: [0, 40, -15, 0], y: [0, -25, 12, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-teal-400/15 ring-1 ring-teal-300/30">
            <Hospital className="size-6 text-teal-300" aria-hidden />
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-wide">City General Hospital</p>
            <p className="text-xs text-white/55">Doctor Portal</p>
          </div>
        </div>
        <div className="relative my-auto max-w-md py-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-teal-200/90 uppercase">
            <Stethoscope className="size-3.5" aria-hidden /> Doctor Portal
          </span>
          <h2 className="mt-5 text-3xl leading-[1.15] font-semibold tracking-tight xl:text-[34px]">
            Your schedule, profile, and account — separate from hospital administration.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            Sign in with your doctor email or doctor ID. Administrative tools stay on the Super Admin portal.
          </p>
        </div>
      </div>

      <div className="hms-login-backdrop relative flex items-center gap-3 overflow-hidden px-5 py-7 text-white sm:px-8 lg:hidden">
        <div className="flex size-10 items-center justify-center rounded-xl bg-teal-400/15 ring-1 ring-teal-300/30">
          <Stethoscope className="size-5 text-teal-300" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide">City General Hospital</p>
          <p className="text-xs text-white/55">Doctor Portal</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-5 py-10 sm:px-10 lg:px-16 dark:bg-card">
        <div className="w-full max-w-[420px]">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-[#102A27] sm:text-[28px] dark:text-foreground">
            Doctor sign in
          </h1>
          <p className="mt-2 text-sm text-[#667A75] dark:text-muted-foreground">
            Secure access for clinical staff
          </p>
          {reason ? (
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-300" role="status">
              {reason}
            </p>
          ) : null}
          <DoctorLoginForm onForgotPassword={() => setForgotOpen(true)} />
          <p className="mt-6 text-center text-sm text-[#667A75] dark:text-muted-foreground">
            Hospital administrator?{' '}
            <button
              type="button"
              className="font-semibold text-[#187C70] hover:underline dark:text-teal-300"
              onClick={() => navigate('/super-admin/login')}
            >
              Super Admin sign in
            </button>
          </p>
        </div>
      </div>

      <DoctorForgotPassword open={forgotOpen} onOpenChange={setForgotOpen} />
    </div>
  )
}
