import { useMemo, useState } from 'react'
import { useAgentWorkspaceForUid } from '../../hooks/useAgentWorkspaceForUid'
import { useClients } from '../../hooks/useClients'
import { formatDateIL } from '../../lib/dates'
import { hubSectionClass } from '../../lib/hubSectionBorder'
import { Badge } from '../shared/Badge'
import { ConfirmDialog } from '../shared/ConfirmDialog'

type Props = {
  agentUserId: string
  agentName: string
  embedded?: boolean
}

export function AgentClientsPanel({ agentUserId, agentName, embedded = false }: Props) {
  const { myClients } = useAgentWorkspaceForUid(agentUserId)
  const { deleteClient } = useClients()
  const [q, setQ] = useState('')
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null)

  const clientToDelete = deleteClientId
    ? myClients.find((c) => c.id === deleteClientId) ?? null
    : null

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return myClients
    return myClients.filter((c) => c.name.toLowerCase().includes(t))
  }, [myClients, q])

  const Shell = embedded ? 'div' : 'section'
  const shellClass = embedded ? 'space-y-4' : `space-y-4 ${hubSectionClass(1)}`

  return (
    <Shell className={shellClass}>
      <div>
        <h2 className="text-base font-extrabold text-[var(--text-dark)]">
          לקוחות הסוכן — {agentName}
        </h2>
        <p className="mt-1 text-[11px] text-[var(--text-mid)]">
          אותה רשימה שמופיעה בפורטל «עסקים». שיוך לקוח חדש — בטאב «שיוך לקוחות» או ב«+ עסק
          ועסקה».
        </p>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="חיפוש לפי שם עסק…"
        className="w-full max-w-md rounded-xl border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-mid)]">
          {myClients.length === 0
            ? 'אין לקוחות משויכים לסוכן זה.'
            : 'לא נמצאו לקוחות לחיפוש.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead className="bg-[var(--surface-muted)] text-[11px] font-bold text-[var(--text-light)]">
              <tr>
                <th className="px-3 py-2 text-right">שם</th>
                <th className="px-3 py-2 text-right">איש קשר</th>
                <th className="px-3 py-2 text-right">טלפון</th>
                <th className="px-3 py-2 text-right">סטטוס</th>
                <th className="px-3 py-2 text-right">נוסף</th>
                <th className="px-3 py-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2.5 font-semibold text-[var(--text-dark)]">{c.name}</td>
                  <td className="px-3 py-2.5 text-[var(--text-mid)]">{c.contact || '—'}</td>
                  <td className="px-3 py-2.5 text-[var(--text-mid)]" dir="ltr">
                    {c.phone || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      label={c.status === 'active' ? 'פעיל' : 'לא פעיל'}
                      color={c.status === 'active' ? '#16A34A' : '#64748B'}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-[var(--text-mid)]">
                    {formatDateIL(c.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--danger)] underline hover:no-underline"
                      onClick={() => setDeleteClientId(c.id)}
                    >
                      מחיקה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteClientId !== null}
        onClose={() => setDeleteClientId(null)}
        onConfirm={() => {
          if (deleteClientId) void deleteClient(deleteClientId)
        }}
        message={
          clientToDelete
            ? `למחוק את העסק «${clientToDelete.name}»? יימחקו גם כל העסקאות, התקבולים והפרויקטים הקשורים — והעסק ייעלם מפורטל הסוכן ${agentName}.`
            : 'למחוק עסק זה?'
        }
      />
    </Shell>
  )
}
