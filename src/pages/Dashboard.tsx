import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatDateIL, todayYmd } from '../lib/dates'
import { priorityColor } from '../lib/priorityColor'
import { useClients } from '../hooks/useClients'
import { useInvoices } from '../hooks/useInvoices'
import { useProjects } from '../hooks/useProjects'
import { taskVisibleToUser } from '../lib/taskVisibility'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import type { Priority, Project } from '../types'
import { Badge } from '../components/shared/Badge'
import { ProgressBar } from '../components/shared/ProgressBar'

function KpiCard(props: {
  value: number
  label: string
  borderColor: string
}) {
  return (
    <div
      className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
      style={{ borderTopWidth: 4, borderTopColor: props.borderColor }}
    >
      <div className="text-[32px] font-extrabold tabular-nums text-[var(--blue-mid)]">
        {props.value}
      </div>
      <div className="mt-1 text-[12px] text-[var(--text-mid)]">{props.label}</div>
    </div>
  )
}

function formatILS(n: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n)
}

function ymdPart(s: string): string {
  return s.slice(0, 10)
}

function daysLate(dueYmd: string, today: string): number {
  const [y, m, d] = dueYmd.split('-').map(Number)
  const [yt, mt, dt] = today.split('-').map(Number)
  const due = Date.UTC(y, m - 1, d)
  const t = Date.UTC(yt, mt - 1, dt)
  return Math.max(0, Math.round((t - due) / 86400000))
}

