import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatDateIL, formatDateTimeIL, todayYmd } from '../lib/dates'
import { getCollectionTrackingStatus } from '../lib/collectionTrackingStatus'
import { boardStatusHe, priorityHe } from '../lib/boardTaskLabels'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { isAdminRole } from './RequireAdmin'
import { useCampaigns } from '../hooks/useCampaigns'
import { useCollectionTracking } from '../hooks/useCollectionTracking'
import { useHosting } from '../hooks/useHosting'
import { useInvoices } from '../hooks/useInvoices'
import { useLeads } from '../hooks/useLeads'
import { usePasswordVault } from '../hooks/usePasswordVault'
import { useProjects } from '../hooks/useProjects'
import { useTasks } from '../hooks/useTasks'
import { useUsers } from '../hooks/useUsers'
import { Modal } from './shared/Modal'
import type {
  CampaignStatus,
  Client,
  InvoiceStatus,
  LeadStatus,
  ProjectStatus,
} from '../types'

const LEAD_STATUS_HE: Record<LeadStatus, string> = {
  new: 'חדש',
  specification: 'בתהליך אפיון',
  quote_sent: 'נשלחה הצעת מחיר',
  follow_up: 'יש לבצע פולואפ',
  closed: 'נסגרה',
}

const CAMPAIGN_STATUS_HE: Record<CampaignStatus, string> = {
  planning: 'בתכנון',
  active: 'פעיל',
  paused: 'מושהה',
  completed: 'הושלם',
}

const PROJECT_STATUS_HE: Record<ProjectStatus, string> = {
  active: 'פעיל',
  paused: 'מושהה',
  done: 'הושלם',
}

const INVOICE_STATUS_HE: Record<InvoiceStatus, string> = {
  pending: 'ממתין לתשלום',
  paid: 'שולם',
  overdue: 'באיחור',
}

function collectionStatusHe(
  row: Parameters<typeof getCollectionTrackingStatus>[0],
  today: string,
): string {
  const s = getCollectionTrackingStatus(row, today)
  if (s === 'paid') return 'שולם'
  if (s === 'overdue') return 'באיחור'
  return 'במעקב'
}

type Props = {
  client: Client | null
  open: boolean
  onClose: () => void
}

