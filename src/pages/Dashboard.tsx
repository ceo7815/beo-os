import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { addDaysYmd, formatDateIL, formatTaskDueDisplay, todayYmd } from '../lib/dates'
import { leadScheduleUrgency, leadScheduleYmd } from '../lib/leadSchedule'
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
import { LeadScheduleDateEditorModal } from '../components/leads/LeadScheduleDateEditorModal'
import { EmptyState } from '../components/shared/EmptyState'
import { ProgressBar } from '../components/shared/ProgressBar'
import { hubSectionClass, hubSectionElevatedClass } from '../lib/hubSectionBorder'

function KpiCard(props: {
  value: number
  label: string
  hint: string
  /** נתיב לניווט בלחיצה על הכרטיס */
  navigateTo?: string
  /** תיאור לקורא מסך (כשהכרטיס הוא כפתור) */
  navLabel?: string
  tone?: 'default' | 'danger' | 'brand' | 'warn'
  /** שני מספרים בכרטיס — למשל משימות עליך לעומת משימות שיצרת לאחרים */
  split?: {
    secondaryValue: number
    primaryCaption: string
    secondaryCaption: string
  }
}) {
  const navigate = useNavigate()
  const clickable = Boolean(props.navigateTo)
  const toneClass =
    props.tone === 'danger'
      ? 'beo-kpi--danger'
      : props.tone === 'brand'
        ? 'beo-kpi--brand'
        : props.tone === 'warn'
          ? 'beo-kpi--warn'
          : ''
  const valueColor =
    props.tone === 'danger'
      ? 'text-[var(--danger)]'
      : props.tone === 'brand'
        ? 'text-[var(--brand)]'
        : props.tone === 'warn'
          ? 'text-[var(--warning)]'
          : 'text-[var(--text-dark)]'
  const surfaceClass = `min-w-0 w-full text-right ${hubSectionClass()} ${toneClass} rounded-xl p-3 transition sm:p-5 ${
    clickable
      ? 'cursor-pointer hover:border-[var(--border-dark)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-mid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-main)]'
      : 'hover:border-[var(--border-dark)] hover:shadow-md'
  }`

  const body = (
    <>
      {props.split ? (
        <div className="grid grid-cols-2 gap-2 gap-y-2">
          <div className="min-w-0">
            <div className="text-[22px] font-bold tabular-nums leading-none text-[var(--text-dark)] sm:text-[26px] md:text-[28px]">
              {props.value}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-[var(--text-mid)] sm:text-[11px]">
              {props.split.primaryCaption}
            </div>
          </div>
          <div className="min-w-0 border-s border-[var(--border)] ps-2 sm:ps-4">
            <div className="text-[22px] font-bold tabular-nums leading-none text-[var(--text-dark)] sm:text-[26px] md:text-[28px]">
              {props.split.secondaryValue}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold leading-snug text-[var(--text-mid)] sm:text-[11px]">
              {props.split.secondaryCaption}
            </div>
          </div>
        </div>
      ) : (
        <div className={`text-[22px] font-bold tabular-nums sm:text-[26px] md:text-[28px] ${valueColor}`}>
          {props.value}
        </div>
      )}
      <div className="mt-2 text-[12px] font-semibold leading-snug text-[var(--text-mid)] sm:text-[13px]">
        {props.label}
      </div>
      <div className="mt-1 break-words text-[10px] leading-relaxed text-[var(--text-light)] sm:text-[11px]">
        {props.hint}
      </div>
    </>
  )

  if (clickable && props.navigateTo) {
    return (
      <button
        type="button"
        className={surfaceClass}
        aria-label={props.navLabel ?? `${props.label}: ${props.hint}`}
        onClick={() => navigate(props.navigateTo!)}
      >
        {body}
      </button>
    )
  }

  return <div className={surfaceClass}>{body}</div>
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
  no_answer: 'אין מענה',
  not_relevant: 'לא רלוונטי',
  closed: 'נסגר',
}

