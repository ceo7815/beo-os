import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { addDaysYmd, formatDateIL, todayYmd } from '../lib/dates'
import { priorityColor } from '../lib/priorityColor'
import { useClients } from '../hooks/useClients'
import { useCollectionTracking } from '../hooks/useCollectionTracking'
import { useCampaigns } from '../hooks/useCampaigns'
import { useLeads } from '../hooks/useLeads'
import { useProjects } from '../hooks/useProjects'
import { getCollectionTrackingStatus } from '../lib/collectionTrackingStatus'
import {
  supplierDisplayName,
  supplierNameMap,
} from '../lib/supplierDisplay'
import { isRetainerProject } from '../lib/projectRetainer'
import { taskVisibleToUser } from '../lib/taskVisibility'
import { useTasks } from '../hooks/useTasks'
import { useSuppliers } from '../hooks/useSuppliers'
import { useUsers } from '../hooks/useUsers'
import type {
  Campaign,
  CampaignKind,
  CampaignPlatform,
  CampaignStatus,
  Lead,
  LeadStatus,
  Priority,
  Project,
  ProjectStatus,
} from '../types'
import { Badge } from '../components/shared/Badge'
import { EmptyState } from '../components/shared/EmptyState'
import { ProgressBar } from '../components/shared/ProgressBar'

function KpiCard(props: {
  value: number
  label: string
  borderColor: string
  hint: string
}) {
  return (
    <div
      className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ boxShadow: `inset 0 3px 0 0 ${props.borderColor}` }}
    >
      <div className="text-[30px] font-black tabular-nums text-slate-900">
        {props.value}
      </div>
      <div className="mt-1 text-[13px] font-semibold text-slate-700">{props.label}</div>
      <div className="mt-1 text-[11px] text-slate-500">{props.hint}</div>
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

/** פרויקטים שמוצגים בדשבורד — רק במצב פעיל (שוטפים וחד-פעמיים) */
const DASHBOARD_OPEN_STATUSES: ProjectStatus[] = ['active']

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'חדש',
  specification: 'אפיון',
  quote_sent: 'הצעת מחיר',
  follow_up: 'פולואפ',
  closed: 'נסגר',
}

const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#2563EB',
  specification: '#7C3AED',
  quote_sent: '#D97706',
  follow_up: '#EA580C',
  closed: '#16A34A',
}

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  planning: 'בתכנון',
  active: 'פעיל',
  paused: 'מושהה',
  completed: 'הושלם',
}

const CAMPAIGN_STATUS_COLORS: Record<CampaignStatus, string> = {
  planning: '#2563EB',
  active: '#16A34A',
  paused: '#64748B',
  completed: '#0F766E',
}

const PLATFORM_LABELS: Record<CampaignPlatform, string> = {
  instagram: 'אינסטגרם',
  google_ads: 'Google Ads',
  facebook: 'פייסבוק',
  tiktok: 'טיקטוק',
  linkedin: 'לינקדאין',
  other: 'אחר',
}

const CAMPAIGN_KIND_LABELS: Record<CampaignKind, string> = {
  internal: 'פנימי',
  client: 'לקוח',
}

function isPrivilegedRole(role: string): boolean {
  return role === 'admin' || role === 'superadmin'
}

function leadPipelineSort(a: Lead, b: Lead, today: string): number {
  const tier = (l: Lead): number => {
    if (l.status === 'closed') return 90
    const fu = l.nextFollowUpDate?.slice(0, 10) ?? ''
    if (fu && /^\d{4}-\d{2}-\d{2}$/.test(fu)) {
      if (fu < today) return 0
      if (fu === today) return 1
    }
    const warm: LeadStatus[] = ['follow_up', 'new', 'quote_sent', 'specification']
    return warm.includes(l.status) ? 5 : 8
  }
  const d = tier(a) - tier(b)
  if (d !== 0) return d
  return b.createdAt.localeCompare(a.createdAt)
}

