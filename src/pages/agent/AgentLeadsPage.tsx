import { useMemo, useState } from 'react'
import { formatDateIL } from '../../lib/dates'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { useAgentWorkspace } from '../../hooks/useAgentWorkspace'
import { currentYm } from '../../lib/agentRevenue'
import type { Lead, LeadStatus } from '../../types'
import { AgentLeadQuoteSnippet } from '../../components/agent/AgentLeadQuoteSnippet'
import { Badge } from '../../components/shared/Badge'

const statusLabels: Record<LeadStatus, string> = {
  new: 'חדש',
  specification: 'בתהליך אפיון',
  quote_sent: 'נשלחה הצעת מחיר',
  follow_up: 'יש לבצע פולואפ',
  no_answer: 'אין מענה',
  not_relevant: 'לא רלוונטי',
  closed: 'נסגרה',
}

const OPEN_PIPELINE: ReadonlySet<LeadStatus> = new Set([
  'new',
  'specification',
  'quote_sent',
  'follow_up',
  'no_answer',
])

function leadActivityMonthYm(l: Lead): string | null {
  const at = l.lastActivityAt?.trim().slice(0, 10)
  if (at && /^\d{4}-\d{2}-\d{2}$/.test(at)) return at.slice(0, 7)
  const c = l.createdAt?.trim().slice(0, 10)
  if (c && /^\d{4}-\d{2}-\d{2}$/.test(c)) return c.slice(0, 7)
  return null
}

const statusColors: Record<LeadStatus, string> = {
  new: '#F97316',
  specification: '#7C3AED',
  quote_sent: '#D97706',
  follow_up: '#EA580C',
  no_answer: '#64748B',
  not_relevant: '#DC2626',
  closed: '#16A34A',
}