const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#5828A0',
  specification: '#7C3AED',
  quote_sent: '#D97706',
  follow_up: '#F59E0B',
  no_answer: '#64748B',
  not_relevant: '#DC2626',
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
    if (l.status === 'not_relevant') return 88
    const sched = leadScheduleYmd(l) ?? ''
    if (sched && /^\d{4}-\d{2}-\d{2}$/.test(sched)) {
      if (sched < today) return 0
      if (sched === today) return 1
    }
    const warm: LeadStatus[] = [
      'follow_up',
      'new',
      'quote_sent',
      'specification',
      'no_answer',
    ]
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
  const [scheduleLeadEditId, setScheduleLeadEditId] = useState<string | null>(null)

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
    const overdue = myUid
      ? taskScope.filter(
          (t) =>
            t.assigneeId === myUid &&
            t.status !== 'done' &&
            t.dueDate.slice(0, 10) < todayDash,
        ).length
      : 0
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
    const open = leads.filter(
      (l) => l.status !== 'closed' && l.status !== 'not_relevant',
    )
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
    const open = leads.filter(
      (l) => l.status !== 'closed' && l.status !== 'not_relevant',
    )
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
      const ymd = leadScheduleYmd(l) ?? ''
      return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && ymd <= todayDash
    }).length
  }, [openLeadsPool, todayDash])

  const topLeadsDashboard = useMemo(() => {
    return [...dashboardLeadsSource]
      .sort((a, b) => leadPipelineSort(a, b, todayDash))
      .slice(0, 6)
  }, [dashboardLeadsSource, todayDash])

  const scheduleLeadEdit = useMemo(
    () =>
      scheduleLeadEditId ? (leads.find((l) => l.id === scheduleLeadEditId) ?? null) : null,
    [leads, scheduleLeadEditId],
  )

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
    if (!myUid) return []
    return tasks.filter((t) => {
      if (!taskVisibleToUser(t, myUid, myRole)) return false
      if (t.assigneeId !== myUid) return false
      if (t.status === 'done') return false
      const d = t.dueDate.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
      return d < todayY
    })
  }, [tasks, myUid, myRole, todayY])

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
    <div className="beo-page space-y-5">
      {(topOverdueTask || leadsDueUrgent > 0) ? (
        <section className="space-y-2">
          {topOverdueTask ? (
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="hub-alert hub-alert--danger"
            >
              <div>
                <p className="text-xs font-bold text-rose-700">דורש טיפול מיידי</p>
                <p className="text-sm font-semibold text-[var(--text-dark)]">
                  {topOverdueTask.title}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-rose-700">
                יעד: {formatTaskDueDisplay(topOverdueTask.dueDate, topOverdueTask.dueTime)}
              </span>
            </button>
          ) : null}
          {leadsDueUrgent > 0 ? (
            <button
              type="button"
              onClick={() => navigate('/leads')}
              className="hub-alert hub-alert--warning"
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
        </section>
      ) : null}

      <header className={`${hubSectionElevatedClass()} rounded-2xl p-5 md:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--brand)]">
              {formatDateIL(todayDash)}
            </p>
            <h1 className="mt-1 text-[26px] font-extrabold tracking-tight text-[var(--text-dark)] md:text-[32px]">
              {myDisplayName ? `שלום, ${myDisplayName}` : 'דשבורד'}
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--text-mid)]">
              {privileged
                ? 'סיכום צוותי: משימות, פרויקטים, לידים, קמפיינים וגבייה — לפי סדר דחיפות.'
                : 'המיקוד שלך: משימות, לידים בטיפולך וקמפיינים שאתה מבצע.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            <button type="button" onClick={() => navigate('/tasks')} className="hub-chip-link">
              משימות
            </button>
            <button type="button" onClick={() => navigate('/projects')} className="hub-chip-link">
              פרויקטים
            </button>
            <button type="button" onClick={() => navigate('/leads')} className="hub-chip-link">
              לידים
            </button>
            <button type="button" onClick={() => navigate('/campaigns')} className="hub-chip-link">
              קמפיינים
            </button>
            <button
              type="button"
              onClick={() => navigate('/collections')}
              className="hub-chip-link hub-chip-link--accent"
            >
              גבייה
            </button>
          </div>
        </div>
      </header>

      <section className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <KpiCard
          value={kpis.overdue}
          label="משימות באיחור"
          hint="מוקצות אליך · עדיפות ראשונה"
          tone={kpis.overdue > 0 ? 'danger' : 'default'}
          navigateTo="/tasks?focus=overdue"
          navLabel="מעבר למשימות באיחור"
        />
        <KpiCard
          value={myUid ? kpis.openTasksMine : kpis.openTasksTotal}
          label="משימות פתוחות"
          hint={openTasksHintFull}
          navigateTo="/tasks"
          navLabel="מעבר ללוח המשימות"
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
          value={kpis.activeProjects}
          label="פרויקטים פעילים"
          hint="במצב «פעיל» בלבד"
          tone="brand"
          navigateTo="/projects?status=active"
          navLabel="מעבר לפרויקטים פעילים"
        />
        <KpiCard
          value={openLeadsPool.length}
          label={privileged ? 'לידים בצינור' : 'הלידים שלי'}
          hint="ללא סטטוס «נסגר»"
          tone="brand"
          navigateTo="/leads?filter=open"
          navLabel="מעבר ללידים בצינור"
        />
      </section>

      {employeeShowOrgWideLeadsCampaigns ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-center text-sm font-medium leading-relaxed text-[var(--text-mid)]">
          אין לידים או קמפיינים לטיפול שלך — להלן כל הלידים והקמפיינים הפתוחים בארגון
        </div>
      ) : null}

      <section className="grid min-w-0 grid-cols-2 gap-3 [&>*]:min-w-0">
        <article className={`flex min-h-0 min-w-0 flex-col rounded-xl p-3 sm:p-4 ${hubSectionClass()}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[var(--text-dark)]">לידים</h2>
              <p className="text-xs text-[var(--text-light)]">
                {privileged
                  ? 'הלידים הדחופים ביותר בצינור'
                  : employeeShowOrgWideLeadsCampaigns
                    ? 'כל הלידים הפתוחות בארגון'
                    : 'לידים ששויכו אליך — לפי פולואפ וסטטוס'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hub-count-badge bg-violet-100 text-violet-800">
                {dashboardLeadsSource.length}
              </span>
              <button
                type="button"
                onClick={() => navigate('/leads')}
                className="hub-card-action"
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
                    ? 'הוסיפו ליד ראשון — כאן יופיע מה שדורש מעקב.'
                    : employeeShowOrgWideLeadsCampaigns
                      ? 'אין כרגע לידים פתוחות במערכת.'
                      : 'כשיוקצו אליך לידים פתוחים, הם יופיעו כאן.'
                }
                action={
                  privileged
                    ? {
                        label: '+ ליד חדש',
                        onClick: () => navigate('/leads', { state: { openAdd: true } }),
                      }
                    : undefined
                }
              />
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto pe-1">
                {topLeadsDashboard.map((l) => {
                  const fuRaw = l.nextFollowUpDate?.slice(0, 10) ?? ''
                  const fuOk = /^\d{4}-\d{2}-\d{2}$/.test(fuRaw)
                  const sched = leadScheduleYmd(l)
                  const schedOk = Boolean(sched && /^\d{4}-\d{2}-\d{2}$/.test(sched))
                  const urgency = schedOk && sched ? leadScheduleUrgency(sched, todayDash) : null
                  const dateOverdue = schedOk && sched! <= todayDash
                  return (
                    <li key={l.id}>
                      <div className="hub-dash-row flex w-full flex-col gap-1 p-3 text-right">
                        <button
                          type="button"
                          className="w-full text-right"
                          onClick={() => navigate('/leads')}
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
                        </button>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-mid)]">
                          {!schedOk ? (
                            <button
                              type="button"
                              className="font-semibold text-[var(--orange)] underline"
                              onClick={() => setScheduleLeadEditId(l.id)}
                            >
                              אין תאריך פולואפ — קביעה
                            </button>
                          ) : (
                            <>
                              {urgency ? (
                                <Badge label={urgency.label} color={urgency.color} />
                              ) : null}
                              <button
                                type="button"
                                className={
                                  dateOverdue
                                    ? 'font-bold text-amber-700 hover:opacity-90'
                                    : 'hover:opacity-90'
                                }
                                onClick={() => setScheduleLeadEditId(l.id)}
                              >
                                {fuOk ? 'פולואפ' : 'תאריך חזרה ללקוח'}:{' '}
                                <span className="underline decoration-dotted underline-offset-2">
                                  {formatDateIL(sched!)}
                                </span>
                              </button>
                            </>
                          )}
                          {(privileged || employeeShowOrgWideLeadsCampaigns) &&
                          l.ownerId ? (
                            <span className="text-[var(--text-light)]">
                              אחראי:{' '}
                              {teamMembers.find((m) => m.id === l.ownerId)?.name ?? '—'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </article>

        <article className={`flex min-h-0 min-w-0 flex-col rounded-xl p-3 sm:p-4 ${hubSectionClass()}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[var(--text-dark)]">קמפיינים</h2>
              <p className="text-xs text-[var(--text-light)]">
                {privileged
                  ? 'קמפיינים בתכנון, פעילים או מושהים'
                  : employeeShowOrgWideLeadsCampaigns
                    ? 'כל הקמפיינים הפעילים בארגון'
                    : 'קמפיינים שאתה מוגדר כמבצע'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hub-count-badge bg-emerald-100 text-emerald-800">
                {dashboardCampaignsSource.length}
              </span>
              <button
                type="button"
                onClick={() => navigate('/campaigns')}
                className="hub-card-action"
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
                action={
                  privileged
                    ? {
                        label: '+ קמפיין חדש',
                        onClick: () => navigate('/campaigns', { state: { openAdd: true } }),
                      }
                    : undefined
                }
              />
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto pe-1">
                {topCampaignsDashboard.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate('/campaigns')}
                      className="hub-dash-row flex w-full flex-col gap-1 p-3 text-right"
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
        <article className={`min-w-0 rounded-xl p-3 sm:p-4 ${hubSectionClass()}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--text-dark)]">גבייה באיחור</h2>
            <span className="hub-count-badge bg-rose-100 text-rose-700">
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
                    className="hub-dash-row flex items-center justify-between gap-2 px-3 py-2"
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

        <article className={`min-w-0 rounded-xl p-3 sm:p-4 ${hubSectionClass()}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--text-dark)]">
              יעד תשלום קרוב (10 ימים)
            </h2>
            <span className="hub-count-badge bg-amber-100 text-amber-700">
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
                    className="hub-dash-row flex items-center justify-between gap-2 px-3 py-2"
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
        <article className={`min-w-0 rounded-xl p-3 sm:p-4 ${hubSectionClass()}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--text-dark)]">פרויקטים חד-פעמיים</h2>
            <span className="hub-count-badge">
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
                  className="hub-dash-row w-full p-3 text-right transition hover:border-[var(--border)]"
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
                description="פתחו פרויקט חדש — רק פרויקטים במצב «פעיל» מוצגים כאן."
                action={{
                  label: '+ פרויקט חדש',
                  onClick: () => navigate('/projects', { state: { openAdd: true } }),
                }}
              />
            ) : null}
          </div>
        </article>

        <article className={`min-w-0 rounded-xl p-3 sm:p-4 ${hubSectionClass()}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[var(--text-dark)]">פרויקטים שוטפים</h2>
            <span className="hub-count-badge bg-violet-100 text-violet-700">
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
                  className="hub-dash-row w-full p-3 text-right transition hover:border-[var(--border)]"
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
                      יעד: {formatTaskDueDisplay(t.dueDate, t.dueTime)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <LeadScheduleDateEditorModal
        lead={scheduleLeadEdit}
        isOpen={Boolean(scheduleLeadEditId)}
        onClose={() => setScheduleLeadEditId(null)}
      />
    </div>
  )
}
