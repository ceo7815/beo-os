import { Fragment, useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isAdminRole } from '../components/RequireAdmin'
import {
  addDaysYmd,
  formatDateIL,
  formatTaskDueDisplay,
  todayYmd,
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

const NUM_DAYS = 5
const HOUR_START = 7
const HOUR_END = 21
const ROW_PX = 44

function startYmd(m: Meeting): string | null {
  const d = (m.startDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

/** שעה 0–23 מתוך HH:mm */
function parseHourFromHm(hm: string | undefined): number | null {
  if (!hm || typeof hm !== 'string') return null
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1]!, 10)
  if (Number.isNaN(h) || h < 0 || h > 23) return null
  return h
}

function formatHourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function dayLabelHe(ymd: string): string {
  const [y, mo, d] = ymd.split('-').map(Number)
  if (!y || !mo || !d) return ymd
  const dt = new Date(y, mo - 1, d)
  const w = new Intl.DateTimeFormat('he-IL', { weekday: 'short' }).format(dt)
  const rest = new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'short',
  }).format(dt)
  return `${w} · ${rest}`
}

export function Calendar() {
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
    openNewMeetingDraft,
    updateMeeting,
    deleteMeeting,
  } = useMeetings()

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [previewMeetingId, setPreviewMeetingId] = useState<string | null>(null)

  useEffect(() => {
    const mid = searchParams.get('openMeeting')?.trim()
    if (!mid) return
    setPreviewMeetingId(mid)
    navigate('/calendar', { replace: true })
  }, [searchParams, navigate])

  const [q, setQ] = useState('')
  /** עמודה ימנית ביותר = יום ראשון בחלון (5 ימים רצופים) */
  const [viewStart, setViewStart] = useState(() => todayYmd())
  /** סינון טווח — ריק = ללא סינון מעבר לחלון התצוגה */
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [dragMeetingId, setDragMeetingId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const myRole = teamMembers.find((m) => m.id === uid)?.role ?? ''
  const canViewAsOthers = isAdminRole(myRole)
  const [adminTeamScope, setAdminTeamScope] = useState<
    'mine' | 'all' | string
  >('mine')

  const realToday = todayYmd()

  const dayYmds = useMemo(
    () =>
      Array.from({ length: NUM_DAYS }, (_, i) => addDaysYmd(viewStart, i)),
    [viewStart],
  )

  const daySet = useMemo(() => new Set(dayYmds), [dayYmds])

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

  const filterFromOk = filterFrom && /^\d{4}-\d{2}-\d{2}$/.test(filterFrom)
  const filterToOk = filterTo && /^\d{4}-\d{2}-\d{2}$/.test(filterTo)

  const visibleMeetings = useMemo(() => {
    return scopedMeetings.filter((m) => {
      const y = startYmd(m)
      if (!y) return false
      if (!daySet.has(y)) return false
      if (filterFromOk && y < filterFrom) return false
      if (filterToOk && y > filterTo) return false
      return true
    })
  }, [scopedMeetings, daySet, filterFromOk, filterToOk, filterFrom, filterTo])

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

  /** מפתח: ymd|hour (שעה שלמה) או ymd|allDay */
  const meetingsByCell = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const meeting of visibleMeetings) {
      const y = startYmd(meeting)
      if (!y) continue
      let h = parseHourFromHm(meeting.startTime)
      if (h === null || h < HOUR_START || h > HOUR_END) {
        map.set(`${y}|allDay`, [...(map.get(`${y}|allDay`) ?? []), meeting])
        continue
      }
      const key = `${y}|${h}`
      map.set(key, [...(map.get(key) ?? []), meeting])
    }
    for (const [, arr] of map) {
      arr.sort((a, b) =>
        (a.startTime ?? '').localeCompare(b.startTime ?? ''),
      )
    }
    return map
  }, [visibleMeetings])

  const applyDrop = useCallback(
    (meetingId: string, targetYmd: string, hour: number | 'allDay') => {
      const m = meetings.find((x) => x.id === meetingId)
      if (!m) return
      const patch: Partial<Meeting> = { startDate: targetYmd }
      if (hour === 'allDay') {
        patch.startTime = undefined
      } else {
        patch.startTime = `${String(hour).padStart(2, '0')}:00`
      }
      void updateMeeting(meetingId, patch)
    },
    [meetings, updateMeeting],
  )

  const errMsg = error?.message ?? ''
  const hours = useMemo(
    () =>
      Array.from(
        { length: HOUR_END - HOUR_START + 1 },
        (_, i) => HOUR_START + i,
      ),
    [],
  )

  const windowLabel = `${formatDateIL(dayYmds[0]!)} — ${formatDateIL(dayYmds[NUM_DAYS - 1]!)}`

  return (
    <div className="mx-auto max-w-[1680px] space-y-5 px-4 py-6 md:px-8 md:py-8" dir="rtl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold text-[var(--text-dark)]">
            יומן פגישות
          </h1>
          <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-[var(--text-mid)]">
            לוח שבועי: {NUM_DAYS} ימים רצופים עם חלוקה לשעות. ניתן לגרור פגישה בין
            תאים לעדכון תאריך ושעה. פגישות בלי שעה או מחוץ לטווח השעות מוצגות
            בשורת «כל היום».
          </p>
          <p className="mt-2 text-[12px] font-semibold text-[#0369A1]">{windowLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש בפגישות…"
            className="w-full min-w-[160px] flex-1 rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-3 py-2 text-[13px] text-[var(--text-dark)] lg:w-56 lg:flex-none"
          />
          <button
            type="button"
            onClick={() => openNewMeetingDraft({ startDate: viewStart })}
            className="rounded-[10px] bg-[#0EA5E9] px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:brightness-110"
          >
            + פגישה חדשה
          </button>
        </div>
      </div>

      <div className={`space-y-4 rounded-2xl ${hubSectionClass(0)} p-4`}>
        <div className="grid gap-4 lg:grid-cols-2">
          {canViewAsOthers ? (
            <div>
              <label
                htmlFor="calendar-view-as"
                className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]"
              >
                תצוגה (מנהל)
              </label>
              <select
                id="calendar-view-as"
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
                <option value="__mine__">היומן שלי</option>
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
              <span className="font-semibold text-[var(--text-dark)]">היומן שלך</span>
              — פגישות שאתה משתתף בהן.
            </p>
          )}

          <div className="space-y-3">
            <p className="text-[11px] font-bold text-[var(--text-mid)]">
              סינון לפי תאריכים (אופציונלי)
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-mid)]">
                מתאריך
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value.slice(0, 10))}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-mid)]">
                עד תאריך
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value.slice(0, 10))}
                  className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px]"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setFilterFrom('')
                  setFilterTo('')
                }}
                className="rounded-[10px] border border-[var(--border)] px-3 py-2 text-[12px] font-semibold text-[var(--text-mid)] hover:bg-[var(--surface-muted)]"
              >
                נקה סינון
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--text-mid)]">
              תחילת חלון ({NUM_DAYS} ימים):
            </span>
            <input
              type="date"
              value={viewStart}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setViewStart(v)
              }}
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--bg-input)] px-2 py-1.5 text-[13px]"
            />
            <button
              type="button"
              onClick={() => setViewStart(realToday)}
              className="rounded-[10px] border border-[var(--orange)] bg-[var(--orange-light)] px-3 py-2 text-[12px] font-bold text-[var(--orange)]"
            >
              היום
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setViewStart((s) => addDaysYmd(s, -NUM_DAYS))}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[12px] font-bold text-[var(--text-dark)] transition hover:bg-[var(--surface-muted)]"
            >
              ← {NUM_DAYS} ימים
            </button>
            <button
              type="button"
              onClick={() => setViewStart((s) => addDaysYmd(s, -5))}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[12px] font-bold text-[var(--text-dark)] transition hover:bg-[var(--surface-muted)]"
            >
              5 ימים אחורה
            </button>
            <button
              type="button"
              onClick={() => setViewStart((s) => addDaysYmd(s, 5))}
              className="rounded-[10px] border border-[#0EA5E9] bg-[#E0F2FE] px-3 py-2 text-[12px] font-bold text-[#0369A1] transition hover:bg-[#BAE6FD]"
            >
              5 ימים קדימה
            </button>
            <button
              type="button"
              onClick={() => setViewStart((s) => addDaysYmd(s, NUM_DAYS))}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--dash-panel-bg)] px-3 py-2 text-[12px] font-bold text-[var(--text-dark)] transition hover:bg-[var(--surface-muted)]"
            >
              {NUM_DAYS} ימים →
            </button>
          </div>
        </div>
      </div>

      {errMsg ? (
        <div className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {errMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="text-[13px] text-[var(--text-mid)]">טוען יומן…</div>
      ) : (
        <div
          className={`overflow-x-auto rounded-2xl border border-[var(--border)] ${hubSectionClass(1)} shadow-sm`}
        >
          <div
            className="min-w-[720px]"
            style={{
              display: 'grid',
              gridTemplateColumns: `72px repeat(${NUM_DAYS}, minmax(120px, 1fr))`,
              gridAutoRows: `${ROW_PX}px`,
            }}
          >
            <div
              className="sticky right-0 z-20 border-b border-e border-[var(--border)] bg-[var(--dash-panel-bg)] px-2 py-2 text-center text-[11px] font-bold text-[var(--text-mid)]"
              style={{ gridColumn: 1, gridRow: 1 }}
            >
              שעה
            </div>
            {dayYmds.map((ymd, di) => (
              <div
                key={ymd}
                className="border-b border-s border-[var(--border)] bg-gradient-to-b from-[#F0F9FF] to-[var(--dash-panel-bg)] px-2 py-2 text-center"
                style={{ gridColumn: di + 2, gridRow: 1 }}
              >
                <div className="text-[11px] font-bold text-[#0369A1]">
                  {formatDateIL(ymd)}
                </div>
                <div className="text-[10px] font-semibold text-[var(--text-mid)]">
                  {dayLabelHe(ymd)}
                </div>
              </div>
            ))}

            <div
              className="sticky right-0 z-10 border-e border-b border-[var(--border)] bg-[var(--surface-muted)] px-1 py-1 text-center text-[10px] font-bold leading-tight text-[var(--text-mid)]"
              style={{ gridColumn: 1, gridRow: 2 }}
            >
              כל היום
            </div>
            {dayYmds.map((ymd, di) => {
              const allDayMeet = meetingsByCell.get(`${ymd}|allDay`) ?? []
              return (
                <div
                  key={`allday-${ymd}`}
                  className="border-b border-s border-[var(--border)] bg-[var(--dash-panel-bg)] px-1 py-1"
                  style={{ gridColumn: di + 2, gridRow: 2, minHeight: ROW_PX }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() =>
                    setDragOverKey(`drop|${ymd}|allDay`)
                  }
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = dragMeetingId || e.dataTransfer.getData('text/meeting-id')
                    if (id) applyDrop(id, ymd, 'allDay')
                    setDragMeetingId(null)
                    setDragOverKey(null)
                  }}
                >
                  <div
                    className={`flex max-h-[40px] flex-col gap-0.5 overflow-y-auto ${
                      dragOverKey === `drop|${ymd}|allDay`
                        ? 'ring-2 ring-[#0EA5E9] ring-inset'
                        : ''
                    }`}
                  >
                    {allDayMeet.map((m) => (
                      <MeetingChip
                        key={m.id}
                        meeting={m}
                        compact
                        uid={uid}
                        canAdmin={canViewAsOthers}
                        clientById={clientById}
                        projectById={projectById}
                        supplierById={supplierById}
                        teamMembers={teamMembers}
                        onOpen={() => setPreviewMeetingId(m.id)}
                        onDelete={() => void deleteMeeting(m.id)}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/meeting-id', m.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDragMeetingId(m.id)
                          setDragOverKey(null)
                        }}
                        onDragEnd={() => {
                          setDragMeetingId(null)
                          setDragOverKey(null)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {hours.map((hour, hi) => (
              <Fragment key={`row-${hour}`}>
                <div
                  key={`t-${hour}`}
                  className="sticky right-0 z-10 border-e border-b border-[var(--border)] bg-[var(--dash-panel-bg)] py-1 text-center text-[11px] font-mono font-semibold text-[var(--text-mid)]"
                  style={{ gridColumn: 1, gridRow: hi + 3 }}
                >
                  {formatHourLabel(hour)}
                </div>
                {dayYmds.map((ymd, di) => {
                  const list = meetingsByCell.get(`${ymd}|${hour}`) ?? []
                  const dropKey = `drop|${ymd}|${hour}`
                  return (
                    <div
                      key={`c-${ymd}-${hour}`}
                      className={`relative border-b border-s border-[var(--border)] bg-white/40 px-0.5 py-0.5 ${
                        dragOverKey === dropKey
                          ? 'bg-[#E0F2FE] ring-2 ring-[#0EA5E9] ring-inset'
                          : ''
                      }`}
                      style={{ gridColumn: di + 2, gridRow: hi + 3 }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDragOverKey(dropKey)}
                      onDrop={(e) => {
                        e.preventDefault()
                        const id =
                          dragMeetingId ||
                          e.dataTransfer.getData('text/meeting-id')
                        if (id) applyDrop(id, ymd, hour)
                        setDragMeetingId(null)
                        setDragOverKey(null)
                      }}
                    >
                      <div className="flex max-h-[38px] flex-col gap-0.5 overflow-y-auto">
                        {list.map((m) => (
                          <MeetingChip
                            key={m.id}
                            meeting={m}
                            uid={uid}
                            canAdmin={canViewAsOthers}
                            clientById={clientById}
                            projectById={projectById}
                            supplierById={supplierById}
                            teamMembers={teamMembers}
                            onOpen={() => setPreviewMeetingId(m.id)}
                            onDelete={() => void deleteMeeting(m.id)}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/meeting-id', m.id)
                              e.dataTransfer.effectAllowed = 'move'
                              setDragMeetingId(m.id)
                            }}
                            onDragEnd={() => {
                              setDragMeetingId(null)
                              setDragOverKey(null)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {!loading && !errMsg && visibleMeetings.length === 0 ? (
        <div className="hub-empty-dashed rounded-[14px] p-8 text-center text-[13px] text-[var(--text-mid)]">
          אין פגישות בחלון התאריכים. ניתן להזיז את החלון בכפתורי 5 הימים או לפתוח
          פגישה חדשה.
        </div>
      ) : null}

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

function MeetingChip({
  meeting: m,
  uid,
  canAdmin,
  clientById,
  projectById,
  supplierById,
  teamMembers,
  onOpen,
  onDelete,
  draggable,
  onDragStart,
  onDragEnd,
  compact,
}: {
  meeting: Meeting
  uid: string
  canAdmin: boolean
  clientById: Map<string, string>
  projectById: Map<string, string>
  supplierById: Map<string, string>
  teamMembers: { id: string; name: string }[]
  onOpen: () => void
  onDelete: () => void
  draggable?: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
  compact?: boolean
}) {
  const clientName = m.clientId ? clientById.get(m.clientId) ?? null : null
  const projectName = m.projectId ? projectById.get(m.projectId) ?? null : null
  const supplierName = supplierDisplayName(m.supplierId, supplierById)
  const org = teamMembers.find((t) => t.id === m.organizerUserId)
  const canDel = m.createdBy === uid || m.organizerUserId === uid || canAdmin

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`cursor-pointer rounded-md border px-1 py-0.5 text-start shadow-sm hover:brightness-[1.03] ${
        m.completed
          ? 'border-emerald-400/80 bg-emerald-50/95'
          : 'border-[#7DD3FC]/80 bg-[#F0F9FF]'
      } ${compact ? 'text-[9px]' : 'text-[10px]'}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1 truncate font-bold text-[var(--text-dark)]">
          {m.title}
        </div>
        {m.completed ? (
          <span
            className="shrink-0 rounded bg-emerald-700 px-1 py-0 text-[7px] font-bold text-white"
            title="הסתיימה"
          >
            ✓
          </span>
        ) : null}
      </div>
      {!compact ? (
        <div className="truncate text-[9px] text-[var(--text-mid)]">
          {formatTaskDueDisplay(m.startDate, m.startTime)}
          {m.endTime ? `–${m.endTime}` : ''}
        </div>
      ) : null}
      {!compact && (org || clientName) ? (
        <div className="mt-0.5 truncate text-[8px] text-[var(--text-light)]">
          {[org?.name, clientName].filter(Boolean).join(' · ')}
        </div>
      ) : null}
      {!compact && (projectName || supplierName) ? (
        <div className="truncate text-[8px] text-[var(--text-light)]">
          {[projectName, supplierName].filter(Boolean).join(' · ')}
        </div>
      ) : null}
      {canDel ? (
        <button
          type="button"
          className="mt-0.5 text-[8px] font-bold text-red-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation()
            if (!window.confirm('למחוק את הפגישה?')) return
            onDelete()
          }}
        >
          מחק
        </button>
      ) : null}
    </div>
  )
}