function priorityLabel(p: Priority): string {
  switch (p) {
    case 'high':
      return 'גבוהה'
    case 'medium':
      return 'בינונית'
    case 'low':
      return 'נמוכה'
  }
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { projects } = useProjects()
  const { tasks } = useTasks()
  const { clients } = useClients()
  const { invoices } = useInvoices()
  const { users: teamMembers } = useUsers()

  const myUid = user?.uid ?? ''
  const myRole = teamMembers.find((m) => m.id === myUid)?.role ?? 'employee'

  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) =>
        myUid ? taskVisibleToUser(t, myUid, myRole) : false,
      ),
    [tasks, myUid, myRole],
  )

  const taskScope = myRole === 'superadmin' ? tasks : visibleTasks

  const kpis = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === 'active').length
    const openTasks = taskScope.filter((t) => t.status !== 'done').length
    const activeClients = clients.filter((c) => c.status === 'active').length
    const today = todayYmd()
    const overdue = taskScope.filter(
      (t) => t.status !== 'done' && t.dueDate.slice(0, 10) < today,
    ).length
    return { activeProjects, openTasks, activeClients, overdue }
  }, [projects, taskScope, clients])

  const activeProjectList = useMemo(
    () => projects.filter((p) => p.status === 'active'),
    [projects],
  )

  const todayY = todayYmd()

  const myOverdueTasks = useMemo(() => {
    return visibleTasks.filter((t) => {
      if (t.status === 'done') return false
      const d = t.dueDate.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
      return d < todayY
    })
  }, [visibleTasks, todayY])

  const projectById = useMemo(() => {
    const m = new Map<string, Project>()
    projects.forEach((p) => m.set(p.id, p))
    return m
  }, [projects])

  const clientById = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach((c) => m.set(c.id, c.name))
    return m
  }, [clients])

  const collectionYm = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const collectionKpis = useMemo(() => {
    let toCollect = 0
    let paidMonth = 0
    let overdueCount = 0
    for (const inv of invoices) {
      if (inv.status === 'pending' || inv.status === 'overdue') {
        toCollect += inv.amount
      }
      if (inv.status === 'paid') {
        const pd = inv.paidDate ? ymdPart(inv.paidDate) : ''
        if (pd.startsWith(collectionYm)) paidMonth += inv.amount
      }
      if (inv.status === 'overdue') overdueCount += 1
    }
    return { toCollect, paidMonth, overdueCount }
  }, [invoices, collectionYm])

  const urgentOverdueInvoices = useMemo(() => {
    const today = todayYmd()
    return invoices
      .filter((i) => i.status === 'overdue')
      .filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(ymdPart(i.dueDate)))
      .sort((a, b) => ymdPart(a.dueDate).localeCompare(ymdPart(b.dueDate)))
      .slice(0, 3)
      .map((inv) => ({
        inv,
        days: daysLate(ymdPart(inv.dueDate), today),
      }))
  }, [invoices])

  /** משימות שאינן «הושלם», במסגרת הרשאות המשתמש */
  const openTasksByProjectId = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of taskScope) {
      if (!t.projectId || t.status === 'done') continue
      m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1)
    }
    return m
  }, [taskScope])

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 px-8 py-8">
      <header>
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
          דשבורד
        </h1>
        <p className="mt-1 text-[13px] text-[var(--text-mid)]">
          סקירה מהירה של פעילות הסוכנות
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          value={kpis.activeProjects}
          label="פרויקטים פעילים"
          borderColor="#2563EB"
        />
        <KpiCard
          value={kpis.openTasks}
          label="משימות פתוחות"
          borderColor="#10B981"
        />
        <KpiCard
          value={kpis.activeClients}
          label="לקוחות פעילים"
          borderColor="#F97316"
        />
        <KpiCard
          value={kpis.overdue}
          label="משימות באיחור"
          borderColor="#EF4444"
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-[15px] font-bold text-[var(--blue-dark)]">גבייה</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div
            className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            style={{ borderTopWidth: 3, borderTopColor: '#2563EB' }}
          >
            <div className="text-[11px] font-semibold text-[var(--text-mid)]">
              💰 לגבייה
            </div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-dark)]">
              {formatILS(collectionKpis.toCollect)}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-light)]">סה״כ</div>
          </div>
          <div
            className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            style={{ borderTopWidth: 3, borderTopColor: '#10B981' }}
          >
            <div className="text-[11px] font-semibold text-[var(--text-mid)]">
              ✅ שולם
            </div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-dark)]">
              {formatILS(collectionKpis.paidMonth)}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-light)]">החודש</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/collections')}
            className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)] p-4 text-right shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-[#EF4444]/40 hover:shadow-[0_4px_16px_rgba(239,68,68,0.12)]"
            style={{ borderTopWidth: 3, borderTopColor: '#EF4444' }}
          >
            <div className="text-[11px] font-semibold text-[var(--text-mid)]">
              ⚠️ באיחור
            </div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-[#EF4444]">
              {collectionKpis.overdueCount}{' '}
              <span className="text-sm font-bold text-[var(--text-mid)]">
                חשבוניות
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--text-light)]">
              לחץ לפתיחת מעקב גבייה
            </div>
          </button>
        </div>
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <p className="mb-3 text-[12px] font-bold text-[var(--text-dark)]">
            דחופות — באיחור
          </p>
          {urgentOverdueInvoices.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין חשבוניות באיחור</p>
          ) : (
            <ul className="space-y-2">
              {urgentOverdueInvoices.map(({ inv, days }) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="font-medium text-[var(--text-dark)]">
                    {clientById.get(inv.clientId) ?? 'לקוח'}
                  </span>
                  <span className="tabular-nums text-[var(--text-mid)]">
                    {formatILS(inv.amount)}
                    <span className="me-2 text-[#EF4444]">
                      {' '}
                      · איחור {days} ימים
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => navigate('/collections')}
            className="mt-4 w-full rounded-lg border border-[var(--border)] py-2 text-center text-[13px] font-semibold text-[var(--blue-dark)] transition hover:bg-[var(--blue-light)]"
          >
            לכל הגבייה →
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-[15px] font-bold text-[var(--blue-dark)]">
            פרויקטים פעילים
          </h2>
          <div className="space-y-3">
            {activeProjectList.map((p) => {
              const clientName =
                p.type === 'internal'
                  ? 'פנימי'
                  : p.clientId
                    ? (clientById.get(p.clientId) ?? 'לקוח לא ידוע')
                    : 'לקוח לא ידוע'
              const openN = openTasksByProjectId.get(p.id) ?? 0
              const openLabel =
                openN === 0
                  ? 'אין משימות פתוחות לביצוע'
                  : openN === 1
                    ? 'משימה אחת פתוחה לביצוע'
                    : `${openN} משימות פתוחות לביצוע`
              return (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/projects/${p.id}`)}
                className="w-full rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-5 text-right shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-[var(--blue-mid)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.12)]"
                style={{ borderTopWidth: 4, borderTopColor: p.color }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--text-dark)]">
                    {p.name}
                  </span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                </div>
                <div className="mb-3 space-y-1 text-[12px] leading-snug">
                  <p className="font-bold text-[var(--blue-dark)]">{clientName}</p>
                  <p className="text-[var(--text-mid)]">
                    <span className="text-[var(--text-light)]">יעד: </span>
                    {formatDateIL(p.dueDate)}
                  </p>
                  <p className="text-[var(--text-dark)]">{openLabel}</p>
                </div>
                <ProgressBar
                  done={p.doneCount}
                  total={p.taskCount}
                  color={p.color}
                  manualPercent={p.manualProgressPercent}
                />
              </button>
              )
            })}
            {activeProjectList.length === 0 ? (
              <p className="text-sm text-[var(--text-mid)]">אין פרויקטים פעילים</p>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-[15px] font-bold text-[var(--blue-dark)]">
            אחסון / דורש טיפול
          </h2>
          <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <svg
              className="mb-3 h-12 w-12 text-[var(--text-light)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 7v10c0 1.1.9 2 2 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-2l-1-2H9L8 7H6a2 2 0 00-2 2z"
              />
            </svg>
            <p className="text-sm text-[var(--text-mid)]">
              מחלקת האחסון תגיע בשלב הבא
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-bold text-[var(--blue-dark)]">
          המשימות שלי
        </h2>
        <p className="mb-4 mt-1 text-[12px] text-[var(--text-mid)]">
          רק משימות באיחור לטיפול מיידי
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {myOverdueTasks.map((t) => {
            const proj = t.projectId
              ? projectById.get(t.projectId)
              : undefined
            const pc = priorityColor(t.priority)
            return (
              <div
                key={t.id}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition hover:border-[var(--blue-mid)]"
                style={{ borderRightWidth: 3, borderRightColor: pc }}
              >
                <div className="mb-2 font-medium text-[var(--text-dark)]">
                  {t.title}
                </div>
                <div className="mb-2 text-xs text-[var(--text-mid)]">
                  {proj?.name ?? 'פרויקט'}
                </div>
                <Badge label={priorityLabel(t.priority)} color={pc} />
                <div className="mt-2 text-[11px] text-[var(--text-light)]">
                  יעד: {formatDateIL(t.dueDate)}
                </div>
              </div>
            )
          })}
        </div>
        {myOverdueTasks.length === 0 ? (
          <p className="text-sm text-[var(--text-mid)]">
            אין משימות באיחור המשויכות אליך — אין כרגע דבר הדורש טיפול מיידי
          </p>
        ) : null}
      </section>
    </div>
  )
}
