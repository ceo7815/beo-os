import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAiAgentsFleet } from '../hooks/useAiAgentsFleet'
import { useLeads } from '../hooks/useLeads'
import { fetchLeadsApprovals } from '../lib/leadsBeoApi'

const STORAGE_KEY = 'beo-os-onboarding-v1'

type StepId = 'open-agents' | 'open-approvals' | 'see-cold' | 'see-leads'

type Step = {
  id: StepId
  title: string
  detail: string
  to: string
}

const STEPS: Step[] = [
  {
    id: 'open-agents',
    title: 'פתחו את צי הסוכנים',
    detail: 'ראו את שי ועדי בחדר הבקרה',
    to: '/ai-agents',
  },
  {
    id: 'open-approvals',
    title: 'טאב אישורים של שי',
    detail: 'כאן מאשרים שליחת מייל — העבודה האמיתית',
    to: '/ai-agents/leads-beo',
  },
  {
    id: 'see-cold',
    title: 'לידים קרים',
    detail: 'אחרי שליחה מאושרת נפתח ליד קר בדף לידים',
    to: '/leads?filter=cold',
  },
  {
    id: 'see-leads',
    title: 'צינור לידים חמים',
    detail: 'אחרי תשובה אנושית — ליד רגיל לטיפול מכירות',
    to: '/leads?filter=open',
  },
]

function loadDone(): Set<StepId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed as StepId[])
  } catch {
    return new Set()
  }
}

function saveDone(done: Set<StepId>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]))
}

/** צ׳ק־ליסט יום ראשון — נסתר אחרי השלמה / דילוג */
export function OnboardingChecklist() {
  const { fleetUp } = useAiAgentsFleet()
  const { leads } = useLeads()
  const [done, setDone] = useState<Set<StepId>>(() => loadDone())
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(`${STORAGE_KEY}-dismiss`) === '1',
  )
  const [pendingApprovals, setPendingApprovals] = useState(0)

  useEffect(() => {
    if (!fleetUp) return
    void fetchLeadsApprovals().then((r) => {
      if (r.ok) setPendingApprovals(r.items.length)
    })
  }, [fleetUp])

  const coldCount = useMemo(() => leads.filter((l) => l.status === 'cold').length, [leads])

  const mark = (id: StepId) => {
    setDone((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDone(next)
      return next
    })
  }

  if (dismissed) return null
  if (STEPS.every((s) => done.has(s.id))) return null

  return (
    <section className="beo-agent-panel border-[var(--brand)]/20 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="beo-agent-kicker">יום ראשון ב-Beo OS</p>
          <h2 className="mt-0.5 text-[15px] font-extrabold text-[var(--text-dark)]">
            התחילו כאן
          </h2>
          <p className="mt-1 text-[12px] text-[var(--text-mid)]">
            {fleetUp
              ? pendingApprovals > 0
                ? `${pendingApprovals} טיוטות ממתינות לאישור אצל שי`
                : 'הצי מחובר — אפשר לאשר טיוטות'
              : 'הצי המקומי כבוי — בפרודקשן הוא רץ על השרת'}
            {coldCount > 0 ? ` · ${coldCount} לידים קרים` : ''}
          </p>
        </div>
        <button
          type="button"
          className="text-[11px] font-semibold text-[var(--text-light)] hover:text-[var(--text-mid)]"
          onClick={() => {
            localStorage.setItem(`${STORAGE_KEY}-dismiss`, '1')
            setDismissed(true)
          }}
        >
          הסתר
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {STEPS.map((step) => {
          const ok = done.has(step.id)
          return (
            <li key={step.id}>
              <Link
                to={step.to}
                onClick={() => mark(step.id)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${
                  ok
                    ? 'border-emerald-200 bg-emerald-50/80'
                    : 'border-[var(--border)] bg-white hover:border-[var(--brand)]/30'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-[var(--text-dark)]">{step.title}</div>
                  <div className="text-[11px] text-[var(--text-mid)]">{step.detail}</div>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-bold ${
                    ok ? 'text-emerald-700' : 'text-[var(--brand)]'
                  }`}
                >
                  {ok ? 'בוצע' : 'פתח'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
