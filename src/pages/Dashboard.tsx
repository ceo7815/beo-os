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
import { hubSectionClass } from '../lib/hubSectionBorder'

function KpiCard(props: {
  seq: number
  value: number
  label: string
  hint: string
  /** שני מספרים בכרטיס — למשל משימות עליך לעומת משימות שיצרת לאחרים */
  split?: {
    secondaryValue: number
    primaryCaption: string
    secondaryCaption: string
  }
}) {
  return (
    <div
      className={`min-w-0 ${hubSectionClass(props.seq)} rounded-2xl p-3 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5`}
    >
      {props.split ? (
        <div className="grid grid-cols-2 gap-2 gap-y-2">
          <div className="min-w-0">
            <div className="text-[22px] font-black tabular-nums leading-none text-[var(--text-dark)] sm:text-[28px] md:text-[30px]">
              {props.value}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-[var(--text-mid)] sm:text-[11px]">
              {props.split.primaryCaption}
            </div>
          </div>
          <div className="min-w-0 border-s border-[var(--border)] ps-2 sm:ps-4">
            <div className="text-[22px] font-black tabular-nums leading-none text-[var(--text-dark)] sm:text-[28px] md:text-[30px]">
              {props.split.secondaryValue}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-[var(--text-mid)] sm:text-[11px]">
              {props.split.secondaryCaption}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[22px] font-black tabular-nums text-[var(--text-dark)] sm:text-[28px] md:text-[30px]">
          {props.value}
        </div>
      )}
      <div className="mt-2 text-[12px] font-semibold leading-snug text-[var(--text-mid)] sm:text-[13px]">
        {props.label}
      </div>
      <div className="mt-1 break-words text-[10px] leading-relaxed text-[var(--text-light)] sm:text-[11px]">
        {props.hint}
      </div>
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
    const openNotDone = taskScope.filter((t) => t.status !== 'done')
    let openTasksMine = 0
    let openTasksDelegated = 0
    if (myUid) {
      for (const t of openNotDone) {
        if (t.assigneeId === myUid) openTasksMine++
        else if (t.createdBy === myUid && t.assigneeId !== myUid) openTasksDelegated++
      }
    }
    const openTasksOther = myUid
      ? Math.max(0, openNotDone.length - openTasksMine - openTasksDelegated)
      : 0
    const overdue = taskScope.filter(
      (t) => t.status !== 'done' && t.dueDate.slice(0, 10) < todayDash,
    ).length
    return {
      activeProjects,
      openTasksTotal: openNotDone.length,
      openTasksMine,
      openTasksDelegated,
      openTasksOther,
      overdue,
    }
  }, [projects, taskScope, todayDash, myUid])

  const openLeadsPool = useMemo(() => {
    const open = leads.filter((l) => l.status !== 'closed')
    if (privileged) return open
    return open.filter((l) => l.ownerId === myUid)
  }, [leads, privileged, myUid])

  const campaignsPipeline = useMemo(() => {
    const running = campaigns.filter((c) => c.status !== 'completed')
    if (privileged) return running
    return running.filter((c) => c.performerUserId === myUid)
  }, [campaigns, privileged, myUid])

  /** עובד ללא לידים משויכים וללא קמפיינים כמבצע — מציגים ברשימות את כל הארגון */
  const employeeShowOrgWideLeadsCampaigns =
    !privileged &&
    openLeadsPool.length === 0 &&
    campaignsPipeline.length === 0

  const dashboardLeadsSource = useMemo(() => {
    const open = leads.filter((l) => l.status !== 'closed')
    if (privileged) return open
    if (employeeShowOrgWideLeadsCampaigns) return open
    return open.filter((l) => l.ownerId === myUid)
  }, [leads, privileged, myUid, employeeShowOrgWideLeadsCampaigns])

  const dashboardCampaignsSource = useMemo(() => {
    const running = campaigns.filter((c) => c.status !== 'completed')
    if (privileged) return running
    if (employeeShowOrgWideLeadsCampaigns) return running
    return running.filter((c) => c.performerUserId === myUid)
  }, [campaigns, privileged, myUid, employeeShowOrgWideLeadsCampaigns])

  const leadsDueUrgent = useMemo(() => {
    return openLeadsPool.filter((l) => {
      const fu = l.nextFollowUpDate?.slice(0, 10) ?? ''
      return /^\d{4}-\d{2}-\d{2}$/.test(fu) && fu <= todayDash
    }).length
  }, [openLeadsPool, todayDash])

  const topLeadsDashboard = useMemo(() => {
    return [...dashboardLeadsSource]
      .sort((a, b) => leadPipelineSort(a, b, todayDash))
      .slice(0, 6)
  }, [dashboardLeadsSource, todayDash])

  const topCampaignsDashboard = useMemo(() => {
    return [...dashboardCampaignsSource].sort(campaignPipelineSort).slice(0, 5)
  }, [dashboardCampaignsSource])

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
    ? 'משימות פתוחות גלויות לך — פירוט לפי אחריות'
    : 'משימות עליך לעומת משימות שיצרת לאחרים'

  const openTasksHintFull =
    openTasksHint +
    (myUid && kpis.openTasksOther > 0
      ? ` · עוד ${kpis.openTasksOther} משימות גלויות מהצוות`
      : '')

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-5 md:px-8 md:py-7">
      <header className="hub-dash-card hub-dash-card--hero rounded-2xl p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-light)]">
              {formatDateIL(todayDash)}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text-dark)]">
              {myDisplayName ? `שלום, ${myDisplayName}` : 'דשבורד'}
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--text-mid)]">
              {privileged
                ? 'סיכום צוותי: משימות, פרויקטים פעילים, לידים, קמפיינים וגבייה — לפי סדר דחיפות.'
                : 'המיקוד שלך: משימות, לידים בטיפולך וקמפיינים שאתה מבצע.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-mid)] shadow-sm transition hover:bg-[var(--surface-muted)]"
            >
              משימות
            </button>
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-mid)] shadow-sm transition hover:bg-[var(--surface-muted)]"
            >
              פרויקטים
            </button>
            <button
              type="button"
              onClick={() => navigate('/leads')}
              className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-mid)] shadow-sm transition hover:bg-[var(--surface-muted)]"
            >
              לידים
            </button>
            <button
              type="button"
              onClick={() => navigate('/campaigns')}
              className="rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-mid)] shadow-sm transition hover:bg-[var(--surface-muted)]"
            >
              קמפיינים
            </button>
            <button
              type="button"
              onClick={() => navigate('/collections')}
              className="rounded-xl border border-[var(--orange)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--orange)] shadow-sm transition hover:bg-[var(--orange-light)]"
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
              <p className="text-sm font-semibold text-[var(--text-dark)]">
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
              <p className="text-sm font-semibold text-[var(--text-dark)]">
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

      <section className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <KpiCard
          seq={0}
          value={kpis.overdue}
          label="משימות באיחור"
          hint="עדיפות ראשונה"
        />
        <KpiCard
          seq={1}
          value={myUid ? kpis.openTasksMine : kpis.openTasksTotal}
          label="משימות פתוחות"
          hint={openTasksHintFull}
          split={
            myUid
              ? {
                  secondaryValue: kpis.openTasksDelegated,
                  primaryCaption: 'מוקצות אליך',
                  secondaryCaption: 'פתחת לעובדים אחרים',
                }
              : undefined
          }
        />
        <KpiCard
          seq={2}
          value={kpis.activeProjects}
          label="פרויקטים פעילים"
          hint="במצב «פעיל» בלבד"
        />
        <KpiCard
          seq={3}
          value={openLeadsPool.length}
          label={privileged ? 'לידים בצינור' : 'הלידים שלי'}
          hint="ללא סטטוס «נסגר»"
        />
      </section>

      {employeeShowOrgWideLeadsCampaigns ? (
        <div className="rounded-2xl border border-[var(--border-orange-soft)] bg-[var(--surface-muted)] px-4 py-3 text-center text-sm font-semibold leading-relaxed text-[var(--text-dark)]">
          אין לידים או קמפיינים לטיפול שלך — להלן כל הלידים והקמפיינים הפתוחים בארגון
        </div>
      ) : null}

      <section className="grid min-w-0 grid-cols-2 gap-3 [&>*]:min-w-0">
        <article className={`flex min-h-0 min-w-0 flex-col rounded-2xl p-3 sm:p-4 ${hubSectionClass(4)}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[var(--text-dark)]">לידים</h2>
              <p className="text-xs text-[var(--text-light)]">
                {privileged
                  ? 'הלידים הדחופים ביותר בצינור'
                  : employeeShowOrgWideLeadsCampaigns
                    ? 'כל הלידים הפתוחות בארגון'
                    : 'לידים ששויכו אליך — לפי פולואפ וסטטוס'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-800">
                {dashboardLeadsSource.length}
              </span>
              <button
                type="button"
                onClick={() => navigate('/leads')}
                className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[#dfe6f5]"
              >
                כל הלידים
              </button>
            </div>
          </div>
          <div className="min-h-[120px] flex-1 space-y-2">
            {leadsLoading ? (
              <p className="text-sm text-[var(--text-light)]">טוען לידים…</p>
            ) : topLeadsDashboard.length === 0 ? (
              <EmptyState
                title="אין לידים פתוחים להצגה"
                description={
                  privileged
                    ? 'הוסיפו לידים או עדכנו סטטוס — כאן יופיע מה שדורש מעקב.'
                    : employeeShowOrgWideLeadsCampaigns
                      ? 'אין כרגע לידים פתוחות במערכת.'
                      : 'כשיוקצו אליך לידים פתוחים, הם יופיעו כאן.'
                }
              />
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto pe-1">
                {topLeadsDashboard.map((l) => {
                  const fuRaw = l.nextFollowUpDate?.slice(0, 10) ?? ''
                  const qrRaw = l.quoteReturnByDate?.slice(0, 10) ?? ''
                  const fuOk = /^\d{4}-\d{2}-\d{2}$/.test(fuRaw)
                  const qrOk = /^\d{4}-\d{2}-\d{2}$/.test(qrRaw)
                  const fuBad = fuOk && fuRaw <= todayDash
                  const qrBad = !fuOk && qrOk && qrRaw <= todayDash
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => navigate('/leads')}
                        className="flex w-full flex-col gap-1 rounded-xl hub-dash-inset p-3 text-right transition hover:border-orange-200/45 hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-[var(--text-dark)]">{l.name}</p>
                            {l.company?.trim() ? (
                              <p className="truncate text-xs text-[var(--text-light)]">{l.company}</p>
                            ) : null}
                          </div>
                          <Badge
                            label={LEAD_STATUS_LABELS[l.status]}
                            color={LEAD_STATUS_COLORS[l.status]}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-mid)]">
                          {fuOk ? (
                            <span className={fuBad ? 'font-bold text-amber-700' : ''}>
                              פולואפ: {formatDateIL(fuRaw)}
                            </span>
                          ) : qrOk ? (
                            <span className={qrBad ? 'font-bold text-amber-700' : ''}>
                              תאריך חזרה ללקוח: {formatDateIL(qrRaw)}
                            </span>
                          ) : (
                            <span className="text-[var(--text-light)]">אין תאריך פולואפ</span>
                          )}
                          {(privileged || employeeShowOrgWideLeadsCampaigns) &&
                          l.ownerId ? (
                            <span className="text-[var(--text-light)]">
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

        <article className={`flex min-h-0 min-w-0 flex-col rounded-2xl p-3 sm:p-4 ${hubSectionClass(5)}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[var(--text-dark)]">קמפיינים</h2>
              <p className="text-xs text-[var(--text-light)]">
                {privileged
                  ? 'קמפיינים בתכנון, פעילים או מושהים'
                  : employeeShowOrgWideLeadsCampaigns
                    ? 'כל הקמפיינים הפעילים בארגון'
                    : 'קמפיינים שאתה מוגדר כמבצע'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
                {dashboardCampaignsSource.length}
              </span>
              <button
                type="button"
                onClick={() => navigate('/campaigns')}
                className="rounded-lg border border-[var(--border-orange-soft)] bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--text-mid)] hover:bg-[#dfe6f5]"
              >
                כל הקמפיינים
              </button>
            </div>
          </div>
          <div className="min-h-[120px] flex-1 space-y-2">
            {campaignsLoading ? (
              <p className="text-sm text-[var(--text-light)]">טוען קמפיינים…</p>
            ) : topCampaignsDashboard.length === 0 ? (
              <EmptyState
                title="אין קמפיינים להצגה"
                description={
                  privileged
                    ? 'קמפיינים שאינם «הושלם» יופיעו כאן לפי עדכניות.'
                    : employeeShowOrgWideLeadsCampaigns
                      ? 'אין כרגע קמפיינים פעילים במערכת.'
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
                      className="flex w-full flex-col gap-1 rounded-xl hub-dash-inset p-3 text-right transition hover:border-emerald-200/50 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[var(--text-dark)]">{c.name}</p>
                          <p className="text-xs text-[var(--text-light)]">
                            {PLATFORM_LABELS[c.platform]} · {CAMPAIGN_KIND_LABELS[c.kind]}
                          </p>
                        </div>
                        <Badge
                          label={CAMPAIGN_STATUS_LABELS[c.status]}
                          color={CAMPAIGN_STATUS_COLORS[c.status]}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-mid)]">
                        {c.clientId ? (
                          <span className="truncate">
                            לקוח: {clientById.get(c.clientId) ?? c.clientId}
                          </span>
                        ) : (
                          <span className="text-[var(--text-light)]">ללא לקוח משויך</span>
                        )}
                        {c.startDate?.trim() ? (
                          <span>התחלה: {formatDateIL(c.startDate)}</span>
                        ) : null}
                        {employeeShowOrgWideLeadsCampaigns &&
                        c.performerUserId?.trim() ? (
                          <span className="text-[var(--text-light)]">
                            מבצע:{' '}
                            {teamMembers.find((m) => m.id === c.performerUserId)
                              ?.name ?? c.performerUserId}
                          </span>
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

      <section className="grid min-w-0 grid-cols-2 gap-3 [&>*]:min-w-0">
        <article className={`min-w-0 rounded-2xl p-3 sm:p-4 ${hubSectionClass(6)}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">גבייה באיחור</h2>
            <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-bold text-rose-700">
              {collectionOverdueList.length}
            </span>
          </div>
          {collectionOverdueList.length === 0 ? (
            <p className="text-sm text-[var(--text-light)]">אין לקוחות באיחור כרגע.</p>
          ) : (
            <ul className="max-h-[220px] space-y-2 overflow-y-auto pe-1">
              {collectionOverdueList.map((row) => {
                const due = ymdPart(row.dueDate)
                const late = daysLate(due, todayForCollection)
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-xl hub-dash-inset px-3 py-2"
                  >
                    <span className="truncate text-sm font-semibold text-[var(--text-dark)]">
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

        <article className={`min-w-0 rounded-2xl p-3 sm:p-4 ${hubSectionClass(7)}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">
              יעד תשלום קרוב (10 ימים)
            </h2>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
              {collectionDueWithin10Days.length}
            </span>
          </div>
          {collectionDueWithin10Days.length === 0 ? (
            <p className="text-sm text-[var(--text-light)]">אין יעדי גבייה קרובים כרגע.</p>
          ) : (
            <ul className="max-h-[220px] space-y-2 overflow-y-auto pe-1">
              {collectionDueWithin10Days.map((row) => {
                const due = ymdPart(row.dueDate)
                const left = daysUntilDue(due, todayForCollection)
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-xl hub-dash-inset px-3 py-2"
                  >
                    <span className="truncate text-sm font-semibold text-[var(--text-dark)]">
                      {clientById.get(row.clientId) ?? 'לקוח'}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-[var(--text-mid)]">
                      {left === 0 ? 'היום' : `עוד ${left}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="grid min-w-0 grid-cols-2 gap-3 [&>*]:min-w-0">
        <article className={`min-w-0 rounded-2xl p-3 sm:p-4 ${hubSectionClass(8)}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">פרויקטים חד-פעמיים</h2>
            <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs font-bold text-[var(--text-mid)]">
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
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] p-3 text-right transition hover:border-orange-300/45 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--text-dark)]">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                  {p.description?.trim() ? (
                    <p className="line-clamp-2 text-xs text-[var(--text-light)]">
                      {p.description.trim()}
                    </p>
                  ) : null}
                  <div className="my-2 text-xs text-[var(--text-mid)]">
                    <p className="font-semibold text-[var(--text-mid)]">{clientName}</p>
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

        <article className={`min-w-0 rounded-2xl p-3 sm:p-4 ${hubSectionClass(9)}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[var(--text-dark)]">פרויקטים שוטפים</h2>
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
                  className="w-full rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] p-3 text-right transition hover:border-orange-300/45 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--text-dark)]">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                  {p.description?.trim() ? (
                    <p className="line-clamp-2 text-xs text-[var(--text-light)]">
                      {p.description.trim()}
                    </p>
                  ) : null}
                  <div className="my-2 text-xs text-[var(--text-mid)]">
                    <p className="font-semibold text-[var(--text-mid)]">{clientName}</p>
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

      <section className={`rounded-2xl p-4 ${hubSectionClass(10)}`}>
        <h2 className="text-base font-extrabold text-[var(--text-dark)]">המשימות שלי באיחור</h2>
        <p className="mt-1 text-xs text-[var(--text-light)]">פוקוס רק על מה שדורש טיפול מיידי</p>
        {myOverdueTasks.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="אין משימות באיחור"
              description="הכול בשליטה. אין כרגע משימות חורגות מתאריך יעד."
            />
          </div>
        ) : (
          <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3 [&>*]:min-w-0">
            {myOverdueTasks.map((t) => {
              const proj = t.projectId ? projectById.get(t.projectId) : undefined
              const pc = priorityColor(t.priority)
              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-3"
                >
                  <div className="font-semibold text-[var(--text-dark)]">{t.title}</div>
                  <div className="mt-1 text-xs text-[var(--text-light)]">{proj?.name ?? 'פרויקט'}</div>
                  {proj?.description?.trim() ? (
                    <p
                      className="mt-1 line-clamp-2 text-[11px] text-[var(--text-light)]"
                      title={proj.description.trim()}
                    >
                      {proj.description.trim()}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between">
                    <Badge label={priorityLabel(t.priority)} color={pc} />
                    <span className="text-xs text-[var(--text-light)]">
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
