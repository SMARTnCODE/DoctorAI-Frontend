'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, BriefcaseMedical, Search, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PATIENTS, buildChart, OPD, TELEHEALTH, withRegisteredPatients, type PatientSummary } from '@/components/hospital/clinical/clinical-data'
import { useClinicalStore } from '@/components/hospital/clinical/clinical-store'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { patientTypeLabel, patientsService, type Patient } from '@/services/patients.service'
import { toast } from 'sonner'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface RecentPatient {
  id: string
  name: string
  age: string
  gender: string
  badge: string
}

const PROMPTS = [
  'Explain a medical concept',
  'What differential diagnoses should I consider for chest pain?',
  'Review clinical guidelines for hypertension management',
  'Explain drug interactions between warfarin and amoxicillin',
]

const AVATAR_TONES = [
  'bg-emerald-100 text-emerald-800',
  'bg-teal-100 text-teal-800',
  'bg-cyan-100 text-cyan-800',
  'bg-slate-100 text-slate-700',
  'bg-lime-100 text-lime-800',
]

function avatarTone(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % AVATAR_TONES.length
  return AVATAR_TONES[hash]
}

function prettyGender(value: string): string {
  const text = value.trim()
  if (!text || text === '—') return '—'
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function badgeClass(badge: string): string {
  if (badge === 'In-Hospital' || badge === 'In-hospital') return 'border-teal-300 bg-teal-50 text-teal-700'
  if (badge === 'Telehealth') return 'border-cyan-300 bg-cyan-50 text-cyan-800'
  return 'border-sky-300 bg-sky-50 text-sky-800'
}

function badgeForClinical(status: PatientSummary['status']): string {
  if (status === 'admitted') return 'In-hospital'
  if (status === 'telehealth') return 'Telehealth'
  return 'OP Patient'
}

function badgeForApi(type: string): string {
  return patientTypeLabel(type)
}

function fromApi(patient: Patient): RecentPatient {
  return {
    id: patient.id,
    name: patient.fullName,
    age: patient.age != null ? `${patient.age}y` : '—',
    gender: patient.gender || '—',
    badge: badgeForApi(patient.patientType),
  }
}

function fromClinical(patient: PatientSummary): RecentPatient {
  return {
    id: patient.id,
    name: patient.name,
    age: `${patient.age}y`,
    gender: patient.gender,
    badge: badgeForClinical(patient.status),
  }
}

function draftReply(patientId: string | null, prompt: string, roster: PatientSummary[]): string {
  const q = prompt.toLowerCase()
  if (!patientId) {
    if (q.includes('chest pain')) {
      return 'Chest pain differentials to consider, then confirm with history and ECG:\n\n• Acute coronary syndrome\n• Pulmonary embolism\n• Aortic dissection\n• Pneumothorax\n• Pericarditis\n• GERD or musculoskeletal pain\n\nThis is general clinical information. It is not a diagnosis for a specific patient.'
    }
    if (q.includes('hypertension')) {
      return 'Hypertension review points:\n\n• Confirm readings and home logs before changing therapy.\n• Lifestyle measures remain first-line alongside medication when indicated.\n• Recheck electrolytes and renal function after ACE inhibitor, ARB, or diuretic changes.\n\nVerify the current guideline you follow before you prescribe.'
    }
    if (q.includes('warfarin') || q.includes('amoxicillin')) {
      return 'Warfarin and amoxicillin can interact. Amoxicillin may raise the INR in some patients.\n\n• Check a baseline INR if they are not recently stable.\n• Recheck INR a few days after starting or stopping the antibiotic.\n• Watch for bleeding and adjust the warfarin dose only after the INR result.\n\nConfirm this against the patient\'s current medicines and a drug-interaction reference.'
    }
    return 'I can explain general clinical questions without a chart. Pick a patient on the left when you want the answer tied to that record.\n\nAlways verify suggestions with the source guideline and your own judgement before you act.'
  }
  const chart = buildChart(patientId, [], OPD, TELEHEALTH, roster)
  if (!chart) {
    return 'That patient is on the hospital list. I can still answer a general question, and the full chart opens from Patient Records.'
  }
  const { patient, admission, labs, medications } = chart
  const header = `${patient.name}, ${patient.age}y, ${patient.gender}.`
  const stay = admission
    ? `Admitted to ${admission.ward} bed ${admission.bed} for ${admission.condition} (${admission.severity}).`
    : 'Not currently admitted on this board.'
  const abnormal = labs.filter((lab) => lab.flag !== 'normal')
  const labLine = abnormal.length
    ? `Abnormal labs: ${abnormal.map((lab) => `${lab.testName} ${lab.result}`).join('; ')}.`
    : 'No abnormal labs on this chart.'
  return `${header}\n${stay}\n${labLine}\nMedications: ${medications.map((item) => item.name).join(', ') || 'none listed'}.\n\nQuestion: ${prompt}\n\nThis is a chart summary, not a diagnosis.`
}

export function AiWorkspaceView({ patientId }: { patientId?: string }) {
  const added = useClinicalStore((s) => s.patients)
  const roster = useMemo(() => withRegisteredPatients(added), [added])
  const [selected, setSelected] = useState<string | null>(patientId ?? null)
  const [query, setQuery] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [remote, setRemote] = useState<RecentPatient[] | null>(null)

  useEffect(() => {
    if (patientId) setSelected(patientId)
  }, [patientId])

  useEffect(() => {
    let cancelled = false
    patientsService.getPatients({ page: 1, pageSize: 30, sortBy: 'name', sortOrder: 'asc' })
      .then((result) => {
        if (!cancelled) setRemote(result.items.map(fromApi))
      })
      .catch(() => {
        if (!cancelled) setRemote(null)
      })
    return () => { cancelled = true }
  }, [])

  const recent = useMemo(() => {
    const source = remote && remote.length > 0
      ? remote
      : PATIENTS.map(fromClinical)
    const term = query.trim().toLowerCase()
    return source.filter((patient) => !term || patient.name.toLowerCase().includes(term) || patient.badge.toLowerCase().includes(term))
  }, [remote, query])

  const selectedPatient = recent.find((patient) => patient.id === selected)
    ?? (remote ?? PATIENTS.map(fromClinical)).find((patient) => patient.id === selected)
    ?? null

  function send(text: string) {
    const prompt = text.trim()
    if (!prompt) return
    const reply = draftReply(selected, prompt, roster)
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: prompt },
      { id: `a-${Date.now() + 1}`, role: 'assistant', text: reply },
    ])
    setInput('')
  }

  function newChat() {
    setMessages([])
    setSelected(null)
    setInput('')
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-transparent" data-testid="doctor-ai">
      <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#1f7a4d] text-white">
            <Bot className="size-4" aria-hidden />
          </span>
          <div>
            <h1 className="text-sm font-semibold">Clinical AI Co-Pilot</h1>
            <p className="text-xs text-muted-foreground">Evidence-based clinical assistance for your patient care workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Online
          </span>
          <Button size="sm" className="h-8 rounded-lg bg-[#1f7a4d] text-white hover:bg-[#186540]" onClick={newChat}>
            New Chat
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_1fr]">
        <aside className="flex min-h-0 flex-col border-r bg-card">
          <div className="space-y-3 border-b p-3">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Patient context</p>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patient name, MRN, phone..."
                className="h-9 pl-9 shadow-none"
                aria-label="Search patients for AI context"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left',
                selected ? 'bg-card hover:bg-muted/50' : 'border-emerald-600 bg-emerald-50/40',
              )}
            >
              <Sparkles className="size-4 text-emerald-700" aria-hidden />
              <span>
                <span className="block text-sm font-medium">Ask AI</span>
                <span className="block text-[11px] text-muted-foreground">{selectedPatient ? selectedPatient.name : 'No patient selected'}</span>
              </span>
              {!selected ? <span className="ml-auto size-2 rounded-full bg-emerald-500" aria-hidden /> : null}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Recent patients</p>
            <ul className="mt-2 space-y-1">
              {recent.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(patient.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/70',
                      selected === patient.id && 'bg-muted',
                    )}
                  >
                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', avatarTone(patient.id))}>
                      {initials(patient.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{patient.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{patient.age} · {prettyGender(patient.gender)}</span>
                    </span>
                    <span className={cn('shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium', badgeClass(patient.badge))}>
                      {patient.badge}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <p className="px-5 pt-4 text-center text-xs text-muted-foreground">
            <Sparkles className="mr-1 inline size-3.5 text-emerald-700" aria-hidden />
            {selectedPatient
              ? `Ask AI · ${selectedPatient.name} is selected. Answers can use that patient context.`
              : 'Ask AI · No patient selected. General clinical questions can be asked without patient context.'}
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-xl flex-col items-center pt-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-xl bg-[#1f7a4d] text-white">
                  <BriefcaseMedical className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-semibold">How can I help you today?</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Ask general medical/clinical questions, or pick a patient from the left for patient-specific guidance.
                </p>
                <div className="mt-6 w-full space-y-2">
                  {PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground" aria-hidden>›</span>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'max-w-[40rem] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                      message.role === 'user' ? 'ml-auto bg-[#1f7a4d] text-white' : 'border bg-card',
                    )}
                  >
                    {message.text}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            className="border-t bg-card/80 px-4 py-3 sm:px-5"
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedPatient ? `Ask about ${selectedPatient.name}...` : 'Ask a general clinical question...'}
                className="h-11 bg-background"
                aria-label="Clinical question"
              />
              <Button type="submit" size="icon" className="size-11 shrink-0 rounded-lg bg-[#1f7a4d] text-white hover:bg-[#186540]" aria-label="Send" disabled={!input.trim()}>
                <Send className="size-4" />
              </Button>
            </div>
            <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium text-rose-600"
                onClick={() => toast.message('Escalation noted. Continue the review on the patient chart or referral.')}
              >
                <AlertTriangle className="size-3.5" aria-hidden /> Escalate to specialist
              </button>
              <span className="text-muted-foreground">AI can make mistakes. Always verify with clinical judgement.</span>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
