import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isAdminRole } from '../components/RequireAdmin'
import {
  formatDateTimeIL,
  formatTaskDueDisplay,
} from '../lib/dates'
import { hubSectionClass } from '../lib/hubSectionBorder'
import { supplierDisplayName } from '../lib/supplierDisplay'
import { MeetingPreviewModal } from '../components/MeetingPreviewModal'
import { useClients } from '../hooks/useClients'
import { useMeetings } from '../hooks/useMeetings'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useUsers } from '../hooks/useUsers'
import type { Meeting } from '../types'

export function MeetingSummaries() {
  const { user } = useAuth()
  const uid = user?.uid ?? ''
  const { users: teamMembers } = useUsers()
  const { clients } = useClients()
  const { suppliers } = useSuppliers()
  const { projects } = useProjects()
  const {
    meetings,
    loading,
    error,
    setDrawerMeetingId,
    deleteMeeting,
  } = useMeetings()

  const [q, setQ] = useState('')
  const [previewMeetingId, setPreviewMeetingId] = useState<string | null>(null)

  const myRole = teamMembers.find((m) => m.id === uid)?.role ?? ''
  const canViewAsOthers = isAdminRole(myRole)
  const [adminTeamScope, setAdminTeamScope] = useState<
    'mine' | 'all' | string
  >('mine')

  const scopeUid =
    !canViewAsOthers || adminTeamScope === 'mine'
      ? uid
      : adminTeamScope === 'all'
        ? null
        : adminTeamScope

  const scopedMeetings = useMemo(() => {
    const qq = q.trim().toLowerCase()
    let list = meetings
    if (scopeUid) {
      list = list.filter((m) => m.attendeeUserIds.includes(scopeUid))
    }
    if (!qq) return list
    return list.filter((m) => {
      const hay =
        `${m.title} ${m.purpose} ${m.agenda} ${m.completionSummary ?? ''}`.toLowerCase()
      return hay.includes(qq)
    })
  }, [meetings, scopeUid, q])

  const completedWithSummary = useMemo(() => {
    const list = scopedMeetings.filter(
      (m) =>
        m.completed === true && (m.completionSummary?.trim() ?? '') !== '',
    )
    list.sort((a, b) => {
      const ta = a.completedAt ?? `${a.startDate}T00:00:00`
      const tb = b.completedAt ?? `${b.startDate}T00:00:00`
      return tb.localeCompare(ta)
    })
    return list
  }, [scopedMeetings])

  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  )
  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  )

  const previewMeeting = useMemo(
    () =>
      previewMeetingId
        ? meetings.find((x) => x.id === previewMeetingId)
        : undefined,
    [meetings, previewMeetingId],
  )

  const errMsg = error?.message ?? ''

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 md:px-8 md:py-8" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="mb-2 text-[12px] font-semibold text-[var(--text-mid)]">
            <Link
              to="/calendar"
              className="text-[#0369A1] underline-offset-2 hover:underline"
            >
              יומן
            </Link>
            <span className="mx-1.5 text-[var(--text-light)]">/</span>
            <span className="text-[var(--text-dark)]">סיכומי פגישות</span>
          </nav>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            סיכומי פגישות
          </h1>
          <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-[var(--text-mid)]">
            כאן מופיעות כל הפגישות שנסגרו עם סיכום. לחיצה על כרטיס פותחת תצוגה
            מלאה; ניתן לעבור ללוח השבועי ביומן לתזמון ולעריכת פגישות.
          </p>
        </div>
        <Link
          to="/calendar"
          className="shrink-0 rounded-[10px] border border-[#0EA5E9] bg-[#E0F2FE] px-4 py-2.5 text-center text-[13px] font-bold text-[#0369A1] transition hover:bg-[#BAE6FD]"
        >
          ללוח היומן
        </Link>
      </div>

      <div className={`rounded-2xl ${hubSectionClass(0)} p-4`}>
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,280px)]">
          {canViewAsOthers ? (
            <div>
              <label
                htmlFor="summaries-view-as"
                className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
              >
                תצוגה (מנהל)
              </label>
              <select
                id="summaries-view-as"
                value={
                  adminTeamScope === 'mine'
                    ? '__mine__'
                    : adminTeamScope === 'all'
                      ? '__all__'
                      : adminTeamScope
                }
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__mine__') setAdminTeamScope('mine')
                  else if (v === '__all__') setAdminTeamScope('all')
                  else setAdminTeamScope(v)
                }}
                className="w-full max-w-md rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)]"
              >
                <option value="__mine__">היומן שלי (פגישות שאני משתתף)</option>
                <option value="__all__">כל הארגון</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-mid)]">
              <span className="font-semibold text-[var(--text-dark)]">
                הפגישות שלך
              </span>
              — סיכומים לפגישות שאתה משתתף בהן.
            </p>
          )}
          <div>
            <label
              htmlFor="summaries-search"
              className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
            >
              חיפוש
            </label>
            <input
              id="summaries-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="כותרת, מטרה, סיכום…"
              className="w-full rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)]"
            />
          </div>
        </div>
      </div>

      {errMsg ? (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {errMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[13px] text-[var(--text-mid)]">טוען סיכומים…</div>
      ) : completedWithSummary.length === 0 ? (
        <div className="hub-empty-dashed rounded-[14px] p-10 text-center text-[14px] text-[var(--text-mid)]">
          אין סיכומים להצגה. לאחר סגירת פגישה עם סיכום (מהיומן או מתצוגת
          הפגישה) — הרשומה תופיע כאן.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {completedWithSummary.map((m) => (
            <li key={m.id}>
              <MeetingSummaryCard
                meeting={m}
                clientById={clientById}
                projectById={projectById}
                supplierById={supplierById}
                teamMembers={teamMembers}
                onOpen={() => setPreviewMeetingId(m.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <MeetingPreviewModal
        meetingId={previewMeetingId}
        meeting={previewMeeting}
        listLoading={loading}
        uid={uid}
        canAdmin={canViewAsOthers}
        clientById={clientById}
        projectById={projectById}
        supplierById={supplierById}
        teamMembers={teamMembers}
        onClose={() => setPreviewMeetingId(null)}
        onEdit={(id) => {
          setPreviewMeetingId(null)
          setDrawerMeetingId(id)
        }}
        onDelete={(id) => void deleteMeeting(id)}
      />
    </div>
  )
}

function MeetingSummaryCard({
  meeting: m,
  clientById,
  projectById,
  supplierById,
  teamMembers,
  onOpen,
}: {
  meeting: Meeting
  clientById: Map<string, string>
  projectById: Map<string, string>
  supplierById: Map<string, string>
  teamMembers: { id: string; name: string }[]
  onOpen: () => void
}) {
  const clientName = m.clientId ? clientById.get(m.clientId) : undefined
  const projectName = m.projectId ? projectById.get(m.projectId) : undefined
  const supplierName = supplierDisplayName(m.supplierId, supplierById)
  const org = teamMembers.find((t) => t.id === m.organizerUserId)?.name

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex h-full w-full flex-col rounded-2xl border border-[var(--border)] ${hubSectionClass(1)} p-4 text-right shadow-sm transition hover:border-[#0EA5E9]/45 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-2">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          הושלמה
        </span>
        <h2 className="min-w-0 flex-1 text-[15px] font-extrabold leading-snug text-[var(--text-dark)]">
          {m.title?.trim() || 'פגישה'}
        </h2>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-[var(--text-mid)]">
        מועד: {formatTaskDueDisplay(m.startDate, m.startTime)}
        {m.endTime ? ` – ${m.endTime}` : ''}
      </p>
      {(org || clientName) && (
        <p className="mt-0.5 text-[10px] text-[var(--text-light)]">
          {[org, clientName].filter(Boolean).join(' · ')}
        </p>
      )}
      {(projectName || supplierName) && (
        <p className="truncate text-[10px] text-[var(--text-light)]">
          {[projectName, supplierName].filter(Boolean).join(' · ')}
        </p>
      )}
      <pre
        dir="auto"
        className="mt-3 max-h-36 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-start font-sans text-[12px] leading-relaxed text-[var(--text-dark)]"
      >
        {m.completionSummary?.trim() ?? ''}
      </pre>
      <div className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-mid)]">
        <span className="font-bold text-[var(--text-dark)]">
          {m.completedByName?.trim() || 'משתמש'}
        </span>
        {m.completedAt ? (
          <> · נסגר ב־{formatDateTimeIL(m.completedAt)}</>
        ) : null}
      </div>
      <span className="mt-2 text-[11px] font-bold text-[#0369A1]">
        לחץ לפרטים מלאים
      </span>
    </button>
  )
}
