'use client'

/**
 * Dashboard analytics charts (recharts).
 * - "Patients by Department": horizontal bar chart (layout="vertical")
 * - "Shifts · Last 7 days": ComposedChart — Area (scheduled) + Bar (cancelled)
 * - "Upcoming Shifts by Type": donut (PieChart) with center total + legend
 *
 * Charts render only after the first client paint (`mounted` guard) to avoid
 * SSR/hydration width-measurement issues with ResponsiveContainer.
 * All inputs are defensive: missing API fields degrade to empty states.
 */
import { useEffect, useState } from 'react'
import {
  Area, Bar, BarChart, Cell, ComposedChart, Legend, Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from 'recharts'
import { Building2, CalendarClock, CalendarDays } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/hospital/empty-state'

export interface DeptPatientCount {
  department: string
  code?: string
  count: number
}

export interface WeekTrendPoint {
  date: string
  label: string
  scheduled: number
  cancelled: number
}

export interface ShiftTypeSlice {
  type: string
  label: string
  count: number
}

const TEAL = '#1B8A7A'
const ROSE = '#C84A3A'

/** Donut colors per shift type (stakeholder muted palette — no rainbow). */
const SHIFT_TYPE_COLORS: Record<string, string> = {
  MORNING: '#B78724', // warning
  AFTERNOON: '#4B7F95', // info
  EVENING: '#8FA2A5', // neutral gray
  NIGHT: '#102A2A', // primary text / dark neutral
  EMERGENCY: '#C84A3A', // danger
  CUSTOM: '#65B8AA', // secondary teal
}
const FALLBACK_SLICE_COLORS = [TEAL, '#65B8AA', '#8FA2A5', '#4B7F95', '#C84A3A', '#B78724']

// Axis/tick/tooltip chrome is token-based (CSS vars) so charts re-theme with
// dark mode; series colors stay literal (they read well on both themes).
const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
  padding: '8px 10px',
} as const

const TOOLTIP_LABEL = { fontWeight: 600, color: 'var(--popover-foreground)', marginBottom: 2 } as const

function ChartSkeleton() {
  return <Skeleton className="h-[260px] w-full rounded-lg" aria-hidden />
}

function truncateTick(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value
}

export function DashboardChartsSection({
  byDepartment,
  weekTrend,
  shiftTypeDistribution = [],
  loading = false,
}: {
  byDepartment: DeptPatientCount[]
  weekTrend: WeekTrendPoint[]
  shiftTypeDistribution?: ShiftTypeSlice[]
  loading?: boolean
}) {
  // Render charts only after the first client paint (avoids hydration mismatch
  // from ResponsiveContainer's width measurement on the server-rendered HTML).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(t)
  }, [])

  const deptData = byDepartment
    .filter((d) => typeof d?.department === 'string' && d.department.length > 0)
    .map((d) => ({ department: d.department, code: d.code, count: Number(d.count) || 0 }))
  const deptEmpty = deptData.length === 0 || deptData.every((d) => d.count === 0)

  const trendData = (weekTrend ?? []).map((p) => ({
    date: p.date,
    label: p.label ?? p.date,
    scheduled: Number(p.scheduled) || 0,
    cancelled: Number(p.cancelled) || 0,
  }))
  const trendEmpty = trendData.length === 0

  // Donut: every type appears in the legend; zero-count slices are hidden from
  // the pie itself (they would be invisible anyway) and muted in the legend.
  const typeData = (shiftTypeDistribution ?? []).map((t, i) => ({
    type: t.type ?? `TYPE-${i}`,
    label: t.label ?? t.type ?? 'Shift',
    count: Number(t.count) || 0,
    color: SHIFT_TYPE_COLORS[t.type] ?? FALLBACK_SLICE_COLORS[i % FALLBACK_SLICE_COLORS.length],
  }))
  const typeTotal = typeData.reduce((sum, t) => sum + t.count, 0)
  const typeEmpty = typeData.length === 0 || typeTotal === 0
  const pieData = typeData.filter((t) => t.count > 0)

  return (
    <section aria-label="Analytics charts" className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
      {/* Patients by Department */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Patients by Department</CardTitle>
          <CardDescription>Patient distribution across the busiest departments</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {loading || !mounted ? (
            <ChartSkeleton />
          ) : deptEmpty ? (
            <EmptyState
              icon={Building2}
              title="No department data yet"
              description="Once patients are assigned to departments, the distribution will appear here."
            />
          ) : (
            <div role="img" aria-label="Horizontal bar chart of patients by department">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={deptData} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 4 }}>
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    width={104}
                    tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={truncateTick}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(13, 148, 136, 0.07)' }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL}
                    separator=": "
                  />
                  <Bar dataKey="count" name="Patients" fill={TEAL} radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shifts · Last 7 days */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Shifts · Last 7 days</CardTitle>
          <CardDescription>Scheduled vs cancelled shifts</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {loading || !mounted ? (
            <ChartSkeleton />
          ) : trendEmpty ? (
            <EmptyState
              icon={CalendarClock}
              title="No shift activity"
              description="Shift scheduling activity from the last 7 days will appear here."
            />
          ) : (
            <div role="img" aria-label="Area and bar chart of scheduled versus cancelled shifts over the last 7 days">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <defs>
                    <linearGradient id="hms-teal-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--border)', strokeDasharray: '4 3' }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL}
                    separator=": "
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} iconType="circle" />
                  <Area
                    type="monotone"
                    dataKey="scheduled"
                    name="Scheduled"
                    stroke={TEAL}
                    strokeWidth={2}
                    fill="url(#hms-teal-area)"
                  />
                  <Bar dataKey="cancelled" name="Cancelled" fill={ROSE} radius={[3, 3, 0, 0]} barSize={12} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Shifts by Type (donut) */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Upcoming Shifts by Type</CardTitle>
          <CardDescription>Scheduled shifts from today onwards</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {loading || !mounted ? (
            <ChartSkeleton />
          ) : typeEmpty ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming shifts"
              description="Scheduled shifts by type will appear here once shifts are on the roster."
            />
          ) : (
            <div role="img" aria-label="Donut chart of upcoming scheduled shifts by shift type">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {pieData.map((t) => (
                      <Cell key={t.type} fill={t.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={TOOLTIP_LABEL}
                    separator=": "
                    formatter={(value) => [value, 'Scheduled']}
                  />
                  <text
                    x="50%"
                    y="46%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--foreground)"
                    style={{ fontSize: 24, fontWeight: 700 }}
                  >
                    {typeTotal}
                  </text>
                  <text
                    x="50%"
                    y="58%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--muted-foreground)"
                    style={{ fontSize: 11 }}
                  >
                    scheduled
                  </text>
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {typeData.map((t) => (
                  <li
                    key={t.type}
                    className={`flex min-w-0 items-center gap-1.5 text-xs ${t.count === 0 ? 'text-muted-foreground/50' : 'text-slate-700 dark:text-slate-300'}`}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: t.color, opacity: t.count === 0 ? 0.4 : 1 }}
                      aria-hidden
                    />
                    <span className="truncate">{t.label}</span>
                    <span className="ml-auto font-medium tabular-nums">{t.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
