import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useClients } from '../hooks/useClients'
import { useLeads } from '../hooks/useLeads'
import { useMeetings } from '../hooks/useMeetings'
import { useProjects } from '../hooks/useProjects'
import { useSuppliers } from '../hooks/useSuppliers'
import { useUsers } from '../hooks/useUsers'
import { ClientQuickSelect } from './ClientQuickSelect'
import { ProjectQuickSelect } from './ProjectQuickSelect'
import { SupplierQuickSelect } from './SupplierQuickSelect'
import { normalizeDueTimeHm, todayYmd, toDateInputYmd } from '../lib/dates'
import { buildAttendeeUserIds } from '../lib/meetingAttendees'
import { NEW_MEETING_DRAWER_ID, type NewMeetingDraftSeed } from '../lib/meetingDrawerIds'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import type { Meeting } from '../types'

type MeetingDraft = {
  title: string
  purpose: string
  agenda: string
  startDate: string
  startTime: string
  endTime: string
  location: string
  clientId: string
  projectId: string
  supplierId: string
  leadId: string
  organizerUserId: string
  participantUserIds: string[]
  /** היוצר לא יופיע ביומן / לא יקבל מייל הזמנה */
  excludeCreatorFromAttendees: boolean
}

function initDraft(m: Meeting): MeetingDraft {
  return {
    title: m.title,
    purpose: m.purpose,
    agenda: m.agenda,
    startDate: m.startDate,
    startTime: m.startTime ?? '',
    endTime: m.endTime ?? '',
    location: m.location ?? '',
    clientId: m.clientId ?? '',
    projectId: m.projectId ?? '',
    supplierId: m.supplierId ?? '',
    leadId: m.leadId ?? '',
    organizerUserId: m.organizerUserId,
    participantUserIds: [...m.participantUserIds],
    excludeCreatorFromAttendees: m.excludeCreatorFromAttendees === true,
  }
}

function localNewMeeting(
  seed: NewMeetingDraftSeed | null,
  uid: string,
): Meeting {
  const start = seed?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(seed.startDate)
    ? seed.startDate
    : todayYmd()
  return {
    id: NEW_MEETING_DRAWER_ID,
    title: '',
    purpose: '',
    agenda: '',
    startDate: start,
    organizerUserId: uid,
    participantUserIds: [],
    excludeCreatorFromAttendees: false,
    attendeeUserIds: buildAttendeeUserIds({
      createdBy: uid,
      organizerUserId: uid,
      participantUserIds: [],
      excludeCreatorFromAttendees: false,
    }),
    createdBy: uid,
    createdAt: new Date().toISOString(),
  }
}

function buildPatch(meeting: Meeting, d: MeetingDraft): Partial<Meeting> {
  const patch: Partial<Meeting> = {}
  if (d.title.trim() !== meeting.title) patch.title = d.title.trim()
  if (d.purpose !== meeting.purpose) patch.purpose = d.purpose
  if (d.agenda !== meeting.agenda) patch.agenda = d.agenda
  if (d.startDate !== meeting.startDate) patch.startDate = d.startDate
  const st = normalizeDueTimeHm(d.startTime)
  const prevSt = normalizeDueTimeHm(meeting.startTime)
  if (st !== prevSt) patch.startTime = st
  const et = normalizeDueTimeHm(d.endTime)
  const prevEt = normalizeDueTimeHm(meeting.endTime)
  if (et !== prevEt) patch.endTime = et
  const loc = d.location.trim()
  if (loc !== (meeting.location ?? '')) patch.location = loc || undefined
  const dc = d.clientId.trim() || undefined
  if ((dc ?? '') !== (meeting.clientId ?? '')) patch.clientId = dc
  const dp = d.projectId.trim() || undefined
  if ((dp ?? '') !== (meeting.projectId ?? '')) patch.projectId = dp
  const ds = d.supplierId.trim() || undefined
  if ((ds ?? '') !== (meeting.supplierId ?? '')) patch.supplierId = ds
  const dl = d.leadId.trim() || undefined
  if ((dl ?? '') !== (meeting.leadId ?? '')) patch.leadId = dl
  if (d.organizerUserId !== meeting.organizerUserId)
    patch.organizerUserId = d.organizerUserId
  if (
    JSON.stringify([...d.participantUserIds].sort()) !==
    JSON.stringify([...meeting.participantUserIds].sort())
  ) {
    patch.participantUserIds = [...d.participantUserIds]
  }
  const prevEx = meeting.excludeCreatorFromAttendees === true
  const nextEx = d.excludeCreatorFromAttendees === true
  if (prevEx !== nextEx) patch.excludeCreatorFromAttendees = nextEx
  return patch
}