export function AgentLeadsPage() {
  const { myLeads, myClients, clientNameById } = useAgentWorkspace()
  const [q, setQ] = useState('')

  const ymNow = useMemo(() => currentYm(), [])

  const leadKpis = useMemo(() => {
    const closedAll = myLeads.filter((l) => l.status === 'closed').length
    const closedMonth = myLeads.filter((l) => {
      if (l.status !== 'closed') return false
      return leadActivityMonthYm(l) === ymNow
    }).length
    const inProgress = myLeads.filter((l) => OPEN_PIPELINE.has(l.status)).length
    const notClosed = myLeads.filter((l) => l.status !== 'closed').length
    return { closedAll, closedMonth, inProgress, notClosed }
  }, [myLeads, ymNow])

  const kpis = useMemo(
    () => [
      {
        label: 'לידים שנסגרו מהתחלה',
        value: String(leadKpis.closedAll),
        color: 'text-[#16A34A]',
      },
      {
        label: 'לידים שנסגרו החודש',
        value: String(leadKpis.closedMonth),
        color: 'text-[#059669]',
      },
      {
        label: 'לידים בטיפול',
        value: String(leadKpis.inProgress),
        color: 'text-[var(--orange)]',
      },
      {
        label: 'לידים שלא נסגרו',
        value: String(leadKpis.notClosed),
        color: 'text-[var(--text-dark)]',
      },
    ],
    [leadKpis],
  )

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return myLeads
    return myLeads.filter((l) => {
      return (
        l.name.toLowerCase().includes(t) ||
        (l.company ?? '').toLowerCase().includes(t) ||
        (l.phone ?? '').toLowerCase().includes(t) ||
        (l.email ?? '').toLowerCase().includes(t) ||
        (l.clientNeeds ?? '').toLowerCase().includes(t) ||
        statusLabels[l.status].includes(t)
      )
    })
  }, [myLeads, q])

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 md:px-8 md:py-8">
      <header className="space-y-1">
        <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">לידים</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-[var(--text-mid)]">
          לידים ששויכו אליך כסוכן מכירות (או ללקוחות שלך) — כולל צרכי הלקוח, סטטוס והצעת מחיר.
        </p>
      </header>

      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="סיכום לידים"
      >
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`flex flex-col gap-1 rounded-[12px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-3 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${hubSectionClass(i)}`}
          >
            <span className="text-[11px] font-semibold leading-snug text-[var(--text-mid)]">
              {k.label}
            </span>
            <span
              className={`text-lg font-extrabold tabular-nums leading-tight sm:text-[22px] ${k.color}`}
            >
              {k.value}
            </span>
          </div>
        ))}
      </section>

      <div className={`rounded-2xl p-4 ${hubSectionClass(0)} shadow-[0_2px_8px_rgba(0,0,0,0.06)]`}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש לפי שם, חברה, טלפון, אימייל, צרכי לקוח או סטטוס…"
          className="w-full max-w-full rounded-lg border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm md:max-w-md"
        />
      </div>

      <section className={`rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${hubSectionClass(1)}`}>
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-mid)]">
            {myLeads.length === 0
              ? 'אין לידים המשויכים אליך או ללקוחותיך.'
              : 'לא נמצאו לידים לפי החיפוש.'}
          </p>
        ) : (
          <>
            <div className="hidden min-w-0 overflow-x-auto md:block">
              <table className="w-full min-w-[1100px] table-fixed border-collapse text-sm" dir="rtl">
                <thead className="bg-[var(--surface-muted)]">
                  <tr className="text-right text-[11px] font-bold text-[var(--text-light)]">
                    <th className="px-3 py-3">שם ליד</th>
                    <th className="px-3 py-3">חברה</th>
                    <th className="px-3 py-3">לקוח במערכת</th>
                    <th className="px-3 py-3">טלפון</th>
                    <th className="px-3 py-3">אימייל</th>
                    <th className="px-3 py-3">צרכי לקוח</th>
                    <th className="px-3 py-3">סטטוס</th>
                    <th className="px-3 py-3">הצעת מחיר</th>
                    <th className="px-3 py-3">תאריך כניסה</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const linked =
                      (l.clientId && myClients.find((c) => c.id === l.clientId)?.name) || '—'
                    return (
                      <tr key={l.id} className="border-t border-[var(--border)] align-top">
                        <td className="px-3 py-3 font-semibold text-[var(--text-dark)] break-words">
                          {l.name}
                        </td>
                        <td className="px-3 py-3 text-[var(--text-mid)] break-words">
                          {l.company || '—'}
                        </td>
                        <td className="px-3 py-3 text-[var(--text-mid)] break-words">{linked}</td>
                        <td
                          className="px-3 py-3 text-[var(--text-mid)] break-all text-left"
                          dir="ltr"
                        >
                          {l.phone || '—'}
                        </td>
                        <td
                          className="px-3 py-3 text-[var(--text-mid)] break-all text-left"
                          dir="ltr"
                        >
                          {l.email || '—'}
                        </td>
                        <td className="px-3 py-3 text-[var(--text-mid)] max-w-[220px]">
                          {l.clientNeeds?.trim() ? (
                            <p className="whitespace-pre-wrap text-[11px] leading-relaxed line-clamp-4">
                              {l.clientNeeds.trim()}
                            </p>
                          ) : (
                            <span className="text-[var(--text-light)]">—</span>
                          )}
                          {l.status === 'not_relevant' && l.notRelevantReason?.trim() ? (
                            <p className="mt-1.5 text-[10px] leading-snug text-[#B91C1C]">
                              <span className="font-bold">לא רלוונטי: </span>
                              {l.notRelevantReason.trim()}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <Badge label={statusLabels[l.status]} color={statusColors[l.status]} />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <AgentLeadQuoteSnippet lead={l} />
                          {l.status === 'quote_sent' &&
                          !l.quoteChannel &&
                          !l.quotePdfUrl &&
                          !l.quoteVisualUrl ? (
                            <span className="text-[10px] text-[var(--text-light)]">נשלחה — ללא קובץ/קישור</span>
                          ) : null}
                          {!l.quoteChannel && !l.quotePdfUrl && !l.quoteVisualUrl && l.status !== 'quote_sent' ? (
                            <span className="text-[10px] text-[var(--text-light)]">—</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-xs text-[var(--text-mid)]">
                          {formatDateIL(l.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {filtered.map((l) => (
                <article
                  key={l.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--dash-panel-bg)] p-3"
                >
                  <div className="font-bold text-[var(--text-dark)]">{l.name}</div>
                  <div className="mt-1 text-xs text-[var(--text-mid)]">{l.company || '—'}</div>
                  {l.clientNeeds?.trim() ? (
                    <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-mid)]">
                      <span className="font-bold text-[var(--text-light)]">צרכי לקוח: </span>
                      {l.clientNeeds.trim()}
                    </p>
                  ) : null}
                  {l.status === 'not_relevant' && l.notRelevantReason?.trim() ? (
                    <p className="mt-1 text-[10px] text-[#B91C1C]">
                      <span className="font-bold">לא רלוונטי: </span>
                      {l.notRelevantReason.trim()}
                    </p>
                  ) : null}
                  <div className="mt-2">
                    <Badge label={statusLabels[l.status]} color={statusColors[l.status]} />
                  </div>
                  <AgentLeadQuoteSnippet lead={l} className="mt-2" />
                  <div className="mt-2 text-[11px] text-[var(--text-mid)]" dir="ltr">
                    {l.phone || '—'} · {l.email || '—'}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--text-light)]">
                    לקוח: {l.clientId ? clientNameById.get(l.clientId) ?? l.clientId : '—'}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