function campaignPipelineSort(a: Campaign, b: Campaign): number {
  const rank = (s: CampaignStatus) =>
    s === 'active' ? 0 : s === 'planning' ? 1 : s === 'paused' ? 2 : 3
  const d = rank(a.status) - rank(b.status)
  if (d !== 0) return d
  return (b.startDate ?? b.createdAt).localeCompare(a.startDate ?? a.createdAt)
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
  const { leads, loading: leadsLoading } = useLeads()
  const { campaigns, loading: campaignsLoading } = useCampaigns()

  const myUid = user?.uid ?? ''
  const myRole = teamMembers.find((m) => m.id === myUid)?.role ?? 'employee'
  const privileged = isPrivilegedRole(myRole)
  const myDisplayName =
    teamMembers.find((m) => m.id === myUid)?.name?.trim() ||
    user?.displayName?.trim() ||
    user?.email?.split('@')[0] ||
    ''

  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) =>
        myUid ? taskVisibleToUser(t, myUid, myRole) : false,
      ),
    [tasks, myUid, myRole],
  )

  const taskScope = visibleTasks

  const todayDash = todayYmd()

  const kpis = useMemo(() => {
    const activeProjects = projects.filter((p) => p.status === 'active').length
    const openTasks = taskScope.filter((t) => t.status !== 'done').length
    const overdue = taskScope.filter(
      (t) => t.status !== 'done' && t.dueDate.slice(0, 10) < todayDash,
    ).length
    return { activeProjects, openTasks, overdue }
  }, [projects, taskScope, todayDash])

  const openLeadsPool = useMemo(() => {
    const open = leads.filter((l) => l.status !== 'closed')
    if (privileged) return open
    return open.filter((l) => l.ownerId === myUid)
  }, [leads, privileged, myUid])

  const leadsDueUrgent = useMemo(() => {
    return openLeadsPool.filter((l) => {
      const fu = l.nextFollowUpDate?.slice(0, 10) ?? ''
      return /^\d{4}-\d{2}-\d{2}$/.test(fu) && fu <= todayDash
    }).length
  }, [openLeadsPool, todayDash])

  const campaignsPipeline = useMemo(() => {
    const running = campaigns.filter((c) => c.status !== 'completed')
    if (privileged) return running
    return running.filter((c) => c.performerUserId === myUid)
  }, [campaigns, privileged, myUid])

  const topLeadsDashboard = useMemo(() => {
    return [...openLeadsPool].sort((a, b) => leadPipelineSort(a, b, todayDash)).slice(0, 6)
  }, [openLeadsPool, todayDash])

  const topCampaignsDashboard = useMemo(() => {
    return [...campaignsPipeline].sort(campaignPipelineSort).slice(0, 5)
  }, [campaignsPipeline])

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

  const supplierById = useMemo(() => supplierNameMap(suppliers), [suppliers])

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

  const topOverdueTask = myOverdueTasks[0]

  const openTasksHint = privileged
    ? 'כל המשימות הגלויות לתפקידך'
    : 'משימות שהוקצו לך'

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-5 md:px-8 md:py-7">
      <header className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50/80 to-indigo-50/40 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {formatDateIL(todayDash)}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
              {myDisplayName ? `שלום, ${myDisplayName}` : 'דשבורד'}
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
              {privileged
                ? 'סיכום צוותי: משימות, פרויקטים פעילים, לידים, קמפיינים וגבייה — לפי סדר דחיפות.'
                : 'המיקוד שלך: משימות, לידים בטיפולך וקמפיינים שאתה מבצע.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              משימות
            </button>
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              פרויקטים
            </button>
            <button
              type="button"
              onClick={() => navigate('/leads')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              לידים
            </button>
            <button
              type="button"
              onClick={() => navigate('/campaigns')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              קמפיינים
            </button>
            <button
              type="button"
              onClick={() => navigate('/collections')}
              className="rounded-xl bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8]"
            >
              גבייה
            </button>
          </div>
        </div>
        {topOverdueTask ? (
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-right transition hover:bg-rose-100/80"
          >
            <div>
              <p className="text-xs font-bold text-rose-700">דורש טיפול מיידי</p>
              <p className="text-sm font-semibold text-slate-900">
                {topOverdueTask.title}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-rose-700">
              יעד: {formatDateIL(topOverdueTask.dueDate)}
            </span>
          </button>
        ) : null}
        {leadsDueUrgent > 0 ? (
          <button
            type="button"
            onClick={() => navigate('/leads')}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-right transition hover:bg-amber-100/90"
          >
            <div>
              <p className="text-xs font-bold text-amber-800">מעקב לידים</p>
              <p className="text-sm font-semibold text-slate-900">
                {leadsDueUrgent === 1
                  ? 'ליד אחד עם פולואפ להיום או באיחור'
                  : `${leadsDueUrgent} לידים עם פולואפ להיום או באיחור`}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-amber-800">
              לרשימת הלידים
            </span>
          </button>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          value={kpis.overdue}
          label="משימות באיחור"
          hint="עדיפות ראשונה"
          borderColor="#EF4444"
        />
        <KpiCard
          value={kpis.openTasks}
          label="משימות פתוחות"
          hint={openTasksHint}
          borderColor="#10B981"
        />
        <KpiCard
          value={kpis.activeProjects}
          label="פרויקטים פעילים"
          hint="במצב «פעיל» בלבד"
          borderColor="#2563EB"
        />
        <KpiCard
          value={openLeadsPool.length}
          label={privileged ? 'לידים בצינור' : 'הלידים שלי'}
          hint="ללא סטטוס «נסגר»"
          borderColor="#7C3AED"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">לידים</h2>
              <p className="text-xs text-slate-500">
                {privileged
                  ? 'הלידים הדחופים ביותר בצינור'
                  : 'לידים ששויכו אליך — לפי פולואפ וסטטוס'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">
                {openLeadsPool.length}
              </span>
              <button
                type="button"
                onClick={() => navigate('/leads')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                כל הלידים
              </button>
            </div>
          </div>
          <div className="min-h-[120px] flex-1 space-y-2">
            {leadsLoading ? (
              <p className="text-sm text-slate-500">טוען לידים…</p>
            ) : topLeadsDashboard.length === 0 ? (
              <EmptyState
                title="אין לידים פתוחים להצגה"
                description={
                  privileged
                    ? 'הוסיפו לידים או עדכנו סטטוס — כאן יופיע מה שדורש מעקב.'
                    : 'כשיוקצו אליך לידים פתוחים, הם יופיעו כאן.'
                }
              />
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto pe-1">
                {topLeadsDashboard.map((l) => {
                  const fu = l.nextFollowUpDate?.slice(0, 10) ?? ''
                  const fuBad =
                    /^\d{4}-\d{2}-\d{2}$/.test(fu) && fu <= todayDash
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => navigate('/leads')}
                        className="flex w-full flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-right transition hover:border-violet-200 hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-900">{l.name}</p>
                            {l.company?.trim() ? (
                              <p className="truncate text-xs text-slate-500">{l.company}</p>
                            ) : null}
                          </div>
                          <Badge
                            label={LEAD_STATUS_LABELS[l.status]}
                            color={LEAD_STATUS_COLORS[l.status]}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                          {fu && /^\d{4}-\d{2}-\d{2}$/.test(fu) ? (
                            <span className={fuBad ? 'font-bold text-amber-700' : ''}>
                              פולואפ: {formatDateIL(fu)}
                            </span>
                          ) : (
                            <span className="text-slate-400">אין תאריך פולואפ</span>
                          )}
                          {privileged && l.ownerId ? (
                            <span className="text-slate-400">
                              אחראי:{' '}
                              {teamMembers.find((m) => m.id === l.ownerId)?.name ?? '—'}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </article>

        <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">קמפיינים</h2>
              <p className="text-xs text-slate-500">
                {privileged
                  ? 'קמפיינים בתכנון, פעילים או מושהים'
                  : 'קמפיינים שאתה מוגדר כמבצע'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
                {campaignsPipeline.length}
              </span>
              <button
                type="button"
                onClick={() => navigate('/campaigns')}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              >
                כל הקמפיינים
              </button>
            </div>
          </div>
          <div className="min-h-[120px] flex-1 space-y-2">
            {campaignsLoading ? (
              <p className="text-sm text-slate-500">טוען קמפיינים…</p>
            ) : topCampaignsDashboard.length === 0 ? (
              <EmptyState
                title="אין קמפיינים להצגה"
                description={
                  privileged
                    ? 'קמפיינים שאינם «הושלם» יופיעו כאן לפי עדכניות.'
                    : 'כשתשויך אליך קמפיין כמבצע, הוא יופיע כאן.'
                }
              />
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto pe-1">
                {topCampaignsDashboard.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate('/campaigns')}
                      className="flex w-full flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-right transition hover:border-emerald-200 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{c.name}</p>
                          <p className="text-xs text-slate-500">
                            {PLATFORM_LABELS[c.platform]} · {CAMPAIGN_KIND_LABELS[c.kind]}
                          </p>
                        </div>
                        <Badge
                          label={CAMPAIGN_STATUS_LABELS[c.status]}
                          color={CAMPAIGN_STATUS_COLORS[c.status]}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                        {c.clientId ? (
                          <span className="truncate">
                            לקוח: {clientById.get(c.clientId) ?? c.clientId}
                          </span>
                        ) : (
                          <span className="text-slate-400">ללא לקוח משויך</span>
                        )}
                        {c.startDate?.trim() ? (
                          <span>התחלה: {formatDateIL(c.startDate)}</span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-slate-900">גבייה באיחור</h2>
            <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">
              {collectionOverdueList.length}
            </span>
          </div>
          {collectionOverdueList.length === 0 ? (
            <p className="text-sm text-slate-500">אין לקוחות באיחור כרגע.</p>
          ) : (
            <ul className="max-h-[220px] space-y-2 overflow-y-auto pe-1">
              {collectionOverdueList.map((row) => {
                const due = ymdPart(row.dueDate)
                const late = daysLate(due, todayForCollection)
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {clientById.get(row.clientId) ?? 'לקוח'}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-rose-700">
                      {late} ימים
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-slate-900">
              יעד תשלום קרוב (10 ימים)
            </h2>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
              {collectionDueWithin10Days.length}
            </span>
          </div>
          {collectionDueWithin10Days.length === 0 ? (
            <p className="text-sm text-slate-500">אין יעדי גבייה קרובים כרגע.</p>
          ) : (
            <ul className="max-h-[220px] space-y-2 overflow-y-auto pe-1">
              {collectionDueWithin10Days.map((row) => {
                const due = ymdPart(row.dueDate)
                const left = daysUntilDue(due, todayForCollection)
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {clientById.get(row.clientId) ?? 'לקוח'}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-600">
                      {left === 0 ? 'היום' : `עוד ${left}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-slate-900">פרויקטים חד-פעמיים</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
              {openOneTimeList.length}
            </span>
          </div>
          <div className="max-h-[700px] space-y-3 overflow-y-auto pe-1">
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
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-right transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                  {p.description?.trim() ? (
                    <p className="line-clamp-2 text-xs text-slate-500">
                      {p.description.trim()}
                    </p>
                  ) : null}
                  <div className="my-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">{clientName}</p>
                    <p>יעד: {formatDateIL(p.dueDate)}</p>
                    <p>{openLabel}</p>
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
              <EmptyState
                title="אין פרויקטים חד-פעמיים פעילים כרגע"
                description="רק פרויקטים במצב «פעיל» מוצגים כאן."
              />
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-slate-900">פרויקטים שוטפים</h2>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">
              {openRetainerList.length}
            </span>
          </div>
          <div className="max-h-[700px] space-y-3 overflow-y-auto pe-1">
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
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-right transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                  {p.description?.trim() ? (
                    <p className="line-clamp-2 text-xs text-slate-500">
                      {p.description.trim()}
                    </p>
                  ) : null}
                  <div className="my-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">{clientName}</p>
                    <p>
                      פעיל מאז{' '}
                      {p.startDate ? formatDateIL(p.startDate) : formatDateIL(p.dueDate)}
                    </p>
                    {p.supplierId?.trim() ? (
                      <p>
                        ספק:{' '}
                        {supplierDisplayName(p.supplierId, supplierById)}
                      </p>
                    ) : null}
                    <p>{openLabel}</p>
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
              <EmptyState
                title="אין פרויקטים שוטפים פעילים כרגע"
                description="רק פרויקטים שוטפים במצב «פעיל» מוצגים כאן."
              />
            ) : null}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900">המשימות שלי באיחור</h2>
        <p className="mt-1 text-xs text-slate-500">פוקוס רק על מה שדורש טיפול מיידי</p>
        {myOverdueTasks.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="אין משימות באיחור"
              description="הכול בשליטה. אין כרגע משימות חורגות מתאריך יעד."
            />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {myOverdueTasks.map((t) => {
              const proj = t.projectId ? projectById.get(t.projectId) : undefined
              const pc = priorityColor(t.priority)
              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                  style={{ boxShadow: `inset 3px 0 0 0 ${pc}` }}
                >
                  <div className="font-semibold text-slate-900">{t.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{proj?.name ?? 'פרויקט'}</div>
                  {proj?.description?.trim() ? (
                    <p
                      className="mt-1 line-clamp-2 text-[11px] text-slate-400"
                      title={proj.description.trim()}
                    >
                      {proj.description.trim()}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    <Badge label={priorityLabel(t.priority)} color={pc} />
                    <span className="text-xs text-slate-500">
                      יעד: {formatDateIL(t.dueDate)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
