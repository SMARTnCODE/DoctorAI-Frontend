'use client'

import { useMemo } from 'react'
import {
  AlertTriangle, BedDouble, Droplet, FlaskConical, HeartPulse, Stethoscope,
  Thermometer, Users, Video, Wind,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import {
  ABNORMAL_LABS, ADMISSIONS, DOCTORS, PATIENTS, isSameLocalDay, weekTrend,
} from '@/components/hospital/clinical/clinical-data'
import { navigate } from '@/lib/hash-nav'
import { formatDateTime, initials } from '@/lib/format'
import { cn } from '@/lib/utils'

function relativeTime(iso: string): string {
  const days = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000))
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

function StatTile({
  label, value, hint, icon: Icon, iconClass, hintClass,
}: {
  label: string
  value: number
  hint: React.ReactNode
  icon: LucideIcon
  iconClass: string
  hintClass?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
          <p className={cn('mt-1 text-xs text-muted-foreground', hintClass)}>{hint}</p>
        </div>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  )
}

function VitalChip({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-2 text-center">
      <Icon className={cn('mx-auto size-3.5', tone)} aria-hidden />
      <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold">{value}</p>
    </div>
  )
}

const FLAG_BADGE: Record<string, string> = {
  high: 'border-amber-200 bg-amber-50 text-amber-800',
  critical: 'border-rose-200 bg-rose-50 text-rose-700',
  low: 'border-sky-200 bg-sky-50 text-sky-800',
}

