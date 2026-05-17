import { useMemo, useState } from 'react'
import { AgentBusinessDealsDetail } from '../../components/agent/AgentBusinessDealsDetail'
import { Badge } from '../../components/shared/Badge'
import { useAgentWorkspace } from '../../hooks/useAgentWorkspace'
import { useUsers } from '../../hooks/useUsers'
import { formatDateIL } from '../../lib/dates'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import type { Client, Deal } from '../../types'

function clientMatchesQuery(
  c: Client,
  q: string,
  employeeNameById: Map<string, string>,
): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const parts = [
    c.name,
    c.contact,
    c.phone,
    c.email,
    c.department ?? '',
    c.status === 'active' ? 'פעיל' : 'לא פעיל',
  ]
    .join(' ')
    .toLowerCase()
  if (parts.includes(t)) return true
  for (const id of c.assignedEmployeeUserIds ?? []) {
    if (id.toLowerCase().includes(t)) return true
    const n = employeeNameById.get(id)
    if (n && n.toLowerCase().includes(t)) return true
  }
  return false
}

function dealsMatchQuery(deals: Deal[], q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return false
  for (const d of deals) {
    const hay = [d.title, d.notes ?? '', d.status, d.dealKind].join(' ').toLowerCase()
    if (hay.includes(t)) return true
  }
  return false
}

export function AgentBusinessPage() {
  const { myClients, myProjects, myDeals, myInvoices } = useAgentWorkspace()
  const { users: teamMembers } = useUsers()
  const [q, setQ] = useState('')

  const employeeNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of teamMembers) m.set(u.id, u.name)
    return m
  }, [teamMembers])

  const projectCountByClientId = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of myProjects) {
      const cid = p.clientId?.trim()
      if (!cid) continue
      m.set(cid, (m.get(cid) ?? 0) + 1)
    }
    return m
  }, [myProjects])

  const dealsByClientId = useMemo(() => {
    const m = new Map<string, Deal[]>()
    for (const d of myDeals) {
      const list = m.get(d.clientId) ?? []
      list.push(d)
      m.set(d.clientId, list)
    }
    return m
  }, [myDeals])

  const invoicesByClientId = useMemo(() => {
    const m = new Map<string, typeof myInvoices>()
    for (const inv of myInvoices) {
      const list = m.get(inv.clientId) ?? []
      list.push(inv)
      m.set(inv.clientId, list)
    }
    return m
  }, [myInvoices])

  const filtered = useMemo(() => {
    return myClients.filter((c) => {
      const deals = dealsByClientId.get(c.id) ?? []
      return clientMatchesQuery(c, q, employeeNameById) || dealsMatchQuery(deals, q)
    })
  }, [myClients, q, employeeNameById, dealsByClientId])

  const clientStatusKpis = useMemo(() => {
    let active = 0
    let inactive = 0
    for (const c of myClients) {
      if (c.status === 'active') active += 1
      else inactive += 1
    }
    return { active, inactive, deals: myDeals.length }
  }, [myClients, myDeals.length])

  const formatAssigned = (ids: string[] | undefined) => {
    if (!ids?.length) return '—'
    return ids.map((id) => employeeNameById.get(id) ?? id).join(' · ')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 md:px-8 md:py-8">
      <header className="space-y-1">
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">עסקים ועסקאות</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
          כל העסקים המשויכים אליך, עם פירוט מלא לכל עסקה — סכום מוסכם, לוח תשלומים מתוכנן
          ותקבולים שנרשמו מהלקוח.
        </p>
      </header>

      <section
        className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3"
        aria-label="סיכום עסקים ועסקאות"
      >
        <div
          className={`flex flex-col gap-1 rounded-[12px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${hubSectionClass(0)}`}
        >
          <span className="text-[11px] font-semibold leading-snug text-[var(--text-mid)]">
            עסקים פעילים
          </span>
          <span className="text-lg font-extrabold tabular-nums leading-tight text-[#16A34A] sm:text-[22px]">
            {clientStatusKpis.active}
          </span>
        </div>
        <div
          className={`flex flex-col gap-1 rounded-[12px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${hubSectionClass(1)}`}
        >
          <span className="text-[11px] font-semibold leading-snug text-[var(--text-mid)]">
            עסקים לא פעילים
          </span>
          <span className="text-lg font-extrabold tabular-nums leading-tight text-[#64748B] sm:text-[22px]">
            {clientStatusKpis.inactive}
          </span>
        </div>
        <div
          className={`col-span-2 flex flex-col gap-1 rounded-[12px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] sm:col-span-1 ${hubSectionClass(2)}`}
        >
          <span className="text-[11px] font-semibold leading-snug text-[var(--text-mid)]">
            עסקאות פעילות
          </span>
          <span className="text-lg font-extrabold tabular-nums leading-tight text-[var(--text-dark)] sm:text-[22px]">
            {clientStatusKpis.deals}
          </span>
        </div>
      </section>

      <div className={`rounded-2xl p-4 ${hubSectionClass(2)} shadow-[0_2px_8px_rgba(0,0,0,0.06)]`}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי עסק, איש קשר, עובד, שם עסקה או סטטוס…"
          className="w-full max-w-full rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm md:max-w-md"
        />
      </div>

      <section
        className={`space-y-4 rounded-2xl p-3 md:p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${hubSectionClass(1)}`}
        aria-label="רשימת עסקים ועסקאות"
      >
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-mid)]">
            {myClients.length === 0
              ? 'אין עסקים משויכים אליך.'
              : 'לא נמצאו עסקים או עסקאות לפי החיפוש.'}
          </p>
        ) : (
          filtered.map((c) => {
            const statusLabel = c.status === 'active' ? 'פעיל' : 'לא פעיל'
            const statusColor = c.status === 'active' ? '#16A34A' : '#64748B'
            const count = projectCountByClientId.get(c.id) ?? 0
            const deals = dealsByClientId.get(c.id) ?? []
            const clientInvoices = invoicesByClientId.get(c.id) ?? []
            return (
              <article
                key={c.id}
                className="overflow-hidden rounded-xl border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
              >
                <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-base font-extrabold text-[var(--text-dark)]">{c.name}</h2>
                    <Badge label={statusLabel} color={statusColor} />
                  </div>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="font-bold text-[var(--text-light)]">איש קשר</dt>
                      <dd className="text-[var(--text-mid)]">{c.contact || '—'}</dd>
                    </div>
                    <div dir="ltr" className="text-left sm:text-right">
                      <dt className="font-bold text-[var(--text-light)]">טלפון</dt>
                      <dd className="text-[var(--text-mid)]">{c.phone || '—'}</dd>
                    </div>
                    <div dir="ltr" className="break-all text-left sm:text-right">
                      <dt className="font-bold text-[var(--text-light)]">אימייל</dt>
                      <dd className="text-[var(--text-mid)]">{c.email || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-[var(--text-light)]">תאריך כניסה</dt>
                      <dd className="text-[var(--text-mid)]">{formatDateIL(c.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-[var(--text-light)]">מחלקה</dt>
                      <dd className="text-[var(--text-mid)]">{c.department || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-[var(--text-light)]">פרויקטים</dt>
                      <dd className="tabular-nums text-[var(--text-mid)]">{count}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="font-bold text-[var(--text-light)]">עובדים משויכים</dt>
                      <dd className="text-[var(--text-mid)]">
                        {formatAssigned(c.assignedEmployeeUserIds)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <AgentBusinessDealsDetail deals={deals} invoices={clientInvoices} />
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
