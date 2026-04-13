import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { addDaysYmd, formatDateIL, todayYmd } from '../lib/dates'
import { priorityColor } from '../lib/priorityColor'
import { useClients } from '../hooks/useClients'
import { useCollectionTracking } from '../hooks/useCollectionTracking'
import { useProjects } from '../hooks/useProjects'
import { getCollectionTrackingStatus } from '../lib/collectionTrackingStatus'
import { isRetainerProject } from '../lib/projectRetainer'
import { taskVisibleToUser } from '../lib/taskVisibility'
import { useTasks } from '../hooks/useTasks'
import { useSuppliers } from '../hooks/useSuppliers'
import { useUsers } from '../hooks/useUsers'
import type { Priority, Project, ProjectStatus } from '../types'
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

function daysUntilDue(dueYmd: string, today: string): number {
  const [y, m, d] = dueYmd.split('-').map(Number)
  const [yt, mt, dt] = today.split('-').map(Number)
  const due = Date.UTC(y, m - 1, d)
  const t = Date.UTC(yt, mt - 1, dt)
  return Math.round((due - t) / 86400000)
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

function myOpenTasksPhrase(n: number): string {
  if (n === 0) return 'אין משימות פתוחות שלך'
  if (n === 1) return 'משימה אחת פתוחה שלך'
  return `${n} משימות פתוחות שלך`
}

/** סה״כ פתוחות בפרויקט — כל המשימות גלויות לחברי הצוות */
function projectOpenTasksPhrase(n: number): string {
  if (n === 0) return 'אין משימות פתוחות בפרויקט'
  if (n === 1) return 'משימה אחת פתוחה בפרויקט'
  return `${n} משימות פתוחות בפרויקט`
}

/** פרויקטים שמוצגים בדשבורד — לא רק «פעיל», כדי שפרויקטים בתכנון (ברירת מחדל) יופיעו */
const DASHBOARD_OPEN_STATUSES: ProjectStatus[] = ['planning', 'active', 'review']

const dashboardStatusLabels: Record<ProjectStatus, string> = {
  planning: 'תכנון',
  active: 'פעיל',
  review: 'בבדיקה',
  done: 'הושלם',
}

const dashboardStatusBadgeColor: Record<ProjectStatus, string> = {
  planning: '#2563EB',
  active: '#2563EB',
  review: '#F97316',
  done: '#16A34A',
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { projects } = useProjects()
  const { tasks } = useTasks()
  const { clients } = useClients()
  const { entries: collectionEntries } = useCollectionTracking()
  const { suppliers } = useSuppliers()
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

  const taskScope = visibleTasks

  const kpis = useMemo(() => {
    const projectsInProgress = projects.filter((p) => p.status !== 'done')
      .length
    const openTasks = taskScope.filter((t) => t.status !== 'done').length
    const activeClients = clients.filter((c) => c.status === 'active').length
    const today = todayYmd()
    const overdue = taskScope.filter(
      (t) => t.status !== 'done' && t.dueDate.slice(0, 10) < today,
    ).length
    return { projectsInProgress, openTasks, activeClients, overdue }
  }, [projects, taskScope, clients])

  const openDashboardProjectList = useMemo(
    () => projects.filter((p) => DASHBOARD_OPEN_STATUSES.includes(p.status)),
    [projects],
  )

  const openOneTimeList = useMemo(
    () => openDashboardProjectList.filter((p) => !isRetainerProject(p)),
    [openDashboardProjectList],
  )

  const openRetainerList = useMemo(
    () => openDashboardProjectList.filter((p) => isRetainerProject(p)),
    [openDashboardProjectList],
  )

  const supplierById = useMemo(() => {
    const m = new Map<string, string>()
    suppliers.forEach((s) => m.set(s.id, s.name))
    return m
  }, [suppliers])

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

  const todayForCollection = todayYmd()

  /** יעד תשלום בטווח היום עד כולל עוד 10 ימים — לא שולם ולא באיחור */
  const collectionDueWithin10Days = useMemo(() => {
    const today = todayForCollection
    const limit = addDaysYmd(today, 10)
    const out = collectionEntries.filter((row) => {
      if (getCollectionTrackingStatus(row, today) !== 'pending') return false
      const due = ymdPart(row.dueDate)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false
      return due >= today && due <= limit
    })
    out.sort((a, b) => ymdPart(a.dueDate).localeCompare(ymdPart(b.dueDate)))
    return out
  }, [collectionEntries, todayForCollection])

  /** כל הרשומות באיחור (לפי יעד) */
  const collectionOverdueList = useMemo(() => {
    const today = todayForCollection
    const out = collectionEntries.filter((row) => {
      if (getCollectionTrackingStatus(row, today) !== 'overdue') return false
      const due = ymdPart(row.dueDate)
      return /^\d{4}-\d{2}-\d{2}$/.test(due)
    })
    out.sort((a, b) => ymdPart(a.dueDate).localeCompare(ymdPart(b.dueDate)))
    return out
  }, [collectionEntries, todayForCollection])

  /** משימות פתוחות **של המשתמש המחובר** (אחראי) לפי פרויקט */
  const myOpenTasksByProjectId = useMemo(() => {
    const m = new Map<string, number>()
    if (!myUid) return m
    for (const t of tasks) {
      if (!t.projectId || t.status === 'done') continue
      if (t.assigneeId !== myUid) continue
      if (!taskVisibleToUser(t, myUid, myRole)) continue
      m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1)
    }
    return m
  }, [tasks, myUid, myRole])

  /** סה״כ משימות פתוחות בפרויקט (כל המשימות הגלויות לצוות) */
  const projectOpenTasksByProjectId = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of visibleTasks) {
      if (!t.projectId || t.status === 'done') continue
      m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1)
    }
    return m
  }, [visibleTasks])

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
          value={kpis.projectsInProgress}
          label="סה״כ פרויקטים בביצוע"
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-[var(--blue-dark)]">גבייה</h2>
          <button
            type="button"
            onClick={() => navigate('/collections')}
            className="rounded-[10px] border border-[var(--border)] bg-[var(--blue-light)] px-3 py-1.5 text-[11px] font-bold text-[var(--blue-dark)] transition hover:bg-[#BFDBFE]"
          >
            מעקב גבייה — פירוט ומחלקות →
          </button>
        </div>
        {collectionEntries.length === 0 ? (
          <p className="text-[12px] text-[var(--text-mid)]">
            אין לקוחות במעקב.{' '}
            <button
              type="button"
              onClick={() => navigate('/collections')}
              className="font-semibold text-[var(--blue-dark)] underline"
            >
              הוסיפו ממסך הגבייה
            </button>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[12px] border border-[var(--border)] border-s-[3px] border-s-[#EF4444] bg-[var(--bg-card)] p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
              <p className="text-[11px] font-bold text-[#EF4444]">
                באיחור · {collectionOverdueList.length}
              </p>
              {collectionOverdueList.length === 0 ? (
                <p className="mt-2 text-[12px] text-[var(--text-mid)]">אין</p>
              ) : (
                <ul className="mt-2 max-h-[240px] space-y-1.5 overflow-y-auto text-[12px]">
                  {collectionOverdueList.map((row) => {
                    const due = ymdPart(row.dueDate)
                    const late = daysLate(due, todayForCollection)
                    return (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-[var(--border)] pb-1.5 last:border-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate font-medium text-[var(--text-dark)]">
                          {clientById.get(row.clientId) ?? 'לקוח'}
                        </span>
                        <span className="shrink-0 tabular-nums text-[11px] text-[#EF4444]">
                          {late} ימים · {formatDateIL(row.dueDate)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="rounded-[12px] border border-[var(--border)] border-s-[3px] border-s-[#F59E0B] bg-[var(--bg-card)] p-3 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
              <p className="text-[11px] font-bold text-[#B45309]">
                יעד תוך 10 ימים (כולל היום) · {collectionDueWithin10Days.length}
              </p>
              {collectionDueWithin10Days.length === 0 ? (
                <p className="mt-2 text-[12px] text-[var(--text-mid)]">אין</p>
              ) : (
                <ul className="mt-2 max-h-[240px] space-y-1.5 overflow-y-auto text-[12px]">
                  {collectionDueWithin10Days.map((row) => {
                    const due = ymdPart(row.dueDate)
                    const left = daysUntilDue(due, todayForCollection)
                    return (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-[var(--border)] pb-1.5 last:border-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate font-medium text-[var(--text-dark)]">
                          {clientById.get(row.clientId) ?? 'לקוח'}
                        </span>
                        <span className="shrink-0 tabular-nums text-[11px] text-[var(--text-mid)]">
                          {left === 0 ? 'היום' : `עוד ${left} ימים`} ·{' '}
                          {formatDateIL(row.dueDate)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch">
          <div
            className="flex min-h-0 flex-col rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
            style={{ borderTopWidth: 4, borderTopColor: '#2563EB' }}
          >
            <div className="mb-4 border-b border-[var(--border)] pb-3">
              <h2 className="text-[15px] font-bold text-[var(--blue-dark)]">
                פרויקטים פעילים
              </h2>
              <p className="mt-1 text-[11px] text-[var(--text-light)]">
                חד־פעמיים · תכנון, פעיל או בבדיקה · {openOneTimeList.length}{' '}
                פרויקטים
              </p>
            </div>
            <div
              role="region"
              aria-label="רשימת פרויקטים חד־פעמיים — גלילה כשיש יותר משלושה"
              className="flex min-h-0 max-h-[46rem] flex-1 flex-col overflow-y-auto overscroll-y-contain pe-1 [-ms-overflow-style:auto] [scrollbar-gutter:stable]"
            >
              <div className="flex flex-col gap-3">
              {openOneTimeList.map((p) => {
                const clientName =
                  p.type === 'internal'
                    ? 'פנימי'
                    : p.clientId
                      ? (clientById.get(p.clientId) ?? 'לקוח לא ידוע')
                      : 'לקוח לא ידוע'
                const myOpen = myOpenTasksByProjectId.get(p.id) ?? 0
                const projOpen = projectOpenTasksByProjectId.get(p.id) ?? 0
                const openLabel = `${myOpenTasksPhrase(myOpen)} · ${projectOpenTasksPhrase(projOpen)}`
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
                      <div className="flex shrink-0 items-center gap-2">
                        {p.status !== 'active' ? (
                          <Badge
                            label={dashboardStatusLabels[p.status]}
                            color={dashboardStatusBadgeColor[p.status]}
                          />
                        ) : null}
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                    {p.description?.trim() ? (
                      <div className="mb-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
                        <p className="mb-1 text-[10px] font-bold text-[var(--text-light)]">
                          תיאור
                        </p>
                        <p
                          className="line-clamp-4 text-[12px] leading-relaxed text-[var(--text-dark)]"
                          title={p.description.trim()}
                        >
                          {p.description.trim()}
                        </p>
                      </div>
                    ) : null}
                    <div className="mb-3 space-y-1 text-[12px] leading-snug">
                      <p className="font-bold text-[var(--blue-dark)]">
                        {clientName}
                      </p>
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
              {openOneTimeList.length === 0 ? (
                <p className="text-sm text-[var(--text-mid)]">
                  אין פרויקטים חד־פעמיים בתכנון, פעיל או בבדיקה
                </p>
              ) : null}
              </div>
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
            style={{ borderTopWidth: 4, borderTopColor: '#7C3AED' }}
          >
            <div className="mb-4 border-b border-[var(--border)] pb-3">
              <h2
                className="text-[15px] font-bold"
                style={{ color: '#5B21B6' }}
              >
                פרויקטים שוטפים
              </h2>
              <p className="mt-1 text-[11px] text-[var(--text-light)]">
                עדכונים וביקורות חודשיות · {openRetainerList.length} פרויקטים
              </p>
            </div>
            <div
              role="region"
              aria-label="רשימת פרויקטים שוטפים — גלילה כשיש יותר משלושה"
              className="flex min-h-0 max-h-[46rem] flex-1 flex-col overflow-y-auto overscroll-y-contain pe-1 [-ms-overflow-style:auto] [scrollbar-gutter:stable]"
            >
              <div className="flex flex-col gap-3">
              {openRetainerList.map((p) => {
                const clientName =
                  p.type === 'internal'
                    ? 'פנימי'
                    : p.clientId
                      ? (clientById.get(p.clientId) ?? 'לקוח לא ידוע')
                      : 'לקוח לא ידוע'
                const myOpen = myOpenTasksByProjectId.get(p.id) ?? 0
                const projOpen = projectOpenTasksByProjectId.get(p.id) ?? 0
                const openLabel = `${myOpenTasksPhrase(myOpen)} · ${projectOpenTasksPhrase(projOpen)}`
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="w-full rounded-[14px] border border-[var(--border)] bg-[#FAF5FF] p-5 text-right shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:border-[#A78BFA] hover:shadow-[0_4px_20px_rgba(124,58,237,0.15)]"
                    style={{ borderTopWidth: 4, borderTopColor: p.color }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-dark)]">
                        {p.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {p.status !== 'active' ? (
                          <Badge
                            label={dashboardStatusLabels[p.status]}
                            color={dashboardStatusBadgeColor[p.status]}
                          />
                        ) : null}
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                    {p.description?.trim() ? (
                      <div className="mb-3 rounded-[10px] border border-[#E9D5FF] bg-white/80 px-3 py-2">
                        <p className="mb-1 text-[10px] font-bold text-[var(--text-light)]">
                          תיאור
                        </p>
                        <p
                          className="line-clamp-4 text-[12px] leading-relaxed text-[var(--text-dark)]"
                          title={p.description.trim()}
                        >
                          {p.description.trim()}
                        </p>
                      </div>
                    ) : null}
                    <div className="mb-3 space-y-1 text-[12px] leading-snug">
                      <p className="font-bold text-[var(--blue-dark)]">
                        {clientName}
                      </p>
                      <p className="text-[var(--text-mid)]">
                        <span className="text-[var(--text-light)]">פעיל מאז </span>
                        {p.startDate
                          ? formatDateIL(p.startDate)
                          : formatDateIL(p.dueDate)}
                      </p>
                      {p.supplierId ? (
                        <p className="text-[11px] text-[var(--text-mid)]">
                          ספק:{' '}
                          {supplierById.get(p.supplierId) ?? p.supplierId}
                        </p>
                      ) : null}
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
              {openRetainerList.length === 0 ? (
                <p className="text-sm text-[var(--text-mid)]">
                  אין פרויקטים שוטפים בתכנון, פעיל או בבדיקה
                </p>
              ) : null}
              </div>
            </div>
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
                <div className="mb-1 text-xs text-[var(--text-mid)]">
                  {proj?.name ?? 'פרויקט'}
                </div>
                {proj?.description?.trim() ? (
                  <p
                    className="mb-2 line-clamp-2 text-[10px] leading-snug text-[var(--text-light)]"
                    title={proj.description.trim()}
                  >
                    {proj.description.trim()}
                  </p>
                ) : null}
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
