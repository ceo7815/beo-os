import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { docToMeeting } from '../lib/firestoreMappers'
import { buildAttendeeUserIds } from '../lib/meetingAttendees'
import { db } from '../lib/firebase'
import { requestMeetingInviteEmails } from '../lib/meetingInviteEmail'
import { NEW_MEETING_DRAWER_ID, type NewMeetingDraftSeed } from '../lib/meetingDrawerIds'
import { normalizeDueTimeHm } from '../lib/dates'
import { stripUndefined } from '../lib/stripUndefined'
import { toastFsError, toastFsSuccess } from '../lib/fsToast'
import { useHubStore } from '../store/useStore'
import type { Meeting } from '../types'
import { useUsers } from './useUsers'

type MeetingsContextValue = {
  meetings: Meeting[]
  loading: boolean
  error: Error | null
  drawerMeetingId: string | null
  newMeetingDraftSeed: NewMeetingDraftSeed | null
  setDrawerMeetingId: (id: string | null) => void
  openNewMeetingDraft: (seed?: NewMeetingDraftSeed) => void
  quickCalendarSliderOpen: boolean
  setQuickCalendarSliderOpen: (open: boolean) => void
  addMeeting: (
    data: Omit<Meeting, 'id' | 'createdAt' | 'createdBy' | 'attendeeUserIds'>,
    options?: { quiet?: boolean; sendInvites?: boolean },
  ) => Promise<string | null>
  updateMeeting: (
    id: string,
    patch: Partial<Meeting>,
    opts?: { successMessage?: string },
  ) => Promise<boolean>
  deleteMeeting: (id: string) => Promise<void>
}

const MeetingsContext = createContext<MeetingsContextValue | null>(null)

function meetingToFirestoreWrite(
  data: Omit<Meeting, 'id' | 'createdAt'>,
): Record<string, unknown> {
  const o: Record<string, unknown> = {
    title: data.title,
    purpose: data.purpose ?? '',
    agenda: data.agenda ?? '',
    startDate: data.startDate,
    organizerUserId: data.organizerUserId,
    participantUserIds: data.participantUserIds ?? [],
    attendeeUserIds: data.attendeeUserIds,
    createdBy: data.createdBy,
  }
  const st = normalizeDueTimeHm(data.startTime)
  const et = normalizeDueTimeHm(data.endTime)
  if (st) o.startTime = st
  if (et) o.endTime = et
  if (data.clientId?.trim()) o.clientId = data.clientId.trim()
  if (data.projectId?.trim()) o.projectId = data.projectId.trim()
  if (data.supplierId?.trim()) o.supplierId = data.supplierId.trim()
  if (data.leadId?.trim()) o.leadId = data.leadId.trim()
  if (data.location?.trim()) o.location = data.location.trim()
  o.excludeCreatorFromAttendees = data.excludeCreatorFromAttendees === true
  if (data.completed === true) {
    o.completed = true
    o.completionSummary = String(data.completionSummary ?? '')
    if (data.completedAt?.trim()) o.completedAt = data.completedAt.trim()
    if (data.completedByUserId?.trim())
      o.completedByUserId = data.completedByUserId.trim()
    if (data.completedByName?.trim())
      o.completedByName = data.completedByName.trim()
  }
  return stripUndefined(o)
}