export function ClientActivityModal(props: Props) {
  const { client, open, onClose } = props
  const navigate = useNavigate()
  const { user } = useAuth()
  const { users, loading: usersLoading } = useUsers()
  const { projects } = useProjects()
  const { tasks } = useTasks()
  const { leads } = useLeads()
  const { campaigns } = useCampaigns()
  const { entries: collectionEntries } = useCollectionTracking()
  const { invoices } = useInvoices()
  const { records: hostingRecords } = useHosting()

  const vaultRole = users.find((m) => m.id === user?.uid)?.role ?? ''
  const vaultAdmin = isAdminRole(vaultRole)
  const { entries: vaultEntries, loading: vaultLoading } = usePasswordVault({
    uid: user?.uid,
    usersReady: !usersLoading,
    isVaultAdmin: vaultAdmin,
  })

  const memberName = useMemo(() => {
    const m = new Map<string, string>()
    users.forEach((u) => m.set(u.id, u.name))
    return m
  }, [users])

  const aggregated = useMemo(() => {
    if (!client) {
      return {
        projects: [] as typeof projects,
        tasks: [] as typeof tasks,
        leads: [] as typeof leads,
        campaigns: [] as typeof campaigns,
        collections: [] as typeof collectionEntries,
        invoices: [] as typeof invoices,
        hosting: [] as typeof hostingRecords,
        vault: [] as typeof vaultEntries,
      }
    }
    const cid = client.id
    const clientProjects = projects.filter((p) => p.clientId === cid)
    const projectIds = new Set(clientProjects.map((p) => p.id))

    const clientTasks = tasks.filter(
      (t) =>
        (t.clientId && t.clientId === cid) ||
        (t.projectId && projectIds.has(t.projectId)),
    )

    const sortedProjects = [...clientProjects].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    const sortedTasks = [...clientTasks].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    const sortedLeads = leads
      .filter((l) => l.clientId === cid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const sortedCampaigns = campaigns
      .filter((c) => c.clientId === cid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const sortedCollections = collectionEntries
      .filter((e) => e.clientId === cid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const sortedInvoices = invoices
      .filter((inv) => inv.clientId === cid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const sortedHosting = hostingRecords
      .filter((h) => h.clientId === cid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const sortedVault = vaultEntries
      .filter((v) => v.clientId === cid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    return {
      projects: sortedProjects,
      tasks: sortedTasks,
      leads: sortedLeads,
      campaigns: sortedCampaigns,
      collections: sortedCollections,
      invoices: sortedInvoices,
      hosting: sortedHosting,
      vault: sortedVault,
    }
  }, [
    client,
    projects,
    tasks,
    leads,
    campaigns,
    collectionEntries,
    invoices,
    hostingRecords,
    vaultEntries,
  ])

  const today = todayYmd()

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])

  if (!client) return null

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`פעילות ושיוכים · ${client.name}`}
      size="xl"
      bodyClassName="max-h-[min(85vh,880px)] overflow-y-auto overflow-x-hidden"
    >
      <p className="mb-4 text-[13px] leading-relaxed text-[var(--text-mid)]">
        סיכום כל הרשומות במערכת המקושרות ללקוח — פרויקטים, משימות, לידים, קמפיינים, גבייה, חשבוניות,
        אחסון ודומיינים, וכספת סיסמאות (ללא חשיפת סיסמאות). נתוני נוכחות ושעות מוצגים בעמוד הנוכחות (Clockify).
      </p>

      <div className="space-y-4">
        <section className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-none`}>
          <h3 className="mb-2 text-sm font-bold text-[var(--text-dark)]">פרטי לקוח</h3>
          <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-bold text-[var(--text-light)]">איש קשר</dt>
              <dd className="text-[var(--text-dark)]">{client.contact || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold text-[var(--text-light)]">מחלקה</dt>
              <dd className="text-[var(--text-dark)]">{client.department?.trim() || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold text-[var(--text-light)]">תאריך כניסה למערכת</dt>
              <dd className="text-[var(--text-dark)]">{formatDateIL(client.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold text-[var(--text-light)]">סטטוס</dt>
              <dd className="text-[var(--text-dark)]">
                {client.status === 'active' ? 'פעיל' : 'לא פעיל'}
              </dd>
            </div>
          </dl>
        </section>

        <section className={`rounded-2xl ${hubSectionClass(1)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">פרויקטים</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/projects')
              }}
            >
              לעמוד פרויקטים
            </button>
          </div>
          {aggregated.projects.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין פרויקטים משויכים ללקוח.</p>
          ) : (
            <ul className="space-y-2">
              {aggregated.projects.map((p) => (
                <li
                  key={p.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-right text-[13px] font-semibold text-[var(--orange)] hover:underline"
                      onClick={() => {
                        onClose()
                        navigate(`/projects/${p.id}`)
                      }}
                    >
                      {p.name}
                    </button>
                    <span className="text-[11px] text-[var(--text-mid)]">
                      {PROJECT_STATUS_HE[p.status]} · עדיפות {priorityHe(p.priority)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-light)]">
                    נוצר {formatDateIL(p.createdAt)} · יעד {formatDateIL(p.dueDate)}
                  </p>
                  {p.description?.trim() ? (
                    <p className="mt-1 line-clamp-2 text-[12px] text-[var(--text-mid)]">
                      {p.description.trim()}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`rounded-2xl ${hubSectionClass(2)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">משימות</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/tasks')
              }}
            >
              לעמוד משימות
            </button>
          </div>
          {aggregated.tasks.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין משימות משויכות ישירות או דרך פרויקט של הלקוח.</p>
          ) : (
            <ul className="space-y-2">
              {aggregated.tasks.map((t) => (
                <li
                  key={t.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
                >
                  <p className="text-[13px] font-semibold text-[var(--text-dark)]">{t.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    {boardStatusHe(t.status)} · {priorityHe(t.priority)} · יעד {formatDateIL(t.dueDate)}
                    {t.projectId ? (
                      <>
                        {' '}
                        · פרויקט: {projectNameById.get(t.projectId) ?? t.projectId}
                      </>
                    ) : null}
                    {t.clientId && !t.projectId ? ' · שיוך ישיר ללקוח' : null}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--text-light)]">
                    אחראי: {memberName.get(t.assigneeId) ?? '—'} · נוצרה{' '}
                    {formatDateTimeIL(t.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`rounded-2xl ${hubSectionClass(3)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">לידים</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/leads')
              }}
            >
              לעמוד לידים
            </button>
          </div>
          {aggregated.leads.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין לידים משויכים לכרטיס הלקוח.</p>
          ) : (
            <ul className="space-y-2">
              {aggregated.leads.map((l) => (
                <li
                  key={l.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
                >
                  <p className="text-[13px] font-semibold text-[var(--text-dark)]">{l.name}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    {LEAD_STATUS_HE[l.status]}
                    {l.company ? ` · ${l.company}` : ''}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--text-light)]">
                    נכנס {formatDateIL(l.createdAt)}
                    {l.lastActivityAt ? ` · עדכון אחרון ${formatDateTimeIL(l.lastActivityAt)}` : ''}
                  </p>
                  {l.clientNeeds?.trim() ? (
                    <p className="mt-1 line-clamp-3 text-[12px] text-[var(--text-mid)]">
                      צרכים: {l.clientNeeds.trim()}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">קמפיינים</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/campaigns')
              }}
            >
              לעמוד קמפיינים
            </button>
          </div>
          {aggregated.campaigns.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין קמפיינים משויכים ללקוח.</p>
          ) : (
            <ul className="space-y-2">
              {aggregated.campaigns.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2"
                >
                  <p className="text-[13px] font-semibold text-[var(--text-dark)]">{c.name}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    {CAMPAIGN_STATUS_HE[c.status]} · נוצר {formatDateIL(c.createdAt)}
                  </p>
                  {c.resultsUpdate?.trim() ? (
                    <p className="mt-1 line-clamp-2 text-[12px] text-[var(--text-mid)]">
                      תוצאות (טקסט): {c.resultsUpdate.trim()}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`rounded-2xl ${hubSectionClass(1)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">מעקב גבייה</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/collections')
              }}
            >
              לעמוד גבייה
            </button>
          </div>
          {aggregated.collections.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין רשומת מעקב גבייה ללקוח.</p>
          ) : (
            <ul className="space-y-2">
              {aggregated.collections.map((row) => (
                <li
                  key={row.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[12px]"
                >
                  <p className="font-semibold text-[var(--text-dark)]">
                    {collectionStatusHe(row, today)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    יעד תשלום {formatDateIL(row.dueDate)}
                    {row.lastRequestDate ? ` · דרישה אחרונה ${formatDateIL(row.lastRequestDate)}` : ''}
                  </p>
                  {row.note?.trim() ? (
                    <p className="mt-1 text-[11px] text-[var(--text-mid)]">{row.note.trim()}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-[var(--text-light)]">
                    עודכן {formatDateTimeIL(row.updatedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`rounded-2xl ${hubSectionClass(2)} p-4 shadow-none`}>
          <h3 className="mb-2 text-sm font-bold text-[var(--text-dark)]">חשבוניות</h3>
          {aggregated.invoices.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין חשבוניות רשומות ללקוח.</p>
          ) : (
            <ul className="space-y-2">
              {aggregated.invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[12px]"
                >
                  <span className="font-semibold text-[var(--text-dark)]">
                    #{inv.invoiceNumber}
                  </span>{' '}
                  · ₪{inv.amount.toLocaleString('he-IL')} · {INVOICE_STATUS_HE[inv.status]}
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    יעד {formatDateIL(inv.dueDate)}
                    {inv.paidDate ? ` · שולם ב־${formatDateIL(inv.paidDate)}` : ''}
                  </p>
                  {inv.note?.trim() ? (
                    <p className="mt-1 text-[11px] text-[var(--text-mid)]">{inv.note.trim()}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`rounded-2xl ${hubSectionClass(3)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">אחסון ודומיינים</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/hosting')
              }}
            >
              לעמוד אחסון
            </button>
          </div>
          {aggregated.hosting.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">אין רשומות אחסון ללקוח.</p>
          ) : (
            <ul className="space-y-2">
              {aggregated.hosting.map((h) => (
                <li
                  key={h.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[12px]"
                >
                  <p className="font-semibold text-[var(--text-dark)]" dir="ltr">
                    {h.domain}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    שרת {h.server} · פקיפ {h.controlPanel}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--text-light)]">
                    תוקף SSL {formatDateIL(h.sslExpiry)} · תוקף דומיין {formatDateIL(h.domainExpiry)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`rounded-2xl ${hubSectionClass(0)} p-4 shadow-none`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-dark)]">כספת סיסמאות</h3>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--orange)] hover:underline"
              onClick={() => {
                onClose()
                navigate('/vault')
              }}
            >
              לכספת
            </button>
          </div>
          {vaultLoading ? (
            <p className="text-sm text-[var(--text-mid)]">טוען נתוני כספת…</p>
          ) : aggregated.vault.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">
              אין פריטים משויכים ללקוח, או שאין לך הרשאת צפייה ברשומות הכספת.
            </p>
          ) : (
            <ul className="space-y-2">
              {aggregated.vault.map((e) => (
                <li
                  key={e.id}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[12px]"
                >
                  <p className="font-semibold text-[var(--text-dark)]">{e.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-mid)]">
                    {e.category} · {e.loginType === 'google' ? 'כניסה עם Google' : 'סיסמה שמורה'}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--text-light)]">
                    עודכן {formatDateTimeIL(e.updatedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6 flex justify-end border-t border-[var(--border)] pt-4">
        <button type="button" className="hub-btn-orange text-sm" onClick={onClose}>
          סגירה
        </button>
      </div>
    </Modal>
  )
}