export function DoctorDashboardView() {
  const opd = useClinicalStore((s) => s.opd)
  const tele = useClinicalStore((s) => s.telehealth)

  const opdToday = opd.filter((row) => isSameLocalDay(row.scheduledAt))
  const teleToday = tele.filter((row) => isSameLocalDay(row.scheduledAt))
  const critical = ADMISSIONS.filter((row) => row.severity === 'critical')
  const completedToday = opdToday.filter((row) => row.status === 'completed').length
  const trend = useMemo(() => weekTrend(opd, tele), [opd, tele])

  const mix = useMemo(() => {
    const male = PATIENTS.filter((p) => p.gender === 'male').length
    const female = PATIENTS.filter((p) => p.gender === 'female').length
    return [
      { name: 'Male', value: male },
      { name: 'Female', value: female },
    ].filter((row) => row.value > 0)
  }, [])

  const wards = useMemo(() => {
    const order = ['A-Ward', 'CCU', 'General', 'ICU', 'B-Ward', 'Pediatrics']
    const map = new Map<string, number>()
    for (const row of ADMISSIONS) map.set(row.ward, (map.get(row.ward) ?? 0) + 1)
    return [...map.entries()]
      .map(([ward, count]) => ({ ward, count }))
      .sort((a, b) => {
        const ai = order.indexOf(a.ward)
        const bi = order.indexOf(b.ward)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
  }, [])
  const wardTotal = wards.reduce((sum, ward) => sum + ward.count, 0) || 1

  const upcoming = [...opd, ...tele]
    .filter((row) => isSameLocalDay(row.scheduledAt) && Date.parse(row.scheduledAt) >= Date.now() && row.status !== 'completed' && row.status !== 'no-show')
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))

  const departmentMix = useMemo(() => {
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - 6)
    const map = new Map<string, number>()
    for (const row of [...opd, ...tele]) {
      if (Date.parse(row.scheduledAt) < weekStart.getTime()) continue
      map.set(row.specialty, (map.get(row.specialty) ?? 0) + 1)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [opd, tele])

  const workload = DOCTORS.map((doctor) => ({
    ...doctor,
    admissions: ADMISSIONS.filter((row) => row.doctor === doctor.name).length,
    appointments: [...opd, ...tele].filter((row) => row.doctorName === doctor.name && isSameLocalDay(row.scheduledAt)).length,
  })).sort((a, b) => b.appointments - a.appointments || b.admissions - a.admissions)
  const maxAppts = Math.max(1, ...workload.map((row) => row.appointments))

  const avg = (pick: (v: typeof ADMISSIONS[number]['latestVital']) => number) => {
    if (ADMISSIONS.length === 0) return 0
    return ADMISSIONS.reduce((sum, row) => sum + pick(row.latestVital), 0) / ADMISSIONS.length
  }
  const avgHr = Math.round(avg((v) => v.heartRate))
  const avgTemp = (avg((v) => v.temperature)).toFixed(1)
  const avgSpo2 = Math.round(avg((v) => v.oxygenSat))
  const avgRr = Math.round(avg((v) => v.respiratoryRate ?? 0))

  const alertCount = critical.length + ABNORMAL_LABS.length

  return (
    <div className="space-y-4" data-testid="doctor-dashboard">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Patients"
          value={PATIENTS.length}
          hint={<span className="text-emerald-700 dark:text-emerald-300">+8% vs last week</span>}
          icon={Users}
          iconClass="bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-200"
        />
        <StatTile
          label="In-Hospital"
          value={ADMISSIONS.length}
          hint={<span className="font-medium text-rose-600">{critical.length} critical</span>}
          icon={BedDouble}
          iconClass="bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"
        />
        <StatTile
          label="OPD Today"
          value={opdToday.length}
          hint={`${completedToday} completed`}
          icon={Stethoscope}
          iconClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
        />
        <StatTile
          label="Telehealth Today"
          value={teleToday.length}
          hint="Virtual visits"
          icon={Video}
          iconClass="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Appointments — last 7 days</CardTitle>
              <CardDescription className="text-xs">OPD vs Telehealth daily volume</CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#18796D]" /> OPD</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#8FC6BC]" /> Telehealth</span>
            </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="opdFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#18796D" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#18796D" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="teleFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8FC6BC" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#8FC6BC" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(16,42,42,0.08)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} />
                  <Tooltip />
                  <Area type="monotone" dataKey="opd" name="OPD" stroke="#18796D" fill="url(#opdFill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="tele" name="Telehealth" stroke="#57AC9F" fill="url(#teleFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Patient Mix</CardTitle>
            <CardDescription className="text-xs">By gender</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center gap-4">
              <div className="h-full min-w-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
                      <Cell fill="#18796D" />
                      <Cell fill="#8FC6BC" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2 text-sm">
                {mix.map((row, index) => (
                  <li key={row.name} className="flex items-center justify-between gap-6">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className={cn('size-2.5 rounded-full', index === 0 ? 'bg-[#18796D]' : 'bg-[#8FC6BC]')} />
                      {row.name}
                    </span>
                    <span className="font-semibold tabular-nums">{row.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="border-rose-200/70">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
                  <AlertTriangle className="size-4" aria-hidden />
                </span>
                Urgent Alerts
              </CardTitle>
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{alertCount}</Badge>
            </div>
          </CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {critical.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/doctor/patients/${row.patientId}`)}
                className="flex w-full items-start gap-3 rounded-lg border border-rose-100 bg-rose-50/50 p-3 text-left"
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rose-500" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{row.patientName}</span>
                  <span className="block text-xs text-muted-foreground">{row.condition} · {row.ward} / Bed {row.bed}</span>
                  <span className="block text-[11px] text-muted-foreground">Admitted {relativeTime(row.admitDate)} · {row.doctor}</span>
                </span>
              </button>
            ))}
            {ABNORMAL_LABS.map((lab) => (
              <button
                key={lab.id}
                type="button"
                onClick={() => navigate(`/doctor/patients/${lab.patientId}`)}
                className="flex w-full items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-left"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                  <FlaskConical className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {lab.testName} <span className="font-normal text-muted-foreground">— {lab.patientName}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Result: <span className="font-medium text-foreground">{lab.result}</span>{' '}
                    <span className={cn('ml-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase', FLAG_BADGE[lab.flag])}>
                      {lab.flag}
                    </span>
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{relativeTime(lab.reportedAt)}</span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Today&apos;s Upcoming</CardTitle>
                <CardDescription className="text-xs">Next appointments across OPD & Telehealth</CardDescription>
              </div>
              <Button variant="link" className="h-auto p-0 text-teal-700" onClick={() => navigate('/doctor/opd')}>View all</Button>
            </div>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No upcoming appointments.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 6).map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/doctor/patients/${row.patientId}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50"
                    >
                      <span>
                        <span className="font-medium">{row.patientName}</span>
                        <span className="block text-xs text-muted-foreground">{row.purpose} · {row.doctorName}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(row.scheduledAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Appointments by Department</CardTitle>
            <CardDescription className="text-xs">Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentMix} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(16,42,42,0.08)" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" name="Appointments" fill="#18796D" radius={[0, 6, 6, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <BedDouble className="size-4" aria-hidden />
              </span>
              Ward Occupancy
            </CardTitle>
            <CardDescription className="text-xs">Current inpatient distribution</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {wards.map((ward) => {
              const pct = Math.round((ward.count / wardTotal) * 100)
              return (
                <button key={ward.ward} type="button" className="block w-full text-left" onClick={() => navigate('/doctor/inpatients')}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{ward.ward}</span>
                    <span className="tabular-nums text-muted-foreground">{ward.count} · {pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              )
            })}
            <div className="mt-2 grid grid-cols-4 gap-2 border-t pt-3">
              <VitalChip icon={HeartPulse} label="Avg HR" value={`${avgHr} bpm`} tone="text-rose-600" />
              <VitalChip icon={Thermometer} label="Avg Temp" value={`${avgTemp}°C`} tone="text-amber-600" />
              <VitalChip icon={Droplet} label="Avg SpO₂" value={`${avgSpo2}%`} tone="text-sky-600" />
              <VitalChip icon={Wind} label="Avg RR" value={`${avgRr} /min`} tone="text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Stethoscope className="size-4" aria-hidden />
              </span>
              Doctor Workload — Today
            </CardTitle>
            <CardDescription className="text-xs">Appointments and active admissions per clinician</CardDescription>
          </div>
          <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">{workload.length} on duty</Badge>
          </div>
        </CardHeader>
        <CardContent className="divide-y px-2">
          {workload.map((doctor) => (
            <div key={doctor.id} className="flex items-center gap-3 px-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800">
                {initials(doctor.name.replace(/^Dr\.?\s*/, ''))}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doctor.name}</p>
                    <p className="text-[11px] text-muted-foreground">{doctor.specialty}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <BedDouble className="size-3.5 text-teal-700" aria-hidden />
                      <span className="font-semibold text-foreground tabular-nums">{doctor.admissions}</span>
                    </span>
                    <span>
                      <span className="font-semibold text-foreground tabular-nums">{doctor.appointments}</span> appts
                    </span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.round((doctor.appointments / maxAppts) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