export function MeetingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { users: teamMembers } = useUsers()
  const currentUser = useHubStore((s) => s.currentUser)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [drawerMeetingId, setDrawerMeetingIdInner] = useState<string | null>(
    null,
  )
  const [newMeetingDraftSeed, setNewMeetingDraftSeed] =
    useState<NewMeetingDraftSeed | null>(null)
  const [quickCalendarSliderOpen, setQuickCalendarSliderOpen] =
    useState(false)

  const setDrawerMeetingId = useCallback((id: string | null) => {
    setDrawerMeetingIdInner(id)
    if (id === null || id !== NEW_MEETING_DRAWER_ID) {
      setNewMeetingDraftSeed(null)
    }
  }, [])

  const openNewMeetingDraft = useCallback((seed?: NewMeetingDraftSeed) => {
    setNewMeetingDraftSeed(seed ?? null)
    setDrawerMeetingIdInner(NEW_MEETING_DRAWER_ID)
  }, [])

  useEffect(() => {
    setLoading(true)
    let cancelled = false
    const uid = user?.uid ?? ''
    /** כמו ביומן — עדיפות ל־role מתוך אוסף users (נטען לעיתים אחרי currentUser בזיכרון) */
    const fromTeam = teamMembers.find((m) => m.id === uid)?.role
    const fromStore =
      currentUser?.uid === uid && typeof currentUser.role === 'string'
        ? currentUser.role
        : ''
    const roleRaw =
      typeof fromTeam === 'string' && fromTeam.trim()
        ? fromTeam.trim()
        : fromStore.trim() || (currentUser?.uid === uid ? 'employee' : '')
    const role = roleRaw.toLowerCase()

    const profileReady =
      Boolean(uid) &&
      currentUser?.uid === uid &&
      (role === 'admin' ||
        role === 'superadmin' ||
        role === 'employee' ||
        role === 'office')

    const meetingsQuery =
      !profileReady || !uid
        ? null
        : role === 'admin' || role === 'superadmin'
          ? query(collection(db, 'meetings'))
          : query(
              collection(db, 'meetings'),
              where('attendeeUserIds', 'array-contains', uid),
            )

    const load = async () => {
      if (!uid) {
        if (cancelled) return
        setMeetings([])
        setLoading(false)
        setError(null)
        return
      }
      if (!meetingsQuery) {
        if (cancelled) return
        setMeetings([])
        setLoading(false)
        setError(null)
        return
      }
      try {
        const snap = await getDocsFromServer(meetingsQuery)
        if (cancelled) return
        const list = snap.docs.map((d) => docToMeeting(d))
        list.sort((a, b) => {
          const da = a.startDate.localeCompare(b.startDate)
          if (da !== 0) return da
          return (a.startTime ?? '').localeCompare(b.startTime ?? '')
        })
        setMeetings(list)
        setLoading(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        console.error('meetings load', err)
        toastFsError('שגיאה בטעינת פגישות', err, 'meetings')
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [user, currentUser, teamMembers])

  const addMeeting = useCallback(
    async (
      data: Omit<Meeting, 'id' | 'createdAt' | 'createdBy' | 'attendeeUserIds'>,
      options?: { quiet?: boolean; sendInvites?: boolean },
    ) => {
      if (!user) {
        toastFsError('יש להתחבר', new Error('no user'), 'addMeeting')
        return null
      }
      const uid = user.uid
      const attendeeUserIds = buildAttendeeUserIds({
        createdBy: uid,
        organizerUserId: data.organizerUserId,
        participantUserIds: data.participantUserIds ?? [],
        excludeCreatorFromAttendees: data.excludeCreatorFromAttendees,
      })
      if (attendeeUserIds.length === 0) {
        toastFsError(
          'חייב להישאר לפחות משתתף אחד ביומן (מאורגן או משתתף שאינך)',
          new Error('validation'),
          'addMeeting',
        )
        return null
      }
      try {
        const full: Omit<Meeting, 'id' | 'createdAt'> = {
          ...data,
          createdBy: uid,
          attendeeUserIds,
          excludeCreatorFromAttendees: data.excludeCreatorFromAttendees === true,
        }
        const payload = {
          ...meetingToFirestoreWrite(full),
          createdAt: serverTimestamp(),
        }
        const ref = await addDoc(collection(db, 'meetings'), payload)
        const optimistic: Meeting = {
          id: ref.id,
          title: full.title,
          purpose: full.purpose,
          agenda: full.agenda,
          startDate: full.startDate,
          startTime: full.startTime,
          endTime: full.endTime,
          location: full.location,
          clientId: full.clientId,
          projectId: full.projectId,
          supplierId: full.supplierId,
          leadId: full.leadId,
          organizerUserId: full.organizerUserId,
          participantUserIds: full.participantUserIds,
          attendeeUserIds: full.attendeeUserIds,
          excludeCreatorFromAttendees: full.excludeCreatorFromAttendees === true,
          createdBy: uid,
          createdAt: new Date().toISOString(),
        }
        setMeetings((prev) =>
          [...prev.filter((m) => m.id !== ref.id), optimistic].sort((a, b) => {
            const da = a.startDate.localeCompare(b.startDate)
            if (da !== 0) return da
            return (a.startTime ?? '').localeCompare(b.startTime ?? '')
          }),
        )
        if (!options?.quiet) toastFsSuccess('הפגישה נשמרה ביומן')
        const sendInvites = options?.sendInvites !== false
        if (sendInvites && attendeeUserIds.length > 0) {
          requestMeetingInviteEmails(ref.id)
        }
        return ref.id
      } catch (e) {
        toastFsError('שגיאה בשמירת פגישה', e, 'addMeeting')
        return null
      }
    },
    [user],
  )

  const updateMeeting = useCallback(
    async (
      id: string,
      patch: Partial<Meeting>,
      opts?: { successMessage?: string },
    ) => {
      if (!user) return false
      const prev = meetings.find((m) => m.id === id)
      if (!prev) {
        toastFsError('הפגישה לא נמצאה', new Error('missing'), 'updateMeeting')
        return false
      }
      const merged: Meeting = {
        ...prev,
        ...patch,
        id: prev.id,
        excludeCreatorFromAttendees:
          (patch.excludeCreatorFromAttendees ??
            prev.excludeCreatorFromAttendees) === true,
        attendeeUserIds: buildAttendeeUserIds({
          createdBy: prev.createdBy,
          organizerUserId: patch.organizerUserId ?? prev.organizerUserId,
          participantUserIds:
            patch.participantUserIds ?? prev.participantUserIds,
          excludeCreatorFromAttendees:
            (patch.excludeCreatorFromAttendees ??
              prev.excludeCreatorFromAttendees) === true,
        }),
      }
      if (merged.attendeeUserIds.length === 0) {
        toastFsError(
          'חייב להישאר לפחות משתתף אחד ביומן (מאורגן או משתתף שאינך)',
          new Error('validation'),
          'updateMeeting',
        )
        return false
      }
      try {
        const { id: _i, createdAt: _c, ...rest } = merged
        await updateDoc(
          doc(db, 'meetings', id),
          stripUndefined({
            ...meetingToFirestoreWrite(rest),
          }) as Record<string, unknown>,
        )
        setMeetings((m) =>
          m
            .map((x) => (x.id === id ? merged : x))
            .sort((a, b) => {
              const da = a.startDate.localeCompare(b.startDate)
              if (da !== 0) return da
              return (a.startTime ?? '').localeCompare(b.startTime ?? '')
            }),
        )
        toastFsSuccess(opts?.successMessage ?? 'הפגישה עודכנה')
        return true
      } catch (e) {
        toastFsError('שגיאה בעדכון פגישה', e, 'updateMeeting')
        return false
      }
    },
    [user, meetings],
  )

  const deleteMeeting = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'meetings', id))
      setMeetings((m) => m.filter((x) => x.id !== id))
      setDrawerMeetingIdInner((prev) => (prev === id ? null : prev))
      toastFsSuccess('הפגישה נמחקה')
    } catch (e) {
      toastFsError('שגיאה במחיקת פגישה', e, 'deleteMeeting')
    }
  }, [])

  const value = useMemo(
    () => ({
      meetings,
      loading,
      error,
      drawerMeetingId,
      newMeetingDraftSeed,
      setDrawerMeetingId,
      openNewMeetingDraft,
      quickCalendarSliderOpen,
      setQuickCalendarSliderOpen,
      addMeeting,
      updateMeeting,
      deleteMeeting,
    }),
    [
      meetings,
      loading,
      error,
      drawerMeetingId,
      newMeetingDraftSeed,
      setDrawerMeetingId,
      openNewMeetingDraft,
      quickCalendarSliderOpen,
      addMeeting,
      updateMeeting,
      deleteMeeting,
    ],
  )

  return (
    <MeetingsContext.Provider value={value}>
      {children}
    </MeetingsContext.Provider>
  )
}

export function useMeetings(): MeetingsContextValue {
  const ctx = useContext(MeetingsContext)
  if (!ctx) {
    throw new Error('useMeetings must be used within MeetingsProvider')
  }
  return ctx
}