export function MeetingDrawer() {
  const {
    meetings,
    drawerMeetingId: meetingId,
    newMeetingDraftSeed,
    setDrawerMeetingId,
    addMeeting,
    updateMeeting,
    deleteMeeting,
  } = useMeetings()
  const { user } = useAuth()
  const userId = user?.uid ?? ''

  const meeting = useMemo(() => {
    if (meetingId === NEW_MEETING_DRAWER_ID) {
      if (!userId) return null
      return localNewMeeting(newMeetingDraftSeed, userId)
    }
    return meetings.find((m) => m.id === meetingId) ?? null
  }, [meetingId, newMeetingDraftSeed, meetings, userId])

  const isNewUnsaved = meetingId === NEW_MEETING_DRAWER_ID
  const { suppliers } = useSuppliers()
  const { clients } = useClients()
  const { projects } = useProjects()
  const { leads } = useLeads()
  const { users: teamMembers } = useUsers()

  const [draft, setDraft] = useState<MeetingDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const prevIdRef = useRef<string | null>(null)
  const seedFpRef = useRef('')

  useLayoutEffect(() => {
    if (!meetingId || !meeting) {
      setDraft(null)
      prevIdRef.current = null
      seedFpRef.current = ''
      return
    }
    if (meetingId === NEW_MEETING_DRAWER_ID && newMeetingDraftSeed) {
      const fp = JSON.stringify(newMeetingDraftSeed)
      if (seedFpRef.current !== fp) {
        seedFpRef.current = fp
        setDraft(initDraft(meeting))
      }
      prevIdRef.current = meetingId
      return
    }
    if (prevIdRef.current !== meetingId) {
      prevIdRef.current = meetingId
      seedFpRef.current = ''
      setDraft(initDraft(meeting))
    }
  }, [meetingId, meeting, newMeetingDraftSeed])

  const projectsForClient = useMemo(() => {
    if (!draft) return projects
    const cid = draft.clientId.trim()
    if (!cid) return projects
    return projects.filter((p) => p.clientId === cid)
  }, [projects, draft])

  const clientNameByIdMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  const dirty = useMemo(() => {
    if (!meeting || !draft || isNewUnsaved) return false
    return Object.keys(buildPatch(meeting, draft)).length > 0
  }, [meeting, draft, isNewUnsaved])

  const requestClose = () => {
    if (dirty) {
      if (!window.confirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?')) return
    }
    setDrawerMeetingId(null)
  }

  const toggleParticipant = (uid: string) => {
    if (!draft || uid === draft.organizerUserId) return
    setDraft((d) => {
      if (!d) return d
      const has = d.participantUserIds.includes(uid)
      return {
        ...d,
        participantUserIds: has
          ? d.participantUserIds.filter((x) => x !== uid)
          : [...d.participantUserIds, uid],
      }
    })
  }

  const saveMeeting = async () => {
    if (!userId || !meeting || !draft) return
    const title = draft.title.trim()
    if (!title) {
      toastFsError('נא להזין כותרת לפגישה', new Error('validation'), 'meeting')
      return
    }
    if (!draft.organizerUserId.trim()) {
      toastFsError('נא לבחור מאורגן', new Error('validation'), 'meeting')
      return
    }

    if (isNewUnsaved) {
      setSaving(true)
      try {
        const id = await addMeeting(
          {
            title,
            purpose: draft.purpose,
            agenda: draft.agenda,
            startDate: draft.startDate,
            startTime: normalizeDueTimeHm(draft.startTime),
            endTime: normalizeDueTimeHm(draft.endTime),
            location: draft.location.trim() || undefined,
            clientId: draft.clientId.trim() || undefined,
            projectId: draft.projectId.trim() || undefined,
            supplierId: draft.supplierId.trim() || undefined,
            leadId: draft.leadId.trim() || undefined,
            organizerUserId: draft.organizerUserId,
            participantUserIds: draft.participantUserIds,
            excludeCreatorFromAttendees: draft.excludeCreatorFromAttendees,
          },
          { quiet: true },
        )
        if (id) {
          toastFsSuccess('הפגישה נשמרה והזמנות נשלחו למשתתפים (אם הוגדר מייל)')
          setDrawerMeetingId(id)
        }
      } finally {
        setSaving(false)
      }
      return
    }

    const patch = buildPatch(meeting, draft)
    if (Object.keys(patch).length === 0) {
      toastFsSuccess('אין שינויים לשמירה')
      return
    }
    setSaving(true)
    try {
      await updateMeeting(meeting.id, patch)
      const excludeB =
        (patch.excludeCreatorFromAttendees ??
          meeting.excludeCreatorFromAttendees) === true
      const merged: Meeting = {
        ...meeting,
        ...patch,
        excludeCreatorFromAttendees: excludeB,
        attendeeUserIds: buildAttendeeUserIds({
          createdBy: meeting.createdBy,
          organizerUserId: patch.organizerUserId ?? meeting.organizerUserId,
          participantUserIds:
            patch.participantUserIds ?? meeting.participantUserIds,
          excludeCreatorFromAttendees: excludeB,
        }),
      }
      setDraft(initDraft(merged))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (meetingId) document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [meetingId])

  if (!meetingId || !meeting || !draft) return null

  const canSaveNew = isNewUnsaved && Boolean(draft.title.trim())

  return (
    <>
      <button
        type="button"
        aria-label="סגור"
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]"
        onClick={requestClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[500px] flex-col border-r-2 border-[#0EA5E9] bg-[var(--dash-panel-bg)] shadow-[-8px_0_32px_rgba(15,23,42,0.1)]"
        dir="rtl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[rgba(14,165,233,0.35)] px-5 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-orange-soft)] text-lg text-[var(--text-mid)] transition hover:bg-[var(--surface-muted)]"
            aria-label="סגירה"
          >
            ×
          </button>
          <div className="min-w-0 flex-1">
            <input
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, title: e.target.value } : d))
              }
              placeholder={
                isNewUnsaved ? 'כותרת הפגישה — תישמר בלחיצה על שמור' : undefined
              }
              className="w-full border-0 bg-transparent text-lg font-extrabold text-[var(--text-dark)] outline-none ring-0"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {isNewUnsaved ? (
                <span className="rounded-full bg-[#E0F2FE] px-2 py-0.5 text-[10px] font-bold text-[#0369A1]">
                  פגישה חדשה
                </span>
              ) : null}
              {dirty ? (
                <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#B45309]">
                  שינויים שלא נשמרו
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-right">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              מטרת הפגישה
            </label>
            <textarea
              value={draft.purpose}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, purpose: e.target.value } : d))
              }
              rows={2}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-dark)] outline-none"
              placeholder="למשל: סגירת היקף, סנכרון עם לקוח…"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              תוכן / סדר יום
            </label>
            <textarea
              value={draft.agenda}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, agenda: e.target.value } : d))
              }
              rows={4}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-dark)] outline-none"
              placeholder="נקודות לדיון, החלטות נדרשות…"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                תאריך
              </label>
              <input
                type="date"
                value={toDateInputYmd(draft.startDate)}
                onChange={(e) =>
                  setDraft((d) =>
                    d && e.target.value
                      ? { ...d, startDate: e.target.value.slice(0, 10) }
                      : d,
                  )
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                משעה
              </label>
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, startTime: e.target.value } : d))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
                עד שעה
              </label>
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, endTime: e.target.value } : d))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-2 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              מיקום / קישור
            </label>
            <input
              value={draft.location}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, location: e.target.value } : d))
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm"
              placeholder="משרד, Zoom, Meet…"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              מאורגן
            </label>
            <select
              value={draft.organizerUserId}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, organizerUserId: e.target.value } : d,
                )
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            >
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold text-[var(--text-mid)]">
              משתתפים (יקבלו מייל הזמנה)
            </p>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-2">
              {teamMembers
                .filter((m) => m.id !== draft.organizerUserId)
                .map((m) => {
                  const on = draft.participantUserIds.includes(m.id)
                  return (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/[0.04]"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleParticipant(m.id)}
                        className="rounded border-[var(--border)]"
                      />
                      <span>{m.name}</span>
                    </label>
                  )
                })}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug">
              <input
                type="checkbox"
                checked={draft.excludeCreatorFromAttendees}
                onChange={(e) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          excludeCreatorFromAttendees: e.target.checked,
                        }
                      : d,
                  )
                }
                className="mt-0.5 rounded border-[var(--border)]"
              />
              <span>
                <span className="font-bold text-[var(--text-dark)]">
                  בלי אותי ביומן ובהזמנה
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--text-mid)]">
                  מתאים כשקובעים לעובד פגישה מול גורם חיצוני — התיאור והמטרה
                  נשמרים, אבל אתה לא מופיע כמשתתף ולא תקבל מייל. ודא שיש מאורגן
                  או משתתף אחר מלבדך.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              לקוח
            </label>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
              <ClientQuickSelect
                clients={clients}
                value={draft.clientId}
                onChange={(cid) =>
                  setDraft((d) => {
                    if (!d) return d
                    let pid = d.projectId
                    if (d.projectId) {
                      const pr = projects.find((p) => p.id === d.projectId)
                      if (!pr || (cid && pr.clientId !== cid)) pid = ''
                    }
                    return { ...d, clientId: cid, projectId: pid }
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              פרויקט
            </label>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
              <ProjectQuickSelect
                id="meeting-drawer-project"
                projects={projectsForClient}
                clientNameById={clientNameByIdMap}
                value={
                  draft.projectId &&
                  projectsForClient.some((p) => p.id === draft.projectId)
                    ? draft.projectId
                    : ''
                }
                onChange={(pid) =>
                  setDraft((d) => (d ? { ...d, projectId: pid } : d))
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              ספק
            </label>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
              <SupplierQuickSelect
                id="meeting-drawer-supplier"
                suppliers={suppliers}
                value={draft.supplierId}
                onChange={(sid) =>
                  setDraft((d) => (d ? { ...d, supplierId: sid } : d))
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-mid)]">
              ליד (אופציונלי)
            </label>
            <select
              value={draft.leadId}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, leadId: e.target.value } : d))
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.company ? ` · ${l.company}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-4">
          <div>
            {!isNewUnsaved ? (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('למחוק את הפגישה?')) return
                  void deleteMeeting(meeting.id).then(() =>
                    setDrawerMeetingId(null),
                  )
                }}
                className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
              >
                מחק
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-[10px] border border-[var(--border-orange-soft)] bg-[var(--dash-panel-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-mid)]"
            >
              סגור
            </button>
            <button
              type="button"
              disabled={saving || (!canSaveNew && isNewUnsaved)}
              onClick={() => void saveMeeting()}
              className="rounded-[10px] bg-[#0EA5E9] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
            >
              {saving ? 'שומר…' : isNewUnsaved ? 'שמור פגישה' : 'עדכן פגישה'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  )
}
